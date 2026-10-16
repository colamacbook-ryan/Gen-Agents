// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_INSTALL_FAILURE_REASONS, EngineInstallStatus } from '@ga/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { type InstallOutcome, installEngine } from '../engine-source/client.ts';
import {
  buildArtifact,
  DEFAULT_ENGINES,
  type FakeEngineSource,
  INSTALL_SCENARIOS,
  startEngineSource,
} from '../engine-source/server.ts';
import { FAKES_DIR, tmp } from './helpers.ts';

let src: FakeEngineSource | undefined;
afterEach(async () => {
  await src?.close();
  src = undefined;
});

const setScenario = (s: FakeEngineSource, body: unknown) =>
  fetch(`${s.url}/_test/scenario`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Chuyển kết quả của máy khách tham chiếu sang `EngineInstallStatus` của contracts và kiểm hợp lệ. */
function asStatus(o: InstallOutcome): EngineInstallStatus {
  return EngineInstallStatus.parse(
    o.state === 'installed'
      ? { state: 'installed', version: o.version, installedAt: '2026-10-16T00:00:00Z' }
      : { state: 'failed', reason: o.reason, detail: o.detail },
  );
}

describe('engine-source: cài thành công', () => {
  it('manifest → tải có % tăng dần tới 100 → sha512 khớp → cài 0755 vào <dest>/<slug>/<version>/bin/<bin>', async () => {
    src = await startEngineSource({ fakesRoot: FAKES_DIR, scenario: { name: 'ok', chunkDelayMs: 5 } });
    const dest = tmp();
    const pcts: Array<number | null> = [];
    const r = await installEngine({
      baseUrl: src.url,
      slug: 'agy',
      destDir: dest,
      platform: 'linux_amd64',
      onProgress: (p) => pcts.push(p),
    });
    expect(r).toMatchObject({ state: 'installed', version: '1.3.5', path: join(dest, 'agy/1.3.5/bin/agy') });
    expect(asStatus(r).state).toBe('installed');
    expect(pcts.at(-1)).toBe(100);
    expect(new Set(pcts).size).toBeGreaterThanOrEqual(4); // có các mốc trung gian, không nhảy 0 → 100
    expect(pcts).toEqual([...pcts].sort((a, b) => (a as number) - (b as number)));
    if (r.state === 'installed') expect(statSync(r.path).mode & 0o777).toBe(0o755);
  });

  it('CLI cài xong CHẠY ĐƯỢC (launcher → CLI giả): đúng version Spike 1b cho cả hai engine; không còn tệp .part', async () => {
    src = await startEngineSource({ fakesRoot: FAKES_DIR });
    const dest = tmp();
    const out: Record<string, string> = {};
    for (const e of DEFAULT_ENGINES) {
      const r = await installEngine({ baseUrl: src.url, slug: e.slug, destDir: dest, platform: 'linux_arm64' });
      expect(r.state).toBe('installed');
      if (r.state === 'installed') {
        out[e.slug] = execFileSync(r.path, ['--version'], {
          encoding: 'utf8',
          env: { PATH: process.env.PATH ?? '', HOME: tmp() },
        });
        expect(existsSync(`${r.path}.part`)).toBe(false);
      }
    }
    expect(out).toEqual({ agy: '1.3.5\n', claude: '2.1.299 (Claude Code)\n' });
  });

  it('artefact: đúng dung lượng yêu cầu; launcher chỉ gọi node tới CLI giả; sha512 trong manifest khớp byte thật', async () => {
    src = await startEngineSource({ fakesRoot: '/opt/ga-fakes', scenario: { name: 'ok', sizeBytes: 100_000 } });
    const m = (await (await fetch(`${src.url}/agy/manifests/linux_amd64.json`)).json()) as {
      version: string;
      url: string;
      sha512: string;
    };
    const art = Buffer.from(await (await fetch(m.url)).arrayBuffer());
    expect(art.length).toBe(100_000);
    expect(createHash('sha512').update(art).digest('hex')).toBe(m.sha512);
    const head = art.subarray(0, 600).toString();
    expect(head).toMatch(/^#!\/bin\/sh\n# GA-FAKES-TEST-ONLY/);
    expect(head).toContain('GA_FAKE_LAUNCHER="$0"; export GA_FAKE_LAUNCHER');
    expect(head).toContain('exec "$n" "/opt/ga-fakes/agy/main.ts" "$@"');
    expect(
      art.equals(buildArtifact(DEFAULT_ENGINES[0] as (typeof DEFAULT_ENGINES)[number], '/opt/ga-fakes', 100_000)),
    ).toBe(true);
  });

  it('hiệu năng: tải artefact 8 MiB < 5 s', async () => {
    src = await startEngineSource({ fakesRoot: FAKES_DIR, scenario: { name: 'ok', sizeBytes: 8 * 1024 * 1024 } });
    const t0 = performance.now();
    const r = await installEngine({ baseUrl: src.url, slug: 'claude', destDir: tmp(), platform: 'linux_amd64' });
    expect(r.state).toBe('installed');
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe('engine-source: kịch bản lỗi → lý do của contracts', () => {
  const CASES: Array<[string, Record<string, unknown>, string]> = [
    ['domain_blocked', { name: 'domain_blocked' }, 'domain_blocked'],
    ['unsupported_arch', { name: 'unsupported_arch' }, 'unsupported_arch'],
    ['network (đứt giữa lúc tải)', { name: 'network' }, 'network'],
    ['network (đứt ngay ở manifest)', { name: 'network', failAt: 'manifest' }, 'network'],
    ['checksum_mismatch', { name: 'checksum_mismatch' }, 'checksum_mismatch'],
  ];
  for (const [label, sc, reason] of CASES) {
    it(`${label} ⇒ failed:${reason}, không cài gì`, async () => {
      src = await startEngineSource({ fakesRoot: FAKES_DIR, scenario: sc });
      const dest = tmp();
      const r = await installEngine({ baseUrl: src.url, slug: 'agy', destDir: dest, platform: 'linux_amd64' });
      expect(r).toMatchObject({ state: 'failed', reason });
      expect(asStatus(r)).toMatchObject({ state: 'failed', reason });
      expect((ENGINE_INSTALL_FAILURE_REASONS as readonly string[]).includes(reason)).toBe(true);
      expect(existsSync(join(dest, 'agy'))).toBe(false); // không có thư mục cài dở dang
    });
  }

  it('mỗi kịch bản lỗi của server ánh xạ ĐÚNG MỘT lý do khác nhau trong contracts (không thừa, không thiếu)', () => {
    const failing = INSTALL_SCENARIOS.filter((s) => s !== 'ok');
    expect([...failing].sort()).toEqual(['checksum_mismatch', 'domain_blocked', 'network', 'unsupported_arch']);
    for (const s of failing) expect(ENGINE_INSTALL_FAILURE_REASONS as readonly string[]).toContain(s);
  });

  it('nền tảng không hỗ trợ (kể cả khi kịch bản ok) ⇒ unsupported_arch; engine lạ ⇒ lý do unknown (404)', async () => {
    src = await startEngineSource({ fakesRoot: FAKES_DIR });
    const dest = tmp();
    expect(
      await installEngine({ baseUrl: src.url, slug: 'agy', destDir: dest, platform: 'linux_riscv64' }),
    ).toMatchObject({ state: 'failed', reason: 'unsupported_arch' });
    expect(
      await installEngine({ baseUrl: src.url, slug: 'no-such', destDir: dest, platform: 'linux_amd64' }),
    ).toMatchObject({ state: 'failed', reason: 'unsupported_arch' });
  });

  it('server không tới được ⇒ network; đổi kịch bản giữa chừng: lỗi rồi cài lại thành công (nút "Cài lại")', async () => {
    src = await startEngineSource({ fakesRoot: FAKES_DIR, scenario: { name: 'domain_blocked' } });
    const dest = tmp();
    expect((await installEngine({ baseUrl: src.url, slug: 'agy', destDir: dest, platform: 'linux_amd64' })).state).toBe(
      'failed',
    );
    expect((await setScenario(src, { name: 'ok' })).status).toBe(200);
    expect((await installEngine({ baseUrl: src.url, slug: 'agy', destDir: dest, platform: 'linux_amd64' })).state).toBe(
      'installed',
    );
    const url = src.url;
    await src.close();
    src = undefined;
    expect(await installEngine({ baseUrl: url, slug: 'agy', destDir: dest, platform: 'linux_amd64' })).toMatchObject({
      state: 'failed',
      reason: 'network',
    });
  });

  it('domain_blocked: 403 + header x-ga-egress (dấu hiệu cần chốt với ga-egress, ASSUMPTIONS ES-1)', async () => {
    src = await startEngineSource({ scenario: { name: 'domain_blocked' } });
    const r = await fetch(`${src.url}/agy/manifests/linux_amd64.json`);
    expect(r.status).toBe(403);
    expect(r.headers.get('x-ga-egress')).toBe('blocked');
  });

  it('sai checksum: server báo sha512 của bản gốc nhưng phục vụ byte đã lật 1 bit', async () => {
    src = await startEngineSource({ fakesRoot: FAKES_DIR, scenario: { name: 'checksum_mismatch', sizeBytes: 4096 } });
    const m = (await (await fetch(`${src.url}/agy/manifests/linux_amd64.json`)).json()) as {
      url: string;
      sha512: string;
    };
    const art = Buffer.from(await (await fetch(m.url)).arrayBuffer());
    expect(createHash('sha512').update(art).digest('hex')).not.toBe(m.sha512);
  });
});

describe('engine-source: ca âm cho các lối vào', () => {
  it('kịch bản lạ / tham số ngoài biên / JSON hỏng ⇒ 400; method khác GET trên đường tải ⇒ 405; đường lạ ⇒ 404', async () => {
    src = await startEngineSource();
    expect((await setScenario(src, { name: 'boom' })).status).toBe(400);
    expect((await setScenario(src, { name: 'ok', sizeBytes: 1 })).status).toBe(400);
    expect((await setScenario(src, { name: 'ok', chunkSize: 0 })).status).toBe(400);
    expect((await setScenario(src, { name: 'ok', chunkDelayMs: 999_999 })).status).toBe(400);
    expect((await fetch(`${src.url}/_test/scenario`, { method: 'POST', body: '{x' })).status).toBe(400);
    expect((await fetch(`${src.url}/agy/manifests/linux_amd64.json`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${src.url}/agy/dl/9.9.9/linux_amd64/agy`)).status).toBe(404);
    expect((await fetch(`${src.url}/agy/dl/1.3.5/linux_amd64/not-agy`)).status).toBe(404);
    expect((await fetch(`${src.url}/x`)).status).toBe(404);
  });

  it('/_test/requests ghi nhật ký; /_test/reset trả về mặc định', async () => {
    src = await startEngineSource({ fakesRoot: FAKES_DIR, scenario: { name: 'domain_blocked' } });
    await fetch(`${src.url}/agy/manifests/linux_amd64.json`);
    const log = (await (await fetch(`${src.url}/_test/requests`)).json()) as Array<{ path: string }>;
    expect(log.map((l) => l.path)).toEqual(['/agy/manifests/linux_amd64.json']);
    await fetch(`${src.url}/_test/reset`, { method: 'POST' });
    expect((await fetch(`${src.url}/agy/manifests/linux_amd64.json`)).status).toBe(200);
    expect(readFileSync(join(FAKES_DIR, 'agy/main.ts'), 'utf8').length).toBeGreaterThan(0);
  });
});
