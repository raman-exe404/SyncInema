"use client";

// Chat panel: live message list with auto-scroll, quick reactions, emoji
// picker, timestamp-linked messages (jump-to-scene with room-wide seek
// confirmation), unread badge and connection states.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Link2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { QuickReactions, EmojiPicker } from "@/components/chat/EmojiPicker";
import { useChat } from "@/hooks/useChat";
import { useChatStore } from "@/store/chatStore";
import { useIdentityStore } from "@/store/identityStore";
import { useRoomStore } from "@/store/roomStore";
import { formatDuration, formatBytes } from "@/services/movieHash";


import { MAX_MESSAGE_LENGTH } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import type { ChatMessageRecord } from "@/types/synccinema";

function formatWallTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ m, isMine, onTimestampClick }: {
  m: ChatMessageRecord;
  isMine: boolean;
  onTimestampClick: (ms: number) => void;
}) {
  if (m.messageType === "SYSTEM") {
    return (
      <div className="py-1 text-center">
        <span className="rounded-full bg-secondary/50 px-3 py-1 text-[11px] text-muted-foreground">
          {m.messageText}
        </span>
      </div>
    );
  }

  const bigReaction = m.messageType === "REACTION";

  return (
    <div className={cn("flex flex-col gap-0.5", isMine ? "items-end" : "items-start")}>
      <div className="flex items-baseline gap-2 px-1">
        <span className="text-[11px] font-medium text-violet-300/90">{isMine ? "You" : m.senderName}</span>
        <span className="text-[10px] text-muted-foreground/60">{formatWallTime(m.createdAt)}</span>
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          bigReaction && "bg-transparent px-1 py-0.5 text-3xl",
          !bigReaction && isMine && "rounded-br-md bg-violet-600/85 text-white",
          !bigReaction && !isMine && "rounded-bl-md bg-secondary/80 text-foreground"
        )}
      >
        {bigReaction ? (
          <span className="block" role="img" aria-label="reaction">{m.messageText}</span>
        ) : (
          <>
            <span className="whitespace-pre-wrap break-words">{m.messageText}</span>
            {m.moviePositionMs != null && m.moviePositionMs > 0 && (
              <button
                onClick={() => onTimestampClick(m.moviePositionMs!)}
                className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-black/25 px-2 py-0.5 font-mono text-[11px] text-sky-200 transition-colors hover:bg-black/40"
                title="Jump both of us to this scene"
              >
                <Link2 className="h-3 w-3" />
                {formatDuration(m.moviePositionMs)}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ChatPanel({ className }: { className?: string }) {
  const { messages, unread, draft, addDraft, markRead } = {
    messages: useChatStore((s) => s.messages),
    unread: useChatStore((s) => s.unread),
    draft: useChatStore((s) => s.draft),
    addDraft: useChatStore((s) => s.setDraft),
    markRead: useChatStore((s) => s.markRead),
  };
  const myUserId = useIdentityStore((s) => s.userId);
  const otherUserConnected = useRoomStore((s) => s.otherUserConnected);
  const lastError = useRoomStore((s) => s.lastError);
  const bytesIn = useRoomStore((s) => s.bytesIn);
  const bytesOut = useRoomStore((s) => s.bytesOut);
  const { sendText, sendReaction, jumpToTimestamp } = useChat();
  const listRef = useRef<HTMLDivElement>(null);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // Auto-scroll to the latest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    markRead();
  }, [messages.length, markRead]);

  const error = useMemo(() => {
    if (!lastError) return null;
    if (lastError.code === "RATE_LIMITED" && Date.now() - lastError.at < 4000) return lastError.message;
    if (lastError.code === "DB_ERROR" && Date.now() - lastError.at < 4000) return lastError.message;
    return null;
  }, [lastError]);

  const handleSend = () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const ok = sendText(draft, false);
    if (ok) addDraft("");
    setSending(false);
  };

  const attachTimestamp = () => {
    if (!draft.trim()) return;
    sendText(draft, true);
    addDraft("");
  };

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card/40", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">
          Chat
          {unread > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-muted-foreground sm:hidden" title="Application payload bytes — the movie never leaves your device">
            {formatBytes(bytesIn + bytesOut)} payload
          </span>
          <span className="text-[11px] text-muted-foreground">
            {otherUserConnected ? "partner here" : "partner offline"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-sm text-muted-foreground">Say hi when the movie starts 🍿</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Messages stay inside this room</p>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} isMine={m.senderId === myUserId} onTimestampClick={setSeekTarget} />
        ))}
      </div>

      {/* Error / rate-limit hint */}
      {error && (
        <p className="inline-flex items-center gap-1.5 px-4 pb-1 text-[11px] text-amber-400">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}

      {/* Quick reactions */}
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5">
        <QuickReactions onPick={sendReaction} />
        <EmojiPicker onPick={(e) => addDraft(draft + e)} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 pb-3 pt-1">
        <Input
          value={draft}
          onChange={(e) => addDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder={otherUserConnected ? "Message…" : "Partner offline — they'll see it later"}
          maxLength={MAX_MESSAGE_LENGTH}
          className="h-10 flex-1 rounded-xl bg-secondary/70 text-sm"
          aria-label="Chat message"
        />
        {draft.trim() && (
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 text-sky-300"
            onClick={attachTimestamp}
            title="Send with the current movie timestamp"
            aria-label="Attach current movie timestamp"
          >
            <Link2 className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="h-9 w-9 shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500"
          aria-label="Send message"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {/* Room-wide seek confirmation for timestamp jumps */}
      <AlertDialog open={seekTarget !== null} onOpenChange={(o) => !o && setSeekTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jump to {formatDuration(seekTarget ?? 0)}?</AlertDialogTitle>
            <AlertDialogDescription>
              This seeks <span className="text-foreground">both</span> of you to that scene. Your partner will see
              the same jump.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (seekTarget !== null) jumpToTimestamp(seekTarget);
                setSeekTarget(null);
              }}
            >
              Jump for both
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
