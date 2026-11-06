"use client";

// Central socket wiring. Mounted once in the app shell; routes every server
// event into the Zustand stores, the sync engine, and view transitions.
// Reconnection re-joins the room with the same guest userId so the server
// restores the previous session (spec §8 Disconnect Behaviour).

import { useEffect, useRef } from "react";
import { connect, joinRoom, emitSafe, getSocket } from "@/services/socket";
import { currentIdentity } from "@/store/identityStore";
import { useRoomStore } from "@/store/roomStore";
import { useChatStore } from "@/store/chatStore";
import { useViewStore } from "@/store/viewStore";
import { usePlayerStore } from "@/store/playerStore";
import { playbackSync } from "@/hooks/usePlaybackSync";
import { toast } from "sonner";
import type { MovieDescriptor } from "@/types/synccinema";

interface ActiveSession {
  roomCode: string | null;
  movie: MovieDescriptor | null;
  displayName: string;
  joined: boolean;
}

export const activeSession: ActiveSession = {
  roomCode: null,
  movie: null,
  displayName: "",
  joined: false,
};

export function setSessionRoom(roomCode: string, movie: MovieDescriptor | null, displayName: string) {
  activeSession.roomCode = roomCode;
  activeSession.movie = movie;
  activeSession.displayName = displayName;
  activeSession.joined = true;
  if (typeof window !== "undefined") localStorage.setItem("synccinema.activeRoom", roomCode);
}

export function clearSession() {
  activeSession.roomCode = null;
  activeSession.joined = false;
  if (typeof window !== "undefined") localStorage.removeItem("synccinema.activeRoom");
}

export function updateSessionMovie(movie: MovieDescriptor | null) {
  activeSession.movie = movie;
}

let bindingInitialised = false;

export function useSocket() {
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current || bindingInitialised) return;
    initialised.current = true;
    bindingInitialised = true;

    const room = useRoomStore.getState();
    const views = useViewStore.getState();

    connect({
      onConnect: () => {
        room.setConnection("online");
        // Reconnect recovery: server keeps the last known playback state and
        // this client re-claims its seat with the same userId.
        if (activeSession.joined && activeSession.roomCode) {
          rejoinCurrentRoom();
        } else if (typeof window !== "undefined") {
          // Page-reload recovery: restore the previous session from storage.
          const stored = localStorage.getItem("synccinema.activeRoom");
          if (stored) {
            activeSession.roomCode = stored;
            rejoinCurrentRoom();
          }
        }
      },
      onDisconnect: (reason) => {
        room.setConnection(reason === "io client disconnect" ? "offline" : "reconnecting");
      },
      onReconnectAttempt: () => {
        room.setConnection("reconnecting");
      },

      onRoomState: (snapshot) => {
        const wasActive = useRoomStore.getState().roomStatus === "ACTIVE";
        room.applySnapshot(snapshot);
        if (views.view === "join" && snapshot.participants.length > 0) {
          useViewStore.getState().navigate("lobby");
        }
        // If the other user already started watching and we just recovered.
        if (wasActive === false && snapshot.status === "ACTIVE" && views.view === "lobby") {
          useViewStore.getState().navigate("watch");
        }
      },

      onPlayAt: (p) => {
        playbackSync.handlePlayAt(p);
        room.setNeedsFileReselect(false);
        if (useViewStore.getState().view !== "watch") {
          useViewStore.getState().navigate("watch");
        }
      },
      onPauseAt: (p) => playbackSync.handlePauseAt(p),
      onSeekTo: (p) => playbackSync.handleSeekTo(p),
      onSyncStatus: (p) => room.setSyncStatus(p),
      onPeerState: (p) =>
        room.setPeerPosition({
          userId: p.userId,
          positionMs: p.positionMs,
          playing: p.playing,
          at: Date.now(),
        }),

      onChatMessage: (m) => {
        const view = useViewStore.getState().view;
        const isMine = m.senderId === currentIdentity().userId;
        useChatStore.getState().addMessage(m, isMine, view === "watch");
      },
      onChatHistory: (messages) => useChatStore.getState().setHistory(messages),

      onUserConnected: ({ displayName, reconnected }) => {
        if (reconnected) toast.success(`${displayName} reconnected.`);
      },
      onUserDisconnected: ({ displayName }) => {
        toast.warning(`${displayName} lost connection. Their movie keeps playing.`);
      },
      onUserLeft: ({ displayName }) => {
        toast.warning(`${displayName} left the room.`);
      },

      onRoomExpired: ({ reason }) => {
        toast.error(reason);
        handleRoomLoss();
      },
      onRoomError: (p) => {
        room.setLastError(p.code, p.message);
        toast.error(p.message);
        if (p.code === "INVALID_ROOM" || p.code === "ROOM_EXPIRED") {
          handleRoomLoss();
        }
      },
    });

    return () => {
      // App shell never unmounts in this SPA; binding persists.
    };
  }, []);
}

function rejoinCurrentRoom() {
  const code = activeSession.roomCode;
  if (!code) return;
  const displayName = currentIdentity().displayName || activeSession.displayName;
  const descriptor = usePlayerStore.getState().descriptor;
  joinRoom({ roomCode: code, userId: currentIdentity().userId, displayName, movie: descriptor }).then((ack) => {
    if (ack.ok && ack.snapshot) {
      activeSession.joined = true;
      activeSession.displayName = displayName;
      useRoomStore.getState().applySnapshot(ack.snapshot);
      useChatStore.getState().clear();
      if (ack.snapshot.playback) {
        playbackSync.adoptTimeline(ack.snapshot.playback);
        useRoomStore.getState().setNeedsFileReselect(!descriptor);
      }
      useViewStore.getState().navigate(ack.snapshot.status === "ACTIVE" || ack.snapshot.playback ? "watch" : "lobby");
      toast.success("Session restored.");
    } else {
      localStorage.removeItem("synccinema.activeRoom");
      if (ack.error && ack.error.code !== "SERVER_ERROR") {
        toast.error(ack.error.message);
      }
    }
  });
}

export function handleRoomLoss() {
  clearSession();
  useRoomStore.getState().reset();
  useChatStore.getState().clear();
  playbackSync.reset();
  useViewStore.getState().navigate("home");
}

export function leaveRoomNow() {
  emitSafe("LEAVE_ROOM", {});
  const code = activeSession.roomCode;
  handleRoomLoss();
  return code;
}

export function reconnectSocket() {
  getSocket()?.connect();
}
