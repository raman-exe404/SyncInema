// Socket event handlers. Every event is validated server-side (spec §17).

import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "../types/socket.types";
import { MAX_PARTICIPANTS, START_BUFFER_MS, SEEK_BUFFER_MS, ServerRoom } from "../types/room.types";
import {
  buildSnapshot,
  computeCompatibility,
  disconnectUser,
  getRoomByCode,
  joinRoom,
  leaveRoom,
  setReady,
  sweepExpiredRooms,
  touchExpiry,
  allRooms,
} from "../services/room.service";
import {
  computeSyncState,
  expectedPositionMs,
  pauseTimeline,
  playTimeline,
  recordRtt,
  recordStateReport,
  setTimeline,
} from "../services/sync.service";
import { getRecentMessages, handleChatMessage, systemMessage } from "../services/chat.service";
import { env } from "../config/env";
import {
  chatMessageSchema,
  playbackPositionSchema,
  roomJoinSchema,
  toRoomError,
  userReadySchema,
} from "../utils/validation";

type S = Socket<ClientToServerEvents, ServerToClientEvents>;
type IO = Server<ClientToServerEvents, ServerToClientEvents>;

function payloadBytes(data: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(data ?? null), "utf8");
  } catch {
    return 0;
  }
}

function countIn(room: ServerRoom, data: unknown) {
  room.bytesIn += payloadBytes(data);
}

function broadcastToRoom(io: IO, room: ServerRoom, event: keyof ServerToClientEvents, payload: unknown) {
  const bytes = payloadBytes(payload);
  room.bytesOut += bytes * room.participants.size;
  for (const p of room.participants.values()) {
    if (p.connected && p.socketId) {
      io.to(p.socketId).emit(event, payload as never);
    }
  }
}

