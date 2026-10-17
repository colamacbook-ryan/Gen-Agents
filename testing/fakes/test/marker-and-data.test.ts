// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAKES_MARKER } from '../lib/common.ts';
import { FAKES_DIR } from './helpers.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(FAKES_DIR, p).split('\\').join('/');
const all = walk(FAKES_DIR);

describe('đánh dấu "chỉ dùng cho test, không vào image phát hành"', () => {
  const sources = all
    .filter((p) => /\.ts$/.test(p) && !rel(p).startsWith('test/'))
    .concat(all.filter((p) => rel(p).startsWith('bin/')));

  it('mọi tệp nguồn (ts + bin/*) mang marker ở 3 dòng đầu', () => {
    expect(sources.map(rel)).toContain('lib/common.ts'); // bộ quét thật sự thấy tệp
    const missing = sources
      .filter((p) => !readFileSync(p, 'utf8').split('\n').slice(0, 3).join('\n').includes(FAKES_MARKER))
      .map(rel);
    expect(missing).toEqual([]);
  });

  it('package.json tự nhận là KHÔNG VÀO IMAGE PHÁT HÀNH', () => {
    const pkg = JSON.parse(readFileSync(join(FAKES_DIR, 'package.json'), 'utf8')) as {
      private: boolean;
      description: string;
    };
    expect(pkg.private).toBe(true);
    expect(pkg.description).toMatch(/KHÔNG BAO GIỜ VÀO IMAGE PHÁT HÀNH/);
  });
});

// sha256 của dữ liệu chép từ Spike 1b (help-dumps/). models.tsv = agy-models-fakekey.txt bỏ dòng "Fetching…"; changelog.txt = 8 dòng đầu
// (mục 1.3.5) của agy-run-changelog.txt. Mọi tệp còn lại là BYTE-FOR-BYTE. Đổi tay một tệp dữ liệu ⇒ test này đỏ.
const SHA256: Record<string, string> = {
  'agy/dumps/changelog.txt': '71a96e1aa6af90ada058c64ef617e37442ee01691aed6992d8d16a1e67a1b3b3',
  'agy/dumps/help-agent.txt': '4ef5be3186b272fbf218d35fbbb4dd859aa0279b1db0327ba2931d52e9286179',
  'agy/dumps/help-changelog.txt': 'aa31a929bbb0628cd0c040800256a16d1e202c897ed6437be384cd45f8191f6d',
  'agy/dumps/help-install.txt': 'a1412465b715e8ae38ec3f43663f407e39fc99b0315cc23bd2bab552cfdbd3e7',
  'agy/dumps/help-mcp-add.txt': '80d5196d6293a29ba14337ad34cd11ea6c2ef43d2119b27d31ccd3df2baf98f6',
  'agy/dumps/help-mcp-list.txt': '5d506255bae6a58810a4202cb8dbfd3a648571f330fc3dcbf59d49dbab946580',
  'agy/dumps/help-mcp.txt': 'd568d5fa81b2d7798f70f97f46c44977f41b3e051c70cac1f2216f6b67ddfeb9',
  'agy/dumps/help-mic-serve.txt': '60cf4d660c0b1831d1025fa83ff075e92d5236ca3f81e68c61674294d262a794',
  'agy/dumps/help-models.txt': '1900b38b303a620b25c15b47fdf0fc745e267f5deab455749947735800c46386',
  'agy/dumps/help-plugin.txt': '90d647cdad7d0babb525a36170702fb2016b3e77573d60a83568d77ac40c3456',
  'agy/dumps/help-remote-control-start.txt': '1c416281580bbc90d4c510a226d04f220ded5a8aa6e2e2452743785cf0234b5a',
  'agy/dumps/help-remote-control.txt': 'a2eaa2ab2d9df1ca12c3c733688ea975257e56b2bee1ddb0bccc4b5d8b336f67',
  'agy/dumps/help-update.txt': '08eaabe6131d0686768306b745e931bcfd520546b8fefcd564572e935d33b303',
  'agy/dumps/help.txt': 'a12355e8fc064b330eeb25ba52de596406582752442e293083bcda6388a63b78',
  'agy/dumps/models.tsv': '66bafd5a9c7867ec4607cd9ad162ebf6d8376b9d3d854bf836cf7c655da2cb49',
  'agy/dumps/version.txt': 'fc253dae4f432925780b608f87298fbbd2f948cd811d2e894cdcbb98ec855d2e',
  'claude/dumps/help.txt': '550db4f88ae1d97bf7244ca96dc89554aabd3978241ceb69f79001e816c35f09',
  'claude/dumps/version.txt': 'ef4d2897d99d5c08a3b3983ad569ca6dff51c2bb752b5974abb610572da3c18e',
};

describe('dữ liệu chép từ Spike 1b: nguyên vẹn + đã rà PII', () => {
  const dataFiles = all.filter((p) => /\/dumps\//.test(p.split('\\').join('/')));

  it('đúng tập tệp dữ liệu đã duyệt, đúng sha256', () => {
    const got = Object.fromEntries(
      dataFiles.map((p) => [rel(p), createHash('sha256').update(readFileSync(p)).digest('hex')]),
    );
    expect(got).toEqual(SHA256);
  });

  // PII: email thật, đường dẫn HOME / thư mục phiên, định danh phiên của máy nguồn, tên owner, token có hình dạng thật.
  const PII: Array<[string, RegExp]> = [
    ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
    ['đường dẫn home', /\/(?:home|Users|root)\/[A-Za-z0-9._-]+/],
    ['thư mục tạm của phiên', /\/tmp\/claude/],
    ['session id', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/],
    ['tên owner / tổ chức', /Ryan|Afi/],
    ['token hình dạng thật', /ya29\.|sk-ant-|AIza|1\/\/0|refresh_token/],
  ];
  for (const [name, re] of PII) {
    it(`không có ${name} trong dữ liệu`, () => {
      const hits = dataFiles.filter((p) => re.test(readFileSync(p, 'utf8'))).map(rel);
      expect(hits).toEqual([]);
    });
  }

  it('bộ quét PII thật sự bắt được (ca âm cho chính bộ quét)', () => {
    const bait = 'đường dẫn /home/someone/x, mail a@b.com, id d2d8964a-839b-58cf-9f92-5e4e7b42636e';
    expect(PII.filter(([, re]) => re.test(bait)).map(([n]) => n)).toEqual(['email', 'đường dẫn home', 'session id']);
  });
});
