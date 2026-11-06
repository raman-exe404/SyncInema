// Room domain types (server-internal state kept in memory per product spec §12:
// "Keep active playback state in backend memory").

import type { MovieDescriptor, TimelineState } from "./socket.types";

export interface ServerParticipant {
  userId: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  movie: MovieDescriptor | null;
  socketId: string | null;
  connected: boolean;
  lastSeenAt: number;
}

export interface ServerRoom {
  id: string;
  roomCode: string;
  hostId: string;
  status: "WAITING" | "ACTIVE" | "ENDED" | "EXPIRED";
  createdAt: number;
  expiresAt: number;
  participants: Map<string, ServerParticipant>; // keyed by userId
  timeline: TimelineState | null;
  /** ids of users who pressed play/seek most recently (for PLAY_AT broadcast origin) */
  bytesIn: number;
  bytesOut: number;
}

export const MAX_PARTICIPANTS = 2;
/** A room lives 12 h, refreshed on every interaction. */
export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
/** Safety buffer between PLAY_REQUEST broadcast and scheduled start (spec §8). */
export const START_BUFFER_MS = 2500;
/** Seek scheduling buffer when playing. */
export const SEEK_BUFFER_MS = 900;
