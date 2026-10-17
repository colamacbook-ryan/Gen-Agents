# DB spec — CHANGELOG (nguồn = repo)

Từ v2.3.4, `db/spec/` của repo code là **nguồn duy nhất** của schema + test DB (STD-05 1.2.0, "chế độ gọn"). Changelog ngắn ở đây; Gen gom vào
`DATABASE.md` (Second-Brain) ở cuối mốc M1. Bản v2.3.3 trở về trước: changelog trong `DATABASE.md` (Second-Brain `988cf46`).

Quy trình: sửa `schema_v2_2.py` / `views_v2_2.sql` / `tests_v2_2.py` → `pnpm db:sync` (sinh lại SQL + manifest `SYNC.json`) → `pnpm db:gen` → `pnpm db:test`
→ `pnpm db:mutation -- --all` (mỗi lượt DROP một trigger; đỏ chỉ qua dòng FAIL).

## v2.3.5 — (đang làm)

(xem cuối mục khi xong)

## v2.3.4 — 2026-10-17

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
- **Seed tham chiếu máy đọc được** (CNS-170, contracts `ga.seed-reference.v1`): bộ sinh `db/spec/gen_seed.py` → `db/spec/seed_reference.json` (nguồn duy
  nhất của dữ liệu seed tham chiếu; `pnpm db:sync` sinh, `--check` so byte; manifest `SYNC.json` + bản sao đột biến có cả hai tệp).
  - **id (`idFor`, lane DB quyết):** `seed_row_id(workspace_id, key)` = `'0000000000'` + 16 ký tự Crockford của 80 bit đầu
    `sha256('ga.seed-reference.v1:' + workspace_id + ':' + key)`; key = `'<bảng>:<display_id viết thường>'`. TS: `seedRowId` / `seedIdFor`
    (`packages/db/src/seed/ids.ts`, vector đối chiếu Python). Global ghi sẵn id bằng cùng hàm (workspace hệ thống).
  - **`source.rev`** = HEAD lúc sinh (bản sinh nằm ở commit con); nội dung không đổi ⇒ giữ tệp cũ.
  - **Ghi chú cho tầng repos: dùng `WHERE NOT EXISTS`, không dùng `ON CONFLICT`.** Trigger chống REPLACE (`<bảng>_no_replace_i`, BEFORE INSERT) chạy
    TRƯỚC bước giải xung đột ⇒ `INSERT … ON CONFLICT DO NOTHING / DO UPDATE` trùng khoá bị RAISE ("UNIQUE (chống REPLACE…)"), không lặng lẽ bỏ qua.
    Áp seed / upsert idempotent: `INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 … WHERE <conflictKey> IS ?)` (applyGlobalSeed / applyWorkspaceSeed đã
    làm vậy); cập nhật = UPDATE riêng. Ngoại lệ: `id_counters`, `jobs` (NO_REPLACE_EXEMPT — cấp số bằng upsert §2.1). Test `SEED-ref` chứng minh.
  - **Nghĩa vụ app:** hàng `workspaces` của tenant (slug / tên / short_code nhập ở Onboarding) ghi TRƯỚC `applyWorkspaceSeed` — seed không chứa; hiện
    `conn.bootstrap` đòi actor system tồn tại cuối giao dịch nên ghi hàng này cần một lối của L0 (vd tham số cho `applyWorkspaceSeed`). Actor hệ thống của
    tenant: app cấp trước đủ 10 khoá. `positions.title` = render `title_template` khi biết owner (seed ghi 'Trợ lý'). CT-0001 (container AI Hệ thống) không
    nằm trong seed (tên `ga-sys-<short_code>` theo tenant) — app tạo ở Onboarding.
  - Nội dung: global = workspace hệ thống, 10 actor hệ thống, 4 engines, 31 `dna_field_defs`; mỗi tenant = 10 actor, 12 settings (ST-0002…0009,
    0015…0018), PS-0001, ví Kho bạc + Sink, 4 `system_agents` (model chọn ở Onboarding bước 4), 5 tool built-in, 10 skin chibi, `id_counters`.
    [ĐỀ XUẤT — lane DB, chờ Gen]: tos_risk claude-code / openclaw = 'grey' (§11.2 không ghi); risk_level / default_mode / tên tool built-in.
  - `seed()` của bộ test: engines theo DATABASE §5 (cli_binary `agy` / `claude` / `codex` / `openclaw`, antigravity tos_risk `high`).

### Test (bộ Python 107 → 117)
- `GEN-guards`: ca âm sinh tự động cho mọi guard sinh từ DDL (249: `_no_delete` 25, `_no_update` 25, `_ident` 41, `_no_replace_i/_u` 79 + 79), danh sách
  kỳ vọng lấy từ đầu ra generator (không đọc `sqlite_master` — guard bị bỏ vẫn được thử); mỗi ca chặn bằng đúng thông điệp của guard đó.
- `HAND-guards` (25 trigger viết tay sống ở lượt toàn bộ đầu tiên) + `PAIR-u` (4 nửa `_u`): mỗi trigger một ca âm riêng, đã đo bỏ guard ⇒ lọt; ca nào
  ngoài bảo trì bị guard sinh tự động chặn trước thì chạy trong bảo trì (guard đích không miễn bảo trì). `trust_tier_changes_ai`: kiểm hiệu ứng.
