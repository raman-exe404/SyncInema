// Incremental SHA-256 in a Web Worker (js-sha256 streaming updates).
// The file is read in 4 MiB slices with File.slice() so we never load the
// whole movie into memory, and the UI thread stays free (spec §7).

import type { MovieDescriptor } from "@/types/synccinema";

export interface HashProgress {
  percent: number;
  hashHex: string | null;
}

const CHUNK_SIZE = 4 * 1024 * 1024;

export function hashMovieFile(
  file: File,
  onProgress: (p: HashProgress) => void
): Promise<MovieDescriptor> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./movieHash.worker.ts", import.meta.url), { type: "module" });

    const cleanup = () => worker.terminate();

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: "progress"; percent: number }
        | { type: "done"; hashHex: string }
        | { type: "error"; message: string };

      if (msg.type === "progress") {
        onProgress({ percent: msg.percent, hashHex: null });
      } else if (msg.type === "done") {
        cleanup();
        resolve({
          name: file.name,
          size: file.size,
          durationMs: 0, // filled in by the caller after metadata load
          mime: file.type || "video/mp4",
          hash: msg.hashHex,
        });
      } else {
        cleanup();
        reject(new Error(msg.message || "Hashing failed"));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(new Error(err.message || "Hashing worker crashed"));
    };

    worker.postMessage({ file, chunkSize: CHUNK_SIZE });
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
