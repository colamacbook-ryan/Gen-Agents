// Tiến trình control plane: đọc cấu hình, dựng phụ thuộc, mount handler PRODUCTION, mở cổng (BUILD-PLAN §B.2, §B.4).
// Cấu hình: env chỉ mang giá trị KHÔNG bí mật (cổng, đường tệp, origin). Khoá đọc từ TỆP secret (`*_FILE`, compose
// `secrets:`) — khoá thô trong env ⇒ TỪ CHỐI khởi động (assertNoRawKeysInEnv). Không đọc argv.
//   GA_CONTROL_PLANE_LISTEN   host:port (mặc định 0.0.0.0:7401 — sau Caddy :7400)
//   GA_ALLOWED_ORIGINS        origin của GUI, phân tách dấu phẩy (vd http://localhost:7400)
//   GA_SECURE_COOKIES         "1" khi sau HTTPS (cookie Secure + __Host-)
//   GA_DB_PATH                mặc định /data/db/gen.sqlite
//   GENAGENTS_MASTER_KEY_FILE mặc định /run/secrets/ga_master_key (keyring: dòng đầu = khoá hiện hành)
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Clock, systemClock } from '@ga/contracts';
import { openReader, openWriter } from '@ga/db';
import { masterKeyring } from '@ga/db/audit-writer';
import { createSqliteStore } from '@ga/db/sqlite';
import { assertNoRawKeysInEnv, deriveSubkey, keyFilePath, loadMasterKeyringFromFile } from '@ga/security';
import { serve } from '@hono/node-server';
import { type CreatedApp, createApp } from './app.ts';
import { AuthService, SqliteAuthStore } from './auth/index.ts';
import { InMemoryEventBus } from './events/bus.ts';
import { PRODUCTION_HANDLERS } from './http/handlers.ts';
import { createStderrLogger, formatLogLine, type Logger } from './http/logger.ts';

export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerConfigError';
  }
}

export interface ServerConfig {
  host: string;
  port: number;
  allowedOrigins: string[];
  secureCookies: boolean;
  dbPath: string;
  masterKeyFile: string;
}

const ORIGIN_RE = /^https?:\/\/[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$/;

export function loadServerConfig(env: Readonly<Record<string, string | undefined>>): ServerConfig {
  try {
    assertNoRawKeysInEnv(env);
  } catch (e) {
    throw new ServerConfigError(e instanceof Error ? e.message : 'khoá thô trong env');
  }
  const listen = env.GA_CONTROL_PLANE_LISTEN ?? '0.0.0.0:7401';
  const m = /^([A-Za-z0-9.-]{1,253}|\[[0-9a-fA-F:]{2,39}\]):([0-9]{1,5})$/.exec(listen);
  const port = m ? Number(m[2]) : Number.NaN;
  if (!m || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ServerConfigError('GA_CONTROL_PLANE_LISTEN sai dạng (host:port)');
  }
  const allowedOrigins = (env.GA_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of allowedOrigins) if (!ORIGIN_RE.test(o)) throw new ServerConfigError('GA_ALLOWED_ORIGINS sai dạng');
  const dbPath = env.GA_DB_PATH ?? '/data/db/gen.sqlite';
  if (!/^\/[A-Za-z0-9_./-]{1,255}$/.test(dbPath))
    throw new ServerConfigError('GA_DB_PATH phải là đường tuyệt đối an toàn');
  const secure = env.GA_SECURE_COOKIES ?? '0';
  if (secure !== '0' && secure !== '1') throw new ServerConfigError('GA_SECURE_COOKIES phải là 0 hoặc 1');
  return {
    host: (m[1] as string).replace(/^\[|\]$/g, ''),
    port,
    allowedOrigins,
    secureCookies: secure === '1',
    dbPath,
    masterKeyFile: keyFilePath('masterKey', env),
  };
}

export interface RunningServer {
  readonly port: number;
  close(): Promise<void>;
}

/** Mở cổng cho một app đã dựng. `port: 0` ⇒ cổng ngẫu nhiên (test). */
export async function startServer(created: CreatedApp, opts: { host: string; port: number }): Promise<RunningServer> {
  const server = serve({ fetch: created.fetch, hostname: opts.host, port: opts.port });
  await new Promise<void>((resolve, reject) => {
    if (server.listening) resolve();
    else {
      server.once('listening', () => resolve());
      server.once('error', reject);
    }
  });
  const addr = server.address() as AddressInfo;
  return {
    port: addr.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Dựng toàn bộ phụ thuộc production từ cấu hình. RecoveryProvider của L-SYS chưa có ⇒ fail-closed (coi như recovery). */
export function buildProductionApp(cfg: ServerConfig, opts: { clock?: Clock; logger?: Logger } = {}): CreatedApp {
  const clock = opts.clock ?? systemClock;
  const logger = opts.logger ?? createStderrLogger();
  const keyring = loadMasterKeyringFromFile(cfg.masterKeyFile);
  const writer = openWriter(cfg.dbPath, { clock });
  const reader = openReader(cfg.dbPath, { clock });
  const keys: Record<string, Buffer> = {};
  for (const id of keyring.ids()) keys[id] = keyring.get(id)?.key as Buffer;
  const store = createSqliteStore({ writer, reader, auditKeys: masterKeyring(keys, keyring.current.id) });
  const auth = new AuthService({
    store: new SqliteAuthStore(writer),
    clock,
    csrfKey: deriveSubkey(keyring.current.key, 'csrf'),
    secureCookies: cfg.secureCookies,
    allowedOrigins: cfg.allowedOrigins,
  });
  return createApp(
    { writer, reader, store, auth, clock, events: new InMemoryEventBus({ clock }), logger },
    PRODUCTION_HANDLERS,
  );
}

/** Điểm vào: `node apps/control-plane/src/server.ts` (image: entrypoint `control-plane`). */
export async function main(env: Readonly<Record<string, string | undefined>> = process.env): Promise<RunningServer> {
  const cfg = loadServerConfig(env);
  const logger = createStderrLogger();
  const created = buildProductionApp(cfg, { logger });
  const running = await startServer(created, { host: cfg.host, port: cfg.port });
  logger.log('info', 'server.listening', { host: cfg.host, port: running.port, routes: created.mounted.length });
  return running;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(formatLogLine('error', 'server.start_failed', { err }));
    process.exitCode = 1;
  });
}
