// ─────────────────────────────────────────────────────────────────────────────
// SyncCinema wire protocol — shared by socket server and clients.
// Events follow the naming from the product spec (§8 Playback Events).
// Payloads are intentionally tiny JSON; movie data NEVER appears here.
// ─────────────────────────────────────────────────────────────────────────────

export type PlaybackState = "IDLE" | "PLAYING" | "PAUSED";

export interface MovieDescriptor {
  name: string;
  size: number;
  durationMs: number;
  mime: string;
  hash: string; // SHA-256 hex, computed locally in a Web Worker
}

export interface ParticipantInfo {
  userId: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  movie: MovieDescriptor | null;
  connected: boolean;
}

export interface RoomSnapshot {
  roomCode: string;
  status: "WAITING" | "ACTIVE" | "ENDED" | "EXPIRED";
  hostId: string;
  participants: ParticipantInfo[];
  playback: TimelineState | null;
  compatibility: "MATCH" | "MISMATCH" | "PENDING" | "MISSING";
  serverTimeMs: number;
}

export interface TimelineState {
  positionMs: number;
  playing: boolean;
  playbackRate: number;
  anchorServerMs: number; // server clock instant matching positionMs
}

// ── Client → Server ─────────────────────────────────────────────────────────

export interface RoomJoinPayload {
  roomCode: string;
  userId: string;
  displayName: string;
  movie: MovieDescriptor | null;
}

export interface PlayRequestPayload {
  positionMs: number;
}

export interface PauseRequestPayload {
  positionMs: number;
}

export interface SeekRequestPayload {
  positionMs: number;
}

export interface UserReadyPayload {
  isReady: boolean;
}

export interface SyncPingPayload {
  t0: number; // client send time (client clock)
}

export interface StateReportPayload {
  positionMs: number;
  playing: boolean;
  playbackRate: number;
  /** client's own estimated drift vs authoritative timeline, ms */
  driftMs: number | null;
}

export interface ChatMessagePayload {
  text: string;
  messageType: "TEXT" | "REACTION";
  moviePositionMs: number | null;
}

// ── Server → Client ─────────────────────────────────────────────────────────

export interface PlayAtPayload {
  positionMs: number;
  startAtServerMs: number; // scheduled start on the server clock
  playbackRate: number;
  serverTimeMs: number;
  byUserId: string;
}

export interface PauseAtPayload {
  positionMs: number;
  serverTimeMs: number;
  byUserId: string;
}

export interface SeekToPayload {
  positionMs: number;
  startAtServerMs: number | null; // null → apply immediately (paused room)
  serverTimeMs: number;
  byUserId: string;
}

export interface SyncPongPayload {
  t0: number;
  t1: number; // server receive time
  t2: number; // server reply time
}

export interface SyncStatusPayload {
  serverTimeMs: number;
  timeline: TimelineState | null;
  /** aggregate room sync quality, only meaningful while PLAYING */
  syncState: SyncIndicatorState;
  /** bytes transferred at application level since room creation */
  bytesIn: number;
  bytesOut: number;
  otherUserConnected: boolean;
}

export type SyncIndicatorState =
  | "SYNCED"
  | "SYNCING"
  | "CORRECTING"
  | "UNSTABLE"
  | "RECONNECTING"
  | "WAITING_PARTICIPANT"
  | "IDLE";

export interface ChatMessageRecord {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  messageText: string;
  messageType: "TEXT" | "REACTION" | "SYSTEM";
  moviePositionMs: number | null;
  createdAt: string;
}

export interface RoomErrorPayload {
  code:
    | "INVALID_ROOM"
    | "ROOM_FULL"
    | "ROOM_EXPIRED"
    | "ALREADY_JOINED"
    | "NOT_A_PARTICIPANT"
    | "RATE_LIMITED"
    | "INVALID_PAYLOAD"
    | "PLAYBACK_CONFLICT"
    | "DB_ERROR"
    | "SERVER_ERROR";
  message: string;
}

// ── Socket event map ────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  ROOM_STATE: (snapshot: RoomSnapshot) => void;
  PLAY_AT: (payload: PlayAtPayload) => void;
  PAUSE_AT: (payload: PauseAtPayload) => void;
  SEEK_TO: (payload: SeekToPayload) => void;
  SYNC_PONG: (payload: SyncPongPayload) => void;
  SYNC_STATUS: (payload: SyncStatusPayload) => void;
  STATE_UPDATE: (payload: StateReportPayload & { userId: string; serverTimeMs: number }) => void;
  USER_READY: (payload: { userId: string; isReady: boolean }) => void;
  USER_CONNECTED: (payload: { userId: string; displayName: string; reconnected: boolean }) => void;
  USER_DISCONNECTED: (payload: { userId: string; displayName: string }) => void;
  USER_LEFT: (payload: { userId: string; displayName: string }) => void;
  CHAT_MESSAGE: (message: ChatMessageRecord) => void;
  CHAT_HISTORY: (messages: ChatMessageRecord[]) => void;
  ROOM_EXPIRED: (payload: { reason: string }) => void;
  ROOM_ERROR: (payload: RoomErrorPayload) => void;
}

export interface ClientToServerEvents {
  JOIN_ROOM: (payload: RoomJoinPayload, ack?: (res: { ok: boolean; snapshot?: RoomSnapshot; error?: RoomErrorPayload }) => void) => void;
  LEAVE_ROOM: () => void;
  PLAY_REQUEST: (payload: PlayRequestPayload) => void;
  PAUSE_REQUEST: (payload: PauseRequestPayload) => void;
  SEEK_REQUEST: (payload: SeekRequestPayload) => void;
  USER_READY: (payload: UserReadyPayload) => void;
  SYNC_PING: (payload: SyncPingPayload) => void;
  STATE_REPORT: (payload: StateReportPayload) => void;
  CHAT_MESSAGE: (payload: ChatMessagePayload) => void;
}
