# DB spec — CHANGELOG (nguồn = repo)

Từ v2.3.4, `db/spec/` của repo code là **nguồn duy nhất** của schema + test DB (STD-05 1.2.0, "chế độ gọn"). Changelog ngắn ở đây; Gen gom vào
`DATABASE.md` (Second-Brain) ở cuối mốc M1. Bản v2.3.3 trở về trước: changelog trong `DATABASE.md` (Second-Brain `988cf46`).

Quy trình: sửa `schema_v2_2.py` / `views_v2_2.sql` / `tests_v2_2.py` → `pnpm db:sync` (sinh lại SQL + manifest `SYNC.json`) → `pnpm db:gen` → `pnpm db:test`
→ `pnpm db:mutation -- --all` (mỗi lượt DROP một trigger; đỏ chỉ qua dòng FAIL).

## v2.3.5 — 2026-10-17

Nguồn: review bảo mật tay trên `2bbd12b` (chặn merge M0, probe pA…pI) + 3 lượt auto-review trên các commit v2.3.5 + review hợp đồng API (mục a).
Trigger 564 → 905 (+342 / −1 `schema_migrations_no_replace_u`); bộ test Python 117 → 125; hàm SQL mới `app_bootstrap()`.

### Vá bảo mật
- **HIGH (pA) — bảng gốc phân quyền không có cổng người ghi** (`workspace_members`, `actors`, `users`): admin tự nâng owner rồi đi qua mọi cổng owner-only.
  - `workspace_members_writer_i/_u`: hàng mức owner (cũ hoặc mới) chỉ owner; còn lại owner / admin; actor system của workspace hoặc của workspace hệ thống
    (`SYS_SYS`); `workspace_id` / `user_id` bất biến ngoài bảo trì. `workspace_members_owner_last_u`: tenant luôn còn ≥ 1 owner active.
    `workspace_members_delete_d`: xoá cứng chỉ bảo trì (gỡ = `removed_at`).
  - **Membership chéo workspace** (`workspace_members_cross_i`, `_cross_u` — kích hoạt lại): user đang active ở workspace khác ⇒ chỉ `SYS_SYS` (luồng mời qua
    dịch vụ app). Owner / admin / actor system tenant chỉ thêm user chưa thuộc workspace nào khác (chặn kéo user tenant B vào A để thành "owner của user đó").
  - `actors_writer_i/_u`, `actors_lock_u` (kind / user_id / role_id / system_key / workspace_id bất biến ngoài bảo trì), `actors_writer_d` (owner / actor system).
    Actor system đầu tiên tự đăng ký CHỈ trong `conn.bootstrap` của chính workspace đó (`app_bootstrap()` = workspace_id) và `NEW.id = app_actor()`.
  - `users_writer_i` (`SYS_SYS` / owner / admin đang hoạt động), `users_writer_u` (**chỉ chính người đó hoặc `SYS_SYS`** — auto-review HIGH: bỏ nhánh "owner của
    workspace có người đó" = chiếm tài khoản chéo tenant; chính người đó không đụng `id`, `display_id`, `display_seq`, `created_at`, `disabled_at`,
    `failed_login_count`, `locked_until`, `last_login_at`, tài khoản bị vô hiệu không tự sửa), `users_writer_d` (`SYS_SYS`).
  - `auth_sessions_writer_i/_u/_d`: dịch vụ đăng nhập = `SYS_SYS`; chính người đó chỉ thu hồi (`revoked_at`, mọi cột khác giữ nguyên) hoặc xoá phiên của mình.
- **HIGH (auto-review) — actor system không giới hạn tenant**: `USR_SYS` cũ nhận actor system của BẤT KỲ workspace ⇒ nay `SYS_SYS = _sys_of('<SYS>')` cho bảng
  toàn cục (users, auth_sessions, engines, workspaces mới, membership chéo). Quét toàn bộ SQL sinh ra: mọi `system_key = 'system'` đều nằm trong truy vấn con
  có `workspace_id` (0 chỗ thiếu).
- **workspaces** — `workspaces_writer_i`: tạo chỉ trong `conn.bootstrap` của chính workspace đó (`app_bootstrap()`), bảo trì, hoặc `SYS_SYS`;
  `workspaces_writer_u` (owner / admin / system của chính workspace; trừ `core_agent_locked_at` — guard riêng); `workspaces_writer_d` (bảo trì).
