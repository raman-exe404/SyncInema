"use client";

// Create room: name → local movie → generate private six-character code →
// copy/share → waiting lobby entry.

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MovieFilePicker } from "@/components/common/MovieFilePicker";
import { CopyCodeChip } from "@/components/common/CopyCodeChip";
import { useIdentityStore } from "@/store/identityStore";
import { useViewStore } from "@/store/viewStore";
import { useRoom } from "@/hooks/useRoom";
import type { MovieDescriptor } from "@/types/synccinema";

export function CreateRoomView() {
  const displayName = useIdentityStore((s) => s.displayName);
  const setName = useIdentityStore((s) => s.setName);
  const navigate = useViewStore((s) => s.navigate);
  const { createRoom, join } = useRoom();
  const [nameDraft, setNameDraft] = useState(displayName);
  const [movie, setMovie] = useState<MovieDescriptor | null>(null);
  const [phase, setPhase] = useState<"idle" | "creating" | "created">("idle");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const clean = nameDraft.trim().slice(0, 32);
    if (!clean) {
      setError("Enter your display name first.");
      return;
    }
    if (!movie) {
      setError("Select your local movie file before creating the room.");
      return;
    }
    setError(null);
    setName(clean);
    setPhase("creating");
    try {
      const res = await createRoom();
      setRoomCode(res.roomCode);
      const ack = await join(res.roomCode, clean);
      if (!ack.ok) {
        setError(ack.error?.message ?? "Could not open the room.");
        setPhase("idle");
        return;
      }
      setPhase("created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Room creation failed. Try again.");
      setPhase("idle");
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
        <h1 className="text-2xl font-bold tracking-tight">Create a private room</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Host picks the movie first. Your partner selects their own copy when they join with the code.
        </p>

        {!roomCode ? (
          <Card className="mt-6 border-border/70 bg-card/50">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <label htmlFor="host-name" className="text-sm font-medium">
                  Display name
                </label>
                <Input
                  id="host-name"
                  key={displayName}
                  defaultValue={displayName}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="e.g. Aarav"
                  maxLength={32}
                  className="h-11 bg-secondary/60"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Your local movie</label>
                <MovieFilePicker onVerified={(d) => setMovie(d)} />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                size="lg"
                onClick={handleCreate}
                disabled={phase === "creating" || !movie}
                className="h-12 w-full bg-gradient-to-r from-violet-600 to-violet-500 font-medium shadow-[0_8px_30px_rgba(139,92,246,0.3)]"
              >
                {phase === "creating" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating room…
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" /> Create private room
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-6 border-violet-500/30 bg-card/60">
            <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
              <p className="text-sm text-muted-foreground">Room is live. Share this code with your person:</p>
              <CopyCodeChip code={roomCode} />
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                They open SyncCinema, tap <span className="text-violet-300">Join Room</span>, enter this code and
                select their copy of the same file. You&apos;ll meet in the lobby.
              </p>
              <Button onClick={() => navigate("lobby")} className="gap-2 bg-gradient-to-r from-violet-600 to-violet-500">
                Go to lobby <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
