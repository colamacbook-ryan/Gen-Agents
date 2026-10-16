import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecResult, ProbeOutcome, TurnStreamEvent } from '@ga/contracts';
import { BUILTIN_ADAPTERS, type EngineAdapterExt } from '../src/index.ts';

// Fixture tối thiểu của riêng lane (output thật Spike 1b + ca giả định), đặt theo slug để mã test không phải nhắc tên CLI
// (lint `no-model-cli-names` áp cả cho test trong packages/). TODO(L-FAKE): khi testing/fakes có CLI giả chung, thay
// các ca "assumed" bằng output của CLI giả và giữ output thật Spike 1b làm ca đối chiếu.

export const FIXTURES = join(import.meta.dirname, 'fixtures');

export function fixture(slug: string, file: string): string {
  return readFileSync(join(FIXTURES, slug, file), 'utf8');
}

export interface OutcomeSpec {
  exitCode: number | null;
  signal?: string | null;
  timedOut?: boolean;
  stdout?: string;
  stdoutFile?: string;
  stderr?: string;
  stderrFile?: string;
}

export interface Cases {
  adapter: {
    authAllowlist: string[] | 'unknown';
    nativeStatePaths: string[];
    outputSignals: { phase: string; certainty: string };
    helpFile: string;
    /** Cờ Spike 1b đã gọi thật nhưng --help không liệt kê (vd --version). */
    flagsObservedOutsideHelp: string[];
    /** Cờ GIẢ ĐỊNH (chưa có trong --help thật, ASSUMPTIONS) — vd cơ chế giới hạn công cụ chờ Spike 1c. */
    flagsAssumedNotInHelp: string[];
    /** Cờ của cơ chế giới hạn công cụ + giá trị đặt cho gateway (sandbox-parity). */
    toolRestriction: { flags: string[]; argvContains: string[] };
    loginArgvSubscriptionTail: string[];
    systemPrompt: { in: 'file'; path: string } | { in: 'argv'; flag: string };
    valueForm: 'eq' | 'split';
    apiKeyFiles: string[];
    mcpConfigFile: string;
    checksumAlgorithm: string;
    selfUpdate: string;
    phaseAfterToolCall: string | null;
  };
  streamFiles?: Array<{ name: string; file: string; expected: TurnStreamEvent[] }>;
  stream: Array<{ name: string; line?: string; lineFile?: string; expected: TurnStreamEvent[] }>;
  classify: Array<{
    name: string;
    exit: { exitCode: number | null; signal: string | null; timedOut: boolean };
    stdout?: string;
    stdoutFile?: string;
    stderr?: string;
    stderrFile?: string;
    expected: { outcome: string; ruleId: string; resetAt: string | null };
  }>;
  login: Array<{
    name: string;
    authMethod: 'subscription' | 'api_key' | 'adc';
    outcome: OutcomeSpec;
    expected: { status: string; accountHint: string | null };
    probe: { loginStatus: string; probeStatus: string };
  }>;
  capabilities: Array<{
    name: string;
    authMode: 'oauth' | 'api_key' | 'adc' | 'none' | 'unknown';
    outcomes: OutcomeSpec[];
    values: Record<string, unknown>;
    confidence?: Record<string, string>;
    known: string[];
    absent?: string[];
    unknown: Record<string, string>;
    scan: { compatibility: string; missingTurnFlags: string[]; probeStatus: string };
  }>;
}

export function cases(slug: string): Cases {
  return JSON.parse(fixture(slug, 'cases.json')) as Cases;
}

export function text(slug: string, inline: string | undefined, file: string | undefined): string {
  if (file !== undefined) return fixture(slug, file);
  return inline ?? '';
}

export function execResult(slug: string, o: OutcomeSpec): ExecResult {
  return {
    exitCode: o.exitCode,
    signal: o.signal ?? null,
    stdout: text(slug, o.stdout, o.stdoutFile),
    stderr: text(slug, o.stderr, o.stderrFile),
    timedOut: o.timedOut ?? false,
    durationMs: 1,
  };
}

export function probeOutcome(slug: string, o: OutcomeSpec): ProbeOutcome {
  return { kind: 'cli', ...execResult(slug, o) };
}

export const ADAPTERS: readonly EngineAdapterExt[] = BUILTIN_ADAPTERS;

/** "Bảng năng lực đã quét" dùng cho test: mọi cờ mà các adapter khai (giả lập CLI có đủ cơ chế giới hạn công cụ). */
export const ALL_DECLARED_FLAGS: readonly string[] = [
  ...new Set(ADAPTERS.flatMap((a) => Object.keys(a.flagTable.flags))),
];

export const TURN_ID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
export const TICKET_FILE = `/run/ga/${TURN_ID}/ticket`;

export function turnInput(overrides: Record<string, unknown> = {}) {
  return {
    turnId: TURN_ID,
    prompt: 'Xin chào, hôm nay làm gì?',
    systemPrompt: null as string | null,
    model: null as string | null,
    effort: null as string | null,
    gatewayUrl: 'http://ga-app:7410/mcp',
    turnDir: `/run/ga/${TURN_ID}`,
    homeDir: `/run/ga/${TURN_ID}/home`,
    ticketFile: TICKET_FILE,
    promptFile: `/run/ga/${TURN_ID}/prompt/user.md`,
    systemPromptFile: null as string | null,
    authDir: '/auth/EN-0001',
    detectedFlags: ALL_DECLARED_FLAGS as readonly string[] | undefined,
    ...overrides,
  };
}

export const PROBE_ID = '01JABCDEFGHJKMNPQRSTVWXYZ1';

export function probeInput(overrides: Record<string, unknown> = {}) {
  return {
    probeId: PROBE_ID,
    probeDir: `/run/ga/probe-${PROBE_ID}`,
    homeDir: `/run/ga/probe-${PROBE_ID}/home`,
    authDir: '/auth/EN-0001',
    ...overrides,
  };
}
