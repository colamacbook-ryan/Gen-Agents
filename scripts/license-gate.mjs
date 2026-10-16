#!/usr/bin/env node

// Cổng license + asset (STD-04 §6, BUILD-PLAN §A.1 C15): sản phẩm đóng nguồn, có thể bán.
//   node scripts/license-gate.mjs              kiểm mọi gói đã cài + ASSET_MANIFEST.json + THIRD-PARTY.md khớp; sai ⇒ thoát 1
//   node scripts/license-gate.mjs --write      sinh lại THIRD-PARTY.md (sau khi thêm / đổi dependency)
//   node scripts/license-gate.mjs --selftest   chạy cổng trên gói / asset mồi (scripts/license-fixtures/): gói GPL, gói khai MIT
//                                              nhưng tệp LICENSE là GPL, gói không có tệp LICENSE, asset ngoài manifest,
//                                              asset license cấm ⇒ PHẢI đỏ; gói MIT thật ⇒ PHẢI xanh
// Luật:
//   - license đọc từ CHÍNH tệp LICENSE trong gói (không tin trường "license" của package.json một mình);
//   - gói phát hành (prod, kể cả gián tiếp): license trong `allow`, có tệp LICENSE, nội dung khớp khai báo;
//   - gói chỉ dùng lúc dev: được thêm `allowDevOnly`; thiếu tệp LICENSE chỉ là cảnh báo (không vào sản phẩm);
//   - bất kỳ gói nào khớp `deny` (GPL, AGPL, LGPL…) ⇒ đỏ;
//   - mọi asset (ảnh, font, âm thanh, tham số nhân vật trong skins/) phải có trong ASSET_MANIFEST.json, sha256 khớp,
//     license thuộc `assetLicenses`.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'scripts', 'license-fixtures');

// ---------------------------------------------------------------- nhận diện license từ văn bản
const TEXT_RULES = [
  ['AGPL-3.0', /GNU AFFERO GENERAL PUBLIC LICENSE/i],
  ['LGPL', /GNU LESSER GENERAL PUBLIC LICENSE|GNU LIBRARY GENERAL PUBLIC LICENSE/i],
  ['GPL-3.0', /GNU GENERAL PUBLIC LICENSE\s+Version 3/i],
  ['GPL-2.0', /GNU GENERAL PUBLIC LICENSE\s+Version 2/i],
  ['MPL-2.0', /Mozilla Public License,? (?:v\. |Version )2\.0/i],
  ['Apache-2.0', /Apache License\s*,?\s*Version 2\.0/i],
  ['BlueOak-1.0.0', /Blue Oak Model License/i],
  ['CC0-1.0', /CC0 1\.0 Universal/i],
  ['Unlicense', /This is free and unencumbered software released into the public domain/i],
  ['Python-2.0', /PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2/i],
  ['MIT', /Permission is hereby granted, free of charge, to any person obtaining a copy/i],
];

/**
 * Mọi license NHẬN RA trong một tệp (một tệp có thể gộp license của gói nhúng, vd LICENSE.md của vite).
 * MPL-2.0 tự nhắc tên GPL / LGPL / AGPL trong định nghĩa "Secondary License" ⇒ có MPL thì bỏ các tên GNU đó.
 */
export function classifyLicenseText(text) {
  const t = text.replace(/\s+/g, ' ');
  const found = new Set();
  for (const [id, re] of TEXT_RULES) if (re.test(t)) found.add(id);
  if (
    /Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee is hereby granted/i.test(
      t,
    )
  ) {
    found.add(/provided that the above copyright notice/i.test(t) ? 'ISC' : '0BSD');
  }
  if (/Redistribution and use in source and binary forms/i.test(t)) {
    found.add(/Neither the name|names of its contributors may be used/i.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause');
  }
  if (found.has('MPL-2.0')) for (const g of ['GPL-2.0', 'GPL-3.0', 'LGPL', 'AGPL-3.0']) found.delete(g);
  return [...found];
}

/** Tách biểu thức SPDX đơn giản: "(A OR B)" ⇒ [[A],[B]], "A AND B" ⇒ [[A,B]]. */
export function spdxAlternatives(expr) {
  const clean = String(expr ?? '')
    .replace(/[()]/g, ' ')
    .trim();
  if (!clean) return [];
  return clean.split(/\s+OR\s+/i).map((alt) => alt.split(/\s+AND\s+/i).map((s) => s.trim()));
}

const LICENSE_FILE = /^(licen[cs]e|copying)([-._].*)?$/i;

function licenseFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => LICENSE_FILE.test(f))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

