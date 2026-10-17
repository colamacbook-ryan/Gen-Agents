// Đăng ký handler từ registry route của contracts (BACKEND-TRIAL §3.1): `defineHandler('SYS-12', async (input, ctx) => …)`.
//   - KIỂU suy từ hợp đồng: `input.params/query/body/headers` = output zod ĐÃ validate (strict); giá trị trả về = input của
//     schema response (`ok(schema)` ⇒ z.input<schema>, `noContent()` ⇒ void, sse / csv / binary ⇒ RawBody).
//   - id không có trong registry ⇒ lỗi biên dịch (RouteId suy từ tên export `SYS_12` của contracts) + throw lúc chạy.
//   - Mỗi lane xuất `handlers: readonly Handler[]` ở thư mục của mình; createApp nhận mảng gộp (trùng id ⇒ throw lúc khởi động).
import type * as C from '@ga/contracts';
import { type Route, routeById, type StoredState } from '@ga/contracts';
import type { z } from 'zod';
import type { HandlerContext } from '../context/context.ts';

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type RouteExportName = Extract<keyof typeof C, `${'SYS' | 'GW' | 'WRK' | 'OPS' | 'EXT'}_${Digit}${Digit}`>;
type ExportToId<N> = N extends `${infer P}_${infer D}` ? `${P}-${D}` : never;
type IdToExport<Id> = Id extends `${infer P}-${infer D}` ? `${P}_${D}` : never;

/** Mọi id route của registry (202): `'SYS-01' | … | 'EXT-05'`. */
export type RouteId = ExportToId<RouteExportName>;
/** Định nghĩa route (kiểu đầy đủ, chưa xoá generic) theo id. */
export type RouteSpec<Id extends RouteId> = (typeof C)[IdToExport<Id> & RouteExportName];

type ReqOf<Id extends RouteId> = RouteSpec<Id> extends { readonly request: infer Q } ? Q : never;
type ResOf<Id extends RouteId> = RouteSpec<Id> extends { readonly response: infer S } ? S : never;
type PartOut<Q, K extends 'params' | 'query' | 'body' | 'headers'> = Q extends { readonly [P in K]: infer T }
  ? T extends z.ZodType
    ? z.output<T>
    : undefined
  : undefined;

/** Thân response dạng luồng / tệp (sse, csv, binary) — không có schema để kiểm: handler tự chịu trách nhiệm nội dung. */
export interface RawBody {
  readonly raw: ReadableStream<Uint8Array> | Uint8Array | string;
  /** Tên tệp tải về (csv / binary): chỉ giữ ký tự an toàn `[A-Za-z0-9._-]`. */
  readonly filename?: string;
}

export interface HandlerInput<Id extends RouteId> {
  readonly params: PartOut<ReqOf<Id>, 'params'>;
  readonly query: PartOut<ReqOf<Id>, 'query'>;
  readonly body: PartOut<ReqOf<Id>, 'body'>;
  readonly headers: PartOut<ReqOf<Id>, 'headers'>;
}

export type HandlerOutput<Id extends RouteId> =
  ResOf<Id> extends { readonly kind: 'json'; readonly schema: infer S }
    ? S extends z.ZodType
      ? z.input<S>
      : never
    : ResOf<Id> extends { readonly kind: 'empty' }
      ? // biome-ignore lint/suspicious/noConfusingVoidType: handler 204 viết `async () => {}` (Promise<void>)
        void
      : ResOf<Id> extends { readonly kind: 'sse' | 'csv' | 'binary' }
        ? RawBody
        : never;

/** Input đã validate, đã xoá kiểu (pipeline dùng). */
export interface ValidatedInput {
  readonly params: unknown;
  readonly query: unknown;
  readonly body: unknown;
  readonly headers: unknown;
}

export interface Handler {
  /** Route của registry (đúng object của `routeById`). */
  readonly route: Route;
  readonly run: (input: ValidatedInput, ctx: HandlerContext) => Promise<unknown>;
  /**
   * Trạng thái ĐÃ LƯU cho `ownerWhen` theo DB (vd `egress_loosen` của OPS-08: `egressAction` của luật bị xoá). Edge gọi SAU
   * validate, TRƯỚC handler (chỉ đọc: ctx.ref / ctx.read). Không khai ⇒ điều kiện theo trạng thái coi như khớp ⇒ `O`.
   */
  readonly stored?: (input: ValidatedInput, ctx: HandlerContext) => StoredState | Promise<StoredState>;
}

export interface HandlerOptions<Id extends RouteId> {
  stored?: NoInfer<(input: HandlerInput<Id>, ctx: HandlerContext) => StoredState | Promise<StoredState>>;
}

export function defineHandler<Id extends RouteId>(
  id: Id,
  // NoInfer: Id suy CHỈ từ `id` ⇒ fn nhận kiểu ngữ cảnh đầy đủ (literal của response không bị nới thành string)
  fn: NoInfer<(input: HandlerInput<Id>, ctx: HandlerContext) => HandlerOutput<Id> | Promise<HandlerOutput<Id>>>,
  opts: HandlerOptions<Id> = {},
): Handler {
  const route = routeById(id);
  if (route === undefined) throw new Error(`defineHandler: route ${String(id)} không có trong registry`);
  const stored = opts.stored;
  return Object.freeze({
    route,
    run: async (input: ValidatedInput, ctx: HandlerContext) => fn(input as unknown as HandlerInput<Id>, ctx),
    ...(stored
      ? {
          stored: async (input: ValidatedInput, ctx: HandlerContext) =>
            stored(input as unknown as HandlerInput<Id>, ctx),
        }
      : {}),
  });
}
