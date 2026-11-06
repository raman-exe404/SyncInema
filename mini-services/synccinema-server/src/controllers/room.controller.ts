// Room REST controller. Used by the frontend for pre-socket operations:
// validate a code before joining, fetch room info, fetch chat history.

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/supabase";
import { buildSnapshot, createRoom, getRoomByCode } from "../services/room.service";
import { getRecentMessages } from "../services/chat.service";
import { normalizeRoomCode, isValidRoomCode } from "../utils/room-code";
import { toRoomError } from "../utils/validation";
import { z } from "zod";

const createRoomSchema = z.object({
  userId: z.string().min(8).max(64),
  displayName: z.string().trim().min(1).max(32),
});

export async function createRoomHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(toRoomError(parsed.error.issues[0]?.message ?? "Invalid request"));
    }
    const { userId, displayName } = parsed.data;
    const room = await createRoom(userId, displayName, null);
    res.status(201).json({ roomCode: room.roomCode, roomId: room.id, expiresAt: room.expiresAt });
  } catch (err) {
    next(err);
  }
}

export async function getRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const code = normalizeRoomCode(String(req.params.code ?? ""));
    if (!isValidRoomCode(code)) {
      return res.status(400).json(toRoomError("Room codes are six letters and digits.", "INVALID_ROOM"));
    }
    const room = getRoomByCode(code);
    if (!room) {
      // Maybe the in-memory room was lost (server restart) — recover from DB if not expired.
      const dbRoom = await prisma.room.findUnique({ where: { roomCode: code } }).catch(() => null);
      if (!dbRoom || dbRoom.status === "EXPIRED" || dbRoom.expiresAt.getTime() < Date.now()) {
        return res.status(404).json(toRoomError("No room was found with that code.", "INVALID_ROOM"));
      }
      return res.status(409).json({
        code: "SERVER_ERROR",
        message: "This room exists but its live session was lost. Ask the host to recreate it.",
      });
    }
    res.json(buildSnapshot(room));
  } catch (err) {
    next(err);
  }
}

export async function getRoomMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const code = normalizeRoomCode(String(req.params.code ?? ""));
    const room = getRoomByCode(code);
    if (!room) {
      return res.status(404).json(toRoomError("No room was found with that code.", "INVALID_ROOM"));
    }
    const messages = await getRecentMessages(room.id);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}
