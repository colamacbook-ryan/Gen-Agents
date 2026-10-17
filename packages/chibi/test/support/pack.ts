import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChibiParams } from '../../src/index.ts';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const PACK_DIR = join(REPO, 'skins', 'tam-quoc-chibi', '1.0.0');
/** 10 mã đúng research/tam-quoc-characters.csv, theo thứ tự hiển thị trong Kho */
export const CODES = [
  'tq046',
  'tq044',
  'tq080',
  'tq043',
  'tq045',
  'tq047',
  'tq010',
  'tq141',
  'tq031',
  'tqx001',
] as const;
/** id ngắn của spike (chỉ dùng để đối chiếu tài liệu; engine không biết các tên này) */
export const SLUGS = [
  'zhuge',
  'guan',
  'cao',
  'liubei',
  'zhangfei',
  'zhaoyun',
  'diaochan',
  'sunshangxiang',
  'huatuo',
  'tieutot',
];

export const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(PACK_DIR, rel), 'utf8'));
export const manifest = (): { characters: { file: string; asset_code: string }[] } & Record<string, unknown> =>
  readJson('manifest.json') as never;
export const rawSpec = (code: string): ChibiParams => readJson(`characters/${code}.json`) as ChibiParams;
export const rawSpecs = (): ChibiParams[] => CODES.map(rawSpec);
export const clone = <T>(v: T): T => structuredClone(v);
