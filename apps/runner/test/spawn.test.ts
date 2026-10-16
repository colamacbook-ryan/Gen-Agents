import { spawn } from 'node:child_process';
import { symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PTY_MARKER_ENV } from '../src/paths.ts';
import { isAlive } from '../src/procs.ts';
import { ptyKill } from '../src/pty.ts';
import { resolveCliBin, runCli } from '../src/spawn.ts';
import { type Sandbox, sandbox } from './helpers.ts';

/** PATH có node (shebang của CLI giả). */
const PATH = `${dirname(process.execPath)}:/usr/bin:/bin`;

let sb: Sandbox;
beforeEach(() => {
  sb = sandbox();
});
afterEach(() => sb.cleanup());

describe('resolveCliBin — binary chỉ nằm dưới /opt/engines/<slug>/, không shell / trình thông dịch', () => {
  const cur = () => join(sb.roots.engines, 'fake', 'current');
  it('tên trần và đường tuyệt đối /opt/engines/<slug>/current/<bin> (dạng adapter dựng)', () => {
    expect(resolveCliBin(sb.roots, 'fake', 'fake-cli')).toContain(join('engines', 'fake', '1.0.0', 'fake-cli'));
    expect(resolveCliBin(sb.roots, 'fake', '/opt/engines/fake/current/fake-cli')).toContain('1.0.0');
  });
  it.each([
    ['shell tuyệt đối', 'fake', '/bin/sh'],
    ['shell tên trần', 'fake', 'sh'],
    ['trình thông dịch', 'fake', 'node'],
    ['bộ chạy lệnh env', 'fake', 'env'],
    ['đường tương đối thoát ra', 'fake', '../1.0.0/fake-cli'],
    ['đường tuyệt đối của loại CLI khác', 'fake', '/opt/engines/other/current/fake-cli'],
    ['che ga-runner', 'fake', 'ga-runner'],
    ['chưa cài', 'fake', 'khong-co'],
    ['slug lạ', '../x', 'fake-cli'],
    ['slug khác (chưa cài)', 'other', 'fake-cli'],
  ])('từ chối: %s', (_n, slug, argv0) => {
    expect(() => resolveCliBin(sb.roots, slug, argv0)).toThrow();
  });
  it('symlink trong thư mục bản cài trỏ ra ngoài (vd /bin/sh) ⇒ từ chối', () => {
    symlinkSync('/usr/bin/id', join(cur(), 'evil'));
    expect(() => resolveCliBin(sb.roots, 'fake', 'evil')).toThrow(/ngoài/);
  });
  it('shell được chép vào trong /opt/engines/<slug>/ dưới tên khác ⇒ vẫn bị bắt theo basename đường thật', () => {
    writeFileSync(join(cur(), 'sh'), '#!/bin/true\n', { mode: 0o755 });
    symlinkSync('sh', join(cur(), 'innocent'));
    expect(() => resolveCliBin(sb.roots, 'fake', 'innocent')).toThrow(/shell/);
  });
  it('tệp không có quyền chạy ⇒ từ chối', () => {
    writeFileSync(join(cur(), 'noexec'), 'x', { mode: 0o644 });
    expect(() => resolveCliBin(sb.roots, 'fake', 'noexec')).toThrow();
  });
});

describe('runCli — stdin đóng, không TTY, timeout giết cả nhóm', () => {
  it('chạy, gom stdout, trả mã thoát', async () => {
    let out = '';
    const r = await runCli({
      binPath: resolveCliBin(sb.roots, 'fake', 'fake-cli'),
      argv: ['fake-cli', 'print', 'một', 'hai'],
      env: { PATH },
      cwd: sb.base,
      timeoutMs: 10_000,
      onStdout: (c) => {
        out += c.toString();
      },
      onStderr: () => {},
    });
    expect(r).toMatchObject({ exitCode: 0, timedOut: false });
    expect(
      out
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l).arg),
    ).toEqual(['một', 'hai']);
  });

  it('quá timeout: SIGTERM bị bỏ qua ⇒ SIGKILL sau thời gian ân hạn', async () => {
    const r = await runCli({
      binPath: resolveCliBin(sb.roots, 'fake', 'fake-cli'),
      argv: ['fake-cli', 'sleep'],
      env: { PATH },
      cwd: sb.base,
      timeoutMs: 300,
      killGraceMs: 200,
      onStdout: () => {},
      onStderr: () => {},
    });
    expect(r.timedOut).toBe(true);
    expect(r.signal).toBe('SIGKILL');
  });
});

describe('pty-kill — đóng exec PTY dù CLI bỏ qua SIGHUP / SIGTERM và đã tự tách nhóm', () => {
  it('giết tiến trình mang marker GA_PTY_ID (setsid, bỏ qua tín hiệu)', async () => {
    const id = 'pty-test-0123456789abcdef';
    const stubborn = spawn(
      process.execPath,
      ['-e', "process.on('SIGTERM',()=>{});process.on('SIGHUP',()=>{});setInterval(()=>{},1000)"],
      { env: { ...process.env, [PTY_MARKER_ENV]: id }, detached: true, stdio: 'ignore' },
    );
    const pid = stubborn.pid as number;
    await new Promise((r) => setTimeout(r, 300));
    expect(isAlive(pid)).toBe(true);
    const r = await ptyKill(sb.roots, id, 300);
    expect(r.remaining).toBe(0);
    await new Promise((res) => setTimeout(res, 100));
    expect(isAlive(pid)).toBe(false);
  });

  it('không đụng tiến trình mang marker khác', async () => {
    const other = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      env: { ...process.env, [PTY_MARKER_ENV]: 'other-session-0123456789' },
      detached: true,
      stdio: 'ignore',
    });
    await new Promise((r) => setTimeout(r, 200));
    await ptyKill(sb.roots, 'mine-session-0123456789ab', 200);
    expect(isAlive(other.pid as number)).toBe(true);
    process.kill(other.pid as number, 'SIGKILL');
  });

  it('mã PTY sai dạng ⇒ từ chối', async () => {
    await expect(ptyKill(sb.roots, '../../etc')).rejects.toThrow();
  });
});
