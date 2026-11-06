"use client";

import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/store/roomStore";

const CONFIG: Record<ConnectionState, { color: string; pulse: boolean; label: string }> = {
  online: { color: "bg-emerald-400", pulse: false, label: "Connected" },
  connecting: { color: "bg-amber-400", pulse: true, label: "Connecting" },
  reconnecting: { color: "bg-amber-400", pulse: true, label: "Reconnecting" },
  offline: { color: "bg-red-400", pulse: false, label: "Offline" },
};

export function StatusDot({
  state,
  showLabel = true,
  className,
}: {
  state: ConnectionState;
  showLabel?: boolean;
  className?: string;
}) {
  const cfg = CONFIG[state];
  return (
    <span className={cn("inline-flex items-center gap-2", className)} role="status" aria-label={cfg.label}>
      <span className="relative flex h-2 w-2">
        {cfg.pulse && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", cfg.color)} />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", cfg.color)} />
      </span>
      {showLabel && <span className="text-xs text-muted-foreground">{cfg.label}</span>}
    </span>
  );
}
