"use client";

import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const dims = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "relative grid place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 shadow-[0_0_24px_rgba(139,92,246,0.45)]",
          dims
        )}
      >
        <Clapperboard className="h-1/2 w-1/2 text-white" strokeWidth={2.2} />
      </div>
      <span className={cn("font-semibold tracking-tight", text)}>
        <span className="brand-gradient-text">Sync</span>
        <span className="text-foreground">Cinema</span>
      </span>
    </div>
  );
}
