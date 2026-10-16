# DB spec — CHANGELOG (nguồn = repo)

Từ v2.3.4, `db/spec/` của repo code là **nguồn duy nhất** của schema + test DB (STD-05 1.2.0, "chế độ gọn"). Changelog ngắn ở đây; Gen gom vào
`DATABASE.md` (Second-Brain) ở cuối mốc M1. Bản v2.3.3 trở về trước: changelog trong `DATABASE.md` (Second-Brain `988cf46`).

Quy trình: sửa `schema_v2_2.py` / `views_v2_2.sql` / `tests_v2_2.py` → `pnpm db:sync` (sinh lại SQL + manifest `SYNC.json`) → `pnpm db:gen` → `pnpm db:test`
→ `pnpm db:mutation -- --all` (mỗi lượt DROP một trigger; đỏ chỉ qua dòng FAIL).

## v2.3.4 — (đang làm)

### Nguồn = repo (bỏ vendor)
- `db/spec/` chép từ Second-Brain `988cf46` (DB v2.3.3) rồi thành nguồn. `scripts/db-sync.sh`: không còn `--rev` / `--sb`; không tham số = sinh lại
  `schema_v2_2.sql` từ generator, chạy bộ test Python, ghi `SYNC.json` (manifest: `source: repo`, sha256 4 tệp, `app_functions`, số đối tượng, tổng test);
  `--check` = SQL trùng byte đầu ra generator + sha256 khớp manifest. Phiên bản DB = mục `## vX.Y.Z` đầu tiên của tệp này.

### Vá bảo mật (MEDIUM, lỗi thiết kế của lane DB ở v2.3.2–v2.3.3)
- **Miễn trừ FK ON DELETE SET NULL mở** (`FK_SETNULL_ONLY`, guard chung `*_actor_u`): v2.3.3 chỉ so hình dạng ⇒ app gỡ tham chiếu về NULL khi hàng cha còn,
  không actor / không đóng dấu, lọt; no-op cũng lọt. Nay: mọi cột khác giữ nguyên; mỗi cột FK SET NULL giữ nguyên hoặc về NULL khi hàng cha (theo OLD)
  `NOT EXISTS`; ít nhất một cột FK đổi. Thứ tự SQLite chứng minh bằng test (TEMP trigger: lúc hành động FK chạy, hàng cha đã rời b-tree). Ca âm: gỡ FK khi
  cha còn (không actor; có actor không dấu), no-op không actor, hàng mồ côi đổi FK sang hàng khác.
- **NUL / parser-differential ở URL neo** (`backup.remote_anchor`): JSON `\u0000` giải mã ra NUL, GLOB / `length()` dừng ở NUL. Nay URL chỉ ASCII so trên byte
  (`length(CAST(url AS BLOB)) = length(url)`), allowlist `[A-Za-z0-9._~:/-]`, cấm `\u` trong `value_json` thô. Rà CHECK chuỗi người nhập: thêm so byte cho
  `skin_assets.sha256`, `engine_accounts.auth_volume`, `secrets.allowed_host`.
- **`secrets_writer_u` chọn luật theo `NEW.kind`**: thêm `secrets_kind_u` (kind bất biến ngoài bảo trì); `secrets_writer_u` áp luật nghiêm nhất của
  OLD.kind và NEW.kind. Rà các cổng khác chọn luật theo cột phân loại: chỉ `secrets` bị.

### Mới
- **`engine_unrestricted`** (contracts `ENGINE_UNRESTRICTED_REASON`): `engine_installs.tool_restriction_version` = phiên bản CLI app đã kiểm có cơ chế giới hạn
  công cụ của adapter; chỉ tính khi = `installed_version`. `CORE_READY` + `v_core_agent_accounts.is_ready` đòi; lý do O4 nhánh cuối, sự cố.

### Test
- Ca âm sinh tự động cho mọi guard sinh từ DDL (`GEN-guards`: 249 guard), danh sách kỳ vọng lấy từ generator; ca UPDATE cho 4 guard viết tay (`PAIR-u`);
  `FTS-sync`, `NUL-check`, `SQL-noname`, `SECRET-kind`, `ENGINE-unrestricted`; bước thuận bọc (`_val` / `_try`) để đột biến làm hỏng bước thuận đỏ qua FAIL.
- Bỏ tên người trong văn bản SQL sinh ra (INT-12): nhãn quyết định ghi bằng mã.
