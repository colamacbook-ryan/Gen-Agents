import { API_AUTH, type ErrorCode, type Route, requestSchemaOf, responseSchemaOf, routeById } from '@ga/contracts';
import { serializeQuery } from '../client.ts';
import type { AnyInput } from '../routes.ts';
import { type FakeContext, FIXTURES } from './fixtures.ts';
import { FakeBackendError, FakeFixtureError, FakeHttpError } from './http.ts';

// Đường chạy MỘT fixture, dùng chung cho backend (mỗi request) và cho `verifyFixtures` (meta-test): request dạng trên dây → kiểm theo
// schema request của hợp đồng → handler → kiểm response theo schema response. Sai ở bước nào cũng ném ngay.

export interface WireRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

/** Kiểu đã bỏ generic: kiểu chặt của từng fixture đã được `satisfies` kiểm ở fixtures.ts. */
interface AnyFixture {
  example: AnyInput;
  respond(req: unknown, ctx: FakeContext): unknown;
}
const ALL = FIXTURES as unknown as Record<string, AnyFixture | undefined>;
const anyFixture = (id: string): AnyFixture | undefined => ALL[id];

export const hasFixture = (id: string): boolean => anyFixture(id) !== undefined;

/** Lỗi kiểm request: client gửi sai ⇒ HTTP 400 (không phải lỗi fixture). */
export function parseRequest(
  route: Route,
  wire: WireRequest,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: FakeHttpError } {
  const candidate: Record<string, unknown> = {};
  if (route.request.params) candidate.params = wire.params;
  if (route.request.query) candidate.query = wire.query;
  if (route.request.headers) candidate.headers = wire.headers;
  if (route.request.body) candidate.body = wire.body;
  const r = requestSchemaOf(route).safeParse(candidate);
  if (r.success) return { ok: true, data: r.data as Record<string, unknown> };
  const issue = r.error.issues[0];
  const inQuery = issue?.path[0] === 'query' || issue?.path.length === 0;
  const code: ErrorCode = route.errors.includes('query.invalid') && inQuery ? 'query.invalid' : 'validation.failed';
  return {
    ok: false,
    error: new FakeHttpError(
      code,
      code === 'query.invalid'
        ? { reason: 'unknown_field' }
        : { field: String(issue?.path.at(-1) ?? 'body').slice(0, 64) },
    ),
  };
}

export async function runFixture(routeId: string, req: Record<string, unknown>, ctx: FakeContext): Promise<unknown> {
  const route = routeById(routeId);
  const fixture = anyFixture(routeId);
  if (!route || !fixture)
    throw new FakeBackendError(`chưa có fixture cho ${routeId} — thêm vào src/api/fake/fixtures.ts`);
  const out = await fixture.respond({ params: req.params ?? {}, query: req.query ?? {}, body: req.body } as never, ctx);
  const schema = responseSchemaOf(route);
  if (schema) {
    const r = schema.safeParse(out);
    if (!r.success) throw new FakeFixtureError(routeId, 'response', r.error);
  }
  return out;
}

/** Kiểm MỌI fixture: request mẫu qua schema request, handler chạy được, response qua schema response. Ném ở fixture sai đầu tiên. */
export async function verifyFixtures(makeCtx: () => FakeContext): Promise<string[]> {
  const ids: string[] = [];
  for (const [id, fx] of Object.entries(ALL as Record<string, AnyFixture>)) {
    const route = routeById(id);
    if (!route) throw new FakeBackendError(`fixture ${id}: route không có trong registry`);
    const ex = fx.example;
    const wire: WireRequest = {
      params: Object.fromEntries(Object.entries(ex.params ?? {}).map(([k, v]) => [k, String(v)])),
      query: serializeQuery(ex.query),
      headers: route.idempotent ? { [API_AUTH.idempotencyHeader]: 'idem-meta-test-0001' } : {},
      body: ex.body,
    };
    const parsed = parseRequest(route, wire);
    if (!parsed.ok) throw new FakeFixtureError(id, 'request', parsed.error);
    await runFixture(id, parsed.data, makeCtx());
    ids.push(id);
  }
  return ids;
}
