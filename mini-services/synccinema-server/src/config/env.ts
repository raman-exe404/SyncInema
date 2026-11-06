// Central runtime configuration. Secrets come from env vars only — never hardcoded.

export const env = {
  /** Single port — Express REST + Socket.IO share one http.Server (required by Render). */
  port: Number(process.env.PORT ?? 3003),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigins: process.env.CORS_ORIGINS ?? "*",
  /** Supabase service connection (production). When absent the server runs
   *  with Prisma/SQLite persistence only — RLS then enforced at app layer. */
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  chat: {
    maxMessageLength: 500,
    /** sliding-window rate limit per user */
    rateLimitMax: 8,
    rateLimitWindowMs: 10_000,
  },
  rooms: {
    maxParticipants: 2,
    ttlMs: 12 * 60 * 60 * 1000,
  },
  sync: {
    startBufferMs: 2500,
    seekBufferMs: 900,
    /** periodic authoritative status broadcast */
    statusBroadcastMs: 3000,
    /** aggregate sync-quality thresholds (spec §8) */
    syncedToleranceMs: 100,
    correctingThresholdMs: 500,
    unstableRttMs: 1200,
  },
};
