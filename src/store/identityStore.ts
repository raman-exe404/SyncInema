"use client";

// Guest identity — persisted in localStorage so reconnections restore the
// same participant across reloads without any account system (MVP scope).
//
// SSR note: values are empty until hydrate() runs on the client (layout
// effect before the socket connects) — this keeps server HTML deterministic.

import { create } from "zustand";

const KEY_USER_ID = "synccinema.userId";
const KEY_NAME = "synccinema.displayName";

interface IdentityState {
  userId: string;
  displayName: string;
  hydrated: boolean;
  hydrate: () => void;
  setName: (name: string) => void;
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  userId: "",
  displayName: "",
  hydrated: false,
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    let userId = localStorage.getItem(KEY_USER_ID);
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem(KEY_USER_ID, userId);
    }
    set({ userId, displayName: localStorage.getItem(KEY_NAME) ?? "", hydrated: true });
  },
  setName: (name) => {
    const clean = name.trim().slice(0, 32);
    if (typeof window !== "undefined") localStorage.setItem(KEY_NAME, clean);
    set({ displayName: clean });
  },
}));

export function currentIdentity() {
  const { userId, displayName } = useIdentityStore.getState();
  return { userId, displayName };
}
