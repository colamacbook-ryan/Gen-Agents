// IT runtime: chạy engine-source của L-FAKE với slug = slug adapter thật (@ga/engines), tên binary = binaryName của adapter.
import { startEngineSource } from '/fakes/engine-source/server.ts';

const s = await startEngineSource({
  host: '0.0.0.0',
  port: 8080,
  fakesRoot: '/opt/ga-fakes',
  engines: [
    { slug: 'antigravity', bin: 'agy', entry: 'agy/main.ts', version: '1.3.5' },
    { slug: 'claude-code', bin: 'claude', entry: 'claude/main.ts', version: '2.1.299' },
  ],
});
void s;
process.stdout.write('engine-source ready\n');