- **MEDIUM (pC / pD / pH / pI + proactive_policies)**: `containers_writer_i/_u/_d` + `containers_sys_u` (image / CLI / tài nguyên chỉ actor system);
  `engines_writer_i/_u/_d` (bảo trì / `SYS_SYS`); `settings_writer_*` mặc định từ chối (owner / admin / system), `settings_retention_i/_u/_d`
  (`audit.retention_days` 1–36500, `log.retention_days` 1–3650, `purge.grace_days` 1–3650, số nguyên, chỉ owner); `telegram_allowlist_writer_*` (tác tử
  Telegram chỉ INSERT hàng capture); `tool_grants_writer_*`, `egress_rules_writer_*` (xoá cứng: chỉ owner / system — admin / Role không);
  `proactive_policies_writer_*`, `max_per_day` số nguyên 0–20 (giữ trần 20 đã có trong DDL), giờ yên tĩnh số nguyên.
- **`_writer_pair` ⇒ `_writer_gates`** (ba cổng I / U / D; D = điều kiện U đổi `NEW.*` ⇒ `OLD.*`, bảng nhạy cảm truyền `cond_d` chặt hơn).
- **DELETE mặc định** (`{t}_writer_d`, sinh từ DDL): mọi bảng có `workspace_id` chưa có cổng xoá riêng / append-only ⇒ xoá cứng ngoài bảo trì chỉ owner / admin
  còn là thành viên hoặc actor system (`system`) của `OLD.workspace_id` (40 bảng). **Xoá cứng không lỏng hơn luật ghi**: `secrets_writer_d` theo kind
  (anchor_remote_token chỉ owner; telegram_bot_token owner / system; còn lại owner / admin / system), `telegram_bots_writer_d` (owner / system — admin không),
  `engine_installs_writer_d` (chỉ actor system).
- **Bảng không có cột người ghi** (`{t}_ws_actor_i/_u`, sinh từ DDL): `change_set_items`, `compiled_prompt_segments` (chỉ I — append-only), `id_counters`,
  `knowledge_chunks`, `search_documents`, `skill_engine_support`, `skill_files`, `usage_daily` — ghi ngoài bảo trì cần actor của CHÍNH workspace (trước: ghi vô danh).
- **`schema_migrations_maint_i/_u/_d`**: lịch sử migration chỉ ghi trong bảo trì (runner).
- **MEDIUM (pB) — NOT NULL DEFAULT + OR REPLACE** (`{t}_notnull_i/_u`, sinh từ DDL, 78 + 78): SQLite thay NULL bằng DEFAULT SAU khi guard BEFORE đã đọc NULL ⇒ chặn
  NULL ở mọi cột NOT NULL có DEFAULT; tạo gần cuối ⇒ chạy trước mọi BEFORE trigger cùng sự kiện.
- **MEDIUM (review rowid) — `OF rowid` phụ thuộc parser** (đo trên SQLite 3.45: `SET _rowid_` / `SET oid` / `SET <cột INTEGER PK>` KHÔNG kích `BEFORE UPDATE OF
  rowid`): `{t}_rowid_lock` cho MỌI bảng MVP (81), `BEFORE UPDATE` không danh sách cột, `WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (hàng
  có rowid mới))` — ngoài bảo trì rowid bất biến; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó). `{t}_no_replace_u` bỏ khoá rowid và
  khoá cột INTEGER PRIMARY KEY (đã thuộc `_rowid_lock`); `{t}_no_replace_i` giữ khoá rowid ẩn (LOW pF: `x.rowid = NEW.rowid`).
- **LOW (pE) — CHECK so byte bị lách bằng BLOB**: `typeof(col) = 'text'` cho `short_code`, `slug` (skills, taxonomy_nodes), `skin_assets.sha256`, `auth_volume`,
  `allowed_host`.
- **Review hợp đồng API (a) — `telegram_allowlist_owner_new_i/_u`**: nhánh bootstrap (bot chưa có owner active) từng cho MỌI actor ⇒ admin / tác tử chiếm ghế
  owner trước. Nay bootstrap chỉ actor system (`system`) của CHÍNH workspace; owner của workspace thì luôn được; bảo trì miễn. (Actor system của workspace hệ
  thống không ghi được allowlist tenant — `telegram_allowlist_writer_i` — nên "SYS system actor" của review hiểu là actor system của workspace.)

