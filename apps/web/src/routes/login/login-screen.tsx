import { useI18n } from '@ga/i18n/react';
import { Button, TextField } from '@ga/ui/primitives';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { classifyAuthError } from '../../auth/classify.ts';
import { useAuth } from '../../auth/context.tsx';
import { SESSION_KEY } from '../../auth/session.ts';
import { AuthError, isAuthError, type LoginInput } from '../../auth/types.ts';
import { AuthLayout } from './auth-layout.tsx';
import { formatCountdown, useCountdown } from './use-countdown.ts';

/** Lỗi không phải AuthError (lỗi lập trình, thư viện): ghi log thật, hiện câu chung — không nuốt, không lộ chi tiết. */
export function asAuthError(e: unknown): AuthError {
  if (isAuthError(e)) return e;
  console.error('đăng nhập: lỗi ngoài dự kiến', e);
  return new AuthError({ status: 0, code: 'bad_response', i18nKey: 'errors.unknown' }, { cause: e });
}

export interface LoginScreenProps {
  /** đồng hồ (ms) — inject để test đếm ngược */
  now?: () => number;
}

/** G1 Đăng nhập: sai mật khẩu ⇒ lỗi inline không nói sai tên hay sai mật khẩu; khoá tạm ⇒ đếm ngược; lần đầu ⇒ đổi mật khẩu. */
export function LoginScreen({ now = Date.now }: LoginScreenProps) {
  const { t, tr } = useI18n();
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthError | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const remaining = useCountdown(lockedUntil, now);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // hết đếm ngược: mở khoá nút và bỏ câu báo khoá
  useEffect(() => {
    if (lockedUntil !== null && remaining === 0) {
      setLockedUntil(null);
      setError((e) => (e && (classifyAuthError(e) === 'locked' || classifyAuthError(e) === 'rate_limited') ? null : e));
    }
  }, [lockedUntil, remaining]);

  const login = useMutation({
    mutationFn: (input: LoginInput) => auth.login(input),
    onSuccess: async (res) => {
      setPassword('');
      queryClient.removeQueries({ queryKey: SESSION_KEY });
      await navigate({ to: res.mustChangePassword ? '/change-password' : '/overview' });
    },
    onError: (e) => {
      const err = asAuthError(e);
      setError(err);
      setPassword('');
      const kind = classifyAuthError(err);
      if ((kind === 'locked' || kind === 'rate_limited') && err.retryAfterSeconds) {
        setLockedUntil(now() + err.retryAfterSeconds * 1000);
      }
    },
  });

  // lỗi thông tin đăng nhập: đưa con trỏ về ô mật khẩu (các ô bị khoá trong lúc gửi nên chỉ focus được sau khi gửi xong)
  useEffect(() => {
    if (!login.isPending && error && lockedUntil === null) passwordRef.current?.focus();
  }, [login.isPending, error, lockedUntil]);

  const locked = remaining > 0;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (locked || login.isPending) return;
    setError(null);
    login.mutate({ username, password });
  };

  return (
    <AuthLayout>
      <h1 className="ga-auth__title">{t('auth.login.title')}</h1>
      <form className="ga-auth__form" onSubmit={onSubmit}>
        <TextField
          ref={usernameRef}
          label={t('auth.login.username')}
          name="username"
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          required
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          disabled={login.isPending}
        />
        <TextField
          ref={passwordRef}
          label={t('auth.login.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          disabled={login.isPending}
        />
        {error ? (
          <p className="ga-auth__error" role="alert">
            {tr(error.i18nKey)}
            {locked ? ` ${t('auth.login.lockedCountdown', { time: formatCountdown(remaining) })}` : ''}
          </p>
        ) : null}
        <div className="ga-auth__actions">
          <Button type="submit" variant="primary" busy={login.isPending} disabled={locked}>
            {login.isPending ? t('auth.login.submitting') : t('auth.login.submit')}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
