"use client";

// SPA view routing. The sandbox exposes a single user-visible route ("/"),
// so screens are state-driven views — room flows still work perfectly
// because joining is by six-character code, not by URL.

import { create } from "zustand";

export type View = "landing" | "home" | "create" | "join" | "lobby" | "watch" | "settings";

export interface RecentRoom {
  roomCode: string;
  movieName: string;
  role: "host" | "guest";
  joinedAt: number;
}

const KEY_RECENT = "synccinema.recentRooms";

function loadRecent(): RecentRoom[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY_RECENT) ?? "[]");
  } catch {
    return [];
  }
}

interface ViewState {
  view: View;
  previousView: View | null;
  recentRooms: RecentRoom[];
  hydrated: boolean;
  navigate: (view: View) => void;
  goHome: () => void;
  addRecentRoom: (room: RecentRoom) => void;
  clearRecentRooms: () => void;
  /** prefill for the join form when arriving from ?room=CODE */
  pendingJoinCode: string;
  setPendingJoinCode: (code: string) => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  view: "home",
  previousView: null,
  recentRooms: [],
  hydrated: false,
  pendingJoinCode: "",
  hydrate: () => {
    if (get().hydrated) return;
    set({ recentRooms: loadRecent(), hydrated: true });
  },
  navigate: (view) => set({ view, previousView: get().view }),
  goHome: () => set({ view: "home" }),
  addRecentRoom: (room) => {
    const list = [room, ...loadRecent().filter((r) => r.roomCode !== room.roomCode)].slice(0, 6);
    localStorage.setItem(KEY_RECENT, JSON.stringify(list));
    set({ recentRooms: list });
  },
  clearRecentRooms: () => {
    localStorage.removeItem(KEY_RECENT);
    set({ recentRooms: [] });
  },
  setPendingJoinCode: (code) => set({ pendingJoinCode: code }),
}));
