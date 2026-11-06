"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PlaybackSyncEngine — client half of the server-authoritative sync system.
//
//  • NTP-style clock offset estimation (SYNC_PING / SYNC_PONG, min-RTT wins)
//  • Scheduled playback: PLAY_AT carries startAtServerMs; both clients convert
//    it to a local instant via their clock offset and start simultaneously.
//  • Drift correction (spec §8):
//      < 100 ms  → no action
//      100–500 ms→ gentle playback-rate nudging, restored when aligned
//      > 500 ms  → controlled seek
//  • Periodic STATE_REPORT keeps the server's sync indicator honest.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { emitSafe } from "@/services/socket";
import type {
  PauseAtPayload,
  PlayAtPayload,
  SeekToPayload,
  SyncPongPayload,
  TimelineState,
} from "@/types/synccinema";

const DRIFT_FINE_MS = 100; // below: perfect, no action
const DRIFT_HARD_MS = 500; // above: controlled seek
const DRIFT_LOOP_MS = 3_000;
const CLOCK_SYNC_INTERVAL_MS = 60_000;
const CLOCK_SAMPLES = 6;
const CLOCK_SAMPLE_SPACING_MS = 150;
const MAX_RT_TRIP_MS = 2_000;
/** start prepare (pre-seek) this long before the scheduled instant */
const PREPARE_LEAD_MS = 300;

interface ClockSample {
  offset: number;
  rtt: number;
}

class PlaybackSyncEngine {
  private video: HTMLVideoElement | null = null;
  private timeline: TimelineState | null = null;
  private clockOffset = 0;
  private lastRtt = Number.POSITIVE_INFINITY;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private prepareTimer: ReturnType<typeof setTimeout> | null = null;
  private driftTimer: ReturnType<typeof setInterval> | null = null;
  private correcting = false;
  private hardSeeking = false;
  onLocalStateChange: (() => void) | null = null;

  setVideo(el: HTMLVideoElement | null) {
    this.video = el;
    // Late attach: the player mounts after PLAY_AT/SEEK_TO arrived (view
    // transition from the lobby). Apply the pending timeline now so the
    // scheduled start is never lost.
    if (el && this.timeline?.playing) {
      this.scheduleVideoStart(this.timeline.positionMs, this.timeline.anchorServerMs, true);
    }
  }

  getTimeline(): TimelineState | null {
    return this.timeline;
  }

  getClock(): { offset: number; rtt: number } {
    return { offset: this.clockOffset, rtt: this.lastRtt };
  }

  isCorrecting(): boolean {
    return this.correcting;
  }

  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  expectedPositionMs(nowServerMs = this.serverNow()): number {
    const t = this.timeline;
    if (!t) return 0;
    if (!t.playing) return t.positionMs;
    return t.positionMs + Math.max(0, nowServerMs - t.anchorServerMs) * t.playbackRate;
  }

  // ── Clock synchronisation ────────────────────────────────────────────────

  startClockSync() {
    let sampleIndex = 0;
    let best: ClockSample | null = null;

    const takeSample = () => {
      const t0 = Date.now();
      const handler = (p: SyncPongPayload) => {
        const t3 = Date.now();
        const rtt = t3 - p.t0;
        if (rtt < MAX_RT_TRIP_MS && (!best || rtt < best.rtt)) {
          best = { offset: (p.t1 - p.t0 + (p.t2 - p.t0)) / 2, rtt };
        }
        sampleIndex++;
        if (sampleIndex < CLOCK_SAMPLES) {
          setTimeout(takeSample, CLOCK_SAMPLE_SPACING_MS);
        } else if (best) {
          // Prefer low-round-trip-time measurements (spec §8).
          const b = best as ClockSample;
          this.clockOffset = b.offset;
          this.lastRtt = b.rtt;
        }
      };
      emitSafe("SYNC_PING", { t0 });
      // one-shot listener per sample
      import("@/services/socket").then(({ getSocket }) => {
        const s = getSocket();
        if (!s) return;
        s.once("SYNC_PONG", handler);
        setTimeout(() => s.off("SYNC_PONG", handler), 4_000);
      });
    };
    takeSample();
  }

  // ── Server events ────────────────────────────────────────────────────────

  handlePlayAt(p: PlayAtPayload) {
    this.timeline = {
      positionMs: p.positionMs,
      playing: true,
      playbackRate: p.playbackRate,
      anchorServerMs: p.startAtServerMs,
    };
    this.scheduleVideoStart(p.positionMs, p.startAtServerMs, true);
    this.onLocalStateChange?.();
  }

  handlePauseAt(p: PauseAtPayload) {
    this.clearSchedule();
    this.timeline = {
      positionMs: p.positionMs,
      playing: false,
      playbackRate: 1,
      anchorServerMs: p.serverTimeMs,
    };
    const v = this.video;
    if (v) {
      v.pause();
      const target = p.positionMs / 1000;
      if (Math.abs(v.currentTime - target) > 0.15 && Number.isFinite(target)) {
        v.currentTime = target;
      }
      if (v.playbackRate !== 1) v.playbackRate = 1;
    }
    this.correcting = false;
    this.onLocalStateChange?.();
  }

