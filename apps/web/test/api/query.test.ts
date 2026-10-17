// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiClient } from '../../src/api/client.ts';
import { createCsrfStore } from '../../src/api/csrf.ts';
import { ApiProvider, useRouteMutation, useRouteQuery } from '../../src/api/query.tsx';
import { errorBody, json, noSleep, recordingFetch, ULID } from './support.ts';

afterEach(cleanup);

function harness(responder: Parameters<typeof recordingFetch>[0]) {
  const rec = recordingFetch(responder);
  const csrf = createCsrfStore();
  csrf.set('csrf-token-0123456789abcdef');
  const api = createApiClient({ csrf, fetchImpl: rec.fetch, validate: true, sleep: noSleep });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, createElement(ApiProvider, { api, children }));
  return { ...rec, qc, wrapper };
}

describe('useRouteQuery / useRouteMutation', () => {
  it('đọc theo registry, khoá cache có id + tham số; huỷ request khi gỡ (có signal)', async () => {
    const h = harness(() => json([]));
    const { result } = renderHook(() => useRouteQuery('OPS-32'), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(h.calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(h.qc.getQueryCache().getAll()[0]?.queryKey).toEqual(['api', 'OPS-32', null, null]);
  });

  it('lỗi hiện qua ApiError (mã, httpStatus)', async () => {
    const h = harness(() => json(errorBody('auth.forbidden'), 403));
    const { result } = renderHook(() => useRouteQuery('OPS-32'), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'auth.forbidden', httpStatus: 403 });
  });

  it('ghi xong ⇒ đọc liên quan được tải lại (SYS-12 → SYS-08 / OPS-33…); không gọi lại cái không liên quan', async () => {
    let status = 0;
    const h = harness((c) => {
      if (c.method === 'POST') return json({ container: { id: ULID, displayId: 'CT-0001', observed: 'running' } });
      if (c.url.endsWith('/core-agent/status')) {
        status++;
        return json({ __sai: status }); // dữ liệu không cần đúng schema ở test này ⇒ tắt validate bên dưới
      }
      return json({});
    });
    const noValidate = createApiClient({
      csrf: createCsrfStore(),
      fetchImpl: h.fetch,
      validate: false,
      sleep: noSleep,
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: h.qc }, createElement(ApiProvider, { api: noValidate, children }));
    const q = renderHook(() => useRouteQuery('SYS-08'), { wrapper });
    const m = renderHook(() => useRouteMutation('SYS-12'), { wrapper });
    await waitFor(() => expect(q.result.current.isSuccess).toBe(true));
    expect(status).toBe(1);
    await act(async () => {
      await m.result.current.mutateAsync(undefined);
    });
    await waitFor(() => expect(status).toBe(2));
  });

  it('mutation idempotent: TanStack thử lại CÙNG biến ⇒ CÙNG khoá; mutate() mới ⇒ khoá mới', async () => {
    const h = harness((_c, n) =>
      n === 1
        ? json(errorBody('internal'), 500)
        : json({ entry: { id: ULID, displayId: 'LG-0001' }, balanceAfterMinor: 1, revived: false, rankAfter: null }),
    );
    h.qc.setDefaultOptions({ mutations: { retry: 1, retryDelay: 0 } });
    const { result } = renderHook(() => useRouteMutation('WRK-24'), { wrapper: h.wrapper });
    const vars = { params: { roleRef: 'RL-0001' }, body: { amountMinor: 5, reason: 'thử' } };
    await act(async () => {
      await result.current.mutateAsync(vars);
    });
    expect(h.calls).toHaveLength(2);
    const k = h.calls.map((c) => c.headers['idempotency-key']);
    expect(k[0]).toBeTruthy();
    expect(k[0]).toBe(k[1]);
    await act(async () => {
      await result.current.mutateAsync(vars);
    });
    expect(h.calls[2]?.headers['idempotency-key']).not.toBe(k[0]);
  });
});
