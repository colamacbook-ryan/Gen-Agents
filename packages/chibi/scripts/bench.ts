// Đo fps trong Chromium headless: node scripts/bench.ts [--secs=10] [--rounds=1]
// Hai bố cục chuẩn của lane: 30 chibi cỡ 64 px và 10 chibi cỡ 160 px (trạng thái trải đều 16 trạng thái).
// Headless raster bằng CPU, không GPU: số này chỉ dùng để SO SÁNH giữa các bản, không phải số của máy thật.
import { cpus, loadavg } from 'node:os';
import { launch } from '../test/support/browser.ts';
import { startServer } from '../test/support/server.ts';

const arg = (k: string, d: number): number =>
  Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const secs = arg('secs', 10);
const rounds = arg('rounds', 1);
const LAYOUTS = [
  { n: 30, size: 64 },
  { n: 10, size: 160 },
];

const server = await startServer();
const browser = await launch();
console.log(`cpu ${cpus().length} lõi, load đầu ${loadavg()[0]?.toFixed(2)}, mỗi lượt ${secs}s`);
for (let r = 1; r <= rounds; r++) {
  for (const l of LAYOUTS) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`${server.url}/test/browser/bench.html?n=${l.n}&size=${l.size}&secs=${secs}`);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    const res = await page.evaluate(() => (window as unknown as { __bench(): Promise<unknown> }).__bench());
    console.log(`lượt ${r}: ${JSON.stringify(res)} load ${loadavg()[0]?.toFixed(2)}`);
    await page.close();
  }
}
await browser.close();
await server.close();
