"use client";

import { create } from "zustand";
import type { ChatMessageRecord } from "@/types/synccinema";

interface ChatState {
  messages: ChatMessageRecord[];
  unread: number;
  draft: string;
  addMessage: (m: ChatMessageRecord, isFromMe: boolean, chatVisible: boolean) => void;
  setHistory: (messages: ChatMessageRecord[]) => void;
  markRead: () => void;
  setDraft: (d: string) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  unread: 0,
  draft: "",
  addMessage: (m, isFromMe, chatVisible) =>
    set((s) => ({
      messages: [...s.messages.slice(-300), m],
      unread: chatVisible || isFromMe || m.messageType === "SYSTEM" ? s.unread : s.unread + 1,
    })),
  setHistory: (messages) => set({ messages }),
  markRead: () => set({ unread: 0 }),
  setDraft: (draft) => set({ draft }),
  clear: () => set({ messages: [], unread: 0, draft: "" }),
}));
