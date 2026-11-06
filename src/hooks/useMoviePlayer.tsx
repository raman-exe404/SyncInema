"use client";

// Local video element binding for the watch room. Provides reactive playback
// state for the custom controls and registers the element with the sync
// engine. All remote-control decisions come from the sync engine — this hook
// never decides *when* to play, it translates user intent into protocol
// requests (PLAY_REQUEST / PAUSE_REQUEST / SEEK_REQUEST).

import { useCallback, useEffect, useRef, useState } from "react";
import { emitSafe } from "@/services/socket";
import { playbackSync } from "@/hooks/usePlaybackSync";
import { usePlayerStore } from "@/store/playerStore";

export interface LocalPlayerState {
  playing: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  buffering: boolean;
  fullscreen: boolean;
}

export function useMoviePlayer(objectUrl: string | null) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<LocalPlayerState>({
    playing: false,
    currentTimeMs: 0,
    durationMs: 0,
    volume: 1,
    muted: false,
    buffering: false,
    fullscreen: false,
  });

  // Register the element with the sync engine.
  useEffect(() => {
    playbackSync.setVideo(videoRef.current);
    return () => playbackSync.setVideo(null);
  }, [objectUrl]);

  // Element event bindings → reactive local state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const sync = () =>
      setState((s) => ({
        ...s,
        playing: !v.paused && !v.ended,
        currentTimeMs: Math.round(v.currentTime * 1000),
        durationMs: Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration * 1000) : s.durationMs,
        volume: v.volume,
        muted: v.muted,
        buffering: v.readyState < 3 && !v.paused,
      }));

    const events = [
      "play",
      "pause",
      "ended",
      "timeupdate",
      "durationchange",
      "loadedmetadata",
      "canplay",
      "waiting",
      "playing",
      "volumechange",
      "seeked",
      "seeking",
      "ratechange",
    ] as const;
    events.forEach((e) => v.addEventListener(e, sync));

    const onFsChange = () => setState((s) => ({ ...s, fullscreen: !!document.fullscreenElement }));
    document.addEventListener("fullscreenchange", onFsChange);
    sync();
    return () => {
      events.forEach((e) => v.removeEventListener(e, sync));
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [objectUrl]);

  /** User intent → protocol request. The server decides the actual start. */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      emitSafe("PLAY_REQUEST", { positionMs: Math.round(v.currentTime * 1000) });
    } else {
      emitSafe("PAUSE_REQUEST", { positionMs: playbackSync.localPositionMs() });
    }
  }, []);

  const seekTo = useCallback((ms: number) => {
    emitSafe("SEEK_REQUEST", { positionMs: Math.max(0, Math.round(ms)) });
  }, []);

  const setVolume = useCallback((vol: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.min(1, Math.max(0, vol));
    v.muted = vol === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
        const orientation = screen.orientation as
          | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
          | undefined;
        await orientation?.lock?.("landscape").catch(() => undefined);
      }
    } catch {
      // Fullscreen can be denied (e.g. iOS Safari); the inline player still works.
    }
  }, []);

  return { videoRef, containerRef, state, togglePlay, seekTo, setVolume, toggleMute, toggleFullscreen };
}

/** Local <video> element used by the player component. */
export function MovieVideoElement({
  objectUrl,
  videoRef,
}: {
  objectUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  return (
    <video
      ref={videoRef}
      src={objectUrl ?? undefined}
      className="h-full w-full bg-black object-contain"
      playsInline
      preload="auto"
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        if (Number.isFinite(el.duration) && el.duration > 0) {
          usePlayerStore.getState().setDuration(Math.round(el.duration * 1000));
        }
      }}
    />
  );
}
