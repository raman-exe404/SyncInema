// Chat service: validation, rate limiting and persistence.
// Only text + small metadata is ever relayed (spec §9 Chat Data Optimisation).

import { prisma } from "../config/supabase";
import { env } from "../config/env";
import type { ChatMessageRecord, ChatMessagePayload } from "../types/socket.types";
import type { ServerRoom } from "../types/room.types";

const sendLog = new Map<string, number[]>(); // `${roomCode}:${userId}` -> timestamps

function rateLimited(roomCode: string, userId: string): boolean {
  const key = `${roomCode}:${userId}`;
  const now = Date.now();
  const window = (sendLog.get(key) ?? []).filter((t) => now - t < env.chat.rateLimitWindowMs);
  if (window.length >= env.chat.rateLimitMax) {
    sendLog.set(key, window);
    return true;
  }
  window.push(now);
  sendLog.set(key, window);
  return false;
}

export type ChatResult =
  | { ok: true; message: ChatMessageRecord }
  | { ok: false; error: "RATE_LIMITED" | "DB_ERROR" };

export async function handleChatMessage(
  room: ServerRoom,
  userId: string,
  senderName: string,
  payload: ChatMessagePayload
): Promise<ChatResult> {
  if (rateLimited(room.roomCode, userId)) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const position =
    payload.moviePositionMs ??
    (room.timeline ? Math.round(room.timeline.playing ? Date.now() : room.timeline.anchorServerMs) : null);

  try {
    const saved = await prisma.message.create({
      data: {
        roomId: room.id,
        senderId: userId,
        senderName,
        messageText: payload.text,
        messageType: payload.messageType,
        moviePositionMs: payload.moviePositionMs,
      },
    });
    return {
      ok: true,
      message: {
        id: saved.id,
        roomId: room.id,
        senderId: saved.senderId,
        senderName: saved.senderName,
        messageText: saved.messageText,
        messageType: saved.messageType as ChatMessageRecord["messageType"],
        moviePositionMs: saved.moviePositionMs,
        createdAt: saved.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, error: "DB_ERROR" };
  }
}

export async function systemMessage(room: ServerRoom, text: string): Promise<ChatMessageRecord> {
  const saved = await prisma.message
    .create({
      data: {
        roomId: room.id,
        senderId: "system",
        senderName: "System",
        messageText: text,
        messageType: "SYSTEM",
      },
    })
    .catch(() => null);
  return {
    id: saved?.id ?? `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roomId: room.id,
    senderId: "system",
    senderName: "System",
    messageText: text,
    messageType: "SYSTEM",
    moviePositionMs: null,
    createdAt: saved?.createdAt.toISOString() ?? new Date().toISOString(),
  };
}

export async function getRecentMessages(roomId: string, limit = 100): Promise<ChatMessageRecord[]> {
  const rows = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse().map((m) => ({
    id: m.id,
    roomId: m.roomId,
    senderId: m.senderId,
    senderName: m.senderName,
    messageText: m.messageText,
    messageType: m.messageType as ChatMessageRecord["messageType"],
    moviePositionMs: m.moviePositionMs,
    createdAt: m.createdAt.toISOString(),
  }));
}

export function chatLimits() {
  return { max: env.chat.rateLimitMax, windowMs: env.chat.rateLimitWindowMs, maxLength: env.chat.maxMessageLength };
}
