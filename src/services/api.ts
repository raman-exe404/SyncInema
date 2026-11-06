// REST client. All requests go through the sandbox gateway using the
// XTransformPort query parameter — never absolute URLs or explicit ports.

const REST_PORT = 3004;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${path}${sep}XTransformPort=${REST_PORT}`, {
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
