import { PTY, TURN_EXEC, TURN_TICKET } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { FIXED_ROOTS, isCliBinName, isSafeRelPath, TICKET_FILE_MODE, TURN_ENV } from '../src/paths.ts';
import { TURN_ID } from './helpers.ts';

describe('hằng đường của ga-runner trùng contracts', () => {
  it('đường, tên env, mode tệp vé', () => {
    expect(FIXED_ROOTS.run).toBe(TURN_EXEC.turnDir('x').replace(/\/x$/, ''));
    expect(FIXED_ROOTS.auth).toBe(TURN_EXEC.authRoot);
    expect(FIXED_ROOTS.engines).toBe(TURN_EXEC.enginesRoot);
    expect(TURN_ENV.turnId).toBe(TURN_EXEC.envTurnId);
    expect(TURN_ENV.gatewayUrl).toBe(TURN_EXEC.envGatewayUrl);
    expect(TICKET_FILE_MODE).toBe(TURN_EXEC.ticketFileMode);
    expect(`${FIXED_ROOTS.run}/${TURN_ID}/ticket`).toBe(TURN_EXEC.ticketFile(TURN_ID));
    expect(`${FIXED_ROOTS.run}/${TURN_ID}/home`).toBe(TURN_EXEC.homeDir(TURN_ID));
    expect(TURN_TICKET.bundlePath).toBe('/turn/bundle');
    expect(PTY.maxDurationSeconds).toBe(600);
  });
});

describe('bộ kiểm tên', () => {
  it.each(['a.json', '.cfg/creds.json', 'x/y/z.json', 'a-b_c@d+e'])('đường an toàn: %s', (p) =>
    expect(isSafeRelPath(p)).toBe(true),
  );
  it.each(['', '/etc/passwd', '../x', 'a/../b', 'a/./b', 'a//b', 'a/', 'a b', 'a\nb', `${'x/'.repeat(17)}y`])(
    'đường KHÔNG an toàn: %j',
    (p) => expect(isSafeRelPath(p)).toBe(false),
  );
  it.each(['fake-cli', 'x.y', 'cli2'])('tên CLI hợp lệ: %s', (b) => expect(isCliBinName(b)).toBe(true));
  it.each([
    'sh',
    'bash',
    'node',
    'env',
    'python3',
    '/bin/sh',
    '../x',
    'ga-runner',
    'ga-engine-install',
    'A',
    '',
    '.',
    '..',
    'a b',
  ])('tên CLI bị từ chối: %j', (b) => expect(isCliBinName(b)).toBe(false));
});
