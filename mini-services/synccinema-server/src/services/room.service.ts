// Room service: authoritative in-memory room registry with Prisma persistence
// for metadata recovery. Mirrors the Supabase table design (rooms, room_participants).

import { prisma } from "../config/supabase";
import { env } from "../config/env";
import { generateRoomCode, normalizeRoomCode } from "../utils/room-code";
import type { MovieDescriptor, ParticipantInfo, RoomSnapshot } from "../types/socket.types";
import type { ServerRoom, ServerParticipant } from "../types/room.types";
import { MAX_PARTICIPANTS, ROOM_TTL_MS } from "../types/room.types";

const rooms = new Map<string, ServerRoom>(); // roomCode -> room
const userIndex = new Map<string, string>(); // userId -> roomCode

export function allRooms(): IterableIterator<ServerRoom> {
  return rooms.values();
}

export function touchExpiry(room: ServerRoom) {
  room.expiresAt = Date.now() + ROOM_TTL_MS;
}

export function getRoomByCode(code: string): ServerRoom | undefined {
  return rooms.get(normalizeRoomCode(code));
}

export function getRoomForUser(userId: string): ServerRoom | undefined {
  const code = userIndex.get(userId);
  return code ? rooms.get(code) : undefined;
}

export function computeCompatibility(room: ServerRoom): RoomSnapshot["compatibility"] {
  const participants = [...room.participants.values()];
  if (participants.length < MAX_PARTICIPANTS) return "PENDING";
  if (participants.some((p) => !p.movie)) return "MISSING";
  const hashes = new Set(participants.map((p) => p.movie!.hash));
  return hashes.size === 1 ? "MATCH" : "MISMATCH";
}

export function buildSnapshot(room: ServerRoom): RoomSnapshot {
  const participants: ParticipantInfo[] = [...room.participants.values()].map((p) => ({
    userId: p.userId,
    displayName: p.displayName,
    isHost: p.isHost,
    isReady: p.isReady,
    movie: p.movie,
    connected: p.connected,
  }));
  return {
    roomCode: room.roomCode,
    status: room.status,
    hostId: room.hostId,
    participants,
    playback: room.timeline,
    compatibility: computeCompatibility(room),
    serverTimeMs: Date.now(),
  };
}

export async function createRoom(
  hostUserId: string,
  hostName: string,
  movie: MovieDescriptor | null
): Promise<ServerRoom> {
  // Retry on the (astronomically unlikely) code collision.
  let room: ServerRoom | undefined;
  let dbRoom;
  for (let attempt = 0; attempt < 5 && !room; attempt++) {
    const roomCode = generateRoomCode();
    if (rooms.has(roomCode)) continue;
    const now = Date.now();
    dbRoom = await prisma.room.create({
      data: {
        roomCode,
        hostId: hostUserId,
        status: "WAITING",
        expiresAt: new Date(now + ROOM_TTL_MS),
        participants: {
          create: {
            userId: hostUserId,
            displayName: hostName,
            isHost: true,
            movieName: movie?.name,
            movieHash: movie?.hash,
            movieSize: movie?.size,
            movieMime: movie?.mime,
            movieDurMs: movie?.durationMs,
          },
        },
      },
    });
    const host: ServerParticipant = {
      userId: hostUserId,
      displayName: hostName,
      isHost: true,
      isReady: false,
      movie,
      socketId: null,
      connected: false,
      lastSeenAt: now,
    };
    room = {
      id: dbRoom.id,
      roomCode,
      hostId: hostUserId,
      status: "WAITING",
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
      participants: new Map([[hostUserId, host]]),
      timeline: null,
      bytesIn: 0,
      bytesOut: 0,
    };
    rooms.set(roomCode, room);
    userIndex.set(hostUserId, roomCode);
  }
  if (!room) throw new Error("Could not allocate a unique room code");
  return room;
}

export type JoinResult =
  | { ok: true; room: ServerRoom; reconnected: boolean }
  | { ok: false; error: "INVALID_ROOM" | "ROOM_FULL" | "ROOM_EXPIRED" | "DB_ERROR" };

