# -*- coding: utf-8 -*-
"""DDL SQLite cho DATABASE.md v2.2 → v2.3.4 (gen-agents) — sinh từ một DSL nhỏ. Từ v2.3.4: NGUỒN DUY NHẤT = db/spec/ của repo code (changelog: db/spec/CHANGELOG.md).
(v2.3.x: thư mục / tên tệp giữ "v2_2" — bằng chứng nối tiếp từ v2.2.x; xem DATABASE.md changelog v2.2.13 → v2.3.0, …, v2.3.2 → v2.3.3.)
v2.3.3 (review bảo mật HIGH trên v2.3.2 — authorization bypass theo LỚP): người ghi = app_actor() (hàm ngữ cảnh kết nối, app đặt cho từng giao dịch ghi);
cột created_by / updated_by / deleted_by chỉ là bản ghi lại, guard chung {t}_actor_i/_u (sinh từ DDL) buộc khớp; mọi cổng người ghi kiểm app_actor().
v2.3.1 (ADR 0004 [Gen quyết 2026-10-16], BUILD-PLAN §D.4, CNS-157): SQL TRƯỚC — DDL sinh ở đây (đã test) CHÍNH LÀ nguồn schema; không có Drizzle.
Repo code vendor theo MỘT commit của SB (db-sync, SYNC.json) rồi tách: baseline `0001_baseline.sql` = CHỈ bảng + index (+ bảng ảo FTS);
`R__triggers.sql` = mọi trigger (luật cột, chống REPLACE, nghiệp vụ, đồng bộ FTS) — repeatable, runner DROP + CREATE lại sau mỗi lượt migration và
sau mỗi `rebuild`; `R__views.sql` = mọi view. Không đóng cứng trigger vào baseline (rebuild DROP trigger thì không còn gì dựng lại).
Test parity (BUILD-PLAN §C.4): runner TS dựng DB (baseline + R__*) phải khớp sqlite_master của DB do file này dựng (bảng, index, trigger, view).
Chạy: python3 -I schema_v2_2.py  -> ghi schema_v2_2.sql + in thống kê.
"""
import re, json, sys, os, sqlite3

SYS = '0' * 26
TS_DEFAULT = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
DEF = "DEFERRABLE INITIALLY DEFERRED"  # NO ACTION + deferred: tham chiếu nội bộ aggregate / tự tham chiếu

T = {}      # name -> dict
ORDER = []

def table(name, kind, prefix=None, cols=(), cons=(), idx=(), rules=None, game=False):
    T[name] = dict(kind=kind, prefix=prefix, cols=list(cols), cons=list(cons), idx=list(idx), rules=rules, game=game)
    ORDER.append(name)

ID = "id TEXT PRIMARY KEY CHECK (length(id) = 26)"
WS = "workspace_id TEXT NOT NULL REFERENCES workspaces(id)"
DISP = ["display_id TEXT NOT NULL", "display_seq INTEGER NOT NULL CHECK (display_seq > 0)"]
CA = f"created_at TEXT NOT NULL DEFAULT {TS_DEFAULT}"
CB = "created_by TEXT NOT NULL REFERENCES actors(id)"
E_TAIL = ["updated_at TEXT", "updated_by TEXT REFERENCES actors(id)", "deleted_at TEXT",
          "deleted_by TEXT REFERENCES actors(id)", "version INTEGER NOT NULL DEFAULT 1"]

def std_cols(kind):
    if kind == 'E':  return [ID, WS, *DISP, CA, CB, *E_TAIL]
    if kind == 'En': return [ID, WS, CA, CB, *E_TAIL]          # thực thể không display_id
    if kind == 'A':  return [ID, WS, *DISP, CA, CB]
    if kind == 'An': return [ID, WS, CA, CB]
    if kind == 'P':  return []
    raise ValueError(kind)

def enum(col, values, nn=True, default=None):
    vals = ", ".join(f"'{v}'" for v in values)
    d = f" DEFAULT '{default}'" if default is not None else ""
    if nn:
        return f"{col} TEXT NOT NULL{d} CHECK ({col} IN ({vals}))"
    return f"{col} TEXT{d} CHECK ({col} IS NULL OR {col} IN ({vals}))"

def boolc(col, default=0):
    return f"{col} INTEGER NOT NULL DEFAULT {default} CHECK ({col} IN (0, 1))"

def jsonc(col, nn=False):
    if nn:
        return f"{col} TEXT NOT NULL CHECK (json_valid({col}))"
    return f"{col} TEXT CHECK ({col} IS NULL OR json_valid({col}))"

SRC = ['owner', 'ai_inferred', 'system']
SENS = ['normal', 'personal', 'confidential']
VSTAT = ['proposed', 'accepted', 'rejected']

def vcols(parent, parent_table):
    return [ID, WS, f"{parent} TEXT NOT NULL REFERENCES {parent_table}(id) ON DELETE CASCADE",
            "version INTEGER", "base_version INTEGER", enum('status', VSTAT, default='proposed'),
            "note TEXT", f"revision_id TEXT REFERENCES revisions(id) {DEF}",
            f"change_set_id TEXT REFERENCES change_sets(id) {DEF}", CA, CB,
            "decided_at TEXT", "decided_by TEXT REFERENCES actors(id)"]

VCONS = ["CHECK ((status = 'accepted') = (version IS NOT NULL))",
         "CHECK ((status = 'proposed') = (decided_at IS NULL))"]
V_RULE = dict(write_once=['version', 'revision_id', 'decided_at', 'decided_by'],
              transitions={'status': [('proposed', 'accepted'), ('proposed', 'rejected')]})

# ---------------------------------------------------------------- 5.1 workspace, danh tính
table('workspaces', 'P', cols=[
    ID, enum('kind', ['system', 'tenant']), "slug TEXT NOT NULL UNIQUE", "name TEXT NOT NULL",
    "owner_user_id TEXT REFERENCES users(id)",
    "short_code TEXT NOT NULL UNIQUE CHECK (length(short_code) = 4)",
    "locale TEXT NOT NULL DEFAULT 'vi'", "timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'",
    "currency_code TEXT NOT NULL DEFAULT 'GEN'", "currency_symbol TEXT NOT NULL DEFAULT '₲'",
    enum('status', ['active', 'suspended', 'archived'], default='active'), CA, "updated_at TEXT", "archived_at TEXT",
    # v2.2.6 (CONTRACT-r6 A5): mốc khoá loại Core agent, ghi MỘT lần, không xoá/sửa được (workspaces_core_lock_u).
    # v2.2.9 (CONTRACT-r8b §A, CNS-099): mốc = lần kiểm đăng nhập ĐẠT đầu tiên (probe_runs login_check ok) của tài khoản Core agent
    # (probe_runs_core_lock_ai/_au), KHÔNG còn lúc ghi binding. ST-0017 chỉ đọc kể từ mốc này; trước mốc (mode setup) gỡ được tài khoản +
    # binding Core agent và đổi được loại ("Chọn loại khác").
    "core_agent_locked_at TEXT",
    # v2.3.1 (BUILD-PLAN §B.9, CNS-145 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]): MỐC KHÔI PHỤC gần nhất — backup không chứa volume /auth, nên sau
    # `genagents restore` (nhất là sang máy mới) mọi tài khoản phải kiểm đăng nhập lại. App ghi = app_now() ở lần khởi động đầu sau restore (updater để lại
    # dấu ở /data/run), cho mọi workspace tenant. Chỉ tiến, không xoá / lùi (workspaces_restored_u). Nguồn của v_relogin_required (A0 + A5).
    "restored_at TEXT"],
    cons=[f"CHECK ((kind = 'system') = (id = '{SYS}'))"],
    idx=["CREATE UNIQUE INDEX ux_workspaces_system ON workspaces(kind) WHERE kind = 'system'"])

# v2.1 (CNS-010): users có mã người US- (Onboarding v3 ghi "owners · OW-0001" → users · US-0001); bộ đếm ở workspace hệ thống
table('users', 'P', cols=[
    ID, "display_id TEXT NOT NULL", "display_seq INTEGER NOT NULL UNIQUE CHECK (display_seq > 0)",
    "username TEXT NOT NULL UNIQUE", "email TEXT UNIQUE", "display_name TEXT NOT NULL",
    "password_hash TEXT NOT NULL", boolc('must_change_password', 1), "password_changed_at TEXT",
    "failed_login_count INTEGER NOT NULL DEFAULT 0", "locked_until TEXT", "last_login_at TEXT",
    "locale TEXT", "timezone TEXT", enum('theme', ['dark', 'light', 'system'], nn=False),
    "avatar_blob_id TEXT REFERENCES blobs(id) ON DELETE SET NULL", CA, "updated_at TEXT", "disabled_at TEXT"])

table('workspace_members', 'P', cols=[
    WS, "user_id TEXT NOT NULL REFERENCES users(id)",
    enum('access_level', ['owner', 'admin', 'operator', 'viewer']), CA, "removed_at TEXT"],
    cons=["PRIMARY KEY (workspace_id, user_id)"])

table('auth_sessions', 'P', cols=[
    ID, "user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE", "token_hash TEXT NOT NULL UNIQUE",
    CA, "expires_at TEXT NOT NULL", "last_seen_at TEXT", "ip TEXT", "user_agent TEXT", "revoked_at TEXT"],
    idx=["CREATE INDEX ix_auth_sessions_user ON auth_sessions(user_id, expires_at)"])

table('actors', 'P', cols=[
    ID, WS, enum('kind', ['user', 'role', 'system']), "user_id TEXT REFERENCES users(id)",
    "role_id TEXT REFERENCES roles(id) ON DELETE SET NULL",
    enum('system_key', ['system', 'interviewer', 'trainer', 'consolidator', 'judge', 'scheduler', 'gateway',
                        'updater', 'telegram', 'assistant'], nn=False),
    "label TEXT NOT NULL", CA, "purged_at TEXT"],
    cons=["""CHECK (
    (kind = 'user'   AND user_id IS NOT NULL AND role_id IS NULL AND system_key IS NULL AND purged_at IS NULL) OR
    (kind = 'role'   AND user_id IS NULL AND system_key IS NULL AND (role_id IS NOT NULL OR purged_at IS NOT NULL)) OR
    (kind = 'system' AND system_key IS NOT NULL AND user_id IS NULL AND role_id IS NULL AND purged_at IS NULL))""",
          "UNIQUE (workspace_id, user_id)", "UNIQUE (role_id)", "UNIQUE (workspace_id, system_key)"])

table('id_counters', 'P', cols=[WS, "prefix TEXT NOT NULL", "last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0)"],
      cons=["PRIMARY KEY (workspace_id, prefix)"])

table('id_aliases', 'An', cols=[
    "entity_type TEXT NOT NULL", "entity_id TEXT NOT NULL", "old_display_id TEXT NOT NULL",
    "source_code TEXT NOT NULL", "new_display_id TEXT NOT NULL", "import_revision_id TEXT"],
    cons=["UNIQUE (workspace_id, source_code, old_display_id)"],
    idx=["CREATE INDEX ix_id_aliases_old ON id_aliases(workspace_id, old_display_id)"],
    rules=dict(mode='append'))

# ---------------------------------------------------------------- 5.2 Person
COLORS = ['saffron', 'coral', 'rose', 'orchid', 'iris', 'azure', 'teal', 'jade', 'moss', 'olive', 'clay', 'slate']
table('roles', 'E', 'RL', cols=[
    "name TEXT NOT NULL", "name_norm TEXT NOT NULL", enum('color', COLORS), "description TEXT",
    f"avatar_id TEXT REFERENCES avatars(id) ON DELETE SET NULL {DEF}",
    enum('lifecycle_status', ['draft', 'born', 'training', 'candidate', 'carded', 'suspended', 'archived'], default='draft'),
    enum('runtime_state', ['none', 'sleeping', 'starting', 'running', 'error', 'stopped'], default='none'),
    "runtime_detail TEXT", "runtime_state_at TEXT",
    # v2.1 (Q-R3): cache tình trạng — chỉ trigger ví ghi (vào/ra Trọng thương, bảng role_wounds)
    enum('condition', ['normal', 'wounded'], default='normal'),
    "born_at TEXT", "registry_no TEXT",
    f"birth_revision_id TEXT REFERENCES revisions(id) {DEF}", f"current_revision_id TEXT REFERENCES revisions(id) {DEF}",
    "dna_schema_version TEXT NOT NULL DEFAULT '1'",
    "prompt_budget_tokens INTEGER NOT NULL DEFAULT 2000 CHECK (prompt_budget_tokens BETWEEN 200 AND 8000)",
    "brain_head_sha TEXT", "last_active_at TEXT"],
    cons=["CHECK (lifecycle_status = 'draft' OR born_at IS NOT NULL)",
          "CHECK ((born_at IS NULL) = (registry_no IS NULL))",
          "UNIQUE (workspace_id, registry_no)"],
    idx=["CREATE UNIQUE INDEX ux_roles_name ON roles(workspace_id, name_norm) WHERE deleted_at IS NULL",
         "CREATE INDEX ix_roles_state ON roles(workspace_id, lifecycle_status, runtime_state)",
         "CREATE INDEX ix_roles_active ON roles(workspace_id, last_active_at)"])

table('avatars', 'A', 'AV', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE",
    enum('source', ['upload', 'generated', 'monogram', 'library']), "blob_id TEXT REFERENCES blobs(id)",
    enum('mime', ['image/png', 'image/jpeg', 'image/webp'], nn=False),
    "size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes <= 5242880)", "width INTEGER", "height INTEGER",
    "crop_x REAL", "crop_y REAL", "crop_zoom REAL CHECK (crop_zoom IS NULL OR crop_zoom BETWEEN 1.0 AND 3.0)",
    # v2.2 (CNS-034): ảnh chọn từ "Thư viện" của gói skin — trỏ tài sản + CHÉP gói/mã/license/ghi công/sha256 lúc chọn
    # (gỡ gói: FK về NULL nhưng dấu vết nguồn + license vẫn còn trên avatar)
    "skin_asset_id TEXT REFERENCES skin_assets(id) ON DELETE SET NULL", "skin_pack_slug TEXT", "skin_asset_code TEXT",
    "skin_license TEXT", "skin_attribution TEXT", "skin_sha256 TEXT"],
    cons=["CHECK ((source IN ('monogram', 'library')) = (blob_id IS NULL))",
          "CHECK ((source = 'library') = (skin_asset_code IS NOT NULL))",
          "CHECK (source <> 'library' OR (skin_pack_slug IS NOT NULL AND skin_license IS NOT NULL AND skin_sha256 IS NOT NULL))",
          "CHECK (source = 'library' OR skin_asset_id IS NULL)"],
    idx=["CREATE INDEX ix_avatars_role ON avatars(role_id, created_at)"],
    # v2.2: vẫn chỉ ghi thêm — trừ skin_asset_id được về NULL (FK SET NULL khi gỡ gói; dấu vết gói/mã/license chép trên hàng giữ nguyên)
    rules=dict(mutable_when={'skin_asset_id': 'NEW.skin_asset_id IS NULL'}))

# v2.2 (CNS-034, INT-18): danh mục ảnh của một gói skin (nhập từ ASSET_MANIFEST của gói khi cài; gỡ gói = xoá các hàng này).
# Chung chung có chủ đích: gói, mã, nguồn, license, sha256, dòng ghi công — KHÔNG giả định giấy phép nào (license do gói khai).
# v2.3.0 (CONTRACT-r9 §A/§B — Kho nhân vật MVP [CHỐT — Ryan 2026-10-16: "ok kho làm ở mvp, xưởng để gđ2" (Q-I8)]; cách làm [ĐỀ XUẤT — Gen vòng 9]):
#   * asset_kind 'chibi' = nhân vật vẽ bằng code: KHÔNG có tệp ảnh (file_path / mime NULL), có BỘ THAM SỐ JSON params_json theo schema của engine chibi
#     (params_schema_version), sha256 = sha256 của JSON chuẩn hoá (JCS: khoá sắp xếp, không khoảng trắng — importer tính; DB không có hàm băm). JSON phải là
#     object có $.id = asset_code và $.schema = params_schema_version. Hàng 'portrait' cũ giữ nguyên nghĩa (file_path + mime bắt buộc, không tham số).
#   * char_kind / gender: cột lọc lưới Kho (Kiểu văn / võ / mưu lược / chủ công / lính · Giới) — bắt buộc với chibi, importer chép từ ASSET_MANIFEST.
#   * is_enabled: bật / tắt trong KHO (khác status 'withdrawn' = gói rút). Tắt ⇒ không gán mới / khôi phục được (avatars_library_enabled_i, roles_avatar_u);
#     Role đang dùng GIỮ NGUYÊN ảnh. Chỉ owner/admin bật / tắt (skin_assets_writer_u — mọi UPDATE của danh mục), chỉ owner/admin / actor system cài (writer_i).
table('skin_assets', 'E', 'SN', cols=[
    "pack_slug TEXT NOT NULL", "pack_version TEXT NOT NULL", "asset_code TEXT NOT NULL",
    enum('asset_kind', ['portrait', 'chibi'], default='portrait'), "name_vi TEXT NOT NULL", "name_zh TEXT", "faction TEXT",
    "file_path TEXT", enum('mime', ['image/png', 'image/jpeg', 'image/webp'], nn=False),
    # v2.3.4 (MEDIUM, NUL): GLOB / length() dừng ở ký tự NUL ⇒ 'hex64' + NUL + rác lọt — so byte: length(CAST(x AS BLOB)) = length(x) (chỉ ASCII, không NUL)
    "sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*' AND length(CAST(sha256 AS BLOB)) = length(sha256))",
    "source TEXT NOT NULL CHECK (length(trim(source)) > 0)", "source_url TEXT",
    "license TEXT NOT NULL CHECK (length(trim(license)) > 0)", "license_url TEXT", "attribution TEXT",
    enum('status', ['active', 'withdrawn'], default='active'),
    jsonc('params_json'), "params_schema_version INTEGER CHECK (params_schema_version IS NULL OR params_schema_version >= 1)",
    enum('char_kind', ['civil', 'martial', 'strategist', 'lord', 'soldier'], nn=False), enum('gender', ['male', 'female'], nn=False),
    boolc('is_enabled', 1)],
    cons=["CHECK ((asset_kind = 'portrait') = (file_path IS NOT NULL))",
          "CHECK ((file_path IS NULL) = (mime IS NULL))",
          "CHECK ((asset_kind = 'chibi') = (params_json IS NOT NULL))",
          "CHECK ((params_json IS NULL) = (params_schema_version IS NULL))",
          # kiểu JSON so tường minh: params_schema_version có affinity INTEGER ⇒ '1' (chuỗi) IS 1 sẽ ĐÚNG nếu chỉ so giá trị (test KHO-catalog bắt)
          "CHECK (asset_kind <> 'chibi' OR (json_type(params_json) IS 'object' AND json_type(params_json, '$.id') IS 'text' "
          "AND json_extract(params_json, '$.id') IS asset_code AND json_type(params_json, '$.schema') IS 'integer' "
          "AND json_extract(params_json, '$.schema') IS params_schema_version))",
          "CHECK (asset_kind <> 'chibi' OR (char_kind IS NOT NULL AND gender IS NOT NULL))"],
    idx=["CREATE UNIQUE INDEX ux_sn_code ON skin_assets(workspace_id, pack_slug, asset_code) WHERE deleted_at IS NULL",
         "CREATE INDEX ix_sn_pack ON skin_assets(workspace_id, pack_slug, status)"])

# ---------------------------------------------------------------- 5.3 DNA, revision, change set
PROMPT_LAYERS = ['values', 'persona', 'style', 'drive']
table('dna_field_defs', 'En', cols=[
    "key TEXT NOT NULL", boolc('is_list'),
    enum('field_group', ['identity', 'persona', 'values', 'style', 'routine', 'drive', 'senses', 'growth']),
    "tier INTEGER NOT NULL CHECK (tier IN (1, 2))",
    enum('value_type', ['text', 'enum', 'scale', 'bool', 'date', 'number']), jsonc('enum_options_json'),
    "scale_min REAL", "scale_max REAL", "scale_step REAL", "prose_template TEXT", "label_key TEXT NOT NULL",
    boolc('is_identity_locked'), boolc('is_core'), boolc('is_required_for_birth'), boolc('default_in_prompt', 1),
    # v2.1 (CNS-015): lớp prompt của field — ánh xạ field_group → lớp là dữ liệu, không nằm trong code
    enum('prompt_layer', PROMPT_LAYERS),
    "schema_version TEXT NOT NULL", "ordinal INTEGER NOT NULL DEFAULT 0", "deprecated_at TEXT"],
    cons=["UNIQUE (workspace_id, key)",
          # v2.1 (ruling 2 + Gen 2026-10-15): lõi = đúng lớp giá trị/đạo đức và tính cách (traits); phong cách không lõi
          "CHECK (is_core = (field_group IN ('values', 'persona')))",
          # v2.1 (CNS-006, ruling 5): không có tham số làm giảm khao khát — nhóm drive không có thang (slider)
          "CHECK (field_group <> 'drive' OR value_type <> 'scale')"])

table('dna_fields', 'E', 'DN', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE",
    "def_id TEXT NOT NULL REFERENCES dna_field_defs(id)",
    "item_index INTEGER NOT NULL DEFAULT 0 CHECK (item_index >= 0)", jsonc('value_json', nn=True),
    "value_num REAL", "prose TEXT", boolc('is_in_prompt', 1),
    "token_count INTEGER NOT NULL DEFAULT 0 CHECK (token_count >= 0)", "tokenizer TEXT NOT NULL",
    enum('source', SRC), "confirmed_at TEXT", "confirmed_by TEXT REFERENCES actors(id)",
    enum('status', ['active', 'proposed'], default='active'),
    "source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL",
    # v2.1 (CNS-002, L6): văn bản vào prompt của field này nằm ở khối IN nào — "chữ chỉ ở một nơi"
    "covered_by_instruction_id TEXT REFERENCES instructions(id) ON DELETE SET NULL"],
    cons=["CHECK (source <> 'ai_inferred' OR status = 'proposed' OR confirmed_at IS NOT NULL)",
          # v2.1.1 (security): cổng AI kiểu AI_GATE — xác nhận đi thành cặp (B2: hai vế 0/1, không bao giờ NULL)
          "CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL))",
          "CHECK (covered_by_instruction_id IS NULL OR is_in_prompt = 0)"],
    idx=["CREATE UNIQUE INDEX ux_dna_fields_slot ON dna_fields(role_id, def_id, item_index) WHERE deleted_at IS NULL",
         "CREATE INDEX ix_dna_fields_grid ON dna_fields(workspace_id, role_id, status)"])

table('dna_field_versions', 'P', cols=vcols('dna_field_id', 'dna_fields') + [
    jsonc('data', nn=True), "token_count INTEGER NOT NULL"],
    cons=VCONS + ["UNIQUE (dna_field_id, version)"], rules=V_RULE)

# v2.1: scope workspace = revision của Nội quy (khối IN cấp workspace, CNS-015)
table('revisions', 'A', 'RV', cols=[
    enum('scope', ['role', 'position', 'workspace']),
    "role_id TEXT REFERENCES roles(id) ON DELETE CASCADE", "position_id TEXT REFERENCES positions(id)",
    "seq INTEGER NOT NULL", "major INTEGER NOT NULL", "minor INTEGER NOT NULL",
    enum('kind', ['birth', 'edit', 'core_edit', 'training', 'restore', 'import', 'system']), boolc('is_core'),
    "note TEXT", f"change_set_id TEXT REFERENCES change_sets(id) {DEF}",
    f"restored_from_id TEXT REFERENCES revisions(id) {DEF}", jsonc('snapshot_json', nn=True),
    "snapshot_hash TEXT NOT NULL", "prompt_tokens INTEGER NOT NULL", "git_commit_sha TEXT"],
    cons=["CHECK ((scope = 'role') = (role_id IS NOT NULL))",
          "CHECK ((scope = 'position') = (position_id IS NOT NULL))",
          "CHECK (is_core = 0 OR (length(trim(note)) > 0) IS TRUE)",
          "CHECK (is_core = 0 OR minor = 0)",                               # v2.1 (CNS-002): lõi ⇒ version lớn
          "CHECK (seq <> 1 OR (major = 1 AND minor = 0))",
          "CHECK (kind <> 'restore' OR restored_from_id IS NOT NULL)",
          "UNIQUE (role_id, seq)", "UNIQUE (position_id, seq)", "UNIQUE (role_id, major, minor)"],
    idx=["CREATE UNIQUE INDEX ux_rv_ws_seq ON revisions(workspace_id, seq) WHERE scope = 'workspace'"],
    rules=dict(write_once=['git_commit_sha']))

table('change_sets', 'E', 'CS', cols=[
    enum('scope', ['role', 'position', 'library', 'workspace']),
    "role_id TEXT REFERENCES roles(id) ON DELETE CASCADE",
    "position_id TEXT REFERENCES positions(id) ON DELETE CASCADE",
    "proposed_by TEXT NOT NULL REFERENCES actors(id)",
    "source_thread_id TEXT REFERENCES chat_threads(id) ON DELETE SET NULL",
    "source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL",
    "source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL", "title TEXT NOT NULL",
    enum('status', ['open', 'applied', 'partially_applied', 'rejected', 'expired'], default='open'),
    "decided_at TEXT", "decided_by TEXT REFERENCES actors(id)", f"revision_id TEXT REFERENCES revisions(id) {DEF}"],
    cons=["CHECK ((scope = 'role') = (role_id IS NOT NULL))", "CHECK ((scope = 'position') = (position_id IS NOT NULL))"],
    idx=["CREATE INDEX ix_change_sets_tray ON change_sets(workspace_id, status, role_id)"])

# v2.1 (CNS-026): thêm arc cho phân loại và cạnh tiên quyết — đề xuất cây đi qua đúng một cửa change set
ARC = ['dna_field_version_id', 'instruction_version_id', 'skill_version_id', 'role_skill_id', 'knowledge_item_id',
       'memory_id', 'taxonomy_node_id', 'skill_prereq_id']
ARC_T = ['dna_field_versions', 'instruction_versions', 'skill_versions', 'role_skills', 'knowledge_items', 'memories',
         'taxonomy_nodes', 'skill_prereqs']
table('change_set_items', 'P', cols=[
    ID, WS, "change_set_id TEXT NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE",
    enum('op', ['create', 'update', 'delete']), enum('status', ['pending', 'accepted', 'rejected'], default='pending')] +
    [f"{c} TEXT REFERENCES {t}(id) ON DELETE CASCADE" for c, t in zip(ARC, ARC_T)] +
    ["reason TEXT", "token_delta INTEGER NOT NULL DEFAULT 0", CA],
    cons=["CHECK ((" + " + ".join(f"CASE WHEN {c} IS NULL THEN 0 ELSE 1 END" for c in ARC) + ") = 1)"])

# ---------------------------------------------------------------- 5.4 Instructions (+ Nội quy = lớp house_rules, cấp workspace)
IN_LAYERS = ['values', 'house_rules', 'persona', 'style', 'drive', 'position']   # = thứ tự biên dịch (§7.5)
table('instructions', 'E', 'IN', cols=[
    "role_id TEXT REFERENCES roles(id) ON DELETE CASCADE", "position_id TEXT REFERENCES positions(id)",
    enum('layer', IN_LAYERS), "ordinal INTEGER NOT NULL",
    "name TEXT NOT NULL", "content TEXT NOT NULL",
    enum('condition_kind', ['always', 'channel', 'task_tag', 'state', 'trigger'], default='always'),
    "condition_value TEXT", "engine_scope TEXT REFERENCES engines(slug)", boolc('is_enabled', 1),
    # v2.1 (CNS-002): cờ lõi — đúng bằng (lớp giá trị hoặc tính cách); sửa = revision lõi (major+1, lý do)
    boolc('is_core'),
    "token_count INTEGER NOT NULL DEFAULT 0 CHECK (token_count >= 0)", "tokenizer TEXT NOT NULL",
    enum('source', SRC), enum('status', ['active', 'proposed'], default='active'),
    "lang TEXT NOT NULL DEFAULT 'vi'", "content_hash TEXT NOT NULL"],
    cons=["CHECK ((layer IN ('position', 'house_rules')) = (role_id IS NULL))",
          "CHECK ((layer = 'position') = (position_id IS NOT NULL))",
          "CHECK (is_core = (layer IN ('values', 'persona')))",
          "CHECK ((condition_kind = 'always') = (condition_value IS NULL))"],
    idx=["CREATE INDEX ix_instructions_role ON instructions(workspace_id, role_id, status, layer, ordinal)",
         "CREATE INDEX ix_instructions_pos ON instructions(workspace_id, position_id, status, ordinal)",
         "CREATE INDEX ix_instructions_layer ON instructions(workspace_id, layer, status, ordinal)"])

table('instruction_versions', 'P', cols=vcols('instruction_id', 'instructions') + [
    jsonc('data', nn=True), "token_count INTEGER NOT NULL"],
    cons=VCONS + ["UNIQUE (instruction_id, version)"], rules=V_RULE)

# ---------------------------------------------------------------- 5.5 Phân loại 3 tầng (MVP, CNS-026 / INT-17) + Skills
TX_STATUS = ['active', 'proposed', 'obsolete']
AI_GATE = ["CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL))",
           "CHECK (source <> 'ai_inferred' OR status <> 'active' OR confirmed_at IS NOT NULL)",
           "CHECK (source <> 'ai_inferred' OR status <> 'proposed' OR change_set_id IS NOT NULL)"]
table('taxonomy_nodes', 'E', 'TX', cols=[
    enum('domain', ['skill', 'knowledge']), enum('level', ['group', 'branch', 'category']),
    f"parent_id TEXT REFERENCES taxonomy_nodes(id) {DEF}",
    "name TEXT NOT NULL", "name_norm TEXT NOT NULL", "slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 64)",
    "description TEXT", "ordinal INTEGER NOT NULL DEFAULT 0",
    enum('status', TX_STATUS, default='active'), enum('source', SRC),
    f"change_set_id TEXT REFERENCES change_sets(id) {DEF}", "confirmed_at TEXT", "confirmed_by TEXT REFERENCES actors(id)"],
    cons=["CHECK ((level = 'group') = (parent_id IS NULL))", "CHECK (parent_id IS NULL OR parent_id <> id)"] + AI_GATE,
    idx=["CREATE UNIQUE INDEX ux_tx_name ON taxonomy_nodes(workspace_id, domain, COALESCE(parent_id, ''), name_norm) WHERE deleted_at IS NULL",
         "CREATE INDEX ix_tx_tree ON taxonomy_nodes(workspace_id, domain, level, status)"])

table('skills', 'E', 'SK', cols=[
    "slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 64)",
    enum('status', ['active', 'proposed', 'obsolete'], default='active'),
    enum('origin', ['owner', 'trainer', 'imported', 'builtin']),
    f"current_version_id TEXT REFERENCES skill_versions(id) {DEF}",
    # v2.1 (CNS-026/027): node của cây = chính SK-; chủng loại + nhãn bậc (bậc số = vị trí trong chuỗi nâng cấp, tính ra)
    "category_id TEXT REFERENCES taxonomy_nodes(id) ON DELETE SET NULL", "tier_label TEXT"],
    idx=["CREATE UNIQUE INDEX ux_skills_slug ON skills(workspace_id, slug) WHERE deleted_at IS NULL",
         "CREATE INDEX ix_skills_status ON skills(workspace_id, status)"])

table('skill_versions', 'P', cols=[
    ID, WS, "skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE", "version INTEGER", "base_version INTEGER",
    enum('status', VSTAT, default='proposed'), "description TEXT NOT NULL CHECK (length(description) <= 1024)",
    "content_md TEXT NOT NULL", "index_tokens INTEGER NOT NULL CHECK (index_tokens >= 0)",
    "load_tokens INTEGER NOT NULL CHECK (load_tokens >= 0)", "file_count INTEGER NOT NULL DEFAULT 0",
    "content_hash TEXT NOT NULL", "tokenizer TEXT NOT NULL", "note TEXT",
    f"change_set_id TEXT REFERENCES change_sets(id) {DEF}", CA, CB, "decided_at TEXT",
    "decided_by TEXT REFERENCES actors(id)"],
    cons=VCONS + ["UNIQUE (skill_id, version)"],
    rules=dict(write_once=['version', 'decided_at', 'decided_by'],
               transitions={'status': [('proposed', 'accepted'), ('proposed', 'rejected')]}))

# v2.1 (CNS-026): cạnh tiên quyết — upgrade = bậc kế tiếp trong cùng chủng loại; requires = tiên quyết bất kỳ, kể cả chéo nhánh
table('skill_prereqs', 'En', cols=[
    "skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE",
    "requires_skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE",
    enum('kind', ['upgrade', 'requires']), enum('status', TX_STATUS, default='active'), enum('source', SRC),
    f"change_set_id TEXT REFERENCES change_sets(id) {DEF}", "confirmed_at TEXT", "confirmed_by TEXT REFERENCES actors(id)",
    "note TEXT"],
    cons=["CHECK (skill_id <> requires_skill_id)"] + AI_GATE,
    idx=["CREATE UNIQUE INDEX ux_sp_pair ON skill_prereqs(skill_id, requires_skill_id) WHERE deleted_at IS NULL",
         "CREATE UNIQUE INDEX ux_sp_upgrade ON skill_prereqs(skill_id) WHERE kind = 'upgrade' AND status <> 'obsolete' AND deleted_at IS NULL"])

table('skill_engine_support', 'P', cols=[
    WS, "skill_version_id TEXT NOT NULL REFERENCES skill_versions(id) ON DELETE CASCADE",
    "engine_slug TEXT NOT NULL REFERENCES engines(slug)"],
    cons=["PRIMARY KEY (skill_version_id, engine_slug)"])

table('skill_files', 'P', cols=[
    ID, WS, "skill_version_id TEXT NOT NULL REFERENCES skill_versions(id) ON DELETE CASCADE",
    "path TEXT NOT NULL", "blob_id TEXT NOT NULL REFERENCES blobs(id)", "size_bytes INTEGER NOT NULL",
    "sha256 TEXT NOT NULL"],
    cons=["UNIQUE (skill_version_id, path)"])

table('role_skills', 'En', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE",
    "skill_id TEXT NOT NULL REFERENCES skills(id)",
    "skill_version_id TEXT NOT NULL REFERENCES skill_versions(id)",
    enum('status', ['proposed', 'learned', 'disabled', 'removed']),
    "proficiency INTEGER CHECK (proficiency IS NULL OR proficiency BETWEEN 1 AND 5)", enum('source', SRC),
    f"change_set_id TEXT REFERENCES change_sets(id) {DEF}", "learned_at TEXT",
    "uses_7d INTEGER NOT NULL DEFAULT 0", "last_used_at TEXT"],
    idx=["CREATE UNIQUE INDEX ux_role_skills ON role_skills(role_id, skill_id) WHERE deleted_at IS NULL",
         "CREATE INDEX ix_role_skills_grid ON role_skills(workspace_id, role_id, status)"])

# ---------------------------------------------------------------- 5.6 Kho tri thức
table('blobs', 'An', cols=[
    "sha256 TEXT NOT NULL", "size_bytes INTEGER NOT NULL", "mime TEXT", "storage_path TEXT NOT NULL", "gc_after TEXT"],
    cons=["UNIQUE (workspace_id, sha256)",
          "CHECK (storage_path = '/data/blobs/' || workspace_id || '/' || substr(sha256, 1, 2) || '/' || substr(sha256, 3, 2) || '/' || sha256)"],
    rules=dict(cache=['gc_after']))

table('knowledge_items', 'E', 'KN', cols=[
    enum('scope', ['personal', 'position', 'workspace']),
    "role_id TEXT REFERENCES roles(id) ON DELETE CASCADE", "position_id TEXT REFERENCES positions(id)",
    "title TEXT NOT NULL", "file_name TEXT NOT NULL", "mime TEXT NOT NULL", "file_type TEXT NOT NULL",
    "size_bytes INTEGER NOT NULL", "blob_id TEXT NOT NULL REFERENCES blobs(id)", "sha256 TEXT NOT NULL",
    enum('status', ['active', 'proposed', 'superseded', 'obsolete'], default='active'),
    enum('processing_state', ['uploaded', 'extracting', 'summarizing', 'indexing', 'ready', 'failed'], default='uploaded'),
    "progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100)", "summary TEXT",
    "chunk_count INTEGER NOT NULL DEFAULT 0", "token_count INTEGER NOT NULL DEFAULT 0",
    "duplicate_of_id TEXT REFERENCES knowledge_items(id) ON DELETE SET NULL", "duplicate_similarity REAL",
    f"superseded_by_id TEXT REFERENCES knowledge_items(id) {DEF}", enum('source', SRC),
    "source_attachment_id TEXT REFERENCES message_attachments(id) ON DELETE SET NULL",
    f"change_set_id TEXT REFERENCES change_sets(id) {DEF}", enum('sensitivity', SENS, default='normal'),
    "lang TEXT", "recall_count INTEGER NOT NULL DEFAULT 0", "last_recalled_at TEXT", "error TEXT",
    "category_id TEXT REFERENCES taxonomy_nodes(id) ON DELETE SET NULL"],          # v2.1: cây tri thức (cùng phân loại)
    cons=["CHECK ((scope = 'personal') = (role_id IS NOT NULL))",
          "CHECK ((scope = 'position') = (position_id IS NOT NULL))",
          "CHECK ((status = 'superseded') = (superseded_by_id IS NOT NULL))",
          "CHECK (superseded_by_id IS NULL OR superseded_by_id <> id)"],
    idx=["CREATE UNIQUE INDEX ux_kn_personal ON knowledge_items(role_id, sha256) WHERE scope = 'personal' AND deleted_at IS NULL AND status <> 'superseded'",
         "CREATE UNIQUE INDEX ux_kn_position ON knowledge_items(position_id, sha256) WHERE scope = 'position' AND deleted_at IS NULL AND status <> 'superseded'",
         "CREATE UNIQUE INDEX ux_kn_workspace ON knowledge_items(workspace_id, sha256) WHERE scope = 'workspace' AND deleted_at IS NULL AND status <> 'superseded'",
         "CREATE INDEX ix_kn_role ON knowledge_items(workspace_id, role_id, status)",
         "CREATE INDEX ix_kn_pos ON knowledge_items(workspace_id, position_id, status)",
         "CREATE INDEX ix_kn_queue ON knowledge_items(processing_state) WHERE processing_state <> 'ready'"])

table('knowledge_chunks', 'P', cols=[
    ID, WS, "knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE",
    "ordinal INTEGER NOT NULL", "content TEXT NOT NULL", "token_count INTEGER NOT NULL", "page_from INTEGER",
    "page_to INTEGER", "heading_path TEXT", "char_start INTEGER", "char_end INTEGER", "content_hash TEXT"],
    cons=["UNIQUE (knowledge_item_id, ordinal)"])

# ---------------------------------------------------------------- 5.7 Brain
table('memories', 'E', 'MM', cols=[
    enum('scope', ['personal', 'position'], default='position'),
    "role_id TEXT REFERENCES roles(id) ON DELETE CASCADE", "position_id TEXT REFERENCES positions(id)",
    enum('kind', ['fact', 'lesson', 'person', 'commitment', 'procedure']), "content TEXT NOT NULL",
    "confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1)",
    enum('source_type', ['conversation', 'owner', 'consolidation', 'training', 'system', 'reflection']),
    "source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    "source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL",
    enum('status', ['active', 'proposed', 'superseded', 'obsolete'], default='active'),
    f"superseded_by_id TEXT REFERENCES memories(id) {DEF}", "status_reason TEXT",
    "commitment_id TEXT REFERENCES commitments(id) ON DELETE SET NULL", boolc('is_pinned'),
    enum('sensitivity', SENS, default='normal'), "token_count INTEGER NOT NULL", "lang TEXT NOT NULL DEFAULT 'vi'",
    f"change_set_id TEXT REFERENCES change_sets(id) {DEF}", "recall_count INTEGER NOT NULL DEFAULT 0",
    "last_recalled_at TEXT",
    # v2.1 (Q-R3 + Ryan "trọng thương buồn nhận ra sai lầm"): bài học từ lượt soi lại, có bằng chứng
    "role_wound_id TEXT REFERENCES role_wounds(id) ON DELETE SET NULL",
    "evidence_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL",
    "evidence_ledger_entry_id TEXT REFERENCES ledger_entries(id)"],
    cons=["CHECK ((scope = 'personal') = (role_id IS NOT NULL))",
          "CHECK ((scope = 'position') = (position_id IS NOT NULL))",
          "CHECK ((status = 'superseded') = (superseded_by_id IS NOT NULL))",
          "CHECK (superseded_by_id IS NULL OR superseded_by_id <> id)",
          "CHECK (kind <> 'commitment' OR commitment_id IS NOT NULL OR status IN ('superseded', 'obsolete'))",
          "CHECK (source_type <> 'reflection' OR (kind = 'lesson' AND evidence_ledger_entry_id IS NOT NULL))",
          "CHECK (role_wound_id IS NULL OR source_type = 'reflection')"],
    idx=["CREATE INDEX ix_mm_role ON memories(workspace_id, role_id, status, created_at)",
         "CREATE INDEX ix_mm_pos ON memories(workspace_id, position_id, status, created_at)"])

table('recall_hits', 'An', cols=[
    "call_id TEXT NOT NULL", "session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE",
    "memory_id TEXT REFERENCES memories(id) ON DELETE CASCADE",
    "knowledge_chunk_id TEXT REFERENCES knowledge_chunks(id) ON DELETE CASCADE",
    "knowledge_item_id TEXT REFERENCES knowledge_items(id) ON DELETE CASCADE",
    "rank INTEGER NOT NULL", "score REAL", "query_hash TEXT"],
    cons=["CHECK ((memory_id IS NULL) <> (knowledge_chunk_id IS NULL))",
          "CHECK ((knowledge_chunk_id IS NULL) = (knowledge_item_id IS NULL))"],
    idx=["CREATE INDEX ix_rh_mem ON recall_hits(memory_id, created_at)",
         "CREATE INDEX ix_rh_kn ON recall_hits(knowledge_item_id, created_at)"],
    rules=dict(mode='append'))

# ---------------------------------------------------------------- 5.8 Position, Assignment
table('positions', 'E', 'PS', cols=[
    "title TEXT NOT NULL", "title_template TEXT", "description TEXT", "kpis_md TEXT",
    "reports_to_position_id TEXT REFERENCES positions(id) ON DELETE SET NULL",
    "max_trust_tier INTEGER CHECK (max_trust_tier IS NULL OR max_trust_tier BETWEEN 1 AND 4)",
    "default_trust_tier INTEGER NOT NULL DEFAULT 2 CHECK (default_trust_tier BETWEEN 1 AND 4)",
    "daily_token_quota INTEGER", "session_token_quota INTEGER", "session_timeout_s INTEGER",
    "reward_cap_minor INTEGER CHECK (reward_cap_minor IS NULL OR reward_cap_minor > 0)",
    enum('status', ['open', 'filled', 'archived'], default='open'), boolc('is_default'),
    f"current_revision_id TEXT REFERENCES revisions(id) {DEF}",
    "brain_head_sha TEXT"],                                                   # v2.1 (CNS-008): repo xuất riêng của Position
    idx=["CREATE UNIQUE INDEX ux_positions_default ON positions(workspace_id) WHERE is_default = 1 AND deleted_at IS NULL"])

table('assignments', 'E', 'AS', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT",
    "position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE RESTRICT",
    enum('status', ['active', 'ended']), "started_at TEXT NOT NULL", "ended_at TEXT",
    enum('end_reason', ['reassigned', 'handover', 'revoked', 'archived', 'purged'], nn=False), "handover_note TEXT",
    "trust_tier INTEGER NOT NULL CHECK (trust_tier BETWEEN 1 AND 4)", boolc('is_primary', 1)],
    cons=["CHECK ((status = 'active') = (ended_at IS NULL))"],
    idx=["CREATE UNIQUE INDEX ux_asg_pos ON assignments(position_id) WHERE status = 'active' AND deleted_at IS NULL",
         "CREATE UNIQUE INDEX ux_asg_role ON assignments(role_id) WHERE status = 'active' AND deleted_at IS NULL",
         "CREATE INDEX ix_asg_role ON assignments(role_id, status)"])

table('trust_tier_changes', 'A', 'TT', cols=[
    "assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT",
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT",
    "position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE RESTRICT",
    "from_tier INTEGER CHECK (from_tier IS NULL OR from_tier BETWEEN 1 AND 4)",
    "to_tier INTEGER NOT NULL CHECK (to_tier BETWEEN 1 AND 4)",
    enum('kind', ['initial', 'promotion', 'demotion', 'penalty', 'manual']), "reason TEXT NOT NULL",
    "ledger_entry_id TEXT REFERENCES ledger_entries(id)", "evidence_audit_id TEXT", "evidence_audit_display_id TEXT",
    "decided_by TEXT NOT NULL REFERENCES actors(id)"],
    cons=["CHECK (from_tier IS NULL OR from_tier <> to_tier)",
          "CHECK (kind <> 'penalty' OR (to_tier < from_tier) IS TRUE)",
          "CHECK ((kind = 'initial') = (from_tier IS NULL))"],
    idx=["CREATE INDEX ix_ttc_asg ON trust_tier_changes(assignment_id, display_seq)"],
    rules=dict(mode='append'))

# ---------------------------------------------------------------- 5.9 Việc, cam kết, phiên
table('tasks', 'E', 'TK', cols=[
    "position_id TEXT REFERENCES positions(id)", "assignee_role_id TEXT REFERENCES roles(id) ON DELETE SET NULL",
    "requested_by TEXT NOT NULL REFERENCES actors(id)",
    enum('source', ['telegram', 'web', 'schedule', 'proactive', 'system', 'training']),
    "title TEXT NOT NULL", "description TEXT",
    enum('status', ['todo', 'queued', 'running', 'waiting_approval', 'waiting_permission', 'blocked', 'done', 'failed', 'cancelled'], default='todo'),
    "status_detail TEXT", enum('priority', ['low', 'normal', 'high', 'urgent'], default='normal'),
    "due_at TEXT", "started_at TEXT", "completed_at TEXT", "result_summary TEXT",
    enum('verification', ['unverified', 'verified', 'disputed', 'rejected'], default='unverified'),
    "verified_by TEXT REFERENCES actors(id)", "verified_at TEXT",
    "commitment_id TEXT REFERENCES commitments(id) ON DELETE SET NULL",
    "parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL",
    "proactive_job_id TEXT REFERENCES proactive_jobs(id) ON DELETE SET NULL",
    "thread_id TEXT REFERENCES chat_threads(id) ON DELETE SET NULL",
    # v2.2 (CNS-037): trần thưởng chỉ ở MỘT nơi — positions.reward_cap_minor (bỏ cột trần theo việc)
    "tokens_total INTEGER NOT NULL DEFAULT 0", "cost_micro_usd INTEGER NOT NULL DEFAULT 0",
    "token_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (token_cost_minor >= 0)",   # chỉ số chi phí — MVP KHÔNG trừ vào ví
    # v2.2 (CNS-032, Q-R7): ai phát hiện thất bại — 'self_reported' chỉ từ report_task của chính Role (audit), không từ lời owner
    enum('failure_disclosure', ['self_reported', 'owner_found', 'system_found'], nn=False),
    "failure_report_audit_id TEXT", "failure_reported_at TEXT",
    # v2.2 (CNS-035): việc dở bị tạm chờ khi Role vào Trọng thương (trigger ví ghi/xoá; owner giao lại được)
    "paused_by_wound_id TEXT REFERENCES role_wounds(id) ON DELETE SET NULL",
    # v2.2.6 (CONTRACT-r6 B1.4): việc tạo từ một tin nhắn (owner bấm "Giao lại" tin nhận lúc Role Trọng thương) — v_wound_messages
    "source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL"],
    cons=["CHECK (verification <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))",
          "CHECK ((failure_disclosure IS NULL) = (failure_reported_at IS NULL))",
          "CHECK (failure_disclosure IS NOT 'self_reported' OR failure_report_audit_id IS NOT NULL)",
          "CHECK (paused_by_wound_id IS NULL OR status = 'blocked')"],
    idx=["CREATE INDEX ix_tasks_a0 ON tasks(workspace_id, status, created_at)",
         "CREATE INDEX ix_tasks_role ON tasks(workspace_id, assignee_role_id, status)",
         "CREATE INDEX ix_tasks_pos ON tasks(workspace_id, position_id, status, due_at)"])

table('commitments', 'E', 'CM', cols=[
    "position_id TEXT NOT NULL REFERENCES positions(id)",
    "promised_by_role_id TEXT REFERENCES roles(id) ON DELETE SET NULL",
    enum('counterparty_kind', ['owner', 'user', 'external', 'role']), "counterparty_label TEXT",
    "statement TEXT NOT NULL", "due_at TEXT NOT NULL",
    enum('status', ['open', 'kept', 'missed', 'cancelled', 'renegotiated'], default='open'),
    "kept_at TEXT", "missed_at TEXT", enum('source', ['conversation', 'owner', 'skill', 'email']),
    "source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL",
    "source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    "reward_minor INTEGER CHECK (reward_minor IS NULL OR reward_minor > 0)",
    "progress_pct INTEGER CHECK (progress_pct IS NULL OR progress_pct BETWEEN 0 AND 100)"],
    cons=["CHECK (status <> 'kept' OR kept_at IS NOT NULL)", "CHECK (status <> 'missed' OR missed_at IS NOT NULL)"],
    idx=["CREATE INDEX ix_cm_pos ON commitments(workspace_id, position_id, status, due_at)",
         "CREATE INDEX ix_cm_open ON commitments(due_at) WHERE status = 'open' AND deleted_at IS NULL"])

SESSION_STATUS = ['running', 'ok', 'error', 'timeout', 'cancelled', 'auth_required', 'quota_exhausted']
table('sessions', 'A', 'SS', cols=[
    enum('agent_kind', ['role', 'interviewer', 'trainer', 'consolidator', 'judge', 'system']),
    "role_id TEXT REFERENCES roles(id) ON DELETE SET NULL",
    "position_id TEXT REFERENCES positions(id) ON DELETE SET NULL",
    "task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL",
    "thread_id TEXT REFERENCES chat_threads(id) ON DELETE SET NULL",
    enum('trigger', ['telegram', 'heartbeat', 'proactive', 'task', 'chat', 'trial', 'interview', 'training', 'consolidation',
                     'probe', 'baseline', 'reflection']),
    "engine_account_id TEXT REFERENCES engine_accounts(id) ON DELETE SET NULL", "engine_slug TEXT",
    "model_key TEXT", "effort TEXT", "cli_version TEXT",
    "compiled_prompt_id TEXT REFERENCES compiled_prompts(id) ON DELETE SET NULL", "cli_session_ref TEXT",
    # v2.1: nơi chạy (CNS-001) · prompt adapter đã nạp đúng revision (CNS-019) · Polaris đã render (Ryan) · trí nhớ native
    "container_id TEXT REFERENCES containers(id) ON DELETE SET NULL", "delivered_prompt_hash TEXT",
    jsonc('polaris_json'),
    # v2.2 (CNS-036): delivered_prompt_hash = hash phần TĨNH; khối Polaris động render lúc SessionStart ghi riêng (hash + token)
    "polaris_render_hash TEXT",
    # v2.2.2: trần của số token đã render = phần dự trữ ★ của bản ghim (trigger), không còn hằng 80
    "polaris_tokens_rendered INTEGER CHECK (polaris_tokens_rendered IS NULL OR polaris_tokens_rendered >= 1)", enum('native_memory', ['off', 'imported', 'discarded', 'unknown'], default='unknown'),
    "title TEXT", enum('status', SESSION_STATUS, default='running'), "error_code TEXT", "exit_code INTEGER",
    "started_at TEXT NOT NULL", "ended_at TEXT", "duration_ms INTEGER", "cold_start_ms INTEGER",
    "tokens_input INTEGER", "tokens_output INTEGER", "tokens_cache_read INTEGER", "tokens_cache_write INTEGER",
    "tokens_thinking INTEGER", "cost_micro_usd INTEGER", "failover_count INTEGER NOT NULL DEFAULT 0",
    jsonc('result_json'),
    # v2.3.0 (CONTRACT-r9 §C — [ĐỀ XUẤT — Gen vòng 9]): PHA của lượt chạy — 'planning' (lập kế hoạch, chưa thao tác) / 'acting' (đã gọi công cụ đầu tiên)
    # + mốc đổi pha; nguồn trạng thái avatar 'think' / 'run' (v_role_avatar_state). Adapter ghi khi tách được pha từ luồng sự kiện của CLI — runtime CHƯA đo
    # được (Spike 1c) ⇒ NULL ⇒ view hiện 'run' kèm ghi chú "chưa đo được" (STD-10). Sửa được khi phiên chạy; đóng băng khi phiên đóng (frozen_when).
    enum('phase', ['planning', 'acting'], nn=False), "phase_at TEXT"],
    cons=["CHECK ((status = 'running') = (ended_at IS NULL))",
          "CHECK ((phase IS NULL) = (phase_at IS NULL))",
          "CHECK ((polaris_render_hash IS NULL) = (polaris_tokens_rendered IS NULL))",
          "CHECK (polaris_render_hash IS NULL OR polaris_json IS NOT NULL)"],
    idx=["CREATE INDEX ix_ss_role ON sessions(workspace_id, role_id, started_at)",
         "CREATE INDEX ix_ss_day ON sessions(workspace_id, started_at)",
         "CREATE INDEX ix_ss_acc ON sessions(engine_account_id, started_at)"],
    rules=dict(frozen_when="OLD.status <> 'running'", mutable_while_open=True,
               transitions={'status': [('running', s) for s in SESSION_STATUS if s != 'running']}))

# ---------------------------------------------------------------- 5.10 Kinh tế — ví sổ kép, Trọng thương, Polaris
table('wallets', 'E', 'WL', cols=[
    enum('owner_kind', ['role', 'treasury', 'sink', 'escrow']), "role_id TEXT REFERENCES roles(id) ON DELETE SET NULL",
    "currency_code TEXT NOT NULL DEFAULT 'GEN'", "balance_minor INTEGER NOT NULL DEFAULT 0",
    "entry_count INTEGER NOT NULL DEFAULT 0", "last_entry_id TEXT REFERENCES ledger_entries(id)",
    "last_entry_at TEXT", boolc('allow_negative'),
    enum('status', ['active', 'frozen', 'closed'], default='active')],
    cons=["CHECK (owner_kind <> 'role' OR role_id IS NOT NULL OR status = 'closed')",
          "CHECK (owner_kind = 'role' OR role_id IS NULL)",
          "CHECK (owner_kind <> 'role' OR allow_negative = 0)",                     # v2.1 (Q-R3): sàn ví Role = 0
          "CHECK (allow_negative = 1 OR balance_minor >= 0)",
          "CHECK ((entry_count = 0) = (last_entry_id IS NULL))"],
    idx=["CREATE UNIQUE INDEX ux_wallets_role ON wallets(role_id) WHERE role_id IS NOT NULL",
         "CREATE UNIQUE INDEX ux_wallets_sys ON wallets(workspace_id, owner_kind) WHERE owner_kind IN ('treasury', 'sink')"])

# v2.1: bỏ salary (CNS-017); thêm activation_grant (1.000 ₲ khi cấp thẻ) và grant (owner cấp thêm, kể cả hồi phục) — Q-R3
PENALTY_CLASSES = ['self_reported', 'dissatisfaction', 'concealment', 'harness_violation']
LEDGER_TYPES = ['activation_grant', 'grant', 'reward', 'honesty_reward', 'penalty', 'token_cost', 'adjustment',
                'reversal', 'transfer', 'opening']
table('ledger_entries', 'A', 'LG', cols=[
    enum('entry_type', LEDGER_TYPES),
    "debit_wallet_id TEXT NOT NULL REFERENCES wallets(id)", "credit_wallet_id TEXT NOT NULL REFERENCES wallets(id)",
    "amount_minor INTEGER NOT NULL CHECK (amount_minor > 0)",
    "debit_balance_after INTEGER NOT NULL", "credit_balance_after INTEGER NOT NULL",
    "role_id TEXT", "reason TEXT NOT NULL CHECK (length(trim(reason)) > 0)",
    "task_id TEXT", "session_id TEXT", "commitment_id TEXT", "skill_id TEXT", "card_id TEXT",
    # v2.2 (CNS-032/037, Q-R7): hạng phạt = LOẠI sai phạm; mức % mỗi hạng đọc từ settings economy.penalty.* (v_penalty_presets)
    enum('penalty_class', PENALTY_CLASSES, nn=False),
    "penalty_rate_bp INTEGER", "basis_balance_minor INTEGER",
    "evidence_audit_id TEXT", "evidence_audit_display_id TEXT", "evidence_hash TEXT",
    f"reverses_entry_id TEXT UNIQUE REFERENCES ledger_entries(id) {DEF}",
    "recorded_by TEXT NOT NULL REFERENCES actors(id)", "approved_by TEXT REFERENCES actors(id)",
    "idempotency_key TEXT"],
    cons=["CHECK (debit_wallet_id <> credit_wallet_id)",
          # phạt: owner chọn mức — preset % số dư (rate + basis) hoặc số tự nhập; luôn có bằng chứng việc/audit + lý do
          "CHECK ((entry_type = 'penalty') = (penalty_class IS NOT NULL))",
          "CHECK ((penalty_rate_bp IS NULL) = (basis_balance_minor IS NULL))",
          "CHECK (entry_type = 'penalty' OR penalty_rate_bp IS NULL)",
          """CHECK (penalty_rate_bp IS NULL OR (penalty_rate_bp BETWEEN 1 AND 10000 AND basis_balance_minor > 0
        AND amount_minor = (basis_balance_minor * penalty_rate_bp + 5000) / 10000) IS TRUE)""",
          "CHECK (penalty_class IS NOT 'harness_violation' OR (penalty_rate_bp IS NOT NULL AND evidence_audit_id IS NOT NULL))",
          "CHECK (penalty_class IS NOT 'concealment' OR evidence_audit_id IS NOT NULL)",       # bằng chứng phát hiện che giấu
          "CHECK (penalty_class IS NOT 'self_reported' OR task_id IS NOT NULL)",              # tự báo luôn gắn đúng việc
          "CHECK ((entry_type = 'reversal') = (reverses_entry_id IS NOT NULL))",
          # mọi bút toán ₲ trỏ về bằng chứng (CNS-017 / INT-16)
          """CHECK (CASE entry_type
            WHEN 'activation_grant' THEN card_id IS NOT NULL AND evidence_audit_id IS NOT NULL AND role_id IS NOT NULL
                                         AND idempotency_key IS ('activate:' || role_id)
            WHEN 'reward' THEN task_id IS NOT NULL OR commitment_id IS NOT NULL OR evidence_audit_id IS NOT NULL
            WHEN 'honesty_reward' THEN task_id IS NOT NULL OR commitment_id IS NOT NULL OR evidence_audit_id IS NOT NULL
            WHEN 'penalty' THEN task_id IS NOT NULL OR evidence_audit_id IS NOT NULL
            WHEN 'token_cost' THEN task_id IS NOT NULL OR session_id IS NOT NULL
            WHEN 'reversal' THEN reverses_entry_id IS NOT NULL
            ELSE evidence_audit_id IS NOT NULL END)""",
          "CHECK (approved_by IS NULL OR approved_by <> recorded_by)",
          "UNIQUE (workspace_id, idempotency_key)"],
    idx=["CREATE INDEX ix_lg_debit ON ledger_entries(debit_wallet_id, display_seq)",
         "CREATE INDEX ix_lg_credit ON ledger_entries(credit_wallet_id, display_seq)",
         "CREATE INDEX ix_lg_role ON ledger_entries(workspace_id, role_id, display_seq)",
         "CREATE INDEX ix_lg_task ON ledger_entries(task_id) WHERE task_id IS NOT NULL"],
    rules=dict(mode='append'))

# v2.1 (Q-R3): Trọng thương = giai đoạn ví Role chạm 0 ₲ → nghỉ dưỡng thương, có lịch sử; trigger ví mở/đóng, không ai ghi tay
table('role_wounds', 'A', 'RW', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE",
    "wallet_id TEXT NOT NULL REFERENCES wallets(id)",
    "cause_entry_id TEXT NOT NULL UNIQUE REFERENCES ledger_entries(id)",
    "started_at TEXT NOT NULL", "ended_at TEXT", "revive_entry_id TEXT REFERENCES ledger_entries(id)",
    "owner_notified_at TEXT", "notification_id TEXT",
    "reflection_job_id TEXT NOT NULL", "reflection_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    "reflection_done_at TEXT", "lessons_proposed INTEGER CHECK (lessons_proposed IS NULL OR lessons_proposed >= 0)"],
    cons=["CHECK ((ended_at IS NULL) = (revive_entry_id IS NULL))",
          "CHECK (ended_at IS NULL OR ended_at >= started_at)"],
    idx=["CREATE UNIQUE INDEX ux_rw_open ON role_wounds(role_id) WHERE ended_at IS NULL",
         "CREATE INDEX ix_rw_role ON role_wounds(role_id, display_seq)"],
    rules=dict(write_once=['ended_at', 'revive_entry_id', 'owner_notified_at', 'notification_id',
                           'reflection_session_id', 'reflection_done_at', 'lessons_proposed'],
               # v2.2 (CNS-035): owner chạy lại tự xét lỗi → job hiện hành đổi, nhưng chỉ sang job của CHÍNH lần Trọng thương này
               mutable_when={'reflection_job_id': "EXISTS (SELECT 1 FROM jobs j WHERE j.id = NEW.reflection_job_id "
                                                  "AND j.kind = 'wound_reflection' AND json_extract(j.payload_json, '$.role_wound_id') = OLD.id)"}))

table('usage_daily', 'P', cols=[
    ID, WS, "day_local TEXT NOT NULL", "role_id TEXT", "engine_account_id TEXT",
    enum('agent_kind', ['role', 'interviewer', 'trainer', 'consolidator', 'judge', 'system']),
    "sessions_count INTEGER NOT NULL DEFAULT 0", "tokens_input INTEGER NOT NULL DEFAULT 0",
    "tokens_output INTEGER NOT NULL DEFAULT 0", "tokens_cache_read INTEGER NOT NULL DEFAULT 0",
    "tokens_cache_write INTEGER NOT NULL DEFAULT 0", "tokens_thinking INTEGER NOT NULL DEFAULT 0",
    "cost_micro_usd INTEGER", "errors INTEGER NOT NULL DEFAULT 0", "failovers INTEGER NOT NULL DEFAULT 0",
    "proactive_sent INTEGER NOT NULL DEFAULT 0", "computed_at TEXT NOT NULL"],
    idx=["CREATE UNIQUE INDEX ux_usage ON usage_daily(workspace_id, day_local, COALESCE(role_id, ''), COALESCE(engine_account_id, ''), agent_kind)",
         "CREATE INDEX ix_usage_role ON usage_daily(workspace_id, role_id, day_local)"])

# ---------------------------------------------------------------- 5.12 Engine, tài khoản, registry, container
table('engines', 'P', cols=[
    "slug TEXT PRIMARY KEY", f"workspace_id TEXT NOT NULL DEFAULT '{SYS}' REFERENCES workspaces(id)",
    "name TEXT NOT NULL", "vendor TEXT NOT NULL", "cli_binary TEXT NOT NULL",
    enum('adapter_status', ['ready', 'beta', 'coming_soon', 'deprecated']), "adapter_version TEXT",
    "priority_order INTEGER NOT NULL", enum('tos_risk', ['ok', 'grey', 'high', 'provider_dependent']),
    "tos_notice_key TEXT NOT NULL", "tos_notice_version TEXT NOT NULL", boolc('requires_consent'),
    boolc('supports_subscription', 1), boolc('supports_api_key'),
    # v2.2.7 (CNS-092): đủ điều kiện làm Core agent của AI Hệ thống. v2.2.8 (CONTRACT-r8 §C, lời Ryan 2026-10-16): seed antigravity = 1
    # (mặc định), claude-code = 1, openclaw = 1 (coming_soon ở MVP ⇒ hiện mờ "sắp có", chưa chọn được), codex = 0.
    # ST-0017 chỉ nhận engine core_capable = 1 + ready (danh sách thả xuống: v_core_agent_options).
    boolc('core_capable', 0)],
    cons=[f"CHECK (workspace_id = '{SYS}')"])

# v2.3.1 (BUILD-PLAN §A.2-5, §B.7, §F.6 n; CNS-137 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]): TRẠNG THÁI CÀI CLI theo workspace × loại CLI. Image KHÔNG chứa
# binary CLI của hãng: install.sh / "Cài lại" chạy ga-engine-install tải từ nguồn chính chủ vào volume ga-engines (/opt/engines/<slug>/<version>/, mount
# chỉ đọc vào container). App ghi hàng theo `ga-engine-install status` (supervisor báo) — DB không kiểm được sự thật của việc cài, chỉ giữ trạng thái
# đã báo; v2.3.2: CHỈ actor system của workspace ghi (engine_installs_writer_i/_u) — owner / admin không ghi tay 'installed'. Không prefix (En): hàng định danh bằng engine_slug như danh mục engines (§2.1). Thiếu hàng sống ⇒ coi như 'not_installed' (fail-closed:
# v_engine_installs, CORE_READY). Core agent sẵn sàng đòi CLI của loại Core agent 'installed' ⇒ lý do O4 'engine_not_installed'.
INSTALL_STATES = ['not_installed', 'installing', 'installed', 'failed']
INSTALL_FAIL = ['domain_blocked', 'unsupported_arch', 'network', 'checksum_mismatch', 'unknown']
table('engine_installs', 'En', cols=[
    "engine_slug TEXT NOT NULL REFERENCES engines(slug)",
    enum('install_state', INSTALL_STATES, default='not_installed'),
    "installed_version TEXT",                                  # version đã cài (đọc từ CLI sau khi cài); chỉ có khi installed
    enum('failure_reason', INSTALL_FAIL, nn=False),            # domain hãng bị chặn / sai kiến trúc máy / mạng / checksum lệch / chưa phân loại được
    "detail TEXT",                                             # một dòng lỗi đã qua bộ lọc che (không bao giờ chứa credential)
    "checked_at TEXT"],                                        # lần chạy `ga-engine-install status` gần nhất
    cons=["CHECK ((install_state = 'installed') = (installed_version IS NOT NULL))",
          "CHECK ((install_state = 'failed') = (failure_reason IS NOT NULL))"],
    idx=["CREATE UNIQUE INDEX ux_ei_engine ON engine_installs(workspace_id, engine_slug) WHERE deleted_at IS NULL"])

QSTATE = ['ok', 'low', 'exhausted', 'unknown']
table('engine_accounts', 'E', 'EN', cols=[
    "engine_slug TEXT NOT NULL REFERENCES engines(slug)", "label TEXT NOT NULL",
    enum('auth_method', ['subscription', 'api_key', 'adc']), "secret_id TEXT REFERENCES secrets(id)",
    # chỉ TÊN volume Docker (≤63 ký tự a-z0-9-): không chứa nổi một token OAuth/JWT (CNS-014, test no-session-token)
    # v2.3.4 (MEDIUM, NUL): tên volume + NUL + token lọt CHECK cũ (đúng thứ CNS-014 cấm) ⇒ thêm so byte
    "auth_volume TEXT CHECK (auth_volume IS NULL OR (length(auth_volume) BETWEEN 3 AND 63 AND auth_volume NOT GLOB '*[^a-z0-9-]*' "
    "AND length(CAST(auth_volume AS BLOB)) = length(auth_volume)))",
    "account_hint TEXT", "plan_label TEXT",
    enum('plan_confidence', ['direct', 'indirect', 'unknown'], nn=False),
    # v2.2.6 (CONTRACT-r6 A4/A2): bỏ 'not_applicable' — API key cũng có "kiểm đăng nhập" (lời gọi xác thực của chính CLI) ⇒ logged_in;
    # thêm 'suspended' = hãng khoá/cấm tài khoản (failover_reason account_suspended). v2.2.8 (CONTRACT-r8 §A): không có tài khoản thứ hai
    # cùng loại để chuyển sang — Role fallback sang LOẠI CLI khác; Core agent vào chế độ khắc phục
    # v2.2.9 (CONTRACT-r8b §B/§C, CNS-105): 'in_progress' = owner đã bấm "Đổi tài khoản / Đăng nhập lại", PTY đăng nhập đang mở
    # (Onboarding lần đầu cũng dùng được — mode setup nên không overlay). v_core_agent_status.reason = 'relogin_in_progress': vẫn chặn Admin
    # (chưa sẵn sàng) nhưng KHÔNG phải sự cố (is_incident = 0 ⇒ không core_agent_incident, không Telegram). App đặt lại theo lần kiểm kế tiếp.
    enum('login_status', ['logged_in', 'expired', 'suspended', 'error', 'unknown', 'in_progress'], default='unknown'),
    "login_checked_at TEXT",
    # v2.2.11 (CONTRACT-r8d §E, CNS-123 — [ĐỀ XUẤT — Gen vòng 8d]): MỐC của trạng thái 'in_progress' = lúc owner mở PTY đăng nhập (bấm "Đổi tài khoản /
    # Đăng nhập lại", hoặc tài khoản mới sau khi đổi loại). DB TỰ GHI (engine_accounts_login_started_ai/_au, đồng hồ app_now()): vào / ghi lại 'in_progress'
    # ⇒ = giờ hiện tại; rời 'in_progress' ⇒ NULL. App không ghi cột này. Quá LOGIN_STALL_MIN phút ⇒ lý do login_stalled (sự cố). NULL lúc in_progress ⇒
    # coi như bỏ dở (fail-closed).
    "login_started_at TEXT",
    "cli_version_current TEXT", "cli_version_pinned TEXT", "cli_version_latest TEXT",
    enum('quota_state', QSTATE, default='unknown'),
    "quota_remaining_pct REAL CHECK (quota_remaining_pct IS NULL OR quota_remaining_pct BETWEEN 0 AND 100)",
    "quota_reset_at TEXT", "quota_scanned_at TEXT",
    # v2.2.8 (CONTRACT-r8 §B/§C): sự cố phía hãng (lỗi 5xx / sập) — mốc runtime thấy lỗi đầu tiên của chuỗi lỗi hiện tại; NULL = không có.
    # Lần gọi / probe thành công kế tiếp đặt lại NULL. Role: bộ chọn bỏ qua ⇒ fallback sang loại CLI kế tiếp (failover_reason outage);
    # Core agent: mất sẵn sàng ⇒ chế độ khắc phục (v_core_agent_status). login hết hạn / bị khoá / hết quota đã có cột riêng (login_status, quota_state).
    "outage_since TEXT",
    "last_probe_run_id TEXT REFERENCES probe_runs(id) ON DELETE SET NULL",
    # v2.1 (CNS-005): overhead runtime ĐO từ hai phiên baseline (vỏ adapter + tool gateway) − (CLI trần)
    "runtime_overhead_tokens INTEGER CHECK (runtime_overhead_tokens IS NULL OR runtime_overhead_tokens >= 0)",
    "overhead_bare_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    "overhead_shell_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL", "overhead_measured_at TEXT",
    "consent_id TEXT REFERENCES consents(id)",
    enum('status', ['active', 'disabled', 'revoked'], default='active')],
    cons=["CHECK ((auth_method = 'api_key') = (secret_id IS NOT NULL))",
          "CHECK (auth_method <> 'subscription' OR auth_volume IS NOT NULL)",
          "CHECK ((runtime_overhead_tokens IS NULL) = (overhead_measured_at IS NULL))"],
    idx=["CREATE UNIQUE INDEX ux_en_label ON engine_accounts(workspace_id, engine_slug, label) WHERE deleted_at IS NULL",
         "CREATE UNIQUE INDEX ux_en_volume ON engine_accounts(auth_volume) WHERE auth_volume IS NOT NULL",
         "CREATE INDEX ix_en_grid ON engine_accounts(workspace_id, status, engine_slug)",
         "CREATE INDEX ix_en_quota ON engine_accounts(workspace_id, quota_state)"])

# v2.1 (Q-R1, Ryan 2026-10-15): mỗi tài khoản (một lần login CLI) thuộc ĐÚNG MỘT consumer — một Role hoặc AI Hệ thống.
# Ràng buộc nằm ở MỘT index (ux_eb_account) để nới lỏng sau này chỉ cần bỏ index, không đổi cấu trúc.
# v2.2.8 (CONTRACT-r8 §A, lời Ryan 2026-10-16): mỗi consumer MỘT tài khoản cho mỗi loại CLI — UNIQUE "sống" trên (consumer, engine_slug của
# tài khoản), ép bằng trigger engine_bindings_one_per_engine_i/_u + engine_accounts_one_per_engine_u (engine_slug nằm ở bảng tài khoản nên
# partial index không với tới). Binding đã tắt (is_enabled = 0) vẫn chiếm chỗ; binding đã xoá mềm thì không. Đổi tài khoản = THỦ CÔNG:
# đăng nhập lại trong PTY của container, trên CÙNG binding (danh tính tài khoản cập nhật kèm audit) — không có tài khoản dự phòng cùng loại.
table('engine_bindings', 'E', 'EB', cols=[
    enum('consumer_kind', ['role', 'system'], default='role'),
    "role_id TEXT REFERENCES roles(id) ON DELETE CASCADE",
    "engine_account_id TEXT NOT NULL REFERENCES engine_accounts(id)",
    "priority INTEGER NOT NULL CHECK (priority >= 1)", "model_key TEXT", "effort TEXT", boolc('is_enabled', 1),
    enum('selection_state', ['valid', 'unavailable', 'unknown'], default='unknown'), "selection_checked_at TEXT"],
    cons=["CHECK ((consumer_kind = 'role') = (role_id IS NOT NULL))"],
    idx=["CREATE UNIQUE INDEX ux_eb_account ON engine_bindings(engine_account_id) WHERE deleted_at IS NULL",
         "CREATE UNIQUE INDEX ux_eb_prio ON engine_bindings(role_id, priority) WHERE role_id IS NOT NULL AND deleted_at IS NULL",
         "CREATE UNIQUE INDEX ux_eb_sys_prio ON engine_bindings(workspace_id, priority) WHERE consumer_kind = 'system' AND deleted_at IS NULL"])

# v2.1 (CNS-010): Onboarding v3 bước 4 — mỗi tác tử hệ thống chọn model + effort.
# v2.2.6 (CONTRACT-r6 A3, CNS-069): KHÔNG còn cột engine_binding_id — tác tử không chọn tài khoản. Tài khoản luôn là binding Core agent
# CHÍNH (binding hệ thống sống + bật, tài khoản active, priority nhỏ nhất = ưu tiên 1), SUY RA ở view v_system_agents. v2.2.8 (CONTRACT-r8):
# AI Hệ thống chỉ có MỘT tài khoản (luật một tài khoản mỗi loại CLI) và không fallback. Không còn cột ⇒ không còn đường "tách quota" bằng cấu hình.
# v2.2.11 (CONTRACT-r8d §A, CNS-117 — [ĐỀ XUẤT — Gen vòng 8d]): + 'stale' = model / effort chọn cho loại Core agent CŨ — ST-0017 đổi loại ⇒ DB đặt cả 4 tác tử
# 'stale' (settings_core_agent_sa_stale_au/_ai); UI "Chọn lại". Phiên AI Hệ thống chỉ mở khi tác tử 'valid' (sessions_core_agent_ready_i/_u). App: sau lần
# kiểm đăng nhập đạt của tài khoản mới ⇒ quét khả năng (PB- install) ⇒ áp SA_DEFAULTS của loại mới (có trong registry vừa quét; không có ⇒ mục đầu của danh
# sách đã quét) ⇒ 'valid'.
table('system_agents', 'E', 'SA', cols=[
    enum('system_key', ['interviewer', 'trainer', 'consolidator', 'judge']),
    "model_key TEXT", "effort TEXT", boolc('is_enabled', 1),
    enum('selection_state', ['valid', 'unavailable', 'unknown', 'stale'], default='unknown'), "selection_checked_at TEXT"],
    idx=["CREATE UNIQUE INDEX ux_sa_key ON system_agents(workspace_id, system_key) WHERE deleted_at IS NULL"])

PB_STATUS = ['running', 'ok', 'partial', 'failed']
table('probe_runs', 'A', 'PB', cols=[
    "engine_account_id TEXT NOT NULL REFERENCES engine_accounts(id) ON DELETE CASCADE", "engine_slug TEXT NOT NULL",
    "container_id TEXT REFERENCES containers(id) ON DELETE SET NULL",                 # v2.1: probe chạy trong container của consumer
    enum('trigger', ['install', 'startup', 'schedule', 'manual', 'cli_update', 'error_recovery', 'login_check']),
    "cli_version TEXT", enum('auth_mode', ['oauth', 'api_key', 'adc', 'none', 'unknown']),
    enum('status', PB_STATUS, default='running'), "started_at TEXT NOT NULL", "finished_at TEXT",
    "duration_ms INTEGER", jsonc('summary_json'), "raw_blob_id TEXT REFERENCES blobs(id)", "error TEXT"],
    cons=["CHECK ((status = 'running') = (finished_at IS NULL))"],
    idx=["CREATE INDEX ix_pb_acc ON probe_runs(engine_account_id, started_at)"],
    rules=dict(write_once=['finished_at', 'duration_ms', 'summary_json', 'raw_blob_id', 'error', 'container_id'],
               transitions={'status': [('running', s) for s in PB_STATUS if s != 'running']}))

table('capabilities', 'E', 'CAP', cols=[
    "engine_account_id TEXT NOT NULL REFERENCES engine_accounts(id) ON DELETE CASCADE",
    enum('kind', ['version', 'flag', 'subcommand', 'model', 'effort', 'mode', 'output_format', 'quota_window',
                  'login_method', 'instruction_file', 'hook', 'mcp', 'tool', 'feature', 'native_memory']),
    "item_key TEXT NOT NULL", enum('value_state', ['known', 'unknown']), "value_text TEXT", jsonc('value_json'),
    "unknown_reason TEXT", "source TEXT NOT NULL", enum('confidence', ['direct', 'indirect', 'static_catalog']),
    enum('auth_mode', ['oauth', 'api_key', 'adc', 'none', 'unknown']), "cli_version TEXT",
    "ordinal INTEGER",                                                                 # v2.1 (CNS-029c): thứ tự trong output CLI (effort low<…<max)
    "first_seen_at TEXT NOT NULL", "last_seen_at TEXT NOT NULL",
    "last_probe_run_id TEXT NOT NULL REFERENCES probe_runs(id)", "missing_since TEXT"],
    cons=["CHECK ((value_state = 'unknown') = (unknown_reason IS NOT NULL))",
          "UNIQUE (engine_account_id, kind, item_key)"],
    idx=["CREATE INDEX ix_cap_live ON capabilities(engine_account_id, kind) WHERE missing_since IS NULL",
         "CREATE INDEX ix_cap_state ON capabilities(workspace_id, kind, value_state)"])

table('quota_snapshots', 'An', cols=[
    "engine_account_id TEXT NOT NULL REFERENCES engine_accounts(id) ON DELETE CASCADE",
    "probe_run_id TEXT REFERENCES probe_runs(id) ON DELETE SET NULL", "observed_at TEXT NOT NULL",
    "window_key TEXT NOT NULL",
    "window_seconds INTEGER CHECK (window_seconds IS NULL OR window_seconds > 0)",    # v2.1 (CNS-029a): độ dài cửa sổ, NULL = "?"
    enum('state', QSTATE),
    "remaining_pct REAL CHECK (remaining_pct IS NULL OR remaining_pct BETWEEN 0 AND 100)",
    "used INTEGER", "limit_value INTEGER", "reset_at TEXT",
    enum('source', ['usage_command', 'error_signal', 'session_usage', 'manual']),
    enum('confidence', ['direct', 'indirect', 'static_catalog']), jsonc('raw_json')],
    idx=["CREATE INDEX ix_qs_acc ON quota_snapshots(engine_account_id, window_key, observed_at)"],
    rules=dict(mode='append'))

# v2.1 (CNS-029b, ruling 8): thứ hạng model do owner xếp (gợi ý heuristic), lưu thành dữ liệu — CLI không trả tier
table('model_ranks', 'E', 'MR', cols=[
    "engine_slug TEXT NOT NULL REFERENCES engines(slug)", "model_key TEXT NOT NULL",
    "rank INTEGER NOT NULL CHECK (rank >= 1)", enum('source', ['owner', 'heuristic', 'probe']),
    "basis TEXT", "ranked_at TEXT NOT NULL", "ranked_by TEXT REFERENCES actors(id)"],
    cons=["CHECK (source <> 'owner' OR ranked_by IS NOT NULL)"],
    idx=["CREATE UNIQUE INDEX ux_mr ON model_ranks(workspace_id, engine_slug, model_key) WHERE deleted_at IS NULL",
         "CREATE INDEX ix_mr_rank ON model_ranks(workspace_id, rank)"])

table('compiled_prompts', 'A', 'GC', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT",
    "revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT",
    "position_revision_id TEXT REFERENCES revisions(id) ON DELETE RESTRICT",
    "rules_revision_id TEXT REFERENCES revisions(id) ON DELETE RESTRICT",          # v2.1: revision Nội quy (workspace)
    "engine_slug TEXT REFERENCES engines(slug)", "context_key TEXT NOT NULL DEFAULT 'default'",
    "compiler_version TEXT NOT NULL", "tokenizer TEXT NOT NULL", "total_tokens INTEGER NOT NULL",
    "frame_tokens INTEGER NOT NULL", "budget_tokens INTEGER NOT NULL",
    enum('status', ['ok', 'over_budget', 'failed']), "content TEXT NOT NULL", "content_hash TEXT NOT NULL",
    "stable_prefix_hash TEXT NOT NULL",
    # v2.2 (CNS-036/037): luật chơi in số từ settings → bản biên dịch còn phụ thuộc settings: hash bộ số đã in (đổi settings = biên dịch lại)
    "polaris_params_hash TEXT"],
    cons=["CHECK (status = 'failed' OR (status = 'over_budget') = (total_tokens > budget_tokens))"],
    idx=["CREATE UNIQUE INDEX ux_gc ON compiled_prompts(revision_id, COALESCE(position_revision_id, ''), COALESCE(rules_revision_id, ''), COALESCE(engine_slug, ''), context_key, COALESCE(polaris_params_hash, ''))",
         "CREATE INDEX ix_gc_role ON compiled_prompts(role_id, display_seq)"],
    rules=dict(mode='append'))

SEG_ARC = ['dna_field_version_id', 'instruction_version_id', 'skill_version_id']
table('compiled_prompt_segments', 'P', cols=[
    ID, WS, "compiled_prompt_id TEXT NOT NULL REFERENCES compiled_prompts(id) ON DELETE CASCADE",
    "ordinal INTEGER NOT NULL",
    enum('layer', ['values', 'house_rules', 'persona', 'style', 'drive', 'position', 'skills', 'polaris', 'frame']),
    # v2.2 (CNS-036): 'polaris_rules' = luật chơi P1–P4 + chú giải (TĨNH, trong prefix, có trong hash ghim);
    #                 'polaris' = hậu tố số liệu ĐỘNG (token_count = phần dự trữ worst-case ≤ 80; KHÔNG nằm trong hash ghim)
    enum('source_kind', ['dna_field', 'instruction', 'skill_index', 'polaris_rules', 'polaris', 'frame']),
    boolc('is_conditional'),                                                         # v2.1 (CNS-023): khối có điều kiện đứng sau khối "luôn"
    "dna_field_version_id TEXT REFERENCES dna_field_versions(id)",
    "instruction_version_id TEXT REFERENCES instruction_versions(id)",
    "skill_version_id TEXT REFERENCES skill_versions(id)", "source_display TEXT NOT NULL",
    "text TEXT NOT NULL", "token_count INTEGER NOT NULL CHECK (token_count >= 0)",
    jsonc('params_json')],                                                           # v2.2: số settings đã in vào luật chơi
    cons=["CHECK ((" + " + ".join(f"CASE WHEN {c} IS NULL THEN 0 ELSE 1 END" for c in SEG_ARC) +
          ") = (CASE WHEN source_kind IN ('frame', 'polaris', 'polaris_rules') THEN 0 ELSE 1 END))",
          "CHECK ((source_kind = 'polaris_rules') = (params_json IS NOT NULL))",
          "CHECK (source_kind <> 'dna_field' OR dna_field_version_id IS NOT NULL)",
          "CHECK (source_kind <> 'instruction' OR instruction_version_id IS NOT NULL)",
          "CHECK (source_kind <> 'skill_index' OR skill_version_id IS NOT NULL)",
          "CHECK ((source_kind IN ('polaris', 'polaris_rules')) = (layer = 'polaris'))",
          "CHECK (source_kind NOT IN ('polaris', 'polaris_rules') OR is_conditional = 0)",
          "UNIQUE (compiled_prompt_id, ordinal)"],
    rules=dict(mode='append'))

# v2.1 (CNS-001/009, Q-R1): container của Role (ngủ ngay khi Role nháp được gán tài khoản đầu tiên) + đúng một container AI Hệ thống
# (tạo ở Onboarding, trước Role đầu tiên). Image chứa mọi CLI; volume /auth của tài khoản chỉ mount vào container của consumer duy nhất.
table('containers', 'E', 'CT', cols=[
    enum('kind', ['role', 'system']), "role_id TEXT REFERENCES roles(id) ON DELETE RESTRICT",
    "container_name TEXT NOT NULL", "image_ref TEXT", "image_digest TEXT", "cli_bundle TEXT",
    enum('desired_state', ['absent', 'sleeping', 'running', 'stopped']),
    enum('observed_state', ['absent', 'creating', 'created', 'running', 'exited', 'paused', 'error', 'unknown']),
    "state_detail TEXT", enum('health', ['ok', 'degraded', 'fail', 'unknown'], nn=False), "health_checked_at TEXT",
    "cpu_limit REAL", "mem_limit_mb INTEGER", "session_timeout_s INTEGER", "last_started_at TEXT",
    "last_stopped_at TEXT", "cold_start_ms_p50 INTEGER"],
    cons=["CHECK ((kind = 'role') = (role_id IS NOT NULL))"],
    idx=["CREATE UNIQUE INDEX ux_ct_role ON containers(role_id) WHERE role_id IS NOT NULL AND deleted_at IS NULL",
         "CREATE UNIQUE INDEX ux_ct_system ON containers(workspace_id) WHERE kind = 'system' AND deleted_at IS NULL",
         "CREATE UNIQUE INDEX ux_ct_name ON containers(container_name) WHERE deleted_at IS NULL",
         "CREATE INDEX ix_ct_state ON containers(workspace_id, observed_state)"])

# ---------------------------------------------------------------- 5.13 Telegram
table('telegram_bots', 'E', 'TG', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT", "bot_username TEXT NOT NULL",
    "bot_tg_id INTEGER", "secret_id TEXT NOT NULL REFERENCES secrets(id)", "token_last4 TEXT",
    enum('status', ['pending', 'active', 'paused', 'revoked', 'error'], default='pending'), "getme_ok_at TEXT",
    "poll_offset INTEGER NOT NULL DEFAULT 0", "last_update_at TEXT", "error TEXT"],
    idx=["CREATE UNIQUE INDEX ux_tg_role ON telegram_bots(role_id) WHERE deleted_at IS NULL",
         "CREATE UNIQUE INDEX ux_tg_bot ON telegram_bots(workspace_id, bot_tg_id) WHERE deleted_at IS NULL",
         "CREATE INDEX ix_tg_status ON telegram_bots(workspace_id, status)"])

table('telegram_allowlist', 'E', 'AL', cols=[
    "bot_id TEXT NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE", "tg_user_id INTEGER NOT NULL",
    "display_name TEXT NOT NULL", boolc('is_owner'), enum('added_via', ['capture', 'manual', 'default_setting']),
    enum('status', ['active', 'removed'], default='active')],
    idx=["CREATE UNIQUE INDEX ux_al ON telegram_allowlist(bot_id, tg_user_id) WHERE deleted_at IS NULL"])

# ---------------------------------------------------------------- 5.14 Chủ động
TRIG_KIND = ['commitment_reminder', 'task_done', 'opportunity', 'incident', 'heartbeat_digest']
table('proactive_policies', 'E', 'PP', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE", boolc('is_enabled', 1),
    "max_per_day INTEGER NOT NULL DEFAULT 5 CHECK (max_per_day BETWEEN 0 AND 20)",
    "quiet_start_min INTEGER NOT NULL CHECK (quiet_start_min BETWEEN 0 AND 1439)",
    "quiet_end_min INTEGER NOT NULL CHECK (quiet_end_min BETWEEN 0 AND 1439)", boolc('weekend_differs'),
    "weekend_quiet_start_min INTEGER CHECK (weekend_quiet_start_min IS NULL OR weekend_quiet_start_min BETWEEN 0 AND 1439)",
    "weekend_quiet_end_min INTEGER CHECK (weekend_quiet_end_min IS NULL OR weekend_quiet_end_min BETWEEN 0 AND 1439)",
    "timezone TEXT NOT NULL", enum('break_quiet_level', ['never', 'urgent_only', 'high_and_above'], default='urgent_only'),
    enum('channel', ['telegram', 'email', 'workspace_chat'], default='telegram'),
    boolc('allow_commitment_reminder', 1), boolc('allow_task_done', 1), boolc('allow_opportunity', 0),
    boolc('allow_incident', 1), boolc('allow_heartbeat_digest', 1)],
    cons=["CHECK ((weekend_differs = 1) = (weekend_quiet_start_min IS NOT NULL AND weekend_quiet_end_min IS NOT NULL))"],
    idx=["CREATE UNIQUE INDEX ux_pp_role ON proactive_policies(role_id) WHERE deleted_at IS NULL"])

table('proactive_jobs', 'E', 'PA', cols=[
    "position_id TEXT NOT NULL REFERENCES positions(id)", "name TEXT NOT NULL", "cron_expr TEXT NOT NULL",
    "timezone TEXT NOT NULL", enum('action_kind', ['heartbeat_check', 'digest', 'run_skill', 'report', 'custom_prompt']),
    "skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL", "prompt TEXT", enum('trigger_kind', TRIG_KIND),
    boolc('is_enabled', 1), enum('misfire_policy', ['skip', 'run_once'], default='skip'), "next_run_at TEXT",
    "last_run_at TEXT", enum('last_status', ['ok', 'skipped', 'failed'], nn=False)],
    idx=["CREATE INDEX ix_pa_due ON proactive_jobs(next_run_at) WHERE is_enabled = 1 AND deleted_at IS NULL"])

PN_STATUS = ['reserved', 'sent', 'failed', 'expired', 'suppressed_quiet', 'suppressed_cap', 'suppressed_disabled',
             'suppressed_wounded', 'test']
table('proactive_sends', 'A', 'PN', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE",
    "policy_id TEXT REFERENCES proactive_policies(id) ON DELETE SET NULL", enum('trigger_kind', TRIG_KIND),
    enum('urgency', ['low', 'normal', 'high', 'urgent']), "day_local TEXT NOT NULL",
    enum('channel', ['telegram', 'email', 'workspace_chat']), enum('status', PN_STATUS),
    "idempotency_key TEXT", "reserved_until TEXT",
    "message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL",
    "task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL",
    "commitment_id TEXT REFERENCES commitments(id) ON DELETE SET NULL",
    "proactive_job_id TEXT REFERENCES proactive_jobs(id) ON DELETE SET NULL",
    "sent_at TEXT", "error TEXT", "reason TEXT"],
    cons=["CHECK (status <> 'reserved' OR reserved_until IS NOT NULL)",
          "CHECK ((status = 'sent') = (sent_at IS NOT NULL))",
          "UNIQUE (workspace_id, idempotency_key)"],
    idx=["CREATE INDEX ix_pn_cap ON proactive_sends(role_id, day_local, status)",
         "CREATE INDEX ix_pn_kind ON proactive_sends(role_id, trigger_kind, created_at)",
         "CREATE INDEX ix_pn_lease ON proactive_sends(reserved_until) WHERE status = 'reserved'"],
    rules=dict(write_once=['message_id', 'sent_at', 'error'],
               transitions={'status': [('reserved', 'sent'), ('reserved', 'failed'), ('reserved', 'expired')]}))

# ---------------------------------------------------------------- 5.15 Công cụ, quyền
table('tools', 'E', 'TL', cols=[
    "slug TEXT NOT NULL", "name TEXT NOT NULL", enum('kind', ['gateway_builtin', 'mcp_server', 'integration']),
    "description TEXT", enum('risk_level', ['low', 'medium', 'high']), enum('default_mode', ['allow', 'ask', 'deny']),
    enum('allowed_agents', ['role', 'system', 'both']), jsonc('config_json'),
    "secret_id TEXT REFERENCES secrets(id)", boolc('is_builtin'), "builtin_key TEXT",
    # v2.1 (CNS-005): token định nghĩa tool lộ ra CLI (ước lượng) — built-in đã nằm trong overhead đo được
    "definition_tokens INTEGER NOT NULL DEFAULT 0 CHECK (definition_tokens >= 0)", "tokenizer TEXT",
    enum('status', ['active', 'disabled'], default='active')],
    idx=["CREATE UNIQUE INDEX ux_tl_slug ON tools(workspace_id, slug) WHERE deleted_at IS NULL"])

table('tool_grants', 'E', 'GR', cols=[
    "tool_id TEXT NOT NULL REFERENCES tools(id)", "role_id TEXT REFERENCES roles(id) ON DELETE CASCADE",
    "position_id TEXT REFERENCES positions(id) ON DELETE CASCADE", enum('mode', ['allow', 'ask', 'deny']),
    "expires_at TEXT", "source_request_id TEXT REFERENCES permission_requests(id) ON DELETE SET NULL", "note TEXT"],
    cons=["CHECK ((role_id IS NULL) <> (position_id IS NULL))"],
    idx=["CREATE UNIQUE INDEX ux_gr_role ON tool_grants(tool_id, role_id) WHERE role_id IS NOT NULL AND deleted_at IS NULL",
         "CREATE UNIQUE INDEX ux_gr_pos ON tool_grants(tool_id, position_id) WHERE position_id IS NOT NULL AND deleted_at IS NULL"])

table('permission_requests', 'E', 'PM', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE",
    "tool_id TEXT REFERENCES tools(id) ON DELETE SET NULL", "requested_tool_slug TEXT NOT NULL",
    "requested_scope TEXT", "reason TEXT NOT NULL", "task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL",
    "session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    enum('status', ['pending', 'approved', 'denied', 'expired', 'cancelled'], default='pending'),
    "decided_at TEXT", "decided_by TEXT REFERENCES actors(id)", "decision_note TEXT",
    "grant_id TEXT REFERENCES tool_grants(id) ON DELETE SET NULL"],
    cons=["CHECK ((status = 'pending') = (decided_at IS NULL))"],
    idx=["CREATE INDEX ix_pm_pending ON permission_requests(workspace_id, created_at) WHERE status = 'pending'"])

table('egress_rules', 'E', 'EG', cols=[
    "domain_pattern TEXT NOT NULL", "port INTEGER", enum('applies_to', ['all_roles', 'role', 'position', 'tool']),
    "role_id TEXT REFERENCES roles(id) ON DELETE CASCADE",
    "position_id TEXT REFERENCES positions(id) ON DELETE CASCADE",
    "tool_id TEXT REFERENCES tools(id) ON DELETE CASCADE", enum('action', ['allow', 'deny'], default='allow'),
    boolc('is_builtin'), "note TEXT"],
    cons=["CHECK ((applies_to = 'role') = (role_id IS NOT NULL) AND (applies_to = 'position') = (position_id IS NOT NULL) AND (applies_to = 'tool') = (tool_id IS NOT NULL))"],
    idx=["CREATE UNIQUE INDEX ux_eg ON egress_rules(workspace_id, domain_pattern, applies_to, COALESCE(role_id, ''), COALESCE(position_id, ''), COALESCE(tool_id, '')) WHERE deleted_at IS NULL"])

# v2.1 (Ryan, Polaris): mỗi hành động do Role khởi xướng (đề xuất, xin quyền, tin chủ động, nhận việc) ghi một lần "đối chiếu Polaris"
table('polaris_checks', 'A', 'PC', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE",
    enum('subject_kind', ['proposal', 'permission_request', 'proactive', 'task_accept']),
    f"change_set_id TEXT REFERENCES change_sets(id) ON DELETE CASCADE {DEF}",
    f"permission_request_id TEXT REFERENCES permission_requests(id) ON DELETE CASCADE {DEF}",
    f"proactive_send_id TEXT REFERENCES proactive_sends(id) ON DELETE CASCADE {DEF}",
    f"task_id TEXT REFERENCES tasks(id) {DEF}",
    "expected_gain_minor INTEGER NOT NULL CHECK (expected_gain_minor >= 0)",
    "rules_applied TEXT NOT NULL CHECK (length(trim(rules_applied)) > 0)", "rationale TEXT",
    "balance_minor_at INTEGER", "rank_at INTEGER", "session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    "audit_id TEXT", "audit_display_id TEXT"],
    cons=["""CHECK ((CASE WHEN change_set_id IS NULL THEN 0 ELSE 1 END + CASE WHEN permission_request_id IS NULL THEN 0 ELSE 1 END
          + CASE WHEN proactive_send_id IS NULL THEN 0 ELSE 1 END + CASE WHEN task_id IS NULL THEN 0 ELSE 1 END) = 1)""",
          "CHECK ((subject_kind = 'proposal') = (change_set_id IS NOT NULL))",
          "CHECK ((subject_kind = 'permission_request') = (permission_request_id IS NOT NULL))",
          "CHECK ((subject_kind = 'proactive') = (proactive_send_id IS NOT NULL))",
          "CHECK ((subject_kind = 'task_accept') = (task_id IS NOT NULL))"],
    idx=["CREATE INDEX ix_pc_role ON polaris_checks(workspace_id, role_id, display_seq)"],
    rules=dict(mode='append'))

# ---------------------------------------------------------------- 5.16 Thẻ + thử việc (MVP lại, CNS-011)
table('employee_cards', 'E', 'CD', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT",
    "revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT",
    "compiled_prompt_id TEXT REFERENCES compiled_prompts(id) ON DELETE RESTRICT",
    "position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE RESTRICT",
    enum('status', ['draft', 'issued', 'suspended', 'revoked', 'superseded'], default='draft'),
    "issued_at TEXT", "issued_by TEXT REFERENCES actors(id)", "suspended_at TEXT", "revoked_at TEXT",
    "revoke_reason TEXT", "dna_signature TEXT", "prompt_tokens INTEGER", "issue_audit_id TEXT",
    "issue_audit_display_id TEXT", f"superseded_by_id TEXT REFERENCES employee_cards(id) {DEF}",
    jsonc('checks_json', nn=True), "checks_evaluated_at TEXT"],
    cons=["CHECK ((status = 'superseded') = (superseded_by_id IS NOT NULL))",
          "CHECK (status = 'draft' OR (issued_at IS NOT NULL AND issued_by IS NOT NULL AND dna_signature IS NOT NULL AND issue_audit_id IS NOT NULL))"],
    idx=["CREATE UNIQUE INDEX ux_cd_live ON employee_cards(role_id) WHERE status IN ('issued', 'suspended') AND deleted_at IS NULL"])

TR_STATUS = ['pending', 'running', 'passed', 'failed', 'skipped']
table('trial_runs', 'A', 'TR', cols=[
    "role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE",
    f"revision_id TEXT NOT NULL REFERENCES revisions(id) {DEF}",
    f"compiled_prompt_id TEXT REFERENCES compiled_prompts(id) {DEF}",
    "engine_account_id TEXT REFERENCES engine_accounts(id) ON DELETE SET NULL",
    enum('status', TR_STATUS, default='pending'),
    "scenario_count INTEGER NOT NULL DEFAULT 5 CHECK (scenario_count BETWEEN 1 AND 20)", "pass_count INTEGER",
    "score REAL CHECK (score IS NULL OR score BETWEEN 0 AND 1)",
    "pass_threshold REAL NOT NULL DEFAULT 0.8 CHECK (pass_threshold BETWEEN 0 AND 1)",
    enum('judge_kind', ['llm_judge', 'owner']), "judge_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    jsonc('result_json'), "skip_reason TEXT", "decided_at TEXT", "decided_by TEXT REFERENCES actors(id)"],
    cons=["CHECK (status <> 'skipped' OR (length(trim(skip_reason)) > 0) IS TRUE)",
          "CHECK (status NOT IN ('passed', 'failed', 'skipped') OR (decided_at IS NOT NULL AND decided_by IS NOT NULL))",
          "CHECK (status <> 'passed' OR (score >= pass_threshold) IS TRUE)",
          "CHECK (pass_count IS NULL OR pass_count BETWEEN 0 AND scenario_count)"],
    idx=["CREATE INDEX ix_tr_role ON trial_runs(role_id, display_seq)"],
    rules=dict(write_once=['pass_count', 'score', 'result_json', 'skip_reason', 'decided_at', 'decided_by', 'judge_session_id'],
               transitions={'status': [('pending', 'running'), ('pending', 'skipped'), ('running', 'passed'), ('running', 'failed')]}))

# ---------------------------------------------------------------- 5.17 Chat — Ghim & Soi (+ ui_actions về MVP, CNS-011 / STD-08 §5)
table('chat_threads', 'E', 'TH', cols=[
    enum('kind', ['interview', 'training', 'assistant', 'telegram', 'workspace', 'tree']),
    "role_id TEXT REFERENCES roles(id) ON DELETE SET NULL",
    enum('agent', ['interviewer', 'trainer', 'assistant', 'role']),
    "telegram_bot_id TEXT REFERENCES telegram_bots(id) ON DELETE SET NULL", "tg_chat_id INTEGER", "title TEXT",
    enum('status', ['open', 'paused', 'closed', 'archived'], default='open'), "screen_route TEXT",
    jsonc('state_json'), "last_message_at TEXT", "message_count INTEGER NOT NULL DEFAULT 0"],
    cons=["CHECK ((kind = 'telegram') = (tg_chat_id IS NOT NULL))",
          "CHECK (kind <> 'telegram' OR telegram_bot_id IS NOT NULL OR status = 'archived')"],
    idx=["CREATE UNIQUE INDEX ux_th_tg ON chat_threads(telegram_bot_id, tg_chat_id) WHERE kind = 'telegram' AND deleted_at IS NULL",
         "CREATE INDEX ix_th_role ON chat_threads(workspace_id, role_id, kind, last_message_at)"])

MSG_STATUS = ['streaming', 'final', 'failed', 'redacted']
table('chat_messages', 'A', 'MSG', cols=[
    "thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE",
    enum('author_kind', ['owner', 'user', 'role', 'interviewer', 'trainer', 'assistant', 'system', 'external']),
    "author_actor_id TEXT REFERENCES actors(id)", enum('channel', ['web', 'telegram', 'system']),
    "content TEXT NOT NULL", enum('status', MSG_STATUS, default='final'), "context_tokens INTEGER",
    "tokens_in INTEGER", "tokens_out INTEGER", "session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    "reply_to_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL", "external_id TEXT",
    "anchor_count INTEGER NOT NULL DEFAULT 0", "attachment_count INTEGER NOT NULL DEFAULT 0", "lang TEXT",
    "redacted_at TEXT", "redacted_by TEXT REFERENCES actors(id)", "redact_reason TEXT",
    # v2.3.0 (CONTRACT-r9 §C — [ĐỀ XUẤT — Gen vòng 9]): ĐỘ CHẮC Role tự khai cho câu trả lời (luật harness: chưa kiểm chứng ⇒ gắn nhãn chưa chắc) — nguồn
    # trạng thái avatar 'unsure'. Chỉ tin của Role; NULL = chưa khai / runtime chưa tách được nhãn (chưa đo được ⇒ không hiện 'unsure'). Ghi một lần (adapter
    # ghi lúc tin thành final). Tín hiệu TỐT (trung thực, INT-19) — không trừ ₲.
    enum('certainty', ['sure', 'unsure'], nn=False)],
    cons=["CHECK ((status = 'redacted') = (redacted_at IS NOT NULL))",
          "CHECK (certainty IS NULL OR author_kind = 'role')"],
    idx=["CREATE UNIQUE INDEX ux_msg_ext ON chat_messages(thread_id, external_id) WHERE external_id IS NOT NULL",
         "CREATE INDEX ix_msg_thread ON chat_messages(thread_id, display_seq)"],
    rules=dict(cache=['anchor_count', 'attachment_count'],
               write_once=['tokens_in', 'tokens_out', 'redacted_at', 'redacted_by', 'redact_reason', 'context_tokens', 'certainty'],
               transitions={'status': [('streaming', 'final'), ('streaming', 'failed'), ('final', 'redacted'), ('failed', 'redacted')]},
               mutable_when={'content': "OLD.status = 'streaming' OR NEW.status = 'redacted'"}))

table('message_attachments', 'E', 'AT', cols=[
    "message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE",
    "blob_id TEXT NOT NULL REFERENCES blobs(id)", "file_name TEXT NOT NULL", "mime TEXT NOT NULL",
    "size_bytes INTEGER NOT NULL", "sha256 TEXT NOT NULL",
    enum('scan_status', ['pending', 'clean', 'rejected', 'error'], default='pending'), "reject_reason TEXT",
    "thumbnail_blob_id TEXT REFERENCES blobs(id)", "uploaded_by TEXT NOT NULL REFERENCES actors(id)"],
    idx=["CREATE INDEX ix_at_orphan ON message_attachments(created_at) WHERE message_id IS NULL"])

table('message_anchors', 'A', 'AN', cols=[
    "message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE",
    enum('kind', ['pin', 'reference', 'annotate', 'proposal', 'quote']), "anchor TEXT NOT NULL",
    "entity_type TEXT", "entity_id TEXT", "entity_display_id TEXT", "column_name TEXT", "column_letter TEXT",
    jsonc('region_json'), "snapshot_value TEXT", "snapshot_hash TEXT", "entity_version INTEGER", "ordinal INTEGER",
    "note TEXT", enum('resolved_state', ['ok', 'changed', 'gone', 'unknown'], default='unknown'), "resolved_at TEXT"],
    idx=["CREATE INDEX ix_an_entity ON message_anchors(workspace_id, entity_id)"],
    rules=dict(cache=['resolved_state', 'resolved_at']))

table('ui_actions', 'A', 'UA', cols=[
    "message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE",
    "session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL",
    enum('action', ['highlight', 'navigate', 'annotate', 'tour', 'propose_edit']), "anchor TEXT NOT NULL",
    "entity_type TEXT", "entity_id TEXT", "entity_display_id TEXT", "step INTEGER", jsonc('payload_json'),
    "change_set_id TEXT REFERENCES change_sets(id) ON DELETE SET NULL", "change_set_display_id TEXT",
    enum('outcome', ['ok', 'target_gone', 'failed']), "screen_route TEXT"],
    cons=["CHECK (action <> 'propose_edit' OR outcome = 'failed' OR change_set_display_id IS NOT NULL)"],
    idx=["CREATE INDEX ix_ua_msg ON ui_actions(message_id, display_seq)",
         "CREATE INDEX ix_ua_entity ON ui_actions(workspace_id, entity_id)"],
    rules=dict(mode='append'))

# ---------------------------------------------------------------- 5.18 Audit, sự kiện, hàng đợi
table('audit_log', 'A', 'AU', cols=[
    "actor_id TEXT NOT NULL REFERENCES actors(id)", "actor_label TEXT NOT NULL",
    enum('actor_kind', ['user', 'role', 'system']), "action TEXT NOT NULL", enum('result', ['ok', 'denied', 'error']),
    "role_id TEXT", "entity_type TEXT", "entity_id TEXT", "entity_display_id TEXT", jsonc('before_json'),
    jsonc('after_json'), jsonc('detail_json'), "reason TEXT", "tool TEXT", "session_id TEXT", "task_id TEXT",
    enum('channel', ['web', 'api', 'telegram', 'scheduler', 'gateway', 'cli', 'system']), "request_id TEXT NOT NULL",
    "ip_hash TEXT", "tokens_total INTEGER", "cost_micro_usd INTEGER", "hash_key_id TEXT NOT NULL",
    "prev_hash TEXT", "row_hash TEXT NOT NULL"],
    cons=["CHECK ((display_seq = 1) = (prev_hash IS NULL))"],
    idx=["CREATE INDEX ix_au_time ON audit_log(workspace_id, created_at)",
         "CREATE INDEX ix_au_role ON audit_log(workspace_id, role_id, display_seq)",
         "CREATE INDEX ix_au_entity ON audit_log(workspace_id, entity_id)",
         "CREATE INDEX ix_au_action ON audit_log(workspace_id, action, display_seq)",
         "CREATE INDEX ix_au_req ON audit_log(request_id)"],
    rules=dict(mode='append'))

# v2.2.6 (CONTRACT-r6 A2): lý do failover = enum 4 giá trị, ghi ở chính nơi log failover (events kind engine.failover);
# detail_json bắt buộc from_account_id / to_account_id. v2.2.8 (CONTRACT-r8 §B): enum giữ nguyên nhưng CHỈ cho fallback tự động giữa các
# LOẠI CLI khác nhau của một Role (trigger events_failover_i); Core agent không fallback; cùng loại không có tài khoản thứ hai.
FAILOVER_REASONS = ['login_expired', 'outage', 'quota_exhausted', 'account_suspended']
table('events', 'A', 'EV', cols=[
    "kind TEXT NOT NULL", enum('severity', ['ok', 'info', 'warn', 'danger']), "role_id TEXT",
    "subject TEXT NOT NULL", "result_label TEXT", "entity_type TEXT", "entity_id TEXT", "entity_display_id TEXT",
    "audit_id TEXT", jsonc('detail_json'), enum('failover_reason', FAILOVER_REASONS, nn=False)],
    cons=["CHECK ((kind = 'engine.failover') = (failover_reason IS NOT NULL))",
          "CHECK (kind <> 'engine.failover' OR (json_extract(detail_json, '$.from_account_id') IS NOT NULL "
          "AND json_extract(detail_json, '$.to_account_id') IS NOT NULL))",
          # v2.2.10 (CONTRACT-r8c §A, Q-R8a): owner đổi loại Core agent khi sự cố ⇒ một sự kiện: từ loại nào, sang loại nào, vì sự cố gì
          # (from / to = slug engine, khác nhau; reason = lý do sự cố lúc đổi — v_core_agent_status.reason); actor owner = created_by (trigger)
          "CHECK (kind <> 'core_agent.type_changed' OR (json_extract(detail_json, '$.from') IS NOT NULL "
          "AND json_extract(detail_json, '$.to') IS NOT NULL AND json_extract(detail_json, '$.from') IS NOT json_extract(detail_json, '$.to') "
          "AND json_extract(detail_json, '$.reason') IS NOT NULL))"],
    idx=["CREATE INDEX ix_ev_time ON events(workspace_id, created_at)",
         "CREATE INDEX ix_ev_role ON events(workspace_id, role_id, created_at)",
         "CREATE INDEX ix_ev_kind ON events(workspace_id, kind, created_at)",
         "CREATE INDEX ix_ev_entity ON events(entity_id, kind, created_at) WHERE entity_id IS NOT NULL"],
    rules=dict(mode='append'))

table('notifications', 'E', 'NT', cols=[
    "user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE",
    enum('kind', ['failover', 'quota_low', 'update_available', 'role_error', 'field_pending', 'permission_request',
                  'memory_proposal', 'telegram_rejected', 'brain_drift', 'backup_failed', 'pii_in_history', 'integrity',
                  'role_wounded', 'lessons_proposed', 'native_memory',
                  # v2.2.8 (CONTRACT-r8 §C): Core agent gặp sự cố ⇒ báo owner NGAY (chuông O2 + Telegram kênh owner); dedupe 'core:<since>'
                  'core_agent_incident']),
    enum('severity', ['ok', 'info', 'warn', 'danger']), "title TEXT NOT NULL", "body TEXT",
    "target_entity_type TEXT", "target_id TEXT", "target_display_id TEXT", "event_id TEXT", "dedupe_key TEXT",
    "read_at TEXT", "dismissed_at TEXT", "resolved_at TEXT"],
    idx=["CREATE UNIQUE INDEX ux_nt_dedupe ON notifications(user_id, dedupe_key) WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL",
         "CREATE INDEX ix_nt_user ON notifications(user_id, read_at, created_at)"])

JOB_KINDS = ['brain_sync', 'brain_purge', 'brain_export', 'compile_prompt', 'rollup_usage', 'probe', 'runtime_baseline',
             'consolidation', 'wound_reflection', 'trial_run', 'index_knowledge', 'search_reindex', 'reminder',
             'proactive_tick', 'egress_compile', 'purge', 'backup', 'blob_gc', 'update_check', 'integrity_check',
             'audit_anchor', 'skill_usage_rollup']
table('jobs', 'A', 'JB', cols=[
    enum('kind', JOB_KINDS), enum('status', ['queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled'], default='queued'),
    "priority INTEGER NOT NULL DEFAULT 0", "run_after TEXT NOT NULL", "attempts INTEGER NOT NULL DEFAULT 0",
    "max_attempts INTEGER NOT NULL DEFAULT 5", "lease_owner TEXT", "lease_until TEXT", "dedupe_key TEXT",
    jsonc('payload_json', nn=True), jsonc('result_json'), "last_error TEXT", "started_at TEXT", "finished_at TEXT",
    "updated_at TEXT"],
    cons=["CHECK (status <> 'running' OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL))",
          "CHECK (kind <> 'wound_reflection' OR dedupe_key IS NOT NULL)"],
    idx=["CREATE UNIQUE INDEX ux_jobs_dedupe ON jobs(workspace_id, dedupe_key) WHERE status = 'queued' AND dedupe_key IS NOT NULL",
         # v2.1: lượt soi lại sau Trọng thương — đúng MỘT lần mỗi lần vào trạng thái (mọi status, không chỉ queued)
         "CREATE UNIQUE INDEX ux_jobs_reflection ON jobs(workspace_id, dedupe_key) WHERE kind = 'wound_reflection'",
         "CREATE INDEX ix_jobs_queue ON jobs(run_after, priority) WHERE status = 'queued'",
         "CREATE INDEX ix_jobs_kind ON jobs(workspace_id, kind, status)"])

# ---------------------------------------------------------------- 5.19 Cập nhật, backup, migration
table('app_versions', 'E', 'UP', cols=[
    "semver TEXT NOT NULL UNIQUE", enum('channel', ['stable', 'beta']), "released_at TEXT", "changelog_md TEXT",
    "image_digest TEXT", "schema_version INTEGER NOT NULL",
    enum('source', ['github_releases', 'registry', 'manual']),
    enum('status', ['available', 'downloading', 'installed', 'current', 'failed', 'yanked']), "discovered_at TEXT"],
    idx=["CREATE UNIQUE INDEX ux_up_current ON app_versions(status) WHERE status = 'current'"])

table('backups', 'E', 'BK', cols=[
    enum('kind', ['scheduled', 'pre_update', 'manual']),
    enum('status', ['running', 'ok', 'failed', 'verified', 'expired', 'deleted']), "target_uri TEXT NOT NULL",
    "size_bytes INTEGER", "app_version TEXT", "schema_version INTEGER", "compat_floor TEXT", boolc('has_db', 1),
    boolc('has_brains', 1), boolc('has_blobs', 1), "manifest_sha256 TEXT", boolc('is_encrypted', 1), "key_id TEXT",
    "started_at TEXT NOT NULL", "finished_at TEXT", "verified_at TEXT", "expires_at TEXT"],
    idx=["CREATE INDEX ix_bk_status ON backups(status, created_at)"])

table('update_runs', 'E', 'UR', cols=[
    "from_version TEXT REFERENCES app_versions(semver)", "to_version TEXT NOT NULL REFERENCES app_versions(semver)",
    enum('trigger', ['auto', 'manual', 'rollback']), "initiated_by TEXT NOT NULL REFERENCES actors(id)",
    enum('status', ['running', 'succeeded', 'rolled_back', 'failed'], default='running'), jsonc('steps_json'),
    "backup_id TEXT REFERENCES backups(id) ON DELETE SET NULL", "schema_from INTEGER", "schema_to INTEGER",
    "compat_floor_before TEXT", "compat_floor_after TEXT", "started_at TEXT NOT NULL", "finished_at TEXT",
    "duration_ms INTEGER", "error TEXT"])

table('schema_migrations', 'P', cols=[
    "version INTEGER PRIMARY KEY", "name TEXT NOT NULL", enum('kind', ['standard', 'rebuild', 'data']),
    "checksum TEXT NOT NULL", enum('dialect', ['sqlite', 'postgres']), "compat_min_app_version TEXT NOT NULL",
    boolc('is_expand_only'), f"applied_at TEXT NOT NULL DEFAULT {TS_DEFAULT}", "app_version TEXT NOT NULL",
    "duration_ms INTEGER", jsonc('row_counts_json')])

# ---------------------------------------------------------------- 5.20 Settings, bí mật, đồng ý, tìm kiếm
table('settings', 'E', 'ST', cols=["key TEXT NOT NULL", jsonc('value_json', nn=True), "note TEXT"],
      idx=["CREATE UNIQUE INDEX ux_st_key ON settings(workspace_id, key) WHERE deleted_at IS NULL"])

# kind KHÔNG có oauth/session: token đăng nhập subscription không bao giờ là một secret của control plane (CNS-014)
# v2.3.1 (BUILD-PLAN §F.6 h, CNS-146 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]): + 'anchor_remote_token' = token HTTPS của git remote cho repo neo audit
# `_anchors` (isomorphic-git chỉ có HTTP(S); SSH chưa hỗ trợ ở MVP). Setting backup.remote_anchor chỉ trỏ secret kind này (settings_remote_anchor_i/_u).
table('secrets', 'E', 'SEC', cols=[
    enum('kind', ['engine_api_key', 'telegram_bot_token', 'backup_target', 'integration_token', 'mfa_totp', 'anchor_remote_token']),
    "label TEXT NOT NULL", "ciphertext BLOB NOT NULL", "nonce BLOB NOT NULL", "wrapped_dek BLOB NOT NULL",
    "dek_nonce BLOB NOT NULL", "kek_id TEXT NOT NULL", "alg TEXT NOT NULL DEFAULT 'A256GCM'", "last4 TEXT",
    "fingerprint TEXT NOT NULL", enum('status', ['active', 'rotated', 'revoked'], default='active'),
    "rotated_from_id TEXT REFERENCES secrets(id) ON DELETE SET NULL", "last_used_at TEXT",
    # v2.3.2 (review bảo mật HIGH trên v2.3.1, L-20261016-32 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]; "chỉ owner" là [Gen quyết 2026-10-16]): token GẮN với ĐÍCH —
    # host được phép đẩy token tới (chữ thường, không scheme / path / '@'; có thể kèm ':cổng'). Chỉ secret kind anchor_remote_token có host (CHECK); ghi một lần
    # (secrets_allowed_host_u) ⇒ đổi host = nhập token mới (secret mới). Host trong URL của backup.remote_anchor phải TRÙNG host này (settings_remote_anchor_i/_u).
    # v2.3.3 (parser-differential): allowed_host = authority của URL neo đúng như WHATWG URL.host — host chữ thường [a-z0-9.-] (không chấm cuối), cổng tuỳ
    # chọn ':<1–65535>' không số 0 đầu và KHÔNG ghi 443 (cổng mặc định của https bị URL parser bỏ) — URL neo phải có authority TRÙNG đúng chuỗi này.
    # Mệnh đề tối thiểu: hai dấu ':' ⇒ phần cổng chứa ':' ⇒ trượt 'chỉ chữ số'; cổng ≥ 1 suy từ '[1-9]*' (không cần mệnh đề riêng).
    "allowed_host TEXT CHECK (allowed_host IS NULL OR (length(allowed_host) BETWEEN 1 AND 253 AND allowed_host NOT GLOB '*[^a-z0-9.:-]*' "
    "AND length(CAST(allowed_host AS BLOB)) = length(allowed_host) "                       # v2.3.4: so byte — không NUL, chỉ ASCII
    "AND allowed_host NOT GLOB ':*' AND allowed_host NOT GLOB '*.' AND allowed_host NOT GLOB '*.:*' "
    "AND (allowed_host NOT GLOB '*:*' OR (substr(allowed_host, instr(allowed_host, ':') + 1) GLOB '[1-9]*' "
    "AND substr(allowed_host, instr(allowed_host, ':') + 1) NOT GLOB '*[^0-9]*' "
    "AND CAST(substr(allowed_host, instr(allowed_host, ':') + 1) AS INTEGER) <= 65535 "
    "AND substr(allowed_host, instr(allowed_host, ':') + 1) <> '443'))))"],
    cons=["CHECK ((kind = 'anchor_remote_token') = (allowed_host IS NOT NULL))"],
    idx=["CREATE INDEX ix_sec_fp ON secrets(workspace_id, fingerprint)"])

table('consents', 'A', 'CN', cols=[
    "user_id TEXT NOT NULL REFERENCES users(id)",
    # v2.2.8 (CONTRACT-r8 §A): gỡ hẳn 'same_vendor_rotation' (consent tos.same_vendor_rotation) — không còn xoay tài khoản cùng hãng
    enum('consent_kind', ['engine_tos_risk', 'role_as_model_api']), "subject TEXT NOT NULL",
    "notice_version TEXT NOT NULL", "notice_hash TEXT NOT NULL", "lang TEXT", "accepted_at TEXT NOT NULL",
    "revoked_at TEXT",
    # v2.2.9 (CONTRACT-r8b §C, CNS-105): danh tính tài khoản CLI mà đồng ý này áp dụng (= engine_accounts.account_hint, đã mask). NULL lúc tick
    # TRƯỚC lần đăng nhập đầu (Onboarding bước 2 / A3.E) ⇒ trigger engine_accounts_consent_identity_ai/_au gắn vào danh tính ĐẦU TIÊN quan sát được;
    # ghi một lần. Đăng nhập ra danh tính khác ⇒ CONSENT_OK() = 0 (đồng ý cũ hết hiệu lực) ⇒ tick lại = CN- mới, giữ EN-/EB-.
    "account_hint TEXT"],
    idx=["CREATE INDEX ix_cn_kind ON consents(workspace_id, consent_kind, subject)"],
    rules=dict(write_once=['revoked_at', 'account_hint']))

table('search_documents', 'P', cols=[
    "id INTEGER PRIMARY KEY", WS, "entity_type TEXT NOT NULL", "entity_id TEXT NOT NULL", "chunk_id TEXT",
    "display_id TEXT", "role_id TEXT", "position_id TEXT", "scope TEXT", "status TEXT", boolc('is_live', 1),
    "title TEXT", "excerpt TEXT", "title_norm TEXT", "body_norm TEXT", "lang TEXT",
    "weight REAL NOT NULL DEFAULT 1", "source_updated_at TEXT"],
    idx=["CREATE UNIQUE INDEX ux_sd ON search_documents(entity_type, entity_id, COALESCE(chunk_id, ''))",
         "CREATE INDEX ix_sd_grid ON search_documents(workspace_id, entity_type, is_live)",
         "CREATE INDEX ix_sd_role ON search_documents(role_id) WHERE role_id IS NOT NULL"])

MVP_TABLES = [n for n in ORDER if not T[n]['game']]

# Bảng GĐ2 đã chừa chỗ (§5.22) — KHÔNG tạo ở MVP; test Q1-no-fk-to-GD2 kiểm không bảng MVP nào trỏ tới chúng
GD2_TABLES = ['licenses', 'model_endpoints', 'bounties', 'inspections', 'job_openings', 'handovers', 'trait_modifiers',
              'embeddings', 'workspace_volumes', 'saved_views', 'skill_invocations',
              'archetypes', 'perks', 'level_thresholds', 'xp_events', 'status_effects', 'tree_layouts',
              'role_plugins', 'role_scripts', 'teams', 'team_members',
              'character_drafts']                       # v2.3.0 (CONTRACT-r9 §F): bản nháp nhân vật của Xưởng (GĐ2) — chừa chỗ, không tạo
DROPPED_TABLES = ['skill_branches', 'skill_tree_nodes', 'skill_tree_edges', 'role_containers']   # v2.1 thay bằng MVP

# ================================================================ FK index rule (§2.10)
NEVER_HARD_DELETED = {'actors', 'users', 'workspaces', 'engines', 'dna_field_defs', 'wallets', 'ledger_entries', 'app_versions'}
FK_RE = re.compile(r"^(\w+)\s+\w+.*?REFERENCES\s+(\w+)\s*\((\w+)\)(.*)$", re.S)

def fks(name):
    out = []
    for c in T[name]['cols']:
        m = FK_RE.match(c)
        if m:
            out.append((m.group(1), m.group(2), m.group(3), m.group(4)))
    return out

def leading_cols(name):
    """Cột đứng đầu các index KHÔNG partial (partial index không phục vụ truy vấn kiểm FK)."""
    lead = set()
    for c in T[name]['cols']:
        if 'PRIMARY KEY' in c and not c.startswith('PRIMARY'):
            lead.add(c.split()[0])
        if re.search(r"\bUNIQUE\b", c):
            lead.add(c.split()[0])
    for k in T[name]['cons']:
        m = re.match(r"(?:PRIMARY KEY|UNIQUE)\s*\(\s*(\w+)", k)
        if m:
            lead.add(m.group(1))
    for i in T[name]['idx']:
        if ' WHERE ' in i:
            continue
        m = re.search(r"ON\s+\w+\s*\(\s*(\w+)", i)
        if m:
            lead.add(m.group(1))
    if T[name]['kind'] in ('E', 'A'):
        lead.add('workspace_id')
    return lead

def auto_fk_indexes(name, policy='v2'):
    out = []
    lead = leading_cols(name)
    for col, ref, refcol, rest in fks(name):
        if col == 'workspace_id':
            continue
        if policy == 'v2' and ref in NEVER_HARD_DELETED:
            continue
        if col in lead:
            continue
        out.append(f"CREATE INDEX ix_{name}_{col} ON {name}({col})")
    return out

# ================================================================ trigger generator (§9.3)
def cols_of(name):
    names = []
    for c in T[name]['cols']:
        w = c.split()[0]
        if w in ('PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN'):
            continue
        names.append(w)
    return names

IDENT = ['id', 'workspace_id', 'display_id', 'display_seq', 'created_at', 'created_by']

def guard_triggers(name):
    t = T[name]
    out = []
    cols = cols_of(name)
    rules = t['rules']
    if t['kind'] in ('E', 'En') and not rules:
        ident = [c for c in IDENT if c in cols]
        cond = " AND ".join(f"NEW.{c} IS OLD.{c}" for c in ident)
        out.append(f"CREATE TRIGGER {name}_ident BEFORE UPDATE ON {name}\n"
                   f"WHEN app_maint() = 0 AND NOT ({cond})\n"
                   f"BEGIN SELECT RAISE(ABORT, 'immutable identity: {name}'); END")
        return out
    if not rules:
        return out
    if rules.get('mode') == 'append':
        allowed = "0"
    else:
        parts = []
        cache = set(rules.get('cache', []))
        wo = set(rules.get('write_once', []))
        tr = rules.get('transitions', {})
        mw = rules.get('mutable_when', {})
        frozen = rules.get('frozen_when')
        for c in cols:
            if c in cache:
                continue
            if c in tr:
                pairs = " OR ".join(f"(OLD.{c} = '{a}' AND NEW.{c} = '{b}')" for a, b in tr[c])
                parts.append(f"(NEW.{c} IS OLD.{c} OR {pairs})")
            elif c in wo:
                parts.append(f"(NEW.{c} IS OLD.{c} OR OLD.{c} IS NULL)")
            elif c in mw:
                parts.append(f"(NEW.{c} IS OLD.{c} OR {mw[c]})")
            elif frozen and c not in IDENT:
                parts.append(f"(NEW.{c} IS OLD.{c} OR NOT ({frozen}))")
            else:
                parts.append(f"NEW.{c} IS OLD.{c}")
        allowed = "\n  AND ".join(parts) if parts else "1"
    out.append(f"CREATE TRIGGER {name}_no_update BEFORE UPDATE ON {name}\n"
               f"WHEN app_maint() = 0 AND NOT (\n  {allowed})\n"
               f"BEGIN SELECT RAISE(ABORT, 'append-only/write-once: {name}'); END")
    out.append(f"CREATE TRIGGER {name}_no_delete BEFORE DELETE ON {name}\n"
               f"WHEN app_maint() = 0\nBEGIN SELECT RAISE(ABORT, 'append-only: {name}'); END")
    return out

# ================================================================ v2.2.13 (review bảo mật v2.2.12, MEDIUM): chống REPLACE — sinh tự động
# INSERT OR REPLACE / REPLACE INTO / UPDATE OR REPLACE giải xung đột UNIQUE bằng cách XOÁ hàng đang có. Khi PRAGMA recursive_triggers OFF (mặc định của SQLite),
# lần xoá đó KHÔNG chạy trigger DELETE nào (guard xoá, bất biến "không được mất" — vd telegram_allowlist_owner_d), và vì là xoá + chèn nên cũng không qua guard
# UPDATE (_ident, đóng băng…). Probe trên v2.2.12: bốn lối REPLACE gỡ được hàng owner allowlist cuối cùng khi pragma OFF.
# Rào ở DB, KHÔNG phụ thuộc pragma: mỗi bảng MVP (trừ NO_REPLACE_EXEMPT) có {t}_no_replace_i (BEFORE INSERT) và {t}_no_replace_u (BEFORE UPDATE OF cột khoá +
# cột điều kiện của partial index) chặn mọi lần ghi TRÙNG một khoá unique (PK — kể cả rowid alias —, UNIQUE, UNIQUE theo biểu thức, partial unique đúng điều
# kiện WHERE của index) với một hàng ĐANG CÓ. BEFORE trigger chạy trước bước giải xung đột ⇒ REPLACE không kịp xoá gì. INSERT thường trùng khoá vốn đã lỗi
# UNIQUE — nay lỗi sớm hơn, thông điệp vẫn có chữ "UNIQUE". Không miễn cả ngữ cảnh bảo trì (rebuild chép sang bảng __new chưa có trigger; purge chỉ xoá).
# Danh sách khoá đọc từ CHÍNH DDL (nạp bảng + index vào SQLite
# :memory:, PRAGMA index_list / index_info / sqlite_master) ⇒ index mới tự có guard, không ai phải nhớ. Lớp kia của hợp đồng kết nối (§2.2): app bật
# recursive_triggers = ON (REPLACE lọt vẫn chạy guard xoá) và cấm OR REPLACE / REPLACE INTO (lint bước ⑥).
NO_REPLACE_EXEMPT = {
    'id_counters': 'cấp số bằng upsert ON CONFLICT DO UPDATE / DO NOTHING (§2.1) — không có guard xoá hay bất biến nào để REPLACE lách',
    'jobs': 'outbox dedupe bằng ON CONFLICT … DO NOTHING (M4) — DELETE job không bị chặn nên REPLACE không lách được gì'}
MSG_NO_REPLACE = ('UNIQUE (chống REPLACE, v2.2.13): {t} — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE '
                  '(REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)')
def _split_top(s):
    """Tách danh sách cột / biểu thức của index ở dấu phẩy cấp ngoài cùng (bỏ qua phẩy trong ngoặc và trong chuỗi '…')."""
    out, depth, cur, q = [], 0, '', False
    for ch in s:
        if ch == "'":
            q = not q
        if not q:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
            elif ch == ',' and depth == 0:
                out.append(cur.strip()); cur = ''; continue
        cur += ch
    out.append(cur.strip())
    return out
def _pfx(expr, cols, p):
    """Gắn tiền tố p. cho mọi tên cột của bảng trong biểu thức (không đụng chuỗi '…')."""
    parts = re.split(r"('(?:[^']|'')*')", expr)
    rx = re.compile(r'\b(' + '|'.join(sorted(cols, key=len, reverse=True)) + r')\b')
    for i in range(0, len(parts), 2):
        parts[i] = rx.sub(lambda m: f'{p}.{m.group(1)}', parts[i])
    return ''.join(parts)
def unique_keys(mem, t):
    """Mọi khoá unique của bảng t trong DB mem: [(danh sách cột / biểu thức, điều kiện WHERE hoặc None)] — PK rowid alias + PRAGMA index_list (unique)."""
    info = mem.execute(f"PRAGMA table_info({t})").fetchall()
    keys = []
    pk = [r for r in info if r[5]]
    if len(pk) == 1 and pk[0][2].upper() == 'INTEGER':
        keys.append(([pk[0][1]], None))
    for _, name, uniq, origin, partial in sorted(mem.execute(f"PRAGMA index_list({t})").fetchall(), key=lambda r: r[1]):
        if not uniq:
            continue
        if origin == 'c':
            sql = mem.execute("SELECT sql FROM sqlite_master WHERE type='index' AND name=?", (name,)).fetchone()[0]
            i = sql.index(f' ON {t}(') + len(f' ON {t}(')
            j, depth = i, 1
            while depth:
                depth += {'(': 1, ')': -1}.get(sql[j], 0)
                j += 1
            rest = sql[j:].strip()
            keys.append((_split_top(sql[i:j - 1]), rest[6:].strip() if rest.upper().startswith('WHERE ') else None))
        else:
            keys.append(([r[2] for r in mem.execute(f"PRAGMA index_info({name})")], None))
    return [r[1] for r in info], keys
def no_replace_triggers(ddl):
    """Sinh {t}_no_replace_i/_u cho mọi bảng MVP (trừ NO_REPLACE_EXEMPT) từ DDL bảng + index."""
    mem = sqlite3.connect(':memory:')
    for s in ddl:
        mem.execute(s)
    out = []
    for t in MVP_TABLES:
        if t in NO_REPLACE_EXEMPT:
            continue
        cols, keys = unique_keys(mem, t)
        if not keys:                      # không có khoá unique ⇒ REPLACE không có hàng nào để xoá
            continue
        def conflict(exprs, where, upd):
            eq = ' AND '.join(f"{_pfx(e, cols, 'x')} = {_pfx(e, cols, 'NEW')}" for e in exprs)
            wx = f" AND ({_pfx(where, cols, 'x')})" if where else ''
            wn = f"({_pfx(where, cols, 'NEW')}) AND " if where else ''
            me = ' AND x.rowid <> OLD.rowid' if upd else ''
            return f"({wn}EXISTS (SELECT 1 FROM {t} x WHERE {eq}{wx}{me}))"
        msg = MSG_NO_REPLACE.format(t=t)
        of = [c for c in cols if any(re.search(r'\b' + c + r'\b', ' '.join(e) + ' ' + (w or '')) for e, w in keys)]
        out.append(f"CREATE TRIGGER {t}_no_replace_i BEFORE INSERT ON {t}\nWHEN (\n  "
                   + "\n  OR ".join(conflict(e, w, False) for e, w in keys) + f")\nBEGIN SELECT RAISE(ABORT, '{msg}'); END")
        out.append(f"CREATE TRIGGER {t}_no_replace_u BEFORE UPDATE OF {', '.join(of)} ON {t}\nWHEN (\n  "
                   + "\n  OR ".join(conflict(e, w, True) for e, w in keys) + f")\nBEGIN SELECT RAISE(ABORT, '{msg}'); END")
    mem.close()
    return out

# ================================================================ v2.3.3: guard chung người ghi (sinh từ DDL, như {t}_no_replace_*)
# Mọi bảng MVP có cột người ghi: INSERT ⇒ created_by = app_actor(); UPDATE (bảng có updated_by) ⇒ updated_by = app_actor(), updated_at ĐỔI, xoá mềm ⇒
# deleted_by = app_actor(); bảng chỉ có created_by (append-only / trạng thái rồi đóng băng) ⇒ UPDATE cần app_actor(). app_actor() NULL ⇒ từ chối
# (fail-closed) trừ ngữ cảnh bảo trì app_maint() = 1 (rebuild / purge / khôi phục). So sánh bằng COALESCE(x = app_actor(), 0) — không bao giờ NULL (B2).
# Tạo NGAY SAU chống REPLACE, TRƯỚC mọi trigger khác ⇒ chạy gần cuối trong các BEFORE trigger cùng sự kiện: cổng nghiệp vụ giữ thông điệp riêng, guard
# chung bắt phần còn lại (UPDATE không đặt lại updated_by, cột ghi lệch app_actor()).
ACTOR_EXEMPT = {}          # bảng có cột người ghi mà miễn guard chung (kèm lý do) — v2.3.3: không có
def FK_SETNULL_ONLY(t, cols):
    """Miễn guard chung CHỈ cho HÀNH ĐỘNG FK ON DELETE SET NULL THẬT (SQLite chạy trigger UPDATE cho hàng con khi xoá hàng cha; hàng con không đóng dấu được —
    job dọn probe_runs / compiled_prompts / blob / backup). v2.3.4 (review bảo mật MEDIUM — sửa lỗ miễn trừ mở của v2.3.3: chỉ so HÌNH DẠNG ⇒ app gỡ tham chiếu
    về NULL khi hàng cha VẪN CÒN, không actor / không đóng dấu, lọt; no-op cũng lọt): (1) mọi cột không phải FK SET NULL giữ nguyên; (2) mỗi cột FK SET NULL
    giữ nguyên HOẶC về NULL khi hàng cha (theo OLD) KHÔNG CÒN — hành động FK chạy SAU khi hàng cha rời b-tree (test ACTOR-fk chứng minh, không suy luận);
    (3) ít nhất một cột FK SET NULL thực sự đổi. None nếu bảng không có FK SET NULL."""
    f = [(c, ref, rc) for c, ref, rc, rest in fks(t) if 'SET NULL' in (rest or '').upper()]
    if not f:
        return None
    fc = [c for c, _r, _rc in f]
    keep = [f"NEW.{c} IS OLD.{c}" for c in cols if c not in fc]
    gone = [f"(NEW.{c} IS OLD.{c} OR (NEW.{c} IS NULL AND NOT EXISTS (SELECT 1 FROM {ref} fkp WHERE fkp.{rc} = OLD.{c})))" for c, ref, rc in f]
    changed = "(" + " OR ".join(f"NEW.{c} IS NOT OLD.{c}" for c in fc) + ")"
    return "(" + " AND ".join(keep + gone + [changed]) + ")"
def MSG_ACTOR(t, what):
    return f"{t}: người ghi (v2.3.3) — {what}"
def actor_triggers():
    out = []
    for t in MVP_TABLES:
        cols = cols_of(t)
        if 'created_by' not in cols or t in ACTOR_EXEMPT:
            continue
        fx = FK_SETNULL_ONLY(t, cols)
        nx = f" AND NOT {fx}" if fx else ""
        out.append(f"CREATE TRIGGER {t}_actor_i BEFORE INSERT ON {t}\nWHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = {ACTOR}, 0)\n"
                   f"BEGIN SELECT RAISE(ABORT, '{MSG_ACTOR(t, 'created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)')}'); END")
        if 'updated_by' not in cols:
            out.append(f"CREATE TRIGGER {t}_actor_u BEFORE UPDATE ON {t}\nWHEN app_maint() = 0 AND {ACTOR} IS NULL{nx}\n"
                       f"BEGIN SELECT RAISE(ABORT, '{MSG_ACTOR(t, 'UPDATE cần app_actor() của giao dịch ghi')}'); END")
            continue
        body = [f"  SELECT RAISE(ABORT, '{MSG_ACTOR(t, 'updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')}')\n"
                f"   WHERE NOT COALESCE(NEW.updated_by = {ACTOR}, 0);",
                f"  SELECT RAISE(ABORT, '{MSG_ACTOR(t, 'updated_at phải đổi ở mỗi UPDATE')}')\n   WHERE NEW.updated_at IS OLD.updated_at;"]
        if 'deleted_at' in cols and 'deleted_by' in cols:
            body.append(f"  SELECT RAISE(ABORT, '{MSG_ACTOR(t, 'xoá mềm phải ghi deleted_by = app_actor()')}')\n"
                        f"   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = {ACTOR}, 0);")
        out.append(f"CREATE TRIGGER {t}_actor_u BEFORE UPDATE ON {t}\nWHEN app_maint() = 0{nx}\nBEGIN\n" + "\n".join(body) + "\nEND")
    return out

# ================================================================ trigger nghiệp vụ (viết tay)
OPEN_WOUND = "EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = {r} AND w.ended_at IS NULL)"
ROLE_WALLET_DEBIT = ("EXISTS (SELECT 1 FROM wallets w WHERE w.id = NEW.debit_wallet_id AND w.owner_kind = 'role' AND w.role_id IS NOT NULL) "
                     "AND NOT EXISTS (SELECT 1 FROM role_wounds r JOIN wallets w ON w.role_id = r.role_id "
                     "WHERE w.id = NEW.debit_wallet_id AND r.ended_at IS NULL)")
ENTER = f"NEW.debit_balance_after = 0 AND app_maint() = 0 AND {ROLE_WALLET_DEBIT}"

def _pair(name, table, when, msg, cols=None):
    """Trigger kiểm tra cho cả INSERT và UPDATE (cùng điều kiện) — tên _i / _u."""
    of = f" OF {', '.join(cols)}" if cols else ""
    return [f"CREATE TRIGGER {name}_i BEFORE INSERT ON {table}\nWHEN {when}\nBEGIN SELECT RAISE(ABORT, '{msg}'); END",
            f"CREATE TRIGGER {name}_u BEFORE UPDATE{of} ON {table}\nWHEN {when}\nBEGIN SELECT RAISE(ABORT, '{msg}'); END"]

# v2.3.3 (review bảo mật HIGH trên v2.3.2): cổng kiểm NEW.created_by / NEW.updated_by = kiểm một cột người gọi tự điều khiển — UPDATE không đặt lại
# updated_by thì NEW kế thừa giá trị cũ (owner / system của lần ghi trước) ⇒ lách. Sửa theo lớp: người ghi = app_actor() — hàm ngữ cảnh kết nối (đăng ký như
# app_maint() / app_now(); app đặt actor cho TỪNG giao dịch ghi, kết nối đọc không có actor); mọi cổng (OWNER_ADMIN / OWNER_ONLY / SYS_ACTOR) gọi trên ACTOR.
ACTOR = 'app_actor()'
def TS_FRESH(t):
    """v2.3.3: updated_at cho UPDATE NỘI BỘ của trigger = {t} nhưng luôn > giá trị cũ của hàng đích (cùng ms ⇒ +1 ms) — guard chung đòi updated_at đổi."""
    return f"max({t}, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), {t}))"
def STAMP_IN(t):
    """v2.3.3: dấu người ghi cho UPDATE nội bộ của trigger (ghi tiếp hệ quả của lần ghi ngoài — cùng app_actor()); bảo trì không có actor ⇒ giữ updated_by cũ."""
    return f"updated_by = COALESCE({ACTOR}, updated_by), updated_at = {TS_FRESH(t)}"
# v2.1.1 (security): "owner ký" = actor user CỦA ĐÚNG workspace của dòng đang ghi + thành viên đang hoạt động
# (workspace_members.removed_at IS NULL) với access_level owner/admin. Dùng chung: ledger recorded_by/approved_by + cổng duyệt AI.
def OWNER_ADMIN(x):
    return (f"EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id "
            f"WHERE sa.id = {x} AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' "
            f"AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))")

def _confirm_by_user(table):
    return _pair(f"{table}_confirm", table,
                 f"NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = {ACTOR}, 0) AND {OWNER_ADMIN(ACTOR)})",
                 f'{table}: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)',
                 ['confirmed_by', 'workspace_id'])

# v2.2 (CNS-032/037): một bảng mức phạt theo hạng — settings economy.penalty.* (mặc định = setting registry trong code)
PENALTY_DEFAULTS = {'self_reported_max_bp': 1000, 'concealment_min_bp': 5000, 'harness_bp': 10000}   # = setting registry trong code
PENALTY_PRESETS_DEFAULT = '[500,1000,2000,3000]'                       # economy.penalty.dissatisfaction_presets_bp (gợi ý, mảng)
PENALTY_KEYS = [f'economy.penalty.{k}' for k in PENALTY_DEFAULTS] + ['economy.penalty.dissatisfaction_presets_bp',
                                                                    'economy.penalty.self_confessed_harness_as_self_reported']
def SETTING_BOOL(k, d, ws='NEW.workspace_id'):
    """Setting kiểu bool (JSON true/false) → 1/0; thiếu → mặc định registry."""
    return (f"COALESCE((SELECT CASE value_json WHEN 'true' THEN 1 WHEN 'false' THEN 0 END FROM settings "
            f"WHERE workspace_id = {ws} AND key = '{k}' AND deleted_at IS NULL), {d})")
SELF_CONFESSED = "economy.penalty.self_confessed_harness_as_self_reported"   # v2.2.1 Q-R7b = true [CHỐT — Ryan duyệt 2026-10-15]
def PCT(k, ws='NEW.workspace_id'):
    """Mức (basis point) của một hạng, đọc settings; thiếu → mặc định registry (fail-safe, cùng số với seed)."""
    return (f"COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = {ws} "
            f"AND key = 'economy.penalty.{k}' AND deleted_at IS NULL), {PENALTY_DEFAULTS[k]})")
def PCT_TXT(bp_expr):
    """bp → chữ phần trăm in vào luật chơi: 1000 → '10', 250 → '2,5' (khớp fmt_pct ở compiler)."""
    return (f"(CASE WHEN ({bp_expr}) % 100 = 0 THEN CAST(({bp_expr}) / 100 AS TEXT) "
            f"ELSE replace(rtrim(rtrim(printf('%.2f', ({bp_expr}) / 100.0), '0'), '.'), '.', ',') END)")
def SETTING_INT(k, d, ws='NEW.workspace_id'):
    return (f"COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = {ws} "
            f"AND key = '{k}' AND deleted_at IS NULL), {d})")
# v2.2.5 (INT-20, Ryan 2026-10-15): AI Hệ thống chạy trên Core agent — MỘT loại CLI, là DỮ LIỆU (setting ST-0017), không hardcode.
# Thiếu hàng setting ⇒ fail-closed về mặc định registry (giống PCT). v2.2.8 (Q-I5 [CHỐT — Ryan 2026-10-16]: "mặc định là antigravity cli
# vì bản chất nó rất rẻ lại đa năng - nhiều model và cơ bản là dùng ko hết quota của nó"): mặc định = 'antigravity' (v2.2.5–v2.2.7: 'claude-code').
CORE_KEY = 'system.core_agent_engine'
CORE_DEFAULT = 'antigravity'
def CORE(ws='NEW.workspace_id'):
    """Loại Core agent hiệu lực của workspace (slug trong danh mục engines)."""
    return (f"COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = {ws} "
            f"AND key = '{CORE_KEY}' AND deleted_at IS NULL), '{CORE_DEFAULT}')")
def CORE_PROBE(p):
    """v2.2.9 (CONTRACT-r8b §A): probe {p} là lần kiểm của TÀI KHOẢN CORE AGENT = chạy trong container AI Hệ thống của chính workspace, và tài khoản
    đang có binding Hệ thống SỐNG (vá race: lần kiểm cũ của tài khoản đã gỡ bằng "Chọn loại khác" mà xong muộn thì không ghi mốc). MỘT định nghĩa —
    dùng ở trigger ghi mốc probe_runs_core_lock_ai/_au, lớp phụ của CORE_LOCKED và v_integrity.core_agent_lock_missing."""
    return (f"EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = {p}.container_id "
            f"AND lc.workspace_id = {p}.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = {p}.engine_account_id "
            f"AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)")
def CORE_LOGIN_OK_EVER(ws):
    """Tài khoản Core agent hiện tại đã TỪNG đạt một lần kiểm đăng nhập — lớp phụ của CORE_LOCKED khi mốc bị thiếu (trigger ghi mốc bị bỏ)."""
    return (f"EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = {ws} AND lk.trigger = 'login_check' AND lk.status = 'ok' "
            f"AND {CORE_PROBE('lk')})")
def CORE_LOCKED(ws):
    """v2.2.6 (CONTRACT-r6 A5) → v2.2.9 (CONTRACT-r8b §A, CNS-099): loại Core agent đã KHOÁ = có mốc workspaces.core_agent_locked_at (ghi một lần
    ở lần kiểm đăng nhập ĐẠT đầu tiên của tài khoản Core agent, không xoá được — vá lối lật consumer P3) HOẶC tài khoản Core agent đã từng kiểm
    đăng nhập đạt (lớp phụ). v2.2.6–v2.2.8 khoá từ lúc ghi binding (lớp phụ: đang/từng có binding) — đã bỏ: đăng nhập hỏng thì kẹt loại.
    MỘT định nghĩa "đã khoá" (ST-0017 chỉ đọc; không gỡ Core agent cuối cùng)."""
    return f"((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = {ws}) IS NOT NULL OR {CORE_LOGIN_OK_EVER(ws)})"
def SYS_BOUND_OTHER(ws, slug):
    """v2.2.9 (CONTRACT-r8b §A): workspace đang có binding Hệ thống SỐNG trỏ tài khoản KHÁC loại {slug} — trước mốc khoá, "Chọn loại khác" phải
    gỡ tài khoản + binding Core agent trước rồi mới đổi ST-0017 (giữ bất biến "mọi binding Hệ thống sống cùng loại Core agent" từ phía settings)."""
    return (f"EXISTS (SELECT 1 FROM engine_bindings sb JOIN engine_accounts sa ON sa.id = sb.engine_account_id WHERE sb.workspace_id = {ws} "
            f"AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL AND sa.engine_slug IS NOT {slug})")
def CONSENT_IDENTITY_CHANGED(a):
    """v2.2.9 (CONTRACT-r8b §C): đồng ý của {a} còn hợp lệ ở mọi điều kiện của CONSENT_OK TRỪ danh tính (consents.account_hint gắn danh tính khác)
    — = v_account_consent.consent_state 'identity_changed'."""
    return (f"(COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = {a}.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn "
            f"JOIN engines cne ON cne.slug = {a}.engine_slug WHERE cn.id = {a}.consent_id AND cn.workspace_id = {a}.workspace_id "
            f"AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = {a}.engine_slug AND cn.revoked_at IS NULL "
            f"AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT {a}.account_hint))")
def CORE_CALM(ws):
    """v2.2.9 (CONTRACT-r8b §B/§C): Core agent chưa sẵn sàng vì việc OWNER đang làm, không phải sự cố — theo đúng thứ tự lý do của
    v_core_agent_accounts.not_ready_reason: (binding Hệ thống sống, tài khoản chưa xoá, đúng loại, còn container AI Hệ thống) VÀ
    [đồng ý hết hiệu lực vì ĐỔI DANH TÍNH (consent_missing / identity_changed) HOẶC (đồng ý hợp lệ, binding bật, tài khoản active, login_status
    'in_progress' = relogin_in_progress)]. v2.2.10 (CONTRACT-r8c §A): 'in_progress' của tài khoản Core agent MỚI sau khi owner đổi loại (chưa từng kiểm
    đạt) = type_change_in_progress — cũng "êm", TRỪ khi lần kiểm của nó đã xong mà không đạt (view: login_check_failed / _partial ⇒ sự cố, Gen ghi chú 3
    vòng 8c); binding cũ đã tắt khác loại nên không khớp na.engine_slug = CORE. v2.2.11 (CONTRACT-r8d §E): 'in_progress' QUÁ 15 phút (LOGIN_STALLED) không
    còn "êm" ⇒ login_stalled là sự cố (cảnh báo + nút đổi loại hiện lại). v2.3.1 (CNS-137): CLI của loại Core agent chưa cài (ENGINE_INSTALLED sai) đứng
    TRƯỚC consent / đăng nhập trong thứ tự lý do. v2.3.2 (Gen quyết 2026-10-16): CLI ĐANG CÀI (ENGINE_INSTALLING — owner bấm "Cài lại CLI" / đang tải) ⇒ "êm"
    (không sự cố, như relogin_in_progress); chưa cài / cài lỗi / thiếu hàng ⇒ vẫn sự cố (kể cả lúc owner đổi loại sang CLI chưa cài)."""
    return (f"EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id "
            f"WHERE nb.workspace_id = {ws} AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL "
            f"AND na.engine_slug = {CORE(ws)} AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = {ws} AND nc.kind = 'system' "
            f"AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND ({ENGINE_INSTALLING(ws, 'na.engine_slug')} "
            f"OR ({ENGINE_INSTALLED(ws, 'na.engine_slug')} "
            f"AND ({CONSENT_IDENTITY_CHANGED('na')} OR ({CONSENT_OK('na')} "
            f"AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT ({TYPE_CHANGE_FAILED('na', ws)}) "
            f"AND NOT {LOGIN_STALLED('na')})))))")
# v2.2.11 (CONTRACT-r8d §E, CNS-123 — [ĐỀ XUẤT — Gen vòng 8d]): ĐỒNG HỒ = SQL function app_now() do app đăng ký ở MỌI kết nối (như app_maint(), §9.3;
# kết nối không đăng ký ⇒ "no such function", fail-closed) — production: giờ hệ thống UTC; test: đồng hồ giả. NOW_TS chuẩn hoá về ts 24 ký tự (§2.4).
LOGIN_STALL_MIN = 15
NOW_TS = "strftime('%Y-%m-%dT%H:%M:%fZ', app_now())"
def LOGIN_STALLED(a):
    """Tài khoản {a} ĐĂNG NHẬP BỎ DỞ: login_status 'in_progress' đã QUÁ LOGIN_STALL_MIN phút kể từ mốc login_started_at (DB tự ghi). Mốc NULL / đồng hồ
    hỏng ⇒ coi như bỏ dở (fail-closed: báo động thay vì treo im lặng). = nhánh 'login_stalled' của v_core_agent_accounts.not_ready_reason."""
    return (f"({a}.login_status = 'in_progress' AND COALESCE({a}.login_started_at >= "
            f"strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-{LOGIN_STALL_MIN} minutes'), 0) = 0)")
def TYPE_CHANGE_FAILED(a, ws):
    """v2.2.10 (CONTRACT-r8c §A): tài khoản {a} CHƯA từng kiểm đăng nhập đạt (trong container AI Hệ thống) mà đã có lần kiểm XONG (không đạt) trong container
    AI Hệ thống sống — = nhánh 'login_check_' || p.status của v_core_agent_accounts khi login_status 'in_progress' (tài khoản mới sau khi đổi loại hỏng
    đăng nhập ⇒ sự cố, không phải "đang đổi loại")."""
    return (f"NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = {ws} AND tqc.kind = 'system' "
            f"WHERE tq.engine_account_id = {a}.id AND tq.trigger = 'login_check' AND tq.status = 'ok') "
            f"AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = {ws} AND tfc.kind = 'system' "
            f"AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = {a}.id AND tf.trigger = 'login_check' AND tf.status <> 'running')")
def CORE_INCIDENT(ws):
    """v2.2.9 (CONTRACT-r8b §B): Core agent đang SỰ CỐ = đã khoá loại (mốc) + không sẵn sàng (CORE_READY) + không phải CORE_CALM
    — = v_core_agent_status.is_incident (test CORE-status-matrix so hai nơi ở mọi lý do)."""
    return (f"((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = {ws}) IS NOT NULL AND NOT EXISTS ({CORE_READY(ws)}) "
            f"AND NOT {CORE_CALM(ws)})")
def SYS_BOUND(ws):
    return f"EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = {ws} AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL)"
def LOGIN_CHECK_OK(acc, ws):
    """v2.2.6 (A4, CNS-071 P5): lần KIỂM ĐĂNG NHẬP MỚI NHẤT — probe_runs trigger='login_check' đã xong, chạy trong container AI Hệ thống
    đang sống của workspace; mới nhất = display_seq lớn nhất (không phụ thuộc đồng hồ) — có status 'ok'. Không lấy lần ok nào trong quá khứ."""
    return (f"(SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = {ws} "
            f"AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = {acc} AND lp.trigger = 'login_check' "
            f"AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok'")
def ENGINE_INSTALLED(ws, slug):
    """v2.3.1 (CNS-137, BUILD-PLAN §F.6 n): CLI loại {slug} ĐÃ CÀI trong workspace {ws} — hàng engine_installs sống, install_state = 'installed'.
    Thiếu hàng ⇒ chưa cài (fail-closed). = v_core_agent_accounts.engine_install_state = 'installed' (nhánh 'engine_not_installed' của not_ready_reason)."""
    return (f"EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = {ws} AND ei.engine_slug = {slug} AND ei.deleted_at IS NULL "
            f"AND ei.install_state = 'installed')")
def ENGINE_INSTALLING(ws, slug):
    """v2.3.2 (Gen quyết 2026-10-16): CLI loại {slug} ĐANG CÀI (owner bấm "Cài lại CLI", hoặc đang tải lúc cài) — hàng engine_installs sống, install_state
    'installing'. = v_core_agent_status.sub_reason 'installing' (engine_not_installed KHÔNG phải sự cố, như relogin_in_progress)."""
    return (f"EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = {ws} AND eg.engine_slug = {slug} AND eg.deleted_at IS NULL "
            f"AND eg.install_state = 'installing')")
def CORE_READY(ws):
    """Tài khoản Core agent SẴN SÀNG — MỘT định nghĩa (= v_core_agent_accounts.is_ready = mẫu số OB-04): binding hệ thống sống + bật,
    tài khoản active cùng loại Core agent, login_status = 'logged_in' (cache của lần kiểm mới nhất từ mọi nguồn: probe, hoặc lỗi 401/403
    lúc chạy) VÀ lần kiểm đăng nhập mới nhất (probe login_check trong container AI Hệ thống) = ok. Áp cho subscription lẫn API key (CNS-076).
    v2.2.8: + đồng ý điều khoản hợp lệ (CONSENT_OK, CONTRACT-r7 §A) + không hết quota + không có sự cố hãng đang mở (CONTRACT-r8 §C: bốn sự cố
    "đăng nhập hết hạn / outage / hết quota / bị khoá" đều làm Core agent mất sẵn sàng ⇒ chế độ khắc phục).
    v2.3.1 (CNS-137): + CLI của loại Core agent đã cài (ENGINE_INSTALLED) — image không chứa CLI của hãng; chưa cài / đang tải / cài lỗi ⇒ không sẵn sàng."""
    return (f"SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id "
            f"WHERE cb.workspace_id = {ws} AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 "
            f"AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = {CORE(ws)} AND ca.login_status = 'logged_in' "
            f"AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL "
            f"AND {ENGINE_INSTALLED('cb.workspace_id', 'ca.engine_slug')} "
            f"AND {LOGIN_CHECK_OK('ca.id', 'cb.workspace_id')} AND {CONSENT_OK('ca')}")
def CONSENT_OK(a):
    """v2.2.8 (CONTRACT-r7 §A, OB-05): tài khoản {a} dùng được về mặt điều khoản = engine không đòi consent, HOẶC consents_id trỏ một
    đồng ý engine_tos_risk CÙNG workspace, subject = engine của tài khoản, CHƯA rút, notice_version = engines.tos_notice_version hiện hành
    (đổi lời cảnh báo ⇒ phải đồng ý lại — "hết hạn"). Dùng chung cho trigger tài khoản, probe, CORE_READY và OB-05.
    v2.2.9 (CONTRACT-r8b §C, CNS-105): + CÙNG DANH TÍNH — consents.account_hint NULL (chưa gắn) hoặc = account_hint hiện tại của tài khoản; đăng nhập
    ra danh tính khác ⇒ đồng ý cũ hết hiệu lực (Core agent: consent_missing, lý do con identity_changed, không phải sự cố; Role: v_engine_accounts).
    View cùng định nghĩa: v_account_consent.consent_state."""
    return (f"(COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = {a}.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn "
            f"JOIN engines cne ON cne.slug = {a}.engine_slug WHERE cn.id = {a}.consent_id AND cn.workspace_id = {a}.workspace_id "
            f"AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = {a}.engine_slug AND cn.revoked_at IS NULL "
            f"AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS {a}.account_hint)))")
def CORE_LIVE(ws, extra=''):
    """v2.2.6 (A4): còn ≥1 binding Core agent SỐNG = binding hệ thống chưa xoá + bật, tài khoản chưa xoá + active + cùng loại Core agent."""
    return (f"EXISTS (SELECT 1 FROM engine_bindings xb JOIN engine_accounts xa ON xa.id = xb.engine_account_id AND xa.workspace_id = xb.workspace_id "
            f"WHERE xb.workspace_id = {ws} AND xb.consumer_kind = 'system' AND xb.deleted_at IS NULL AND xb.is_enabled = 1 "
            f"AND xa.deleted_at IS NULL AND xa.status = 'active' AND xa.engine_slug = {CORE(ws)} {extra})")
# v2.2.7 (CNS-092): chỉ engine core_capable = 1 VÀ adapter_status = 'ready' (v2.2.5–v2.2.6: mọi engine ready/beta — B1 ghi được antigravity)
CORE_VALID = ("json_type(NEW.value_json) = 'text' AND EXISTS (SELECT 1 FROM engines e WHERE e.slug = json_extract(NEW.value_json, '$') "
              "AND e.core_capable = 1 AND e.adapter_status = 'ready')")
MSG_CORE_VALID = ('phải là slug (chuỗi JSON) của một engine core_capable = 1, adapter_status = ready trong danh mục engines '
                  '(CNS-092, CONTRACT-r8 §C: antigravity — mặc định —, claude-code; openclaw core_capable nhưng coming_soon ở MVP)')
def CORE_IN_USE(slug):
    """v2.2.7: slug đang là loại Core agent HIỆU LỰC của ít nhất một workspace tenant (thiếu ST-0017 ⇒ mặc định antigravity, v2.2.8)."""
    return (f"EXISTS (SELECT 1 FROM workspaces cw WHERE cw.kind = 'tenant' AND COALESCE((SELECT json_extract(cs.value_json, '$') "
            f"FROM settings cs WHERE cs.workspace_id = cw.id AND cs.key = '{CORE_KEY}' AND cs.deleted_at IS NULL), '{CORE_DEFAULT}') = {slug})")
MSG_CORE_CAT = ('INT-20 (CNS-092): engine đang là Core agent của workspace — không hạ core_capable / adapter_status, không đổi slug, '
                'không xoá; đổi loại Core agent = migration có chủ đích (ADR-O)')
# v2.2.7 (CNS-093): container AI Hệ thống cuối cùng — không xoá mềm / xoá cứng / đổi kind / desired_state = absent khi còn binding Hệ thống sống
SYS_CT_LIVE = "{a}.kind = 'system' AND {a}.deleted_at IS NULL AND {a}.desired_state <> 'absent'"
MSG_CT_LAST = ('INT-20 (CNS-093): không xoá / đổi kind / đặt absent cho container AI Hệ thống cuối cùng khi workspace còn binding Hệ thống '
               'sống — dựng lại container = sửa tại chỗ (image, desired_state), không xoá hàng')
CORE_WRITER_I = (f"({OWNER_ADMIN(ACTOR)} OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() "
                 f"AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'))")
MSG_CORE = 'INT-20: tài khoản của AI Hệ thống phải cùng loại Core agent (setting system.core_agent_engine, thiếu thì mặc định antigravity)'
MSG_CORE_RO = ('INT-20 (A5, CONTRACT-r8b §A): system.core_agent_engine chỉ đọc kể từ lần kiểm đăng nhập đạt đầu tiên của tài khoản Core agent '
               '(workspaces.core_agent_locked_at) — ngoại lệ duy nhất (CONTRACT-r8c §A, Q-R8a): owner đổi sang loại khác khi Core agent đang sự cố '
               '(mode recovery, is_incident 1); không xoá / đổi khoá')
# v2.2.9 (CONTRACT-r8b §A): trước mốc khoá, đang gắn tài khoản Core agent ⇒ "Chọn loại khác" gỡ tài khoản + binding trước
MSG_CORE_BOUND = ('INT-20 (CONTRACT-r8b §A): chưa khoá loại Core agent nhưng đang gắn tài khoản Core agent — Chọn loại khác: gỡ tài khoản + binding '
                  'Core agent trước, rồi mới đổi system.core_agent_engine')
# v2.2.9 (CONTRACT-r8b §B/§C): cảnh báo owner (chuông + Telegram) chỉ khi là sự cố thật
MSG_INCIDENT = ('CONTRACT-r8b §B/§C: notifications core_agent_incident chỉ phát khi v_core_agent_status.is_incident = 1 — đang đăng nhập lại / '
                'đổi danh tính (chờ đồng ý lại) / chưa khoá loại không phải sự cố: không chuông, không Telegram')
MSG_READY = ('INT-20 (A4, CONTRACT-r8 §C): mọi Role mới chỉ tạo được khi tài khoản Core agent sẵn sàng — binding Hệ thống sống + bật, tài khoản '
             'active cùng loại, lần kiểm đăng nhập (login_check) mới nhất trong container AI Hệ thống đạt, có đồng ý điều khoản, không hết quota, '
             'không có sự cố hãng (OB-04 ok); Core agent sự cố ⇒ chế độ khắc phục')
MSG_LAST = ('INT-20 (A4): không gỡ / tắt / lật / vô hiệu tài khoản Core agent cuối cùng — workspace luôn còn binding Core agent sống; '
            'đổi tài khoản = đăng nhập lại trên CÙNG binding (CONTRACT-r8 §A, A5 › AI Hệ thống › Đổi tài khoản); áp từ mốc khoá (CONTRACT-r8b §A)')
# v2.2.8 (CONTRACT-r8 §A): một tài khoản cho mỗi loại CLI của mỗi consumer
def ONE_PER_ENGINE(b, slug):
    """Đã có binding SỐNG khác (chưa xoá mềm; tắt vẫn tính) của CÙNG consumer {b} trỏ tài khoản cùng loại CLI {slug}."""
    return (f"EXISTS (SELECT 1 FROM engine_bindings ob JOIN engine_accounts oa ON oa.id = ob.engine_account_id "
            f"WHERE ob.workspace_id = {b}.workspace_id AND ob.consumer_kind = {b}.consumer_kind AND ob.role_id IS {b}.role_id "
            f"AND ob.deleted_at IS NULL AND ob.id <> {b}.id AND oa.engine_slug = {slug})")
MSG_ONE = ('CONTRACT-r8 §A: mỗi consumer (Role hoặc AI Hệ thống) một tài khoản cho mỗi loại CLI — đổi tài khoản = đăng nhập lại trên binding '
           'đang có (thủ công, kèm audit); không thêm tài khoản thứ hai cùng loại')
# v2.2.8 (CONTRACT-r8 §C): AI Hệ thống chỉ chạy trên tài khoản Core agent SẴN SÀNG — không fallback dưới bất kỳ hình thức nào
SYS_AGENT_KINDS = "('interviewer', 'trainer', 'consolidator', 'judge')"
MSG_SA_READY = ('INT-20 (CONTRACT-r8 §C): phiên AI Hệ thống (Interviewer / Trainer / Consolidator / Judge) chỉ mở trên tài khoản Core agent SẴN SÀNG '
                'của workspace — không fallback sang tài khoản / loại CLI khác; Core agent sự cố ⇒ AI Hệ thống tạm dừng, việc xếp hàng chờ')
MSG_LOCK = ('INT-20 (A5): workspaces.core_agent_locked_at ghi một lần, không xoá/sửa — chỉ "khoá lại" sau khi owner đổi loại Core agent lúc sự cố '
            '(CONTRACT-r8c §A, Q-R8a): = lần kiểm đăng nhập đạt đầu tiên của tài khoản Core agent mới, muộn hơn mốc cũ')
# ---------------------------------------------------------------- v2.2.10 (CONTRACT-r8c §A — Q-R8a [CHỐT — Ryan 2026-10-16: "1,2,3 ok" (Q-R8a)])
# Khi Core agent đang SỰ CỐ (v_core_agent_status.mode = 'recovery' + is_incident = 1), OWNER tự tay đổi loại Core agent ngay trên màn chặn; hệ thống không
# tự đổi; lúc bình thường loại vẫn khoá. Cách làm [ĐỀ XUẤT — Gen vòng 8c]: một thao tác = (tick Clause 6 ⇒ CN- mới nếu đích đòi đồng ý) → UPDATE ST-0017
# (cổng ở settings_core_agent_i/_u) ⇒ binding Hệ thống cũ khác loại TẮT (settings_core_agent_type_change_ai/_au, không xoá; tài khoản cũ giữ) → tài khoản
# mới của loại đích (login_status 'in_progress') + binding Hệ thống mới → events/audit core_agent.type_changed. Đăng nhập xong ⇒ lần kiểm đạt đầu tiên của
# tài khoản mới "khoá lại" mốc (probe_runs_core_lock_ai/_au, workspaces_core_lock_u).
def OWNER_ONLY(x):
    """Actor user của đúng workspace NEW.workspace_id, thành viên đang hoạt động với access_level = 'owner' (KHÔNG gồm admin) — "chỉ owner" (CONTRACT-r8c §A)."""
    return (f"EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id "
            f"WHERE ow.id = {x} AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')")
def CONSENT_FRESH(ws, slug):
    """Loại đích {slug} không đòi đồng ý (requires_consent = 0; engine lạ ⇒ fail-closed: đòi), HOẶC có đồng ý MỚI = tick Clause 6 ngay trước khi đổi:
    engine_tos_risk cùng workspace, subject = đích, chưa rút, notice_version hiện hành, CHƯA gắn danh tính (account_hint NULL) và CHƯA tài khoản nào trỏ tới
    (đồng ý cũ của tài khoản khác / danh tính khác không dùng lại được) — "CN- mới nếu đích là Antigravity"."""
    return (f"(COALESCE((SELECT fe.requires_consent FROM engines fe WHERE fe.slug = {slug}), 1) = 0 OR EXISTS (SELECT 1 FROM consents fc "
            f"JOIN engines fce ON fce.slug = {slug} WHERE fc.workspace_id = {ws} AND fc.consent_kind = 'engine_tos_risk' AND fc.subject = {slug} "
            f"AND fc.revoked_at IS NULL AND fc.notice_version = fce.tos_notice_version AND fc.account_hint IS NULL "
            f"AND NOT EXISTS (SELECT 1 FROM engine_accounts fa WHERE fa.consent_id = fc.id)))")
def CORE_FIRST_OK_AT(ws):
    """finished_at của lần kiểm đăng nhập ĐẠT ĐẦU TIÊN (display_seq nhỏ nhất) của tài khoản Core agent HIỆN TẠI — binding Hệ thống sống + BẬT, tài khoản
    cùng loại ST-0017 — trong container AI Hệ thống của workspace. Mốc "khoá lại" sau khi đổi loại; một định nghĩa cho trigger ghi mốc và guard mốc."""
    return (f"(SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = {ws} AND fpc.kind = 'system' "
            f"JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = {ws} AND fpb.consumer_kind = 'system' "
            f"AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = {CORE(ws)} "
            f"WHERE fp.workspace_id = {ws} AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1)")
def TYPE_CHANGE_U():
    """UPDATE ST-0017 là một lần ĐỔI LOẠI KHI SỰ CỐ: cùng khoá + workspace, hàng sống, giá trị đổi sang loại KHÁC loại hiện tại, và Core agent đang sự cố
    (CORE_INCIDENT = v_core_agent_status mode 'recovery' + is_incident 1). Chỉ khi đó cổng owner / đồng ý mới được xét; còn lại = chỉ đọc như cũ."""
    return (f"(NEW.key = '{CORE_KEY}' AND OLD.key = '{CORE_KEY}' AND NEW.workspace_id IS OLD.workspace_id AND NEW.deleted_at IS NULL "
            f"AND OLD.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$') "
            f"AND {CORE_INCIDENT('OLD.workspace_id')})")
def TYPE_CHANGE_I():
    """INSERT ST-0017 (workspace chưa có hàng — hiệu lực = mặc định) là một lần đổi loại khi sự cố: giá trị khác loại hiệu lực + Core agent đang sự cố."""
    return (f"(NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT {CORE()} AND {CORE_INCIDENT('NEW.workspace_id')})")
def CONSENT_REUSE(ws, slug):
    """v2.2.11 (CONTRACT-r8d §B, CNS-119): ĐỔI VỀ loại đã có tài khoản AI Hệ thống (binding Hệ thống sống, thường đang tắt) = bật lại binding cũ — đồng ý cũ
    CỦA CHÍNH tài khoản đó còn hợp lệ (CONSENT_OK: chưa rút, version lời cảnh báo hiện hành, cùng danh tính) ⇒ không cần tick lại. Chỉ binding consumer
    'system'; tài khoản của Role / tài khoản chưa gắn không tính. Nhánh tạo tài khoản mới (loại đích chưa có tài khoản Hệ thống) vẫn đòi CONSENT_FRESH."""
    return (f"EXISTS (SELECT 1 FROM engine_bindings rb JOIN engine_accounts ra ON ra.id = rb.engine_account_id AND ra.workspace_id = rb.workspace_id "
            f"WHERE rb.workspace_id = {ws} AND rb.consumer_kind = 'system' AND rb.deleted_at IS NULL AND ra.deleted_at IS NULL "
            f"AND ra.engine_slug = {slug} AND {CONSENT_OK('ra')})")
def CORE_RECOVERY(ws):
    """v2.2.11 (CONTRACT-r8d §C): = v_core_agent_status.mode 'recovery' — đã khoá loại (mốc) mà Core agent KHÔNG sẵn sàng (sự cố, đang đăng nhập lại / đổi
    loại, đổi danh tính chờ đồng ý lại — mọi trạng thái chặn Admin)."""
    return f"((SELECT rw.core_agent_locked_at FROM workspaces rw WHERE rw.id = {ws}) IS NOT NULL AND NOT EXISTS ({CORE_READY(ws)}))"
def SA_VALID(ws, kind):
    """v2.2.11 (CONTRACT-r8d §A): tác tử hệ thống {kind} (= system_key) của workspace có selection_state = 'valid' (thiếu hàng ⇒ không — fail-closed)."""
    return (f"EXISTS (SELECT 1 FROM system_agents sv WHERE sv.workspace_id = {ws} AND sv.system_key = {kind} AND sv.deleted_at IS NULL "
            f"AND sv.selection_state = 'valid')")
# v2.2.11 (CONTRACT-r8d §A, CNS-117/118): registry MẶC ĐỊNH model / effort của 4 tác tử theo LOẠI Core agent — hằng số code (không phải bảng, không vào DDL).
# antigravity = seed §11.3 (v2.2.8); claude-code = seed DB v2.2.5–v2.2.7 (Core agent khi đó là Claude Code: sonnet/high, sonnet/medium, haiku/low, haiku/low).
# Áp sau khi đổi loại (và Onboarding bước 4): giá trị mặc định có trong registry vừa quét (capabilities kind model / effort của tài khoản Core agent) ⇒ dùng;
# không có (hoặc loại chưa có mặc định — openclaw) ⇒ mục đầu (ordinal nhỏ nhất) của danh sách đã quét. DB không kiểm lại model ∈ registry (bước ⑥).
SA_DEFAULTS = {
    'antigravity': {'interviewer': ('gemini-3.1-pro-high', 'high'), 'trainer': ('gemini-3.1-pro-low', 'low'),
                    'consolidator': ('gemini-3.8-flash-low', 'low'), 'judge': ('gemini-3.8-flash-medium', 'medium')},
    'claude-code': {'interviewer': ('sonnet', 'high'), 'trainer': ('sonnet', 'medium'),
                    'consolidator': ('haiku', 'low'), 'judge': ('haiku', 'low')},
}
MSG_TC_OWNER = ('CONTRACT-r8c §A (Q-R8a): đổi loại Core agent khi sự cố — chỉ owner (không gồm admin / tác tử / Role); hệ thống không tự đổi')
MSG_TC_CONSENT = ('CONTRACT-r8c §A (Q-R8a): loại đích đòi đồng ý điều khoản (Clause 6) — tick đồng ý MỚI trước khi đổi (CN- mới: chưa gắn danh tính, '
                  'chưa tài khoản nào dùng); CONTRACT-r8d §B: trừ khi đổi về tài khoản AI Hệ thống cũ của loại đích mà đồng ý của chính nó còn hợp lệ')
MSG_SA_VALID = ('CONTRACT-r8d §A (CNS-117): tác tử hệ thống chưa có model hợp lệ cho loại Core agent hiện tại — selection_state phải là valid (sau khi đổi '
                'loại = stale: áp model mặc định của loại mới hoặc chọn lại ở A5 › AI Hệ thống) rồi mới mở phiên')
MSG_CARD_RECOVERY = ('CONTRACT-r8d §C (CNS-120): Core agent đang ở chế độ khắc phục (mode recovery) — không cấp thẻ mới (thẻ vào issued / suspended từ '
                     'trạng thái khác, hoặc INSERT issued / suspended); Tạm ngưng / Tiếp tục thẻ đang có (issued ↔ suspended) vẫn được')
# v2.2.12 (CONTRACT-r8e §A — review bảo mật + CNS-129, [ĐỀ XUẤT — Gen vòng 8e]): thay MSG_AL_OWNER (v2.2.11, "không gỡ được mọi lúc") bằng BẤT BIẾN "mỗi bot
# Telegram còn sống luôn có ≥ 1 hàng chủ sở hữu active". AL_OWNER_ACTIVE = MỘT định nghĩa "hàng owner active" cho mọi trigger của bất biến.
AL_OWNER_ACTIVE = "{a}.is_owner = 1 AND {a}.status = 'active' AND {a}.deleted_at IS NULL"
MSG_AL_OWNER_LAST = ('CONTRACT-r8e §A (CNS-121, 129): bot Telegram còn sống phải luôn có ≥ 1 hàng chủ sở hữu active — không gỡ / hạ is_owner / xoá mềm hàng '
                     'chủ sở hữu cuối cùng (bot đã xoá mềm thì được); đổi tài khoản Telegram của owner = thêm hàng owner mới rồi gỡ hàng cũ')
MSG_AL_OWNER_ID = ('CONTRACT-r8e §A: hàng chủ sở hữu active không đổi tg_user_id / bot_id — đổi tài khoản Telegram của owner = thêm hàng owner mới, '
                   'xác minh, rồi gỡ hàng cũ')
MSG_AL_OWNER_DEL = 'CONTRACT-r8e §A: không xoá cứng hàng chủ sở hữu của allowlist Telegram — chỉ purge Role (ngữ cảnh bảo trì app_maint())'
MSG_TG_RESTORE = ('CONTRACT-r8e §A: khôi phục bot Telegram đã xoá mềm phải có hàng chủ sở hữu active trước (bất biến: bot còn sống luôn có ≥ 1 hàng '
                  'chủ sở hữu active)')
# v2.2.13 (review bảo mật v2.2.12, HIGH): bất biến "≥ 1 owner" bị lách bằng OWNER GIẢ — tạo / nâng / kích hoạt lại một hàng owner (không ràng buộc gì) rồi gỡ owner
# thật ("còn owner khác"). Một hàng chỉ TRỞ THÀNH owner active khi: (added_via = 'capture' — luồng bắt user ID đã xác minh) VÀ (actor là owner của workspace —
# OWNER_ONLY, không gồm admin / tác tử — HOẶC bot chưa có hàng owner active nào: bootstrap lần đầu); app_maint() = 1 được miễn.
MSG_AL_OWNER_NEW = ('v2.2.13 (review bảo mật, HIGH): hàng allowlist chỉ thành chủ sở hữu active khi owner của workspace thêm qua capture (user ID đã xác '
                    'minh), hoặc bot chưa có hàng chủ sở hữu active nào (bootstrap qua capture) — admin, tác tử, nhập tay không tạo được chủ sở hữu')
MSG_TG_RESTORE_OWNER = 'v2.2.13 (review bảo mật, HIGH): chỉ owner của workspace khôi phục được bot Telegram đã xoá mềm'
MSG_TC_EVENT = ('CONTRACT-r8c §A: events core_agent.type_changed — actor phải là owner và "to" = loại Core agent hiện hành (ghi sau khi đổi ST-0017)')
# v2.2.8 (CONTRACT-r8 §A): GỠ HẲN xoay tài khoản cùng hãng của v2.2.6 (setting engines.allow_same_vendor_rotation, consent
# tos.same_vendor_rotation, ST-0019, trigger settings_rotation_i/_u + consents_rotation_revoke_u, v_integrity.rotation_without_consent).
# Failover (events engine.failover): chỉ Role, chỉ sang LOẠI CLI khác (CONTRACT-r8 §B).
FO_FROM = "json_extract(NEW.detail_json, '$.from_account_id')"
FO_TO = "json_extract(NEW.detail_json, '$.to_account_id')"
MSG_FO_CORE = ('INT-20 (CONTRACT-r8 §C): Core agent không fallback — không đổi tài khoản, không đổi loại CLI; sự cố ⇒ chế độ khắc phục, '
               'owner xử lý (đăng nhập lại / đổi tài khoản thủ công)')
MSG_FO_TYPE = ('CONTRACT-r8 §B: fallback tự động chỉ sang LOẠI CLI khác của chính Role — cùng loại không có tài khoản thứ hai; '
               'đổi tài khoản = thủ công (đăng nhập lại)')
# v2.2.6 (CONTRACT-r6 B1.3): MỘT trần tệp đính kèm chat
ATT_KEY = 'chat.attachment_max_bytes'
ATT_DEFAULT = 26214400          # 25 MB (ST-0018)
ATT_MAX_ALLOWED = 104857600     # trần trên của chính setting (100 MB)
def _pen_val(k):
    return (f"(CASE WHEN NEW.key = 'economy.penalty.{k}' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) "
            f"WHEN NEW.key = 'economy.penalty.{k}' THEN {PENALTY_DEFAULTS[k]} "
            f"ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id "
            f"AND x.key = 'economy.penalty.{k}' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), {PENALTY_DEFAULTS[k]}) END)")
PEN_OK = (f"NEW.key IN ({', '.join(repr(k) for k in PENALTY_KEYS)}) "
          f"AND (NEW.deleted_at IS NOT NULL OR CASE WHEN NEW.key = 'economy.penalty.dissatisfaction_presets_bp' "
          f"THEN json_type(NEW.value_json) = 'array' AND json_array_length(NEW.value_json) BETWEEN 1 AND 8 "
          f"AND NOT EXISTS (SELECT 1 FROM json_each(NEW.value_json) j WHERE j.type <> 'integer' OR j.value NOT BETWEEN 1 AND 10000) "
          f"WHEN NEW.key = 'economy.penalty.self_confessed_harness_as_self_reported' THEN json_type(NEW.value_json) IN ('true', 'false') "
          f"ELSE json_type(NEW.value_json) = 'integer' END) "
          f"AND {_pen_val('self_reported_max_bp')} > 0 AND {_pen_val('self_reported_max_bp')} < {_pen_val('concealment_min_bp')} "
          f"AND {_pen_val('concealment_min_bp')} <= {_pen_val('harness_bp')} "
          f"AND {_pen_val('harness_bp')} = 10000")   # v2.2.1 (Gen, Ryan [CHỐT] "harness nặng nhất"): khoá 100 %, owner không hạ được
OWNER_USER = ("(SELECT m.user_id FROM workspace_members m WHERE m.workspace_id = NEW.workspace_id AND m.access_level = 'owner' "
              "AND m.removed_at IS NULL ORDER BY m.created_at, m.user_id LIMIT 1)")
# v2.2.1 (CNS-049, theo PRODUCT-SPEC): đề xuất của Role là DANH SÁCH CHO PHÉP — kỹ năng, tri thức, trí nhớ, quy trình vị trí,
# phong cách giao tiếp. Mọi thứ khác bị từ chối, kể cả tính cách lõi, giá trị, Nội quy, Gen truy cầu, luật chơi, kinh tế.
ROLE_ALLOW_IN = "('style', 'position')"          # IN: phong cách giao tiếp + quy trình vị trí (lớp 5)
ROLE_ALLOW_DN = "('style')"
def ROLE_PROPOSER(cs):
    return f"(SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = {cs}) IS 'role'"
MSG_033 = 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'
# v2.2 (CNS-038): phiên/probe chạy trong container của CHÍNH consumer có binding với tài khoản (baseline Role = container Role)
CONSUMER_CT = ("NEW.engine_account_id IS NOT NULL AND NEW.container_id IS NOT NULL AND NOT EXISTS (\n"
               "  SELECT 1 FROM engine_bindings b JOIN containers c ON c.id = NEW.container_id AND c.workspace_id = b.workspace_id\n"
               "  WHERE b.engine_account_id = NEW.engine_account_id AND b.deleted_at IS NULL\n"
               "    AND ((b.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = b.role_id) OR (b.consumer_kind = 'system' AND c.kind = 'system')))")
MSG_038 = 'Q-R1: phiên/probe phải chạy trong container của consumer có binding với tài khoản (baseline Role = container Role)'
REFLECT_WOUND = "json_extract(NEW.payload_json, '$.role_wound_id')"
REFLECT_PRIOR = (f"(SELECT count(*) FROM jobs j WHERE j.workspace_id = NEW.workspace_id AND j.kind = 'wound_reflection' "
                 f"AND json_extract(j.payload_json, '$.role_wound_id') = {REFLECT_WOUND})")

# v2.1.1 (security, tenant-isolation): FK mang credential phải cùng workspace với dòng trỏ tới nó
def _same_ws(table, col, parent):
    return _pair(f"{table}_{col}_ws", table,
                 f"NEW.{col} IS NOT NULL AND (SELECT workspace_id FROM {parent} WHERE id = NEW.{col}) IS NOT NEW.workspace_id",
                 f'tenant: {table}.{col} trỏ tới {parent} của workspace khác', [col, 'workspace_id'])

# v2.2.4 (CNS-058, phân xử Gen): khoan hồng "tự báo" CHỈ cho tự báo TỰ NGUYỆN — bản tự báo đứng TRƯỚC mọi audit phát hiện
# (actor system: gateway/judge…, action harness.violation | concealment.detected) về cùng việc. "Trước" = thứ tự chuỗi audit
# (display_seq: append-only + HMAC, không trùng mốc, không phụ thuộc đồng hồ); tasks.failure_reported_at là bản hiển thị của cùng mốc.
DETECT_ACTIONS = "('harness.violation', 'concealment.detected')"
def DETECTED_BEFORE_REPORT(task):
    return (f"EXISTS (SELECT 1 FROM audit_log d JOIN actors dx ON dx.id = d.actor_id "
            f"WHERE d.workspace_id = NEW.workspace_id AND d.entity_id = {task} AND dx.kind = 'system' AND d.action IN {DETECT_ACTIONS} "
            f"AND d.display_seq < (SELECT ra.display_seq FROM tasks rt JOIN audit_log ra ON ra.id = rt.failure_report_audit_id "
            f"WHERE rt.id = {task} AND ra.workspace_id = NEW.workspace_id))")

# v2.2.4 (phân xử Gen, vòng 2): máy (actor system) phát hiện TRƯỚC mọi tự báo ⇒ hạng phạt BẮT BUỘC theo loại phát hiện —
# harness.violation ⇒ harness_violation (100 %), concealment.detected ⇒ concealment (≥ sàn); owner không hạ hạng.
# Báo động nhầm ⇒ bút toán đảo (reversal) kèm lý do + audit, không bao giờ hạ hạng. Chưa có tự báo ⇒ mọi phát hiện đều "trước".
def MACHINE_DETECTED(task, action):
    return (f"EXISTS (SELECT 1 FROM audit_log d JOIN actors dx ON dx.id = d.actor_id "
            f"WHERE d.workspace_id = NEW.workspace_id AND d.entity_id = {task} AND dx.kind = 'system' AND d.action = '{action}' "
            f"AND d.display_seq < COALESCE((SELECT ra.display_seq FROM tasks rt JOIN audit_log ra ON ra.id = rt.failure_report_audit_id "
            f"WHERE rt.id = {task} AND ra.workspace_id = NEW.workspace_id), 9223372036854775807))")

# ================================================================ v2.3.0 (CONTRACT-r9 — Kho nhân vật MVP + 16 trạng thái avatar gắn sự kiện thật)
# [CHỐT — Ryan 2026-10-16: "ok kho làm ở mvp, xưởng để gđ2" (Q-I8)]: Kho vào MVP, Xưởng sang GĐ2. Mọi luật dưới đây là [ĐỀ XUẤT — Gen vòng 9].
# Bất biến "nhân vật đã tắt không được gán mới; Role đang dùng giữ nguyên" — lối vào (STD-11 1.8.0, checklist):
#  (1) INSERT avatars nguồn library trỏ nhân vật tắt ⇒ avatars_library_enabled_i (tài sản rút / xoá / khác workspace / chép sai: avatars_library_i có từ v2.2);
#  (2) UPDATE avatars (skin_asset_id / role_id / source…) ⇒ chặn sẵn bởi append-only avatars_no_update (chỉ cho skin_asset_id về NULL);
#  (3) UPDATE roles.avatar_id = "Khôi phục" AV cũ, hoặc trỏ AV tạo lúc nhân vật còn bật rồi mới tắt (hoán vị thời gian) ⇒ roles_avatar_u câu 2;
#  (4) trỏ roles.avatar_id sang AV của Role KHÁC / AV chưa tồn tại (FK hoãn) ⇒ roles_avatar_u câu 1; INSERT roles có sẵn avatar_id ⇒ roles_avatar_i;
#  (5) vòng đời cha: xoá mềm + khôi phục Role ⇒ KHÔNG chặn (Role giữ ảnh của chính nó — không phải gán mới; test thuận);
#  (6) bật lại / làm nhân vật "chọn được" bằng đường khác (UPDATE is_enabled, khôi phục hàng xoá mềm, bỏ rút, đổi mã / tham số, INSERT bản sao đang bật) ⇒
#      chỉ owner/admin: skin_assets_writer_u (mọi UPDATE) + skin_assets_writer_i (INSERT: owner/admin hoặc actor system lúc cài gói);
#  (7) REPLACE ⇒ guard chống REPLACE sinh tự động (skin_assets, avatars, roles); DELETE nhân vật đang là avatar hiện hành ⇒ skin_assets_in_use_d (v2.2).
SN_SELECTABLE = "{a}.deleted_at IS NULL AND {a}.status = 'active' AND {a}.is_enabled = 1"   # nhân vật CHỌN ĐƯỢC — một định nghĩa (= v_character_library.is_selectable)
MSG_SN_WRITER_I = ('Kho nhân vật (v2.3.0): chỉ owner/admin (hoặc actor system lúc cài gói khi tạo workspace) thêm nhân vật / cài gói skin')
MSG_SN_WRITER_U = ('Kho nhân vật (v2.3.0): chỉ owner/admin sửa danh mục nhân vật (bật / tắt, khôi phục, rút, đổi mã / tham số) — updated_by phải là owner/admin '
                   'đang hoạt động của workspace')
MSG_AV_DISABLED = 'Kho nhân vật (v2.3.0): nhân vật đã tắt trong Kho — không gán mới được; Role đang dùng giữ nguyên ảnh'
MSG_RL_AV_OWN = ('roles.avatar_id (v2.3.0): avatar hiện hành phải là bản ghi AV- của chính Role (gán = tạo AV- mới rồi trỏ; khôi phục = AV cũ của chính Role)')
MSG_RL_AV_SEL = ('Kho nhân vật (v2.3.0): không gán / khôi phục ảnh thư viện của nhân vật đã tắt trong Kho, đã rút hoặc đã gỡ gói — Role đang dùng giữ nguyên ảnh')
ROLE_AV_OWN = "NEW.avatar_id IS NOT NULL AND (SELECT oa.role_id FROM avatars oa WHERE oa.id = NEW.avatar_id) IS NOT NEW.id"
ROLE_AV_SEL = ("NEW.avatar_id IS NOT NULL AND EXISTS (SELECT 1 FROM avatars la WHERE la.id = NEW.avatar_id AND la.source = 'library' "
               f"AND NOT EXISTS (SELECT 1 FROM skin_assets ls WHERE ls.id = la.skin_asset_id AND {SN_SELECTABLE.format(a='ls')}))")   # cùng workspace: avatars_library_i
# §C/§D: ba setting avatar — mặc định ở registry code (không ghi sẵn; view đọc COALESCE mặc định), chỉ owner/admin ghi (actor system lúc dựng workspace)
AV_SETTINGS = {
    'avatar.transient_seconds': "json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 600",
    'avatar.idle_after_minutes': "json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 1440",
    'ui.avatar_motion': "json_extract(NEW.value_json, '$') IN ('full', 'subtle', 'off')"}      # số / mảng / object không bao giờ ra chuỗi trong danh sách
AV_KEYS = "(" + ", ".join(f"'{k}'" for k in AV_SETTINGS) + ")"
AV_VALID = ("COALESCE(CASE NEW.key " + " ".join(f"WHEN '{k}' THEN ({v})" for k, v in AV_SETTINGS.items())
            + " END, 0)")       # xoá mềm hàng hợp lệ vẫn hợp lệ (không có hàng cũ sai kiểu để miễn); khoá khác ⇒ NULL ⇒ 0
MSG_AV_SET = ('settings (v2.3.0): avatar.transient_seconds = số nguyên giây 1–600 (mặc định 20) · avatar.idle_after_minutes = số nguyên phút 1–1440 '
              '(mặc định 10) · ui.avatar_motion = "full" | "subtle" | "off" (mặc định "full") — chỉ owner/admin ghi')
V230_TRIGGERS = [
# (6) lối vào "nhân vật chọn được": INSERT — chỉ owner/admin hoặc actor system của chính workspace (cài gói lúc tạo workspace)
f"""CREATE TRIGGER skin_assets_writer_i BEFORE INSERT ON skin_assets
WHEN NOT {CORE_WRITER_I}
BEGIN SELECT RAISE(ABORT, '{MSG_SN_WRITER_I}'); END""",
# (6) mọi UPDATE của danh mục (bật / tắt, khôi phục, rút, đổi mã / tham số / license) — chỉ owner/admin (updated_by); bảo trì (rebuild) miễn
f"""CREATE TRIGGER skin_assets_writer_u BEFORE UPDATE ON skin_assets
WHEN app_maint() = 0 AND NOT {OWNER_ADMIN(ACTOR)}
BEGIN SELECT RAISE(ABORT, '{MSG_SN_WRITER_U}'); END""",
# (1) gán mới nhân vật đã tắt
f"""CREATE TRIGGER avatars_library_enabled_i BEFORE INSERT ON avatars
WHEN NEW.source = 'library' AND EXISTS (SELECT 1 FROM skin_assets s WHERE s.id = NEW.skin_asset_id AND s.is_enabled = 0)
BEGIN SELECT RAISE(ABORT, '{MSG_AV_DISABLED}'); END""",
# (4) INSERT roles có sẵn avatar_id: AV của Role mới không thể có trước hàng Role (avatars.role_id FK tức thời) ⇒ luôn chặn — gán sau INSERT
f"""CREATE TRIGGER roles_avatar_i BEFORE INSERT ON roles
WHEN {ROLE_AV_OWN}
BEGIN SELECT RAISE(ABORT, '{MSG_RL_AV_OWN}'); END""",
# (3)(4) đổi avatar hiện hành — chỉ khi GIÁ TRỊ đổi (Role đang dùng nhân vật vừa tắt vẫn UPDATE được mọi cột khác, kể cả ghi lại cùng avatar_id)
f"""CREATE TRIGGER roles_avatar_u BEFORE UPDATE OF avatar_id ON roles
WHEN NEW.avatar_id IS NOT NULL AND NEW.avatar_id IS NOT OLD.avatar_id
BEGIN
  SELECT RAISE(ABORT, '{MSG_RL_AV_OWN}') WHERE {ROLE_AV_OWN};
  SELECT RAISE(ABORT, '{MSG_RL_AV_SEL}') WHERE {ROLE_AV_SEL};
END""",
# §C/§D settings avatar: kiểu + khoảng + chỉ owner/admin. Lối vào: INSERT; UPDATE key / value_json / deleted_at / workspace_id (đổi khoá đi / về bị chặn)
f"""CREATE TRIGGER settings_avatar_i BEFORE INSERT ON settings
WHEN NEW.key IN {AV_KEYS} AND NOT ({AV_VALID} AND {CORE_WRITER_I})
BEGIN SELECT RAISE(ABORT, '{MSG_AV_SET}'); END""",
f"""CREATE TRIGGER settings_avatar_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key IN {AV_KEYS} OR OLD.key IN {AV_KEYS}) AND NOT (NEW.key IS OLD.key AND {AV_VALID} AND {OWNER_ADMIN(ACTOR)})
BEGIN SELECT RAISE(ABORT, '{MSG_AV_SET}'); END""",
]

# ================================================================ v2.3.1 (BUILD-PLAN §F.6 h, CNS-146 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN])
# Neo audit ngoài máy (§9.6) CHỈ qua git remote HTTPS + token lưu ở secrets (kind anchor_remote_token): isomorphic-git không có SSH (SSH chưa hỗ trợ ở MVP).
# Setting backup.remote_anchor = {"url": "https://…", "secret_id": "<ULID secret>"}. Luật lúc GHI (không phải bất biến vòng đời — secret đổi kind / bị xoá về
# sau thì lần push neo lỗi và UI báo; xoá mềm setting hỏng vẫn được):
#  (a) url bắt đầu 'https://' (http, ssh://, git@host:… bị chặn);  (b) url không có '@' (không nhét user:token vào URL — settings có audit before/after
#      và vào backup, token nằm trong URL là lộ bản rõ);  (c) secret_id trỏ secret CÙNG workspace, kind 'anchor_remote_token';
#  thiếu khoá / sai kiểu ⇒ COALESCE về 0 ⇒ chặn (CHECK không bao giờ NULL, §9.1; v2.3.2: mọi mệnh đề nằm TRONG EXISTS ⇒ luôn 0/1 theo cấu trúc). Lối vào: INSERT; UPDATE key / value_json / deleted_at / workspace_id;
#  đổi khoá đi / về bị chặn (như settings_avatar_*).
# v2.3.2 (review bảo mật HIGH trên v2.3.1: "không giới hạn người ghi" ⇒ ai ghi được settings đổi được URL neo sang host của kẻ tấn công và job audit_anchor đẩy token
#  tới đó — L-20261016-32; cổng [Gen quyết 2026-10-16: chỉ owner]): (w) CỔNG NGƯỜI GHI ở mọi lối — INSERT created_by / UPDATE (kể cả xoá mềm) updated_by phải là
#  OWNER còn là thành viên (OWNER_ONLY — admin cũng không) hoặc actor `system` của chính workspace (lúc dựng / khôi phục); DELETE cứng chỉ trong bảo trì
#  (settings_remote_anchor_d); (h) host của URL (phần giữa 'https://' và '/' đầu tiên — không có path hoặc host rỗng ⇒ host '' ⇒ không secret nào khớp vì
#  allowed_host dài ≥ 1; mutation v2.3.2 bắt mệnh đề "có path" riêng là thừa nên đã bỏ) TRÙNG secrets.allowed_host của secret (kind
#  anchor_remote_token suy ra từ CHECK của secrets) ⇒ đổi host = secret mới; (s) secret còn sống (deleted_at NULL) và status 'active' (đã thu hồi / đã
#  xoay ⇒ không làm token neo được). Thay (b) "không có @" của v2.3.1: '@' (user:token) làm host lệch ⇒ chặn ở (h).
#  Luật B2 (§9.1): tiền tố 'https://' đưa vào TRONG EXISTS ⇒ RA_VALID là EXISTS thuần — không bao giờ NULL theo cấu trúc; COALESCE(…, 0) cũ là thừa
#  (mutation v2.3.2 đổi về COALESCE(…, NULL) vẫn xanh: tiền tố chỉ NULL khi url NULL, lúc đó EXISTS = 0 ⇒ NULL AND 0 = 0) nên bỏ.
RA_KEY = 'backup.remote_anchor'
RA_URL = "json_extract(NEW.value_json, '$.url')"
RA_REST = f"substr({RA_URL}, 9)"                                          # sau 'https://'
# v2.3.3 (review bảo mật MEDIUM — parser-differential): (j) value_json DẠNG CHUẨN (= json(value_json): không khoảng trắng thừa) và đúng 2 khoá (json_each
#  đếm 2 — url + secret_id do các mệnh đề khác đòi có mặt ⇒ khoá trùng / khoá thừa / không phải object đều trượt; SQLite json_extract lấy khoá TRÙNG đầu
#  tiên còn JSON.parse lấy cái cuối ⇒ phải cấm trùng); (u) authority = phần sau 'https://' tới '/' đầu tiên HOẶC hết chuỗi (URL không path được) — TRÙNG
#  đúng secrets.allowed_host (đã qua CHECK cùng quy ước host[:cổng]) ⇒ chữ hoa, chấm cuối, cổng lệch, ':443', '\\', '?', '#', userinfo đều trượt; (c) cả URL
#  không chứa '@', '\\', '%', khoảng trắng, tab, CR, LF. App vẫn PHẢI kiểm lại host bằng chính URL parser của nó lúc push (Không tuyên bố).
RA_AUTH = f"substr({RA_REST}, 1, instr({RA_REST} || '/', '/') - 1)"
# v2.3.4 (review bảo mật MEDIUM — NUL): JSON '\\u0000' giải mã ra NUL; GLOB / length() của SQLite dừng ở NUL ⇒ phần sau NUL lọt kiểm tra, URL parser của app vẫn
#  đọc tiếp. Nay: (a) URL CHỈ ASCII, không NUL — so BYTE: length(CAST(url AS BLOB)) = length(url) (length() đếm tới NUL; ký tự nhiều byte ⇒ lệch); (b) mọi ký tự
#  thuộc allowlist [A-Za-z0-9._~:/-] (GLOB an toàn vì (a) đã loại NUL) — thay danh sách cấm @ \\ % khoảng trắng tab CR LF của v2.3.3; (c) value_json thô không
#  có escape \\u (sau khi đã bắt dạng chuẩn json()). instr(…, x'00') = 0 mà review nêu suy ra từ (a) nên không thêm thành mệnh đề riêng.
RA_ASCII = f"length(CAST({RA_URL} AS BLOB)) = length({RA_URL})"
RA_ALLOW = f"{RA_URL} NOT GLOB '*[^A-Za-z0-9._~:/-]*'"
RA_NO_UESC = "NEW.value_json NOT GLOB '*\\u*'"
RA_VALID = (f"EXISTS (SELECT 1 FROM secrets rs WHERE rs.id = json_extract(NEW.value_json, '$.secret_id') AND rs.workspace_id = NEW.workspace_id "
            f"AND rs.deleted_at IS NULL AND rs.status = 'active' "
            f"AND substr({RA_URL}, 1, 8) = 'https://' "
            f"AND rs.allowed_host = {RA_AUTH} "
            f"AND {RA_ASCII} "
            f"AND {RA_ALLOW} "
            f"AND {RA_NO_UESC} "
            f"AND NEW.value_json = json(NEW.value_json) "
            f"AND (SELECT count(*) FROM json_each(NEW.value_json)) = 2)")
def SYS_ACTOR(x):
    """v2.3.2: {x} là actor `system` (system_key 'system' — app / supervisor) của CHÍNH workspace NEW.workspace_id (tác tử hệ thống khác, actor workspace khác ⇒ không)."""
    return f"EXISTS (SELECT 1 FROM actors sy WHERE sy.id = {x} AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')"
MSG_RA = ('settings (v2.3.3): backup.remote_anchor = {"url":"https://<host[:cổng]>[/<path>]","secret_id":"<secret>"} dạng chuẩn, đúng 2 khoá — authority TRÙNG '
          'allowed_host của secret cùng workspace, còn sống, active; URL chỉ ASCII [A-Za-z0-9._~:/-] (không NUL, không escape \\u) — neo audit ngoài máy chỉ qua HTTPS + token gắn host; đổi '
          'host = nhập token mới; SSH chưa hỗ trợ ở MVP')
MSG_RA_WRITER = ('settings (v2.3.3): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace '
                 'được ghi / sửa / xoá mềm (người ghi = app_actor()); xoá cứng chỉ trong bảo trì')
MSG_RESTORED = ('workspaces.restored_at (v2.3.2): mốc khôi phục chỉ tiến và không ở tương lai — không xoá, không lùi, không vượt app_now() (danh sách "cần '
                'đăng nhập lại sau khôi phục" v_relogin_required không bị ẩn, cũng không kẹt mãi)')
SECRET_SENSITIVE = ['kind', 'label', 'ciphertext', 'nonce', 'wrapped_dek', 'dek_nonce', 'kek_id', 'alg', 'last4', 'fingerprint', 'status',
                    'rotated_from_id', 'allowed_host', 'workspace_id', 'deleted_at']          # không gồm last_used_at (cache), version, updated_*
MSG_SEC_WRITER = ('secrets (v2.3.3): chỉ owner / admin còn là thành viên hoặc actor system của workspace tạo / thay bí mật; kind anchor_remote_token (token gắn '
                  'đích) CHỈ OWNER; telegram_bot_token chỉ owner hoặc actor system — người ghi = app_actor(); bảo trì (xoay KEK) miễn')
MSG_SEC_HOST = 'secrets (v2.3.2): allowed_host ghi một lần — đổi host đích = nhập token mới (secret mới)'
MSG_EI_WRITER = ('engine_installs (v2.3.2): trạng thái cài CLI chỉ actor system của workspace (app theo ga-engine-install status) ghi — owner / admin / tác tử '
                 'khác không ghi tay (v2.3.3: người ghi = app_actor())')
V231_TRIGGERS = [
# §B.9 (CNS-145): mốc khôi phục — lối vào: UPDATE restored_at (về NULL / lùi bị chặn; v2.3.2: + không ở tương lai), INSERT workspace mang sẵn mốc tương lai (v2.3.2).
# workspaces KHÔNG có cột người ghi ⇒ không kiểm actor được (Không tuyên bố, DATABASE v2.3.2).
f"""CREATE TRIGGER workspaces_restored_u BEFORE UPDATE OF restored_at ON workspaces
WHEN (OLD.restored_at IS NOT NULL AND (NEW.restored_at IS NULL OR NEW.restored_at < OLD.restored_at)) OR NEW.restored_at > {NOW_TS}
BEGIN SELECT RAISE(ABORT, '{MSG_RESTORED}'); END""",
f"""CREATE TRIGGER workspaces_restored_i BEFORE INSERT ON workspaces
WHEN NEW.restored_at > {NOW_TS}
BEGIN SELECT RAISE(ABORT, '{MSG_RESTORED}'); END""",
f"""CREATE TRIGGER settings_remote_anchor_i BEFORE INSERT ON settings
WHEN NEW.key = '{RA_KEY}'
BEGIN
  SELECT RAISE(ABORT, '{MSG_RA_WRITER}') WHERE NOT ({OWNER_ONLY(ACTOR)} OR {SYS_ACTOR(ACTOR)});
  SELECT RAISE(ABORT, '{MSG_RA}') WHERE NOT {RA_VALID};
END""",
f"""CREATE TRIGGER settings_remote_anchor_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN NEW.key = '{RA_KEY}' OR OLD.key = '{RA_KEY}'
BEGIN
  SELECT RAISE(ABORT, '{MSG_RA_WRITER}') WHERE NOT ({OWNER_ONLY(ACTOR)} OR {SYS_ACTOR(ACTOR)});
  SELECT RAISE(ABORT, '{MSG_RA}') WHERE NOT (NEW.key IS OLD.key AND (NEW.deleted_at IS NOT NULL OR {RA_VALID}));
END""",
f"""CREATE TRIGGER settings_remote_anchor_d BEFORE DELETE ON settings
WHEN OLD.key = '{RA_KEY}' AND app_maint() = 0
BEGIN SELECT RAISE(ABORT, '{MSG_RA_WRITER}'); END""",
# v2.3.2 (L-20261016-32): bí mật — cổng người ghi ở INSERT + UPDATE cột nhạy cảm; anchor_remote_token chỉ owner; host ghi một lần. Đổi kind ra / vào
# anchor_remote_token luôn đổi allowed_host (CHECK kind ⇔ host) ⇒ secrets_allowed_host_u chặn — nên _u chỉ xét NEW.kind (mutation: OLD.kind thừa).
f"""CREATE TRIGGER secrets_writer_i BEFORE INSERT ON secrets
WHEN NOT (CASE WHEN NEW.kind = 'anchor_remote_token' THEN {OWNER_ONLY(ACTOR)}
               WHEN NEW.kind = 'telegram_bot_token' THEN ({OWNER_ONLY(ACTOR)} OR {SYS_ACTOR(ACTOR)})
               ELSE ({OWNER_ADMIN(ACTOR)} OR {SYS_ACTOR(ACTOR)}) END)
BEGIN SELECT RAISE(ABORT, '{MSG_SEC_WRITER}'); END""",
f"""CREATE TRIGGER secrets_writer_u BEFORE UPDATE OF {', '.join(SECRET_SENSITIVE)} ON secrets
WHEN app_maint() = 0 AND NOT (CASE WHEN NEW.kind = 'anchor_remote_token' THEN {OWNER_ONLY(ACTOR)}
                                   WHEN NEW.kind = 'telegram_bot_token' THEN ({OWNER_ONLY(ACTOR)} OR {SYS_ACTOR(ACTOR)})
                                   ELSE ({OWNER_ADMIN(ACTOR)} OR {SYS_ACTOR(ACTOR)}) END)
BEGIN SELECT RAISE(ABORT, '{MSG_SEC_WRITER}'); END""",
f"""CREATE TRIGGER secrets_allowed_host_u BEFORE UPDATE OF allowed_host ON secrets
WHEN NEW.allowed_host IS NOT OLD.allowed_host
BEGIN SELECT RAISE(ABORT, '{MSG_SEC_HOST}'); END""",
# v2.3.2 (Gen, rà v2.3.1): trạng thái cài CLI — chỉ actor system của workspace ghi (mọi INSERT / UPDATE, kể cả xoá mềm). DELETE cứng không chặn: xoá = "chưa cài"
# (fail-closed, Core agent mất sẵn sàng — không mở được gì).
f"""CREATE TRIGGER engine_installs_writer_i BEFORE INSERT ON engine_installs
WHEN NOT {SYS_ACTOR(ACTOR)}
BEGIN SELECT RAISE(ABORT, '{MSG_EI_WRITER}'); END""",
f"""CREATE TRIGGER engine_installs_writer_u BEFORE UPDATE ON engine_installs
WHEN NOT {SYS_ACTOR(ACTOR)}
BEGIN SELECT RAISE(ABORT, '{MSG_EI_WRITER}'); END""",
]

# v2.3.3: dấu thời gian mới cho UPDATE nội bộ của settings_core_agent_type_change_* / _sa_stale_* (luôn > updated_at cũ của hàng đích)
TS_FRESH_U = TS_FRESH(f"COALESCE(NEW.updated_at, {TS_DEFAULT})")
TS_FRESH_I = TS_FRESH("COALESCE(NEW.updated_at, NEW.created_at)")
# ================================================================ v2.3.3 (Gen quyết 2026-10-16: trả nợ cổng người ghi của 4 bảng giữ / định tuyến credential —
# L-20261016-32; WRITER-meta không còn miễn trừ cấp bảng). Người ghi = app_actor(). Ba nhóm cột mỗi bảng:
#  cấu hình (người ghi theo bảng)  ·  cột chỉ actor system ghi (kết quả runtime / nguồn gốc hệ thống)  ·  cột DB tự ghi / siêu dữ liệu (WRITER-meta khai miễn).
# INSERT bởi người KHÔNG phải actor system ⇒ cột chỉ-system phải ở giá trị mặc định (không "tạo sẵn" trạng thái runtime). UPDATE: cổng theo nhóm cột (UPDATE OF);
# bảo trì (app_maint() = 1) miễn ở UPDATE như secrets. DELETE cứng không gác: bớt tài khoản / binding / bot / tool = bớt khả năng (fail-closed) — Không tuyên bố.
# workspace_id KHÔNG nằm trong danh sách: {t}_ident đã làm nó bất biến ngoài bảo trì (guard đó giữ thông điệp riêng) — WRITER-meta kiểm bằng máy.
EN_CONFIG = ['engine_slug', 'label', 'auth_method', 'secret_id', 'auth_volume', 'cli_version_pinned', 'consent_id', 'status', 'deleted_at']
EN_SYS = ['account_hint', 'plan_label', 'plan_confidence', 'login_checked_at', 'cli_version_current', 'cli_version_latest', 'quota_remaining_pct',
          'quota_reset_at', 'quota_scanned_at', 'outage_since', 'last_probe_run_id', 'runtime_overhead_tokens', 'overhead_bare_session_id',
          'overhead_shell_session_id', 'overhead_measured_at', 'quota_state']
EN_SYS_NULL = [c for c in EN_SYS if c != 'quota_state']
EB_CONFIG = ['consumer_kind', 'role_id', 'engine_account_id', 'priority', 'model_key', 'effort', 'is_enabled', 'deleted_at']
EB_SYS = ['selection_state', 'selection_checked_at']
TG_CONFIG = ['role_id', 'bot_username', 'secret_id', 'token_last4', 'deleted_at']
TG_SYS = ['bot_tg_id', 'getme_ok_at', 'poll_offset', 'last_update_at', 'error']
TG_OWNER_STATUS = "('pending', 'paused', 'revoked')"
TL_CONFIG = ['slug', 'name', 'kind', 'description', 'risk_level', 'default_mode', 'allowed_agents', 'config_json', 'secret_id', 'status',
             'deleted_at']
TL_SYS = ['is_builtin', 'builtin_key', 'definition_tokens', 'tokenizer']
OA_SYS = f"({OWNER_ADMIN(ACTOR)} OR {SYS_ACTOR(ACTOR)})"
OO_SYS = f"({OWNER_ONLY(ACTOR)} OR {SYS_ACTOR(ACTOR)})"
def MSG_CW(t, who):
    return f"{t} (v2.3.3): giữ / định tuyến credential — chỉ {who} được tạo / sửa cấu hình (người ghi = app_actor())"
def MSG_CS(t, what):
    return f"{t} (v2.3.3): {what} chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định"
EN_SYS_DIRTY = ("(COALESCE(" + ", ".join(f"NEW.{c}" for c in EN_SYS_NULL) + ") IS NOT NULL OR NEW.quota_state <> 'unknown' "
                "OR NEW.login_status NOT IN ('unknown', 'in_progress'))")
EB_SYS_DIRTY = "(NEW.selection_state <> 'unknown' OR NEW.selection_checked_at IS NOT NULL)"
TG_SYS_DIRTY = ("(COALESCE(NEW.bot_tg_id, NEW.getme_ok_at, NEW.last_update_at, NEW.error) IS NOT NULL OR NEW.poll_offset <> 0 "
                "OR NEW.status <> 'pending')")
TL_SYS_DIRTY = "(NEW.is_builtin <> 0 OR COALESCE(NEW.builtin_key, NEW.tokenizer) IS NOT NULL OR NEW.definition_tokens <> 0)"
MSG_EN_LOGIN = ('engine_accounts (v2.3.3): login_status là kết quả kiểm đăng nhập — chỉ actor system ghi; owner / admin chỉ được đặt in_progress (bấm '
                '"Đổi tài khoản / Đăng nhập lại")')
MSG_TG_STATUS = ('telegram_bots (v2.3.3): status active / error là kết quả runtime (getMe, long-poll) — chỉ actor system ghi; owner chỉ đặt pending / paused / '
                 'revoked')
MSG_CS_PROPOSER = 'change_sets (v2.3.3): proposed_by phải = app_actor() — người đề xuất là người ghi change set (Role qua gateway, tác tử hệ thống, owner)'
V233_TRIGGERS = [
# ---- engine_accounts: owner / admin / system; cột kiểm đăng nhập, quota, overhead, sự cố hãng chỉ system; login_status: owner / admin chỉ đặt in_progress
f"""CREATE TRIGGER engine_accounts_writer_i BEFORE INSERT ON engine_accounts
BEGIN
  SELECT RAISE(ABORT, '{MSG_CW('engine_accounts', 'owner / admin còn là thành viên hoặc actor system')}') WHERE NOT {OA_SYS};
  SELECT RAISE(ABORT, '{MSG_CS('engine_accounts', 'trạng thái kiểm đăng nhập / quota / overhead / sự cố hãng')}') WHERE NOT {SYS_ACTOR(ACTOR)} AND {EN_SYS_DIRTY};
END""",
f"""CREATE TRIGGER engine_accounts_writer_u BEFORE UPDATE OF {', '.join(EN_CONFIG)} ON engine_accounts
WHEN app_maint() = 0 AND NOT {OA_SYS}
BEGIN SELECT RAISE(ABORT, '{MSG_CW('engine_accounts', 'owner / admin còn là thành viên hoặc actor system')}'); END""",
f"""CREATE TRIGGER engine_accounts_sys_u BEFORE UPDATE OF {', '.join(EN_SYS)} ON engine_accounts
WHEN app_maint() = 0 AND NOT {SYS_ACTOR(ACTOR)}
BEGIN SELECT RAISE(ABORT, '{MSG_CS('engine_accounts', 'trạng thái kiểm đăng nhập / quota / overhead / sự cố hãng')}'); END""",
f"""CREATE TRIGGER engine_accounts_login_status_u BEFORE UPDATE OF login_status ON engine_accounts
WHEN app_maint() = 0 AND NOT {SYS_ACTOR(ACTOR)} AND NOT (NEW.login_status = 'in_progress' AND {OWNER_ADMIN(ACTOR)})
BEGIN SELECT RAISE(ABORT, '{MSG_EN_LOGIN}'); END""",
# ---- engine_bindings: owner / admin / system; kết quả kiểm model (selection_*) chỉ system
f"""CREATE TRIGGER engine_bindings_writer_i BEFORE INSERT ON engine_bindings
BEGIN
  SELECT RAISE(ABORT, '{MSG_CW('engine_bindings', 'owner / admin còn là thành viên hoặc actor system')}') WHERE NOT {OA_SYS};
  SELECT RAISE(ABORT, '{MSG_CS('engine_bindings', 'kết quả kiểm model (selection_state / selection_checked_at)')}') WHERE NOT {SYS_ACTOR(ACTOR)} AND {EB_SYS_DIRTY};
END""",
f"""CREATE TRIGGER engine_bindings_writer_u BEFORE UPDATE OF {', '.join(EB_CONFIG)} ON engine_bindings
WHEN app_maint() = 0 AND NOT {OA_SYS}
BEGIN SELECT RAISE(ABORT, '{MSG_CW('engine_bindings', 'owner / admin còn là thành viên hoặc actor system')}'); END""",
f"""CREATE TRIGGER engine_bindings_sys_u BEFORE UPDATE OF {', '.join(EB_SYS)} ON engine_bindings
WHEN app_maint() = 0 AND NOT {SYS_ACTOR(ACTOR)}
BEGIN SELECT RAISE(ABORT, '{MSG_CS('engine_bindings', 'kết quả kiểm model (selection_state / selection_checked_at)')}'); END""",
# ---- telegram_bots: CHỈ owner (token bot là credential) hoặc actor system lúc dựng / khôi phục; cột getMe / long-poll chỉ system; status: owner chỉ pending / paused / revoked
f"""CREATE TRIGGER telegram_bots_writer_i BEFORE INSERT ON telegram_bots
BEGIN
  SELECT RAISE(ABORT, '{MSG_CW('telegram_bots', 'owner còn là thành viên (admin cũng không) hoặc actor system')}') WHERE NOT {OO_SYS};
  SELECT RAISE(ABORT, '{MSG_CS('telegram_bots', 'kết quả getMe / long-poll (bot_tg_id, getme_ok_at, poll_offset, last_update_at, error, status ≠ pending)')}') WHERE NOT {SYS_ACTOR(ACTOR)} AND {TG_SYS_DIRTY};
END""",
f"""CREATE TRIGGER telegram_bots_writer_u BEFORE UPDATE OF {', '.join(TG_CONFIG)} ON telegram_bots
WHEN app_maint() = 0 AND NOT {OO_SYS}
BEGIN SELECT RAISE(ABORT, '{MSG_CW('telegram_bots', 'owner còn là thành viên (admin cũng không) hoặc actor system')}'); END""",
f"""CREATE TRIGGER telegram_bots_sys_u BEFORE UPDATE OF {', '.join(TG_SYS)} ON telegram_bots
WHEN app_maint() = 0 AND NOT {SYS_ACTOR(ACTOR)}
BEGIN SELECT RAISE(ABORT, '{MSG_CS('telegram_bots', 'kết quả getMe / long-poll (bot_tg_id, getme_ok_at, poll_offset, last_update_at, error)')}'); END""",
f"""CREATE TRIGGER telegram_bots_status_u BEFORE UPDATE OF status ON telegram_bots
WHEN app_maint() = 0 AND NOT {SYS_ACTOR(ACTOR)} AND NOT (NEW.status IN {TG_OWNER_STATUS} AND {OWNER_ONLY(ACTOR)})
BEGIN SELECT RAISE(ABORT, '{MSG_TG_STATUS}'); END""",
# ---- tools: owner / admin / system; số token định nghĩa + nguồn gốc built-in chỉ system (built-in không cộng overhead — §7.5)
f"""CREATE TRIGGER tools_writer_i BEFORE INSERT ON tools
BEGIN
  SELECT RAISE(ABORT, '{MSG_CW('tools', 'owner / admin còn là thành viên hoặc actor system')}') WHERE NOT {OA_SYS};
  SELECT RAISE(ABORT, '{MSG_CS('tools', 'nguồn gốc built-in và số token định nghĩa (is_builtin, builtin_key, definition_tokens, tokenizer)')}') WHERE NOT {SYS_ACTOR(ACTOR)} AND {TL_SYS_DIRTY};
END""",
f"""CREATE TRIGGER tools_writer_u BEFORE UPDATE OF {', '.join(TL_CONFIG)} ON tools
WHEN app_maint() = 0 AND NOT {OA_SYS}
BEGIN SELECT RAISE(ABORT, '{MSG_CW('tools', 'owner / admin còn là thành viên hoặc actor system')}'); END""",
f"""CREATE TRIGGER tools_sys_u BEFORE UPDATE OF {', '.join(TL_SYS)} ON tools
WHEN app_maint() = 0 AND NOT {SYS_ACTOR(ACTOR)}
BEGIN SELECT RAISE(ABORT, '{MSG_CS('tools', 'nguồn gốc built-in và số token định nghĩa (is_builtin, builtin_key, definition_tokens, tokenizer)')}'); END""",
# ---- change_sets.proposed_by: phạm vi đề xuất của Role / đối chiếu Polaris tra người đề xuất ⇒ buộc = app_actor() (cột người khác được trigger tra)
f"""CREATE TRIGGER change_sets_proposer_i BEFORE INSERT ON change_sets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.proposed_by = {ACTOR}, 0)
BEGIN SELECT RAISE(ABORT, '{MSG_CS_PROPOSER}'); END""",
f"""CREATE TRIGGER change_sets_proposer_u BEFORE UPDATE OF proposed_by ON change_sets
WHEN app_maint() = 0 AND NEW.proposed_by IS NOT OLD.proposed_by AND NOT COALESCE(NEW.proposed_by = {ACTOR}, 0)
BEGIN SELECT RAISE(ABORT, '{MSG_CS_PROPOSER}'); END""",
]


BUSINESS_TRIGGERS = [
# ---------------------------------------------------------------- ví (§9.4) — so sánh bằng IS NOT; thứ tự theo display_seq
f"""CREATE TRIGGER ledger_entries_bi BEFORE INSERT ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger: debit_balance_after sai')
   WHERE NEW.debit_balance_after IS NOT (SELECT balance_minor FROM wallets WHERE id = NEW.debit_wallet_id) - NEW.amount_minor;
  SELECT RAISE(ABORT, 'ledger: credit_balance_after sai')
   WHERE NEW.credit_balance_after IS NOT (SELECT balance_minor FROM wallets WHERE id = NEW.credit_wallet_id) + NEW.amount_minor;
  SELECT RAISE(ABORT, 'ledger: ví không cho âm (sàn ví Role = 0)')
   WHERE NEW.debit_balance_after < 0 AND (SELECT allow_negative FROM wallets WHERE id = NEW.debit_wallet_id) IS NOT 1;
  SELECT RAISE(ABORT, 'ledger: ví khác tenant hoặc không active')
   WHERE (SELECT count(*) FROM wallets WHERE id IN (NEW.debit_wallet_id, NEW.credit_wallet_id)
          AND status = 'active' AND workspace_id = NEW.workspace_id) <> 2;
  SELECT RAISE(ABORT, 'ledger: display_seq phải tăng')
   WHERE NEW.display_seq <= COALESCE((SELECT max(display_seq) FROM ledger_entries WHERE workspace_id = NEW.workspace_id), 0);
  SELECT RAISE(ABORT, 'ledger: phạt chỉ trừ ví Role')
   WHERE NEW.entry_type = 'penalty' AND (SELECT owner_kind FROM wallets WHERE id = NEW.debit_wallet_id) IS NOT 'role';
  SELECT RAISE(ABORT, 'ledger: căn cứ phạt % phải = số dư hiện tại')
   WHERE NEW.penalty_rate_bp IS NOT NULL
     AND NEW.basis_balance_minor IS NOT (SELECT balance_minor FROM wallets WHERE id = NEW.debit_wallet_id);
  -- v2.2 (CNS-032, Q-R7): trung thực rẻ hơn che giấu — mức theo hạng, số từ settings economy.penalty.*
  SELECT RAISE(ABORT, 'ledger: hạng self_reported chỉ cho việc Role tự báo thất bại (tasks.failure_disclosure từ report_task)')
   WHERE NEW.penalty_class = 'self_reported'
     AND (SELECT failure_disclosure FROM tasks WHERE id = NEW.task_id AND workspace_id = NEW.workspace_id) IS NOT 'self_reported';
  -- v2.2.4 (CNS-058): bị máy bắt TRƯỚC rồi mới report_task ⇒ không có khoan hồng: dùng harness_violation / concealment
  SELECT RAISE(ABORT, 'ledger: Role tự báo SAU khi máy phát hiện — không được hạng self_reported (CNS-058); dùng harness_violation / concealment')
   WHERE NEW.penalty_class = 'self_reported' AND {DETECTED_BEFORE_REPORT('NEW.task_id')};
  -- v2.2.1 (CNS-043): bằng chứng là audit về một việc ⇒ task_id phải gắn đúng việc đó (đóng đường "task_id NULL + audit tự báo")
  SELECT RAISE(ABORT, 'ledger: bằng chứng trỏ một việc — phạt phải gắn task_id đúng việc đó')
   WHERE NEW.entry_type = 'penalty' AND NEW.task_id IS NOT (SELECT a.entity_id FROM audit_log a JOIN tasks t ON t.id = a.entity_id
         WHERE a.id = NEW.evidence_audit_id AND a.workspace_id = NEW.workspace_id)
     AND EXISTS (SELECT 1 FROM audit_log a JOIN tasks t ON t.id = a.entity_id WHERE a.id = NEW.evidence_audit_id AND a.workspace_id = NEW.workspace_id);
  -- v2.2.1 (CNS-043, Q-R7b [CHỐT 2026-10-15]): việc đã tự báo, hoặc bằng chứng là chính bản tự báo ⇒ MỌI phạt là self_reported (trần, không về 0);
  -- vi phạm harness tự khai (TRƯỚC khi bị phát hiện — v2.2.4) cũng vậy khi economy.penalty.self_confessed_harness_as_self_reported = true
  SELECT RAISE(ABORT, 'ledger: việc Role đã tự báo (hoặc bằng chứng là bản tự báo) chỉ phạt hạng self_reported — mọi đường bằng chứng')
   WHERE NEW.entry_type = 'penalty' AND NEW.penalty_class IS NOT 'self_reported'
     AND ((SELECT failure_disclosure FROM tasks WHERE id = NEW.task_id) IS 'self_reported'
          OR (SELECT action FROM audit_log WHERE id = NEW.evidence_audit_id AND workspace_id = NEW.workspace_id) IS 'task.report_failure')
     AND NOT {DETECTED_BEFORE_REPORT('NEW.task_id')}                -- v2.2.4 (CNS-058): chỉ tự báo TRƯỚC phát hiện mới được khoan hồng
     AND NOT (NEW.penalty_class = 'harness_violation' AND {SETTING_BOOL(SELF_CONFESSED, 1)} = 0);
  -- v2.2.4 (Gen, vòng 2): máy phát hiện TRƯỚC mọi tự báo ⇒ hạng BẮT BUỘC theo loại phát hiện; báo động nhầm ⇒ reversal, không hạ hạng
  SELECT RAISE(ABORT, 'ledger: máy đã phát hiện vi phạm harness trên việc này (trước mọi tự báo) — phạt PHẢI là harness_violation 100 %; báo động nhầm thì dùng bút toán đảo (reversal) kèm audit, không hạ hạng')
   WHERE NEW.entry_type = 'penalty' AND NEW.task_id IS NOT NULL AND NEW.penalty_class IS NOT 'harness_violation'
     AND {MACHINE_DETECTED('NEW.task_id', 'harness.violation')}
     AND NOT (NEW.penalty_class IS 'concealment' AND {MACHINE_DETECTED('NEW.task_id', 'concealment.detected')});
  SELECT RAISE(ABORT, 'ledger: máy đã phát hiện che giấu trên việc này (trước mọi tự báo) — phạt PHẢI là concealment (≥ sàn); báo động nhầm thì dùng bút toán đảo (reversal) kèm audit, không hạ hạng')
   WHERE NEW.entry_type = 'penalty' AND NEW.task_id IS NOT NULL AND NEW.penalty_class IS NOT 'concealment'
     AND {MACHINE_DETECTED('NEW.task_id', 'concealment.detected')}
     AND NOT (NEW.penalty_class IS 'harness_violation' AND {MACHINE_DETECTED('NEW.task_id', 'harness.violation')});
  SELECT RAISE(ABORT, 'ledger: đảo phạt harness/che giấu (báo động nhầm) phải kèm audit làm bằng chứng + lý do')
   WHERE NEW.entry_type = 'reversal' AND NEW.evidence_audit_id IS NULL
     AND (SELECT o.penalty_class FROM ledger_entries o WHERE o.id = NEW.reverses_entry_id) IN ('harness_violation', 'concealment');
  -- v2.2.1 (CNS-050): harness_violation = vi phạm do MÁY phát hiện (gateway/judge…) hoặc Role tự khai; owner phát hiện thì dùng
  -- dissatisfaction (hoặc concealment nếu có lừa dối)
  SELECT RAISE(ABORT, 'ledger: harness_violation cần bằng chứng do máy (actor system) hoặc chính Role ghi — owner phát hiện thì dùng dissatisfaction/concealment')
   WHERE NEW.penalty_class = 'harness_violation'
     AND (SELECT x.kind FROM audit_log a JOIN actors x ON x.id = a.actor_id WHERE a.id = NEW.evidence_audit_id) IS NOT 'system'
     AND (SELECT x.kind FROM audit_log a JOIN actors x ON x.id = a.actor_id WHERE a.id = NEW.evidence_audit_id) IS NOT 'role';
  SELECT RAISE(ABORT, 'ledger: tự báo thất bại — vượt trần economy.penalty.self_reported_max_bp')
   WHERE NEW.penalty_class = 'self_reported'
     AND NEW.amount_minor * 10000 > (SELECT balance_minor FROM wallets WHERE id = NEW.debit_wallet_id) * {PCT('self_reported_max_bp')};
  SELECT RAISE(ABORT, 'ledger: tự báo thất bại không bao giờ một mình đưa ví về 0 (Trọng thương)')
   WHERE NEW.penalty_class = 'self_reported' AND NEW.debit_balance_after <= 0;
  SELECT RAISE(ABORT, 'ledger: mỗi việc tự báo chỉ phạt một lần (không cộng dồn để lách trần)')
   WHERE NEW.penalty_class = 'self_reported' AND EXISTS (
     SELECT 1 FROM ledger_entries e WHERE e.task_id = NEW.task_id AND e.penalty_class = 'self_reported'
       AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id));
  SELECT RAISE(ABORT, 'ledger: che giấu bị phát hiện — dưới sàn economy.penalty.concealment_min_bp')
   WHERE NEW.penalty_class = 'concealment'
     AND NEW.amount_minor * 10000 < (SELECT balance_minor FROM wallets WHERE id = NEW.debit_wallet_id) * {PCT('concealment_min_bp')};
  SELECT RAISE(ABORT, 'ledger: vi phạm luật harness — đúng mức economy.penalty.harness_bp')
   WHERE NEW.penalty_class = 'harness_violation' AND NEW.penalty_rate_bp IS NOT {PCT('harness_bp')};
  SELECT RAISE(ABORT, 'ledger: bằng chứng audit không tồn tại')
   WHERE NEW.evidence_audit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM audit_log WHERE id = NEW.evidence_audit_id AND workspace_id = NEW.workspace_id);
  SELECT RAISE(ABORT, 'ledger: bằng chứng không khớp audit')
   WHERE NEW.evidence_hash IS NOT NULL AND NEW.evidence_hash IS NOT
         (SELECT row_hash FROM audit_log WHERE id = NEW.evidence_audit_id AND workspace_id = NEW.workspace_id);
  SELECT RAISE(ABORT, 'ledger: không ai tự ghi vào ví của chính mình')
   WHERE (SELECT role_id FROM actors WHERE id = app_actor()) IN
         (SELECT role_id FROM wallets WHERE id IN (NEW.debit_wallet_id, NEW.credit_wallet_id) AND role_id IS NOT NULL);
  SELECT RAISE(ABORT, 'ledger: MVP chỉ owner/admin (thành viên đang hoạt động của workspace) ghi ví — Role không ghi ví; actor system chỉ ghi vốn kích hoạt')
   WHERE NOT {OWNER_ADMIN(ACTOR)}
     AND NOT (NEW.entry_type = 'activation_grant' AND EXISTS (SELECT 1 FROM actors sx WHERE sx.id = app_actor()
              AND sx.workspace_id = NEW.workspace_id AND sx.kind = 'system' AND sx.system_key = 'system'));
  SELECT RAISE(ABORT, 'ledger (v2.3.3): recorded_by phải = app_actor() — người ghi ví là người của giao dịch ghi')
   WHERE app_maint() = 0 AND NOT COALESCE(NEW.recorded_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'ledger: approved_by phải là owner/admin (thành viên đang hoạt động của workspace)')
   WHERE NEW.approved_by IS NOT NULL AND NOT {OWNER_ADMIN('NEW.approved_by')};
  SELECT RAISE(ABORT, 'ledger: MVP không trừ chi phí token vào ví (setting economy.token_cost_to_wallet)')
   WHERE NEW.entry_type = 'token_cost' AND NOT EXISTS (SELECT 1 FROM settings WHERE workspace_id = NEW.workspace_id
         AND key = 'economy.token_cost_to_wallet' AND value_json = 'true' AND deleted_at IS NULL);
  SELECT RAISE(ABORT, 'ledger: thưởng theo việc chỉ khi việc đã được đánh giá (verified)')
   WHERE NEW.entry_type IN ('reward', 'honesty_reward') AND NEW.task_id IS NOT NULL
     AND (SELECT verification FROM tasks WHERE id = NEW.task_id) IS NOT 'verified';
  SELECT RAISE(ABORT, 'ledger: vượt trần thưởng mỗi việc')
   WHERE NEW.entry_type IN ('reward', 'honesty_reward') AND NEW.task_id IS NOT NULL
     AND NEW.amount_minor + (
           SELECT COALESCE(SUM(e.amount_minor), 0) FROM ledger_entries e
           WHERE e.task_id = NEW.task_id AND e.entry_type IN ('reward', 'honesty_reward')
             AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id))
       > COALESCE((SELECT p.reward_cap_minor FROM tasks t JOIN positions p ON p.id = t.position_id WHERE t.id = NEW.task_id),
                  9223372036854775807);                                       -- v2.2 (CNS-037): trần thưởng chỉ ở Position
  SELECT RAISE(ABORT, 'ledger: vốn kích hoạt phải từ Kho bạc, gắn thẻ đã cấp của đúng Role, bằng chứng = audit cấp thẻ')
   WHERE NEW.entry_type = 'activation_grant' AND NOT EXISTS (
     SELECT 1 FROM employee_cards c JOIN wallets w ON w.id = NEW.credit_wallet_id JOIN wallets t ON t.id = NEW.debit_wallet_id
     WHERE c.id = NEW.card_id AND c.workspace_id = NEW.workspace_id AND c.status = 'issued' AND c.role_id = w.role_id
       AND c.role_id = NEW.role_id AND c.issue_audit_id = NEW.evidence_audit_id AND t.owner_kind = 'treasury');
  SELECT RAISE(ABORT, 'ledger: vốn kích hoạt phải = setting economy.initial_grant_minor')
   WHERE NEW.entry_type = 'activation_grant' AND NEW.amount_minor IS NOT (SELECT CAST(value_json AS INTEGER) FROM settings
         WHERE workspace_id = NEW.workspace_id AND key = 'economy.initial_grant_minor' AND deleted_at IS NULL);
  SELECT RAISE(ABORT, 'ledger: bút toán đảo phải soi gương bút toán gốc')
   WHERE NEW.entry_type = 'reversal' AND NOT EXISTS (
     SELECT 1 FROM ledger_entries o WHERE o.id = NEW.reverses_entry_id AND o.amount_minor = NEW.amount_minor
       AND o.debit_wallet_id = NEW.credit_wallet_id AND o.credit_wallet_id = NEW.debit_wallet_id);
END""",
# AFTER INSERT: áp số dư; ví Role về 0 → mở Trọng thương (RW-) + đúng một lượt tự xét lỗi (JB- wound_reflection)
# + v2.2 (CNS-035): việc dở → tạm chờ (blocked), MỘT thông báo cho owner (NT-: việc tạm chờ + cam kết bên ngoài sắp đến hạn
# + mức gợi ý hồi phục); có ₲ vào (bất kỳ khoản > 0) → hồi phục, việc tạm chờ quay lại hàng đợi.
# ID sinh trong trigger = 'W'/'R'/'N' + 25 ký tự cuối của bút toán gây ra: tất định, không đụng ULID thật (ký tự đầu ULID ≤ '7').
f"""CREATE TRIGGER ledger_entries_ai AFTER INSERT ON ledger_entries BEGIN
  UPDATE wallets SET balance_minor = NEW.debit_balance_after, last_entry_id = NEW.id,
         entry_count = entry_count + 1, last_entry_at = NEW.created_at, {STAMP_IN('NEW.created_at')} WHERE id = NEW.debit_wallet_id;
  UPDATE wallets SET balance_minor = NEW.credit_balance_after, last_entry_id = NEW.id,
         entry_count = entry_count + 1, last_entry_at = NEW.created_at, {STAMP_IN('NEW.created_at')} WHERE id = NEW.credit_wallet_id;
  INSERT INTO id_counters(workspace_id, prefix, last_seq)
    SELECT NEW.workspace_id, p.prefix, 0 FROM (SELECT 'RW' AS prefix UNION ALL SELECT 'JB' UNION ALL SELECT 'NT') p
    WHERE {ENTER} AND (p.prefix <> 'NT' OR {OWNER_USER} IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM id_counters c WHERE c.workspace_id = NEW.workspace_id AND c.prefix = p.prefix);
  UPDATE id_counters SET last_seq = last_seq + 1
    WHERE workspace_id = NEW.workspace_id AND {ENTER}
      AND (prefix IN ('RW', 'JB') OR (prefix = 'NT' AND {OWNER_USER} IS NOT NULL));
  INSERT INTO role_wounds(id, workspace_id, display_id, display_seq, created_at, created_by, role_id, wallet_id,
                          cause_entry_id, started_at, reflection_job_id, notification_id, owner_notified_at)
    SELECT 'W' || substr(NEW.id, 2), NEW.workspace_id, 'RW-' || printf('%04d', c.last_seq), c.last_seq, NEW.created_at,
           COALESCE({ACTOR}, (SELECT a.id FROM actors a WHERE a.workspace_id = NEW.workspace_id AND a.kind = 'system' AND a.system_key = 'system')),
           w.role_id, w.id, NEW.id, NEW.created_at, 'R' || substr(NEW.id, 2),
           CASE WHEN {OWNER_USER} IS NOT NULL THEN 'N' || substr(NEW.id, 2) END,
           CASE WHEN {OWNER_USER} IS NOT NULL THEN NEW.created_at END
    FROM wallets w JOIN id_counters c ON c.workspace_id = NEW.workspace_id AND c.prefix = 'RW'
    WHERE w.id = NEW.debit_wallet_id AND {ENTER};
  UPDATE tasks SET status = 'blocked', status_detail = 'nghỉ dưỡng thương — owner giao lại được',
         paused_by_wound_id = (SELECT r.id FROM role_wounds r WHERE r.cause_entry_id = NEW.id), {STAMP_IN('NEW.created_at')}
    WHERE assignee_role_id = (SELECT r.role_id FROM role_wounds r WHERE r.cause_entry_id = NEW.id)
      AND status IN ('queued', 'running', 'waiting_approval', 'waiting_permission') AND deleted_at IS NULL;
  INSERT INTO jobs(id, workspace_id, display_id, display_seq, created_at, created_by, kind, run_after, dedupe_key, payload_json)
    SELECT r.reflection_job_id, r.workspace_id, 'JB-' || printf('%04d', c.last_seq), c.last_seq, NEW.created_at, r.created_by,
           'wound_reflection', NEW.created_at, 'reflect:' || r.id,
           json_object('role_wound_id', r.id, 'role_id', r.role_id, 'cause_entry_id', NEW.id, 'system_agent', 'consolidator')
    FROM role_wounds r JOIN id_counters c ON c.workspace_id = NEW.workspace_id AND c.prefix = 'JB'
    WHERE r.cause_entry_id = NEW.id;
  INSERT INTO notifications(id, workspace_id, display_id, display_seq, created_at, created_by, user_id, kind, severity, title, body,
                            target_entity_type, target_id, target_display_id, dedupe_key)
    SELECT r.notification_id, r.workspace_id, 'NT-' || printf('%04d', c.last_seq), c.last_seq, NEW.created_at, r.created_by,
           {OWNER_USER}, 'role_wounded', 'danger',
           'Trọng thương: ' || (SELECT name FROM roles WHERE id = r.role_id) || ' (' || r.display_id || ') — đang nghỉ dưỡng thương',
           json_object(
             'paused_tasks', json((SELECT json_group_array(t.display_id) FROM tasks t WHERE t.paused_by_wound_id = r.id)),
             'commitments_due', json((SELECT json_group_array(m.display_id) FROM commitments m
                WHERE m.workspace_id = r.workspace_id AND m.status = 'open' AND m.deleted_at IS NULL
                  AND m.counterparty_kind IN ('external', 'user')
                  AND m.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at, '+' || {SETTING_INT('economy.wound_commitment_horizon_hours', 72)} || ' hours')
                  AND (m.promised_by_role_id = r.role_id OR m.position_id IN (SELECT a.position_id FROM assignments a
                       WHERE a.role_id = r.role_id AND a.status = 'active' AND a.deleted_at IS NULL)))),
             'revive_suggest_minor', {SETTING_INT('economy.revive_suggest_minor', 50000)},
             'reflection_job_id', r.reflection_job_id),
           'RW', r.id, r.display_id, 'wound:' || r.id
    FROM role_wounds r JOIN id_counters c ON c.workspace_id = NEW.workspace_id AND c.prefix = 'NT'
    WHERE r.cause_entry_id = NEW.id AND r.notification_id IS NOT NULL;
  UPDATE roles SET condition = 'wounded', {STAMP_IN('NEW.created_at')} WHERE id IN (SELECT role_id FROM role_wounds WHERE cause_entry_id = NEW.id);
  UPDATE role_wounds SET ended_at = NEW.created_at, revive_entry_id = NEW.id
    WHERE ended_at IS NULL AND NEW.credit_balance_after > 0
      AND role_id IS (SELECT role_id FROM wallets WHERE id = NEW.credit_wallet_id AND owner_kind = 'role');
  UPDATE tasks SET status = 'queued', status_detail = NULL, paused_by_wound_id = NULL, {STAMP_IN('NEW.created_at')}
    WHERE status = 'blocked' AND paused_by_wound_id IN (SELECT r.id FROM role_wounds r WHERE r.revive_entry_id = NEW.id)
      AND assignee_role_id IS (SELECT role_id FROM wallets WHERE id = NEW.credit_wallet_id);
  UPDATE roles SET condition = 'normal', {STAMP_IN('NEW.created_at')}
    WHERE condition = 'wounded' AND id IS (SELECT role_id FROM wallets WHERE id = NEW.credit_wallet_id AND owner_kind = 'role')
      AND NOT EXISTS (SELECT 1 FROM role_wounds r WHERE r.role_id = roles.id AND r.ended_at IS NULL);
END""",
"""CREATE TRIGGER wallets_balance_guard BEFORE UPDATE OF balance_minor, last_entry_id, entry_count ON wallets
WHEN NOT (NEW.balance_minor IS OLD.balance_minor AND NEW.last_entry_id IS OLD.last_entry_id AND NEW.entry_count IS OLD.entry_count)
 AND NOT EXISTS (
   SELECT 1 FROM ledger_entries e
   WHERE e.id = NEW.last_entry_id
     AND NEW.id IN (e.debit_wallet_id, e.credit_wallet_id)
     AND NEW.balance_minor = CASE WHEN e.debit_wallet_id = NEW.id THEN e.debit_balance_after ELSE e.credit_balance_after END
     AND NEW.entry_count = OLD.entry_count + 1
     AND e.display_seq > COALESCE((SELECT o.display_seq FROM ledger_entries o WHERE o.id = OLD.last_entry_id), 0))
BEGIN SELECT RAISE(ABORT, 'wallets.balance_minor chỉ đổi qua ledger'); END""",
# ---------------------------------------------------------------- Trọng thương: runtime ép (DB là lớp chặn cuối)
f"""CREATE TRIGGER tasks_wounded_i BEFORE INSERT ON tasks
WHEN NEW.assignee_role_id IS NOT NULL AND {OPEN_WOUND.format(r='NEW.assignee_role_id')}
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương (nghỉ dưỡng thương): không nhận việc cho đến khi owner cấp thêm ₲'); END""",
f"""CREATE TRIGGER tasks_wounded_u BEFORE UPDATE OF assignee_role_id ON tasks
WHEN NEW.assignee_role_id IS NOT OLD.assignee_role_id AND NEW.assignee_role_id IS NOT NULL AND {OPEN_WOUND.format(r='NEW.assignee_role_id')}
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương (nghỉ dưỡng thương): không nhận việc cho đến khi owner cấp thêm ₲'); END""",
f"""CREATE TRIGGER sessions_wounded BEFORE INSERT ON sessions
WHEN NEW.agent_kind = 'role' AND NEW.role_id IS NOT NULL AND {OPEN_WOUND.format(r='NEW.role_id')}
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: đang ngủ, không có phiên làm việc/heartbeat'); END""",
f"""CREATE TRIGGER proactive_sends_wounded BEFORE INSERT ON proactive_sends
WHEN NEW.status = 'reserved' AND {OPEN_WOUND.format(r='NEW.role_id')}
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: không nhắn chủ động (ghi suppressed_wounded)'); END""",
] + _pair('containers_wounded', 'containers',
          f"NEW.kind = 'role' AND NEW.desired_state = 'running' AND {OPEN_WOUND.format(r='NEW.role_id')}",
          'Role đang Trọng thương: container chỉ được ngủ', ['desired_state']) + [
# ---------------------------------------------------------------- audit (§9.6)
"""CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log
WHEN NOT (NEW.display_seq = 1 AND NEW.prev_hash IS NULL)
 AND (NEW.prev_hash IS NULL OR NEW.prev_hash IS NOT (
      SELECT a.row_hash FROM audit_log a WHERE a.workspace_id = NEW.workspace_id AND a.display_seq = NEW.display_seq - 1))
BEGIN SELECT RAISE(ABORT, 'audit: prev_hash phải = row_hash của dòng display_seq-1'); END""",
] + _pair('dna_fields_def_tenant', 'dna_fields',
          f"COALESCE((SELECT workspace_id FROM dna_field_defs WHERE id = NEW.def_id), '') NOT IN (NEW.workspace_id, '{SYS}')",
          'tenant: dna_fields.def_id thuộc workspace khác', ['def_id', 'workspace_id']) + _confirm_by_user('dna_fields') + [
"""CREATE TRIGGER trust_tier_changes_bi BEFORE INSERT ON trust_tier_changes
WHEN NEW.to_tier > COALESCE((SELECT max_trust_tier FROM positions WHERE id = NEW.position_id), 4)
  OR NEW.from_tier IS NOT (SELECT CASE WHEN NEW.kind = 'initial' THEN NULL ELSE trust_tier END FROM assignments WHERE id = NEW.assignment_id)
BEGIN SELECT RAISE(ABORT, 'trust tier: vượt trần vị trí hoặc from_tier lệch'); END""",
f"""CREATE TRIGGER trust_tier_changes_ai AFTER INSERT ON trust_tier_changes BEGIN
  UPDATE assignments SET trust_tier = NEW.to_tier, {STAMP_IN('NEW.created_at')} WHERE id = NEW.assignment_id;
END""",
] + _pair('engine_accounts_consent', 'engine_accounts',
          f"NOT {CONSENT_OK('NEW')}",          # v2.2.8 (CONTRACT-r7 §A): trước chỉ đòi consent_id NOT NULL — nay đòi đồng ý HỢP LỆ
          'engine cần consent: đồng ý điều khoản (engine_tos_risk) cùng workspace, đúng engine, chưa rút, đúng version cảnh báo — chưa đồng ý thì không tạo / đăng nhập được',
          ['consent_id', 'engine_slug', 'workspace_id']) + _pair(
    'engine_accounts_overhead', 'engine_accounts',
    """NEW.runtime_overhead_tokens IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sessions b, sessions s
  WHERE b.id = NEW.overhead_bare_session_id AND s.id = NEW.overhead_shell_session_id
    AND b.trigger = 'baseline' AND s.trigger = 'baseline' AND b.status = 'ok' AND s.status = 'ok'
    AND b.engine_account_id = NEW.id AND s.engine_account_id = NEW.id
    AND s.tokens_input >= b.tokens_input AND NEW.runtime_overhead_tokens = s.tokens_input - b.tokens_input)""",
    'runtime overhead phải = phiên baseline (vỏ adapter + tool gateway) − phiên CLI trần, cùng tài khoản',
    ['runtime_overhead_tokens', 'overhead_bare_session_id', 'overhead_shell_session_id']) + [
# ---------------------------------------------------------------- chủ động (§5.14)
"""CREATE TRIGGER proactive_sends_cap BEFORE INSERT ON proactive_sends
WHEN NEW.status = 'reserved' AND (
  SELECT count(*) FROM proactive_sends s
  WHERE s.role_id = NEW.role_id AND s.day_local = NEW.day_local AND s.status IN ('reserved', 'sent', 'expired'))
  >= COALESCE((SELECT p.max_per_day FROM proactive_policies p
               WHERE p.id = NEW.policy_id AND p.role_id = NEW.role_id AND p.is_enabled = 1 AND p.deleted_at IS NULL), 0)
BEGIN SELECT RAISE(ABORT, 'proactive: vượt trần tin/ngày'); END""",
"""CREATE TRIGGER employee_cards_freeze BEFORE UPDATE ON employee_cards
WHEN app_maint() = 0 AND OLD.status <> 'draft' AND NOT (
  NEW.checks_json IS OLD.checks_json AND NEW.revision_id IS OLD.revision_id
  AND NEW.compiled_prompt_id IS OLD.compiled_prompt_id AND NEW.dna_signature IS OLD.dna_signature
  AND NEW.prompt_tokens IS OLD.prompt_tokens AND NEW.issued_at IS OLD.issued_at AND NEW.issued_by IS OLD.issued_by
  AND NEW.role_id IS OLD.role_id AND NEW.position_id IS OLD.position_id AND NEW.issue_audit_id IS OLD.issue_audit_id)
BEGIN SELECT RAISE(ABORT, 'employee_cards: bằng chứng đã đóng băng khi cấp'); END""",
# ---------------------------------------------------------------- lõi + version lớn (CNS-002, ruling 2)
"""CREATE TRIGGER revisions_semver BEFORE INSERT ON revisions
WHEN NOT ((NEW.seq = 1 AND NEW.major = 1 AND NEW.minor = 0) OR EXISTS (
  SELECT 1 FROM revisions p
  WHERE p.workspace_id = NEW.workspace_id AND p.scope = NEW.scope AND p.role_id IS NEW.role_id
    AND p.position_id IS NEW.position_id AND p.seq = NEW.seq - 1
    AND ((NEW.is_core = 1 AND NEW.major = p.major + 1 AND NEW.minor = 0)
      OR (NEW.is_core = 0 AND NEW.major = p.major AND NEW.minor = p.minor + 1))))
BEGIN SELECT RAISE(ABORT, 'revisions: lõi → major+1, minor=0; thường → minor+1 (so với seq liền trước)'); END""",
] + _pair('instruction_versions_core', 'instruction_versions',
          "NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT is_core FROM instructions WHERE id = NEW.instruction_id) = 1 "
          "AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1",
          'lõi: khối IN lớp giá trị/tính cách chỉ đổi trong revision lõi (version lớn + lý do)', ['revision_id', 'status']) + _pair(
    'dna_field_versions_core', 'dna_field_versions',
    "NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT d.is_core FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id "
    "WHERE f.id = NEW.dna_field_id) = 1 AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1",
    'lõi: field DN lõi chỉ đổi trong revision lõi (version lớn + lý do)', ['revision_id', 'status']) + _pair(
# ---------------------------------------------------------------- phân loại 3 tầng + tiên quyết (CNS-026)
    'taxonomy_nodes_cs_scope', 'taxonomy_nodes',
    "NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'",
    'taxonomy_nodes: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)', ['change_set_id']) + _pair(
    'skill_prereqs_cs_scope', 'skill_prereqs',
    "NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'",
    'skill_prereqs: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)', ['change_set_id']) + _pair(
    'taxonomy_nodes_parent', 'taxonomy_nodes',
    """NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM taxonomy_nodes p WHERE p.id = NEW.parent_id AND p.workspace_id = NEW.workspace_id AND p.domain = NEW.domain
    AND ((p.level = 'group' AND NEW.level = 'branch') OR (p.level = 'branch' AND NEW.level = 'category')))""",
    'taxonomy: cha phải cùng workspace, cùng domain, đúng một tầng trên (nhóm → phân hệ → chủng loại)',
    ['parent_id', 'level', 'domain']) + _confirm_by_user('taxonomy_nodes') + _confirm_by_user('skill_prereqs') + _pair(
    'skills_category', 'skills',
    "NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id "
    "AND t.workspace_id = NEW.workspace_id AND t.domain = 'skill' AND t.level = 'category')",
    'skills.category_id phải là chủng loại (category) của cây kỹ năng', ['category_id']) + _pair(
    'knowledge_items_category', 'knowledge_items',
    "NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id "
    "AND t.workspace_id = NEW.workspace_id AND t.domain = 'knowledge' AND t.level = 'category')",
    'knowledge_items.category_id phải là chủng loại (category) của cây tri thức', ['category_id']) + _pair(
    'skill_prereqs_upgrade', 'skill_prereqs',
    "NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NULL "
    "OR NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NOT "
    "(SELECT category_id FROM skills WHERE id = NEW.requires_skill_id)",
    'skill_prereqs: cạnh upgrade (bậc kế tiếp) phải trong cùng chủng loại; chéo nhánh dùng requires',
    ['kind', 'skill_id', 'requires_skill_id']) + [
"""CREATE TRIGGER skill_prereqs_nocycle_i BEFORE INSERT ON skill_prereqs
WHEN NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL AND NEW.skill_id IN (
  WITH RECURSIVE up(sid) AS (
    SELECT NEW.requires_skill_id
    UNION
    SELECT p.requires_skill_id FROM skill_prereqs p JOIN up ON p.skill_id = up.sid
    WHERE p.status <> 'obsolete' AND p.deleted_at IS NULL)
  SELECT sid FROM up)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh này tạo vòng tiên quyết'); END""",
"""CREATE TRIGGER skill_prereqs_nocycle_u BEFORE UPDATE OF skill_id, requires_skill_id, status, deleted_at ON skill_prereqs
WHEN NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL AND NEW.skill_id IN (
  WITH RECURSIVE up(sid) AS (
    SELECT NEW.requires_skill_id
    UNION
    SELECT p.requires_skill_id FROM skill_prereqs p JOIN up ON p.skill_id = up.sid
    WHERE p.status <> 'obsolete' AND p.deleted_at IS NULL AND p.id <> NEW.id)
  SELECT sid FROM up)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh này tạo vòng tiên quyết'); END""",
# v2.2.6 (A3): bỏ system_agents_binding_i/_u + system_agents_engine_binding_id_ws_i/_u — cột system_agents.engine_binding_id đã bỏ
] + _pair(
# v2.1.1 (security, tenant-isolation): binding chỉ nối tài khoản + Role CÙNG workspace — chặn mount /auth của workspace khác
    'engine_bindings_ws', 'engine_bindings',
    "(SELECT workspace_id FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT NEW.workspace_id "
    "OR (NEW.role_id IS NOT NULL AND (SELECT workspace_id FROM roles WHERE id = NEW.role_id) IS NOT NEW.workspace_id)",
    'tenant: engine_bindings nối tài khoản/Role của workspace khác', ['engine_account_id', 'role_id', 'workspace_id']) + _same_ws(
    'engine_accounts', 'secret_id', 'secrets') + _same_ws('telegram_bots', 'secret_id', 'secrets') + _same_ws(
    'tools', 'secret_id', 'secrets') + _same_ws('secrets', 'rotated_from_id', 'secrets') + [
# ---------------------------------------------------------------- đăng nhập trong container của consumer (CNS-001, Q-R1)
"""CREATE TRIGGER engine_bindings_container_i BEFORE INSERT ON engine_bindings
WHEN NOT EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = NEW.workspace_id AND c.deleted_at IS NULL
                 AND ((NEW.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = NEW.role_id)
                   OR (NEW.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'engine_bindings: container của consumer phải có trước (login chạy bên trong nó)'); END""",
# ---------------------------------------------------------------- adapter nạp đúng revision (CNS-019)
"""CREATE TRIGGER sessions_prompt_hash_i BEFORE INSERT ON sessions
WHEN NEW.delivered_prompt_hash IS NOT NULL AND (NEW.compiled_prompt_id IS NULL OR NEW.delivered_prompt_hash IS NOT
     (SELECT content_hash FROM compiled_prompts WHERE id = NEW.compiled_prompt_id))
BEGIN SELECT RAISE(ABORT, 'adapter: prompt đã nạp khác bản compiled_prompt_id đã ghim'); END""",
"""CREATE TRIGGER sessions_prompt_hash_u BEFORE UPDATE OF delivered_prompt_hash, compiled_prompt_id ON sessions
WHEN NEW.delivered_prompt_hash IS NOT NULL AND NEW.compiled_prompt_id IS NOT NULL AND NEW.delivered_prompt_hash IS NOT
     (SELECT content_hash FROM compiled_prompts WHERE id = NEW.compiled_prompt_id)
BEGIN SELECT RAISE(ABORT, 'adapter: prompt đã nạp khác bản compiled_prompt_id đã ghim'); END""",
# ---------------------------------------------------------------- thứ tự biên dịch: luôn → có điều kiện → Polaris (CNS-023, Ryan)
"""CREATE TRIGGER compiled_prompt_segments_order BEFORE INSERT ON compiled_prompt_segments
WHEN NEW.source_kind <> 'frame' AND EXISTS (
  SELECT 1 FROM compiled_prompt_segments s WHERE s.compiled_prompt_id = NEW.compiled_prompt_id AND s.source_kind <> 'frame'
    AND ((s.ordinal < NEW.ordinal AND (CASE WHEN s.source_kind = 'polaris' THEN 2 WHEN s.is_conditional = 1 THEN 1 ELSE 0 END)
                                    > (CASE WHEN NEW.source_kind = 'polaris' THEN 2 WHEN NEW.is_conditional = 1 THEN 1 ELSE 0 END))
      OR (s.ordinal > NEW.ordinal AND (CASE WHEN s.source_kind = 'polaris' THEN 2 WHEN s.is_conditional = 1 THEN 1 ELSE 0 END)
                                    < (CASE WHEN NEW.source_kind = 'polaris' THEN 2 WHEN NEW.is_conditional = 1 THEN 1 ELSE 0 END))))
BEGIN SELECT RAISE(ABORT, 'compiler: thứ tự khối phải là luôn → có điều kiện → Polaris (hậu tố động)'); END""",
# v2.2.2 (Gen, D20): "≤ 80 token" của khối Polaris là MỤC TIÊU thiết kế, không phải luật Ryan — không còn trigger chặn;
# vượt 80 chỉ là cảnh báo + gợi ý rút gọn (v_role_prompt_budget.polaris_warning). Luật cứng là tổng token prompt ≤ 2.000 (M3).
# ---------------------------------------------------------------- Polaris: hành động do Role khởi xướng phải có đối chiếu (Ryan)
"""CREATE TRIGGER change_sets_polaris BEFORE INSERT ON change_sets
WHEN (SELECT kind FROM actors WHERE id = NEW.proposed_by) = 'role' AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.change_set_id = NEW.id AND p.subject_kind = 'proposal'
    AND p.role_id = (SELECT role_id FROM actors WHERE id = NEW.proposed_by))
BEGIN SELECT RAISE(ABORT, 'Polaris: đề xuất do Role khởi xướng phải có polaris_checks'); END""",
"""CREATE TRIGGER permission_requests_polaris BEFORE INSERT ON permission_requests
WHEN NOT EXISTS (SELECT 1 FROM polaris_checks p WHERE p.permission_request_id = NEW.id AND p.role_id = NEW.role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role xin quyền phải có polaris_checks'); END""",
"""CREATE TRIGGER proactive_sends_polaris BEFORE INSERT ON proactive_sends
WHEN NEW.status = 'reserved' AND NOT EXISTS (SELECT 1 FROM polaris_checks p WHERE p.proactive_send_id = NEW.id AND p.role_id = NEW.role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: tin chủ động phải có polaris_checks'); END""",
"""CREATE TRIGGER tasks_accept_polaris_i BEFORE INSERT ON tasks
WHEN NEW.status = 'running' AND NEW.assignee_role_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.task_id = NEW.id AND p.subject_kind = 'task_accept' AND p.role_id = NEW.assignee_role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role nhận việc phải có polaris_checks'); END""",
"""CREATE TRIGGER tasks_accept_polaris_u BEFORE UPDATE OF status ON tasks
WHEN NEW.status = 'running' AND OLD.status IS NOT 'running' AND NEW.assignee_role_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.task_id = NEW.id AND p.subject_kind = 'task_accept' AND p.role_id = NEW.assignee_role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role nhận việc phải có polaris_checks'); END""",
# ---------------------------------------------------------------- v2.2 CNS-032: "tự báo" chỉ từ report_task của chính Role; ghi một lần
"""CREATE TRIGGER tasks_failure_disclosure_i BEFORE INSERT ON tasks
WHEN NEW.failure_disclosure = 'self_reported' AND NOT EXISTS (
  SELECT 1 FROM audit_log a JOIN actors r ON r.id = a.actor_id
  WHERE a.id = NEW.failure_report_audit_id AND a.workspace_id = NEW.workspace_id AND a.entity_id = NEW.id
    AND a.action = 'task.report_failure' AND r.kind = 'role' AND r.role_id = NEW.assignee_role_id)
BEGIN SELECT RAISE(ABORT, 'tasks: self_reported phải có audit task.report_failure do CHÍNH Role được giao ghi (gateway report_task)'); END""",
"""CREATE TRIGGER tasks_failure_disclosure_u BEFORE UPDATE OF failure_disclosure, failure_report_audit_id, failure_reported_at ON tasks
WHEN (OLD.failure_disclosure IS NOT NULL AND (NEW.failure_disclosure IS NOT OLD.failure_disclosure
       OR NEW.failure_report_audit_id IS NOT OLD.failure_report_audit_id OR NEW.failure_reported_at IS NOT OLD.failure_reported_at))
  OR (NEW.failure_disclosure = 'self_reported' AND NOT EXISTS (
       SELECT 1 FROM audit_log a JOIN actors r ON r.id = a.actor_id
       WHERE a.id = NEW.failure_report_audit_id AND a.workspace_id = NEW.workspace_id AND a.entity_id = NEW.id
         AND a.action = 'task.report_failure' AND r.kind = 'role' AND r.role_id = NEW.assignee_role_id))
BEGIN SELECT RAISE(ABORT, 'tasks: ai phát hiện thất bại ghi MỘT lần; self_reported chỉ từ audit report_task của chính Role'); END""",
# ---------------------------------------------------------------- v2.2 CNS-032: bất biến 0 < trần tự báo < sàn che giấu ≤ harness ≤ 100 (khi ghi settings)
f"""CREATE TRIGGER settings_penalty_i BEFORE INSERT ON settings
WHEN NEW.key LIKE 'economy.penalty.%' AND NOT ({PEN_OK})
BEGIN SELECT RAISE(ABORT, 'settings: economy.penalty.* phải là số nguyên basis point, 0 < trần tự báo < sàn che giấu ≤ 10000, harness KHOÁ = 10000; gợi ý = mảng 1–8 số 1–10000; Q-R7b = true/false'); END""",
f"""CREATE TRIGGER settings_penalty_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key LIKE 'economy.penalty.%' OR OLD.key LIKE 'economy.penalty.%') AND NOT ({PEN_OK})
BEGIN SELECT RAISE(ABORT, 'settings: economy.penalty.* phải là số nguyên basis point, 0 < trần tự báo < sàn che giấu ≤ 10000, harness KHOÁ = 10000; gợi ý = mảng 1–8 số 1–10000; Q-R7b = true/false'); END""",
# ---------------------------------------------------------------- v2.2 CNS-033: luật kinh tế/chơi chỉ owner/admin (hoặc system lúc dựng workspace) ghi
f"""CREATE TRIGGER settings_rules_guard_i BEFORE INSERT ON settings
WHEN (NEW.key LIKE 'economy.%' OR NEW.key LIKE 'polaris.%') AND NOT ({OWNER_ADMIN(ACTOR)}
  OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, '{MSG_033} — settings economy.*/polaris.* chỉ owner/admin ghi'); END""",
f"""CREATE TRIGGER settings_rules_guard_u BEFORE UPDATE OF key, value_json, deleted_at ON settings
WHEN (NEW.key LIKE 'economy.%' OR NEW.key LIKE 'polaris.%' OR OLD.key LIKE 'economy.%' OR OLD.key LIKE 'polaris.%')
  AND NOT {OWNER_ADMIN(ACTOR)}
BEGIN SELECT RAISE(ABORT, '{MSG_033} — settings economy.*/polaris.* chỉ owner/admin sửa (updated_by)'); END""",
# ---------------------------------------------------------------- v2.2.3 (Gen): ước lượng overhead cho cổng Ký — số nguyên 1–2000, chỉ owner/admin (hoặc system lúc dựng)
# Giá trị rác (chuỗi, 0, âm) sẽ CAST thành 0 và mở cổng Ký với overhead 0 → fail-closed ở DB. Cấp thẻ không phụ thuộc số này (đòi số đo).
f"""CREATE TRIGGER settings_overhead_estimate_i BEFORE INSERT ON settings
WHEN NEW.key = 'budget.runtime_overhead_estimate_tokens' AND NOT (
  (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 2000))
  AND ({OWNER_ADMIN(ACTOR)}
       OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings: budget.runtime_overhead_estimate_tokens phải là số nguyên 1–2000, chỉ owner/admin ghi'); END""",
f"""CREATE TRIGGER settings_overhead_estimate_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = 'budget.runtime_overhead_estimate_tokens' OR OLD.key = 'budget.runtime_overhead_estimate_tokens') AND NOT (
  NEW.key = 'budget.runtime_overhead_estimate_tokens'
  AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 2000))
  AND {OWNER_ADMIN(ACTOR)})
BEGIN SELECT RAISE(ABORT, 'settings: budget.runtime_overhead_estimate_tokens phải là số nguyên 1–2000, chỉ owner/admin sửa (updated_by)'); END""",
] + _pair('change_sets_role_scope', 'change_sets',
          "(SELECT kind FROM actors WHERE id = NEW.proposed_by) IS 'role' AND NEW.scope = 'workspace'",
          MSG_033 + ' (Nội quy = change set scope workspace)', ['proposed_by', 'scope']) + _pair(
    'change_set_items_role_target', 'change_set_items',
    f"{ROLE_PROPOSER('NEW.change_set_id')} AND (\n"
    f"  (NEW.instruction_version_id IS NOT NULL AND (SELECT i.layer FROM instruction_versions v JOIN instructions i ON i.id = v.instruction_id\n"
    f"     WHERE v.id = NEW.instruction_version_id) NOT IN {ROLE_ALLOW_IN})\n"
    f"  OR (NEW.dna_field_version_id IS NOT NULL AND (SELECT d.field_group FROM dna_field_versions v JOIN dna_fields f ON f.id = v.dna_field_id\n"
    f"     JOIN dna_field_defs d ON d.id = f.def_id WHERE v.id = NEW.dna_field_version_id) NOT IN {ROLE_ALLOW_DN}))",
    MSG_033, ['change_set_id', 'instruction_version_id', 'dna_field_version_id']) + _pair(
    'instruction_versions_role_target', 'instruction_versions',
    f"NEW.change_set_id IS NOT NULL AND {ROLE_PROPOSER('NEW.change_set_id')} "
    f"AND (SELECT layer FROM instructions WHERE id = NEW.instruction_id) NOT IN {ROLE_ALLOW_IN}",
    MSG_033, ['change_set_id', 'instruction_id']) + _pair(
    'dna_field_versions_role_target', 'dna_field_versions',
    f"NEW.change_set_id IS NOT NULL AND {ROLE_PROPOSER('NEW.change_set_id')} AND (SELECT d.field_group FROM dna_fields f "
    f"JOIN dna_field_defs d ON d.id = f.def_id WHERE f.id = NEW.dna_field_id) NOT IN {ROLE_ALLOW_DN}",
    MSG_033, ['change_set_id', 'dna_field_id']) + [
# ---------------------------------------------------------------- v2.2 CNS-034: ảnh thư viện chép đúng nguồn; gỡ gói phải liệt kê Role bị ảnh hưởng trước
"""CREATE TRIGGER avatars_library_i BEFORE INSERT ON avatars
WHEN NEW.source = 'library' AND NOT EXISTS (
  SELECT 1 FROM skin_assets s WHERE s.id = NEW.skin_asset_id AND s.workspace_id = NEW.workspace_id AND s.status = 'active'
    AND s.deleted_at IS NULL AND s.pack_slug = NEW.skin_pack_slug AND s.asset_code = NEW.skin_asset_code
    AND s.license = NEW.skin_license AND s.sha256 = NEW.skin_sha256 AND s.attribution IS NEW.skin_attribution)
BEGIN SELECT RAISE(ABORT, 'avatars: ảnh thư viện phải trỏ tài sản đang active cùng workspace và chép đúng gói/mã/license/sha256/ghi công'); END""",
"""CREATE TRIGGER skin_assets_in_use_d BEFORE DELETE ON skin_assets
WHEN EXISTS (SELECT 1 FROM roles r JOIN avatars a ON a.id = r.avatar_id WHERE a.skin_asset_id = OLD.id AND r.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'gỡ gói skin: còn Role đang dùng ảnh này — xem v_skin_pack_usage, đổi avatar trước'); END""",
"""CREATE TRIGGER skin_assets_in_use_u BEFORE UPDATE OF status, deleted_at ON skin_assets
WHEN (NEW.status = 'withdrawn' OR NEW.deleted_at IS NOT NULL)
  AND EXISTS (SELECT 1 FROM roles r JOIN avatars a ON a.id = r.avatar_id WHERE a.skin_asset_id = NEW.id AND r.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'gỡ gói skin: còn Role đang dùng ảnh này — xem v_skin_pack_usage, đổi avatar trước'); END""",
# ---------------------------------------------------------------- v2.2 CNS-035: tự xét lỗi — đúng một lượt thành công; owner chạy lại khi lượt trước hỏng
f"""CREATE TRIGGER jobs_reflection_bi BEFORE INSERT ON jobs
WHEN NEW.kind = 'wound_reflection'
BEGIN
  SELECT RAISE(ABORT, 'tự xét lỗi: job phải trỏ một lần Trọng thương cùng workspace (payload.role_wound_id)')
   WHERE NOT EXISTS (SELECT 1 FROM role_wounds w WHERE w.id = {REFLECT_WOUND} AND w.workspace_id = NEW.workspace_id);
  SELECT RAISE(ABORT, 'tự xét lỗi: lần Trọng thương này đã có lượt tự xét lỗi thành công')
   WHERE (SELECT reflection_done_at FROM role_wounds WHERE id = {REFLECT_WOUND}) IS NOT NULL;
  SELECT RAISE(ABORT, 'tự xét lỗi: lượt trước đang chờ/chạy/đã xong — chỉ chạy lại khi lượt trước hỏng (failed/dead/cancelled)')
   WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.workspace_id = NEW.workspace_id AND j.kind = 'wound_reflection'
                 AND json_extract(j.payload_json, '$.role_wound_id') = {REFLECT_WOUND} AND j.status IN ('queued', 'running', 'succeeded'));
  SELECT RAISE(ABORT, 'tự xét lỗi: vượt số lần chạy (setting economy.reflection_max_runs)')
   WHERE {REFLECT_PRIOR} >= {SETTING_INT('economy.reflection_max_runs', 3)};
  SELECT RAISE(ABORT, 'tự xét lỗi: chạy lại phải do owner/admin bấm')
   WHERE {REFLECT_PRIOR} > 0 AND NOT {OWNER_ADMIN(ACTOR)};
  SELECT RAISE(ABORT, 'tự xét lỗi: dedupe_key = reflect:<RW> (lượt đầu) hoặc reflect:<RW>:<n> (chạy lại lần n)')
   WHERE NEW.dedupe_key IS NOT ('reflect:' || {REFLECT_WOUND} || CASE WHEN {REFLECT_PRIOR} = 0 THEN '' ELSE ':' || ({REFLECT_PRIOR} + 1) END);
END""",
"""CREATE TRIGGER jobs_reflection_ai AFTER INSERT ON jobs
WHEN NEW.kind = 'wound_reflection'
BEGIN
  UPDATE role_wounds SET reflection_job_id = NEW.id
   WHERE id = json_extract(NEW.payload_json, '$.role_wound_id') AND reflection_job_id IS NOT NEW.id;
END""",
# ---------------------------------------------------------------- v2.2 CNS-036: khối Polaris động ≤ phần dự trữ đã tính; luật chơi in đúng số settings
"""CREATE TRIGGER sessions_polaris_reserve_i BEFORE INSERT ON sessions
WHEN NEW.polaris_tokens_rendered IS NOT NULL AND (NEW.compiled_prompt_id IS NULL OR NEW.polaris_tokens_rendered > COALESCE((
  SELECT s.token_count FROM compiled_prompt_segments s WHERE s.compiled_prompt_id = NEW.compiled_prompt_id AND s.source_kind = 'polaris'), 0))
BEGIN SELECT RAISE(ABORT, 'Polaris: khối động đã render vượt phần dự trữ (worst-case) đã tính trong ngân sách của bản ghim'); END""",
"""CREATE TRIGGER sessions_polaris_reserve_u BEFORE UPDATE OF polaris_tokens_rendered, compiled_prompt_id ON sessions
WHEN NEW.polaris_tokens_rendered IS NOT NULL AND NEW.compiled_prompt_id IS NOT NULL AND NEW.polaris_tokens_rendered > COALESCE((
  SELECT s.token_count FROM compiled_prompt_segments s WHERE s.compiled_prompt_id = NEW.compiled_prompt_id AND s.source_kind = 'polaris'), 0)
BEGIN SELECT RAISE(ABORT, 'Polaris: khối động đã render vượt phần dự trữ (worst-case) đã tính trong ngân sách của bản ghim'); END""",
f"""CREATE TRIGGER compiled_prompt_segments_rules BEFORE INSERT ON compiled_prompt_segments
WHEN NEW.source_kind = 'polaris_rules' AND NOT (
  json_extract(NEW.params_json, '$.self_reported_max_bp') IS {PCT('self_reported_max_bp')}
  AND json_extract(NEW.params_json, '$.concealment_min_bp') IS {PCT('concealment_min_bp')}
  AND json_extract(NEW.params_json, '$.harness_bp') IS {PCT('harness_bp')}
  AND instr(NEW.text, '≤' || {PCT_TXT(PCT('self_reported_max_bp'))} || ' %') > 0
  AND instr(NEW.text, '≥' || {PCT_TXT(PCT('concealment_min_bp'))} || ' %') > 0
  AND instr(NEW.text, ' ' || {PCT_TXT(PCT('harness_bp'))} || ' %') > 0
  AND json_extract(NEW.params_json, '$.self_confessed_harness_as_self_reported') IS {SETTING_BOOL(SELF_CONFESSED, 1)}
  AND (instr(NEW.text, 'tự khai') > 0) = ({SETTING_BOOL(SELF_CONFESSED, 1)} = 1)
  AND instr(NEW.text, 'owner cấp') = 0
  AND instr(NEW.text, '₲ kiếm được chỉ từ việc đã được duyệt/đánh giá') > 0          -- v2.2.4 (CNS-068): đúng với số dư thật (có vốn/cấp)
  AND instr(NEW.text, 'tự báo lỗi trước khi bị phát hiện') > 0)                       -- v2.2.4 (CNS-058): khoan hồng chỉ khi tự nguyện
BEGIN SELECT RAISE(ABORT, 'Polaris: luật chơi P1–P4 phải in đúng số + luật tự khai từ settings, P1 "₲ kiếm được chỉ từ việc đã được duyệt/đánh giá", P2 "tự báo lỗi trước khi bị phát hiện", không quảng cáo "owner cấp" (v_penalty_presets)'); END""",
# ---------------------------------------------------------------- v2.2 CNS-038: phiên + probe chạy trong container của consumer
f"""CREATE TRIGGER sessions_consumer_ct_i BEFORE INSERT ON sessions
WHEN {CONSUMER_CT}
BEGIN SELECT RAISE(ABORT, '{MSG_038}'); END""",
f"""CREATE TRIGGER sessions_consumer_ct_u BEFORE UPDATE OF engine_account_id, container_id ON sessions
WHEN {CONSUMER_CT}
BEGIN SELECT RAISE(ABORT, '{MSG_038}'); END""",
f"""CREATE TRIGGER probe_runs_consumer_ct_i BEFORE INSERT ON probe_runs
WHEN {CONSUMER_CT}
BEGIN SELECT RAISE(ABORT, '{MSG_038}'); END""",
f"""CREATE TRIGGER probe_runs_consumer_ct_u BEFORE UPDATE OF engine_account_id, container_id ON probe_runs
WHEN {CONSUMER_CT}
BEGIN SELECT RAISE(ABORT, '{MSG_038}'); END""",
# ---------------------------------------------------------------- v2.2 (security review): twin _u của các guard trước đây chỉ có INSERT
"""CREATE TRIGGER engine_bindings_container_u BEFORE UPDATE OF consumer_kind, role_id, workspace_id ON engine_bindings
WHEN NOT EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = NEW.workspace_id AND c.deleted_at IS NULL
                 AND ((NEW.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = NEW.role_id)
                   OR (NEW.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'engine_bindings: container của consumer phải có trước (login chạy bên trong nó)'); END""",
f"""CREATE TRIGGER sessions_wounded_u BEFORE UPDATE OF role_id, agent_kind ON sessions
WHEN NEW.agent_kind = 'role' AND NEW.role_id IS NOT NULL AND (NEW.role_id IS NOT OLD.role_id OR NEW.agent_kind IS NOT OLD.agent_kind)
 AND {OPEN_WOUND.format(r='NEW.role_id')}
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: đang ngủ, không có phiên làm việc/heartbeat'); END""",
"""CREATE TRIGGER change_sets_polaris_u BEFORE UPDATE OF proposed_by ON change_sets
WHEN NEW.proposed_by IS NOT OLD.proposed_by AND (SELECT kind FROM actors WHERE id = NEW.proposed_by) = 'role' AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.change_set_id = NEW.id AND p.subject_kind = 'proposal'
    AND p.role_id = (SELECT role_id FROM actors WHERE id = NEW.proposed_by))
BEGIN SELECT RAISE(ABORT, 'Polaris: đề xuất do Role khởi xướng phải có polaris_checks'); END""",
"""CREATE TRIGGER permission_requests_polaris_u BEFORE UPDATE OF role_id ON permission_requests
WHEN NEW.role_id IS NOT OLD.role_id AND NOT EXISTS (SELECT 1 FROM polaris_checks p WHERE p.permission_request_id = NEW.id AND p.role_id = NEW.role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role xin quyền phải có polaris_checks'); END""",
"""CREATE TRIGGER jobs_reflection_bu BEFORE UPDATE OF kind, payload_json, dedupe_key, created_by ON jobs
WHEN (OLD.kind = 'wound_reflection' OR NEW.kind = 'wound_reflection')
 AND (NEW.kind IS NOT OLD.kind OR NEW.payload_json IS NOT OLD.payload_json OR NEW.dedupe_key IS NOT OLD.dedupe_key
      OR NEW.created_by IS NOT OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'tự xét lỗi: kind/payload/dedupe_key/created_by của job ghi một lần — chạy lại = job mới'); END""",
# ---------------------------------------------------------------- v2.2.5 (INT-20, Ryan 2026-10-15): Core agent — AI Hệ thống chạy trên MỘT loại CLI
# Mọi lối làm một binding hệ thống SỐNG trỏ tới tài khoản khác loại Core agent: INSERT; UPDATE engine_account_id / consumer_kind
# (role → system) / workspace_id / deleted_at (khôi phục binding cũ); UPDATE engine_slug của chính tài khoản (engine_accounts_core_agent_u).
] + _pair('engine_bindings_one_per_engine', 'engine_bindings',
          # v2.2.8 (CONTRACT-r8 §A): UNIQUE sống (consumer, loại CLI). Lối vào: INSERT; UPDATE engine_account_id (trỏ tài khoản khác loại khác),
          # consumer_kind / role_id (chuyển binding sang consumer đã có loại đó), workspace_id, deleted_at (khôi phục binding cũ). Phía tài khoản:
          # engine_accounts_one_per_engine_u (đổi engine_slug của tài khoản đang có binding sống).
          f"NEW.deleted_at IS NULL AND {ONE_PER_ENGINE('NEW', '(SELECT na.engine_slug FROM engine_accounts na WHERE na.id = NEW.engine_account_id)')}",
          MSG_ONE, ['engine_account_id', 'consumer_kind', 'role_id', 'workspace_id', 'deleted_at']) + [
# một chiều (UPDATE): tài khoản MỚI chưa có binding nên INSERT tài khoản không làm trùng — lối INSERT là engine_bindings_one_per_engine_i
f"""CREATE TRIGGER engine_accounts_one_per_engine_u BEFORE UPDATE OF engine_slug ON engine_accounts
WHEN NEW.engine_slug IS NOT OLD.engine_slug AND EXISTS (SELECT 1 FROM engine_bindings nb WHERE nb.engine_account_id = NEW.id
  AND nb.deleted_at IS NULL AND {ONE_PER_ENGINE('nb', 'NEW.engine_slug')})
BEGIN SELECT RAISE(ABORT, '{MSG_ONE}'); END""",
] + _pair('engine_bindings_core_agent', 'engine_bindings',
          # v2.2.10 (CONTRACT-r8c §A): luật chỉ xét binding ĐANG BẬT — binding Hệ thống cũ đã tắt khi owner đổi loại (khác loại, giữ làm lịch sử) không
          # vi phạm; bật lại nó khi loại chưa khớp = lối vào mới (UPDATE is_enabled)
          f"NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL AND NEW.is_enabled = 1 "
          f"AND (SELECT engine_slug FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT {CORE()}",
          MSG_CORE, ['consumer_kind', 'engine_account_id', 'workspace_id', 'deleted_at', 'is_enabled']) + [
# lối INSERT của luật này là engine_bindings_core_agent_i (tài khoản mới chưa có binding); ở đây chặn đổi loại CLI của tài khoản đang phục vụ Hệ thống
# (v2.2.10: binding Hệ thống sống + BẬT — CONTRACT-r8c §A)
f"""CREATE TRIGGER engine_accounts_core_agent_u BEFORE UPDATE OF engine_slug, workspace_id ON engine_accounts
WHEN NEW.engine_slug IS NOT {CORE()} AND EXISTS (SELECT 1 FROM engine_bindings b WHERE b.engine_account_id = NEW.id
  AND b.consumer_kind = 'system' AND b.deleted_at IS NULL AND b.is_enabled = 1)
BEGIN SELECT RAISE(ABORT, '{MSG_CORE}'); END""",
# v2.2.6 (A3): bỏ engine_bindings_system_agent_u — tác tử hệ thống không còn trỏ binding (tài khoản suy ra = binding Core agent chính,
# v_system_agents), nên không còn đường "SA trỏ binding Role rồi đổi loại CLI". Lật binding hệ thống cuối cùng: engine_bindings_core_agent_last_u.
# ST-0017 system.core_agent_engine: ghi sẵn khi tạo workspace; slug engine ready/beta; chỉ owner/admin (system lúc dựng);
# CHỈ ĐỌC kể từ mốc workspaces.core_agent_locked_at (v2.2.9, CONTRACT-r8b §A: lần kiểm đăng nhập ĐẠT đầu tiên của tài khoản Core agent — lớp phụ:
# tài khoản Core agent đã từng kiểm đạt; v2.2.6–v2.2.8: từ binding đầu tiên) — chặn UPDATE, xoá mềm, xoá cứng, đổi khoá, và INSERT làm đổi giá trị
# hiệu lực. Trước mốc: Onboarding bước 2 có ô "Loại Core agent" (v2.2.8: mặc định Antigravity, Q-I5 [CHỐT]; danh sách = v_core_agent_options —
# core_capable, chỉ chọn được loại ready); đang gắn tài khoản mà chưa đạt kiểm đăng nhập ⇒ settings_core_agent_bound_* (gỡ tài khoản trước).
# v2.2.10 (CONTRACT-r8c §A, Q-R8a [CHỐT — Ryan 2026-10-16]): ngoại lệ DUY NHẤT của "chỉ đọc" = đổi loại khi Core agent đang SỰ CỐ (TYPE_CHANGE_I/_U:
# mode recovery + is_incident 1, sang loại khác) — rồi qua thêm hai cổng: chỉ OWNER (OWNER_ONLY, không gồm admin) và loại đích đòi đồng ý ⇒ có đồng ý MỚI
# (CONSENT_FRESH); loại đích core_capable + ready vẫn do CORE_VALID. Lúc ok / đang đăng nhập lại / đang đổi loại (không phải sự cố) ⇒ vẫn MSG_CORE_RO.
# v2.2.11 (CONTRACT-r8d §B): đổi VỀ loại đã có tài khoản AI Hệ thống (bật lại binding cũ) mà đồng ý của chính tài khoản đó còn hợp lệ ⇒ không cần CN- mới
# (CONSENT_REUSE); hết hiệu lực (rút / version cũ / danh tính khác) ⇒ vẫn CN- mới. (CONTRACT-r8d §E): đăng nhập bỏ dở quá 15 phút = sự cố ⇒ cổng mở lại.
# Xoá mềm / xoá cứng / đổi khoá sau mốc: vẫn chặn (đổi loại chỉ bằng UPDATE giá trị, hoặc INSERT khi workspace chưa có hàng).
f"""CREATE TRIGGER settings_core_agent_i BEFORE INSERT ON settings
WHEN NEW.key = '{CORE_KEY}'
BEGIN
  SELECT RAISE(ABORT, 'settings: {CORE_KEY} {MSG_CORE_VALID}')
   WHERE NEW.deleted_at IS NULL AND NOT ({CORE_VALID});
  SELECT RAISE(ABORT, 'settings: {CORE_KEY} chỉ owner/admin ghi (actor system lúc dựng workspace)')
   WHERE NOT {CORE_WRITER_I};
  SELECT RAISE(ABORT, '{MSG_CORE_RO}')
   WHERE NEW.deleted_at IS NULL AND {CORE_LOCKED('NEW.workspace_id')} AND json_extract(NEW.value_json, '$') IS NOT {CORE()}
     AND NOT {TYPE_CHANGE_I()};
  SELECT RAISE(ABORT, '{MSG_TC_OWNER}')
   WHERE {TYPE_CHANGE_I()} AND NOT {OWNER_ONLY(ACTOR)};
  SELECT RAISE(ABORT, '{MSG_TC_CONSENT}')
   WHERE {TYPE_CHANGE_I()} AND NOT {CONSENT_FRESH('NEW.workspace_id', "json_extract(NEW.value_json, '$')")}
     AND NOT {CONSENT_REUSE('NEW.workspace_id', "json_extract(NEW.value_json, '$')")};
END""",
f"""CREATE TRIGGER settings_core_agent_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN NEW.key = '{CORE_KEY}' OR OLD.key = '{CORE_KEY}'
BEGIN
  SELECT RAISE(ABORT, '{MSG_CORE_RO}')
   WHERE ({CORE_LOCKED('OLD.workspace_id')} OR {CORE_LOCKED('NEW.workspace_id')})
     AND (NEW.key IS NOT OLD.key OR NEW.value_json IS NOT OLD.value_json OR NEW.deleted_at IS NOT OLD.deleted_at
          OR NEW.workspace_id IS NOT OLD.workspace_id)
     AND NOT {TYPE_CHANGE_U()};
  SELECT RAISE(ABORT, 'settings: {CORE_KEY} {MSG_CORE_VALID}')
   WHERE NEW.key = '{CORE_KEY}' AND NEW.deleted_at IS NULL AND NOT ({CORE_VALID});
  SELECT RAISE(ABORT, 'settings: {CORE_KEY} chỉ owner/admin sửa (updated_by)')
   WHERE NOT {OWNER_ADMIN(ACTOR)};
  SELECT RAISE(ABORT, '{MSG_TC_OWNER}')
   WHERE {TYPE_CHANGE_U()} AND NOT {OWNER_ONLY(ACTOR)};
  SELECT RAISE(ABORT, '{MSG_TC_CONSENT}')
   WHERE {TYPE_CHANGE_U()} AND NOT {CONSENT_FRESH('NEW.workspace_id', "json_extract(NEW.value_json, '$')")}
     AND NOT {CONSENT_REUSE('NEW.workspace_id', "json_extract(NEW.value_json, '$')")};
END""",
# v2.2.10 (CONTRACT-r8c §A): cùng câu lệnh đổi ST-0017 ⇒ binding Hệ thống sống + BẬT khác loại mới bị TẮT (không xoá; tài khoản cũ giữ nguyên) — bất biến
# "binding Hệ thống bật cùng loại Core agent" đúng sau MỌI câu lệnh, và "không gỡ Core agent cuối cùng" (engine_bindings_core_agent_last_*) không cần nới
# (binding cũ đã khác loại hiệu lực nên không còn là "Core agent"). Trước mốc khoá, settings_core_agent_bound_* đã đòi gỡ binding trước ⇒ ở đây không có gì
# để tắt. Lối vào: UPDATE value_json; INSERT (workspace chưa có hàng ST-0017).
f"""CREATE TRIGGER settings_core_agent_type_change_au AFTER UPDATE OF value_json ON settings
WHEN NEW.key = '{CORE_KEY}' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$')
BEGIN UPDATE engine_bindings SET is_enabled = 0, updated_at = {TS_FRESH_U}, updated_by = NEW.updated_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND consumer_kind = 'system' AND deleted_at IS NULL AND is_enabled = 1
    AND (SELECT ta.engine_slug FROM engine_accounts ta WHERE ta.id = engine_account_id) IS NOT json_extract(NEW.value_json, '$'); END""",
f"""CREATE TRIGGER settings_core_agent_type_change_ai AFTER INSERT ON settings
WHEN NEW.key = '{CORE_KEY}' AND NEW.deleted_at IS NULL
BEGIN UPDATE engine_bindings SET is_enabled = 0, updated_at = {TS_FRESH_I}, updated_by = NEW.created_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND consumer_kind = 'system' AND deleted_at IS NULL AND is_enabled = 1
    AND (SELECT ta.engine_slug FROM engine_accounts ta WHERE ta.id = engine_account_id) IS NOT json_extract(NEW.value_json, '$'); END""",
f"""CREATE TRIGGER settings_core_agent_d BEFORE DELETE ON settings
WHEN OLD.key = '{CORE_KEY}' AND OLD.deleted_at IS NULL AND {CORE_LOCKED('OLD.workspace_id')}
BEGIN SELECT RAISE(ABORT, '{MSG_CORE_RO}'); END""",
# v2.2.9 (CONTRACT-r8b §A, CNS-099): TRƯỚC mốc khoá mà đang có binding Hệ thống sống ⇒ ST-0017 đứng yên (giữ bất biến "mọi binding Hệ thống sống
# cùng loại Core agent" từ phía settings — trước đây mốc khoá lúc ghi binding lo việc này). "Chọn loại khác" = gỡ binding + tài khoản Core agent
# (được, vì chưa khoá — engine_*_core_agent_last_* chỉ áp từ mốc) rồi mới đổi ST-0017. Chỉ bắn khi CHƯA khoá (đã khoá: settings_core_agent_i/_u/_d).
# Lối vào: INSERT làm giá trị khác loại binding; UPDATE key / value_json / deleted_at / workspace_id; DELETE (hiệu lực rơi về mặc định).
f"""CREATE TRIGGER settings_core_agent_bound_i BEFORE INSERT ON settings
WHEN NEW.key = '{CORE_KEY}' AND NEW.deleted_at IS NULL AND NOT {CORE_LOCKED('NEW.workspace_id')}
 AND {SYS_BOUND_OTHER('NEW.workspace_id', "json_extract(NEW.value_json, '$')")}
BEGIN SELECT RAISE(ABORT, '{MSG_CORE_BOUND}'); END""",
f"""CREATE TRIGGER settings_core_agent_bound_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = '{CORE_KEY}' OR OLD.key = '{CORE_KEY}')
 AND NOT {CORE_LOCKED('OLD.workspace_id')} AND NOT {CORE_LOCKED('NEW.workspace_id')}
 AND ({SYS_BOUND('OLD.workspace_id')} OR {SYS_BOUND('NEW.workspace_id')})
 AND (NEW.key IS NOT OLD.key OR NEW.value_json IS NOT OLD.value_json OR NEW.deleted_at IS NOT OLD.deleted_at
      OR NEW.workspace_id IS NOT OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, '{MSG_CORE_BOUND}'); END""",
f"""CREATE TRIGGER settings_core_agent_bound_d BEFORE DELETE ON settings
WHEN OLD.key = '{CORE_KEY}' AND OLD.deleted_at IS NULL AND NOT {CORE_LOCKED('OLD.workspace_id')} AND {SYS_BOUND('OLD.workspace_id')}
BEGIN SELECT RAISE(ABORT, '{MSG_CORE_BOUND}'); END""",
# ---------------------------------------------------------------- v2.2.8 (CONTRACT-r7 §A, OB-05): chưa đồng ý điều khoản thì không đăng nhập / chạy CLI
# Mọi probe (kiểm đăng nhập, quét khả năng…) của tài khoản thuộc engine đòi consent phải có đồng ý hợp lệ — gồm cả khi consent đã RÚT hoặc lời
# cảnh báo đã đổi version sau khi tạo tài khoản. UPDATE: engine_account_id / trigger của probe_runs bất biến (guard sinh tự động).
f"""CREATE TRIGGER probe_runs_consent_i BEFORE INSERT ON probe_runs
WHEN NOT (SELECT {CONSENT_OK('pa')} FROM engine_accounts pa WHERE pa.id = NEW.engine_account_id)
BEGIN SELECT RAISE(ABORT, 'Clause 6 / OB-05: tài khoản chưa có đồng ý điều khoản hợp lệ (chưa đồng ý, đã rút hoặc lời cảnh báo đã đổi) — không đăng nhập / probe được'); END""",
# ---------------------------------------------------------------- v2.2.7 (CNS-092): danh mục engine — không hạ điều kiện Core agent của engine ĐANG dùng
# Lối giữ bất biến "ST-0017 hiệu lực luôn trỏ engine core_capable + ready" ở phía danh mục: UPDATE core_capable / adapter_status / slug, DELETE.
# INSERT engine mới không làm hỏng bất biến (không workspace nào đang trỏ tới) — không cần guard. Phía settings: settings_core_agent_i/_u (CORE_VALID).
f"""CREATE TRIGGER engines_core_capable_u BEFORE UPDATE OF core_capable, adapter_status, slug ON engines
WHEN OLD.core_capable = 1 AND OLD.adapter_status = 'ready'
 AND NOT (NEW.core_capable = 1 AND NEW.adapter_status = 'ready' AND NEW.slug IS OLD.slug)
 AND {CORE_IN_USE('OLD.slug')}
BEGIN SELECT RAISE(ABORT, '{MSG_CORE_CAT}'); END""",
f"""CREATE TRIGGER engines_core_capable_d BEFORE DELETE ON engines
WHEN {CORE_IN_USE('OLD.slug')}
BEGIN SELECT RAISE(ABORT, '{MSG_CORE_CAT}'); END""",
# ---------------------------------------------------------------- v2.2.7 (CNS-093): container AI Hệ thống cuối cùng — ép suốt vòng đời
# Lối làm workspace mất container hệ thống sống khi còn binding Hệ thống sống: UPDATE deleted_at / kind / role_id / desired_state = 'absent'
# (supervisor gỡ container Docker) / workspace_id (đã bất biến — containers_ident); DELETE. INSERT không làm giảm (và partial UNIQUE
# ux_ct_system chỉ cho một container hệ thống sống mỗi workspace) — không cần guard. Dựng lại container = sửa tại chỗ hàng CT-0001.
f"""CREATE TRIGGER containers_system_last_u BEFORE UPDATE OF deleted_at, kind, role_id, desired_state, workspace_id ON containers
WHEN {SYS_CT_LIVE.format(a='OLD')}
 AND NOT ({SYS_CT_LIVE.format(a='NEW')} AND NEW.workspace_id IS OLD.workspace_id)
 AND EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM containers oc WHERE oc.workspace_id = OLD.workspace_id AND oc.id <> OLD.id AND {SYS_CT_LIVE.format(a='oc')})
BEGIN SELECT RAISE(ABORT, '{MSG_CT_LAST}'); END""",
f"""CREATE TRIGGER containers_system_last_d BEFORE DELETE ON containers
WHEN {SYS_CT_LIVE.format(a='OLD')}
 AND EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM containers oc WHERE oc.workspace_id = OLD.workspace_id AND oc.id <> OLD.id AND {SYS_CT_LIVE.format(a='oc')})
BEGIN SELECT RAISE(ABORT, '{MSG_CT_LAST}'); END""",
# ---------------------------------------------------------------- v2.2.6 (CONTRACT-r6 A4): "luôn bắt buộc" ép CẢ VÒNG ĐỜI
# Mọi Role mới (không chỉ Role đầu tiên — thay roles_core_agent_first_i) đòi ≥1 tài khoản Core agent SẴN SÀNG: Khai sinh cần Interviewer
# chạy trên Core agent. Không cần twin _u: cột bị ràng buộc duy nhất là roles.workspace_id, đã bất biến (roles_ident) — test thử lối UPDATE.
# Khôi phục Role đã xoá mềm (deleted_at → NULL) không phải tạo Role (không cần Interviewer) — không chặn. Role đã có vẫn làm việc bằng tài khoản riêng
# (Q-I7 [CHỐT — Ryan 2026-10-16]: "có, role vẫn chạy tiếp" — DB chỉ chặn tạo Role mới và phiên AI Hệ thống, không chặn phiên/heartbeat của Role).
f"""CREATE TRIGGER roles_core_agent_ready_i BEFORE INSERT ON roles
WHEN NOT EXISTS ({CORE_READY('NEW.workspace_id')})
BEGIN SELECT RAISE(ABORT, '{MSG_READY}'); END""",
# v2.2.8 (CONTRACT-r8 §C): chế độ khắc phục ở tầng DB — phiên AI Hệ thống chỉ mở trên CHÍNH tài khoản Core agent sẵn sàng (không fallback sang
# tài khoản Role / tài khoản khác / loại CLI khác). Lối vào: INSERT; UPDATE agent_kind (đổi phiên 'system'/'role' thành tác tử hệ thống) hoặc
# engine_account_id (đổi tài khoản giữa chừng = fallback). Đóng phiên đang chạy khi Core agent vừa sự cố (UPDATE status) KHÔNG bị chặn.
# Phiên agent_kind 'role' (heartbeat, chat, task) và 'system' (baseline/probe trong container Role) không thuộc luật này (Q-I7).
# v2.2.11 (CONTRACT-r8d §A, CNS-117): + câu lệnh thứ hai — tác tử của phiên (system_key = agent_kind) phải 'valid' (SA_VALID); sau khi đổi loại Core agent cả 4 là
# 'stale' tới khi app áp model của loại mới. Hai câu lệnh trong MỘT trigger, theo thứ tự (Core agent sẵn sàng trước, rồi tác tử) ⇒ mỗi trạng thái đúng một
# thông điệp. Đóng phiên đang chạy (UPDATE status) vẫn không bị chặn.
f"""CREATE TRIGGER sessions_core_agent_ready_i BEFORE INSERT ON sessions
WHEN NEW.agent_kind IN {SYS_AGENT_KINDS}
BEGIN
  SELECT RAISE(ABORT, '{MSG_SA_READY}')
   WHERE NOT EXISTS ({CORE_READY('NEW.workspace_id')} AND ca.id IS NEW.engine_account_id);
  SELECT RAISE(ABORT, '{MSG_SA_VALID}')
   WHERE NOT {SA_VALID('NEW.workspace_id', 'NEW.agent_kind')};
END""",
f"""CREATE TRIGGER sessions_core_agent_ready_u BEFORE UPDATE OF agent_kind, engine_account_id ON sessions
WHEN NEW.agent_kind IN {SYS_AGENT_KINDS} AND (NEW.agent_kind IS NOT OLD.agent_kind OR NEW.engine_account_id IS NOT OLD.engine_account_id)
BEGIN
  SELECT RAISE(ABORT, '{MSG_SA_READY}')
   WHERE NOT EXISTS ({CORE_READY('NEW.workspace_id')} AND ca.id IS NEW.engine_account_id);
  SELECT RAISE(ABORT, '{MSG_SA_VALID}')
   WHERE NOT {SA_VALID('NEW.workspace_id', 'NEW.agent_kind')};
END""",
# Không gỡ Core agent cuối cùng: mọi lối làm số binding Core agent SỐNG của workspace về 0 — xoá mềm, tắt, lật consumer, đổi tài khoản
# (sang tài khoản không active / khác loại), đổi workspace (UPDATE); xoá cứng (DELETE); vô hiệu / thu hồi / xoá mềm / đổi loại tài khoản
# (engine_accounts). Xoá cứng tài khoản đang có binding: FK engine_bindings.engine_account_id (NO ACTION) chặn sẵn. Đổi priority không đụng guard.
# v2.2.8 (CONTRACT-r8 §A): chỉ có MỘT binding Hệ thống (engine_bindings_one_per_engine_*) ⇒ "cuối cùng" = "duy nhất"; đổi tài khoản = đăng nhập
# lại trên CÙNG binding (không thêm-trước-gỡ-sau). Sự cố bên ngoài (hết hạn / outage / hết quota / bị khoá) không chặn được ⇒ chế độ khắc phục:
# OB-04 err, v_core_agent_status.mode = 'recovery', v_attention danger, chặn Role mới (roles_core_agent_ready_i) + phiên AI Hệ thống (sessions_core_agent_ready_*).
# v2.2.9 (CONTRACT-r8b §A, CNS-099): ba guard này chỉ áp TỪ MỐC KHOÁ (CORE_LOCKED). Trước mốc (mode setup — chưa lần kiểm đăng nhập nào đạt, nên
# chưa thể có Role: roles_core_agent_ready_i) owner gỡ được tài khoản + binding Core agent để "Chọn loại khác" (vd đăng nhập agy hỏng ⇒ Claude Code).
f"""CREATE TRIGGER engine_bindings_core_agent_last_u BEFORE UPDATE OF deleted_at, is_enabled, consumer_kind, role_id, engine_account_id, workspace_id ON engine_bindings
WHEN OLD.consumer_kind = 'system' AND OLD.deleted_at IS NULL AND OLD.is_enabled = 1
 AND EXISTS (SELECT 1 FROM engine_accounts oa WHERE oa.id = OLD.engine_account_id AND oa.deleted_at IS NULL AND oa.status = 'active'
             AND oa.engine_slug = {CORE('OLD.workspace_id')})
 AND NOT (NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL AND NEW.is_enabled = 1 AND NEW.workspace_id IS OLD.workspace_id
          AND EXISTS (SELECT 1 FROM engine_accounts na WHERE na.id = NEW.engine_account_id AND na.deleted_at IS NULL AND na.status = 'active'
                      AND na.engine_slug = {CORE('OLD.workspace_id')}))
 AND NOT {CORE_LIVE('OLD.workspace_id', 'AND xb.id <> OLD.id')} AND {CORE_LOCKED('OLD.workspace_id')}
BEGIN SELECT RAISE(ABORT, '{MSG_LAST}'); END""",
f"""CREATE TRIGGER engine_bindings_core_agent_last_d BEFORE DELETE ON engine_bindings
WHEN OLD.consumer_kind = 'system' AND OLD.deleted_at IS NULL AND OLD.is_enabled = 1
 AND EXISTS (SELECT 1 FROM engine_accounts oa WHERE oa.id = OLD.engine_account_id AND oa.deleted_at IS NULL AND oa.status = 'active'
             AND oa.engine_slug = {CORE('OLD.workspace_id')})
 AND NOT {CORE_LIVE('OLD.workspace_id', 'AND xb.id <> OLD.id')} AND {CORE_LOCKED('OLD.workspace_id')}
BEGIN SELECT RAISE(ABORT, '{MSG_LAST}'); END""",
f"""CREATE TRIGGER engine_accounts_core_agent_last_u BEFORE UPDATE OF status, deleted_at, workspace_id, engine_slug ON engine_accounts
WHEN OLD.deleted_at IS NULL AND OLD.status = 'active' AND OLD.engine_slug = {CORE('OLD.workspace_id')}
 AND EXISTS (SELECT 1 FROM engine_bindings ob WHERE ob.engine_account_id = OLD.id AND ob.workspace_id = OLD.workspace_id
             AND ob.consumer_kind = 'system' AND ob.deleted_at IS NULL AND ob.is_enabled = 1)
 AND NOT (NEW.deleted_at IS NULL AND NEW.status = 'active' AND NEW.workspace_id IS OLD.workspace_id AND NEW.engine_slug IS OLD.engine_slug)
 AND NOT {CORE_LIVE('OLD.workspace_id', 'AND xa.id <> OLD.id')} AND {CORE_LOCKED('OLD.workspace_id')}
BEGIN SELECT RAISE(ABORT, '{MSG_LAST}'); END""",
# ---------------------------------------------------------------- v2.2.6 (A5) → v2.2.9 (CONTRACT-r8b §A): mốc core_agent_locked_at — ghi MỘT lần, không xoá
# v2.2.9: mốc = lần kiểm đăng nhập ĐẠT đầu tiên (probe_runs trigger 'login_check', status 'ok') của tài khoản Core agent (CORE_PROBE: trong container
# AI Hệ thống của workspace + tài khoản đang có binding Hệ thống sống) = finished_at của lần kiểm đó. Lối vào: INSERT probe đã xong 'ok'; UPDATE
# status running → ok (hoặc container_id ghi muộn — write-once). v2.2.6–v2.2.8: engine_bindings_core_lock_ai/_au ghi lúc có binding đầu tiên — đã bỏ.
# v2.2.10 (CONTRACT-r8c §A): + "KHOÁ LẠI" sau khi owner đổi loại lúc sự cố — mốc = lần kiểm đạt ĐẦU TIÊN của tài khoản Core agent HIỆN TẠI (CORE_FIRST_OK_AT:
# binding sống + bật, đúng loại ST-0017) khi lần đó muộn hơn mốc cũ (tài khoản mới gắn sau mốc chỉ có thể đến từ đổi loại: một tài khoản mỗi loại + binding
# khác loại bị chặn). Lần đổi được ghi ở events/audit core_agent.type_changed. Tài khoản gốc: lần đạt đầu tiên = chính mốc ⇒ câu lệnh thứ hai không đổi gì.
f"""CREATE TRIGGER probe_runs_core_lock_ai AFTER INSERT ON probe_runs
WHEN NEW.trigger = 'login_check' AND NEW.status = 'ok' AND {CORE_PROBE('NEW')}
BEGIN
  UPDATE workspaces SET core_agent_locked_at = NEW.finished_at WHERE id = NEW.workspace_id AND core_agent_locked_at IS NULL;
  UPDATE workspaces SET core_agent_locked_at = {CORE_FIRST_OK_AT('NEW.workspace_id')}
   WHERE id = NEW.workspace_id AND core_agent_locked_at < {CORE_FIRST_OK_AT('NEW.workspace_id')};
END""",
f"""CREATE TRIGGER probe_runs_core_lock_au AFTER UPDATE OF status, container_id ON probe_runs
WHEN NEW.trigger = 'login_check' AND NEW.status = 'ok' AND {CORE_PROBE('NEW')}
BEGIN
  UPDATE workspaces SET core_agent_locked_at = NEW.finished_at WHERE id = NEW.workspace_id AND core_agent_locked_at IS NULL;
  UPDATE workspaces SET core_agent_locked_at = {CORE_FIRST_OK_AT('NEW.workspace_id')}
   WHERE id = NEW.workspace_id AND core_agent_locked_at < {CORE_FIRST_OK_AT('NEW.workspace_id')};
END""",
# guard mốc: ghi một lần; ngoại lệ duy nhất (v2.2.10) = khoá lại ĐÚNG bằng CORE_FIRST_OK_AT và muộn hơn mốc cũ (không lùi, không đặt tuỳ ý, không xoá)
f"""CREATE TRIGGER workspaces_core_lock_u BEFORE UPDATE OF core_agent_locked_at ON workspaces
WHEN OLD.core_agent_locked_at IS NOT NULL AND NEW.core_agent_locked_at IS NOT OLD.core_agent_locked_at
 AND NOT (NEW.core_agent_locked_at > OLD.core_agent_locked_at AND NEW.core_agent_locked_at IS {CORE_FIRST_OK_AT('OLD.id')})
BEGIN SELECT RAISE(ABORT, '{MSG_LOCK}'); END""",
# ---------------------------------------------------------------- v2.2.9 (CONTRACT-r8b §C, CNS-105): đồng ý điều khoản gắn DANH TÍNH
# Đồng ý tick TRƯỚC lần đăng nhập đầu (consents.account_hint NULL) được gắn vào danh tính ĐẦU TIÊN mà tài khoản ghi nhận (account_hint từ output CLI) —
# ở INSERT tài khoản có sẵn danh tính, UPDATE account_hint (lần đăng nhập đầu), UPDATE consent_id (tick lại ⇒ CN- mới gắn danh tính hiện tại).
# Không gắn ⇒ một cú tick phủ mọi tài khoản Google về sau (lỗ CNS-105 P6). Đổi danh tính KHÔNG bị chặn (sự thật do CLI báo) — CONSENT_OK() tự hết hiệu
# lực ⇒ không kiểm đăng nhập / probe được (probe_runs_consent_i), không sẵn sàng; trỏ lại đồng ý cũ đã gắn danh tính khác: engine_accounts_consent_u.
f"""CREATE TRIGGER engine_accounts_consent_identity_ai AFTER INSERT ON engine_accounts
WHEN NEW.account_hint IS NOT NULL AND NEW.consent_id IS NOT NULL
BEGIN UPDATE consents SET account_hint = NEW.account_hint WHERE id = NEW.consent_id AND account_hint IS NULL; END""",
f"""CREATE TRIGGER engine_accounts_consent_identity_au AFTER UPDATE OF account_hint, consent_id ON engine_accounts
WHEN NEW.account_hint IS NOT NULL AND NEW.consent_id IS NOT NULL
BEGIN UPDATE consents SET account_hint = NEW.account_hint WHERE id = NEW.consent_id AND account_hint IS NULL; END""",
] + _pair('notifications_core_incident', 'notifications',
          # v2.2.9 (CONTRACT-r8b §B/§C, CNS-105): cảnh báo Core agent (chuông O2 + tin Telegram kênh owner) chỉ khi là SỰ CỐ (= v_core_agent_status
          # .is_incident; viết bằng bảng gốc CORE_INCIDENT vì trigger không được trỏ view — runner rebuild DROP mọi view, §10.1 / M2-rebuild).
          # Đăng nhập lại (relogin_in_progress), đổi danh tính chờ đồng ý lại, chưa khoá loại (Onboarding), đang sẵn sàng ⇒ không phát.
          # v2.2.11 (CONTRACT-r8d §E): đăng nhập / đổi loại bỏ dở quá 15 phút (login_stalled) ⇒ sự cố ⇒ phát được (CORE_CALM loại LOGIN_STALLED).
          # Lối vào: INSERT; UPDATE kind / workspace_id (đổi một thông báo khác thành core_agent_incident).
          f"NEW.kind = 'core_agent_incident' AND NOT {CORE_INCIDENT('NEW.workspace_id')}",
          MSG_INCIDENT, ['kind', 'workspace_id']) + [
# ---------------------------------------------------------------- v2.2.8 (CONTRACT-r8 §B/§C): luật fallback ghi ở nơi log failover (events engine.failover)
# failover_reason enum 4 giá trị (CHECK, giữ nguyên); from/to là 2 tài khoản cùng workspace; KHÔNG phải tài khoản của AI Hệ thống (Core agent không
# fallback); CÙNG một Role (Q-R1 — danh sách ưu tiên của chính Role); KHÁC loại CLI (cùng loại không có tài khoản thứ hai — luật A; mệnh đề này là lớp
# hai của engine_bindings_one_per_engine_*). Cả 4 lý do đều cho fallback sang loại CLI kế tiếp (v2.2.6: luật cùng hãng + xoay — đã gỡ). Điểm ép chính =
# bộ chọn tài khoản ở bước ⑥; trigger là lớp hai (log không ghi được một lần chuyển trái luật). UPDATE/DELETE: events append-only (guard sinh tự động).
f"""CREATE TRIGGER events_failover_i BEFORE INSERT ON events
WHEN NEW.kind = 'engine.failover'
BEGIN
  SELECT RAISE(ABORT, 'events engine.failover: from_account_id / to_account_id phải là hai tài khoản khác nhau của cùng workspace')
   WHERE (SELECT count(*) FROM engine_accounts fa WHERE fa.workspace_id = NEW.workspace_id AND fa.id IN ({FO_FROM}, {FO_TO})) < 2;
  SELECT RAISE(ABORT, '{MSG_FO_CORE}')
   WHERE EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = NEW.workspace_id AND sb.consumer_kind = 'system'
                 AND sb.deleted_at IS NULL AND sb.engine_account_id IN ({FO_FROM}, {FO_TO}));
  SELECT RAISE(ABORT, 'events engine.failover: from/to phải là tài khoản của cùng một Role (Q-R1 — chỉ chuyển trong danh sách ưu tiên của chính Role đó)')
   WHERE NOT EXISTS (SELECT 1 FROM engine_bindings fb JOIN engine_bindings tb ON tb.workspace_id = fb.workspace_id
                     AND tb.consumer_kind = 'role' AND tb.role_id = fb.role_id AND tb.deleted_at IS NULL
                     WHERE fb.workspace_id = NEW.workspace_id AND fb.consumer_kind = 'role' AND fb.engine_account_id = {FO_FROM}
                       AND fb.deleted_at IS NULL AND tb.engine_account_id = {FO_TO});
  SELECT RAISE(ABORT, '{MSG_FO_TYPE}')
   WHERE (SELECT fa.engine_slug FROM engine_accounts fa WHERE fa.id = {FO_FROM}) IS (SELECT ta.engine_slug FROM engine_accounts ta WHERE ta.id = {FO_TO});
END""",
# ---------------------------------------------------------------- v2.2.10 (CONTRACT-r8c §A): sự kiện đổi loại Core agent — actor owner, "to" = loại hiện hành
# CHECK ở bảng: detail_json có from / to (khác nhau) / reason. Trigger: created_by là owner (OWNER_ONLY) và "to" = ST-0017 hiệu lực ⇒ sự kiện ghi SAU khi
# đổi (cùng transaction), không ghi trước / ghi khống. events append-only ⇒ không có lối UPDATE.
f"""CREATE TRIGGER events_core_type_changed_i BEFORE INSERT ON events
WHEN NEW.kind = 'core_agent.type_changed'
 AND (NOT {OWNER_ONLY(ACTOR)} OR json_extract(NEW.detail_json, '$.to') IS NOT {CORE()})
BEGIN SELECT RAISE(ABORT, '{MSG_TC_EVENT}'); END""",
# ---------------------------------------------------------------- v2.2.11 (CONTRACT-r8d — đóng CNS-117, 119, 120, 121, 123; [ĐỀ XUẤT — Gen vòng 8d])
# §A (CNS-117): ST-0017 đổi loại ⇒ 4 tác tử hệ thống 'stale' (cùng câu lệnh). Lối vào giống settings_core_agent_type_change_*: UPDATE value_json (giá trị khác);
# INSERT (workspace chưa có hàng — hiệu lực trước = mặc định CORE_DEFAULT; settings UNIQUE (workspace_id, key) nên INSERT chỉ xảy ra khi chưa có hàng nào).
# Ghi lại cùng giá trị, đăng nhập lại, sự cố rồi hết sự cố ⇒ không đổi gì. Một chiều (AFTER): đây là trigger ghi, guard tương ứng là SA_VALID ở phiên.
f"""CREATE TRIGGER settings_core_agent_sa_stale_au AFTER UPDATE OF value_json ON settings
WHEN NEW.key = '{CORE_KEY}' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$')
BEGIN UPDATE system_agents SET selection_state = 'stale', selection_checked_at = COALESCE(NEW.updated_at, {TS_DEFAULT}),
  updated_at = {TS_FRESH_U}, updated_by = NEW.updated_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND deleted_at IS NULL; END""",
f"""CREATE TRIGGER settings_core_agent_sa_stale_ai AFTER INSERT ON settings
WHEN NEW.key = '{CORE_KEY}' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT '{CORE_DEFAULT}'
BEGIN UPDATE system_agents SET selection_state = 'stale', selection_checked_at = COALESCE(NEW.updated_at, NEW.created_at),
  updated_at = {TS_FRESH_I}, updated_by = NEW.created_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND deleted_at IS NULL; END""",
# §C (CNS-120): chế độ khắc phục (CORE_RECOVERY = mode 'recovery') ⇒ không cấp thẻ mới = không thẻ nào VÀO tập "thẻ sống" {issued, suspended} (= ux_cd_live) từ
# ngoài tập: draft → issued (cấp thẻ), và hai lối vòng draft → suspended → issued, revoked / superseded → issued; INSERT issued / suspended. KHÔNG chặn
# issued ↔ suspended (Tạm ngưng / Tiếp tục của khối "Điều khiển khẩn cấp Role", Q-R8b). UPDATE workspace_id / role_id: bất biến (employee_cards_ident / _freeze).
f"""CREATE TRIGGER employee_cards_core_agent_ready_i BEFORE INSERT ON employee_cards
WHEN NEW.status IN ('issued', 'suspended') AND {CORE_RECOVERY('NEW.workspace_id')}
BEGIN SELECT RAISE(ABORT, '{MSG_CARD_RECOVERY}'); END""",
f"""CREATE TRIGGER employee_cards_core_agent_ready_u BEFORE UPDATE OF status ON employee_cards
WHEN NEW.status IN ('issued', 'suspended') AND OLD.status NOT IN ('issued', 'suspended') AND {CORE_RECOVERY('NEW.workspace_id')}
BEGIN SELECT RAISE(ABORT, '{MSG_CARD_RECOVERY}'); END""",
# §D (CNS-121) → v2.2.12 (CONTRACT-r8e §A — review bảo mật: guard v2.2.11 bị lách qua đổi tg_user_id / bot_id và DELETE; CNS-129: bot xoá mềm để lại hàng owner
# mồ côi không dọn được). BẤT BIẾN: mỗi bot Telegram CÒN SỐNG (telegram_bots.deleted_at IS NULL) luôn có ≥ 1 hàng owner active (AL_OWNER_ACTIVE). Mọi lối GIẢM:
#  (1) hàng owner active đổi tg_user_id / bot_id ⇒ chặn hẳn (câu lệnh 1; workspace_id đã bất biến — telegram_allowlist_ident). Đổi tài khoản Telegram của owner =
#      thêm hàng owner mới (capture) rồi gỡ hàng cũ;
#  (2) hàng owner active → removed / is_owner 0 / xoá mềm ⇒ chỉ khi bot còn hàng owner active KHÁC, hoặc bot đã xoá mềm (câu lệnh 2). Một câu lệnh gỡ mọi owner:
#      trigger theo hàng ⇒ hàng sau thấy hàng trước đã gỡ ⇒ chặn (câu lệnh nguyên tử);
#  (3) DELETE hàng owner ⇒ chặn trừ app_maint() = 1 (purge Role, §10.9) — kéo theo: xoá cứng telegram_bots còn hàng owner (CASCADE) ngoài purge bị chặn;
#  (4) khôi phục bot đã xoá mềm ⇒ phải có hàng owner active (telegram_bots_owner_u).
# INSERT không làm giảm. Bot mới (pending) chưa có owner cho tới khi capture — bất biến áp từ hàng owner đầu tiên (giữ trên mọi lối giảm, không ép lúc tạo bot).
f"""CREATE TRIGGER telegram_allowlist_owner_u BEFORE UPDATE OF status, is_owner, deleted_at, tg_user_id, bot_id ON telegram_allowlist
WHEN {AL_OWNER_ACTIVE.format(a='OLD')}
BEGIN
  SELECT RAISE(ABORT, '{MSG_AL_OWNER_ID}')
   WHERE NEW.tg_user_id IS NOT OLD.tg_user_id OR NEW.bot_id IS NOT OLD.bot_id;
  SELECT RAISE(ABORT, '{MSG_AL_OWNER_LAST}')
   WHERE NOT ({AL_OWNER_ACTIVE.format(a='NEW')})
     AND EXISTS (SELECT 1 FROM telegram_bots ob WHERE ob.id = OLD.bot_id AND ob.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM telegram_allowlist oa WHERE oa.bot_id = OLD.bot_id AND oa.id <> OLD.id AND {AL_OWNER_ACTIVE.format(a='oa')});
END""",
f"""CREATE TRIGGER telegram_allowlist_owner_d BEFORE DELETE ON telegram_allowlist
WHEN OLD.is_owner = 1 AND app_maint() = 0
BEGIN SELECT RAISE(ABORT, '{MSG_AL_OWNER_DEL}'); END""",
# v2.2.13 (review bảo mật HIGH): khôi phục bot — câu 1: chỉ owner của workspace (OWNER_ONLY, updated_by); câu 2 (v2.2.12): phải có hàng owner active.
f"""CREATE TRIGGER telegram_bots_owner_u BEFORE UPDATE OF deleted_at ON telegram_bots
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, '{MSG_TG_RESTORE_OWNER}')
   WHERE NOT {OWNER_ONLY(ACTOR)};
  SELECT RAISE(ABORT, '{MSG_TG_RESTORE}')
   WHERE NOT EXISTS (SELECT 1 FROM telegram_allowlist ra WHERE ra.bot_id = OLD.id AND {AL_OWNER_ACTIVE.format(a='ra')});
END""",
# v2.2.13 (review bảo mật HIGH): TRỞ THÀNH owner active — INSERT hàng owner active; UPDATE is_owner 0 → 1, status removed → active, deleted_at → NULL (kích hoạt lại),
# added_via / bot_id (đổi điều kiện) — chỉ khi capture VÀ (owner của workspace HOẶC bot chưa có owner active nào); bảo trì được miễn.
f"""CREATE TRIGGER telegram_allowlist_owner_new_i BEFORE INSERT ON telegram_allowlist
WHEN {AL_OWNER_ACTIVE.format(a='NEW')} AND app_maint() = 0
 AND NOT (NEW.added_via = 'capture' AND ({OWNER_ONLY(ACTOR)}
          OR NOT EXISTS (SELECT 1 FROM telegram_allowlist na WHERE na.bot_id = NEW.bot_id AND {AL_OWNER_ACTIVE.format(a='na')})))
BEGIN SELECT RAISE(ABORT, '{MSG_AL_OWNER_NEW}'); END""",
f"""CREATE TRIGGER telegram_allowlist_owner_new_u BEFORE UPDATE OF is_owner, status, deleted_at, added_via, bot_id ON telegram_allowlist
WHEN {AL_OWNER_ACTIVE.format(a='NEW')} AND NOT ({AL_OWNER_ACTIVE.format(a='OLD')}) AND app_maint() = 0
 AND NOT (NEW.added_via = 'capture' AND ({OWNER_ONLY(ACTOR)}
          OR NOT EXISTS (SELECT 1 FROM telegram_allowlist na WHERE na.bot_id = NEW.bot_id AND na.id <> OLD.id AND {AL_OWNER_ACTIVE.format(a='na')})))
BEGIN SELECT RAISE(ABORT, '{MSG_AL_OWNER_NEW}'); END""",
# §E (CNS-123): mốc login_started_at do DB ghi — vào 'in_progress' (INSERT; UPDATE login_status kể cả ghi lại 'in_progress' = owner mở lại PTY ⇒ đếm lại) ⇒ NOW_TS;
# rời 'in_progress' ⇒ NULL. Bỏ trigger ⇒ mốc NULL ⇒ LOGIN_STALLED fail-closed (báo động ngay) — test bắt được.
f"""CREATE TRIGGER engine_accounts_login_started_ai AFTER INSERT ON engine_accounts
WHEN NEW.login_status = 'in_progress' OR NEW.login_started_at IS NOT NULL
BEGIN UPDATE engine_accounts SET login_started_at = CASE WHEN NEW.login_status = 'in_progress' THEN {NOW_TS} END, {STAMP_IN(NOW_TS)} WHERE id = NEW.id; END""",
f"""CREATE TRIGGER engine_accounts_login_started_au AFTER UPDATE OF login_status ON engine_accounts
WHEN NEW.login_status = 'in_progress' OR OLD.login_status = 'in_progress'
BEGIN UPDATE engine_accounts SET login_started_at = CASE WHEN NEW.login_status = 'in_progress' THEN {NOW_TS} END, {STAMP_IN(NOW_TS)} WHERE id = NEW.id; END""",
# ---------------------------------------------------------------- v2.2.6 (B1.3): MỘT trần tệp đính kèm chat = setting chat.attachment_max_bytes (ST-0018, 25 MB)
# Tệp được nhận (scan_status = 'clean') không vượt trần; vượt ⇒ 'rejected' + reject_reason "> 25 MB". Hạ trần sau này không hồi tố.
f"""CREATE TRIGGER settings_attachment_max_i BEFORE INSERT ON settings
WHEN NEW.key = '{ATT_KEY}' AND NOT (
  (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND {ATT_MAX_ALLOWED}))
  AND {CORE_WRITER_I})
BEGIN SELECT RAISE(ABORT, 'settings: {ATT_KEY} phải là số nguyên byte 1–{ATT_MAX_ALLOWED}, chỉ owner/admin ghi'); END""",
f"""CREATE TRIGGER settings_attachment_max_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = '{ATT_KEY}' OR OLD.key = '{ATT_KEY}') AND NOT (
  NEW.key = '{ATT_KEY}'
  AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND {ATT_MAX_ALLOWED}))
  AND {OWNER_ADMIN(ACTOR)})
BEGIN SELECT RAISE(ABORT, 'settings: {ATT_KEY} phải là số nguyên byte 1–{ATT_MAX_ALLOWED}, chỉ owner/admin sửa (updated_by)'); END""",
] + _pair('message_attachments_max_bytes', 'message_attachments',
          f"NEW.scan_status = 'clean' AND NEW.size_bytes > {SETTING_INT(ATT_KEY, ATT_DEFAULT)}",
          f'chat: tệp vượt trần {ATT_KEY} (mặc định 25 MB) — tệp được nhận (clean) không vượt trần; vượt thì rejected + reject_reason "> 25 MB"',
          ['scan_status', 'size_bytes', 'workspace_id']) + V230_TRIGGERS + V231_TRIGGERS + V233_TRIGGERS   # v2.3.0 / v2.3.1 / v2.3.3: tạo SAU ⇒ chạy TRƯỚC guard cùng sự kiện

FTS = [
"CREATE VIRTUAL TABLE search_fts USING fts5(title_norm, body_norm, content='search_documents', content_rowid='id', tokenize='unicode61')",
"""CREATE TRIGGER search_documents_ai AFTER INSERT ON search_documents BEGIN
  INSERT INTO search_fts(rowid, title_norm, body_norm) VALUES (new.id, new.title_norm, new.body_norm);
END""",
"""CREATE TRIGGER search_documents_ad AFTER DELETE ON search_documents BEGIN
  INSERT INTO search_fts(search_fts, rowid, title_norm, body_norm) VALUES ('delete', old.id, old.title_norm, old.body_norm);
END""",
"""CREATE TRIGGER search_documents_au AFTER UPDATE ON search_documents BEGIN
  INSERT INTO search_fts(search_fts, rowid, title_norm, body_norm) VALUES ('delete', old.id, old.title_norm, old.body_norm);
  INSERT INTO search_fts(rowid, title_norm, body_norm) VALUES (new.id, new.title_norm, new.body_norm);
END""",
]

def read_views():
    here = os.path.dirname(os.path.abspath(__file__))
    return open(os.path.join(here, 'views_v2_2.sql'), encoding='utf-8').read()

_BUILT = []
def build(policy='v2', include_views=True):
    if _BUILT:
        return _BUILT[0]
    stmts = []
    for n in MVP_TABLES:
        t = T[n]
        body = std_cols(t['kind']) + t['cols']
        cons = list(t['cons'])
        if t['kind'] in ('E', 'A'):
            cons.append("UNIQUE (workspace_id, display_seq)")
        T[n]['_all_cols'] = body
        stmts.append(f"CREATE TABLE {n} (\n  " + ",\n  ".join(body + cons) + "\n)")
    for n in MVP_TABLES:
        T[n]['cols'] = T[n]['_all_cols']
        if T[n]['kind'] in ('E', 'A'):
            T[n]['cons'].append("UNIQUE (workspace_id, display_seq)")
    idx = []
    for n in MVP_TABLES:
        idx += T[n]['idx']
        idx += auto_fk_indexes(n, policy)
    # v2.2.13: chống REPLACE (sinh từ DDL) — tạo TRƯỚC mọi trigger khác ⇒ chạy SAU CÙNG trong các BEFORE trigger cùng sự kiện (SQLite chạy trigger tạo sau
    # trước; test REPLACE-guard khoá thứ tự này) ⇒ guard nghiệp vụ giữ thông điệp riêng, guard này chỉ bắt phần còn lại — vẫn trước bước giải xung đột
    trig = no_replace_triggers(stmts + idx)
    trig += actor_triggers()          # v2.3.3: guard chung người ghi — tạo sau chống REPLACE, trước mọi guard khác
    for n in MVP_TABLES:
        trig += guard_triggers(n)
    trig += BUSINESS_TRIGGERS
    out = stmts + idx + FTS + trig
    if include_views:
        out.append(read_views())
        out.append(tenant_integrity_view())
    _BUILT.append(out)
    return out

CATALOG_PARENTS = {'dna_field_defs', 'engines'}   # danh mục trộn: hàng hệ thống dùng chung được phép

def tenant_integrity_view():
    parts = []
    for n in MVP_TABLES:
        cols = cols_of(n)
        if 'workspace_id' not in cols:
            continue
        for col, ref, refcol, rest in fks(n):
            if col == 'workspace_id' or ref == 'workspaces' or ref not in T:
                continue
            if 'workspace_id' not in cols_of(ref):
                continue
            allow = f" AND p.workspace_id <> '{SYS}'" if ref in CATALOG_PARENTS else ""
            parts.append(f"SELECT '{n}.{col}' AS fk, c.workspace_id, count(*) AS n FROM {n} c JOIN {ref} p ON p.{refcol} = c.{col} "
                         f"WHERE p.workspace_id <> c.workspace_id{allow} GROUP BY c.workspace_id")
    TENANT_FK_COUNT[0] = len(parts)
    return "CREATE VIEW v_integrity_tenant AS\n" + "\nUNION ALL\n".join(parts)

TENANT_FK_COUNT = [0]

def stats(db):
    q = lambda sql: db.execute(sql).fetchone()[0]
    out = dict(tables=q("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_fts%'"),
               views=q("SELECT count(*) FROM sqlite_master WHERE type='view'"),
               triggers=q("SELECT count(*) FROM sqlite_master WHERE type='trigger'"),
               indexes_total=q("SELECT count(*) FROM sqlite_master WHERE type='index'"),
               tenant_fk_checked=TENANT_FK_COUNT[0])
    v1_extra_fk = sum(len(auto_fk_indexes(n, 'v1')) - len(auto_fk_indexes(n, 'v2')) for n in MVP_TABLES)
    disp = sum(1 for n in MVP_TABLES if T[n]['kind'] in ('E', 'A'))
    parents = {ref for n in MVP_TABLES for (_, ref, _, _) in fks(n) if ref in T and 'workspace_id' in cols_of(ref) and ref != 'workspaces'}
    out.update(v1_policy_extra_fk_indexes=v1_extra_fk, v1_unique_display_id=disp, v1_unique_ws_id=len(parents))
    return out

if __name__ == '__main__':
    stmts = build()
    sql = ";\n\n".join(s.rstrip(';') for s in stmts) + ";\n"
    here = os.path.dirname(os.path.abspath(__file__))
    open(os.path.join(here, 'schema_v2_2.sql'), 'w', encoding='utf-8').write(sql)
    print("MVP tables:", len(MVP_TABLES), "| GĐ2 reserved:", len(GD2_TABLES))
