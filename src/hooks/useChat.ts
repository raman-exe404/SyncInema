"use client";

// Chat actions: text messages, quick emoji reactions, and timestamp-linked
// seeks. Validation mirrors the server (500 chars, non-empty).

import { useCallback } from "react";
import { emitSafe } from "@/services/socket";
import { useChatStore } from "@/store/chatStore";
import { playbackSync } from "@/hooks/usePlaybackSync";

export const MAX_MESSAGE_LENGTH = 500;

export function useChat() {
  const sendText = useCallback((text: string, attachTimestamp: boolean) => {
    const clean = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!clean) return false;
    emitSafe("CHAT_MESSAGE", {
      text: clean,
      messageType: "TEXT",
      moviePositionMs: attachTimestamp ? playbackSync.localPositionMs() : null,
    });
    useChatStore.getState().setDraft("");
    return true;
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    emitSafe("CHAT_MESSAGE", {
      text: emoji,
      messageType: "REACTION",
      moviePositionMs: playbackSync.localPositionMs(),
    });
  }, []);

  /** Timestamp chip click → room-wide seek with confirmation upstream. */
  const jumpToTimestamp = useCallback((positionMs: number) => {
    emitSafe("SEEK_REQUEST", { positionMs });
  }, []);

  return { sendText, sendReaction, jumpToTimestamp };
}
