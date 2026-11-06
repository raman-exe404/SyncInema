import { Router } from "express";
import { prisma } from "../config/supabase";

const router = Router();

router.get("/health", async (_req, res) => {
  let db = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "unreachable";
  }
  res.json({
    status: "ok",
    service: "synccinema-server",
    db,
    time: new Date().toISOString(),
    note: "Movie files never transit this server — only control events and chat.",
  });
});

export default router;
