import type { EngineFlagTable } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { assertPlanEnv } from '../src/env.ts';
import { buildCliEnv } from '../src/session.ts';
import { type Sandbox, sandbox } from './helpers.ts';

// Env của CLI = allowlist theo bảng ĐÓNG của adapter + chặn cứng (review MEDIUM code-execution). Mỗi nhóm một ca âm,
// và mỗi ca âm khai tên đó TRONG bảng của adapter (adapter khai nhầm) để chứng minh lớp chặn cứng tự đứng được.

function table(env: string[]): EngineFlagTable {
  return { subcommands: [], flags: {}, env };
}

const GROUPS: [string, string][] = [
  ['loader LD_*', 'LD_PRELOAD'],
  ['loader LD_LIBRARY_PATH', 'LD_LIBRARY_PATH'],
  ['loader DYLD_*', 'DYLD_INSERT_LIBRARIES'],
  ['node NODE_OPTIONS', 'NODE_OPTIONS'],
  ['node NODE_PATH', 'NODE_PATH'],
  ['python PYTHONPATH', 'PYTHONPATH'],
  ['python PYTHONSTARTUP', 'PYTHONSTARTUP'],
  ['perl PERL5OPT', 'PERL5OPT'],
  ['perl PERL5LIB', 'PERL5LIB'],
  ['ruby RUBYOPT', 'RUBYOPT'],
  ['ruby RUBYLIB', 'RUBYLIB'],
  ['shell BASH_ENV', 'BASH_ENV'],
  ['shell ENV', 'ENV'],
  ['shell SHELLOPTS', 'SHELLOPTS'],
  ['shell PS4', 'PS4'],
  ['git GIT_SSH_COMMAND', 'GIT_SSH_COMMAND'],
  ['git GIT_CONFIG_GLOBAL', 'GIT_CONFIG_GLOBAL'],
  ['runner đặt HOME', 'HOME'],
  ['runner đặt PATH', 'PATH'],
  ['runner đặt TMPDIR', 'TMPDIR'],
  ['egress đặt HTTPS_PROXY', 'HTTPS_PROXY'],
  ['egress đặt HTTP_PROXY', 'HTTP_PROXY'],
  ['egress đặt NO_PROXY', 'NO_PROXY'],
  ['CA SSL_CERT_FILE', 'SSL_CERT_FILE'],
  ['bí mật *SESSION*', 'MY_SESSION_ID'],
  ['bí mật *_OAUTH_TOKEN', 'X_OAUTH_TOKEN'],
  ['khoá chủ', 'GENAGENTS_MASTER_KEY'],
];

describe('assertPlanEnv — chặn cứng kể cả khi adapter khai nhầm trong bảng', () => {
  it.each(GROUPS)('%s', (_g, name) => {
    expect(() => assertPlanEnv({ [name]: '1' }, table([name]))).toThrow(/env của plan bị từ chối/);
  });
  it('biến thường (http_proxy) cũng bị chặn', () => {
    expect(() => assertPlanEnv({ http_proxy: 'x' }, table(['http_proxy']))).toThrow();
  });
});

describe('assertPlanEnv — allowlist theo bảng của adapter', () => {
  it('biến trong bảng, không thuộc nhóm chặn ⇒ đi qua', () => {
    expect(
      assertPlanEnv({ NO_COLOR: '1', DISABLE_AUTOUPDATER: '1' }, table(['NO_COLOR', 'DISABLE_AUTOUPDATER'])),
    ).toEqual({
      NO_COLOR: '1',
      DISABLE_AUTOUPDATER: '1',
    });
  });
  it('biến ngoài bảng ⇒ từ chối', () => {
    expect(() => assertPlanEnv({ FOO: '1' }, table(['NO_COLOR']))).toThrow();
  });
  it('tên sai dạng / giá trị chứa NUL ⇒ từ chối', () => {
    expect(() => assertPlanEnv({ 'a-b': '1' }, table(['a-b']))).toThrow();
    expect(() => assertPlanEnv({ NO_COLOR: 'a\0b' }, table(['NO_COLOR']))).toThrow();
  });
});

describe('buildCliEnv — env dựng mới, không kế thừa env của runner', () => {
  let sb: Sandbox;
  it('chỉ LANG + proxy của container + env plan đã kiểm + PATH/HOME/TMPDIR do runner đặt', () => {
    sb = sandbox();
    try {
      const env = buildCliEnv(
        sb.roots,
        'fake',
        '/run/ga/T/home',
        '/run/ga/T/tmp',
        { HTTPS_PROXY: 'http://ga-egress:3128', GA_TURN_ID: 'X', NODE_OPTIONS: '--require /x', SECRET: 'y' },
        { NO_COLOR: '1' },
        table(['NO_COLOR']),
      );
      expect(env).toEqual({
        LANG: 'C.UTF-8',
        HTTPS_PROXY: 'http://ga-egress:3128',
        NO_COLOR: '1',
        PATH: `${sb.roots.engines}/fake/current:/usr/local/bin:/usr/bin:/bin`,
        HOME: '/run/ga/T/home',
        TMPDIR: '/run/ga/T/tmp',
      });
    } finally {
      sb.cleanup();
    }
  });
  it('env plan có biến chặn cứng ⇒ không dựng được (không spawn)', () => {
    sb = sandbox();
    try {
      expect(() =>
        buildCliEnv(sb.roots, 'fake', '/h', '/t', {}, { LD_PRELOAD: '/x.so' }, table(['LD_PRELOAD'])),
      ).toThrow();
    } finally {
      sb.cleanup();
    }
  });
});
