"use client";

// The watch room — SyncCinema's centrepiece.
// Desktop: two columns (player left, chat right).
// Mobile: player on top, chat directly below with a fixed input; fullscreen
// keeps chat one tap away on exit.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Copy, LogOut, TriangleAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoviePlayer } from "@/components/player/MoviePlayer";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { CopyCodeChip } from "@/components/common/CopyCodeChip";
import { StatusDot } from "@/components/common/StatusDot";
import { NetworkMeter } from "@/components/room/NetworkMeter";
import { MovieFilePicker } from "@/components/common/MovieFilePicker";
import { useRoomStore } from "@/store/roomStore";
import { usePlayerStore } from "@/store/playerStore";
import { useIdentityStore } from "@/store/identityStore";
import { useRoom } from "@/hooks/useRoom";
import { usePlaybackSync } from "@/hooks/usePlaybackSync";
import { cn } from "@/lib/utils";

export function WatchRoomView() {
  const { roomCode, connection, bytesIn, bytesOut, participants, needsFileReselect } = useRoomStore();
  const objectUrl = usePlayerStore((s) => s.objectUrl);
  const descriptor = usePlayerStore((s) => s.descriptor);
  const myUserId = useIdentityStore((s) => s.userId);
  const { leave, reannounceMovie } = useRoom();
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Active engine loops for this screen (clock sync + drift correction).
  usePlaybackSync(true);

  const other = useMemo(() => participants.find((p) => p.userId !== myUserId), [participants, myUserId]);
  const me = useMemo(() => participants.find((p) => p.userId === myUserId), [participants, myUserId]);

  // Keep the screen awake during playback where the API is available.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        // @ts-expect-error wakeLock is not yet in all TS lib versions
        if (navigator.wakeLock) {
          // @ts-expect-error same as above
          sentinel = await navigator.wakeLock.request("screen");
        }
      } catch {
        /* not supported / denied */
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  const movieName = descriptor?.name ?? me?.movie?.name ?? "Your movie";

  return (
    <div className="relative z-10 mx-auto flex h-dvh w-full max-w-[1500px] flex-col px-3 pt-3 sm:px-5 sm:pb-5" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      {/* Room header */}
      <header className="glass mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          {roomCode && <CopyCodeChip code={roomCode} className="px-3 py-1.5" />}
          <span
            className="hidden items-center gap-1 text-xs text-muted-foreground lg:inline-flex"
            title="Copy the code to invite — your partner joins from the home screen"
          >
            <Copy className="h-3 w-3" /> invite
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:inline-flex">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-violet-500/25 text-[9px] font-bold text-violet-200">
              {me?.displayName.slice(0, 1).toUpperCase() ?? "Y"}
            </span>
            {me?.displayName ?? "You"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              other?.connected
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                : "border-border bg-secondary/60 text-muted-foreground"
            )}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-sky-500/25 text-[9px] font-bold text-sky-200">
              {other?.displayName.slice(0, 1).toUpperCase() ?? "?"}
            </span>
            {other ? other.displayName : "Waiting…"}
          </span>
          <span className="hidden sm:block">
            <NetworkMeter bytesIn={bytesIn} bytesOut={bytesOut} />
          </span>
          <StatusDot state={connection} showLabel={false} />
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmLeave(true)}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </header>

      {/* Banners */}
      {(connection === "reconnecting" || connection === "offline") && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-xs text-orange-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          Connection lost — your movie keeps playing locally. We&apos;re reconnecting and will resynchronise
          automatically; live sync can&apos;t be guaranteed during the outage.
        </div>
      )}

      {needsFileReselect && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-xs text-amber-200">
          <p className="mb-2 inline-flex items-center gap-2 font-medium">
            <TriangleAlert className="h-4 w-4" /> Re-select your movie file to continue watching
          </p>
          <p className="mb-3 text-amber-200/70">
            After a reload the browser no longer has access to your file. Pick the same copy — the fingerprint is
            verified instantly, then you&apos;ll jump back to the room&apos;s position.
          </p>
          <MovieFilePicker compact onVerified={(d) => void reannounceMovie(d)} />
        </div>
      )}

      {/* Main composition */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-4"
      >
        {/* Player column */}
        <section className="flex min-h-[38dvh] flex-col lg:min-h-0" aria-label="Movie player">
          <MoviePlayer objectUrl={objectUrl} movieName={movieName} compact />
        </section>

        {/* Chat column */}
        <section className="flex min-h-0 flex-1 flex-col lg:min-h-0" aria-label="Chat">
          <ChatPanel className="flex-1" />
        </section>
      </motion.div>

      <LeaveDialog open={confirmLeave} onOpenChange={setConfirmLeave} onConfirm={leave} roomCode={roomCode} />
    </div>
  );
}

function LeaveDialog({
  open,
  onOpenChange,
  onConfirm,
  roomCode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  roomCode: string | null;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave the room?</AlertDialogTitle>
          <AlertDialogDescription>
            Your partner keeps watching — you can rejoin with code{" "}
            <span className="font-mono text-violet-300">{roomCode}</span> and you&apos;ll resynchronise to the
            current position.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep watching</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-white hover:bg-destructive/90">
            Leave room
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
