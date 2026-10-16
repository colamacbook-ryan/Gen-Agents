# DB spec — CHANGELOG (nguồn = repo)

Từ v2.3.4, `db/spec/` của repo code là **nguồn duy nhất** của schema + test DB (STD-05 1.2.0, "chế độ gọn"). Changelog ngắn ở đây; Gen gom vào
`DATABASE.md` (Second-Brain) ở cuối mốc M1. Bản v2.3.3 trở về trước: changelog trong `DATABASE.md` (Second-Brain `988cf46`).

Quy trình: sửa `schema_v2_2.py` / `views_v2_2.sql` / `tests_v2_2.py` → `pnpm db:sync` (sinh lại SQL + manifest `SYNC.json`) → `pnpm db:gen` → `pnpm db:test`
→ `pnpm db:mutation -- --all` (mỗi lượt DROP một trigger; đỏ chỉ qua dòng FAIL).

## v2.3.4 — (đang làm)