- `SEED-build` chạy đầu: `seed()` không dựng được dưới schema ⇒ FAIL rồi dừng (vd bỏ `ledger_entries_ai` ⇒ số dư ví không giữ ⇒ sổ cái mẫu không ghi được).
- Bước thuận bọc (`_pos` / `_val` / `_try` / `_tc`): lỗi DB hoặc dữ liệu bước trước không có ⇒ ok sai ⇒ FAIL; đổi loại Core agent (điều kiện dựng ca)
  hỏng ⇒ FAIL + dừng test. Điều khiển âm trong WRITER-meta / ACTOR-meta / B3-game: `DROP TRIGGER IF EXISTS`.
- Mới khác: `FTS-sync` (đọc thẳng chỉ mục + `integrity-check`), `NUL-check`, `SQL-noname`, `SECRET-kind`, `ENGINE-unrestricted`, `SEED-ref`; ACTOR-guard
  + 5 ca FK SET NULL (gỡ FK khi cha còn ×2, no-op, mồ côi đổi FK, mồ côi về NULL kèm sửa cột khác).
- Bỏ tên người trong văn bản SQL sinh ra (INT-12): nhãn quyết định ghi bằng mã.

### Mutation (DoD v2.3.4)
- **Lượt toàn bộ cuối** (`5f81fac`, 564 trigger, bộ 117 test, mỗi lượt DROP đúng 1 trigger + tiến trình + bản sao mới; ~286 phút CPU): **563/564 đỏ thật
  qua dòng FAIL, 0 sống**, 1 nghi đỏ giả — `dna_field_versions_role_target_u` văng `UNIQUE (chống REPLACE…): roles` do fixture chập chờn KHÔNG liên quan
  đột biến (`make_carded_role` lấy `registry_no` = 4 chữ số cuối `perf_counter_ns` ⇒ thỉnh thoảng trùng); chạy lại 4 lần không văng; đã thay bằng bộ đếm,
  `mutate.py --only dna_field_versions_role_target_u` sau sửa: ĐỎ (FAIL HAND-guards), đối chứng 117/117. Mẫu 40 trigger của job CI (`--changed --max 40`,
  seed 20261016) với base `feat/m0-foundation` và `main`: 40/40 đỏ trong lượt toàn bộ.
- Lượt toàn bộ đầu (`3c297e0`, bộ 115): 516 đỏ / 26 sống / 22 nghi ⇒ thêm `HAND-guards`, `SEED-build`, bọc bước thuận ⇒ 48 trigger đó chạy lại
  `--only`: 48/48 đỏ qua FAIL.
- Đột biến MỆNH ĐỀ cho các vá MEDIUM (sửa một mệnh đề trong generator, sinh lại, chạy nguyên bộ): FK_SETNULL_ONLY 5/5 nhánh đỏ qua FAIL (keep, changed,
  NOT EXISTS, "về NULL", "giữ nguyên"); RA_ALLOW, RA_NO_UESC đỏ (ANCHOR-parse).
- **Thừa theo thiết kế (khai, không có ca riêng được):** `RA_ASCII` (so byte) — NUL / ký tự ngoài ASCII chỉ vào được URL qua escape `\u` (bị
  `RA_NO_UESC` cấm) hoặc JSON thô có NUL / JSONB (bị `json()` / dạng chuẩn `value_json = json(value_json)` loại) ⇒ lớp phòng thủ thứ hai, giữ theo yêu cầu
  review. Vế `OLD.kind` của `secrets_writer_u` — `secrets_kind_u` đã cấm đổi kind ngoài bảo trì, trong bảo trì cả hai cổng miễn ⇒ vế này chỉ có tác dụng
  nếu `secrets_kind_u` bị bỏ (đột biến cả trigger `secrets_kind_u` thì đỏ qua SECRET-kind).
- CI (`DB · mutation`, `--changed --max 40`) chỉ chạy trên PR; nhánh chưa có PR (Gen tạo) ⇒ lượt toàn bộ ở trên chạy local bằng đúng `run_suite` của mutate.py.

### Ghi chú cho L0 / tầng code
- Tệp L0 đã chạm (báo L0): `packages/db/scripts/gen.ts` (header nguồn = repo), `README.md`, `scripts/lint-rules.mjs` (comment), `scripts/db-sync.sh`
  (viết lại: nguồn = repo + seed), `packages/db/src/stamp.ts` (`stampUpdate` / `stampSoftDelete` đặt `updated_at = FRESH_UPDATED_AT` — guard chung
  v2.3.3 đòi `updated_at` đổi ở mỗi UPDATE), `packages/db/src/seed/ids.ts` (mới) + export ở `packages/db/src/index.ts`, `packages/db/test/write.test.ts`
  (test `app_actor` bỏ `runIf`), `packages/db/test/seed-reference-file.test.ts` (mới).
- `SYNC.json` đổi nghĩa: manifest sinh từ `db/spec` (`source: repo`, `rev: repo`), không còn `source_repo` / `database_md`.
- `engine_installs.tool_restriction_version`: app ghi (actor system) sau khi kiểm `toolRestriction.requiredFlags` ⊆ cờ đã quét của đúng phiên bản; cập
  nhật CLI ⇒ ghi lại. Role: `v_engine_accounts.engine_tool_restriction_ok` (runner vẫn là cổng của lượt Role).
