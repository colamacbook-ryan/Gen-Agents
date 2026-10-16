// Luồng phụ tính argon2id (hash-wasm, WASM thuần — không binary native). Chạy ngoài event loop chính để một lần băm
// (~200 ms với tham số ARGON2ID) không chặn API / SSE / scheduler. Chỉ nhận đúng một dạng thông điệp; không log gì.
import { parentPort } from 'node:worker_threads';
import { argon2id } from 'hash-wasm';

interface HashRequest {
  id: number;
  password: Uint8Array;
  salt: Uint8Array;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
}

const port = parentPort;
if (!port) throw new Error('argon2-worker chỉ chạy trong worker_threads');

port.on('message', async (m: HashRequest) => {
  try {
    const hash = await argon2id({
      password: m.password,
      salt: m.salt,
      memorySize: m.memoryKiB,
      iterations: m.iterations,
      parallelism: m.parallelism,
      hashLength: m.hashLength,
      outputType: 'binary',
    });
    m.password.fill(0);
    port.postMessage({ id: m.id, ok: true, hash }, [hash.buffer as ArrayBuffer]);
  } catch (e) {
    m.password.fill(0);
    port.postMessage({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
