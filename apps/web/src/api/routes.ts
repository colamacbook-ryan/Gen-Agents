// Kiểu của client API suy ra từ registry hợp đồng (`@ga/contracts` api/*): `api.call('OPS-33', { params, query })` có kiểu từ
// schema của chính route đó — không viết tay kiểu nào ở web. `defineLane` xoá literal `id` khỏi kiểu route, nên id → route đi
// qua TÊN export (`OPS-33` ↔ `OPS_33`); test `routes.test.ts` kiểm mọi route trong ROUTES đều có export tương ứng.
import type * as C from '@ga/contracts';
import type { z } from 'zod';
import type { INVALIDATIONS } from './invalidation.ts';

type Lane = 'SYS' | 'GW' | 'WRK' | 'OPS' | 'EXT';
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type ExportName = Extract<keyof typeof C, `${Lane}_${Digit}${Digit}`>;
type ToId<N extends string> = N extends `${infer P}_${infer D}` ? `${P}-${D}` : never;
type ToExport<Id extends string> = Id extends `${infer P}-${infer D}` ? `${P}_${D}` : never;

/** Mọi id route của registry ('SYS-01' … 'OPS-37'), suy ra từ tên export. */
export type RouteId = ToId<ExportName>;
export type RouteDef<Id extends RouteId> = (typeof C)[ToExport<Id> & ExportName];

type ResponseKind<Id extends RouteId> = RouteDef<Id>['response']['kind'];

/** Route gọi được bằng `api.call` (không phải luồng SSE / WebSocket). */
export type CallId = { [I in RouteId]: ResponseKind<I> extends 'sse' | 'ws' ? never : I }[RouteId];
/**
 * Route ghi = khoá của bảng vô hiệu hoá (`INVALIDATIONS`). Kiểu route của hợp đồng không giữ literal `method` (defineLane xoá),
 * nên không suy được GET / ghi ở mức kiểu: `invalidation.test.ts` đối chiếu bảng với `ROUTES` (mọi route không-GET phải có mục).
 */
export type WriteId = Extract<keyof typeof INVALIDATIONS, CallId>;
/** Route đọc → `useRouteQuery`. */
export type ReadId = Exclude<CallId, WriteId>;
/** Route SSE (SYS-85, OPS-24). */
export type StreamId = { [I in RouteId]: ResponseKind<I> extends 'sse' ? I : never }[RouteId];

type Req<Id extends RouteId> = RouteDef<Id>['request'];
type Part<Id extends RouteId, K extends 'params' | 'query' | 'body'> =
  Req<Id> extends Record<K, infer S extends z.ZodType> ? S : never;

type Empty = Record<never, never>;
type ParamsIn<Id extends RouteId> = [Part<Id, 'params'>] extends [never] ? never : z.input<Part<Id, 'params'>>;
// Query gõ theo ĐẦU RA của schema (số, mảng, boolean) — client tự tuần tự hoá thành chuỗi trên dây.
type QueryIn<Id extends RouteId> = [Part<Id, 'query'>] extends [never] ? never : z.output<Part<Id, 'query'>>;
type BodyIn<Id extends RouteId> = [Part<Id, 'body'>] extends [never] ? never : z.input<Part<Id, 'body'>> | FormData;

type Slot<K extends string, V> = [V] extends [never] ? Empty : Empty extends V ? { [P in K]?: V } : { [P in K]: V };

export type CallInput<Id extends RouteId> = Slot<'params', ParamsIn<Id>> &
  Slot<'query', QueryIn<Id>> &
  Slot<'body', BodyIn<Id>>;

export interface CallOptions {
  signal?: AbortSignal;
  /** ghi đè khoá idempotency (mặc định client tự sinh một khoá cho cả lần gọi và mọi lần thử lại) */
  idempotencyKey?: string;
}

export type CallArgs<Id extends RouteId> =
  Empty extends CallInput<Id>
    ? [input?: CallInput<Id>, opts?: CallOptions]
    : [input: CallInput<Id>, opts?: CallOptions];

export interface CsvPayload {
  text: string;
  /** `X-Content-SHA256` nếu máy chủ gửi ở header (hash gửi dạng trailer thì fetch không đọc được ⇒ null) */
  sha256: string | null;
}

export type CallResult<Id extends RouteId> = RouteDef<Id>['response'] extends {
  kind: 'json';
  schema: infer S extends z.ZodType;
}
  ? z.output<S>
  : RouteDef<Id>['response'] extends { kind: 'empty' }
    ? undefined
    : RouteDef<Id>['response'] extends { kind: 'csv' }
      ? CsvPayload
      : RouteDef<Id>['response'] extends { kind: 'binary' }
        ? Blob
        : never;

/** Biến của mutation: bỏ qua được khi route không có tham số bắt buộc. */
export type MutationVars<Id extends RouteId> = Empty extends CallInput<Id> ? CallInput<Id> | undefined : CallInput<Id>;

/** Đầu vào đã bỏ kiểu, dùng bên trong client / fake / hook. */
export interface AnyInput {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
}
