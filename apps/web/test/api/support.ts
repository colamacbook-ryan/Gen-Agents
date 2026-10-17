// Hàm fetch giả có ghi lại từng lần gọi — để test client API soi đúng những gì đi ra dây.
export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  signal: AbortSignal | null | undefined;
}

export type Responder = (call: Call, n: number) => Response | Promise<Response>;

export function recordingFetch(responder: Responder) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of new Headers(init?.headers).entries()) headers[k] = v;
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
      signal: init?.signal,
    };
    calls.push(call);
    return responder(call, calls.length);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const errorBody = (code: string, extra: Record<string, unknown> = {}) => ({
  error: { code, i18nKey: `errors.${code}`, requestId: 'req-test-0001', ...extra },
});

export const ULID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
export const noSleep = (): Promise<void> => Promise.resolve();
