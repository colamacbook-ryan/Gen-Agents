// Chuỗi cung ứng CI (review tay M0, LOW): rào tự động để không tái phạm —
//   action ghim SHA commit 40 hex · checkout không lưu token · không nội suy ${{ }} vào `run:` · image ghim @sha256.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKIP = new Set(['node_modules', 'dist', '.git', 'lint-fixtures', 'license-fixtures']);

/** Tệp (đường tương đối) dưới các thư mục gốc, lọc theo hàm; thư mục không tồn tại thì bỏ qua. */
function walk(roots, keep) {
  const out = [];
  const rec = (rel) => {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      if (SKIP.has(name)) continue;
      const r = `${rel}/${name}`;
      if (statSync(join(ROOT, r)).isDirectory()) rec(r);
      else if (keep(r)) out.push(r);
    }
  };
  for (const r of roots) rec(r);
  return out;
}
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const workflows = readdirSync(WORKFLOWS)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ f, text: readFileSync(join(WORKFLOWS, f), 'utf8') }));

describe('CI ghim chuỗi cung ứng', () => {
  it('mọi `uses:` ghim SHA commit 40 hex (tag ở chú thích)', () => {
    const bad = [];
    for (const { f, text } of workflows) {
      for (const m of text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
        if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(m[1]) && !m[1].startsWith('./')) bad.push(`${f}: ${m[1]}`);
      }
    }
    expect(workflows.length).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('actions/checkout luôn có persist-credentials: false', () => {
    const bad = [];
    for (const { f, text } of workflows) {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (!/uses:\s*actions\/checkout@/.test(line)) return;
        // khối `with:` ngay sau bước checkout (các dòng thụt sâu hơn `- uses`)
        const indent = line.search(/\S/);
        let ok = false;
        for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > indent); j++) {
          if (/^\s*persist-credentials:\s*false\s*$/.test(lines[j])) ok = true;
        }
        if (!ok) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('không nội suy biểu thức GitHub ($ + ngoặc nhọn kép) trong dòng `run:` — dùng env:', () => {
    const bad = [];
    for (const { f, text } of workflows) {
      text.split('\n').forEach((line, i) => {
        if (/^\s*-?\s*run:/.test(line) && /\$\{\{/.test(line)) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('image ghim @sha256: compose / YAML trong deploy/** + testing/** (IT), Dockerfile FROM, IMAGE= trong scripts/*.sh', () => {
    const bad = [];
    let seen = 0;
    // image build tại chỗ (từ Dockerfile đã ghim base) được phép: <tên>:local
    const pinned = (ref) => /@sha256:[0-9a-f]{64}$/.test(ref) || /^[a-z0-9][a-z0-9._/-]*:local$/.test(ref);
    for (const rel of walk(['deploy', 'testing'], (f) => /\.ya?ml$/.test(f))) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      for (const m of text.matchAll(/^\s*image:\s*["']?([^\s"'#]+)/gm)) {
        seen++;
        if (!pinned(m[1])) bad.push(`${rel}: ${m[1]}`);
      }
    }
    for (const rel of walk(
      ['deploy', 'testing'],
      (f) => /(^|\/)Dockerfile[^/]*$/.test(f) && !f.endsWith('.dockerignore'),
    )) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      const args = Object.fromEntries([...text.matchAll(/^ARG\s+(\w+)=(\S+)/gm)].map((m) => [m[1], m[2]]));
      for (const m of text.matchAll(/^FROM\s+(?:--platform=\S+\s+)?(\S+)/gm)) {
        seen++;
        const ref = m[1].replace(/^\$\{(\w+)\}$/, (_, n) => args[n] ?? '');
        if (!pinned(ref)) bad.push(`${rel}: FROM ${m[1]} (= ${ref || 'không có mặc định'})`);
      }
    }
    for (const rel of walk(['scripts'], (f) => f.endsWith('.sh'))) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      for (const m of text.matchAll(/^\s*IMAGE=["']?([^\s"']+)/gm)) {
        seen++;
        if (!pinned(m[1])) bad.push(`${rel}: ${m[1]}`);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('rào image không rỗng: bắt được image chưa ghim (đối chứng âm trên chuỗi mẫu)', () => {
    const sample =
      'services:\n  p:\n    image: ghcr.io/tecnativa/docker-socket-proxy:latest\n  n:\n    image: node:22-bookworm-slim\n';
    const refs = [...sample.matchAll(/^\s*image:\s*["']?([^\s"'#]+)/gm)].map((m) => m[1]);
    expect(refs).toEqual(['ghcr.io/tecnativa/docker-socket-proxy:latest', 'node:22-bookworm-slim']);
    expect(refs.every((r) => /@sha256:[0-9a-f]{64}$/.test(r))).toBe(false);
  });
});