export async function joinRoom(
  roomCode: string,
  userId: string,
  displayName: string,
  movie: MovieDescriptor | null
): Promise<JoinResult> {
  const room = getRoomByCode(roomCode);
  if (!room) return { ok: false, error: "INVALID_ROOM" };
  if (room.status === "EXPIRED" || Date.now() > room.expiresAt) {
    room.status = "EXPIRED";
    return { ok: false, error: "ROOM_EXPIRED" };
  }

  const existing = room.participants.get(userId);
  if (existing) {
    // Session restoration (reconnection): refresh identity + movie descriptor.
    existing.displayName = displayName;
    if (movie) existing.movie = movie;
    existing.connected = true;
    existing.lastSeenAt = Date.now();
    touchExpiry(room);
    await persistParticipant(room.id, existing).catch(() => undefined);
    return { ok: true, room, reconnected: true };
  }

  if (room.participants.size >= MAX_PARTICIPANTS) {
    return { ok: false, error: "ROOM_FULL" };
  }

  const participant: ServerParticipant = {
    userId,
    displayName,
    isHost: false,
    isReady: false,
    movie,
    socketId: null,
    connected: true,
    lastSeenAt: Date.now(),
  };
  room.participants.set(userId, participant);
  userIndex.set(userId, room.roomCode);
  touchExpiry(room);
  await persistParticipant(room.id, participant).catch(() => undefined);
  return { ok: true, room, reconnected: false };
}

export function leaveRoom(userId: string): { room: ServerRoom; participant: ServerParticipant } | null {
  const room = getRoomForUser(userId);
  if (!room) return null;
  const participant = room.participants.get(userId);
  if (!participant) return null;
  room.participants.delete(userId);
  userIndex.delete(userId);
  if (room.participants.size === 0) {
    room.status = "ENDED";
    void prisma.room.update({ where: { id: room.id }, data: { status: "ENDED" } }).catch(() => undefined);
    rooms.delete(room.roomCode);
  }
  return { room, participant };
}

export function disconnectUser(userId: string): ServerRoom | null {
  const room = getRoomForUser(userId);
  if (!room) return null;
  const participant = room.participants.get(userId);
  if (participant) {
    participant.connected = false;
    participant.lastSeenAt = Date.now();
  }
  return room;
}

async function persistParticipant(roomId: string, p: ServerParticipant) {
  await prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId, userId: p.userId } },
    create: {
      roomId,
      userId: p.userId,
      displayName: p.displayName,
      isHost: p.isHost,
      movieName: p.movie?.name,
      movieHash: p.movie?.hash,
      movieSize: p.movie?.size,
      movieMime: p.movie?.mime,
      movieDurMs: p.movie?.durationMs,
    },
    update: {
      displayName: p.displayName,
      isReady: p.isReady,
      movieName: p.movie?.name,
      movieHash: p.movie?.hash,
      movieSize: p.movie?.size,
      movieMime: p.movie?.mime,
      movieDurMs: p.movie?.durationMs,
      lastSeenAt: new Date(),
    },
  });
}

/** Sweep inactive rooms. Called periodically from socket.server. */
export function sweepExpiredRooms(): string[] {
  const now = Date.now();
  const expired: string[] = [];
  for (const [code, room] of rooms) {
    if (now > room.expiresAt || room.participants.size === 0) {
      room.status = "EXPIRED";
      expired.push(code);
      for (const userId of room.participants.keys()) userIndex.delete(userId);
      rooms.delete(code);
      void prisma.room.update({ where: { id: room.id }, data: { status: "EXPIRED" } }).catch(() => undefined);
    }
  }
  return expired;
}

export function setReady(userId: string, isReady: boolean): ServerRoom | null {
  const room = getRoomForUser(userId);
  if (!room) return null;
  const p = room.participants.get(userId);
  if (p) p.isReady = isReady;
  touchExpiry(room);
  return room;
}

export function maxParticipants(): number {
  return env.rooms.maxParticipants || MAX_PARTICIPANTS;
}
