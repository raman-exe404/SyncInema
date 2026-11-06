"use client";

// Join room: six-character code + display name + own local movie copy →
// compatibility check happens automatically once both descriptors are known.

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MovieFilePicker } from "@/components/common/MovieFilePicker";
import { useIdentityStore } from "@/store/identityStore";
import { useViewStore } from "@/store/viewStore";
import { useRoom } from "@/hooks/useRoom";
import type { MovieDescriptor } from "@/types/synccinema";

export function JoinRoomView() {
  const displayName = useIdentityStore((s) => s.displayName);
  const setName = useIdentityStore((s) => s.setName);
  const navigate = useViewStore((s) => s.navigate);
  const pendingCode = useViewStore((s) => s.pendingJoinCode);
  const { join } = useRoom();
  // pendingJoinCode is always set *before* navigating here, so the
  // initializer picks it up — no effect/state-sync needed.
  const [code, setCode] = useState(pendingCode);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [movie, setMovie] = useState<MovieDescriptor | null>(null);
  const [phase, setPhase] = useState<"idle" | "joining">("idle");
  const [error, setError] = useState<string | null>(null);

  const codeClean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  const handleJoin = async () => {
    const clean = nameDraft.trim().slice(0, 32);
    if (codeClean.length !== 6) {
      setError("Enter the full six-character room code.");
      return;
    }
    if (!clean) {
      setError("Enter your display name.");
      return;
    }
    if (!movie) {
      setError("Select your copy of the movie before joining.");
      return;
    }
    setError(null);
    setName(clean);
    setPhase("joining");
    const ack = await join(codeClean, clean);
    setPhase("idle");
    if (!ack.ok && ack.error) {
      setError(ack.error.message);
    }
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-12 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("home")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-8">
        <h1 className="text-2xl font-bold tracking-tight">Join a room</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the code your partner shared, then select your own copy of the same movie file.
        </p>

        <Card className="mt-6 border-border/70 bg-card/50">
          <CardContent className="space-y-5 p-6">
            <div className="space-y-2">
              <label htmlFor="room-code" className="text-sm font-medium">
                Room code
              </label>
              <Input
                id="room-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g, "").slice(0, 6))}
                placeholder="e.g. 7KX2M9"
                autoFocus
                className="h-14 bg-secondary/60 text-center font-mono text-2xl font-bold tracking-[0.4em] uppercase"
                maxLength={6}
                inputMode="text"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="guest-name" className="text-sm font-medium">
                Display name
              </label>
              <Input
                id="guest-name"
                key={displayName}
                defaultValue={displayName}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="e.g. Meera"
                maxLength={32}
                className="h-11 bg-secondary/60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Your local copy of the movie</label>
              <MovieFilePicker onVerified={(d) => setMovie(d)} compact />
              <p className="text-xs text-muted-foreground">
                Identical files are verified by fingerprint — different encodes will be rejected before playback.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              size="lg"
              onClick={handleJoin}
              disabled={phase === "joining" || !movie}
              className="h-12 w-full bg-gradient-to-r from-violet-600 to-violet-500 font-medium shadow-[0_8px_30px_rgba(139,92,246,0.3)]"
            >
              {phase === "joining" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining room…
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" /> Join room
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
