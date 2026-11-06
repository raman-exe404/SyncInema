// REST client. In production, NEXT_PUBLIC_REST_URL points to the Render backend.
// Without it, requests fall back to the sandbox gateway using XTransformPort.

const REST_BASE = process.env.NEXT_PUBLIC_REST_URL ?? "";
const REST_PORT = 3004;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = REST_BASE
    ? `${REST_BASE}${path}`
    : (() => { const sep = path.includes("?") ? "&" : "?"; return `${path}${sep}XTransformPort=${REST_PORT}`; })();
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { message?: string }).message ?? `Request failed (${res.status})`);
    (err as Error & { code?: string; status?: number }).code = (data as { code?: string }).code;
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data as T;
}

export interface CreateRoomResponse {
  roomCode: string;
  roomId: string;
  expiresAt: number;
}

export const api = {
  createRoom: (userId: string, displayName: string) =>
    request<CreateRoomResponse>("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ userId, displayName }),
    }),
  getRoom: (code: string) => request<unknown>(`/api/rooms/${encodeURIComponent(code)}`),
};
