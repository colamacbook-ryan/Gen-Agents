import { readFileSync } from 'node:fs';
import { PTY } from '@ga/contracts';

// Cấu hình ga-supervisor. Biến môi trường chỉ chứa giá trị KHÔNG bí mật (đường tệp, tên mạng, ảnh…). Bí mật (khoá RPC,
// khoá vé terminal) đọc từ TỆP secret (compose `secrets:`), không bao giờ từ env — env đọc được qua Docker API (CNS-143).
// Có biến bí mật trong env ⇒ TỪ CHỐI khởi động (fail-closed).

export interface SupervisorConfig {
  listenHost: string;
  listenPort: number;
  /** 32 byte (tệp: 64 hex hoặc base64 của 32 byte — cùng định dạng với @ga/security parseKeyText). */
  supervisorKey: Buffer;
  termTicketKey: Buffer;
  /** URL MCP gateway trên mạng ga-roles — đặt vào env GA_GATEWAY_URL của exec lượt (contracts execEnv). */
  gatewayUrl: string;
  dockerHost: string;
  /** Ảnh runtime duy nhất được phép, ghim digest (`name@sha256:…` hoặc ID `sha256:…`). */
  runtimeImage: string;
  rolesNetwork: string;
  enginesVolume: string;
  egressProxyUrl: string;
  /** Host gateway / control plane trên mạng ga-roles (NO_PROXY cho container). */
  noProxy: string;
  termAllowedOrigins: string[];
  ptyMaxDurationSeconds: number;
  /** Chỉ image test: URL máy chủ trình cài giả. Thiếu ⇒ nguồn `fake` bị từ chối. */
  fakeEngineSourceUrl: string | null;
  version: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const DIGEST_IMAGE_RE = /^(?:[a-z0-9][a-z0-9._/:-]{0,200}@sha256:[0-9a-f]{64}|sha256:[0-9a-f]{64})$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const PROXY_RE = /^http:\/\/[A-Za-z0-9.-]{1,253}:[0-9]{1,5}$/;
const SECRET_ENV = [
  'GA_SUPERVISOR_KEY',
  'GA_TERM_TICKET_KEY',
  'GA_UPDATER_KEY',
  'GA_EGRESS_KEY',
  'GENAGENTS_MASTER_KEY',
];

/**
 * Đọc khoá 32 byte từ tệp secret: dòng đầu là 64 ký tự hex, hoặc base64 / base64url của đúng 32 byte (cùng quy ước với
 * @ga/security `parseKeyText` của L-SEC — ga-app ký, supervisor kiểm bằng cùng byte). Lỗi không kèm nội dung.
 * TODO(L-SEC): thay bằng `loadKeyFile` của @ga/security khi gói đó vào nhánh.
 */
export function readKeyFile(path: string, what: string): Buffer {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`không đọc được tệp secret ${what}`);
  }
  const t = (raw.split(/\r?\n/)[0] ?? '').trim();
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(t)) key = Buffer.from(t, 'hex');
  else if (/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(t)) {
    const b = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (b.length === 32) key = b;
  }
  if (!key)
    throw new ConfigError(`tệp secret ${what} sai dạng (64 hex hoặc base64 của 32 byte) — nội dung không in ra`);
  return key;
}

export function loadConfig(env: NodeJS.ProcessEnv): SupervisorConfig {
  for (const name of Object.keys(env)) {
    if (SECRET_ENV.includes(name)) {
      throw new ConfigError(`bí mật không được đi qua env (${name}) — dùng tệp secret`);
    }
  }
  const [host, portStr] = (env.GA_SUPERVISOR_LISTEN ?? '0.0.0.0:7402').split(':');
  const port = Number(portStr);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new ConfigError('GA_SUPERVISOR_LISTEN sai dạng');
  const runtimeImage = env.GA_RUNTIME_IMAGE ?? '';
  if (!DIGEST_IMAGE_RE.test(runtimeImage))
    throw new ConfigError('GA_RUNTIME_IMAGE phải ghim digest (…@sha256:… hoặc sha256:…)');
  const rolesNetwork = env.GA_ROLES_NETWORK ?? 'gen-agents_roles';
  const enginesVolume = env.GA_ENGINES_VOLUME ?? 'ga-engines';
  if (!NAME_RE.test(rolesNetwork) || !NAME_RE.test(enginesVolume)) throw new ConfigError('tên mạng / volume sai dạng');
  const egressProxyUrl = env.GA_EGRESS_PROXY_URL ?? 'http://ga-egress:3128';
  if (!PROXY_RE.test(egressProxyUrl)) throw new ConfigError('GA_EGRESS_PROXY_URL phải là http://host:port');
  const noProxy = env.GA_NO_PROXY ?? 'ga-app';
  if (!/^[A-Za-z0-9.,-]{1,512}$/.test(noProxy)) throw new ConfigError('GA_NO_PROXY sai dạng');
  const maxDur = Number(env.GA_PTY_MAX_DURATION_S ?? PTY.maxDurationSeconds);
  if (!Number.isInteger(maxDur) || maxDur < 2 || maxDur > PTY.maxDurationSeconds) {
    throw new ConfigError(`GA_PTY_MAX_DURATION_S phải trong 2..${PTY.maxDurationSeconds}`);
  }
  const origins = (env.GA_TERM_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of origins)
    if (!/^https?:\/\/[A-Za-z0-9.:-]{1,300}$/.test(o)) throw new ConfigError('GA_TERM_ALLOWED_ORIGINS sai dạng');
  const fake = env.GA_FAKE_ENGINE_SOURCE_URL ?? null;
  if (fake !== null && !/^https?:\/\/[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$/.test(fake)) {
    throw new ConfigError('GA_FAKE_ENGINE_SOURCE_URL sai dạng');
  }
  const gatewayUrl = env.GA_GATEWAY_URL ?? 'http://ga-app:7410';
  if (!/^https?:\/\/[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$/.test(gatewayUrl))
    throw new ConfigError('GA_GATEWAY_URL sai dạng');
  const dockerHost = env.GA_DOCKER_HOST ?? 'tcp://ga-socket-proxy:2375';
  if (!/^(tcp:\/\/[A-Za-z0-9.-]{1,253}:[0-9]{1,5}|unix:\/\/\/[A-Za-z0-9_./-]{1,200})$/.test(dockerHost)) {
    throw new ConfigError('GA_DOCKER_HOST phải là tcp://host:port hoặc unix:///đường');
  }
  return {
    listenHost: host,
    listenPort: port,
    supervisorKey: readKeyFile(env.GA_SUPERVISOR_KEY_FILE ?? '/run/secrets/ga_supervisor_key', 'GA_SUPERVISOR_KEY'),
    termTicketKey: readKeyFile(env.GA_TERM_TICKET_KEY_FILE ?? '/run/secrets/ga_term_ticket_key', 'GA_TERM_TICKET_KEY'),
    gatewayUrl,
    dockerHost,
    runtimeImage,
    rolesNetwork,
    enginesVolume,
    egressProxyUrl,
    noProxy,
    termAllowedOrigins: origins,
    ptyMaxDurationSeconds: maxDur,
    fakeEngineSourceUrl: fake,
    version: env.GA_VERSION ?? '0.0.0-dev',
  };
}
