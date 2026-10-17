// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGoDuration } from '../lib/common.ts';
import {
  interpretReply,
  parseScenario,
  readScenario,
  SCENARIO_NAMES,
  scenarioHeader,
  vendorReply,
} from '../lib/scenario.ts';
import { FAKES_DIR, tmp } from './helpers.ts';

describe('kịch bản (biến kịch bản)', () => {
  it('không đặt gì ⇒ null (= ok, không gửi header kịch bản); tên trần; JSON có tham số; tệp được đọc LẠI mỗi lần', () => {
    expect(readScenario({})).toBeNull();
    expect(readScenario({ GA_FAKE_SCENARIO: ' ' })).toBeNull();
    expect(readScenario({ GA_FAKE_SCENARIO: 'outage' })).toEqual({ name: 'outage' });
    expect(readScenario({ GA_FAKE_SCENARIO: '{"name":"quota_exhausted","resetAt":"2026-10-16T19:00:00Z"}' })).toEqual({
      name: 'quota_exhausted',
      resetAt: '2026-10-16T19:00:00Z',
    });
    const file = join(tmp(), 'scenario.json');
    writeFileSync(file, '{"name":"login_expired"}');
    const env = { GA_FAKE_SCENARIO_FILE: file, GA_FAKE_SCENARIO: 'ok' };
    expect(readScenario(env)?.name).toBe('login_expired'); // tệp thắng env
    writeFileSync(file, '{"name":"account_suspended"}');
    expect(readScenario(env)?.name).toBe('account_suspended'); // đổi giữa lượt, không cần khởi động lại
    expect(readScenario({ GA_FAKE_SCENARIO_FILE: join(tmp(), 'chua-co'), GA_FAKE_SCENARIO: 'outage' })?.name).toBe(
      'outage',
    ); // chưa có tệp ⇒ rơi về env
  });

  it('ca âm: tên lạ / sai kiểu / ngoài biên ⇒ ném lỗi rõ ràng (không nuốt cấu hình sai)', () => {
    const bad: unknown[] = [
      null,
      'ok',
      {},
      { name: 5 },
      { name: 'khong-co' },
      { name: 'outage', status: 200 },
      { name: 'outage', status: 'x' },
      { name: 'quota_exhausted', resetAt: 'hôm qua' },
      { name: 'slow', delayMs: -1 },
      { name: 'ok', script: 'x' },
      { name: 'ok', script: { calls: [{ args: {} }] } },
    ];
    for (const b of bad) expect(() => parseScenario(b), JSON.stringify(b)).toThrow();
    expect(() => readScenario({ GA_FAKE_SCENARIO: '{không phải json' })).toThrow();
  });

  it('đủ các kịch bản trong BUILD-PLAN §C.2 + đăng nhập bỏ dở + mất mạng', () => {
    expect([...SCENARIO_NAMES].sort()).toEqual(
      [
        'account_suspended',
        'hang',
        'identity_changed',
        'login_abandoned',
        'login_expired',
        'malformed_json',
        'network_down',
        'ok',
        'outage',
        'quota_exhausted',
        'slow',
        'version_drift',
      ].sort(),
    );
  });

  it('vendorReply: bảng trạng thái; interpretReply đọc lại đúng; thân hỏng ⇒ malformed (không ném)', () => {
    const ctx = { account: 'a', model: null, promptChars: 8, nowMs: 0 };
    const r = (s: unknown) => vendorReply(parseScenario(s), ctx);
    expect(r({ name: 'ok' }).status).toBe(200);
    expect(r({ name: 'hang' })).toMatchObject({ hang: true });
    expect(r({ name: 'slow' }).delayMs).toBe(3000);
    expect(r({ name: 'slow', delayMs: 7 }).delayMs).toBe(7);
    const q = r({ name: 'quota_exhausted', resetAt: '2026-10-16T19:00:00Z' });
    expect(interpretReply(q.status, q.body)).toMatchObject({
      kind: 'error',
      code: 'quota_exhausted',
      http: 429,
      resetAt: '2026-10-16T19:00:00Z',
    });
    expect(interpretReply(r({ name: 'ok' }).status, r({ name: 'ok' }).body)).toMatchObject({
      kind: 'ok',
      account: 'a',
    });
    expect(interpretReply(200, '{"ok":true,"text":"cắt')).toMatchObject({ kind: 'malformed' });
    expect(interpretReply(200, '[]')).toMatchObject({ kind: 'malformed' });
    expect(interpretReply(502, '<html>bad gateway</html>')).toMatchObject({ kind: 'malformed' });
    expect(interpretReply(200, '{"ok":false}')).toMatchObject({ kind: 'malformed' });
  });

  it('parseGoDuration', () => {
    expect(parseGoDuration('30s')).toBe(30_000);
    expect(parseGoDuration('1h30m')).toBe(5_400_000);
    expect(parseGoDuration('500ms')).toBe(500);
    expect(parseGoDuration('0')).toBe(0);
    expect(parseGoDuration('abc')).toBeNull();
    expect(parseGoDuration('10')).toBeNull();
    expect(parseGoDuration('')).toBeNull();
  });
});