### HMAC chuỗi audit (MEDIUM pG) — cho L-DB `audit-writer`
- `row_hash = HMAC-SHA256(audit_key(workspace_id), UTF-8(JCS(hàng)))`; hàng = **MỌI cột của `audit_log` trừ `row_hash`**, tên cột = khoá JSON, NULL ghi `null`,
  số nguyên là số; JCS = khoá sắp theo code unit, không khoảng trắng (= `canonicalJson` của contracts) ⇒ thứ tự cột không ảnh hưởng. 29 cột (PRAGMA order):
  `id, workspace_id, display_id, display_seq, created_at, created_by, actor_id, actor_label, actor_kind, action, result, role_id, entity_type, entity_id,
  entity_display_id, before_json, after_json, detail_json, reason, tool, session_id, task_id, channel, request_id, ip_hash, tokens_total, cost_micro_usd,
  hash_key_id, prev_hash`. Chuỗi nối bằng `prev_hash` (nằm trong hàng đã băm). Bên ghi phải ghi TƯỜNG MINH mọi cột (giá trị đã băm = giá trị đã lưu); cột mới
  của `audit_log` tự vào HMAC (danh sách đọc từ PRAGMA). Verify: so MAC + `prev_hash` = `row_hash` hàng trước.

### Nghĩa vụ app (L-SYS / L-HR / L-DB repos / L-API)
- `app_bootstrap()`: hàm SQL mới — `conn.bootstrap({workspaceId, systemActorId})` đặt = `workspaceId` trong đúng giao dịch đó (`packages/db/src/connection.ts`);
  ngoài bootstrap NULL. Kết nối đọc không có hàm này (như `app_actor()`).
- Tạo workspace: trong `conn.bootstrap` của chính nó (ghi hàng `workspaces` + actor system đầu tiên cùng giao dịch), hoặc `conn.write(<actor system workspace hệ
  thống>)` (Onboarding tenant), hoặc bảo trì.
- **Owner đặt lại mật khẩu / mở khoá thành viên** = dịch vụ app chạy bằng `SYS_SYS` SAU khi app kiểm quyền (owner của workspace có người đó và người đó không thuộc
  workspace nào owner kia không làm owner) — DB không còn nhánh owner. Dịch vụ đăng nhập (`failed_login_count`, `locked_until`, `last_login_at`, phiên) = `SYS_SYS`.
- Mời user đang thuộc workspace khác = dịch vụ app chạy bằng `SYS_SYS`.
- Xoá cứng (ngoài bảo trì) cần owner / admin / actor `system` của workspace — job dọn chạy bằng actor `system`, không phải `scheduler`.
- Bảng dẫn xuất (`search_documents`, `usage_daily`, `knowledge_chunks`, …) ghi bằng actor của chính workspace (job hệ thống).
- **Lệch contracts**: `SETTINGS['audit.retention_days' | 'log.retention_days' | 'purge.grace_days'].writers = OWNER_ADMIN` nhưng DB (review pI) = chỉ owner ⇒ L-API
  sửa `writers` sang owner-only (v2.3.6 mở rộng danh sách khoá nới an ninh).

### Quét cổng mọi bảng × lối (test `WRITER-all`, đọc `sqlite_master`)
- 86 bảng × 4 lối. INSERT: authz 25 / actor 55 / maint 1 / miễn 5; UPDATE: authz 19 / frozen 25 / actor 36 / maint 1 / miễn 5; DELETE: authz 53 / maint 28 /
  miễn 5; rowid: `_rowid_lock` 81 / miễn 5.
- **Cổng phân quyền đủ I + U + D (20)**: actors, auth_sessions, containers, egress_rules, engine_accounts, engine_bindings, engine_installs, engines,
  proactive_policies, schema_migrations, secrets, settings, skin_assets, telegram_allowlist, telegram_bots, tool_grants, tools, users, workspace_members,
  workspaces.
- **Chỉ guard chung người ghi ở I / U (khai lý do trong `WRITER_ALL_ACTOR_ONLY`; DELETE vẫn có cổng)** — nợ cổng vai trò, Gen quyết từng bảng:
  - [flow — owner / admin / Role / tác tử ghi theo luồng, phân quyền ở tầng app] assignments, change_sets, chat_threads, commitments, dna_field_defs, dna_fields,
    employee_cards, instructions, jobs, knowledge_items, memories, message_attachments, notifications, permission_requests, positions, proactive_jobs,
    role_skills, roles, skill_prereqs, skills, tasks, taxonomy_nodes, wallets;
  - [runtime — kết quả vận hành do app ghi] app_versions, backups, capabilities, model_ranks, system_agents, update_runs;
  - [log — append-only: UPDATE đóng băng, DELETE chỉ bảo trì] audit_log, avatars, blobs, chat_messages, compiled_prompts, consents, dna_field_versions,
    id_aliases, instruction_versions, message_anchors, polaris_checks, proactive_sends, probe_runs, quota_snapshots, recall_hits, revisions, role_wounds,
    sessions, skill_versions, trial_runs, trust_tier_changes, ui_actions;
  - [derived — không có cột người ghi, `{t}_ws_actor_*`] change_set_items, compiled_prompt_segments, id_counters, knowledge_chunks, search_documents,
    skill_engine_support, skill_files, usage_daily.
