"use client";

// Application-level network usage meter. Counts SyncCinema control + chat
// payload bytes only (transport + TLS overhead excluded, and there are no
// video bytes — the movie never leaves the device).

import { ArrowDown, ArrowUp } from "lucide-react";
import { formatBytes } from "@/services/movieHash";

export function NetworkMeter({ bytesIn, bytesOut }: { bytesIn: number; bytesOut: number }) {
  const total = bytesIn + bytesOut;
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-[11px] text-muted-foreground"
      title="Application payload bytes since the room opened. Excludes TCP/TLS overhead. Video bytes are always 0 — the movie never leaves your device."
    >
      <span className="inline-flex items-center gap-1">
        <ArrowDown className="h-3 w-3 text-sky-400" />
        {formatBytes(bytesIn)}
      </span>
      <span className="inline-flex items-center gap-1">
        <ArrowUp className="h-3 w-3 text-violet-400" />
        {formatBytes(bytesOut)}
      </span>
      <span className="text-border">|</span>
      <span>payload</span>
      <span className="font-mono text-foreground/70">{formatBytes(total)}</span>
    </span>
  );
}
