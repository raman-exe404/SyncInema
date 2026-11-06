"use client";

// Compact emoji picker: curated categories, grid popover, zero dependencies.

import { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const GROUPS: { name: string; emojis: string[] }[] = [
  {
    name: "Smileys",
    emojis: ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😜", "🤗", "🤔", "😅", "😎", "🥺", "😴", "🙄", "😱", "🤯", "🥱", "😇", "🤫"],
  },
  {
    name: "Gestures",
    emojis: ["👍", "👎", "👏", "🙏", "🤝", "💪", "🫶", "👋", "🤌", "✌️", "🤞", "👌"],
  },
  {
    name: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💕", "💖", "💔", "❣️", "💘"],
  },
  {
    name: "Wow & fear",
    emojis: ["😮", "😱", "😨", "😰", "😭", "🥶", "🔥", "💥", "✨", "⚠️", "💀", "🫣"],
  },
  {
    name: "Movie night",
    emojis: ["🍿", "🎬", "📺", "🥤", "🍕", "🍫", "⭐", "🌙", "🎧", "😱", "😭", "🤍"],
  },
];

const QUICK = ["❤️", "😂", "😭", "😱", "🔥", "👏"];

export function QuickReactions({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Quick reactions">
      {QUICK.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="grid h-8 w-8 place-items-center rounded-lg text-base transition-transform hover:scale-125 hover:bg-secondary/70"
          aria-label={`Send ${e} reaction`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
            className
          )}
          aria-label="Pick an emoji"
        >
          <Smile className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-2">
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {GROUPS.map((g) => (
            <div key={g.name}>
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.name}
              </p>
              <div className="grid grid-cols-6 gap-0.5">
                {g.emojis.map((e, i) => (
                  <button
                    key={`${g.name}-${i}`}
                    type="button"
                    onClick={() => {
                      onPick(e);
                      setOpen(false);
                    }}
                    className="grid h-9 place-items-center rounded-md text-lg transition-transform hover:scale-110 hover:bg-secondary"
                    aria-label={`Insert ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
