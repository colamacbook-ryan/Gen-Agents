#!/usr/bin/env node
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: chuỗi đột biến là MÃ NGUỒN TS cần khớp nguyên văn (có `${…}`)
// Đột biến khung http/ của control plane — chứng minh test bắt được từng lỗi bảo mật. KHÔNG sửa worktree đang làm việc:
// mỗi đột biến = patch dựng từ HEAD trong thư mục tạm, chạy bằng scripts/mutate.sh (git worktree TẠM tách rời).
//   node apps/control-plane/test/meta/mutants.mjs [id…]      (mặc định: mọi đột biến)
//   GA_MUTATE_DIR=<thư mục tạm>                              (mặc định: TMPDIR)
// Thoát 0 khi mọi đột biến "phải đỏ" đều đỏ; in bảng id → kết quả → test đỏ đầu tiên.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const P = 'apps/control-plane/src/http/pipeline.ts';
const MUTANTS = [
  {
    id: 'M1-no-output-validation',
    desc: 'bỏ validate response (trả thẳng giá trị handler)',
    file: P,
    edits: [['const parsed = schema.safeParse(out);', 'const parsed = { success: true, data: out } as any;']],
  },
  {
    id: 'M2-permission-after-handler',
    desc: 'kiểm quyền tối thiểu SAU handler',
    file: P,
    edits: [
      ["      if (!authAtLeast(actor.authLevel, route.auth)) throw new ApiError('auth.forbidden');\n", ''],
      [
        '    const out = await handler.run(input, ctx);\n',
        "    const out = await handler.run(input, ctx);\n    if (actor !== null && !authAtLeast(actor.authLevel, route.auth)) throw new ApiError('auth.forbidden');\n",
      ],
    ],
  },
  {
    id: 'M3-ref-no-workspace-filter',
    desc: 'ctx.ref không lọc workspace_id',
    file: 'apps/control-plane/src/context/ref.ts',
    edits: [['WHERE ${by} = ? AND workspace_id = ?${live}', 'WHERE ${by} = ? AND (workspace_id = ? OR 1)${live}']],
  },
  {
    id: 'M4a-workspace-from-client-header',
    desc: 'workspace của actor lấy từ request (header x-ga-workspace-id) thay vì phiên',
    file: P,
    edits: [
      [
        '        workspaceId: m.workspaceId,',
        "        workspaceId: req.headers.get('x-ga-workspace-id') ?? m.workspaceId,",
      ],
    ],
  },
  {
    id: 'M4b-workspace-from-body',
    desc: 'workspace của actor lấy từ body.workspaceId (thô) thay vì phiên',
    file: P,
    edits: [
      [
        "    const rawBody = parseJsonBody(bytes, req.headers.get('content-type'));\n",
        "    const rawBody = parseJsonBody(bytes, req.headers.get('content-type'));\n    if (actor !== null && typeof (rawBody as any)?.workspaceId === 'string') actor = { ...actor, workspaceId: (rawBody as any).workspaceId };\n",
      ],
    ],
    equivalentExpected: 'body có khoá lạ `workspaceId` luôn bị validate strict từ chối (400) ⇒ không quan sát được',
  },
  {
    id: 'M5-recovery-default-open',
    desc: 'không có RecoveryProvider ⇒ mặc định mở (mode ok)',
    file: 'apps/control-plane/src/http/recovery.ts',
    edits: [
      [
        "state: (): RecoveryState => ({ mode: 'recovery', reason: 'provider_missing' }),",
        "state: (): RecoveryState => ({ mode: 'ok', reason: null }),",
      ],
    ],
  },
  {
    id: 'M6a-skip-csrf-patch-edge',
    desc: 'lớp CSRF của edge bỏ qua PATCH',
    file: P,
    edits: [
      [
        'if (requiresCsrf(route) && !csrfMatches(',
        "if (requiresCsrf(route) && route.method !== 'PATCH' && !csrfMatches(",
      ],
    ],
  },
  {
    id: 'M6b-skip-csrf-patch-both-layers',
    desc: 'bỏ CSRF cho PATCH ở CẢ edge lẫn lời gọi L-SEC (method giả GET)',
    file: P,
    edits: [
      [
        'if (requiresCsrf(route) && !csrfMatches(',
        "if (requiresCsrf(route) && route.method !== 'PATCH' && !csrfMatches(",
      ],
      ['        method: req.method,\n', "        method: route.method === 'PATCH' ? 'GET' : req.method,\n"],
    ],
  },
  {
    id: 'M7-unknown-error-leaks-message',
    desc: 'lỗi lạ trả err.message cho client',
    file: 'apps/control-plane/src/http/errors.ts',
    edits: [
      [
        "  return errorResult('internal', requestId);\n}",
        "  return { status: 500, body: { error: { code: 'internal', i18nKey: 'errors.internal', requestId, message: String((err as Error)?.message) } } as any, headers: {} };\n}",
      ],
    ],
  },
  {
    id: 'M8a-idempotency-global-full',
    desc: 'idempotency: thêm lại trần TOÀN CỤC từ chối (một tenant đầy chặn tenant khác)',
    file: 'apps/control-plane/src/http/idempotency.ts',
    edits: [
      [
        '    const actorKey = `${key.workspaceId}\\u0000${key.actorId}`;\n',
        "    if (this.entries.size >= this.maxPerWorkspace) return { kind: 'full', reason: 'workspace' };\n    const actorKey = `${key.workspaceId}\\u0000${key.actorId}`;\n",
      ],
    ],
  },
  {
    id: 'M8b-idempotency-evict-oldest',
    desc: 'idempotency: actor đầy ⇒ evict mục cũ nhất của kho (thay vì 429)',
    file: 'apps/control-plane/src/http/idempotency.ts',
    edits: [
      [
        "    if ((this.perActor.get(actorKey) ?? 0) >= this.maxPerActor) return { kind: 'full', reason: 'actor' };",
        '    if ((this.perActor.get(actorKey) ?? 0) >= this.maxPerActor) { const [k0, e0] = this.entries.entries().next().value as [string, Entry]; this.remove(k0, e0); }',
      ],
    ],
  },
  {
    id: 'M8c-idempotency-full-scan-purge',
    desc: 'idempotency: dọn hết hạn bằng quét toàn bộ mỗi begin (O(n))',
    file: 'apps/control-plane/src/http/idempotency.ts',
    edits: [
      [
        '  private purge(nowMs: number): void {\n',
        '  private purge(nowMs: number): void {\n    for (const [k, e] of this.entries) if (e.expiresAt <= nowMs) this.remove(k, e);\n',
      ],
    ],
  },
  {
    id: 'M9-operator-accepted',
    desc: 'access_level operator được coi là admin',
    file: 'apps/control-plane/src/http/session.ts',
    edits: [["    case 'admin':\n      return 'A';", "    case 'admin':\n    case 'operator':\n      return 'A';"]],
  },
  {
    id: 'M10-no-stream-byte-count',
    desc: 'trần thân chỉ tin Content-Length (không đếm byte khi đọc)',
    file: 'apps/control-plane/src/http/body.ts',
    edits: [['    if (total > maxBytes) {', '    if (false) {']],
  },
  {
    id: 'M12-auth-locked-old-mapping',
    desc: 'L-SEC: khoá tạm trả lại mã cũ ngoài hợp đồng (auth.rate_limited 429)',
    file: 'apps/control-plane/src/auth/http.ts',
    edits: [
      [
        "      return errorResponse(403, 'auth.locked', { retryAfterSeconds: f.retryAfterSeconds });",
        "      return errorResponse(429, 'auth.rate_limited', { retryAfterSeconds: f.retryAfterSeconds });",
      ],
    ],
  },
];

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const want = new Set(process.argv.slice(2));
const work = mkdtempSync(join(process.env.GA_MUTATE_DIR ?? tmpdir(), 'ga-cp-mutants-'));
const cmd = process.env.GA_MUTATE_CMD ?? 'pnpm --filter @ga/control-plane test';
const rows = [];
let failed = 0;
try {
  for (const m of MUTANTS) {
    if (want.size > 0 && !want.has(m.id)) continue;
    const orig = execFileSync('git', ['-C', root, 'show', `HEAD:${m.file}`], { encoding: 'utf8' });
    let mutated = orig;
    for (const [from, to] of m.edits) {
      const i = mutated.indexOf(from);
      if (i < 0 || mutated.indexOf(from, i + 1) >= 0)
        throw new Error(`${m.id}: chuỗi không khớp đúng một lần trong ${m.file}`);
      mutated = mutated.slice(0, i) + to + mutated.slice(i + from.length);
    }
    const a = join(work, `${m.id}.orig`);
    const b = join(work, `${m.id}.mut`);
    writeFileSync(a, orig);
    writeFileSync(b, mutated);
    const diff = spawnSync('diff', ['-u', '--label', `a/${m.file}`, '--label', `b/${m.file}`, a, b], {
      encoding: 'utf8',
    });
    const patch = join(work, `${m.id}.patch`);
    writeFileSync(patch, diff.stdout);
    const r = spawnSync('bash', [join(root, 'scripts/mutate.sh'), '--patch', patch, '--cmd', cmd], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GA_MUTATE_DIR: work },
    });
    const out = `${r.stdout}${r.stderr}`;
    const verdict = r.status === 0 ? 'ĐỎ (bị bắt)' : r.status === 3 ? 'SỐNG' : `LỖI DỰNG (${r.status})`;
    const firstFail = (/^\s*(?:FAIL|×)\s+(.+)$/m.exec(out)?.[1] ?? '').trim().slice(0, 160);
    const expectedLive = m.equivalentExpected !== undefined;
    if ((r.status !== 0 && !expectedLive) || r.status === 2) failed++;
    rows.push({ id: m.id, verdict, firstFail, note: expectedLive && r.status === 3 ? m.equivalentExpected : '' });
    process.stdout.write(`${m.id}: ${verdict}${firstFail ? ` — ${firstFail}` : ''}\n`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.stdout.write('\n| đột biến | kết quả | test đỏ đầu tiên / ghi chú |\n|---|---|---|\n');
for (const r of rows) process.stdout.write(`| ${r.id} | ${r.verdict} | ${r.firstFail || r.note} |\n`);
process.exitCode = failed > 0 ? 1 : 0;
