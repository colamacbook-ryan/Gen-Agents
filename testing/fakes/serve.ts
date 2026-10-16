#!/usr/bin/env node
// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
// Chạy một máy chủ giả độc lập (compose test, IT):
//   node serve.ts <vendor|telegram|update-feed|engine-source> [--host 0.0.0.0] [--port 8080] [--scenario <name|json>] [--pubkey-out <tệp>] [--fakes-root <thư mục>]
// In MỘT dòng JSON {"service","url","port"} lên stdout khi đã nghe; chạy tới khi bị kill.
import { writeFileSync } from 'node:fs';
import { startEngineSource } from './engine-source/server.ts';
import { startTelegram } from './telegram/server.ts';
import { startUpdateFeed } from './update-feed/server.ts';
import { startVendor } from './vendor/server.ts';

const args = process.argv.slice(2);
const service = args[0];
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const host = opt('host') ?? '127.0.0.1';
const port = Number(opt('port') ?? 0);
const scRaw = opt('scenario');
const scenario = scRaw === undefined ? undefined : scRaw.startsWith('{') ? JSON.parse(scRaw) : { name: scRaw };

const starters: Record<string, () => Promise<{ url: string; port: number }>> = {
  vendor: () => startVendor({ host, port, scenario }),
  telegram: () => startTelegram({ host, port }),
  'update-feed': async () => {
    const feed = await startUpdateFeed({ host, port });
    const out = opt('pubkey-out');
    if (out) writeFileSync(out, feed.publicKeyFile);
    return feed;
  },
  'engine-source': () =>
    startEngineSource({
      host,
      port,
      scenario,
      ...(opt('fakes-root') ? { fakesRoot: opt('fakes-root') as string } : {}),
    }),
};

const start = service ? starters[service] : undefined;
if (!start) {
  process.stderr.write(`dùng: serve.ts <${Object.keys(starters).join('|')}> [--host H] [--port N] [--scenario S]\n`);
  process.exit(2);
}
const r = await start();
process.stdout.write(`${JSON.stringify({ service, url: r.url, port: r.port })}\n`);
