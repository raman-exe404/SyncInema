"use client";

// Local player state. The movie file itself lives ONLY on the user's device:
// we keep a File reference + object URL + local metadata descriptor.

import { create } from "zustand";
import type { MovieDescriptor } from "@/types/synccinema";

export type HashPhase = "idle" | "hashing" | "ready" | "error";

interface PlayerState {
  file: File | null;
  objectUrl: string | null;
  descriptor: MovieDescriptor | null;
  hashPhase: HashPhase;
  hashPercent: number;
  hashError: string | null;
  /** video readiness for scheduled playback */
  canPlay: boolean;

  setMovie: (file: File, objectUrl: string, descriptor: MovieDescriptor) => void;
  setHashing: () => void;
  setHashProgress: (percent: number) => void;
  setHashError: (message: string) => void;
  setDuration: (durationMs: number) => void;
  setCanPlay: (v: boolean) => void;
  clearMovie: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  file: null,
  objectUrl: null,
  descriptor: null,
  hashPhase: "idle",
  hashPercent: 0,
  hashError: null,
  canPlay: false,
  setMovie: (file, objectUrl, descriptor) => {
    const prev = get().objectUrl;
    if (prev && prev !== objectUrl) URL.revokeObjectURL(prev);
    set({ file, objectUrl, descriptor, hashPhase: "ready", hashPercent: 100, hashError: null });
  },
  setHashing: () => set({ hashPhase: "hashing", hashPercent: 0, hashError: null }),
  setHashProgress: (hashPercent) => set({ hashPercent }),
  setHashError: (hashError) => set({ hashPhase: "error", hashError }),
  setDuration: (durationMs) => {
    const d = get().descriptor;
    if (d) set({ descriptor: { ...d, durationMs } });
  },
  setCanPlay: (canPlay) => set({ canPlay }),
  clearMovie: () => {
    const prev = get().objectUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ file: null, objectUrl: null, descriptor: null, hashPhase: "idle", hashPercent: 0, hashError: null, canPlay: false });
  },
}));
