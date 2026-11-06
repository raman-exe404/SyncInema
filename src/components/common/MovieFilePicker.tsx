"use client";

// Local movie selection: pick → validate → SHA-256 (Web Worker, incremental)
// → duration probe → descriptor. The file never leaves the device; only the
// tiny descriptor (name/size/duration/mime/hash) is shared with the room.

import { useCallback, useRef, useState } from "react";
import { FileVideo, Film, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { hashMovieFile, formatBytes } from "@/services/movieHash";
import { usePlayerStore } from "@/store/playerStore";
import type { MovieDescriptor } from "@/types/synccinema";

const ACCEPTED = "video/mp4,video/webm,video/x-matroska,video/quicktime,.mp4,.webm,.mkv,.mov,.m4v";

export function MovieFilePicker({
  onVerified,
  compact = false,
}: {
  onVerified?: (d: MovieDescriptor) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "hashing" | "probing" | "error">("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { file, descriptor, hashPhase, setHashing, setHashProgress, setHashError, setMovie } = usePlayerStore();

  const handleFile = useCallback(
    async (f: File) => {
      setError(null);
      if (!f.type.startsWith("video/") && !/\.(mp4|webm|mkv|mov|m4v)$/i.test(f.name)) {
        setError("That doesn't look like a video file. Choose an MP4, WebM or MKV copy of the movie.");
        setPhase("error");
        return;
      }
      if (f.size === 0) {
        setError("This file is empty. Pick your movie file again.");
        setPhase("error");
        return;
      }

      // 1. Hash (streamed in a worker — the movie never leaves the device).
      setPhase("hashing");
      setHashing();
      let durationMs = 0;
      let hash = "";
      try {
        const descriptor = await hashMovieFile(f, (p) => {
          setPercent(p.percent);
          setHashProgress(p.percent);
        });
        hash = descriptor.hash;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not read the file";
        setError(`Hashing failed: ${msg}`);
        setHashError(msg);
        setPhase("error");
        return;
      }

      // 2. Duration probe via a detached <video> element.
      setPhase("probing");
      const url = URL.createObjectURL(f);
      durationMs = await new Promise<number>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        const done = (ms: number) => {
          URL.revokeObjectURL(v.src);
          resolve(ms);
        };
        v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0);
        v.onerror = () => done(-1); // negative signals "browser can't decode this"
        v.src = url;
        setTimeout(() => done(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0), 8000);
      });

      const objectUrl = URL.createObjectURL(f);
      if (durationMs < 0) {
        // Codec unsupported — still allow selection but warn clearly.
        setError(
          "Your browser can't decode this file (codec unsupported). You can keep it selected, but playback will likely fail — try an MP4 (H.264/AAC) or WebM copy."
        );
        setPhase("error");
        setMovie(f, objectUrl, { name: f.name, size: f.size, durationMs: 0, mime: f.type || "video/mp4", hash });
      } else {
        const d: MovieDescriptor = {
          name: f.name,
          size: f.size,
          durationMs,
          mime: f.type || "video/mp4",
          hash,
        };
        setMovie(f, objectUrl, d);
        setPhase("idle");
        setPercent(100);
        onVerified?.(d);
      }
    },
    [onVerified, setHashError, setHashing, setHashProgress, setMovie]
  );

  const busy = phase === "hashing" || phase === "probing";
  const shownPercent = phase === "probing" ? 100 : percent;
  const activeDescriptor = descriptor;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        aria-label="Select your local movie file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {!file && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={`group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-violet-500/25 bg-violet-500/[0.04] text-center transition-all hover:border-violet-500/50 hover:bg-violet-500/[0.09] ${
            compact ? "p-6" : "p-10"
          } ${busy ? "cursor-wait opacity-80" : "cursor-pointer"}`}
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-violet-700/25 shadow-[0_0_30px_rgba(139,92,246,0.25)]">
            <Film className="h-7 w-7 text-violet-300" />
          </span>
          <span className="space-y-1">
            <span className="block text-sm font-medium text-foreground">Select your local movie file</span>
            <span className="block text-xs text-muted-foreground">
              MP4, WebM or MKV — it stays on your device, we only compare a fingerprint of it
            </span>
          </span>
        </button>
      )}

      {file && (
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15">
              <FileVideo className="h-5 w-5 text-violet-300" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatBytes(file.size)}
                {activeDescriptor?.durationMs ? ` · ${Math.round(activeDescriptor.durationMs / 60000)} min` : ""}
                {file.type ? ` · ${file.type}` : ""}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Change
            </Button>
          </div>

          {(busy || hashPhase === "hashing") && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {phase === "probing" ? "Reading movie metadata…" : "Fingerprinting file (SHA-256)…"}
                </span>
                <span className="font-mono">{shownPercent}%</span>
              </div>
              <Progress value={shownPercent} className="h-1.5" />
            </div>
          )}

          {hashPhase === "ready" && !busy && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Fingerprint verified — SHA-256 · {formatBytes(file.size)} processed locally
            </p>
          )}

          {error && (
            <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-amber-400">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