const matchesDeny = (id, policy) => policy.deny.some((d) => id.toUpperCase().startsWith(d.toUpperCase()));

/**
 * Kiểm một gói. Trả { level: 'ok'|'warn'|'fail', license, detected, notes }.
 * `dev` = chỉ dùng lúc dev / build, không đi vào sản phẩm.
 */
export function checkPackage(pkg, policy) {
  const key = `${pkg.name}@${pkg.version}`;
  const exception = policy.exceptions?.[key];
  const notes = [];
  const alts = spdxAlternatives(pkg.declared);
  const files = licenseFiles(pkg.path);
  const perFile = files.map((f) => ({ f, ids: classifyLicenseText(readFileSync(f, 'utf8')) }));
  const detected = [...new Set(perFile.flatMap((x) => x.ids))];
  const unknownFiles = perFile.filter((x) => x.ids.length === 0).map((x) => relative(pkg.path, x.f));

  const allowedSet = new Set([...policy.allow, ...(pkg.dev ? policy.allowDevOnly : [])]);
  // chọn phương án SPDX đầu tiên mà mọi license trong đó được phép
  const chosen = alts.find((alt) => alt.every((id) => allowedSet.has(id) && !matchesDeny(id, policy)));
  const declaredDenied = alts.flat().filter((id) => matchesDeny(id, policy));
  const detectedDenied = detected.filter((id) => matchesDeny(id, policy));

  let level = 'ok';
  if (!chosen && declaredDenied.length > 0) {
    level = 'fail';
    notes.push(`license cấm: ${[...new Set(declaredDenied)].join(', ')}`);
  } else if (!chosen) {
    level = 'fail';
    notes.push(`license "${pkg.declared ?? 'không khai'}" không thuộc danh sách cho phép${pkg.dev ? ' (dev)' : ''}`);
  } else if (files.length === 0) {
    if (pkg.dev) {
      level = 'warn';
      notes.push('không kèm tệp LICENSE (chỉ dùng lúc dev)');
    } else {
      level = 'fail';
      notes.push('không có tệp LICENSE — coi như chưa cấp phép (STD-04 §6)');
    }
  } else if (detected.length === 0) {
    level = 'fail';
    notes.push(`không nhận ra nội dung tệp license (${unknownFiles.join(', ')})`);
  } else if (!detected.some((id) => chosen.includes(id))) {
    // tệp LICENSE không chứa license đã chọn ⇒ khai báo sai (nặng hơn nếu tệp là license cấm)
    level = 'fail';
    notes.push(
      `tệp LICENSE là ${detected.join(', ')}${detectedDenied.length ? ' (cấm)' : ''} nhưng package.json khai ${pkg.declared}`,
    );
  } else if (detected.length > 1) {
    notes.push(
      `tệp license còn nhắc: ${detected.filter((id) => !chosen.includes(id)).join(', ')} (gói nhúng — xem tệp)`,
    );
  }
  if (level === 'fail' && exception?.reason) {
    level = 'ok';
    notes.push(`ngoại lệ đã duyệt: ${exception.reason}`);
  }
  return { key, level, license: chosen ? chosen.join(' AND ') : (pkg.declared ?? '?'), detected, notes };
}

