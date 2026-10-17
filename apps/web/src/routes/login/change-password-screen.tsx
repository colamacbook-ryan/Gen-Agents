import { useI18n } from '@ga/i18n/react';
import { useToast } from '@ga/ui/overlay';
import { Button, TextField } from '@ga/ui/primitives';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { classifyAuthError } from '../../auth/classify.ts';
import { useAuth } from '../../auth/context.tsx';
import { SESSION_KEY } from '../../auth/session.ts';
import type { AuthError, ChangePasswordInput } from '../../auth/types.ts';
import { AuthLayout } from './auth-layout.tsx';
import { asAuthError } from './login-screen.tsx';

/** Đổi mật khẩu lần đầu (FRONTEND-SPEC G1 → bước 1 của Onboarding): mật khẩu ban đầu chỉ dùng một lần. */
export function ChangePasswordScreen() {
  const { t, tr } = useI18n();
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  const change = useMutation({
    mutationFn: (input: ChangePasswordInput) => auth.changePassword(input),
    onSuccess: async () => {
      setCurrent('');
      setNext('');
      setAgain('');
      queryClient.removeQueries({ queryKey: SESSION_KEY });
      toast.push({ kind: 'ok', title: t('auth.changePassword.done') });
      await navigate({ to: '/overview' });
    },
    onError: (e) => {
      const err = asAuthError(e);
      setError(err);
      setNext('');
      setAgain('');
    },
  });

  // mật khẩu yếu: đưa con trỏ về ô mật khẩu mới (các ô bị khoá trong lúc gửi nên chỉ focus được sau khi gửi xong)
  useEffect(() => {
    if (!change.isPending && error && classifyAuthError(error) === 'weak_password') nextRef.current?.focus();
  }, [change.isPending, error]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (change.isPending) return;
    setError(null);
    if (next !== again) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate({ currentPassword: current, newPassword: next });
  };

  const onLogout = async () => {
    await auth.logout();
    queryClient.setQueryData(SESSION_KEY, null);
    await navigate({ to: '/login' });
  };

  const kind = error ? classifyAuthError(error) : null;
  // lý do chính sách mật khẩu (too_short…) → câu riêng; khoá lạ → câu chung "chưa đủ mạnh"
  const weakText =
    error && kind === 'weak_password'
      ? tr(
          error.reason ? `errors.auth.password.${error.reason}` : error.i18nKey,
          undefined,
          'errors.auth.weak_password',
        )
      : null;

  return (
    <AuthLayout>
      <h1 className="ga-auth__title">{t('auth.changePassword.title')}</h1>
      <p className="ga-auth__intro">{t('auth.changePassword.intro')}</p>
      <form className="ga-auth__form" onSubmit={onSubmit}>
        <TextField
          ref={currentRef}
          label={t('auth.changePassword.current')}
          name="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.currentTarget.value)}
          disabled={change.isPending}
        />
        <TextField
          ref={nextRef}
          label={t('auth.changePassword.new')}
          hint={t('auth.changePassword.newHint')}
          name="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.currentTarget.value)}
          error={weakText}
          disabled={change.isPending}
        />
        <TextField
          label={t('auth.changePassword.confirm')}
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={again}
          onChange={(e) => {
            setAgain(e.currentTarget.value);
            setMismatch(false);
          }}
          error={mismatch ? t('auth.changePassword.mismatch') : null}
          disabled={change.isPending}
        />
        {error && kind !== 'weak_password' ? (
          <p className="ga-auth__error" role="alert">
            {tr(error.i18nKey)}
          </p>
        ) : null}
        <div className="ga-auth__actions">
          <Button type="submit" variant="primary" busy={change.isPending}>
            {change.isPending ? t('auth.changePassword.submitting') : t('auth.changePassword.submit')}
          </Button>
          <Button variant="ghost" onClick={() => void onLogout()} disabled={change.isPending}>
            {t('auth.changePassword.logout')}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
