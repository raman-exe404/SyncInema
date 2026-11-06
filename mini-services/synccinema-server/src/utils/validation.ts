import { z } from "zod";
import type { RoomErrorPayload } from "../types/socket.types";

export const movieDescriptorSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative().max(5 * 1024 ** 3),
  durationMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000),
  mime: z.string().max(128),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const roomJoinSchema = z.object({
  roomCode: z.string().min(6).max(12),
  userId: z.string().min(8).max(64),
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(32, "Display name must be 32 characters or fewer"),
  movie: movieDescriptorSchema.nullable(),
});

export const playbackPositionSchema = z.object({
  positionMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
});

export const userReadySchema = z.object({
  isReady: z.boolean(),
});

export const chatMessageSchema = z.object({
  text: z.string().trim().min(1, "Message cannot be empty").max(500),
  messageType: z.enum(["TEXT", "REACTION"]),
  moviePositionMs: z.number().int().min(0).nullable(),
});

export function toRoomError(message: string, code: RoomErrorPayload["code"] = "INVALID_PAYLOAD"): RoomErrorPayload {
  return { code, message };
}
