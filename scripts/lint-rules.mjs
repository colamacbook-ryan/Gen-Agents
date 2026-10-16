#!/usr/bin/env node
// Luật lint riêng của repo (BUILD-PLAN §D.2, §D.6, §C.6; CNS-142, 152, 161; STD-10; DATABASE §2.2).
// Dùng:
//   node scripts/lint-rules.mjs               quét repo, có vi phạm ⇒ thoát 1
//   node scripts/lint-rules.mjs --selftest    mỗi luật chạy trên mồi của nó (scripts/lint-fixtures/<luật>/): mọi tệp tên chứa
//                                             "bait" PHẢI bị bắt, mọi tệp khác KHÔNG được bắt ⇒ chứng minh luật còn sống
//   node scripts/lint-rules.mjs --list        in danh sách luật
// Không phụ thuộc gói ngoài (chạy được trước `pnpm install`).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'scripts', 'lint-fixtures');

const CODE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEXT_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|ya?ml|html|css|sql|txt|sh|toml)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.vite', '__pycache__']);

// ---------------------------------------------------------------- tiện ích
function walk(dir, base, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, base, out);
    else out.push(relative(base, abs).split(sep).join('/'));
  }
  return out;
}

const isTest = (rel) => /(^|\/)test(s)?\//.test(rel) || /\.test\.[cm]?[jt]sx?$/.test(rel) || rel.startsWith('testing/');

/**
 * Bỏ chú thích khỏi mã JS/TS (giữ nguyên số dòng). Xử lý chuỗi '…' "…" `…` để không cắt nhầm `//` trong URL.
 * Heuristic: không nhận diện regex literal — đủ cho mục đích lint.
 */
export function stripJsComments(src) {
  let out = '';
  let i = 0;
  let mode = 'code';
  let quote = '';
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') {
        mode = 'line';
        i += 2;
        continue;
      }
      if (c === '/' && n === '*') {
        mode = 'block';
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        mode = 'str';
        quote = c;
      }
      out += c;
      i++;
      continue;
    }
    if (mode === 'str') {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) mode = 'code';
      i++;
      continue;
    }
    if (mode === 'line') {
      if (c === '\n') {
        mode = 'code';
        out += c;
      }
      i++;
      continue;
    }
    // block
    if (c === '*' && n === '/') {
      mode = 'code';
      i += 2;
      continue;
    }
    if (c === '\n') out += c;
    i++;
  }
  return out;
}

function stripSqlComments(src) {
  return src.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
}

