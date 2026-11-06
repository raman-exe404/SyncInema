// SyncCinema client-side mirror of the wire protocol (server: mini-services/synccinema-server/src/types).

export type PlaybackState = "IDLE" | "PLAYING" | "PAUSED";

export interface MovieDescriptor {
  name: string;
  size: number;
  durationMs: number;
  mime: string;
  hash: string;
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
  anchorServerMs: number;
}

export interface PlayAtPayload {
  positionMs: number;
  startAtServerMs: number;
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
  startAtServerMs: number | null;
  serverTimeMs: number;
  byUserId: string;
}

export interface SyncPongPayload {
  t0: number;
  t1: number;
  t2: number;
}

export type SyncIndicatorState =
  | "SYNCED"
  | "SYNCING"
  | "CORRECTING"
  | "UNSTABLE"
  | "RECONNECTING"
  | "WAITING_PARTICIPANT"
  | "IDLE";

export interface SyncStatusPayload {
  serverTimeMs: number;
  timeline: TimelineState | null;
  syncState: SyncIndicatorState;
  bytesIn: number;
  bytesOut: number;
  otherUserConnected: boolean;
}

export interface StateReportPayload {
  positionMs: number;
  playing: boolean;
  playbackRate: number;
  driftMs: number | null;
}

export interface PeerStateUpdate extends StateReportPayload {
  userId: string;
  serverTimeMs: number;
}

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

export interface RoomJoinPayload {
  roomCode: string;
  userId: string;
  displayName: string;
  movie: MovieDescriptor | null;
}

export interface JoinAck {
  ok: boolean;
  snapshot?: RoomSnapshot;
  error?: RoomErrorPayload;
}
