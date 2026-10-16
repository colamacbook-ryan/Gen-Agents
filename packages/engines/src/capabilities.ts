import type { CapabilityEntry, ExecResult, ProbeOutcome } from '@ga/contracts';
import { head, MAX_PROBE_TEXT_CHARS, splitLines } from './text.ts';

// Capability registry (STD-10 §3): khoá của CapabilityEntry = `<kind>:<item_key>` để L-GW ghi vào bảng `capabilities`
// (kind ∈ CHECK của DB, item_key NOT NULL). Không quét được ⇒ valueState 'unknown' + lý do, không điền mặc định.

/** = CHECK `capabilities.kind` (DATABASE v2.3.x). Test đối chiếu với baseline SQL. Đề xuất đưa vào contracts. */
export const CAPABILITY_KINDS = [
  'version',
  'flag',
  'subcommand',
  'model',
  'effort',
  'mode',
  'output_format',
  'quota_window',
  'login_method',
  'instruction_file',
  'hook',
  'mcp',
  'tool',
  'feature',
  'native_memory',
] as const;
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

/** item_key cho giá trị "cả nhóm" chưa xác định (vd mọi model khi chưa đăng nhập). */
export const ANY_ITEM = '*';
export const UNKNOWN_REQUIRES_LOGIN = 'unknown_requires_login';

export function capKey(kind: CapabilityKind, item: string): string {
  return `${kind}:${item}`;
}

export function parseCapabilityKey(key: string): { kind: CapabilityKind; itemKey: string } | null {
  const i = key.indexOf(':');
  if (i <= 0 || i === key.length - 1) return null;
  const kind = key.slice(0, i);
  const itemKey = key.slice(i + 1);
  return (CAPABILITY_KINDS as readonly string[]).includes(kind) ? { kind: kind as CapabilityKind, itemKey } : null;
}

type AuthModeValue = CapabilityEntry['authMode'];
type Confidence = Extract<CapabilityEntry, { valueState: 'known' }>['confidence'];

export function known(
  kind: CapabilityKind,
  item: string,
  value: Extract<CapabilityEntry, { valueState: 'known' }>['value'],
  source: string,
  confidence: Confidence,
  authMode: AuthModeValue,
): CapabilityEntry {
  return { key: capKey(kind, item), valueState: 'known', value, source, confidence, authMode };
}

export function unknown(
  kind: CapabilityKind,
  item: string,
  unknownReason: string,
  source: string,
  authMode: AuthModeValue,
): CapabilityEntry {
  return { key: capKey(kind, item), valueState: 'unknown', unknownReason, source, authMode };
}

/** Kết quả exec dùng được để parse: có chạy, không bị giết, không hết giờ. */
/** ProbeOutcome `cli` ⇒ ExecResult; `http` (adapter CLI không dùng) hoặc thiếu ⇒ undefined (= lệnh không chạy). */
export function cliResult(o: ProbeOutcome | undefined): ExecResult | undefined {
  if (o === undefined || o.kind !== 'cli') return undefined;
  const { kind: _kind, ...r } = o;
  return r;
}

export function ran(r: ExecResult | undefined): r is ExecResult {
  return r !== undefined && !r.timedOut && r.signal === null && r.exitCode !== null;
}

export function execFailureReason(r: ExecResult | undefined): string {
  if (r === undefined) return 'unknown: lệnh quét không chạy';
  if (r.timedOut) return 'unknown: lệnh quét hết thời gian';
  if (r.signal !== null) return `unknown: lệnh quét bị dừng (${r.signal})`;
  return `unknown: lệnh quét thoát mã ${r.exitCode ?? 'null'}`;
}

// ---------------------------------------------------------------- parse `--help` (dạng chung, tuyến tính)
const TOKEN_START = /^[A-Za-z0-9]$/;

function isWordChar(c: string): boolean {
  return /^[A-Za-z0-9_-]$/.test(c);
}

/** Các cờ khai ở đầu một dòng help: `  -p, --print <x>` ⇒ ['-p', '--print']. */
function flagsAtLineStart(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length && line[i] === ' ') i++;
  if (i === 0 || i > 8) return out;
  while (i < line.length && line[i] === '-') {
    let j = i;
    while (j < line.length && line[j] === '-' && j - i < 2) j++;
    if (j >= line.length || !TOKEN_START.test(line[j] ?? '')) break;
    let k = j;
    while (k < line.length && isWordChar(line[k] ?? '')) k++;
    out.push(line.slice(i, k));
    i = k;
    if (line[i] === ',' && line[i + 1] === ' ') i += 2;
    else break;
  }
  return out;
}

export function parseHelpFlags(help: string): string[] {
  const set = new Set<string>();
  for (const line of splitLines(head(help, MAX_PROBE_TEXT_CHARS))) {
    for (const f of flagsAtLineStart(line)) set.add(f);
  }
  return [...set].sort();
}

/** Khối mô tả của một cờ: dòng khai cờ + các dòng tiếp nối (không bắt đầu bằng cờ khác), nối bằng dấu cách. */
export function helpBlock(help: string, flag: string): string | null {
  const lines = splitLines(head(help, MAX_PROBE_TEXT_CHARS));
  for (let i = 0; i < lines.length; i++) {
    if (!flagsAtLineStart(lines[i] ?? '').includes(flag)) continue;
    let block = lines[i] ?? '';
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? '';
      if (flagsAtLineStart(next).length > 0 || !next.startsWith(' ') || next.trim() === '') break;
      block += ` ${next.trim()}`;
    }
    return block;
  }
  return null;
}