function codeOf(rel, text) {
  if (CODE_EXT.test(rel)) return stripJsComments(text);
  if (rel.endsWith('.sql')) return stripSqlComments(text);
  return text;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function findAll(text, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return [...text.matchAll(g)];
}

/** Đoạn văn bản từ dấu `(` tại `open` tới `)` khớp (bỏ qua chuỗi). */
function balancedParen(text, open) {
  let depth = 0;
  let quote = '';
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return text.slice(open);
}

// ---------------------------------------------------------------- regex có nguy cơ ReDoS (STD-11 1.10)
/** Thân các regex trong mã (đã bỏ chú thích): regex literal + `RegExp('…')` với chuỗi thường (template literal bỏ qua). */
export function regexBodies(code) {
  const out = [];
  const lit = /(^|[=(:,!&|?{};[>]|\breturn|\btypeof)\s*\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/[dgimsuyv]*/gm;
  for (const m of code.matchAll(lit)) out.push({ body: m[2], index: m.index + m[1].length });
  const ctor = /\bRegExp\(\s*(['"])((?:\\.|[^\\\n'"])*)\1/g;
  for (const m of code.matchAll(ctor)) out.push({ body: m[2].replace(/\\\\/g, '\\'), index: m.index });
  return out;
}

/**
 * Phân tích thân regex (không đầy đủ, đủ cho lint): trả lý do nếu có lookaround chứa quantifier không giới hạn (*, +, {n,})
 * hoặc nhóm có quantifier không giới hạn bên trong lại bị lượng hoá không giới hạn (vd (a+)+, (\w+\s?)*).
 */
export function redosRisk(body) {
  const stack = [{ unbounded: false, look: false }];
  let inClass = false;
  const unboundedAt = (i) => {
    const c = body[i];
    if (c === '*' || c === '+') return 1;
    if (c === '{') {
      const m = /^\{(\d+),\}/.exec(body.slice(i, i + 12));
      if (m) return m[0].length;
    }
    return 0;
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }
    if (c === '(') {
      const look = /^\(\?<?[=!]/.test(body.slice(i, i + 4));
      stack.push({ unbounded: false, look });
      continue;
    }
    if (c === ')') {
      const g = stack.pop() ?? { unbounded: false, look: false };
      if (g.look && g.unbounded) return 'lookaround chứa quantifier không giới hạn';
      const q = unboundedAt(i + 1);
      if (q && g.unbounded) return 'quantifier lồng (nhóm có * / + bị lượng hoá không giới hạn)';
      const parent = stack[stack.length - 1];
      if (parent && (g.unbounded || q)) parent.unbounded = true;
      if (q) i += q;
      continue;
    }
    const q = unboundedAt(i);
    if (q) {
      const top = stack[stack.length - 1];
      if (top) top.unbounded = true;
      i += q - 1;
    }
  }
  return null;
}

// ---------------------------------------------------------------- ký tự vô hình / fullwidth
/**
 * Độ rộng 0 (200B–200D, 2060–2064, FEFF, 180E), điều khiển hướng bidi (200E/200F, 202A–202E, 2066–2069, 061C), khoảng
 * trắng lạ (00A0, 2000–200A, 202F, 205F, 3000, 1680), gạch mềm 00AD, ngắt dòng 2028/2029, và fullwidth FF01–FF5E.
 * Regex viết bằng escape để chính tệp này không chứa ký tự cấm.
 */
const INVISIBLE_RE =
  /[\u00a0\u00ad\u061c\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u2064\u2066-\u2069\u3000\ufeff\uff01-\uff5e]/g;

// ---------------------------------------------------------------- ranh giới module (BUILD-PLAN §D.2)
// Ô ghi [ĐỀ XUẤT — L0] là đơn vị §D.2 chưa khai — Gen duyệt.
const BOUNDARIES = {
  'packages/contracts': [],
  'packages/db': ['packages/contracts', 'packages/security'],
  'packages/engines': ['packages/contracts'],
  'packages/security': ['packages/contracts'], // [ĐỀ XUẤT — L0]
  'packages/i18n': [], // [ĐỀ XUẤT — L0]
  'packages/chibi': ['packages/contracts'], // [ĐỀ XUẤT — L0]
  'packages/ui': ['packages/contracts', 'packages/i18n', 'packages/chibi'], // [ĐỀ XUẤT — L0]
  'packages/testkit': ['packages/contracts', 'packages/db', 'packages/security', 'packages/engines'], // [ĐỀ XUẤT — L0]
  'apps/control-plane': ['packages/contracts', 'packages/db', 'packages/engines', 'packages/security', 'packages/i18n'],
  'apps/supervisor': ['packages/contracts', 'packages/security'],
  'apps/updater': ['packages/contracts', 'packages/security'],
  'apps/egress': ['packages/contracts', 'packages/security'], // [ĐỀ XUẤT — L0]
  // Gen quyết 2026-10-16 (HIGH allowlist-semantic-escape): runner dựng argv từ adapter @ga/engines đóng sẵn trong image
  'apps/runner': ['packages/contracts', 'packages/security', 'packages/engines'],
  'apps/web': ['packages/contracts', 'packages/ui', 'packages/chibi', 'packages/i18n'],
};
/** Chỉ import KIỂU (import type) — web lấy AppType của control-plane cho client `hc`. */
const TYPE_ONLY_ALLOWED = { 'apps/web': ['apps/control-plane'] };

function unitOf(rel) {
  const m = /^(packages|apps)\/([^/]+)\//.exec(rel);
  return m ? `${m[1]}/${m[2]}` : null;
}

function packageUnits(root) {
  const map = new Map();
  for (const top of ['packages', 'apps']) {
    const dir = join(root, top);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const pj = join(dir, name, 'package.json');
      if (!existsSync(pj)) continue;
      try {
        const pkgName = JSON.parse(readFileSync(pj, 'utf8')).name;
        if (pkgName) map.set(pkgName, `${top}/${name}`);
      } catch {
        // package.json hỏng: để tsc / pnpm báo
      }
    }
  }
  return map;
}

const IMPORT_RES = [
  /(^|[\s;])(import|export)\s+(type\s+)?[^'"`;]*?\sfrom\s+['"]([^'"]+)['"]/g,
  /(^|[\s;])(import)\s+()['"]([^'"]+)['"]/g,
  /(^|[^\w.])(import)\s*\(\s*()['"]([^'"]+)['"]\s*\)/g,
  /(^|[^\w.])(require)\s*\(\s*()['"]([^'"]+)['"]\s*\)/g,
];

function importsOf(code) {
  const out = [];
  for (const re of IMPORT_RES) {
    for (const m of code.matchAll(re)) {
      out.push({
        spec: m[4],
        typeOnly: Boolean(m[3]) && m[2] !== 'require',
        dynamic: re === IMPORT_RES[2],
        index: m.index + m[1].length,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- luật
const CLI_MODEL_NAMES =
  /\b(agy|antigravity|claude(?:-code)?|codex|openclaw|gemini(?:-[\w.]+)?|gpt-?\d[\w.-]*|opus|sonnet|haiku|llama\d*|mistral|grok|deepseek|qwen)\b/i;
const OWNER_NAMES = /\b(ryan|colamacbook)\b/i;
const SECRET_ENV_NAME = /[A-Z0-9_]*(?:_OAUTH_TOKEN|SESSION)[A-Z0-9_]*/;

export const RULES = [
  {
    id: 'no-or-replace',
    why: 'cấm INSERT/UPDATE OR REPLACE, REPLACE INTO, Kysely .orReplace()/.replaceInto() ngoài db/spec + migration (DATABASE §2.2, §9.3)',
    applies: (rel) =>
      (CODE_EXT.test(rel) || rel.endsWith('.sql')) &&
      !rel.startsWith('db/spec/') &&
      !/^packages\/db\/migrations\//.test(rel) &&
      !isTest(rel) &&
      rel !== 'scripts/lint-rules.mjs',
    check(rel, text) {
      const code = codeOf(rel, text);
      const res = [/\bOR\s+REPLACE\b/i, /\bREPLACE\s+INTO\b/i, /\.orReplace\s*\(/, /\.replaceInto\s*\(/];
      return res.flatMap((re) => findAll(code, re).map((m) => ({ line: lineOf(code, m.index), msg: `"${m[0]}"` })));
    },
  },
  {
    id: 'no-model-cli-names',
    why: 'tên CLI / model cụ thể chỉ ở packages/engines/src/adapters và testing/ (STD-10, INT-05)',
    applies: (rel) =>
      CODE_EXT.test(rel) && /^(apps|packages)\//.test(rel) && !rel.startsWith('packages/engines/src/adapters/'),
    check(rel, text) {
      const code = codeOf(rel, text);
      return findAll(code, CLI_MODEL_NAMES).map((m) => ({ line: lineOf(code, m.index), msg: `"${m[0]}"` }));
    },
  },
  {
    id: 'no-owner-name',
    why: 'không hardcode tên owner cụ thể trong apps/, packages/, skins/ — fixtures được miễn (INT-12, STD-06, CNS-161)',
    applies: (rel) => TEXT_EXT.test(rel) && /^(apps|packages|skins)\//.test(rel) && !/(^|\/)fixtures\//.test(rel),
    /** Bản sinh từ DB spec: chỉ cảnh báo — sửa tại nguồn (Second-Brain, lane DB) rồi `pnpm db:sync`. */
    warnOnly: (rel) => /^packages\/db\/(migrations|src\/generated)\//.test(rel),
    check(_rel, text) {
      return findAll(text, OWNER_NAMES).map((m) => ({ line: lineOf(text, m.index), msg: `"${m[0]}"` }));
    },
  },
  {
    id: 'no-secret-env-names',
    why: 'không tiêm env tên *_OAUTH_TOKEN / *SESSION* vào container — vé / token không bao giờ đi qua env (CNS-142)',
    applies: (rel) =>
      ((CODE_EXT.test(rel) && /^(apps|packages)\//.test(rel)) ||
        (/^deploy\//.test(rel) && /\.(ya?ml|sh|env)$/.test(rel))) &&
      !isTest(rel),
    check(rel, text) {
      const code = codeOf(rel, text);
      const out = [];
      // (a) dạng Docker Env: "NAME=…" trong chuỗi, hoặc "- NAME=…" trong YAML
      for (const m of findAll(code, new RegExp(`(?:['"\`]|^\\s*-\\s*)(${SECRET_ENV_NAME.source})=`, 'm'))) {
        out.push({ line: lineOf(code, m.index), msg: `env ${m[1]}` });
      }
      // (b) khoá object trên dòng có nói tới env: { FOO_SESSION: … } / environment: FOO_SESSION: …
      code.split('\n').forEach((line, i) => {
        if (!/\benv\b|\bEnv\b|environment/i.test(line)) return;
        for (const m of line.matchAll(new RegExp(`['"]?\\b(${SECRET_ENV_NAME.source})\\b['"]?\\s*:`, 'g'))) {
          out.push({ line: i + 1, msg: `env ${m[1]}` });
        }
      });
      if (/\.ya?ml$/.test(rel)) {
        code.split('\n').forEach((line, i) => {
          const m = new RegExp(`^\\s+(${SECRET_ENV_NAME.source})\\s*:`).exec(line);
          if (m) out.push({ line: i + 1, msg: `env ${m[1]}` });
        });
      }
      return out;
    },
  },
  {
    id: 'no-console-log',
    why: 'apps/ dùng logger có bộ lọc che bí mật (pino), không console.log (DATABASE §9.5 bước 7)',
    applies: (rel) => CODE_EXT.test(rel) && rel.startsWith('apps/') && !isTest(rel),
    check(rel, text) {
      const code = codeOf(rel, text);
      return findAll(code, /\bconsole\.log\s*\(/).map((m) => ({ line: lineOf(code, m.index), msg: 'console.log' }));
    },
  },
  {
    id: 'dockerode-only-in-supervisor',
    why: 'chỉ apps/supervisor được dùng dockerode (TCB duy nhất cầm Docker API — BUILD-PLAN §B.3, CNS-143)',
    applies: (rel) => (CODE_EXT.test(rel) || rel.endsWith('package.json')) && !rel.startsWith('apps/supervisor/'),
    check(rel, text) {
      if (rel.endsWith('package.json')) {
        let pkg;
        try {
          pkg = JSON.parse(text);
        } catch {
          return [];
        }
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.optionalDependencies,
          ...pkg.peerDependencies,
        };
        return Object.keys(deps).some((d) => d === 'dockerode')
          ? [{ line: lineOf(text, text.indexOf('"dockerode"')), msg: 'phụ thuộc dockerode' }]
          : [];
      }
      const code = codeOf(rel, text);
      return importsOf(code)
        .filter((i) => i.spec === 'dockerode' || i.spec.startsWith('dockerode/'))
        .map((i) => ({ line: lineOf(code, i.index), msg: `import "${i.spec}"` }));
    },
  },
  {
    id: 'no-io-in-transaction',
    why: 'không gọi mạng / tiến trình con / await trong transaction đồng bộ (DATABASE §2.2, §10.7) — heuristic',
    applies: (rel) => CODE_EXT.test(rel) && /^(apps|packages)\//.test(rel) && !isTest(rel),
    check(rel, text) {
      const code = codeOf(rel, text);
      const out = [];
      for (const m of findAll(code, /\.(transaction|write|bootstrap|maintenance)\s*\(/)) {
        const body = balancedParen(code, m.index + m[0].length - 1);
        // write / bootstrap / maintenance của AppConnection nhận callback; `.write(` không callback (stream…) thì bỏ qua
        if (m[1] !== 'transaction' && !/=>|\bfunction\b/.test(body)) continue;
        const bad =
          /\bfetch\s*\(|child_process|\bspawn(?:Sync)?\s*\(|\bexecFile(?:Sync)?\s*\(|\bexecSync\s*\(|\bhttps?\.request\s*\(|\bawait\s/.exec(
            body,
          );
        if (bad) out.push({ line: lineOf(code, m.index), msg: `"${bad[0].trim()}" trong transaction` });
      }
      return out;
    },
  },
  {
    id: 'db-write-only-via-write',
    why: 'mọi ghi DB của app đi qua conn.write(actorId, fn) (khởi tạo: conn.bootstrap, bảo trì: conn.maintenance) — app_actor() gắn actor cho từng giao dịch (hợp đồng ⑥-05, DB v2.3.3, CNS-170)',
    applies: (rel) =>
      CODE_EXT.test(rel) &&
      /^(apps|packages)\//.test(rel) &&
      !isTest(rel) &&
      !rel.startsWith('packages/db/src/runner/') &&
      !rel.startsWith('packages/db/scripts/') &&
      rel !== 'packages/db/src/connection.ts',
    check(rel, text) {
      const code = codeOf(rel, text);
      const spans = findAll(code, /\.(?:write|bootstrap|maintenance)\s*\(/).map((m) => {
        const open = m.index + m[0].length - 1;
        return [open, open + balancedParen(code, open).length];
      });
      const inWrite = (i) => spans.some(([a, b]) => i >= a && i < b);
      const pats = [
        /\bINSERT\s+(?:OR\s+\w+\s+)?INTO\b/i,
        /\bUPDATE\s+(?:OR\s+\w+\s+)?["`\w.]+\s+SET\b/i,
        /\bDELETE\s+FROM\b/i,
        /\.(?:insertInto|updateTable|deleteFrom|replaceInto|mergeInto)\s*\(/,
      ];
      return pats.flatMap((re) =>
        findAll(code, re)
          .filter((m) => !inWrite(m.index))
          .map((m) => ({
            line: lineOf(code, m.index),
            msg: `ghi DB ngoài conn.write() / bootstrap() / maintenance(): "${m[0]}"`,
          })),
      );
    },
  },
  {
    id: 'db-actor-columns-from-context',
    why: 'created_by / updated_by / deleted_by lấy từ actor của giao dịch qua stampInsert / stampUpdate / stampSoftDelete của @ga/db, không viết tay / nhận từ tham số (CNS-176, STD-11 1.13)',
    applies: (rel) =>
      CODE_EXT.test(rel) &&
      /^(apps|packages)\//.test(rel) &&
      !isTest(rel) &&
      !/^(apps\/web|packages\/ui|packages\/chibi|packages\/contracts)\//.test(rel) &&
      !/^packages\/db\/(src\/(generated|runner|seed)\/|scripts\/)/.test(rel) &&
      rel !== 'packages/db/src/stamp.ts' &&
      rel !== 'packages/db/src/connection.ts',
    check(rel, text) {
      const code = codeOf(rel, text);
      const out = [];
      const hit = (index, what) =>
        out.push({ line: lineOf(code, index), msg: `${what} — dùng stampInsert / stampUpdate / stampSoftDelete` });
      // khoá object (giá trị cho Kysely .values / .set, tham số repo, kiểu dòng viết tay)
      for (const m of findAll(code, /(?:^|[{,(\s])['"]?((?:created|updated|deleted)_by)['"]?\s*\??:/m)) {
        hit(m.index, `khoá ${m[1]}`);
      }
      // SQL: cột *_by trong danh sách cột INSERT
      for (const m of findAll(code, /\bINSERT\s+INTO\s+["`\w.]+\s*\(([^)]{0,2000})\)/i)) {
        const c = /\b(?:created|updated|deleted)_by\b/.exec(m[1]);
        if (c) hit(m.index, `INSERT ghi ${c[0]}`);
      }
      // SQL: gán *_by trong mệnh đề SET (đến WHERE / hết chuỗi)
      for (const m of findAll(code, /\bSET\s/gi)) {
        const tail = code.slice(m.index, m.index + 2000);
        const end = tail.search(/\bWHERE\b|['"`;]/i);
        const clause = end === -1 ? tail : tail.slice(0, end);
        const c = /\b(?:created|updated|deleted)_by\s*=/.exec(clause);
        if (c) hit(m.index, `SET ${c[0]}`);
      }
      return out;
    },
  },
  {
    id: 'db-privileged-api-paths',
    why: 'conn.bootstrap() / conn.maintenance() (actor system, app_maint()=1) chỉ gọi trong packages/db — nơi khác gọi hàm đã xuất của @ga/db (CNS-170)',
    applies: (rel) =>
      CODE_EXT.test(rel) &&
      /^(apps|packages)\//.test(rel) &&
      !isTest(rel) &&
      !rel.startsWith('packages/db/') &&
      !/^(apps\/web|packages\/ui|packages\/chibi)\//.test(rel),
    check(rel, text) {
      const code = codeOf(rel, text);
      return findAll(code, /\.(?:bootstrap|maintenance)\s*\(/).map((m) => ({
        line: lineOf(code, m.index),
        msg: `API đặc quyền của kết nối DB ngoài packages/db: "${m[0]}"`,
      }));
    },
  },
  {
    id: 'engine-plans-only-in-runner',
    why: 'turnPlan / loginCheck / capabilityScan / loginArgv chỉ được gọi trong apps/runner (và packages/engines, testkit): control plane gửi ý định, không dựng argv (HIGH allowlist-semantic-escape, Gen quyết 2026-10-16)',
    applies: (rel) =>
      CODE_EXT.test(rel) &&
      /^(apps|packages)\//.test(rel) &&
      !isTest(rel) &&
      !rel.startsWith('apps/runner/') &&
      !rel.startsWith('packages/engines/') &&
      !rel.startsWith('packages/testkit/') &&
      !rel.startsWith('packages/contracts/'),
    check(rel, text) {
      const code = codeOf(rel, text);
      return findAll(code, /\.(?:turnPlan|loginCheck|capabilityScan|loginArgv)\s*\(/).map((m) => ({
        line: lineOf(code, m.index),
        msg: `dựng plan / argv engine ngoài ga-runner: "${m[0]}"`,
      }));
    },
  },
  {
    id: 'no-invisible-chars',
    why: 'cấm ký tự vô hình (độ rộng 0, điều khiển bidi, khoảng trắng lạ như NBSP, BOM) và ký tự fullwidth trong mã nguồn apps/ + packages/ — chỉ được viết dạng escape (\\u200b…) (trojan-source, homoglyph)',
    applies: (rel) => TEXT_EXT.test(rel) && /^(apps|packages)\//.test(rel),
    check(_rel, text) {
      const out = [];
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const m of (lines[i] ?? '').matchAll(INVISIBLE_RE)) {
          const cp = m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
          out.push({
            line: i + 1,
            msg: `ký tự U+${cp} ở cột ${m.index + 1} — viết dạng escape \\u${cp.toLowerCase()}`,
          });
        }
      }
      return out;
    },
  },
  {
    id: 'no-redos-regex',
    why: 'regex không được có lookaround chứa * / + hoặc quantifier lồng — nguy cơ ReDoS (STD-11 1.10, L-20261016-30)',
    applies: (rel) => CODE_EXT.test(rel) && /^(apps|packages)\//.test(rel) && !isTest(rel),
    check(rel, text) {
      const code = codeOf(rel, text);
      const out = [];
      for (const r of regexBodies(code)) {
        const why = redosRisk(r.body);
        if (why) out.push({ line: lineOf(code, r.index), msg: `${why}: /${r.body.slice(0, 60)}/` });
      }
      return out;
    },
  },
  {
    id: 'no-duplicate-component-names',
    why: 'component trong apps/web/src/routes/** không trùng tên component dùng chung ở packages/ui/src/** (CNS-152)',
    global: true,
    check(files, read) {
      const comps = (prefix) => {
        const map = new Map();
        for (const rel of files.filter((f) => f.startsWith(prefix) && /\.tsx$/.test(f))) {
          const text = stripJsComments(read(rel));
          const names = new Set();
          for (const m of text.matchAll(/export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g))
            names.add(m[1]);
          const base = posix.basename(rel, '.tsx');
          if (/^[A-Z]/.test(base)) names.add(base);
          for (const n of names) map.set(n, [...(map.get(n) ?? []), rel]);
        }
        return map;
      };
      const routes = comps('apps/web/src/routes/');
      const ui = comps('packages/ui/src/');
      const out = [];
      for (const [name, where] of routes) {
        if (ui.has(name)) {
          for (const rel of where)
            out.push({ file: rel, line: 1, msg: `component ${name} trùng ${ui.get(name).join(', ')}` });
        }
      }
      return out;
    },
  },
  {
    id: 'import-boundaries',
    why: 'ranh giới module BUILD-PLAN §D.2 (+ testkit chỉ import tĩnh từ testing/**, dynamic import có guard)',
    global: true,
    check(files, read, root) {
      const pkgs = packageUnits(root);
      const out = [];
      for (const rel of files.filter((f) => CODE_EXT.test(f))) {
        const unit = unitOf(rel);
        const fromTesting = rel.startsWith('testing/');
        if (!unit && !fromTesting) continue;
        const code = stripJsComments(read(rel));
        for (const imp of importsOf(code)) {
          let target = null;
          if (imp.spec.startsWith('@ga/')) {
            const name = imp.spec.split('/').slice(0, 2).join('/');
            target = pkgs.get(name) ?? `?${name}`;
          } else if (imp.spec.startsWith('.')) {
            const abs = posix.normalize(posix.join(posix.dirname(rel), imp.spec));
            target = unitOf(`${abs}/`) ?? (abs.startsWith('testing/') ? null : null);
            if (target === unit) continue;
            if (target && unit) {
              out.push({
                file: rel,
                line: lineOf(code, imp.index),
                msg: `import tương đối vượt ranh giới ${unit} → ${target} (dùng @ga/*)`,
              });
              continue;
            }
            continue;
          } else continue;
          if (target === unit) continue;
          if (target.startsWith('?')) {
            out.push({
              file: rel,
              line: lineOf(code, imp.index),
              msg: `không có package ${target.slice(1)} trong workspace`,
            });
            continue;
          }
          if (target === 'packages/testkit') {
            if (fromTesting || imp.dynamic) continue;
            out.push({
              file: rel,
              line: lineOf(code, imp.index),
              msg: 'import tĩnh @ga/testkit ngoài testing/** (chỉ dynamic import có guard)',
            });
            continue;
          }
          if (fromTesting) continue;
          const allowed = BOUNDARIES[unit];
          if (!allowed) {
            out.push({
              file: rel,
              line: lineOf(code, imp.index),
              msg: `${unit} chưa khai ranh giới trong scripts/lint-rules.mjs (PR "contract")`,
            });
            continue;
          }
          if (allowed.includes(target)) continue;
          if (imp.typeOnly && (TYPE_ONLY_ALLOWED[unit] ?? []).includes(target)) continue;
          out.push({
            file: rel,
            line: lineOf(code, imp.index),
            msg: `${unit} không được import ${target} (${imp.spec})`,
          });
        }
      }
      return out;
    },
  },
];

// ---------------------------------------------------------------- chạy
export function runRules(root, { only = null, exclude = () => false } = {}) {
  const files = walk(root, root).filter((f) => !exclude(f));
  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) cache.set(rel, readFileSync(join(root, rel), 'utf8'));
    return cache.get(rel);
  };
  const errors = [];
  const warnings = [];
  for (const rule of RULES) {
    if (only && rule.id !== only) continue;
    if (rule.global) {
      for (const v of rule.check(files, read, root)) errors.push({ rule: rule.id, ...v });
      continue;
    }
    for (const rel of files) {
      if (!rule.applies(rel)) continue;
      for (const v of rule.check(rel, read(rel))) {
        const item = { rule: rule.id, file: rel, ...v };
        if (rule.warnOnly?.(rel)) warnings.push(item);
        else errors.push(item);
      }
    }
  }
  return { errors, warnings, files: files.length };
}

const REPO_EXCLUDE = (rel) =>
  rel.startsWith('scripts/lint-fixtures/') || rel.startsWith('scripts/license-fixtures/') || rel === 'pnpm-lock.yaml';

function selftest() {
  let failed = 0;
  for (const rule of RULES) {
    const dir = join(FIXTURES, rule.id);
    if (!existsSync(dir)) {
      console.log(`✗ ${rule.id}: thiếu mồi scripts/lint-fixtures/${rule.id}/`);
      failed++;
      continue;
    }
    const files = walk(dir, dir);
    const baits = files.filter((f) => /bait/.test(f));
    const { errors } = runRules(dir, { only: rule.id });
    const hit = new Set(errors.map((e) => e.file));
    const missed = baits.filter((b) => !hit.has(b));
    const falsePos = [...hit].filter((f) => !/bait/.test(f));
    if (baits.length === 0 || missed.length > 0 || falsePos.length > 0) {
      failed++;
      console.log(
        `✗ ${rule.id}: bắt ${baits.length - missed.length}/${baits.length} mồi${missed.length ? ` (lọt: ${missed.join(', ')})` : ''}${falsePos.length ? `; báo nhầm: ${falsePos.join(', ')}` : ''}`,
      );
    } else {
      console.log(
        `✓ ${rule.id}: bắt ${baits.length}/${baits.length} mồi, 0 báo nhầm trên ${files.length - baits.length} tệp sạch / được miễn`,
      );
    }
  }
  console.log(
    failed
      ? `✗ lint:rules --selftest: ${failed}/${RULES.length} luật hỏng`
      : `✓ lint:rules --selftest: ${RULES.length}/${RULES.length} luật bắt đúng mồi`,
  );
  return failed === 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const r of RULES) console.log(`${r.id} — ${r.why}`);
    return 0;
  }
  if (args.includes('--selftest')) return selftest() ? 0 : 1;
  const { errors, warnings, files } = runRules(ROOT, { exclude: REPO_EXCLUDE });
  for (const w of warnings) console.log(`⚠ ${w.file}:${w.line} [${w.rule}] ${w.msg} (cảnh báo — sửa ở nguồn)`);
  for (const e of errors) console.log(`✗ ${e.file}:${e.line} [${e.rule}] ${e.msg}`);
  if (errors.length) {
    console.log(`✗ lint:rules: ${errors.length} vi phạm (${files} tệp, ${RULES.length} luật)`);
    return 1;
  }
  console.log(`✓ lint:rules: 0 vi phạm, ${warnings.length} cảnh báo (${files} tệp, ${RULES.length} luật)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
