# @ga/web — Admin GUI (React 19 + Vite + TanStack Router / Query)

```bash
pnpm --filter @ga/web dev        # http://127.0.0.1:5173, /api chuyển tiếp tới $GA_API_ORIGIN (mặc định http://127.0.0.1:7400)
pnpm --filter @ga/web build      # dist/ ; VITE_GA_UIKIT=1 để kèm trang /__ui-kit (dev luôn có)
pnpm --filter @ga/web preview
pnpm --filter @ga/web test       # happy-dom + Chromium thật (test/browser)
```

## CSP chặt

Dev server và preview gửi `Content-Security-Policy` của `csp.ts` (`default-src 'self'; style-src 'self'` + `base-uri` / `form-action` / `frame-ancestors` / `object-src`). Edge (Caddy) của bản phát hành phải gửi **đúng chuỗi này** (`CSP_VALUE`).

- `src/bootstrap/zod.ts` đặt `z.config({ jitless: true })` và là import ĐẦU TIÊN của `src/main.tsx` (zod 4 dò `new Function` lúc dựng schema). Không đổi thứ tự (test `test/bootstrap.test.ts`).
- Client Vite 8 nạp CSS bằng thẻ `<style>` (bị chặn) ⇒ `vite-csp-dev-styles.ts` (chỉ dev) viết lại sang constructable stylesheet; lớp phủ lỗi HMR tắt. Không dùng `@vitejs/plugin-react` (nó tiêm script nội tuyến); mất Fast Refresh, trang tải lại khi sửa.
- `build.assetsInlineLimit: 0` (không `data:` URL).
- `test/browser/*`: Chromium thật (playwright-core, `PLAYWRIGHT_BROWSERS_PATH`); không có Chromium thì SKIP hiển thị rõ, `GA_REQUIRE_BROWSER=1` (hoặc `CHIBI_REQUIRE_BROWSER=1`) biến thiếu thành lỗi. Có ca âm (trang mồi có `<style>` bị báo vi phạm) để chứng minh bộ bắt còn sống.

## Cấu trúc

- `src/nav.ts` — 6 nhóm + tab (FRONTEND-SPEC §2.2), bảng `G + chữ cái`.
- `src/screens.ts` — **registry màn hình**: lane M4 thêm `src/routes/<thư mục>/screens.tsx` xuất `export const screens = { 'people/roles': Component, … }` (khoá = `<nhóm>/<tab>` hoặc `<nhóm>`); không sửa `router.tsx`. Khoá chưa có màn ⇒ `PlaceholderScreen`.
- `src/router.tsx` — tuyến, guard theo phiên (login ⇄ change-password ⇄ khung).
- `src/shell/` — khung (`AppFrame`), phím tắt toàn cục, placeholder.
- `src/auth/` — `AuthClient` (interface), `createHttpAuthClient` (API L-SEC `/api/auth/{login,session,password,logout}`), `classifyAuthError`.
- `src/routes/login/` — G1 đăng nhập + đổi mật khẩu lần đầu.
- `src/dev/` — `/__ui-kit` (component với dữ liệu mẫu), chỉ dev / build có `VITE_GA_UIKIT=1`.

## Test auth

`test/support/fake-auth-server.ts` là máy chủ giả theo đặc tả L-SEC (cùng chính sách mật khẩu, khoá tạm, CSRF); `FakeAuthClient` là fake ở tầng interface. Mật khẩu test sinh lúc chạy (`test/support/secrets.ts`).
