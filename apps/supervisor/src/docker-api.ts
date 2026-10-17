import { Agent, request } from 'node:http';
import type { Socket } from 'node:net';
import type { Readable, Writable } from 'node:stream';

// Máy khách Docker Engine API TỐI THIỂU trên node:http (thay dockerode — lý do: dockerode 5 kéo gRPC, protobufjs, ssh2 + addon
// gốc cpu-features vào TCB, và hai gói trong cây (split-ca, bcrypt-pbkdf) trượt cổng giấy phép STD-04). Chỉ đủ cho đúng các lời
// gọi supervisor dùng (driver docker, qua docker-socket-proxy): đường dẫn không gắn version (= API hiện hành của daemon).
// Lỗi luôn là DockerApiError có statusCode (null = lỗi kết nối / quá thời gian / quá cỡ) — không nuốt lỗi.

export class DockerApiError extends Error {
  readonly statusCode: number | null;
  constructor(statusCode: number | null, message: string) {
    super(message);
    this.name = 'DockerApiError';
    this.statusCode = statusCode;
  }
}

export interface DockerEndpoint {
  socketPath?: string;
  host?: string;
  port?: number;
}

/** `unix:///đường/sock` | `tcp://host:port` (docker-socket-proxy) ⇒ điểm kết nối. Dạng khác ⇒ ném lỗi. */
export function endpointFromHost(dockerHost: string): DockerEndpoint {
  if (dockerHost.startsWith('unix://')) {
    const p = dockerHost.slice('unix://'.length);
    if (!p.startsWith('/')) throw new DockerApiError(null, 'docker host unix:// phải là đường tuyệt đối');
    return { socketPath: p };
  }
  let u: URL;
  try {
    u = new URL(dockerHost.replace(/^tcp:/, 'http:'));
  } catch {
    throw new DockerApiError(null, 'docker host sai dạng');
  }
  if (u.protocol !== 'http:' || !u.hostname || !u.port || u.pathname !== '/' || u.username || u.password) {
    throw new DockerApiError(null, 'docker host phải là tcp://host:port hoặc unix:///đường');
  }
  return { host: u.hostname, port: Number(u.port) };
}

export const DOCKER_API_LIMITS = { maxBodyBytes: 8 * 1024 * 1024, timeoutMs: 60_000 } as const;

export interface DockerResponse {
  status: number;
  body: Buffer;
}

export type Query = Record<string, string | number | boolean>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  return `${path}?${q.toString()}`;
}

export class DockerApi {
  private readonly ep: DockerEndpoint;
  private readonly agent = new Agent({ keepAlive: true, maxSockets: 16 });

  constructor(ep: DockerEndpoint) {
    this.ep = ep;
  }

  /** Một lời gọi thường. KHÔNG ném theo mã HTTP (bên gọi quyết); ném DockerApiError(null) khi lỗi kết nối / quá cỡ / quá giờ. */
  call(
    method: string,
    path: string,
    o: { query?: Query; body?: unknown; timeoutMs?: number } = {},
  ): Promise<DockerResponse> {
    const payload = o.body === undefined ? null : Buffer.from(JSON.stringify(o.body), 'utf8');
    return new Promise((resolve, reject) => {
      const r = request(
        {
          ...this.ep,
          agent: this.agent,
          method,
          path: withQuery(path, o.query),
          timeout: o.timeoutMs ?? DOCKER_API_LIMITS.timeoutMs,
          headers: payload
            ? { 'content-type': 'application/json', 'content-length': payload.length }
            : { 'content-length': 0 },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (c: Buffer) => {
            size += c.length;
            if (size > DOCKER_API_LIMITS.maxBodyBytes) {
              res.destroy();
              reject(new DockerApiError(null, 'phản hồi Docker quá cỡ'));
              return;
            }
            chunks.push(c);
          });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
          res.on('error', () => reject(new DockerApiError(null, 'kết nối Docker bị cắt')));
        },
      );
      r.on('timeout', () => r.destroy(new DockerApiError(null, 'Docker không trả lời')));
      r.on('error', (e) =>
        reject(e instanceof DockerApiError ? e : new DockerApiError(null, 'không kết nối được Docker')),
      );
      r.end(payload ?? undefined);
    });
  }

  /** Như call nhưng mã ngoài `ok` ⇒ DockerApiError(mã); trả JSON đã parse (null nếu thân rỗng). */
  async json<T>(
    method: string,
    path: string,
    ok: readonly number[],
    o: { query?: Query; body?: unknown; timeoutMs?: number } = {},
  ): Promise<{ status: number; value: T | null }> {
    const r = await this.call(method, path, o);
    if (!ok.includes(r.status)) throw new DockerApiError(r.status, `Docker trả ${r.status}`);
    if (r.body.length === 0) return { status: r.status, value: null };
    try {
      return { status: r.status, value: JSON.parse(r.body.toString('utf8')) as T };
    } catch {
      throw new DockerApiError(r.status, 'phản hồi Docker không phải JSON');
    }
  }

  /**
   * POST + `Upgrade: tcp` (hijack — exec start có stdin): Docker trả 101 rồi socket thành luồng hai chiều thô. Không nâng cấp
   * được ⇒ DockerApiError(mã). Không timeout nhàn rỗi (phiên exec / PTY dài); bên gọi tự cắt bằng destroy().
   */
  hijack(path: string, body: unknown): Promise<Socket> {
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    return new Promise((resolve, reject) => {
      const r = request({
        ...this.ep,
        agent: false,
        method: 'POST',
        path,
        headers: {
          'content-type': 'application/json',
          'content-length': payload.length,
          connection: 'Upgrade',
          upgrade: 'tcp',
        },
      });
      r.on('upgrade', (_res, socket: Socket, head: Buffer) => {
        if (head.length > 0) socket.unshift(head);
        resolve(socket);
      });
      r.on('response', (res) => {
        res.resume();
        reject(new DockerApiError(res.statusCode ?? 0, `Docker không nâng cấp kết nối exec (${res.statusCode})`));
      });
      r.on('error', (e) =>
        reject(e instanceof DockerApiError ? e : new DockerApiError(null, 'không kết nối được Docker')),
      );
      r.end(payload);
    });
  }
}

/**
 * Tách luồng exec không TTY của Docker: mỗi khung = 8 byte đầu [loại (1 stdout, 2 stderr), 0, 0, 0, độ dài u32 BE] + dữ liệu.
 * Máy trạng thái: chuyển thẳng từng lát dữ liệu (không gom cả khung) ⇒ tuyến tính, bộ nhớ có trần. Loại lạ ⇒ lỗi giao thức:
 * hủy luồng nguồn (fail-closed — bên đọc thấy thiếu report).
 */
export function demuxDockerStream(src: Readable, stdout: Writable, stderr: Writable): void {
  const header = Buffer.alloc(8);
  let have = 0;
  let remaining = 0;
  let target: Writable | null = null;
  src.on('data', (chunk: Buffer) => {
    let i = 0;
    while (i < chunk.length) {
      if (remaining === 0) {
        const n = Math.min(8 - have, chunk.length - i);
        chunk.copy(header, have, i, i + n);
        have += n;
        i += n;
        if (have < 8) break;
        have = 0;
        const type = header[0];
        if (type !== 1 && type !== 2) {
          src.destroy(new DockerApiError(null, 'khung exec của Docker sai loại'));
          return;
        }
        target = type === 2 ? stderr : stdout;
        remaining = header.readUInt32BE(4);
        continue;
      }
      const n = Math.min(remaining, chunk.length - i);
      target?.write(chunk.subarray(i, i + n));
      remaining -= n;
      i += n;
    }
  });
}
