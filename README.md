# SyncCinema

**Your movie. Your person. One synchronized experience.**
*Two cities. One movie. Almost zero movie-streaming data.*

SyncCinema lets two people in different cities watch the same movie at
practically the same time — **without streaming the movie over the internet**.
Both users play their own locally downloaded copy. A lightweight real-time
server coordinates play / pause / seek / sync and relays chat. Movie files
never leave the devices.

---

## How it works

```
┌───────────────┐        small JSON events         ┌───────────────┐
│  User A       │ ──── PLAY_REQUEST ────────────▶  │               │
│  local file ──┤ ◀─── PLAY_AT(startAtServerMs) ── │  Sync server  │
│  HTML5 video  │        (+ chat relay)            │  (authoritative│
│               │                                  │   timeline)   │
└───────────────┘                                  └───────┬───────┘
                                                            │
┌───────────────┐        small JSON events                  │
│  User B       │ ◀─── PLAY_AT(startAtServerMs) ────────────┘
│  local file   │ ──── STATE_REPORT / CHAT_MESSAGE ────────▶
│  HTML5 video  │
└───────────────┘
   Movie bytes: 0 over the wire. Payload for a whole movie night: kilobytes.
```

1. **Create room** → host picks their local file, gets a private six-character
   code (unambiguous alphabet, `crypto.getRandomValues`).
2. **Join** → partner enters the code and picks their own copy of the movie.
3. **Verify** → each client computes a **SHA-256 fingerprint** of its file in a
   Web Worker (4 MiB chunks, `File.slice()`, never buffered, never uploaded).
   Playback is impossible until both fingerprints are identical.
4. **Ready → scheduled start** → any participant presses Start. The server
   validates, computes `startAtServerMs = now + 2.5 s`, and broadcasts
   `PLAY_AT`. Both clients convert the server instant to local time using an
   NTP-style clock offset (min-RTT of 6 samples) and start simultaneously.
5. **Watch & chat** → drift correction keeps both locked:
   | drift | action |
   | --- | --- |
   | < 100 ms | none (normal rate) |
   | 100–500 ms | gentle `playbackRate` nudging, restored when aligned |
   | > 500 ms | controlled seek |

### Wire protocol (Socket.IO)

`PLAY_REQUEST` · `PAUSE_REQUEST` · `SEEK_REQUEST` · `PLAY_AT` · `PAUSE_AT` ·
`SEEK_TO` · `STATE_UPDATE` · `STATE_REPORT` · `SYNC_PING` · `SYNC_PONG` ·
`SYNC_STATUS` · `DRIFT`-related `STATE_REPORT.driftMs` · `USER_READY` ·
`USER_CONNECTED` · `USER_DISCONNECTED` · `USER_RECONNECTED` (session restore) ·
`CHAT_MESSAGE` · `CHAT_HISTORY` · `ROOM_STATE` · `ROOM_EXPIRED` · `ROOM_ERROR`

The server keeps the **authoritative timeline in memory**
(`positionMs + (now − anchorServerMs) × rate`), validates every event, snaps
pauses to the authoritative position, and aggregates honest sync-quality
reports. `SYNCED` is only broadcast when two connected clients both report
inside tolerance — the UI never fakes it.

Bandwidth: one persistent WebSocket per client, heartbeats only, tiny JSON
payloads. The room header shows **actual application-level payload bytes**
(sent/received) measured on the socket engine — clearly excluding TCP/TLS
overhead, and video bytes are always zero.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router, single-route SPA), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Lucide, Framer Motion, Zustand |
| Realtime backend | Node-style service (Bun runtime), Express (REST), Socket.IO (WebSocket), TypeScript |
| Database | Prisma + SQLite in the sandbox; **Supabase PostgreSQL schema + RLS provided** in `supabase/schema.sql` for production |
| Movie verification | `js-sha256` incremental hashing inside a Web Worker |
| PWA | `manifest.webmanifest`, service worker (`public/sw.js`), generated icons, install prompt |

> **Sandbox note:** this preview environment exposes one port through a
> gateway. The frontend runs on Next.js 16 (instead of Vite) and reaches the
> backend via `?XTransformPort=` (REST `:3004`, Socket.IO `:3003`). The
> application code is portable: the socket layer lives in one module
> (`src/services/socket.ts`) and the backend is a standard Express + Socket.IO
> server (`mini-services/synccinema-server`) that can be deployed as-is to
> Render/Railway behind HTTPS.

---

## Project layout

