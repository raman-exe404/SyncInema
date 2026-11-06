"use client";

// Waiting lobby: participants, movie compatibility verification, readiness,
// and the guarded start button. Playback is impossible until both users are
// ready AND their file fingerprints match (spec §3, §7).

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Copy,
  Crown,
  Film,
  Loader2,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MovieFilePicker } from "@/components/common/MovieFilePicker";
import { CopyCodeChip } from "@/components/common/CopyCodeChip";
import { StatusDot } from "@/components/common/StatusDot";
import { useRoomStore } from "@/store/roomStore";
import { useIdentityStore } from "@/store/identityStore";
import { usePlayerStore } from "@/store/playerStore";
import { useViewStore } from "@/store/viewStore";
import { useRoom } from "@/hooks/useRoom";
import { formatBytes } from "@/services/movieHash";
import type { ParticipantInfo } from "@/types/synccinema";

function ParticipantCard({ p, isMe }: { p: ParticipantInfo; isMe: boolean }) {
  return (
    <Card className={`border-border/70 bg-card/50 transition-colors ${p.connected ? "" : "opacity-60"}`}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-violet-500/30 to-sky-500/20 text-sm font-bold text-violet-100">
            {p.displayName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              {p.displayName}
              {p.isHost && <Crown className="h-3.5 w-3.5 text-amber-400" />}
              {isMe && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
            </p>
            <p className="text-xs text-muted-foreground">{p.connected ? "in the room" : "reconnecting…"}</p>
          </div>
          {p.isReady ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2.5 py-1 text-xs text-muted-foreground">
              <Circle className="h-3 w-3" /> Not ready
            </span>
          )}
        </div>
        <div className="rounded-xl bg-secondary/40 px-3.5 py-2.5">
          {p.movie ? (
            <p className="flex items-center gap-2 truncate text-xs text-muted-foreground">
              <Film className="h-3.5 w-3.5 shrink-0 text-violet-300/80" />
              <span className="truncate text-foreground/80">{p.movie.name}</span>
              <span className="shrink-0">· {formatBytes(p.movie.size)}</span>
            </p>
          ) : (
            <p className="text-xs text-amber-400">No movie selected yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function LobbyView() {
  const { roomCode, participants, compatibility, connection } = useRoomStore();
  const myUserId = useIdentityStore((s) => s.userId);
  const localDescriptor = usePlayerStore((s) => s.descriptor);
  const navigate = useViewStore((s) => s.navigate);
  const { leave, setReady, play, reannounceMovie } = useRoom();

  const me = useMemo(() => participants.find((p) => p.userId === myUserId), [participants, myUserId]);
  const other = useMemo(() => participants.find((p) => p.userId !== myUserId), [participants, myUserId]);
  const bothConnected = participants.length === 2 && participants.every((p) => p.connected);
  const bothReady = participants.length === 2 && participants.every((p) => p.isReady);
  const matched = compatibility === "MATCH" && !!localDescriptor;
  const canStart = bothReady && matched && bothConnected;

  const compatibilityUi = () => {
    if (compatibility === "MATCH") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-xs font-medium text-emerald-400">
          <ShieldCheck className="h-4 w-4" /> Identical files verified
        </span>
      );
    }
    if (compatibility === "MISMATCH") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3.5 py-1.5 text-xs font-medium text-red-400">
          <ShieldAlert className="h-4 w-4" /> Different files — the fingerprints don&apos;t match
        </span>
      );
    }
    if (compatibility === "MISSING") {
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3.5 py-1.5 text-xs font-medium text-amber-400">
          <TriangleAlert className="h-4 w-4" /> Someone still needs to pick a movie
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3.5 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for your partner…
      </span>
    );
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-10 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("home")}>
          <ArrowLeft className="h-4 w-4" /> Home
        </Button>
        <StatusDot state={connection} />
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Waiting lobby</p>
          {roomCode && <CopyCodeChip code={roomCode} />}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Copy className="h-3 w-3" /> Send this code — your partner joins from the home screen
          </p>
        </div>

        {compatibilityUi()}

        {compatibility === "MISMATCH" && (
          <Card className="border-red-500/30 bg-red-500/[0.06]">
            <CardContent className="space-y-2 p-4 text-sm">
              <p className="font-medium text-red-300">You and your partner have different files</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The SHA-256 fingerprints differ, so this is not the same encode (or the same movie).
                Both of you should re-select the <span className="text-foreground">same downloaded file</span> —
                check the file name and size match. Playback stays locked until they match.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {participants.map((p) => (
            <ParticipantCard key={p.userId} p={p} isMe={p.userId === myUserId} />
          ))}
          {participants.length < 2 && (
            <Card className="border-dashed border-border/60 bg-transparent">
              <CardContent className="flex h-full min-h-44 flex-col items-center justify-center gap-2 p-5 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-violet-400/70" />
                <p className="text-sm text-muted-foreground">Waiting for your partner to join…</p>
                <p className="text-xs text-muted-foreground/70">Share the code above</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Re-select / late selection */}
        {me && !me.movie && (
          <Card className="border-amber-500/25 bg-amber-500/[0.05]">
            <CardContent className="p-5">
              <p className="text-sm font-medium">Select your movie to continue</p>
              <div className="mt-3">
                <MovieFilePicker
                  compact
                  onVerified={(d) => void reannounceMovie(d)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant={me?.isReady ? "secondary" : "outline"}
            size="lg"
            onClick={() => setReady(!me?.isReady)}
            disabled={!me}
            className={`h-12 flex-1 border ${
              me?.isReady ? "border-emerald-500/40 text-emerald-400" : "border-violet-500/40 text-violet-200"
            }`}
          >
            {me?.isReady ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Circle className="mr-2 h-4 w-4" />}
            {me?.isReady ? "I'm ready" : "Mark me ready"}
          </Button>
          <Button
            size="lg"
            onClick={play}
            disabled={!canStart}
            className="h-12 flex-1 bg-gradient-to-r from-violet-600 to-violet-500 font-medium shadow-[0_8px_30px_rgba(139,92,246,0.3)] disabled:opacity-40"
          >
            {canStart ? (
              <>Start together</>
            ) : (
              <>
                <Loader2 className="mr-2 h-4 w-4" />
                {!bothConnected
                  ? "Waiting for partner…"
                  : !matched
                    ? "Files must match first"
                    : "Both must be ready"}
              </>
            )}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={leave}
          className="mx-auto gap-2 text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" /> Leave room
        </Button>
      </motion.div>
    </div>
  );
}
