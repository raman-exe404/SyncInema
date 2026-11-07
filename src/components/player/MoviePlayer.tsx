"use client";

// Custom cinematic player. Local file playback via object URL; play/pause/seek
// go through the server (PLAY_REQUEST → PLAY_AT) so both sides stay locked.
// Includes timeline, volume, fullscreen and the partner's position marker.

import { useCallback, useMemo, useState } from "react";
import { Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { SyncBadge } from "@/components/room/SyncBadge";
import { MovieVideoElement, useMoviePlayer } from "@/hooks/useMoviePlayer";
import { useRoomStore } from "@/store/roomStore";
import { playbackSync } from "@/hooks/usePlaybackSync";
import { formatDuration } from "@/services/movieHash";
import { cn } from "@/lib/utils";

const SEEK_STEP_MS = 10_000;

export function MoviePlayer({
  objectUrl,
  movieName,
  compact = false,
}: {
  objectUrl: string | null;
  movieName: string;
  compact?: boolean;
}) {
  const {
    videoRef,
    containerRef,
    state,
    togglePlay,
    seekTo,
    setVolume,
    toggleMute,
    toggleFullscreen,
  } = useMoviePlayer(objectUrl);
  const syncState = useRoomStore((s) => s.syncState);
  const peerPosition = useRoomStore((s) => s.peerPosition);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const durationMs = state.durationMs || 1;
  const progressMs = scrubbing ? scrubValue : state.currentTimeMs;

  const onScrub = useCallback(
    (values: number[]) => {
      setScrubbing(true);
      setScrubValue(values[0]);
    },
    []
  );

  const onScrubCommit = useCallback(
    (values: number[]) => {
      setScrubbing(false);
      seekTo(values[0]);
    },
    [seekTo]
  );

  const peerPercent = useMemo(() => {
    if (!peerPosition || !peerPosition.playing) return null;
    return Math.min(100, Math.max(0, (peerPosition.positionMs / durationMs) * 100));
  }, [peerPosition, durationMs]);

  // Controls overlay — shown always outside fullscreen, shown on hover/tap inside fullscreen
  const controls = (
    <div className="space-y-2 px-1 pt-2 pb-1">
      {/* Timeline */}
      <div className="relative">
        <Slider
          value={[Math.min(progressMs, durationMs)]}
          max={durationMs}
          step={1000}
          onValueChange={onScrub}
          onValueCommit={onScrubCommit}
          aria-label="Seek timeline — seeks are applied for both viewers"
          className="cursor-pointer"
        />
        {peerPercent !== null && (
          <span
            className="pointer-events-none absolute -top-1 h-3.5 w-1 rounded-full bg-sky-400/80"
            style={{ left: `calc(${peerPercent}% - 2px)` }}
            title="Your partner's position"
          />
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={togglePlay} aria-label={state.playing ? "Pause for both" : "Play for both"}>
          {state.playing ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => seekTo(Math.max(0, state.currentTimeMs - SEEK_STEP_MS))}
          aria-label="Back 10 seconds for both"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => seekTo(state.currentTimeMs + SEEK_STEP_MS)}
          aria-label="Forward 10 seconds for both"
        >
          <RotateCw className="h-4 w-4" />
        </Button>

        <span className="ml-1 font-mono text-xs text-muted-foreground" aria-live="off">
          {formatDuration(progressMs)} <span className="text-border">/</span> {formatDuration(durationMs)}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleMute} aria-label={state.muted ? "Unmute" : "Mute"}>
              {state.muted || state.volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Slider
              value={[state.muted ? 0 : Math.round(state.volume * 100)]}
              max={100}
              step={1}
              onValueChange={(v) => setVolume(v[0] / 100)}
              className="w-20"
              aria-label="Volume (local only)"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
          >
            {state.fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {!state.fullscreen && (
        <p className="truncate px-1 text-xs text-muted-foreground/80" title={movieName}>
          {movieName}
          <span className="ml-2 text-[10px] text-muted-foreground/50">
            play · pause · seek are room-wide — volume is local
          </span>
        </p>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={containerRef}
        className="group relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border/80 bg-black"
      >
        <MovieVideoElement objectUrl={objectUrl} videoRef={videoRef} />

        {/* No file loaded */}
        {!objectUrl && (
          <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">No local movie loaded</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Select your copy of the movie to join playback — it stays on this device.
              </p>
            </div>
          </div>
        )}

        {/* Center play affordance */}
        {objectUrl && !state.playing && !state.buffering && (
          <button
            onClick={togglePlay}
            aria-label="Request play for both viewers"
            className="absolute inset-0 grid place-items-center bg-black/25 transition-colors hover:bg-black/15"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-violet-600/90 shadow-[0_0_50px_rgba(139,92,246,0.55)] transition-transform hover:scale-105">
              <Play className="ml-1 h-7 w-7 text-white" fill="currentColor" />
            </span>
          </button>
        )}

        {/* Buffering */}
        {state.buffering && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
          </div>
        )}

        {/* Sync badge overlay */}
        <div className="absolute left-3 top-3">
          <SyncBadge state={syncState} className="glass border-border/60" />
        </div>

        {/* Fullscreen controls overlay — visible on hover or tap */}
        {state.fullscreen && (
          <div className="absolute bottom-0 left-0 right-0 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-3 pt-8">
            {controls}
          </div>
        )}
      </div>

      {/* Controls outside fullscreen */}
      {!state.fullscreen && (
        <div className="space-y-0 px-1 pt-3">
          {controls}
        </div>
      )}
    </div>
  );
}
