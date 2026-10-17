import { queryOptions } from '@tanstack/react-query';
import type { AuthClient } from './types.ts';

export const SESSION_KEY = ['auth', 'session'] as const;

/** Phiên hiện tại (null = chưa đăng nhập). Không tự refetch: chỉ đổi khi đăng nhập / đổi mật khẩu / đăng xuất cập nhật tay. */
export const sessionQuery = (auth: AuthClient) =>
  queryOptions({
    queryKey: SESSION_KEY,
    queryFn: () => auth.session(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