// ---------------------------------------------------------------- danh sách gói từ pnpm
function pnpmLicenses(prod) {
  const out = execFileSync('pnpm', ['licenses', 'list', '--json', ...(prod ? ['--prod'] : [])], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const data = JSON.parse(out);
  const list = [];
  for (const [declared, pkgs] of Object.entries(data)) {
    for (const p of pkgs) {
      p.versions.forEach((version, i) => {
        list.push({ name: p.name, version, declared, path: p.paths[i] ?? p.paths[0], homepage: p.homepage ?? '' });
      });
    }
  }
  return list;
}

function installedPackages() {
  const prodKeys = new Set(pnpmLicenses(true).map((p) => `${p.name}@${p.version}`));
  return pnpmLicenses(false)
    .map((p) => ({ ...p, dev: !prodKeys.has(`${p.name}@${p.version}`) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** Gói mồi trong một thư mục: mỗi thư mục con có package.json (devOnly: true ⇒ gói dev). */
function fixturePackages(dir) {
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, 'package.json')))
    .map((d) => {
      const pj = JSON.parse(readFileSync(join(dir, d, 'package.json'), 'utf8'));
      return {
        name: pj.name,
        version: pj.version,
        declared: pj.license,
        path: join(dir, d),
        dev: Boolean(pj.devOnly),
        homepage: '',
      };
    });
}

// ---------------------------------------------------------------- asset
const ASSET_EXT = /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm)$/i;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  'lint-fixtures',
  'license-fixtures',
  '__pycache__',
]);

function walk(dir, base, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, base, out);
    else out.push(relative(base, abs).split(sep).join('/'));
  }
  return out;
}

/** Asset = tệp media ở apps/, packages/, skins/ + mọi tệp trong skins/ (tham số nhân vật, manifest gói). */
function assetFiles(root) {
  return ['apps', 'packages', 'skins']
    .flatMap((top) => walk(join(root, top), root))
    .filter((rel) => ASSET_EXT.test(rel) || rel.startsWith('skins/'));
}

export function checkAssets(root, manifest, policy) {
  const problems = [];
  const entries = new Map((manifest.assets ?? []).map((a) => [a.path, a]));
  for (const rel of assetFiles(root)) {
    const a = entries.get(rel);
    if (!a) {
      problems.push(`${rel}: asset không có trong ASSET_MANIFEST.json`);
      continue;
    }
    if (!policy.assetLicenses.includes(a.license))
      problems.push(`${rel}: license asset "${a.license}" không được phép`);
    if (!a.source) problems.push(`${rel}: thiếu nguồn (source)`);
    if (a.license === 'CC-BY-4.0' && !a.attribution) problems.push(`${rel}: CC-BY cần ghi công (attribution)`);
    const sha = createHash('sha256')
      .update(readFileSync(join(root, rel)))
      .digest('hex');
    if (a.sha256 !== sha) problems.push(`${rel}: sha256 lệch manifest`);
  }
  for (const path of entries.keys()) {
    if (!existsSync(join(root, path))) problems.push(`${path}: có trong manifest nhưng không có tệp`);
  }
  return problems;
}

