# @ga/ui — Data Console (STD-07)

Thư viện giao diện dùng chung của Admin GUI. Một app dùng: `import '@ga/ui/styles'` (token + font + nền) ở bootstrap, rồi import component từ `@ga/ui` (hoặc `@ga/ui/primitives|shell|overlay|shared`).

| Thư mục | Nội dung |
|---|---|
| `src/tokens` | `tokens.css` (bộ token STD-07 §8, dark mặc định + light), `base.css`, `fonts.css` + `fonts/*.woff2`, `index.ts` (bản TS) |
| `src/primitives` | Button, StatusChip, KpiTile, Stepper, WarningBanner (+ dải HTTP), EmptyState, Skeleton, FileDropzone, RoleAvatar, TextField, phím tắt (`ShortcutProvider`, `useShortcut`) |
| `src/overlay` | Toast, Modal / Drawer, ConfirmModal 2 bước, O1 CommandPalette, O2 NotificationCenter, O3 ShortcutsDialog, OverlayProvider |
| `src/shell` | AppShell, Sidebar (216 / rail 56), Header 44, PageHeader + tab, PageActions, LogDrawer, ConnectionStrip |
| `src/shared/{log,version,provenance,changeset,cards,quiet-hours}` | LogStream, VersionTimeline + DiffViewer, ProvenanceMark, ChangeSetTray, EmployeeCard + BirthCertificate (dạng văn bản, không chibi), QuietHoursTimeline |

Quy ước (có test ép trong `test/guards.test.ts`, quét **mọi** `.css` / `.tsx` của `packages/ui/src` và `apps/web/src`, kể cả lane khác thêm):

- CSS thuần, lớp `ga-…`, màu / cỡ / khoảng cách lấy từ biến `--ga-…`; `padding` / `margin` / `gap` chỉ trong thang **4·8·12·16·24·32** (hoặc `var(--ga-sp-n)`); không chữ > 20px trong Console.
- **CSP chặt `default-src 'self'; style-src 'self'`**: không `<style>`, không `style="…"`, không `innerHTML`, không `eval` / `new Function`, không `@import` / `url()` ngoài / `data:`. `style={{ '--ga-x': … }}` (chỉ biến CSS, đặt qua CSSOM) được phép.
- Mọi chữ hiển thị qua i18n (`useT()`); JSX không được có chữ ghi cứng. Dữ liệu (tên Role, log…) do người gọi truyền vào.
- Nút chỉ có icon luôn có `aria-label`; trạng thái luôn có chữ + icon, không chỉ màu; tôn trọng `prefers-reduced-motion`; hộp thoại có bẫy focus và trả focus.
- Một component = một thư mục / tệp `.tsx` + `.css` cùng tên; thêm vào `index.ts` của thư mục rồi `src/index.ts`.

## Font

IBM Plex Sans / Mono và Newsreader, **tự host** (subset `latin`, `latin-ext` — có `₲` —, `vietnamese`; woff2). Chép một lần từ gói `@fontsource/*` v5.3.0 (OFL-1.1) vì gói npm đó không qua cổng license (license `OFL-1.1` không thuộc danh sách gói); từng tệp có mục trong `ASSET_MANIFEST.json`, kèm bản OFL ở `src/tokens/fonts/OFL-*.txt`. Test kiểm glyph tiếng Việt và `₲` thật trong Chromium (`apps/web/test/browser/app.test.ts`).

## Test

`pnpm --filter @ga/ui test`. Tệp `test/*.test.ts` (không JSX, để `pnpm test` gốc — chỉ nhận `*.test.ts` — cũng chạy được) dùng `// @vitest-environment happy-dom` và helper `h` + `renderUi` ở `test/support/dom.ts`.