```
├── mini-services/synccinema-server/     # real-time backend (independent service)
│   ├── src/
│   │   ├── config/env.ts                # runtime config, no hardcoded secrets
│   │   ├── config/supabase.ts           # Prisma client (swap for Supabase in prod)
│   │   ├── routes/                      # room.routes.ts, health.routes.ts
│   │   ├── controllers/                 # room.controller.ts
│   │   ├── services/                    # room / sync / chat services
│   │   ├── sockets/                     # socket.server wiring + event handlers
│   │   ├── middleware/                  # auth + error middleware
│   │   ├── utils/                       # room-code.ts, validation.ts (zod)
│   │   └── types/                       # wire protocol + domain types
│   └── prisma/schema.prisma             # rooms / room_participants / messages
├── src/                                 # frontend
│   ├── components/                      # home / room / watch / player / chat / common
│   ├── hooks/                           # useSocket, usePlaybackSync (sync engine),
│   │                                    # useMoviePlayer, useChat, useRoom
│   ├── services/                        # socket.ts, api.ts, movieHash(.worker).ts
│   ├── store/                           # zustand: identity, room, player, chat, views
│   └── types/synccinema.ts              # client mirror of the wire protocol
├── supabase/schema.sql                  # production tables + RLS policies
├── public/                              # manifest, service worker, icons
└── scripts/smoke-test.ts                # wire-protocol test (19 checks)
```

---

## Running locally

```bash
# 1. backend (port 3003 socket / 3004 REST)
cd mini-services/synccinema-server
bun install
bunx prisma db push
bun run dev

# 2. frontend (Next.js on 3000)
cd ../..
bun install
bun run lint      # code quality
bun run dev       # http://localhost:3000
```

Open the app in two different browsers (or two devices on the same network),
create a room in one, join with the code in the other, pick the **same file**
in both, ready up, and press Start together.

### Environment variables (backend)

| Variable | Purpose |
| --- | --- |
| `PORT` / `REST_PORT` | Socket.IO (3003) / Express (3004) — set by the platform |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | optional; enables Supabase persistence in production (server-side only, never exposed to the frontend) |
| `CORS_ORIGINS` | allowed origins (default `*` for the sandbox gateway) |
| `DEBUG_SYNC=1` | verbose sync-event logging |

## Production deployment (spec §2)

1. **Frontend → Vercel**: deploy the Next.js app; point the socket module at
   your backend URL (`wss://…`).
2. **Backend → Render/Railway**: deploy `mini-services/synccinema-server`
   (`bun run start`), enable HTTPS/WSS.
3. **Database → Supabase**: run `supabase/schema.sql` in the SQL editor; set
   the two Supabase env vars on the backend. RLS limits message reads/inserts
   to room participants.
4. Serve everything over HTTPS; Socket.IO upgrades to WSS automatically.

## Privacy & security

- Movie files are **never uploaded, streamed, proxied, or logged** — hashing
  and playback are 100 % local.
- All room events validated server-side (zod); rooms cap at two participants;
  six-character private codes; chat rate-limited (8 messages / 10 s, 500 chars).
- Guest identity = random UUID + display name in `localStorage` (MVP). Supabase
  Auth can be layered in without changing the wire protocol.
- Secrets only in environment variables; the service-role key never reaches
  the frontend.

## Honest limitations (by design, spec §16, §20)

- **Codec support** depends on the browser (MP4/H.264 plays everywhere Chrome
  does; MKV may not). The app warns at selection time instead of promising.
- **PWA file handles are not permanent**: after a reload the file must be
  re-picked (the fingerprint makes this instant); object URLs are revoked on
  replacement.
- **During an outage**, each side keeps playing locally and reconnects with
  exponential backoff; the app explicitly does not promise perfect sync while
  the internet is down.
- Android background playback / screen sleep: keep the app in the foreground
  during the movie; a screen wake-lock is requested where available.

## Verification performed

- `scripts/smoke-test.ts` — 19 wire-protocol checks (invalid code, room full,
  mismatch guard, scheduled `PLAY_AT` parity, authoritative pause, seek,
  chat relay + rate limit, byte accounting, disconnect notice, session
  restore) — **all passing**.
- Two-browser end-to-end run (isolated sessions, real Web Worker hashing of
  the same file, mobile + desktop viewports): room create → join → hash match
  → ready gate → scheduled start → **~50 ms drift**, pause identical to the
  hundredth of a second, chat + reactions + timestamp-jump seek, reload
  recovery with file re-selection.
