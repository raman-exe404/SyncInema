"use client";

// App shell: mounts the socket binding once, registers the service worker,
// shows ambient cinematic backdrop, switches between SPA views with subtle
// Framer Motion transitions.

import { useEffect, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSocket } from "@/hooks/useSocket";
import { useIdentityStore } from "@/store/identityStore";
import { useViewStore } from "@/store/viewStore";
import { HomeView } from "@/components/home/HomeView";
import { CreateRoomView } from "@/components/room/CreateRoomView";
import { JoinRoomView } from "@/components/room/JoinRoomView";
import { LobbyView } from "@/components/room/LobbyView";
import { WatchRoomView } from "@/components/watch/WatchRoomView";
import { SettingsView } from "@/components/settings/SettingsView";

export function SyncCinemaApp() {
  useSocket();
  const view = useViewStore((s) => s.view);

  // Restore guest identity + recent rooms before any socket traffic. Layout
  // effect runs before the passive effect that opens the socket connection.
  useLayoutEffect(() => {
    useIdentityStore.getState().hydrate();
    useViewStore.getState().hydrate();
  }, []);

  // Service worker registration (PWA installability + offline shell).
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="ambient-glow" aria-hidden="true" />
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="relative z-10"
        >
          {view === "home" && <HomeView />}
          {view === "create" && <CreateRoomView />}
          {view === "join" && <JoinRoomView />}
          {view === "lobby" && <LobbyView />}
          {view === "watch" && <WatchRoomView />}
          {view === "settings" && <SettingsView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
