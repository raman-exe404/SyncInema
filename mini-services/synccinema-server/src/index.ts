import express from "express";
import cors from "cors";
import http from "http";
import type { ClientToServerEvents, ServerToClientEvents } from "./types/socket.types";
import { Server as SocketServer } from "socket.io";
import { env } from "./config/env";
import { authMiddleware, errorMiddleware } from "./middleware/error.middleware";
import roomRoutes from "./routes/room.routes";
import healthRoutes from "./routes/health.routes";
import { registerSocketHandlers } from "./sockets/socket.handlers";
import { prisma } from "./config/supabase";

const app = express();
app.use(cors({ origin: env.corsOrigins, methods: ["GET", "POST"] }));
app.use(express.json({ limit: "16kb" })); // payloads are tiny by design
app.use(authMiddleware);

app.use("/api", healthRoutes);
app.use("/api", roomRoutes);

app.use((_req, res) => {
  res.status(404).json({ code: "NOT_FOUND", message: "Unknown API route." });
});

app.use(errorMiddleware);

// REST listener (room validation, chat history fallback, health).
const restServer = http.createServer(app);
restServer.listen(env.restPort, () => {
  console.log(`[synccinema-server] REST API listening on :${env.restPort}`);
});

// Real-time listener: Socket.IO serves at path "/" so the sandbox gateway
// (Caddy) can forward via the XTransformPort query parameter.
const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(env.port, {
  path: "/",
  cors: { origin: env.corsOrigins, methods: ["GET", "POST"] },
  pingInterval: 25_000,
  pingTimeout: 60_000,
});

registerSocketHandlers(io);

console.log(`[synccinema-server] Socket.IO listening on :${env.port} (${env.nodeEnv})`);
console.log("[synccinema-server] movie files are never uploaded — control + chat only");

async function shutdown() {
  console.log("[synccinema-server] shutting down…");
  io.close();
  restServer.close();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
