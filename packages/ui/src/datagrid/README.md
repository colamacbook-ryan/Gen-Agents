# @ga/ui — DataGrid, thanh công thức, ô truy vấn (lane L-GRID)

Chuẩn: STD-07 §5 (Data Console), STD-08 §1/§4 (anchor, Soi `navigate`), FRONTEND-SPEC §5, DATABASE §8 (ô truy vấn),
BUILD-PLAN §A.2-2 / §E.4. Ba subpath: `@ga/ui/datagrid`, `@ga/ui/formula-bar`, `@ga/ui/query-box`.

## Dùng

```tsx
import { DataGrid, type DataGridHandle, type GridDataSource } from '@ga/ui/datagrid';

<DataGrid<SkillRow>
  ref={gridRef}
  table="skills"                       // bảng DB ⇒ anchor `grid:skills/row:SK-0004/col:C`, prefix SK
  label="Skills của Mai"
  columns={SKILL_COLUMNS}              // GridColumn<R>[]: id = field DB, kind, width, value(row), query {field, aliases}
  source={skillsSource}                // GridDataSource<R> — lưới KHÔNG gọi API
  getId={(r) => r.displayId}
  rowMeta={(r) => ({ kind: r.status === 'proposed' ? 'proposed' : 'normal' })}
  labels={gridLabelsFromI18n(t)}       // mọi chữ qua i18n (mặc định GRID_LABELS_VI)
  persistKey="skills:RL-0001"
/>
```

- **Chữ cột** theo vị trí khai báo (A = cột dữ liệu đầu tiên); ẩn cột không đổi chữ của cột khác ⇒ anchor bền.
- **Truy vấn**: chuỗi ô truy vấn (`role:Mai status:active tokens>200`) + `sort` đi nguyên vẹn vào `source`; lọc qua toolbar
  cũng ghi thành mệnh đề trong chuỗi đó. Client chỉ phân tích để vẽ chip / báo lỗi sớm; máy chủ biên dịch + kiểm lại.
- **Σ footer** = `aggregates` do nguồn trả (lưới không tự cộng). Màn có thể thêm `footerExtra` (vd thước ngân sách).

## GridDataSource (hợp đồng với lớp màn)

| Hàm | Ý nghĩa |
|---|---|
| `fetchRange({query, start, limit, signal})` → `{start, rows, total, aggregates?}` | trang theo chỉ số (ảo hoá cần `total`) |
| `locate({query, id, signal})` → `found{index}` / `filtered` / `gone` | anchor: vị trí display_id trong kết quả |
| `updateCell?({id, column, value, reason})` → hàng mới | sửa ô (thiếu ⇒ chỉ đọc); `reason` bắt buộc ở hàng LÕI |
| `createRow?()` | "+ Thêm hàng" |
| `exportRows?({query, signal})` → `AsyncIterable<R[]>` | xuất CSV theo luồng, đúng cùng truy vấn |
| `groups?({query, column, signal})` → `{value, count}[]` | nhóm (thiếu ⇒ nút Nhóm tắt) |

Lỗi truy vấn của máy chủ ⇒ ném `GridQueryError(reason, position)` (reason = `detail.reason` của `query.invalid`).
Mọi hàng nạp về được kiểm display_id đúng bảng; sai ⇒ cả khối lỗi (fail-closed), không dựng anchor sai.

## Anchor + Soi `navigate` (CNS-153)

```ts
const r = await gridRef.current.scrollToId('AU-09000', 'C', { openEditor: false });
// r.status: 'ready' | 'filtered' | 'gone' | 'invalid' | 'timeout' | 'cancelled'; r.element = ô đã dựng (khi ready)
root.addEventListener(ANCHOR_READY_EVENT, (e) => highlight((e as CustomEvent<AnchorReadyDetail>).detail));
```

`ready` chỉ phát khi hàng đã tải, ô đã dựng trong DOM, ô đã được chọn (thanh công thức đổi theo) và cột đã cuộn vào màn.
Hàng ngoài màn / chưa tải ⇒ hỏi `source.locate`; nhóm thu gọn / cột ẩn ⇒ tự mở. Không bao giờ báo `ready` cho chỗ sai.

## CSP (`style-src 'self'`, không `unsafe-inline`)

- Stylesheet là constructable (`adoptedStyleSheets`), style động qua CSSOM — không thẻ `<style>`, không `style="…"` trong HTML.
- Màu / font là biến `--ga-*` tên trung tính (mặc định = token tối STD-07 §8): `--ga-bg-surface`, `--ga-bg-raised`,
  `--ga-bg-sunken`, `--ga-bg-frozen`, `--ga-border-subtle`, `--ga-border-strong`, `--ga-text-primary|secondary|muted`,
  `--ga-accent`, `--ga-accent-soft`, `--ga-on-accent`, `--ga-ok`, `--ga-danger`, `--ga-idle`, `--ga-font-sans|mono`.
- `@ga/contracts` dùng zod 4: ứng dụng chủ phải gọi `z.config({ jitless: true })` TRƯỚC khi nạp `@ga/contracts` / `@ga/ui`
  (zod dò `new Function` ⇒ vi phạm `script-src` dù bị bắt) — xem `test/browser/zod-jitless.ts`.

## Test

`pnpm --filter @ga/ui test`: logic (vitest) + Chromium thật qua `playwright-core` (bundle Vite trong bộ nhớ, máy chủ gửi CSP chặt).
Không có Chromium ⇒ test trình duyệt SKIP; `GA_REQUIRE_BROWSER=1` (hoặc `CHIBI_REQUIRE_BROWSER=1` của CI) ⇒ thiếu là lỗi.