  handleSeekTo(p: SeekToPayload) {
    const wasPlaying = this.timeline?.playing ?? false;
    this.clearSchedule();
    if (p.startAtServerMs != null && wasPlaying) {
      this.timeline = {
        positionMs: p.positionMs,
        playing: true,
        playbackRate: 1,
        anchorServerMs: p.startAtServerMs,
      };
      this.scheduleVideoStart(p.positionMs, p.startAtServerMs, true);
    } else {
      this.timeline = {
        positionMs: p.positionMs,
        playing: false,
        playbackRate: 1,
        anchorServerMs: p.serverTimeMs,
      };
      const v = this.video;
      if (v && Number.isFinite(p.positionMs / 1000)) {
        v.currentTime = p.positionMs / 1000;
      }
    }
    this.onLocalStateChange?.();
  }

  /** Reconnect/recovery: adopt the authoritative timeline as-is. */
  adoptTimeline(t: TimelineState | null) {
    this.clearSchedule();
    this.timeline = t;
    const v = this.video;
    if (!v || !t) return;
    const expected = this.expectedPositionMs() / 1000;
    if (t.playing) {
      if (Math.abs(v.currentTime - expected) > 0.25) v.currentTime = expected;
      void v.play().catch(() => undefined);
    } else {
      v.pause();
      if (Math.abs(v.currentTime - expected) > 0.25) v.currentTime = expected;
    }
  }

  // ── Scheduled start ──────────────────────────────────────────────────────

  private scheduleVideoStart(positionMs: number, startAtServerMs: number, autoplay: boolean) {
    const v = this.video;
    if (!v) return;
    this.clearSchedule();

    const delayMs = startAtServerMs - this.serverNow();

    if (delayMs <= 0) {
      // Start moment already passed (slow network): jump to computed position.
      const lateMs = -delayMs;
      v.playbackRate = 1;
      v.currentTime = Math.max(0, (positionMs + lateMs) / 1000);
      if (autoplay) void v.play().catch(() => undefined);
      return;
    }

    // Pre-seek slightly ahead of the scheduled instant so the decoder is ready.
    this.prepareTimer = setTimeout(() => {
      const target = positionMs / 1000;
      if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
      if (!autoplay) v.pause();
    }, Math.max(0, delayMs - PREPARE_LEAD_MS));

    this.startTimer = setTimeout(() => {
      v.playbackRate = 1;
      if (autoplay) {
        void v.play().catch(() => {
          // Autoplay blocked: surfaced by UI ("tap to start audio/video").
        });
      }
    }, delayMs);
  }

  private clearSchedule() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.prepareTimer) clearTimeout(this.prepareTimer);
    this.startTimer = null;
    this.prepareTimer = null;
  }

  // ── Drift correction + position reporting ────────────────────────────────

  startLoops() {
    if (this.driftTimer) return;
    this.driftTimer = setInterval(() => this.tick(), DRIFT_LOOP_MS);
  }

  stopLoops() {
    if (this.driftTimer) clearInterval(this.driftTimer);
    this.driftTimer = null;
    this.clearSchedule();
  }

  private tick() {
    const v = this.video;
    const t = this.timeline;
    if (!v || v.readyState < 2 || v.seeking) {
      // Still report presence so the room indicator stays truthful.
      return;
    }

    const actualMs = v.currentTime * 1000;
    let driftMs: number | null = null;

    if (t && t.playing && !v.paused) {
      const expectedMs = this.expectedPositionMs();
      driftMs = actualMs - expectedMs;
      const abs = Math.abs(driftMs);

      if (abs < DRIFT_FINE_MS) {
        this.correcting = false;
        if (v.playbackRate !== 1) v.playbackRate = 1;
      } else if (abs <= DRIFT_HARD_MS) {
        // Gentle rate correction: converge ~1 s of drift per 8 s of playback.
        this.correcting = true;
        const correction = Math.min(0.06, Math.max(-0.06, -driftMs / 8000));
        v.playbackRate = 1 + correction;
      } else if (!this.hardSeeking) {
        // Controlled seek for large drift.
        this.correcting = true;
        this.hardSeeking = true;
        v.playbackRate = 1;
        v.currentTime = expectedMs / 1000;
        setTimeout(() => {
          this.hardSeeking = false;
        }, 1000);
      }
    } else if (t && !t.playing && !v.paused) {
      // Server says paused but our video runs (missed PAUSE_AT).
      v.pause();
    }

    emitSafe("STATE_REPORT", {
      positionMs: Math.round(actualMs),
      playing: !v.paused && !v.ended,
      playbackRate: v.playbackRate,
      driftMs: driftMs === null ? null : Math.round(driftMs),
    });
  }

  /** Current position of the local movie, ms. */
  localPositionMs(): number {
    if (this.video) return Math.round(this.video.currentTime * 1000);
    return Math.round(this.expectedPositionMs());
  }

  reset() {
    this.stopLoops();
    this.timeline = null;
    this.correcting = false;
    this.hardSeeking = false;
  }
}

export const playbackSync = new PlaybackSyncEngine();

/** React binding: keeps engine loops alive while the watch room is open. */
export function usePlaybackSync(active: boolean) {
  useEffect(() => {
    if (!active) return;
    playbackSync.startClockSync();
    const clockInterval = setInterval(() => playbackSync.startClockSync(), CLOCK_SYNC_INTERVAL_MS);
    playbackSync.startLoops();
    return () => {
      clearInterval(clockInterval);
      playbackSync.stopLoops();
    };
  }, [active]);
}
