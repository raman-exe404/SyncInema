"use client";

// Room + connection + synchronisation state (single source of truth for UI).

import { create } from "zustand";
import type {
  ParticipantInfo,
  RoomSnapshot,
  SyncIndicatorState,
  TimelineState,
} from "@/types/synccinema";

export type ConnectionState = "connecting" | "online" | "reconnecting" | "offline";

export interface PeerPosition {
  userId: string;
  positionMs: number;
  playing: boolean;
  at: number;
}

interface RoomState {
  roomCode: string | null;
  roomStatus: RoomSnapshot["status"] | null;
  hostId: string | null;
  participants: ParticipantInfo[];
  compatibility: RoomSnapshot["compatibility"];
  timeline: TimelineState | null;
  syncState: SyncIndicatorState;
  connection: ConnectionState;
  lastSyncStatusAt: number;
  bytesIn: number;
  bytesOut: number;
  otherUserConnected: boolean;
  peerPosition: PeerPosition | null;
  /** latest server error for toasts */
  lastError: { code: string; message: string; at: number } | null;
  /** set when the local user has no playable local file after reconnect */
  needsFileReselect: boolean;

  applySnapshot: (s: RoomSnapshot) => void;
  setConnection: (c: ConnectionState) => void;
  setSyncStatus: (p: {
    timeline: TimelineState | null;
    syncState: SyncIndicatorState;
    bytesIn: number;
    bytesOut: number;
    otherUserConnected: boolean;
  }) => void;
  setPeerPosition: (p: PeerPosition) => void;
  setLastError: (code: string, message: string) => void;
  setNeedsFileReselect: (v: boolean) => void;
  reset: () => void;
}

const initial = {
  roomCode: null,
  roomStatus: null,
  hostId: null,
  participants: [] as ParticipantInfo[],
  compatibility: "PENDING" as RoomSnapshot["compatibility"],
  timeline: null,
  syncState: "IDLE" as SyncIndicatorState,
  connection: "connecting" as ConnectionState,
  lastSyncStatusAt: 0,
  bytesIn: 0,
  bytesOut: 0,
  otherUserConnected: false,
  peerPosition: null,
  lastError: null,
  needsFileReselect: false,
};

export const useRoomStore = create<RoomState>((set) => ({
  ...initial,
  applySnapshot: (s) =>
    set({
      roomCode: s.roomCode,
      roomStatus: s.status,
      hostId: s.hostId,
      participants: s.participants,
      compatibility: s.compatibility,
      timeline: s.playback,
    }),
  setConnection: (connection) => set({ connection }),
  setSyncStatus: ({ timeline, syncState, bytesIn, bytesOut, otherUserConnected }) =>
    set({ timeline, syncState, bytesIn, bytesOut, otherUserConnected, lastSyncStatusAt: Date.now() }),
  setPeerPosition: (p) => set({ peerPosition: p }),
  setLastError: (code, message) => set({ lastError: { code, message, at: Date.now() } }),
  setNeedsFileReselect: (needsFileReselect) => set({ needsFileReselect }),
  reset: () => set({ ...initial }),
}));
