// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configCandidates, FAKES_ROOT, fakeEnv } from '../lib/config.ts';
import { defaultTicketFile } from '../lib/toolscript.ts';
import { cliEnv, runCli, tmp } from './helpers.ts';

const write = (dir: string, content: unknown) => {
  const f = join(dir, 'c.json');
  writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content));
  return f;
};

describe('cấu hình CLI giả qua tệp (runner tự dựng env từ adapter, GA_FAKE_* có thể không tới được)', () => {
  it('thứ tự tìm tệp: GA_FAKE_CONFIG_FILE → /etc/ga-fakes/config.json → <gốc fakes>/config.json', () => {
    expect(configCandidates({ GA_FAKE_CONFIG_FILE: '/x/c.json' })).toEqual([
      '/x/c.json',
      '/etc/ga-fakes/config.json',
      join(FAKES_ROOT, 'config.json'),
    ]);
    expect(configCandidates({})).toHaveLength(2);
  });

  it('tệp là MẶC ĐỊNH, env thật thắng; không có tệp ⇒ trả nguyên env', () => {
    const f = write(tmp(), {
      GA_FAKE_SCENARIO: 'outage',
      GA_FAKE_VENDOR_URL: 'http://v:1',
      HTTP_PROXY: 'http://p:3128',
    });
    const e = fakeEnv({ GA_FAKE_CONFIG_FILE: f, GA_FAKE_SCENARIO: 'ok', HOME: '/h' });
    expect(e).toMatchObject({
      GA_FAKE_SCENARIO: 'ok',
      GA_FAKE_VENDOR_URL: 'http://v:1',
      HTTP_PROXY: 'http://p:3128',
      HOME: '/h',
    });
    const base = { GA_FAKE_CONFIG_FILE: join(tmp(), 'chua-co.json'), A: '1' };
    expect(fakeEnv(base)).toBe(base);
  });

  it('ca âm: JSON hỏng / không phải object / khoá lạ (vd PATH, GENAGENTS_MASTER_KEY) / giá trị không phải chuỗi ⇒ ném lỗi', () => {
    const dir = tmp();
    const bad: unknown[] = [
      '{không json',
      '[]',
      '"x"',
      { PATH: '/x' },
      { GENAGENTS_MASTER_KEY: 'k' },
      { GA_FAKE_SCENARIO: 5 },
      { ga_fake_x: 'a' },
    ];
    for (const b of bad) expect(() => fakeEnv({ GA_FAKE_CONFIG_FILE: write(dir, b) }), JSON.stringify(b)).toThrow();
  });

  it('CLI với tệp cấu hình hỏng thoát 70 + thông báo rõ (không chạy với cấu hình test sai)', async () => {
    const env = cliEnv(tmp(), { GA_FAKE_CONFIG_FILE: write(tmp(), { PATH: '/x' }) });
    for (const cli of ['agy', 'claude'] as const) {
      const r = await runCli(cli, ['--version'], { env });
      expect(r.code).toBe(70);
      expect(r.stderr).toContain('lỗi cấu hình');
      expect(r.stderr).toContain('khoá không được phép: PATH');
    }
  });

  it('CLI đọc kịch bản từ tệp cấu hình khi env rỗng; đổi tệp ⇒ lượt sau đổi theo', async () => {
    const home = tmp();
    const dir = tmp();
    const f = join(dir, 'c.json');
    writeFileSync(f, JSON.stringify({ GA_FAKE_SCENARIO: 'version_drift' }));
    const env = cliEnv(home, { GA_FAKE_CONFIG_FILE: f });
    expect((await runCli('agy', ['--version'], { env })).stdout).toBe('1.4.0\n');
    writeFileSync(f, JSON.stringify({ GA_FAKE_VERSION: '3.0.0' }));
    expect((await runCli('agy', ['--version'], { env })).stdout).toBe('3.0.0\n');
  });
});

describe('vé lượt mặc định theo bố cục của contracts (/run/ga/<lượt>/home → ../ticket)', () => {
  it('HOME đúng bố cục + có tệp ticket ⇒ dùng; GA_FAKE_TICKET_FILE ép đường khác', () => {
    const root = tmp();
    mkdirSync(join(root, 'T1/home'), { recursive: true });
    writeFileSync(join(root, 'T1/ticket'), 'tk');
    expect(defaultTicketFile({ HOME: join(root, 'T1/home') }, root)).toBe(join(root, 'T1/ticket'));
    expect(defaultTicketFile({ HOME: `${join(root, 'T1/home')}/` }, root)).toBe(join(root, 'T1/ticket'));
    const other = join(tmp(), 't');
    writeFileSync(other, 'x');
    expect(defaultTicketFile({ HOME: join(root, 'T1/home'), GA_FAKE_TICKET_FILE: other }, root)).toBe(other);
  });

  it('ca âm: thiếu HOME / HOME ngoài /run/ga / sai bố cục / chưa có tệp / ép đường không tồn tại ⇒ null (không đoán vé)', () => {
    const root = tmp();
    mkdirSync(join(root, 'T1/home'), { recursive: true });
    expect(defaultTicketFile({}, root)).toBeNull();
    expect(defaultTicketFile({ HOME: '/tmp/x/home' }, root)).toBeNull();
    expect(defaultTicketFile({ HOME: join(root, 'T1/home') }, root)).toBeNull(); // chưa có ticket
    expect(defaultTicketFile({ HOME: join(root, 'T1/home/sub') }, root)).toBeNull();
    expect(defaultTicketFile({ HOME: join(root, 'a/b/home') }, root)).toBeNull();
    expect(defaultTicketFile({ HOME: join(root, 'T1/home'), GA_FAKE_TICKET_FILE: '/khong/co' }, root)).toBeNull();
  });
});
