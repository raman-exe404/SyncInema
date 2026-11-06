// Sync service: server-authoritative playback timeline.
//
// The server keeps a single TimelineState per room:
//   expectedPosition(now) = playing
//     ? positionMs + (now - anchorServerMs) * playbackRate
//     : positionMs
// Clients derive their local schedule from PLAY_AT.startAtServerMs plus their
// estimated NTP-style clock offset, so no client trusts its own wall clock
// for scheduling.

import type { ServerRoom } from "../types/room.types";
import type { TimelineState, SyncIndicatorState } from "../types/socket.types";
import { env } from "../config/env";

export function expectedPositionMs(room: ServerRoom, nowServerMs = Date.now()): number {
  const t = room.timeline;
  if (!t) return 0;
  if (!t.playing) return t.positionMs;
  return t.positionMs + Math.max(0, nowServerMs - t.anchorServerMs) * t.playbackRate;
}

export function setTimeline(room: ServerRoom, next: TimelineState) {
  room.timeline = next;
}

export function pauseTimeline(room: ServerRoom, positionMs: number, nowServerMs: number) {
  setTimeline(room, {
    positionMs,
    playing: false,
    playbackRate: 1,
    anchorServerMs: nowServerMs,
  });
}

export function playTimeline(room: ServerRoom, positionMs: number, startAtServerMs: number) {
  setTimeline(room, {
    positionMs,
    playing: true,
    playbackRate: 1,
    anchorServerMs: startAtServerMs,
  });
}

// ── Sync quality aggregation ────────────────────────────────────────────────
// Clients periodically STATE_REPORT their position + own drift estimate.
// The server aggregates into an honest room-wide indicator; "SYNCED" is only
// reported when at least two connected participants are inside tolerance.

interface ReportEntry {
  positionMs: number;
  driftMs: number | null;
  rate: number;
  at: number;
}

const reports = new Map<string, ReportEntry>(); // `${roomCode}:${userId}` -> entry
const rttSamples = new Map<string, number>(); // socketId -> last measured rtt

export function recordStateReport(room: ServerRoom, userId: string, driftMs: number | null, positionMs: number, rate: number) {
  reports.set(`${room.roomCode}:${userId}`, { driftMs, positionMs, rate, at: Date.now() });
}

export function recordRtt(socketId: string, rttMs: number) {
  rttSamples.set(socketId, rttMs);
}

export function clearSocketMetrics(socketId: string) {
  rttSamples.delete(socketId);
}

export function computeSyncState(room: ServerRoom): SyncIndicatorState {
  const connected = [...room.participants.values()].filter((p) => p.connected);
  if (connected.length < 2) return "WAITING_PARTICIPANT";
  if (!room.timeline || !room.timeline.playing) return "IDLE";

  const now = Date.now();
  const fresh = connected
    .map((p) => reports.get(`${room.roomCode}:${p.userId}`))
    .filter((r): r is ReportEntry => !!r && now - r.at < 10_000);
  if (fresh.length < 2) return "SYNCING";

  const anyCorrecting = fresh.some((r) => r.rate !== 1);
  const worst = fresh.reduce((m, r) => Math.max(m, Math.abs(r.driftMs ?? Infinity)), 0);

  const rtts = [...rttSamples.values()];
  const unstable = rtts.some((r) => r > env.sync.unstableRttMs);
  if (unstable) return "UNSTABLE";
  if (worst > env.sync.correctingThresholdMs) return "CORRECTING";
  if (anyCorrecting || worst > env.sync.syncedToleranceMs) return "CORRECTING";
  return "SYNCED";
}
