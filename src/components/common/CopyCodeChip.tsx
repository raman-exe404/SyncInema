"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyCodeChip({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (share: boolean) => {
    const text = share
      ? `Join me on SyncCinema — room code ${code}. Pick your copy of the movie and let's watch together.`
      : code;
    try {
      if (navigator.share) {
        await navigator.share({ title: "SyncCinema", text });
        return;
      }
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard denied — fall back to the code itself.
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        /* ignore */
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={() => copy(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        copy(true);
      }}
      title="Click to copy · right-click for a shareable invite text"
      className={cn(
        "group inline-flex items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 transition-colors hover:bg-violet-500/20",
        className
      )}
      aria-label={`Room code ${code.split("").join(" ")} — click to copy`}
    >
      <span className="font-mono text-2xl font-bold tracking-[0.3em] text-violet-200">{code}</span>
      {copied ? (
        <Check className="h-4 w-4 text-emerald-400" />
      ) : (
        <Copy className="h-4 w-4 text-violet-300/70 transition-colors group-hover:text-violet-200" />
      )}
    </button>
  );
}
