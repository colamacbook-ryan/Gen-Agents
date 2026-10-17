import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authGc } from '../src/auth-gc.ts';
import { writeNewFileInside } from '../src/fsutil.ts';
import { linkAllowlist, syncBack } from '../src/home.ts';
import { ACCOUNT, type Sandbox, sandbox } from './helpers.ts';

let sb: Sandbox;
beforeEach(() => {
  sb = sandbox();
});
afterEach(() => sb.cleanup());

function put(rel: string, content = 'x'): void {
  const p = join(sb.authDir, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
}

describe('auth-gc: /auth/<en> chỉ còn tệp allowlist (CNS-132)', () => {
  it('giữ đúng allowlist, xoá transcript / lịch sử / thư mục lạ', () => {
    put('.cfg/.credentials.json');
    put('.cfg/projects/x/conv.jsonl');
    put('.cfg/history.jsonl');
    put('conversation.db');
    put('top.json');
    const r = authGc(sb.roots, ACCOUNT, ['.cfg/.credentials.json', 'top.json']);
    expect(r.nativeMemory).toBe('off');
    expect(existsSync(join(sb.authDir, '.cfg/.credentials.json'))).toBe(true);
    expect(existsSync(join(sb.authDir, 'top.json'))).toBe(true);
    expect(existsSync(join(sb.authDir, '.cfg/projects'))).toBe(false);
    expect(existsSync(join(sb.authDir, '.cfg/history.jsonl'))).toBe(false);
    expect(existsSync(join(sb.authDir, 'conversation.db'))).toBe(false);
    expect(r.removed).toBe(3);
  });

  it('không đi theo symlink: symlink trỏ ra ngoài bị xoá, đích còn nguyên', () => {
    const outside = join(sb.base, 'outside.txt');
    writeFileSync(outside, 'không được xoá');
    symlinkSync(outside, join(sb.authDir, 'link-out'));
    mkdirSync(join(sb.base, 'outdir'));
    writeFileSync(join(sb.base, 'outdir', 'keep.txt'), 'giữ');
    symlinkSync(join(sb.base, 'outdir'), join(sb.authDir, 'dirlink'));
    authGc(sb.roots, ACCOUNT, ['cred.json']);
    expect(existsSync(join(sb.authDir, 'link-out'))).toBe(false);
    expect(readFileSync(outside, 'utf8')).toBe('không được xoá');
    expect(readFileSync(join(sb.base, 'outdir', 'keep.txt'), 'utf8')).toBe('giữ');
  });

  it('mục trùng tên allowlist nhưng là thư mục / symlink thì bị xoá (chỉ giữ tệp thường)', () => {
    mkdirSync(join(sb.authDir, 'cred.json'));
    writeFileSync(join(sb.authDir, 'cred.json', 'inner'), 'x');
    symlinkSync('/etc/hostname', join(sb.authDir, 'other.json'));
    const r = authGc(sb.roots, ACCOUNT, ['cred.json', 'other.json']);
    expect(existsSync(join(sb.authDir, 'cred.json'))).toBe(false);
    expect(() => lstatSync(join(sb.authDir, 'other.json'))).toThrow();
    expect(r.removed).toBe(2);
  });

  it('tiền tố thư mục của allowlist là symlink ⇒ xoá, không đi vào', () => {
    mkdirSync(join(sb.base, 'evil', '.cfg'), { recursive: true });
    writeFileSync(join(sb.base, 'evil', '.cfg', 'junk'), 'x');
    symlinkSync(join(sb.base, 'evil', '.cfg'), join(sb.authDir, '.cfg'));
    authGc(sb.roots, ACCOUNT, ['.cfg/.credentials.json']);
    expect(existsSync(join(sb.authDir, '.cfg'))).toBe(false);
    expect(existsSync(join(sb.base, 'evil', '.cfg', 'junk'))).toBe(true);
  });

  it('không đọc nội dung: tệp không đọc được (chmod 000) vẫn được giữ / xoá đúng luật', () => {
    put('cred.json', 'bí mật');
    put('junk.bin', 'rác');
    chmodSync(join(sb.authDir, 'cred.json'), 0o000);
    chmodSync(join(sb.authDir, 'junk.bin'), 0o000);
    const r = authGc(sb.roots, ACCOUNT, ['cred.json']);
    expect(r.removed).toBe(1);
    expect(existsSync(join(sb.authDir, 'cred.json'))).toBe(true);
    chmodSync(join(sb.authDir, 'cred.json'), 0o600);
  });

  it("allowlist 'unknown' ⇒ không xoá gì, nativeMemory = unknown (DATABASE D18)", () => {
    put('a/b/c.jsonl');
    put('d.db');
    expect(authGc(sb.roots, ACCOUNT, 'unknown')).toEqual({ removed: 0, nativeMemory: 'unknown' });
    expect(existsSync(join(sb.authDir, 'a/b/c.jsonl'))).toBe(true);
  });

  it.each([
    ['tài khoản sai dạng', 'EN-1/../x', ['a']],
    ['tài khoản không có thư mục', 'EN-9999', ['a']],
    ['allowlist có ..', ACCOUNT, ['../EN-0002/cred.json']],
    ['allowlist tuyệt đối', ACCOUNT, ['/etc/passwd']],
  ] as const)('từ chối: %s', (_n, acc, allow) => {
    expect(() => authGc(sb.roots, acc, allow)).toThrow();
  });

  it('thư mục /auth/<en> là symlink ⇒ từ chối (không gc xuyên symlink)', () => {
    mkdirSync(join(sb.base, 'real'));
    symlinkSync(join(sb.base, 'real'), join(sb.roots.auth, 'EN-0002'));
    expect(() => authGc(sb.roots, 'EN-0002', ['a'])).toThrow();
  });
});

describe('HOME tmpfs: nối credential từng tệp + chép ngược khi bị thay (R10)', () => {
  it('symlink từng tệp; ghi qua symlink rơi vào /auth; transcript ở HOME không lọt', () => {
    put('.cfg/.credentials.json', 'v1');
    const home = join(sb.base, 'home');
    mkdirSync(home);
    const links = linkAllowlist(home, sb.authDir, ['.cfg/.credentials.json']);
    expect(readlinkSync(join(home, '.cfg/.credentials.json'))).toBe(join(sb.authDir, '.cfg/.credentials.json'));
    expect(lstatSync(join(home, '.cfg')).isSymbolicLink()).toBe(false);
    writeFileSync(join(home, '.cfg/.credentials.json'), 'v2'); // ghi xuyên symlink
    writeFileSync(join(home, '.cfg/transcript.jsonl'), 'hội thoại');
    expect(readFileSync(join(sb.authDir, '.cfg/.credentials.json'), 'utf8')).toBe('v2');
    expect(existsSync(join(sb.authDir, '.cfg/transcript.jsonl'))).toBe(false);
    expect(syncBack(sb.authDir, links)).toBe(0);
  });

  it('CLI thay symlink bằng tệp thường (rename nguyên tử) ⇒ chép ngược về /auth, 0600', () => {
    put('cred.json', 'v1');
    const home = join(sb.base, 'home');
    mkdirSync(home);
    const links = linkAllowlist(home, sb.authDir, ['cred.json']);
    writeFileSync(join(home, 'cred.tmp'), 'v2-rotated');
    // rename đè symlink
    require_rename(join(home, 'cred.tmp'), join(home, 'cred.json'));
    expect(readFileSync(join(sb.authDir, 'cred.json'), 'utf8')).toBe('v1');
    expect(syncBack(sb.authDir, links)).toBe(1);
    expect(readFileSync(join(sb.authDir, 'cred.json'), 'utf8')).toBe('v2-rotated');
    expect(lstatSync(join(sb.authDir, 'cred.json')).mode & 0o777).toBe(0o600);
  });

  it('tệp plan trùng đường credential ⇒ lỗi (plan không ghi xuyên symlink vào /auth)', () => {
    const home = join(sb.base, 'home');
    mkdirSync(home);
    writeFileSync(join(home, 'cred.json'), 'plan');
    expect(() => linkAllowlist(home, sb.authDir, ['cred.json'])).toThrow();
  });

  it('writeNewFileInside từ chối thư mục cha là symlink và tệp đã tồn tại', () => {
    const base = join(sb.base, 'turn');
    mkdirSync(base);
    symlinkSync(sb.authDir, join(base, 'home'));
    expect(() => writeNewFileInside(base, 'home/x.json', 'x', 0o600)).toThrow();
    writeNewFileInside(base, 'a.txt', 'x', 0o600);
    expect(() => writeNewFileInside(base, 'a.txt', 'y', 0o600)).toThrow();
    symlinkSync(join(sb.authDir, 'cred.json'), join(base, 'l.json'));
    expect(() => writeNewFileInside(base, 'l.json', 'y', 0o600)).toThrow();
    expect(existsSync(join(sb.authDir, 'cred.json'))).toBe(false);
  });
});

import { renameSync } from 'node:fs';

function require_rename(a: string, b: string): void {
  renameSync(a, b);
}
