import { routeById } from '@ga/contracts';
import {
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from 'react';
import type { ApiClient } from './client.ts';
import type { ApiError } from './error.ts';
import { isApiError } from './error.ts';
import type { ClientEventListener } from './events.ts';
import { invalidateAfterWrite } from './invalidation.ts';
import { routeKey } from './keys.ts';
import type { AnyInput, CallInput, CallOptions, CallResult, MutationVars, ReadId, WriteId } from './routes.ts';

// Hook TanStack Query gõ kiểu theo registry. Khoá cache = ['api', id, params, query]; ghi xong ⇒ vô hiệu hoá theo INVALIDATIONS.

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

/** Client API của app; null khi app chạy không có lớp API (test màn đăng nhập). */
export const useOptionalApi = (): ApiClient | null => useContext(ApiContext);

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('thiếu <ApiProvider>');
  return api;
}

/** Nghe sự kiện client API (`unauthorized`, `recovery_blocked`) trong vòng đời component. */
export function useClientEvents(listener: ClientEventListener): void {
  const api = useOptionalApi();
  useEffect(() => api?.events.subscribe(listener), [api, listener]);
}

type Untyped = (id: string, input: AnyInput | undefined, opts?: CallOptions) => Promise<unknown>;
const untyped = (api: ApiClient): Untyped => api.call as unknown as Untyped;

type Empty = Record<never, never>;
export type QueryOptions<Id extends ReadId> = Omit<
  UseQueryOptions<CallResult<Id>, ApiError, CallResult<Id>>,
  'queryKey' | 'queryFn'
>;
export type QueryArgs<Id extends ReadId> =
  Empty extends CallInput<Id>
    ? [input?: CallInput<Id>, options?: QueryOptions<Id>]
    : [input: CallInput<Id>, options?: QueryOptions<Id>];

/** `useRouteQuery('OPS-33', { params: { gridKey: 'roles' }, query: { limit: 50 } })`; huỷ request khi bỏ query (AbortSignal). */
export function useRouteQuery<Id extends ReadId>(
  id: Id,
  ...args: QueryArgs<Id>
): UseQueryResult<CallResult<Id>, ApiError> {
  const api = useApi();
  const [input, options] = args as [AnyInput | undefined, QueryOptions<Id> | undefined];
  return useQuery<CallResult<Id>, ApiError>({
    ...options,
    queryKey: routeKey(id, input),
    queryFn: ({ signal }) => untyped(api)(id, input, { signal }) as Promise<CallResult<Id>>,
  });
}

export type MutationOptions<Id extends WriteId> = Omit<
  UseMutationOptions<CallResult<Id>, ApiError, MutationVars<Id>>,
  'mutationFn' | 'onSuccess' | 'onError' | 'onSettled'
>;

interface Wrapped {
  input: AnyInput | undefined;
  /** khoá idempotency sinh MỘT lần cho mỗi `mutate()` — TanStack thử lại cùng biến ⇒ cùng khoá */
  key: string | undefined;
}

const newKey = (): string => `idem-${crypto.randomUUID()}`;

/**
 * `useRouteMutation('SYS-12')`. Thành công ⇒ vô hiệu hoá các đọc liên quan (INVALIDATIONS); `conflict` ⇒ cũng đọc lại (dữ liệu đã đổi
 * ở nơi khác). Route `idempotent`: khoá sinh một lần mỗi `mutate()` và dùng lại khi thử lại. Callback đi theo từng lần `mutate(vars, {…})`.
 */
export function useRouteMutation<Id extends WriteId>(
  id: Id,
  options?: MutationOptions<Id>,
): UseMutationResult<CallResult<Id>, ApiError, MutationVars<Id>> {
  const api = useApi();
  const qc = useQueryClient();
  const idempotent = routeById(id)?.idempotent === true;
  const m = useMutation<CallResult<Id>, ApiError, Wrapped>({
    ...(options as object),
    mutationFn: (w) => untyped(api)(id, w.input, { idempotencyKey: w.key }) as Promise<CallResult<Id>>,
    onSuccess: () => invalidateAfterWrite(qc, id),
    onError: (e) => (isApiError(e) && e.code === 'conflict' ? invalidateAfterWrite(qc, id) : undefined),
  });
  const wrap = useCallback(
    (input: MutationVars<Id>): Wrapped => ({
      input: input as AnyInput | undefined,
      key: idempotent ? newKey() : undefined,
    }),
    [idempotent],
  );
  const { mutate, mutateAsync } = m;
  const typedMutate = useCallback(
    (input: MutationVars<Id>, opts?: Parameters<typeof mutate>[1]) => mutate(wrap(input), opts),
    [mutate, wrap],
  );
  const typedMutateAsync = useCallback(
    (input: MutationVars<Id>, opts?: Parameters<typeof mutateAsync>[1]) => mutateAsync(wrap(input), opts),
    [mutateAsync, wrap],
  );
  return useMemo(
    () =>
      ({ ...m, mutate: typedMutate, mutateAsync: typedMutateAsync }) as unknown as UseMutationResult<
        CallResult<Id>,
        ApiError,
        MutationVars<Id>
      >,
    [m, typedMutate, typedMutateAsync],
  );
}