function serve(args: string[]): Promise<{ url: string; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [join(FAKES_DIR, 'serve.ts'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const t = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('serve.ts không in dòng nghe trong 10 s'));
    }, 10_000);
    child.stdout.on('data', (c: Buffer) => {
      buf += c.toString();
      if (buf.includes('\n')) {
        clearTimeout(t);
        resolve({
          url: (JSON.parse(buf.split('\n')[0] as string) as { url: string }).url,
          stop: () => child.kill('SIGTERM'),
        });
      }
    });
    child.on('exit', (code) => {
      clearTimeout(t);
      reject(new Error(`serve.ts thoát sớm (${code}): ${buf}`));
    });
  });
}

describe('serve.ts (chạy máy chủ giả độc lập cho compose test)', () => {
  it('telegram: in một dòng JSON rồi phục vụ', async () => {
    const s = await serve(['telegram', '--port', '0']);
    try {
      const r = await fetch(`${s.url}/bot1:abc/getMe`, { method: 'POST' });
      expect(((await r.json()) as { ok: boolean }).ok).toBe(true);
    } finally {
      s.stop();
    }
  });

  it('vendor với --scenario; update-feed ghi khoá công khai ra tệp; engine-source nhận --fakes-root', async () => {
    const v = await serve(['vendor', '--scenario', 'outage']);
    const pubOut = join(tmp(), 'minisign.pub');
    const f = await serve(['update-feed', '--pubkey-out', pubOut]);
    const e = await serve(['engine-source', '--fakes-root', '/opt/x']);
    try {
      expect((await fetch(`${v.url}/v1/turn`, { method: 'POST', body: '{}' })).status).toBe(503);
      expect(readFileSync(pubOut, 'utf8')).toBe(await (await fetch(`${f.url}/minisign.pub`)).text());
      const m = (await (await fetch(`${e.url}/agy/manifests/linux_amd64.json`)).json()) as { url: string };
      const art = await (await fetch(m.url)).text();
      expect(art).toContain('"/opt/x/agy/main.ts" "$@"');
    } finally {
      v.stop();
      f.stop();
      e.stop();
    }
  });

  it('ca âm: dịch vụ lạ / thiếu đối số ⇒ exit 2 + hướng dẫn; kịch bản lạ ⇒ thoát lỗi (không chạy với cấu hình sai)', async () => {
    const run = (args: string[]) =>
      new Promise<{ code: number | null; err: string }>((resolve) => {
        const c = spawn('node', [join(FAKES_DIR, 'serve.ts'), ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        c.stderr.on('data', (d: Buffer) => {
          err += d.toString();
        });
        c.on('close', (code) => resolve({ code, err }));
      });
    expect(await run(['khong-co'])).toMatchObject({ code: 2 });
    expect((await run([])).err).toContain('dùng: serve.ts');
    expect((await run(['vendor', '--scenario', 'no_such_scenario'])).code).not.toBe(0);
  });
});

describe('header kịch bản gửi fake-vendor', () => {
  it('chỉ chứa phần vendor cần, luôn ASCII (script tiếng Việt không làm hỏng header)', () => {
    const h = scenarioHeader(
      parseScenario({ name: 'ok', script: { reply: 'Đã ghi.', calls: [] }, exitAfterLogin: true }),
    );
    expect(h).toBe('{"name":"ok"}');
    const q = scenarioHeader(
      parseScenario({ name: 'quota_exhausted', resetAt: '2026-10-16T19:00:00Z', script: { reply: 'ừ' } }),
    );
    expect(JSON.parse(q)).toEqual({ name: 'quota_exhausted', resetAt: '2026-10-16T19:00:00Z' });
    expect(/^[\x20-\x7e]*$/.test(q)).toBe(true);
  });
});
