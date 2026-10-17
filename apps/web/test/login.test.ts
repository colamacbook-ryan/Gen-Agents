// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authError, FakeAuthClient, SAMPLE_SESSION } from './support/fake-auth-client.ts';
import { registerCleanup, renderApp } from './support/render-app.ts';
import {
  FIRST_PASSWORD,
  GOOD_PASSWORD,
  NEW_PASSWORD,
  OTHER_PASSWORD,
  SHORT_PASSWORD,
  WRONG_PASSWORD,
} from './support/secrets.ts';

registerCleanup();

const typeLogin = async (user: ReturnType<typeof userEvent.setup>, name: string, password: string) => {
  await user.type(await screen.findByLabelText('Tên đăng nhập'), name);
  await user.type(screen.getByLabelText('Mật khẩu'), password);
  await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
};

describe('G1 đăng nhập', () => {
  it('chưa đăng nhập: mọi đường dẫn Admin đưa về /login; form có label thật, focus ở tên đăng nhập, mật khẩu là type=password', async () => {
    const auth = new FakeAuthClient();
    const app = renderApp(auth, { path: '/people/cards' });
    const username = await screen.findByLabelText('Tên đăng nhập');
    expect(app.pathname()).toBe('/login');
    expect(document.activeElement).toBe(username);
    expect(screen.getByLabelText('Mật khẩu').getAttribute('type')).toBe('password');
    expect(screen.getByLabelText('Mật khẩu').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeTruthy();
    expect(screen.getByText('Phòng nhân sự của một công ty AI.')).toBeTruthy();
    expect(screen.getByText('Phiên bản 0.0.0')).toBeTruthy();
  });

  it('đăng nhập đúng (không buộc đổi mật khẩu) → vào Tổng quan, sidebar hiện tên owner; mật khẩu không còn trong ô', async () => {
    const auth = new FakeAuthClient({ password: GOOD_PASSWORD });
    const app = renderApp(auth, { path: '/login' });
    const user = userEvent.setup();
    await typeLogin(user, 'admin', GOOD_PASSWORD);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(app.pathname()).toBe('/overview');
    expect(screen.getByText('admin · Owner')).toBeTruthy();
    expect(auth.calls.login).toEqual([{ username: 'admin', password: GOOD_PASSWORD }]);
  });

  it('sai mật khẩu: lỗi inline KHÔNG nói sai tên hay sai mật khẩu; ô mật khẩu được xoá và nhận focus; tên giữ nguyên', async () => {
    const auth = new FakeAuthClient({ password: GOOD_PASSWORD });
    const app = renderApp(auth, { path: '/login' });
    const user = userEvent.setup();
    await typeLogin(user, 'admin', WRONG_PASSWORD);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Tên đăng nhập hoặc mật khẩu không đúng.');
    expect(alert.textContent).not.toMatch(/mật khẩu (sai|không đúng) và|tên đăng nhập (sai|không tồn tại)/i);
    expect((screen.getByLabelText('Mật khẩu') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Tên đăng nhập') as HTMLInputElement).value).toBe('admin');
    expect(document.activeElement).toBe(screen.getByLabelText('Mật khẩu'));
    expect(app.pathname()).toBe('/login');
    // thử lại đúng thì lỗi biến mất
    await user.type(screen.getByLabelText('Mật khẩu'), GOOD_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(screen.queryByText('Tên đăng nhập hoặc mật khẩu không đúng.')).toBeNull();
  });

  it('đang gửi: nút khoá + aria-busy, ô nhập khoá, không gửi đôi', async () => {
    let release: (v: { mustChangePassword: boolean }) => void = () => undefined;
    const auth = new FakeAuthClient({ login: () => new Promise((r) => (release = r)) });
    renderApp(auth, { path: '/login' });
    const user = userEvent.setup();
    await typeLogin(user, 'admin', 'bat-ky');
    const btn = await screen.findByRole('button', { name: 'Đang đăng nhập…' });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Tên đăng nhập').hasAttribute('disabled')).toBe(true);
    fireEvent.submit(btn.closest('form') as HTMLFormElement);
    expect(auth.calls.login).toHaveLength(1);
    await act(async () => release({ mustChangePassword: false }));
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
  });

  it('lỗi mạng và lỗi lạ đều có câu riêng, không lộ chi tiết kỹ thuật', async () => {
    const auth = new FakeAuthClient({ login: () => Promise.reject(authError('network')) });
    renderApp(auth, { path: '/login' });
    const user = userEvent.setup();
    await typeLogin(user, 'admin', 'x');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Không kết nối được tới máy chủ. Kiểm tra mạng rồi thử lại.',
    );
  });

  it('ngoại lệ không phải AuthError: câu chung + ghi log thật (không nuốt)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const auth = new FakeAuthClient({ login: () => Promise.reject(new TypeError('boom nội bộ')) });
    renderApp(auth, { path: '/login' });
    const user = userEvent.setup();
    await typeLogin(user, 'admin', 'x');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Đã có lỗi. Thử lại, hoặc xem log nếu lỗi lặp lại.');
    expect(alert.textContent).not.toContain('boom');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  describe('khoá tạm (auth.locked): đếm ngược qua i18n', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it.each([
      ['mã riêng auth.locked', () => authError('auth.locked', { status: 429, retryAfterSeconds: 3 })],
      [
        'dạng L-SEC: auth.rate_limited + khoá errors.auth.locked',
        () => authError('auth.rate_limited', { status: 429, i18nKey: 'errors.auth.locked', retryAfterSeconds: 3 }),
      ],
    ])('%s: hiện câu khoá + đếm ngược, khoá nút, hết giờ thì mở lại', async (_name, make) => {
      const auth = new FakeAuthClient({ login: () => Promise.reject(make()) });
      renderApp(auth, { path: '/login' });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await typeLogin(user, 'admin', 'x');
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe('Tài khoản tạm khoá do nhập sai nhiều lần. Thử lại sau 0:03.');
      const submit = screen.getByRole('button', { name: 'Đăng nhập' });
      expect(submit.hasAttribute('disabled')).toBe(true);
      await act(async () => void vi.advanceTimersByTime(1000));
      expect(screen.getByRole('alert').textContent).toContain('0:02');
      // bấm gửi trong lúc khoá không gọi API
      fireEvent.submit(submit.closest('form') as HTMLFormElement);
      expect(auth.calls.login).toHaveLength(1);
      await act(async () => void vi.advanceTimersByTime(2500));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      expect(screen.getByRole('button', { name: 'Đăng nhập' }).hasAttribute('disabled')).toBe(false);
    });

    it('quá nhiều yêu cầu (auth.rate_limited thường): câu riêng + đếm ngược', async () => {
      const auth = new FakeAuthClient({
        login: () => Promise.reject(authError('auth.rate_limited', { status: 429, retryAfterSeconds: 75 })),
      });
      renderApp(auth, { path: '/login' });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await typeLogin(user, 'admin', 'x');
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Thử quá nhiều lần. Chờ một chút rồi thử lại. Thử lại sau 1:15.',
      );
    });
  });

  it('VI | EN: đổi ngôn ngữ ngay, ghi nhớ, cập nhật <html lang>; nút báo trạng thái bằng aria-pressed', async () => {
    renderApp(new FakeAuthClient(), { path: '/login' });
    const user = userEvent.setup();
    const en = await screen.findByRole('button', { name: /English/ });
    const vi_ = screen.getByRole('button', { name: /Tiếng Việt/ });
    expect(vi_.getAttribute('aria-pressed')).toBe('true');
    expect(en.getAttribute('aria-pressed')).toBe('false');
    await user.click(en);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(screen.getByLabelText('Username')).toBeTruthy();
    expect(screen.getByText('The HR department of an AI company.')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('ga.locale')).toBe('en');
    await user.click(screen.getByRole('button', { name: /Tiếng Việt/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeTruthy();
  });

  it('ngôn ngữ đã lưu được dùng lại khi mở app', async () => {
    localStorage.setItem('ga.locale', 'en');
    // không truyền i18n ⇒ App tự đọc ngôn ngữ đã lưu
    const { App } = await import('../src/app.tsx');
    const { render } = await import('@testing-library/react');
    const { createMemoryHistory } = await import('@tanstack/react-router');
    const { createElement } = await import('react');
    render(
      createElement(App, {
        deps: { auth: new FakeAuthClient(), history: createMemoryHistory({ initialEntries: ['/login'] }) },
      }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
  });

  it('truy cập qua HTTP không phải loopback: dải cảnh báo không đóng được; https / localhost thì không', async () => {
    const happy = (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM;
    happy.setURL('http://ga.example.com/login');
    const { unmount } = renderApp(new FakeAuthClient(), { path: '/login' });
    const banner = (await screen.findByText('Kết nối chưa được mã hoá.')).closest('.ga-banner') as HTMLElement;
    expect(banner.className).toContain('ga-banner--warn');
    expect(within(banner).queryByRole('button')).toBeNull();
    unmount();
    happy.setURL('https://ga.example.com/login');
    renderApp(new FakeAuthClient(), { path: '/login' });
    await screen.findByLabelText('Tên đăng nhập');
    expect(screen.queryByText('Kết nối chưa được mã hoá.')).toBeNull();
    happy.setURL('about:blank');
  });

  it('đã đăng nhập mà vào /login thì được đưa vào Admin', async () => {
    const app = renderApp(new FakeAuthClient({ session: SAMPLE_SESSION }), { path: '/login' });
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(app.pathname()).toBe('/overview');
  });
});

describe('đổi mật khẩu lần đầu', () => {
  const firstSession = { username: 'admin', mustChangePassword: true, csrfToken: 'c' };
  const fill = async (user: ReturnType<typeof userEvent.setup>, cur: string, next: string, again: string) => {
    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), cur);
    await user.type(screen.getByLabelText('Mật khẩu mới'), next);
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), again);
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
  };

  it('đăng nhập lần đầu → buộc sang /change-password; mọi trang Admin bị chặn tới khi đổi', async () => {
    const auth = new FakeAuthClient({ password: FIRST_PASSWORD, mustChangePasswordOnLogin: true });
    const app = renderApp(auth, { path: '/login' });
    const user = userEvent.setup();
    await typeLogin(user, 'admin', FIRST_PASSWORD);
    await screen.findByRole('heading', { level: 1, name: 'Đặt mật khẩu mới' });
    expect(app.pathname()).toBe('/change-password');
    expect(screen.getByLabelText('Mật khẩu mới').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByText(/Mật khẩu ban đầu chỉ dùng một lần/)).toBeTruthy();
    await act(async () => void app.history.push('/people/cards'));
    await screen.findByRole('heading', { level: 1, name: 'Đặt mật khẩu mới' });
    expect(app.pathname()).toBe('/change-password');
  });

  it('hai mật khẩu không khớp: lỗi inline ở ô nhập lại, KHÔNG gọi API', async () => {
    const auth = new FakeAuthClient({ session: firstSession });
    renderApp(auth, { path: '/change-password' });
    const user = userEvent.setup();
    await fill(user, FIRST_PASSWORD, NEW_PASSWORD, OTHER_PASSWORD);
    const again = screen.getByLabelText('Nhập lại mật khẩu mới');
    expect(again.getAttribute('aria-invalid')).toBe('true');
    expect(within(again.parentElement as HTMLElement).getByRole('alert').textContent).toBe('Hai mật khẩu chưa khớp.');
    expect(auth.calls.changePassword).toHaveLength(0);
  });

  it.each([
    ['too_short', 'Mật khẩu mới quá ngắn. Dùng một cụm từ dài hơn.'],
    ['too_long', 'Mật khẩu mới quá dài.'],
    ['too_repetitive', 'Mật khẩu mới quá lặp. Dùng nhiều ký tự khác nhau hơn.'],
    ['contains_username', 'Mật khẩu mới không được chứa tên đăng nhập.'],
    ['same_as_current', 'Mật khẩu mới phải khác mật khẩu hiện tại.'],
  ])(
    'mật khẩu yếu (%s): câu riêng qua i18n ngay dưới ô mật khẩu mới, ô mới được xoá và nhận focus',
    async (reason, text) => {
      const auth = new FakeAuthClient({
        session: firstSession,
        changePassword: () =>
          Promise.reject(
            authError('validation.failed', { status: 400, i18nKey: `errors.auth.password.${reason}`, reason }),
          ),
      });
      renderApp(auth, { path: '/change-password' });
      const user = userEvent.setup();
      await fill(user, FIRST_PASSWORD, SHORT_PASSWORD, SHORT_PASSWORD);
      const next = screen.getByLabelText('Mật khẩu mới');
      await waitFor(() => expect(next.getAttribute('aria-invalid')).toBe('true'));
      expect(within(next.parentElement as HTMLElement).getByRole('alert').textContent).toBe(text);
      expect((next as HTMLInputElement).value).toBe('');
      expect(document.activeElement).toBe(next);
    },
  );

  it('auth.weak_password (mã riêng của contracts) không kèm reason: câu chung "chưa đủ mạnh"', async () => {
    const auth = new FakeAuthClient({
      session: firstSession,
      changePassword: () => Promise.reject(authError('auth.weak_password', { status: 400 })),
    });
    renderApp(auth, { path: '/change-password' });
    const user = userEvent.setup();
    await fill(user, FIRST_PASSWORD, SHORT_PASSWORD, SHORT_PASSWORD);
    const next = screen.getByLabelText('Mật khẩu mới');
    await waitFor(() =>
      expect(within(next.parentElement as HTMLElement).getByRole('alert').textContent).toBe(
        'Mật khẩu mới chưa đủ mạnh.',
      ),
    );
  });

  it('khoá i18n lạ cho mật khẩu yếu: rơi về câu chung, không in khoá thô', async () => {
    const spy = vi.fn();
    const { createI18n } = await import('@ga/i18n');
    const i18n = createI18n({ onMissingKey: spy });
    const auth = new FakeAuthClient({
      session: firstSession,
      changePassword: () =>
        Promise.reject(
          authError('validation.failed', {
            status: 400,
            i18nKey: 'errors.auth.password.ly_do_moi',
            reason: 'ly_do_moi',
          }),
        ),
    });
    renderApp(auth, { path: '/change-password', i18n });
    const user = userEvent.setup();
    await fill(user, FIRST_PASSWORD, SHORT_PASSWORD, SHORT_PASSWORD);
    const next = screen.getByLabelText('Mật khẩu mới');
    await waitFor(() =>
      expect(within(next.parentElement as HTMLElement).getByRole('alert').textContent).toBe(
        'Mật khẩu mới chưa đủ mạnh.',
      ),
    );
    expect(spy).toHaveBeenCalledWith('errors.auth.password.ly_do_moi');
  });

  it('mật khẩu hiện tại sai: lỗi chung ở đầu form (không phải lỗi mật khẩu yếu)', async () => {
    const auth = new FakeAuthClient({
      session: firstSession,
      changePassword: () =>
        Promise.reject(authError('auth.required', { status: 401, i18nKey: 'errors.auth.invalid_credentials' })),
    });
    renderApp(auth, { path: '/change-password' });
    const user = userEvent.setup();
    await fill(user, WRONG_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    expect((await screen.findByText('Tên đăng nhập hoặc mật khẩu không đúng.')).getAttribute('role')).toBe('alert');
    expect(screen.getByLabelText('Mật khẩu mới').getAttribute('aria-invalid')).toBeNull();
  });

  it('đổi thành công → toast, vào Tổng quan; gửi đúng cặp mật khẩu; không còn bị buộc đổi', async () => {
    const auth = new FakeAuthClient({ session: firstSession });
    const app = renderApp(auth, { path: '/change-password' });
    const user = userEvent.setup();
    await fill(user, FIRST_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(app.pathname()).toBe('/overview');
    expect(auth.calls.changePassword).toEqual([{ currentPassword: FIRST_PASSWORD, newPassword: NEW_PASSWORD }]);
    expect((await screen.findByText('Đã đổi mật khẩu.')).closest('.ga-toast')).not.toBeNull();
  });

  it('có lối đăng xuất ngay trên màn đổi mật khẩu', async () => {
    const auth = new FakeAuthClient({ session: firstSession });
    const app = renderApp(auth, { path: '/change-password' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
    await screen.findByLabelText('Tên đăng nhập');
    expect(app.pathname()).toBe('/login');
    expect(auth.calls.logout).toBe(1);
  });

  it('đã đổi rồi mà vào /change-password thì về Tổng quan; chưa đăng nhập thì về /login', async () => {
    const a = renderApp(new FakeAuthClient({ session: SAMPLE_SESSION }), { path: '/change-password' });
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(a.pathname()).toBe('/overview');
    a.unmount();
    const b = renderApp(new FakeAuthClient(), { path: '/change-password' });
    await screen.findByLabelText('Tên đăng nhập');
    expect(b.pathname()).toBe('/login');
  });
});
