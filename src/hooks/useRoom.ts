"use client";

// Room orchestration: create, join, leave, ready-up, playback requests,
// movie (re)selection — all thin wrappers over the wire protocol.

import { useCallback } from "react";
import { api } from "@/services/api";
import { emitSafe, joinRoom } from "@/services/socket";
import { currentIdentity } from "@/store/identityStore";
import { useRoomStore } from "@/store/roomStore";
import { usePlayerStore } from "@/store/playerStore";
import { useViewStore } from "@/store/viewStore";
import { useChatStore } from "@/store/chatStore";
import { playbackSync } from "@/hooks/usePlaybackSync";
import { activeSession, setSessionRoom, clearSession, updateSessionMovie, handleRoomLoss } from "@/hooks/useSocket";
import { toast } from "sonner";

export function useRoom() {
  const play = useCallback(() => {
    const positionMs = playbackSync.localPositionMs();
    emitSafe("PLAY_REQUEST", { positionMs });
  }, []);

  const pause = useCallback(() => {
    // The server snaps to the authoritative position on pause.
    emitSafe("PAUSE_REQUEST", { positionMs: playbackSync.localPositionMs() });
  }, []);

  const seek = useCallback((positionMs: number) => {
    emitSafe("SEEK_REQUEST", { positionMs: Math.max(0, Math.round(positionMs)) });
  }, []);

  const setReady = useCallback((isReady: boolean) => {
    emitSafe("USER_READY", { isReady });
  }, []);

  const createRoom = useCallback(async () => {
    const { userId, displayName } = currentIdentity();
    const res = await api.createRoom(userId, displayName);
    return res;
  }, []);

  const join = useCallback(
    async (roomCode: string, displayName: string) => {
      const { userId } = currentIdentity();
      const movie = usePlayerStore.getState().descriptor;
      const ack = await joinRoom({ roomCode: roomCode.toUpperCase(), userId, displayName, movie });
      if (ack.ok && ack.snapshot) {
        useRoomStore.getState().applySnapshot(ack.snapshot);
        setSessionRoom(ack.snapshot.roomCode, movie, displayName);
        useChatStore.getState().clear();
        if (ack.snapshot.playback) {
          playbackSync.adoptTimeline(ack.snapshot.playback);
          useRoomStore.getState().setNeedsFileReselect(!usePlayerStore.getState().descriptor);
        }
        useViewStore.getState().addRecentRoom({
          roomCode: ack.snapshot.roomCode,
          movieName: movie?.name ?? "Movie not selected yet",
          role: ack.snapshot.hostId === userId ? "host" : "guest",
          joinedAt: Date.now(),
        });
        useViewStore.getState().navigate(ack.snapshot.playback ? "watch" : "lobby");
      }
      return ack;
    },
    []
  );

  const leave = useCallback(() => {
    emitSafe("LEAVE_ROOM", {});
    clearSession();
    playbackSync.reset();
    useRoomStore.getState().reset();
    useChatStore.getState().clear();
    useViewStore.getState().navigate("home");
  }, []);

  /**
   * Re-announce a newly selected/verified movie to the room (join flow or
   * re-selection after a page reload).
   */
  const reannounceMovie = useCallback(
    async (descriptor: { name: string; size: number; durationMs: number; mime: string; hash: string }) => {
      updateSessionMovie(descriptor);
      if (!activeSession.roomCode) return null;
      const ack = await joinRoom({
        roomCode: activeSession.roomCode,
        userId: currentIdentity().userId,
        displayName: currentIdentity().displayName || activeSession.displayName,
        movie: descriptor,
      });
      if (ack.ok && ack.snapshot) {
        useRoomStore.getState().applySnapshot(ack.snapshot);
        useRoomStore.getState().setNeedsFileReselect(false);
        // Resume room playback with the freshly attached local file.
        if (ack.snapshot.playback) {
          playbackSync.adoptTimeline(ack.snapshot.playback);
        }
      } else if (ack.error) {
        toast.error(ack.error.message);
      }
      return ack;
    },
    []
  );

  return { play, pause, seek, setReady, createRoom, join, leave, reannounceMovie, handleRoomLoss };
}
