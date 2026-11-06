// Socket.IO connection manager (singleton per browser session).
//
// - Connects through the sandbox gateway: io('/?XTransformPort=3003'), path '/'.
// - Reconnects with exponential backoff (socket.io built-in, capped).
// - Accounts application-level payload bytes both directions so the UI can
//   display honest network usage. These numbers cover SyncCinema control +
//   chat payloads only; TCP/TLS overhead is NOT included and video bytes are
//   never transferred at all.

import { io, Socket } from "socket.io-client";
import type {
  ChatMessageRecord,
  JoinAck,
  PauseAtPayload,
  PeerStateUpdate,
  PlayAtPayload,
  RoomJoinPayload,
  RoomSnapshot,
  RoomErrorPayload,
  SeekToPayload,
  SyncPongPayload,
  SyncStatusPayload,
} from "@/types/synccinema";

export interface SocketListeners {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onReconnectAttempt?: (attempt: number) => void;
  onRoomState?: (snapshot: RoomSnapshot) => void;
  onPlayAt?: (payload: PlayAtPayload) => void;
  onPauseAt?: (payload: PauseAtPayload) => void;
  onSeekTo?: (payload: SeekToPayload) => void;
  onSyncPong?: (payload: SyncPongPayload) => void;
  onSyncStatus?: (payload: SyncStatusPayload) => void;
  onPeerState?: (payload: PeerStateUpdate) => void;
  onChatMessage?: (message: ChatMessageRecord) => void;
  onChatHistory?: (messages: ChatMessageRecord[]) => void;
  onUserReady?: (payload: { userId: string; isReady: boolean }) => void;
  onUserConnected?: (payload: { userId: string; displayName: string; reconnected: boolean }) => void;
  onUserDisconnected?: (payload: { userId: string; displayName: string }) => void;
  onUserLeft?: (payload: { userId: string; displayName: string }) => void;
  onRoomExpired?: (payload: { reason: string }) => void;
  onRoomError?: (payload: RoomErrorPayload) => void;
}

let socket: Socket | null = null;
let listeners: SocketListeners = {};

// ── Application-level byte accounting ───────────────────────────────────────

let bytesSent = 0;
let bytesReceived = 0;
const byteListeners = new Set<(s: number, r: number) => void>();

function sizeOf(data: unknown): number {
  if (data == null) return 0;
  if (typeof data === "string") return data.length;
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
}

function attachByteAccounting(s: Socket) {
  const engine = s.io.engine;
  if (!engine) return;
  engine.on("packetCreate", (packet: { data?: unknown }) => {
    // EIO packet envelope ("42[...]") minus the small frame prefix.
    bytesSent += sizeOf(packet?.data ?? null) + 2;
    byteListeners.forEach((fn) => fn(bytesSent, bytesReceived));
  });
  engine.on("packet", (packet: { type?: string; data?: unknown }) => {
    if (packet?.type === "message") {
      bytesReceived += sizeOf(packet.data ?? null) + 2;
      byteListeners.forEach((fn) => fn(bytesSent, bytesReceived));
    }
  });
}

export function onBytes(fn: (sent: number, received: number) => void): () => void {
  byteListeners.add(fn);
  return () => byteListeners.delete(fn);
}

export function getBytes() {
  return { sent: bytesSent, received: bytesReceived };
}

// ── Connection lifecycle ────────────────────────────────────────────────────

export function connect(next: SocketListeners): Socket {
  listeners = next;
  if (socket) return socket;

  socket = io("/?XTransformPort=3003", {
    path: "/",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    timeout: 12_000,
  });

  const s = socket;
  attachByteAccounting(s);

  s.on("connect", () => listeners.onConnect?.());
  s.on("disconnect", (reason: string) => listeners.onDisconnect?.(reason));
  s.io.on("reconnect_attempt", (attempt: number) => listeners.onReconnectAttempt?.(attempt));

  s.on("ROOM_STATE", (p: RoomSnapshot) => listeners.onRoomState?.(p));
  s.on("PLAY_AT", (p: PlayAtPayload) => listeners.onPlayAt?.(p));
  s.on("PAUSE_AT", (p: PauseAtPayload) => listeners.onPauseAt?.(p));
  s.on("SEEK_TO", (p: SeekToPayload) => listeners.onSeekTo?.(p));
  s.on("SYNC_PONG", (p: SyncPongPayload) => listeners.onSyncPong?.(p));
  s.on("SYNC_STATUS", (p: SyncStatusPayload) => listeners.onSyncStatus?.(p));
  s.on("STATE_UPDATE", (p: PeerStateUpdate) => listeners.onPeerState?.(p));
  s.on("CHAT_MESSAGE", (m: ChatMessageRecord) => listeners.onChatMessage?.(m));
  s.on("CHAT_HISTORY", (m: ChatMessageRecord[]) => listeners.onChatHistory?.(m));
  s.on("USER_READY", (p: { userId: string; isReady: boolean }) => listeners.onUserReady?.(p));
  s.on("USER_CONNECTED", (p: { userId: string; displayName: string; reconnected: boolean }) =>
    listeners.onUserConnected?.(p)
  );
  s.on("USER_DISCONNECTED", (p: { userId: string; displayName: string }) => listeners.onUserDisconnected?.(p));
  s.on("USER_LEFT", (p: { userId: string; displayName: string }) => listeners.onUserLeft?.(p));
  s.on("ROOM_EXPIRED", (p: { reason: string }) => listeners.onRoomExpired?.(p));
  s.on("ROOM_ERROR", (p: RoomErrorPayload) => listeners.onRoomError?.(p));

  return s;
}

export function getSocket(): Socket | null {
  return socket;
}

export function isConnected(): boolean {
  return !!socket?.connected;
}

// ── Outgoing events (typed) ─────────────────────────────────────────────────

export function joinRoom(payload: RoomJoinPayload): Promise<JoinAck> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: { code: "SERVER_ERROR", message: "Not connected." } });
    socket.timeout(15_000).emit("JOIN_ROOM", payload, (timeoutErr: Error | null, ack?: JoinAck) => {
      if (timeoutErr || !ack) {
        resolve({ ok: false, error: { code: "SERVER_ERROR", message: "Join timed out. Check your connection." } });
        return;
      }
      resolve(ack);
    });
  });
}

export function emitSafe<K extends "LEAVE_ROOM" | "PLAY_REQUEST" | "PAUSE_REQUEST" | "SEEK_REQUEST" | "USER_READY" | "SYNC_PING" | "STATE_REPORT" | "CHAT_MESSAGE">(
  event: K,
  payload: unknown
) {
  socket?.emit(event as never, payload as never);
}
