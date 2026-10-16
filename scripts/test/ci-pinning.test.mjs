// Chuỗi cung ứng CI (review tay M0, LOW): rào tự động để không tái phạm —
//   action ghim SHA commit 40 hex · checkout không lưu token · không nội suy ${{ }} vào `run:` · image ghim @sha256.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
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

  it('image trong compose / script ghim @sha256', () => {
    const files = [
      ...readdirSync(join(ROOT, 'deploy', 'compose')).map((f) => join('deploy', 'compose', f)),
      ...readdirSync(join(ROOT, 'scripts'))
        .filter((f) => f.endsWith('.sh'))
        .map((f) => join('scripts', f)),
    ];
    const bad = [];
    let seen = 0;
    for (const rel of files) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      for (const m of text.matchAll(/^\s*(?:image:\s*|IMAGE=")([^\s"#]+)/gm)) {
        seen++;
        if (!/@sha256:[0-9a-f]{64}$/.test(m[1])) bad.push(`${rel}: ${m[1]}`);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });
});
