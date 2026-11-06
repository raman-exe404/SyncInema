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
app.use(express.json({ limit: "16kb" }));
app.use(authMiddleware);

app.use("/api", healthRoutes);
app.use("/api", roomRoutes);

app.use((_req, res) => {
  res.status(404).json({ code: "NOT_FOUND", message: "Unknown API route." });
});

app.use(errorMiddleware);

// Single HTTP server — Express + Socket.IO on the same port.
const httpServer = http.createServer(app);

const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  path: "/socket.io",
  cors: { origin: env.corsOrigins, methods: ["GET", "POST"] },
  pingInterval: 25_000,
  pingTimeout: 60_000,
});

registerSocketHandlers(io);

const port = env.port; // use PORT env var (Render sets this automatically)

httpServer.listen(port, () => {
  console.log(`[synccinema-server] listening on :${port} (REST + Socket.IO)`);
  console.log(`[synccinema-server] env: ${env.nodeEnv}`);
  console.log("[synccinema-server] movie files are never uploaded — control + chat only");
});

async function shutdown() {
  console.log("[synccinema-server] shutting down…");
  io.close();
  httpServer.close();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
