// SyncCinema hashing worker: streams the selected local file through an
// incremental SHA-256 (js-sha256) without ever buffering the whole movie.

import { sha256 } from "js-sha256";

interface StartMessage {
  file: File;
  chunkSize: number;
}

self.onmessage = async (e: MessageEvent<StartMessage>) => {
  const { file, chunkSize } = e.data;
  try {
    const hasher = sha256.create();
    let offset = 0;
    let lastPost = 0;

    while (offset < file.size) {
      const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const buf = await slice.arrayBuffer();
      hasher.update(new Uint8Array(buf));
      offset += buf.byteLength;

      const now = Date.now();
      if (now - lastPost > 120 || offset >= file.size) {
        lastPost = now;
        (self as unknown as Worker).postMessage({
          type: "progress",
          percent: Math.min(100, Math.round((offset / file.size) * 100)),
        });
      }
      // Yield to keep the worker responsive.
      await new Promise((r) => setTimeout(r, 0));
    }

    (self as unknown as Worker).postMessage({ type: "done", hashHex: hasher.hex() });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Could not read the file",
    });
  }
};