export function registerSocketHandlers(io: IO) {
  io.on("connection", (socket: S) => {
    let joinedRoomCode: string | null = null;
    let joinedUserId: string | null = null;

    // ── Room lifecycle ──────────────────────────────────────────────────────

    socket.on("JOIN_ROOM", async (payload, ack) => {
      const parsed = roomJoinSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: toRoomError(parsed.error.issues[0]?.message ?? "Invalid join payload") });
        return;
      }
      const { roomCode, userId, displayName, movie } = parsed.data;

      // If this user is already in another room on this socket, leave it first.
      if (joinedUserId && joinedUserId !== userId) {
        leaveRoom(joinedUserId);
      }

      const result = await joinRoom(roomCode, userId, displayName, movie);
      if (!result.ok) {
        ack?.({ ok: false, error: toRoomError(errorText(result.error), result.error) });
        return;
      }
      const { room, reconnected } = result;

      joinedRoomCode = room.roomCode;
      joinedUserId = userId;
      socket.join(room.roomCode);

      const participant = room.participants.get(userId)!;
      const wasConnected = participant.connected;
      const firstJoinThisSession = !wasConnected || reconnected === false;

      // If the same userId is open on another socket, take over the session.
      for (const [uid, p] of room.participants) {
        if (uid !== userId && p.socketId) continue;
        if (uid === userId && p.socketId && p.socketId !== socket.id) {
          io.to(p.socketId).emit("ROOM_ERROR", {
            code: "SERVER_ERROR",
            message: "Your session moved to a newer connection.",
          });
          io.sockets.sockets.get(p.socketId)?.disconnect(true);
        }
      }
      participant.socketId = socket.id;
      participant.connected = true;
      participant.lastSeenAt = Date.now();
      touchExpiry(room);

      const snapshot = buildSnapshot(room);
      ack?.({ ok: true, snapshot });

      const history = await getRecentMessages(room.id).catch(() => []);
      socket.emit("CHAT_HISTORY", history);
      socket.emit("ROOM_STATE", snapshot);

      if (room.participants.size === MAX_PARTICIPANTS) {
        const other = [...room.participants.values()].find((p) => p.userId !== userId);
        broadcastToRoom(io, room, "USER_CONNECTED", {
          userId,
          displayName,
          reconnected: reconnected && firstJoinThisSession ? true : reconnected,
        });
        void systemMessage(room, other ? `${displayName} joined the room` : `${displayName} is here`).then((m) =>
          broadcastToRoom(io, room, "CHAT_MESSAGE", m)
        );
      }
      broadcastToRoom(io, room, "ROOM_STATE", snapshot);
    });

    socket.on("LEAVE_ROOM", async () => {
      await handleLeave(true);
    });

    socket.on("disconnect", async () => {
      await handleLeave(false);
    });

    async function handleLeave(explicit: boolean) {
      if (!joinedRoomCode || !joinedUserId) return;
      const room = getRoomByCode(joinedRoomCode);
      if (!room) return;
      const participant = room.participants.get(joinedUserId);
      if (!participant) return;

      if (explicit) {
        const left = leaveRoom(joinedUserId);
        if (left) {
          broadcastToRoom(io, left.room, "USER_LEFT", {
            userId: joinedUserId,
            displayName: left.participant.displayName,
          });
          void systemMessage(left.room, `${left.participant.displayName} left the room`).then((m) =>
            broadcastToRoom(io, left.room, "CHAT_MESSAGE", m)
          );
          broadcastToRoom(io, left.room, "ROOM_STATE", buildSnapshot(left.room));
        }
      } else {
        const roomLost = disconnectUser(joinedUserId);
        participant.socketId = null;
        if (roomLost) {
          broadcastToRoom(io, roomLost, "USER_DISCONNECTED", {
            userId: joinedUserId,
            displayName: participant.displayName,
          });
          broadcastToRoom(io, roomLost, "ROOM_STATE", buildSnapshot(roomLost));
        }
      }
      joinedRoomCode = null;
      joinedUserId = null;
    }

    // ── Playback control (server-authoritative, spec §8) ───────────────────

    socket.on("PLAY_REQUEST", (payload) => {
      const room = requireRoom(socket, joinedRoomCode, joinedUserId);
      if (!room) return;
      const parsed = playbackPositionSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("ROOM_ERROR", toRoomError("Invalid playback position"));
        return;
      }
      if (process.env.DEBUG_SYNC === "1") {
        console.log(`[sync-debug] PLAY_REQUEST room=${room.roomCode} user=${joinedUserId} pos=${parsed.data.positionMs} timelineBefore=${JSON.stringify(room.timeline)}`);
      }
      if (computeCompatibility(room) !== "MATCH") {
        socket.emit("ROOM_ERROR", {
          code: "PLAYBACK_CONFLICT",
          message: "Both participants must be ready with matching movies before playback.",
        });
        return;
      }
      countIn(room, payload);
      const now = Date.now();
      const startAtServerMs = now + START_BUFFER_MS;
      playTimeline(room, parsed.data.positionMs, startAtServerMs);
      room.status = "ACTIVE";
      if (process.env.DEBUG_SYNC === "1") {
        console.log(`[sync-debug] PLAY_AT scheduled room=${room.roomCode} pos=${parsed.data.positionMs} startAt=${startAtServerMs}`);
      }
      broadcastToRoom(io, room, "PLAY_AT", {
        positionMs: parsed.data.positionMs,
        startAtServerMs,
        playbackRate: 1,
        serverTimeMs: now,
        byUserId: joinedUserId!,
      });
    });

    socket.on("PAUSE_REQUEST", (payload) => {
      const room = requireRoom(socket, joinedRoomCode, joinedUserId);
      if (!room) return;
      const parsed = playbackPositionSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("ROOM_ERROR", toRoomError("Invalid playback position"));
        return;
      }
      countIn(room, payload);
      const now = Date.now();
      // Pause takes effect at the currently expected position (not the stale
      // client-supplied one) to avoid drift when the command is in flight.
      const authoritative = Math.round(expectedPositionMs(room, now));
      pauseTimeline(room, authoritative, now);
      broadcastToRoom(io, room, "PAUSE_AT", {
        positionMs: authoritative,
        serverTimeMs: now,
        byUserId: joinedUserId!,
      });
    });

    socket.on("SEEK_REQUEST", (payload) => {
      const room = requireRoom(socket, joinedRoomCode, joinedUserId);
      if (!room) return;
      const parsed = playbackPositionSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("ROOM_ERROR", toRoomError("Invalid seek position"));
        return;
      }
      countIn(room, payload);
      const now = Date.now();
      const target = parsed.data.positionMs;
      if (room.timeline?.playing) {
        const startAtServerMs = now + SEEK_BUFFER_MS;
        setTimeline(room, {
          positionMs: target,
          playing: true,
          playbackRate: 1,
          anchorServerMs: startAtServerMs,
        });
        broadcastToRoom(io, room, "SEEK_TO", {
          positionMs: target,
          startAtServerMs,
          serverTimeMs: now,
          byUserId: joinedUserId!,
        });
      } else {
        setTimeline(room, {
          positionMs: target,
          playing: false,
          playbackRate: 1,
          anchorServerMs: now,
        });
        broadcastToRoom(io, room, "SEEK_TO", {
          positionMs: target,
          startAtServerMs: null,
          serverTimeMs: now,
          byUserId: joinedUserId!,
        });
      }
    });

    socket.on("USER_READY", (payload) => {
      const room = requireRoom(socket, joinedRoomCode, joinedUserId);
      if (!room) return;
      const parsed = userReadySchema.safeParse(payload);
      if (!parsed.success) return;
      countIn(room, payload);
      setReady(joinedUserId!, parsed.data.isReady);
      broadcastToRoom(io, room, "USER_READY", { userId: joinedUserId!, isReady: parsed.data.isReady });
      broadcastToRoom(io, room, "ROOM_STATE", buildSnapshot(room));
    });

    // ── Clock synchronisation (NTP-style, spec §8) ─────────────────────────

    socket.on("SYNC_PING", (payload) => {
      const t1 = Date.now();
      const t2 = Date.now();
      const rttSample = typeof payload?.t0 === "number" ? t1 - payload.t0 : undefined;
      if (typeof rttSample === "number" && rttSample >= 0 && rttSample < 60_000) {
        recordRtt(socket.id, rttSample);
      }
      socket.emit("SYNC_PONG", { t0: payload?.t0 ?? t1, t1, t2 });
    });

    // ── Periodic position reports → honest sync indicator ──────────────────

    socket.on("STATE_REPORT", (payload) => {
      const room = getRoomByCode(joinedRoomCode ?? "");
      if (!room || !joinedUserId) return;
      const p = room.participants.get(joinedUserId);
      if (!p) return;
      p.lastSeenAt = Date.now();
      countIn(room, payload);
      recordStateReport(room, joinedUserId, payload.driftMs ?? null, payload.positionMs, payload.playbackRate);
      // Relay to the other participant so the UI can show both positions.
      for (const other of room.participants.values()) {
        if (other.userId !== joinedUserId && other.connected && other.socketId) {
          io.to(other.socketId).emit("STATE_UPDATE", { ...payload, userId: joinedUserId, serverTimeMs: Date.now() });
        }
      }
    });

    // ── Chat ────────────────────────────────────────────────────────────────

    socket.on("CHAT_MESSAGE", async (payload) => {
      const room = getRoomByCode(joinedRoomCode ?? "");
      if (!room || !joinedUserId) {
        socket.emit("ROOM_ERROR", toRoomError("Join a room before sending messages", "NOT_A_PARTICIPANT"));
        return;
      }
      const participant = room.participants.get(joinedUserId)!;
      const parsed = chatMessageSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("ROOM_ERROR", toRoomError(parsed.error.issues[0]?.message ?? "Invalid message"));
        return;
      }
      countIn(room, payload);
      const result = await handleChatMessage(room, joinedUserId, participant.displayName, parsed.data);
      if (!result.ok) {
        socket.emit("ROOM_ERROR", {
          code: result.error === "RATE_LIMITED" ? "RATE_LIMITED" : "DB_ERROR",
          message:
            result.error === "RATE_LIMITED"
              ? "You are sending messages too quickly. Slow down a little."
              : "The message could not be saved. Please try again.",
        });
        return;
      }
      broadcastToRoom(io, room, "CHAT_MESSAGE", result.message);
    });

    function requireRoom(socket: S, code: string | null, userId: string | null): ServerRoom | null {
      const room = code ? getRoomByCode(code) : undefined;
      if (!room || !userId || !room.participants.has(userId)) {
        socket.emit("ROOM_ERROR", toRoomError("You are not a participant of this room", "NOT_A_PARTICIPANT"));
        return null;
      }
      touchExpiry(room);
      return room;
    }
  });

  // ── Periodic jobs ─────────────────────────────────────────────────────────

  setInterval(() => {
    for (const code of sweepExpiredRooms()) {
      io.to(code).emit("ROOM_EXPIRED", { reason: "This room expired after inactivity." });
      io.in(code).socketsLeave(code);
    }
  }, 60_000);

  // Authoritative status broadcast: small payload, keeps clients honest.
  setInterval(() => {
    for (const room of allRooms()) {
      const timeline = room.timeline
        ? {
            ...room.timeline,
            positionMs: Math.round(expectedPositionMs(room)),
          }
        : null;
      broadcastToRoom(io, room, "SYNC_STATUS", {
        serverTimeMs: Date.now(),
        timeline,
        syncState: computeSyncState(room),
        bytesIn: room.bytesIn,
        bytesOut: room.bytesOut,
        otherUserConnected:
          room.participants.size >= 2 && [...room.participants.values()].filter((p) => p.connected).length >= 2,
      });
    }
  }, env.sync.statusBroadcastMs);
}

function errorText(error: string): string {
  switch (error) {
    case "INVALID_ROOM":
      return "No room was found with that code. Double-check the six characters.";
    case "ROOM_FULL":
      return "This room already has two participants. Rooms are limited to two people.";
    case "ROOM_EXPIRED":
      return "This room has expired. Ask the host to create a new one.";
    default:
      return "Unable to join the room.";
  }
}

export const __testHelpers = { MAX_PARTICIPANTS };
