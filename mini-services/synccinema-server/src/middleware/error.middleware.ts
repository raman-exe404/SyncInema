import type { NextFunction, Request, Response } from "express";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  // MVP uses guest identity: userId is a client-generated UUID persisted in
  // localStorage and validated at the socket layer. When Supabase auth is
  // enabled, verify the JWT here and attach req.user.
  const userId = req.header("x-user-id");
  (req as Request & { userId?: string }).userId = userId && userId.length <= 64 ? userId : undefined;
  next();
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error("[synccinema-server] Unhandled error:", err);
  res.status(500).json({
    code: "SERVER_ERROR",
    message: "Something went wrong on the SyncCinema server. Please try again.",
  });
}
