"use client";

// Honest synchronisation indicator. Every state is derived from verified
// server information — "Synced" only appears when the server confirms both
// clients reported positions within tolerance.

import {
  Activity,
  CheckCircle2,
  Loader2,
  RefreshCw,
  UserRoundX,
  Waves,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SyncIndicatorState } from "@/types/synccinema";

const CONFIG: Record<SyncIndicatorState, { label: string; className: string; icon: React.ElementType }> = {
  SYNCED: { label: "Synced", className: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", icon: CheckCircle2 },
  SYNCING: { label: "Synchronising", className: "bg-sky-500/12 text-sky-400 border-sky-500/25", icon: Loader2 },
  CORRECTING: { label: "Correcting playback", className: "bg-amber-500/12 text-amber-400 border-amber-500/25", icon: Activity },
  UNSTABLE: { label: "Connection unstable", className: "bg-orange-500/12 text-orange-400 border-orange-500/25", icon: WifiOff },
  RECONNECTING: { label: "Reconnecting", className: "bg-orange-500/12 text-orange-400 border-orange-500/25", icon: RefreshCw },
  WAITING_PARTICIPANT: { label: "Waiting for participant", className: "bg-secondary/70 text-muted-foreground border-border", icon: UserRoundX },
  IDLE: { label: "Paused", className: "bg-secondary/70 text-muted-foreground border-border", icon: Waves },
};

export function SyncBadge({ state, className }: { state: SyncIndicatorState; className?: string }) {
  const cfg = CONFIG[state];
  const Icon = cfg.icon;
  const spin = state === "SYNCING" || state === "RECONNECTING";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium",
        cfg.className,
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("h-3 w-3", spin && "animate-spin")} />
      {cfg.label}
    </span>
  );
}