const CHOICE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * Danh sách lựa chọn trong khối help của cờ: `(choices: "a", "b")`, `(a|b|c)` hoặc `(a, b, c)`.
 * Nhóm `(default …)` bị bỏ qua. Không có ⇒ null (người gọi ghi unknown, không đoán).
 */
export function helpChoices(help: string, flag: string): string[] | null {
  const block = helpBlock(help, flag);
  if (block === null) return null;
  let i = 0;
  while (i < block.length) {
    const open = block.indexOf('(', i);
    if (open < 0) break;
    const close = block.indexOf(')', open + 1);
    if (close < 0) break;
    const inner = block.slice(open + 1, close).trim();
    i = close + 1;
    if (inner.startsWith('default')) continue;
    let tokens: string[];
    if (inner.startsWith('choices:')) {
      tokens = inner
        .slice('choices:'.length)
        .split(',')
        .map((t) => t.trim())
        .filter((t) => !t.startsWith('default'))
        .map((t) => (t.startsWith('"') && t.endsWith('"') && t.length >= 2 ? t.slice(1, -1) : t));
    } else if (inner.includes('|')) {
      tokens = inner.split('|').map((t) => t.trim());
    } else {
      tokens = inner.split(',').map((t) => t.trim());
    }
    if (tokens.length >= 2 && tokens.every((t) => CHOICE_TOKEN.test(t))) return tokens;
  }
  return null;
}

/**
 * Tên lệnh con trong mục `header` (vd "Available subcommands:" / "Commands:"): dòng thụt đúng 2 dấu cách,
 * token đầu là tên (cho phép `a|b` bí danh). Mục kết thúc ở dòng không thụt lề.
 */
export function helpSubcommands(help: string, header: string): string[] | null {
  const lines = splitLines(head(help, MAX_PROBE_TEXT_CHARS));
  const start = lines.findIndex((l) => l.trim() === header);
  if (start < 0) return null;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.startsWith(' ')) break;
    if (!line.startsWith('  ') || line.startsWith('   ')) continue;
    let k = 2;
    while (k < line.length && line[k] !== ' ') k++;
    const name = line.slice(2, k);
    for (const part of name.split('|')) if (CHOICE_TOKEN.test(part)) out.push(part);
  }
  return out.length > 0 ? out : null;
}

/** Token phiên bản đầu tiên dạng `x.y.z…` trong output `--version`. */
export function parseVersionToken(text: string): string | null {
  for (const tok of head(text, 4096).split(/\s/)) {
    if (tok.length <= 64 && /^\d+\.\d+\.\d+(?:[.+-][0-9A-Za-z.+-]*)?$/.test(tok)) return tok;
  }
  return null;
}

/** `--version` ⇒ mục `version:cli` (giá trị không phụ thuộc đăng nhập). */
export function versionCapability(r: ExecResult | undefined, source: string): CapabilityEntry {
  const version = ran(r) && r.exitCode === 0 ? parseVersionToken(r.stdout) : null;
  return version !== null
    ? known('version', 'cli', version, source, 'direct', 'none')
    : unknown('version', 'cli', execFailureReason(r), source, 'none');
}

export interface HelpScanSpec {
  /** Nguồn ghi vào registry, vd `<cli> --help`. */
  source: string;
  /** Mục registry lấy từ danh sách giá trị của một cờ, vd ['effort', '--effort']. */
  lists: ReadonlyArray<readonly [CapabilityKind, string]>;
  /** Tiêu đề mục lệnh con trong help. */
  subcommandHeader: string;
}

/**
 * `--help` ⇒ cờ, lệnh con và các tập giá trị chung (effort, mode, output format). Tập effort là của CLI, không phải
 * của từng model: "model nào hỗ trợ mức nào" không quét được (STD-10 §5) — GUI không suy ra từ đây.
 */
export function helpCapabilities(r: ExecResult | undefined, spec: HelpScanSpec): CapabilityEntry[] {
  const out: CapabilityEntry[] = [];
  const text = ran(r) && r.exitCode === 0 ? r.stdout || r.stderr : null;
  if (text === null) {
    const kinds = new Set<CapabilityKind>(['flag', 'subcommand', ...spec.lists.map(([k]) => k)]);
    for (const kind of kinds) out.push(unknown(kind, ANY_ITEM, execFailureReason(r), spec.source, 'none'));
    return out;
  }
  for (const f of parseHelpFlags(text)) out.push(known('flag', f, true, spec.source, 'direct', 'none'));
  for (const [kind, flag] of spec.lists) {
    const choices = helpChoices(text, flag);
    if (choices === null) {
      out.push(
        unknown(kind, ANY_ITEM, `unknown: không thấy danh sách giá trị của ${flag} trong --help`, spec.source, 'none'),
      );
      continue;
    }
    for (const c of choices) out.push(known(kind, c, true, `${spec.source} (${flag})`, 'direct', 'none'));
  }
  const subs = helpSubcommands(text, spec.subcommandHeader);
  if (subs === null) {
    out.push(unknown('subcommand', ANY_ITEM, `unknown: không thấy mục ${spec.subcommandHeader}`, spec.source, 'none'));
  } else {
    for (const s of subs) out.push(known('subcommand', s, true, spec.source, 'direct', 'none'));
  }
  return out;
}

/** Cờ CLI đã quét (mục `flag:<cờ>` biết giá trị) — đầu vào `detectedFlags` của turnPlan. */
export function detectedFlags(entries: readonly CapabilityEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e.valueState !== 'known') continue;
    const k = parseCapabilityKey(e.key);
    if (k?.kind === 'flag') out.push(k.itemKey);
  }
  return out;
}