- **Miễn**: FTS5 `search_fts`, `search_fts_config`, `search_fts_data`, `search_fts_docsize`, `search_fts_idx` (bảng ảo + bóng nội bộ; chỉ FTS5 ghi qua trigger
  đồng bộ của `search_documents`); cột `workspaces.core_agent_locked_at` (trigger `probe_runs_core_lock_*` ghi; guard riêng ghi một lần).

### Trigger mới (tên — cho L-DB)
- Viết tay (50): `workspace_members_writer_i/_u`, `workspace_members_cross_i/_u`, `workspace_members_owner_last_u`, `workspace_members_delete_d`,
  `actors_writer_i/_u/_d`, `actors_lock_u`, `users_writer_i/_u/_d`, `auth_sessions_writer_i/_u/_d`, `schema_migrations_maint_i/_u/_d`,
  `workspaces_writer_i/_u/_d`, `containers_writer_i/_u/_d`, `containers_sys_u`, `engines_writer_i/_u/_d`, `settings_retention_i/_u/_d`,
  `{settings, telegram_allowlist, tool_grants, egress_rules, proactive_policies}_writer_i/_u/_d`, `secrets_writer_d`, `telegram_bots_writer_d`,
  `engine_installs_writer_d`.
- Sinh từ DDL: `{t}_notnull_i` 78, `{t}_notnull_u` 78, `{t}_rowid_lock` 81, `{t}_writer_d` mặc định 40, `{t}_ws_actor_i` 8, `{t}_ws_actor_u` 7.
- Sửa: `telegram_allowlist_owner_new_i/_u` (bootstrap), `{t}_no_replace_i` (+ khoá rowid ẩn), `{t}_no_replace_u` (bỏ khoá rowid / INTEGER PK).

### Test (bộ Python 117 → 125)
- Mới: `ROOT-authz` (86 ca âm / 46 thuận), `REPLACE-notnull`, `ROUTE-writers` (54 / 23), `WS-actor` (29 / 7), `ROWID-lock` (rowid / "rowid" / ROWID / _rowid_ / oid / INTEGER PK ×2,
  bảo trì REPLACE ON / OFF), `BLOB-check`, `AUDIT-hmac` (sửa 8 cột kể cả `prev_hash`, NULL ↔ giá trị), `WRITER-all` (meta-test + 12 đối chứng âm).
- `GEN-guards` + `_notnull_i/_u`, `_rowid_lock`, `_writer_d` (mặc định + viết tay), `_ws_actor_i/_u`: 554/554 guard sinh / cổng xoá có ca âm tự dựng.
- `AL-owner-create` + bootstrap bởi admin / viewer / tác tử Telegram / actor system tenant khác / tác tử + actor system workspace hệ thống ⇒ chặn.
- Probe pA…pI của review (`scratchpad/m1/review-db/probe`) chạy lại trên schema v2.3.5 (dựng người thử bằng actor system + bảo trì): mọi bước khai thác `ERR`;
  pG: sửa audit ⇒ `verify_chain` báo hàng bị sửa.
- **Bộ đệm seed trong một tiến trình** (`seed()` = `_seed_fresh` lần đầu, sau đó bản sao sqlite backup + đặt lại đồng hồ giả về mốc ngay sau seed + bản sao
  X): 125 / 125 PASS, mọi dòng báo cáo trùng bản không đệm (`GA_SEED_NOCACHE=1`); 95 s → 18 s dưới tải ⇒ mutation toàn bộ khả thi. Mỗi lượt mutation
  vẫn là tiến trình mới (seed đầu tiên dựng dưới schema đột biến).
- Fixture: repository giả lập đặt `app_bootstrap()` khi dựng workspace, `SYS_SYS` cho bảng toàn cục / membership chéo, actor system cho DELETE và bảng không có
  `created_by`; TS: `seedMinimal` tạo workspace trong `conn.bootstrap`; runner test ghi `schema_migrations` trong `conn.maintenance`.

### Mutation
- (đang chạy — ghi kết quả ở commit sau)

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
