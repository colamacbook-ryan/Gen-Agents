import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { RunnerRoots } from '../src/paths.ts';

export const FAKE_CLI = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url));
export const ACCOUNT = 'EN-0001';
export const TURN_ID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
/** 43 ký tự base64url (32 byte) — dựng lúc chạy, không phải bí mật. */
export const TICKET = 'T'.repeat(43);

export interface Sandbox {
  base: string;
  roots: RunnerRoots;
  authDir: string;
  cleanup(): void;
}

/** Thư mục gốc giả: run/ (tmpfs), auth/EN-0001/, engines/bin/fake-cli → bản cài giả. */
export function sandbox(): Sandbox {
  const base = mkdtempSync(join(tmpdir(), 'ga-runner-'));
  const roots = { run: join(base, 'run'), auth: join(base, 'auth'), engines: join(base, 'engines') };
  mkdirSync(roots.run, { mode: 0o700 });
  const authDir = join(roots.auth, ACCOUNT);
  mkdirSync(authDir, { recursive: true, mode: 0o700 });
  mkdirSync(join(roots.engines, 'fake', '1.0.0'), { recursive: true });
  copyFileSync(FAKE_CLI, join(roots.engines, 'fake', '1.0.0', 'fake-cli'));
  chmodSync(join(roots.engines, 'fake', '1.0.0', 'fake-cli'), 0o755);
  symlinkSync('1.0.0', join(roots.engines, 'fake', 'current'));
  return { base, roots, authDir, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

export class Capture extends Writable {
  data = '';
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
    this.data += chunk.toString('utf8');
    cb();
  }
  lines(): string[] {
    return this.data.split('\n').filter((l) => l.length > 0);
  }
  json(): Record<string, unknown>[] {
    return this.lines().flatMap((l) => {
      try {
        return [JSON.parse(l) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
  }
}

export function stdinOf(text: string | null): PassThrough {
  const s = new PassThrough();
  if (text !== null) s.end(text);
  return s;
}
