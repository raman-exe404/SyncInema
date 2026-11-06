/**
 * SyncCinema backend smoke test — simulates two clients over the real wire protocol:
 * invalid join, create, join, room-full guard, clock sync, mismatch guard,
 * scheduled PLAY_AT, authoritative pause, seek, chat + rate limit, sync status,
 * byte accounting, disconnect notice, session restore on reconnect.
 */
import { io, Socket } from "socket.io-client";

const URL = "http://localhost:3003";
const WAIT = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const MOVIE_A = {
  name: "test-movie.mp4",
  size: 1_460_000_000,
  durationMs: 7_212_000,
  mime: "video/mp4",
  hash: "a".repeat(64),
};

async function main() {
  const stepLog = (s: string) => console.log(`    … ${s}`);
  setTimeout(() => {
    console.log("GLOBAL TIMEOUT — hanging test");
    process.exit(2);
  }, 20_000);
  const host: Socket = io(URL, { transports: ["websocket"], path: "/" });
  const guest: Socket = io(URL, { transports: ["websocket"], path: "/" });

  await Promise.all([
    new Promise((r) => host.on("connect", r)),
    new Promise((r) => guest.on("connect", r)),
  ]);
  check("both sockets connected", host.connected && guest.connected);
  stepLog("step1 invalid join");

  // 1. Invalid join
  const badJoin = await new Promise<any>((r) => {
    host.emit("JOIN_ROOM", { roomCode: "ZZZZZZ", userId: "host-user-0001", displayName: "Host", movie: MOVIE_A }, r);
  });
  check("invalid room code rejected", badJoin.ok === false && badJoin.error?.code === "INVALID_ROOM");
  stepLog("step2 create via REST");

  // 2. Create room via REST
  const created = await fetch("http://localhost:3004/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "host-user-0001", displayName: "Host" }),
  }).then((r) => r.json());
  check("room created via REST", !!created.roomCode, `code=${created.roomCode}`);
  const code = created.roomCode as string;
  stepLog("step3 host joins");

  // 3. Host joins real code
  const hostJoin = await new Promise<any>((r) => {
    host.emit("JOIN_ROOM", { roomCode: code, userId: "host-user-0001", displayName: "Host", movie: MOVIE_A }, r);
  });
  check("host joined", hostJoin.ok === true && hostJoin.snapshot?.participants?.length === 1);
  stepLog("step4 guest join + room full");

  // 4. Guest joins, then third participant is rejected (room full guard)
  const guestJoin = await new Promise<any>((r) => {
    guest.emit("JOIN_ROOM", { roomCode: code, userId: "guest-user-002", displayName: "Guest", movie: MOVIE_A }, r);
  });
  const third: Socket = io(URL, { transports: ["websocket"], path: "/" });
  await new Promise((r) => third.on("connect", r));
  const fullJoin = await new Promise<any>((r) => {
    third.emit("JOIN_ROOM", { roomCode: code, userId: "intruder-user-01", displayName: "Third", movie: MOVIE_A }, r);
  });
  check("guest joined (2 participants)", guestJoin.ok === true);
  check("third participant rejected", fullJoin.ok === false && fullJoin.error?.code === "ROOM_FULL");
  third.disconnect();
  stepLog("step5 clock sync");

  // 5. Clock sync
  const t0 = Date.now();
  const pong = await new Promise<any>((r) => {
    host.once("SYNC_PONG", r);
    host.emit("SYNC_PING", { t0 });
  });
  const rtt = Date.now() - pong.t0;
  const offset = (pong.t1 - pong.t0 + pong.t2 - pong.t0) / 2;
  check("SYNC_PONG echoes t0", pong.t0 === t0);
  check("clock offset small in-process", Math.abs(offset) < 50, `offset=${offset.toFixed(1)}ms rtt=${rtt}ms`);
  stepLog("step6 mismatch guard");

  // 6. Ready + mismatch guard (host ready, guest movie hash differs)
  const MOVIE_B = { ...MOVIE_A, hash: "b".repeat(64) };
  const guestRejoinB = new Promise<any>((r) => guest.emit("JOIN_ROOM", { roomCode: code, userId: "guest-user-002", displayName: "Guest", movie: MOVIE_B }, r));
  await guestRejoinB;
  host.emit("USER_READY", { isReady: true });
  guest.emit("USER_READY", { isReady: true });
  await WAIT(150);

  const playErr = await new Promise<any>((r) => {
    host.once("ROOM_ERROR", r);
    host.emit("PLAY_REQUEST", { positionMs: 0 });
  });
  check("mismatched movie blocks playback", playErr?.code === "PLAYBACK_CONFLICT", JSON.stringify(playErr));
  stepLog("step7 scheduled play");

  // 7. Matching movie → scheduled PLAY_AT
  await new Promise<any>((r) => guest.emit("JOIN_ROOM", { roomCode: code, userId: "guest-user-002", displayName: "Guest", movie: MOVIE_A }, r));
  await WAIT(150);
  const guestPlayAt = new Promise<any>((r) => guest.once("PLAY_AT", r));
  const hostPlayAt = new Promise<any>((r) => host.once("PLAY_AT", r));
  host.emit("PLAY_REQUEST", { positionMs: 12_000 });
  const [hp, gp] = await Promise.all([hostPlayAt, guestPlayAt]);
  const buffer = gp.startAtServerMs - gp.serverTimeMs;
  check("PLAY_AT broadcast to both", !!hp && !!gp);
  check("scheduled start ~2.5s in future", buffer > 2000 && buffer <= 3000, `buffer=${buffer}ms`);
  check("identical schedule for both", hp.startAtServerMs === gp.startAtServerMs);
  stepLog("step8 pause");

  // 8. Pause with authoritative position
  await WAIT(400);
  const guestPause = new Promise<any>((r) => guest.once("PAUSE_AT", r));
  guest.emit("PAUSE_REQUEST", { positionMs: 999_999 });
  const pause = await guestPause;
  check("PAUSE_AT uses authoritative position", pause.positionMs < 999_999, `pos=${pause.positionMs}`);
  stepLog("step9 seek");

  // 9. Seek while paused applies immediately
  const hostSeek = new Promise<any>((r) => host.once("SEEK_TO", r));
  guest.emit("SEEK_REQUEST", { positionMs: 60_000 });
  const seek = await hostSeek;
  check("SEEK_TO immediate when paused", seek.startAtServerMs === null && seek.positionMs === 60_000);
  stepLog("step10 chat");

  // 10. Chat + rate limit
  const guestMsg = new Promise<any>((r) => guest.once("CHAT_MESSAGE", r));
  host.emit("CHAT_MESSAGE", { text: "hello from host", messageType: "TEXT", moviePositionMs: 60_500 });
  const msg = await guestMsg;
  check("chat relayed in real time", msg.messageText === "hello from host" && msg.moviePositionMs === 60_500);
  stepLog("step10b flood");

  const rateErrPromise = new Promise<any>((r) => host.once("ROOM_ERROR", r));
  for (let i = 0; i < 12; i++) {
    host.emit("CHAT_MESSAGE", { text: `flood ${i}`, messageType: "TEXT", moviePositionMs: null });
    await WAIT(40);
  }
  const rateErr = await Promise.race([rateErrPromise, WAIT(3000).then(() => null)]);
  check("chat rate limiting kicks in", rateErr?.code === "RATE_LIMITED", JSON.stringify(rateErr));
  stepLog("step11 sync status");

  // 11. Sync status broadcast + byte accounting
  const status = await new Promise<any>((r) => host.once("SYNC_STATUS", r));
  check("SYNC_STATUS broadcast", typeof status.serverTimeMs === "number");
  check(
    "byte accounting present",
    typeof status.bytesIn === "number" && status.bytesIn > 0,
    `in=${status.bytesIn}B out=${status.bytesOut}B`
  );
  stepLog("step12 disconnect");

  // 12. Disconnect notice
  const guestDisc = new Promise<any>((r) => guest.once("USER_DISCONNECTED", r));
  host.disconnect();
  const disc = await guestDisc;
  check("USER_DISCONNECTED broadcast", disc.userId === "host-user-0001");
  stepLog("step13 reconnect");

  // 13. Reconnect restores session
  const host2: Socket = io(URL, { transports: ["websocket"], path: "/" });
  await new Promise((r) => host2.on("connect", r));
  const rejoin = await new Promise<any>((r) => {
    host2.emit("JOIN_ROOM", { roomCode: code, userId: "host-user-0001", displayName: "Host", movie: MOVIE_A }, r);
  });
  check("reconnect restores session", rejoin.ok === true && rejoin.snapshot?.participants?.length === 2);

  guest.disconnect();
  host2.disconnect();

  console.log(failures === 0 ? "\nALL BACKEND SMOKE TESTS PASSED" : `\n${failures} test(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