// ---------------------------------------------------------------- THIRD-PARTY.md
function renderThirdParty(results, pkgs) {
  const byKey = new Map(pkgs.map((p) => [`${p.name}@${p.version}`, p]));
  const row = (r) => {
    const p = byKey.get(r.key);
    const note = r.notes.length ? r.notes.join('; ') : '';
    return `| ${p.name} | ${p.version} | ${r.license} | ${r.detected.join(', ') || '—'} | ${note} |`;
  };
  const prod = results.filter((r) => !byKey.get(r.key).dev);
  const dev = results.filter((r) => byKey.get(r.key).dev);
  const head = '| Gói | Phiên bản | License | Nhận ra từ tệp LICENSE | Ghi chú |\n|---|---|---|---|---|';
  return [
    '# THIRD-PARTY — thành phần bên thứ ba',
    '',
    '> SINH TỰ ĐỘNG bởi `pnpm license:check -- --write` (scripts/license-gate.mjs). Không sửa tay — CI đỏ nếu lệch.',
    '> License đọc từ chính tệp LICENSE của từng gói (STD-04 §6). Chính sách: `scripts/license-policy.json`.',
    '',
    `## Đi vào sản phẩm (${prod.length} gói, gồm phụ thuộc gián tiếp)`,
    '',
    head,
    ...prod.map(row),
    '',
    'Ghi chú thành phần nhúng: `better-sqlite3` kèm SQLite (public domain — sqlite.org/copyright.html) trong bản build N-API.',
    '',
    `## Chỉ dùng lúc dev / build / test — không đóng gói vào sản phẩm (${dev.length} gói)`,
    '',
    head,
    ...dev.map(row),
    '',
    '## Image upstream chạy như chương trình riêng (aggregate, không liên kết)',
    '',
    'Chưa dùng ở M0. Khi compose thêm `caddy:2`, `tecnativa/docker-socket-proxy` (M1/M2): ghi vào đây + danh sách rà pháp lý trước khi bán.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- chạy
function loadPolicy() {
  return JSON.parse(readFileSync(join(ROOT, 'scripts', 'license-policy.json'), 'utf8'));
}

function report(results) {
  for (const r of results.filter((x) => x.level !== 'ok')) {
    console.log(`${r.level === 'fail' ? '✗' : '⚠'} ${r.key}: ${r.notes.join('; ')}`);
  }
}

function selftest(policy) {
  const pkgs = fixturePackages(join(FIXTURES, 'packages'));
  const results = pkgs.map((p) => checkPackage(p, policy));
  let bad = 0;
  for (const r of results) {
    const isBait = /bait/.test(r.key);
    const red = r.level === 'fail';
    const ok = isBait ? red : !red;
    if (!ok) bad++;
    console.log(
      `${ok ? '✓' : '✗'} ${r.key}: ${red ? 'ĐỎ' : 'xanh'}${isBait ? ' (mồi — phải đỏ)' : ' (đối chứng — phải xanh)'}${r.notes.length ? ` — ${r.notes.join('; ')}` : ''}`,
    );
  }
  const assetRoot = join(FIXTURES, 'assets');
  const manifest = JSON.parse(readFileSync(join(assetRoot, 'ASSET_MANIFEST.json'), 'utf8'));
  const problems = checkAssets(assetRoot, manifest, policy);
  for (const want of [
    'bait-unlisted.png: asset không có trong',
    'bait-nc.png: license asset "CC-BY-NC-4.0"',
    'bait-sha.svg: sha256 lệch',
  ]) {
    const hit = problems.some((p) => p.includes(want.split(':')[0]) && p.includes(want.split(': ')[1]));
    if (!hit) bad++;
    console.log(`${hit ? '✓' : '✗'} asset ${want.split(':')[0]}: ${hit ? 'ĐỎ (mồi — phải đỏ)' : 'KHÔNG bị bắt'}`);
  }
  const falsePos = problems.filter((p) => p.startsWith('skins/ok') || p.includes('ok-'));
  if (falsePos.length) bad++;
  console.log(
    `${falsePos.length ? '✗' : '✓'} asset đối chứng (ok-*): ${falsePos.length ? falsePos.join('; ') : 'xanh'}`,
  );
  console.log(
    bad ? `✗ license:check --selftest: ${bad} ca sai` : '✓ license:check --selftest: mọi mồi đỏ, mọi đối chứng xanh',
  );
  return bad === 0;
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const policy = loadPolicy();
  if (args.includes('--selftest')) return selftest(policy) ? 0 : 1;

  const pkgs = installedPackages().filter((p) => !p.name.startsWith('@ga/'));
  const results = pkgs.map((p) => checkPackage(p, policy));
  report(results);
  const fails = results.filter((r) => r.level === 'fail').length;

  const manifestPath = join(ROOT, 'ASSET_MANIFEST.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const assetProblems = checkAssets(ROOT, manifest, policy);
  for (const p of assetProblems) console.log(`✗ asset ${p}`);

  const md = renderThirdParty(results, pkgs);
  const mdPath = join(ROOT, 'THIRD-PARTY.md');
  let stale = false;
  if (args.includes('--write')) {
    writeFileSync(mdPath, md);
    console.log('✓ ghi THIRD-PARTY.md');
  } else if (!existsSync(mdPath) || readFileSync(mdPath, 'utf8') !== md) {
    stale = true;
    console.log('✗ THIRD-PARTY.md lệch danh sách gói — chạy `pnpm license:check -- --write` rồi commit');
  }
  const prodCount = pkgs.filter((p) => !p.dev).length;
  const warn = results.filter((r) => r.level === 'warn').length;
  const summary = `${pkgs.length} gói (${prodCount} vào sản phẩm), ${fails} lỗi, ${warn} cảnh báo; asset ${assetFiles(ROOT).length} tệp, ${assetProblems.length} lỗi`;
  if (fails || assetProblems.length || stale) {
    console.log(`✗ license:check: ${summary}`);
    return 1;
  }
  console.log(`✓ license:check: ${summary}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
