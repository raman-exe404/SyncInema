"use client";

// SyncCinema home: premium cinematic landing + dashboard. Hero, identity,
// create/join CTAs, how it works, low-bandwidth highlight, recent rooms,
// live connection indicator.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Download,
  Gauge,
  LogIn,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wifi,
  Film,
  MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/common/Logo";
import { StatusDot } from "@/components/common/StatusDot";
import { useIdentityStore } from "@/store/identityStore";
import { useViewStore } from "@/store/viewStore";
import { useRoomStore } from "@/store/roomStore";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export function HomeView() {
  const { displayName, setName } = useIdentityStore();
  const navigate = useViewStore((s) => s.navigate);
  const recentRooms = useViewStore((s) => s.recentRooms);
  const connection = useRoomStore((s) => s.connection);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [nameSaved, setNameSaved] = useState(!!displayName);
  const { canInstall, promptInstall } = useInstallPrompt();

  // Prefill join code when arriving from ?room=CODE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    if (code && /^[A-Za-z0-9]{6}$/.test(code)) {
      useViewStore.getState().setPendingJoinCode(code.toUpperCase());
    }
  }, []);

  const saveName = () => {
    const clean = nameDraft.trim().slice(0, 32);
    if (!clean) return;
    setName(clean);
    setNameSaved(true);
  };

  const proceed = (target: "create" | "join") => {
    if (nameDraft.trim() && nameDraft.trim() !== displayName) saveName();
    navigate(target);
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-16 pt-6 sm:px-6">
      {/* Top bar */}
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <StatusDot state={connection} />
          <button
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => navigate("settings")}
          >
            Settings
          </button>
        </div>
      </header>

      {/* Hero */}
      <motion.section
        {...fadeUp}
        transition={{ duration: 0.5 }}
        className="mt-16 flex flex-col items-center text-center sm:mt-24"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-200">
          <Sparkles className="h-3.5 w-3.5" />
          Two cities. One movie. Almost zero streaming data.
        </span>
        <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Your movie. Your person.
          <br />
          <span className="brand-gradient-text">One synchronized experience.</span>
        </h1>
        <p className="mt-5 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
          Both of you play your own downloaded copy of the movie. SyncCinema syncs play, pause and
          seek over a connection so light it barely registers — the film itself never touches the
          internet.
        </p>

        {/* Identity + CTAs */}
        <div className="mt-9 w-full max-w-md space-y-4">
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Input
              key={displayName}
              defaultValue={displayName}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setNameSaved(false);
              }}
              onBlur={() => nameDraft.trim() && saveName()}
              onKeyDown={(e) => e.key === "Enter" && nameDraft.trim() && saveName()}
              placeholder="Your display name (e.g. Aarav)"
              maxLength={32}
              className="h-12 flex-1 bg-secondary/60 text-center text-base sm:text-left"
              aria-label="Display name"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              onClick={() => proceed("create")}
              className="h-12 bg-gradient-to-r from-violet-600 to-violet-500 text-base font-medium shadow-[0_8px_30px_rgba(139,92,246,0.35)] transition-transform hover:scale-[1.02]"
            >
              <Film className="mr-2 h-5 w-5" />
              Create Room
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => proceed("join")}
              className="h-12 border border-border bg-secondary/60 text-base font-medium transition-transform hover:scale-[1.02]"
            >
              <LogIn className="mr-2 h-5 w-5" />
              Join Room
            </Button>
          </div>
          {nameDraft.trim() && nameSaved && (
            <p className="text-xs text-muted-foreground">
              You&apos;ll appear as <span className="font-medium text-violet-300">{nameDraft.trim()}</span>
            </p>
          )}
        </div>
      </motion.section>

      {/* How it works */}
      <motion.section {...fadeUp} transition={{ duration: 0.5, delay: 0.1 }} className="mt-20">
        <h2 className="text-center text-xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            { icon: Film, title: "Pick your copy", text: "Each person selects the same downloaded movie file on their device." },
            { icon: Users, title: "Share a code", text: "One creates a private room, the other joins with the six-character code." },
            { icon: ShieldCheck, title: "Verify match", text: "A SHA-256 fingerprint confirms both copies are identical — nothing is uploaded." },
            { icon: MessageSquareText, title: "Watch & chat", text: "Playback starts at the same instant for both. Chat while you watch." },
          ].map((s, i) => (
            <Card key={s.title} className="border-border/70 bg-card/40">
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500/15">
                    <s.icon className="h-4 w-4 text-violet-300" />
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">STEP {i + 1}</span>
                </div>
                <p className="mt-3 text-sm font-medium">{s.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* Low bandwidth highlight */}
      <motion.section {...fadeUp} transition={{ duration: 0.5, delay: 0.15 }} className="mt-6">
        <Card className="overflow-hidden border-violet-500/20 bg-gradient-to-br from-violet-950/40 via-card/60 to-sky-950/30">
          <CardContent className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-violet-500/15 shadow-[0_0_36px_rgba(139,92,246,0.3)]">
              <Gauge className="h-7 w-7 text-violet-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold">Built for weak connections, not data centers</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                A full movie night consumes roughly the same as a few chat messages — kilobytes, not
                gigabytes. Only play/pause/seek commands and text travel over the wire, on one
                persistent WebSocket. The room even shows you the exact payload bytes used.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-1 sm:gap-2">
              {[
                { v: "0 GB", l: "movie streamed" },
                { v: "KB", l: "per movie night" },
                { v: "1", l: "live connection" },
              ].map((x) => (
                <div key={x.l} className="rounded-lg bg-secondary/50 px-3 py-2 sm:px-4">
                  <p className="text-lg font-bold text-violet-300">{x.v}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{x.l}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* Recent rooms */}
      {recentRooms.length > 0 && (
        <motion.section {...fadeUp} transition={{ duration: 0.5, delay: 0.2 }} className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recently joined rooms
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recentRooms.slice(0, 4).map((r) => (
              <button
                key={r.roomCode + r.joinedAt}
                onClick={() => useViewStore.getState().setPendingJoinCode(r.roomCode) || navigate("join")}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 p-3.5 text-left transition-colors hover:border-violet-500/40 hover:bg-card/70"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary/70">
                  <Film className="h-4 w-4 text-violet-300/80" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.movieName}</span>
                  <span className="block text-xs text-muted-foreground">
                    Room <span className="font-mono text-violet-300">{r.roomCode}</span> ·{" "}
                    {r.role === "host" ? "hosted" : "joined"} {new Date(r.joinedAt).toLocaleDateString()}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* Install + privacy footer */}
      <motion.footer {...fadeUp} transition={{ duration: 0.5, delay: 0.25 }} className="mt-auto pt-12">
        <div className="flex flex-col items-center gap-4 text-center">
          {canInstall && (
            <Button variant="outline" onClick={promptInstall} className="gap-2 border-violet-500/30 text-violet-200">
              <Download className="h-4 w-4" />
              Install SyncCinema on this device
            </Button>
          )}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5" /> Installable as an app
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5" /> One persistent connection
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Your files never leave your device
            </span>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
