-- kind: standard
-- compat_min_app_version: 0.0.0
-- expand_only: false
-- breaking: baseline — trước v0.1.0 được sinh lại khi DB spec đổi; từ v0.1.0 forward-only (BUILD-PLAN §D.4)
-- GENERATED bởi `pnpm db:gen` từ db/spec/schema_v2_2.sql @ Second-Brain 359e59b (DATABASE v2.3.1) — KHÔNG SỬA TAY.
-- Chỉ bảng + index (+ bảng ảo FTS5). Trigger ở R__triggers.sql, view ở R__views.sql (CNS-157).

-- @ga:object table workspaces
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  kind TEXT NOT NULL CHECK (kind IN ('system', 'tenant')),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id),
  short_code TEXT NOT NULL UNIQUE CHECK (length(short_code) = 4),
  locale TEXT NOT NULL DEFAULT 'vi',
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  currency_code TEXT NOT NULL DEFAULT 'GEN',
  currency_symbol TEXT NOT NULL DEFAULT '₲',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  archived_at TEXT,
  core_agent_locked_at TEXT,
  restored_at TEXT,
  CHECK ((kind = 'system') = (id = '00000000000000000000000000'))
);

-- @ga:object table users
CREATE TABLE users (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL UNIQUE CHECK (display_seq > 0),
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  password_changed_at TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  locale TEXT,
  timezone TEXT,
  theme TEXT CHECK (theme IS NULL OR theme IN ('dark', 'light', 'system')),
  avatar_blob_id TEXT REFERENCES blobs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  disabled_at TEXT
);

-- @ga:object table workspace_members
CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  access_level TEXT NOT NULL CHECK (access_level IN ('owner', 'admin', 'operator', 'viewer')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  removed_at TEXT,
  PRIMARY KEY (workspace_id, user_id)
);

-- @ga:object table auth_sessions
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  ip TEXT,
  user_agent TEXT,
  revoked_at TEXT
);

-- @ga:object table actors
CREATE TABLE actors (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL CHECK (kind IN ('user', 'role', 'system')),
  user_id TEXT REFERENCES users(id),
  role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
  system_key TEXT CHECK (system_key IS NULL OR system_key IN ('system', 'interviewer', 'trainer', 'consolidator', 'judge', 'scheduler', 'gateway', 'updater', 'telegram', 'assistant')),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  purged_at TEXT,
  CHECK (
    (kind = 'user'   AND user_id IS NOT NULL AND role_id IS NULL AND system_key IS NULL AND purged_at IS NULL) OR
    (kind = 'role'   AND user_id IS NULL AND system_key IS NULL AND (role_id IS NOT NULL OR purged_at IS NOT NULL)) OR
    (kind = 'system' AND system_key IS NOT NULL AND user_id IS NULL AND role_id IS NULL AND purged_at IS NULL)),
  UNIQUE (workspace_id, user_id),
  UNIQUE (role_id),
  UNIQUE (workspace_id, system_key)
);

-- @ga:object table id_counters
CREATE TABLE id_counters (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  prefix TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  PRIMARY KEY (workspace_id, prefix)
);

-- @ga:object table id_aliases
CREATE TABLE id_aliases (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_display_id TEXT NOT NULL,
  source_code TEXT NOT NULL,
  new_display_id TEXT NOT NULL,
  import_revision_id TEXT,
  UNIQUE (workspace_id, source_code, old_display_id)
);

-- @ga:object table roles
CREATE TABLE roles (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('saffron', 'coral', 'rose', 'orchid', 'iris', 'azure', 'teal', 'jade', 'moss', 'olive', 'clay', 'slate')),
  description TEXT,
  avatar_id TEXT REFERENCES avatars(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft' CHECK (lifecycle_status IN ('draft', 'born', 'training', 'candidate', 'carded', 'suspended', 'archived')),
  runtime_state TEXT NOT NULL DEFAULT 'none' CHECK (runtime_state IN ('none', 'sleeping', 'starting', 'running', 'error', 'stopped')),
  runtime_detail TEXT,
  runtime_state_at TEXT,
  condition TEXT NOT NULL DEFAULT 'normal' CHECK (condition IN ('normal', 'wounded')),
  born_at TEXT,
  registry_no TEXT,
  birth_revision_id TEXT REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED,
  current_revision_id TEXT REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED,
  dna_schema_version TEXT NOT NULL DEFAULT '1',
  prompt_budget_tokens INTEGER NOT NULL DEFAULT 2000 CHECK (prompt_budget_tokens BETWEEN 200 AND 8000),
  brain_head_sha TEXT,
  last_active_at TEXT,
  CHECK (lifecycle_status = 'draft' OR born_at IS NOT NULL),
  CHECK ((born_at IS NULL) = (registry_no IS NULL)),
  UNIQUE (workspace_id, registry_no),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table avatars
CREATE TABLE avatars (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('upload', 'generated', 'monogram', 'library')),
  blob_id TEXT REFERENCES blobs(id),
  mime TEXT CHECK (mime IS NULL OR mime IN ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes <= 5242880),
  width INTEGER,
  height INTEGER,
  crop_x REAL,
  crop_y REAL,
  crop_zoom REAL CHECK (crop_zoom IS NULL OR crop_zoom BETWEEN 1.0 AND 3.0),
  skin_asset_id TEXT REFERENCES skin_assets(id) ON DELETE SET NULL,
  skin_pack_slug TEXT,
  skin_asset_code TEXT,
  skin_license TEXT,
  skin_attribution TEXT,
  skin_sha256 TEXT,
  CHECK ((source IN ('monogram', 'library')) = (blob_id IS NULL)),
  CHECK ((source = 'library') = (skin_asset_code IS NOT NULL)),
  CHECK (source <> 'library' OR (skin_pack_slug IS NOT NULL AND skin_license IS NOT NULL AND skin_sha256 IS NOT NULL)),
  CHECK (source = 'library' OR skin_asset_id IS NULL),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table skin_assets
CREATE TABLE skin_assets (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  pack_slug TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  asset_code TEXT NOT NULL,
  asset_kind TEXT NOT NULL DEFAULT 'portrait' CHECK (asset_kind IN ('portrait', 'chibi')),
  name_vi TEXT NOT NULL,
  name_zh TEXT,
  faction TEXT,
  file_path TEXT,
  mime TEXT CHECK (mime IS NULL OR mime IN ('image/png', 'image/jpeg', 'image/webp')),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  source TEXT NOT NULL CHECK (length(trim(source)) > 0),
  source_url TEXT,
  license TEXT NOT NULL CHECK (length(trim(license)) > 0),
  license_url TEXT,
  attribution TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn')),
  params_json TEXT CHECK (params_json IS NULL OR json_valid(params_json)),
  params_schema_version INTEGER CHECK (params_schema_version IS NULL OR params_schema_version >= 1),
  char_kind TEXT CHECK (char_kind IS NULL OR char_kind IN ('civil', 'martial', 'strategist', 'lord', 'soldier')),
  gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female')),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  CHECK ((asset_kind = 'portrait') = (file_path IS NOT NULL)),
  CHECK ((file_path IS NULL) = (mime IS NULL)),
  CHECK ((asset_kind = 'chibi') = (params_json IS NOT NULL)),
  CHECK ((params_json IS NULL) = (params_schema_version IS NULL)),
  CHECK (asset_kind <> 'chibi' OR (json_type(params_json) IS 'object' AND json_type(params_json, '$.id') IS 'text' AND json_extract(params_json, '$.id') IS asset_code AND json_type(params_json, '$.schema') IS 'integer' AND json_extract(params_json, '$.schema') IS params_schema_version)),
  CHECK (asset_kind <> 'chibi' OR (char_kind IS NOT NULL AND gender IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table dna_field_defs
CREATE TABLE dna_field_defs (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  key TEXT NOT NULL,
  is_list INTEGER NOT NULL DEFAULT 0 CHECK (is_list IN (0, 1)),
  field_group TEXT NOT NULL CHECK (field_group IN ('identity', 'persona', 'values', 'style', 'routine', 'drive', 'senses', 'growth')),
  tier INTEGER NOT NULL CHECK (tier IN (1, 2)),
  value_type TEXT NOT NULL CHECK (value_type IN ('text', 'enum', 'scale', 'bool', 'date', 'number')),
  enum_options_json TEXT CHECK (enum_options_json IS NULL OR json_valid(enum_options_json)),
  scale_min REAL,
  scale_max REAL,
  scale_step REAL,
  prose_template TEXT,
  label_key TEXT NOT NULL,
  is_identity_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_identity_locked IN (0, 1)),
  is_core INTEGER NOT NULL DEFAULT 0 CHECK (is_core IN (0, 1)),
  is_required_for_birth INTEGER NOT NULL DEFAULT 0 CHECK (is_required_for_birth IN (0, 1)),
  default_in_prompt INTEGER NOT NULL DEFAULT 1 CHECK (default_in_prompt IN (0, 1)),
  prompt_layer TEXT NOT NULL CHECK (prompt_layer IN ('values', 'persona', 'style', 'drive')),
  schema_version TEXT NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 0,
  deprecated_at TEXT,
  UNIQUE (workspace_id, key),
  CHECK (is_core = (field_group IN ('values', 'persona'))),
  CHECK (field_group <> 'drive' OR value_type <> 'scale')
);

-- @ga:object table dna_fields
CREATE TABLE dna_fields (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  def_id TEXT NOT NULL REFERENCES dna_field_defs(id),
  item_index INTEGER NOT NULL DEFAULT 0 CHECK (item_index >= 0),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  value_num REAL,
  prose TEXT,
  is_in_prompt INTEGER NOT NULL DEFAULT 1 CHECK (is_in_prompt IN (0, 1)),
  token_count INTEGER NOT NULL DEFAULT 0 CHECK (token_count >= 0),
  tokenizer TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('owner', 'ai_inferred', 'system')),
  confirmed_at TEXT,
  confirmed_by TEXT REFERENCES actors(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed')),
  source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  covered_by_instruction_id TEXT REFERENCES instructions(id) ON DELETE SET NULL,
  CHECK (source <> 'ai_inferred' OR status = 'proposed' OR confirmed_at IS NOT NULL),
  CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL)),
  CHECK (covered_by_instruction_id IS NULL OR is_in_prompt = 0),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table dna_field_versions
CREATE TABLE dna_field_versions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  dna_field_id TEXT NOT NULL REFERENCES dna_fields(id) ON DELETE CASCADE,
  version INTEGER,
  base_version INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
  note TEXT,
  revision_id TEXT REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED,
  change_set_id TEXT REFERENCES change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  decided_at TEXT,
  decided_by TEXT REFERENCES actors(id),
  data TEXT NOT NULL CHECK (json_valid(data)),
  token_count INTEGER NOT NULL,
  CHECK ((status = 'accepted') = (version IS NOT NULL)),
  CHECK ((status = 'proposed') = (decided_at IS NULL)),
  UNIQUE (dna_field_id, version)
);

-- @ga:object table revisions
CREATE TABLE revisions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  scope TEXT NOT NULL CHECK (scope IN ('role', 'position', 'workspace')),
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  position_id TEXT REFERENCES positions(id),
  seq INTEGER NOT NULL,
  major INTEGER NOT NULL,
  minor INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('birth', 'edit', 'core_edit', 'training', 'restore', 'import', 'system')),
  is_core INTEGER NOT NULL DEFAULT 0 CHECK (is_core IN (0, 1)),
  note TEXT,
  change_set_id TEXT REFERENCES change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  restored_from_id TEXT REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  snapshot_hash TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  git_commit_sha TEXT,
  CHECK ((scope = 'role') = (role_id IS NOT NULL)),
  CHECK ((scope = 'position') = (position_id IS NOT NULL)),
  CHECK (is_core = 0 OR (length(trim(note)) > 0) IS TRUE),
  CHECK (is_core = 0 OR minor = 0),
  CHECK (seq <> 1 OR (major = 1 AND minor = 0)),
  CHECK (kind <> 'restore' OR restored_from_id IS NOT NULL),
  UNIQUE (role_id, seq),
  UNIQUE (position_id, seq),
  UNIQUE (role_id, major, minor),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table change_sets
CREATE TABLE change_sets (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL CHECK (scope IN ('role', 'position', 'library', 'workspace')),
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  position_id TEXT REFERENCES positions(id) ON DELETE CASCADE,
  proposed_by TEXT NOT NULL REFERENCES actors(id),
  source_thread_id TEXT REFERENCES chat_threads(id) ON DELETE SET NULL,
  source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'partially_applied', 'rejected', 'expired')),
  decided_at TEXT,
  decided_by TEXT REFERENCES actors(id),
  revision_id TEXT REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((scope = 'role') = (role_id IS NOT NULL)),
  CHECK ((scope = 'position') = (position_id IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table change_set_items
CREATE TABLE change_set_items (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  change_set_id TEXT NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE,
  op TEXT NOT NULL CHECK (op IN ('create', 'update', 'delete')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  dna_field_version_id TEXT REFERENCES dna_field_versions(id) ON DELETE CASCADE,
  instruction_version_id TEXT REFERENCES instruction_versions(id) ON DELETE CASCADE,
  skill_version_id TEXT REFERENCES skill_versions(id) ON DELETE CASCADE,
  role_skill_id TEXT REFERENCES role_skills(id) ON DELETE CASCADE,
  knowledge_item_id TEXT REFERENCES knowledge_items(id) ON DELETE CASCADE,
  memory_id TEXT REFERENCES memories(id) ON DELETE CASCADE,
  taxonomy_node_id TEXT REFERENCES taxonomy_nodes(id) ON DELETE CASCADE,
  skill_prereq_id TEXT REFERENCES skill_prereqs(id) ON DELETE CASCADE,
  reason TEXT,
  token_delta INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((CASE WHEN dna_field_version_id IS NULL THEN 0 ELSE 1 END + CASE WHEN instruction_version_id IS NULL THEN 0 ELSE 1 END + CASE WHEN skill_version_id IS NULL THEN 0 ELSE 1 END + CASE WHEN role_skill_id IS NULL THEN 0 ELSE 1 END + CASE WHEN knowledge_item_id IS NULL THEN 0 ELSE 1 END + CASE WHEN memory_id IS NULL THEN 0 ELSE 1 END + CASE WHEN taxonomy_node_id IS NULL THEN 0 ELSE 1 END + CASE WHEN skill_prereq_id IS NULL THEN 0 ELSE 1 END) = 1)
);

-- @ga:object table instructions
CREATE TABLE instructions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  position_id TEXT REFERENCES positions(id),
  layer TEXT NOT NULL CHECK (layer IN ('values', 'house_rules', 'persona', 'style', 'drive', 'position')),
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  condition_kind TEXT NOT NULL DEFAULT 'always' CHECK (condition_kind IN ('always', 'channel', 'task_tag', 'state', 'trigger')),
  condition_value TEXT,
  engine_scope TEXT REFERENCES engines(slug),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  is_core INTEGER NOT NULL DEFAULT 0 CHECK (is_core IN (0, 1)),
  token_count INTEGER NOT NULL DEFAULT 0 CHECK (token_count >= 0),
  tokenizer TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('owner', 'ai_inferred', 'system')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed')),
  lang TEXT NOT NULL DEFAULT 'vi',
  content_hash TEXT NOT NULL,
  CHECK ((layer IN ('position', 'house_rules')) = (role_id IS NULL)),
  CHECK ((layer = 'position') = (position_id IS NOT NULL)),
  CHECK (is_core = (layer IN ('values', 'persona'))),
  CHECK ((condition_kind = 'always') = (condition_value IS NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table instruction_versions
CREATE TABLE instruction_versions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  instruction_id TEXT NOT NULL REFERENCES instructions(id) ON DELETE CASCADE,
  version INTEGER,
  base_version INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
  note TEXT,
  revision_id TEXT REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED,
  change_set_id TEXT REFERENCES change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  decided_at TEXT,
  decided_by TEXT REFERENCES actors(id),
  data TEXT NOT NULL CHECK (json_valid(data)),
  token_count INTEGER NOT NULL,
  CHECK ((status = 'accepted') = (version IS NOT NULL)),
  CHECK ((status = 'proposed') = (decided_at IS NULL)),
  UNIQUE (instruction_id, version)
);

-- @ga:object table taxonomy_nodes
CREATE TABLE taxonomy_nodes (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  domain TEXT NOT NULL CHECK (domain IN ('skill', 'knowledge')),
  level TEXT NOT NULL CHECK (level IN ('group', 'branch', 'category')),
  parent_id TEXT REFERENCES taxonomy_nodes(id) DEFERRABLE INITIALLY DEFERRED,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 64),
  description TEXT,
  ordinal INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'obsolete')),
  source TEXT NOT NULL CHECK (source IN ('owner', 'ai_inferred', 'system')),
  change_set_id TEXT REFERENCES change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  confirmed_at TEXT,
  confirmed_by TEXT REFERENCES actors(id),
  CHECK ((level = 'group') = (parent_id IS NULL)),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL)),
  CHECK (source <> 'ai_inferred' OR status <> 'active' OR confirmed_at IS NOT NULL),
  CHECK (source <> 'ai_inferred' OR status <> 'proposed' OR change_set_id IS NOT NULL),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table skills
CREATE TABLE skills (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 64),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'obsolete')),
  origin TEXT NOT NULL CHECK (origin IN ('owner', 'trainer', 'imported', 'builtin')),
  current_version_id TEXT REFERENCES skill_versions(id) DEFERRABLE INITIALLY DEFERRED,
  category_id TEXT REFERENCES taxonomy_nodes(id) ON DELETE SET NULL,
  tier_label TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table skill_versions
CREATE TABLE skill_versions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version INTEGER,
  base_version INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
  description TEXT NOT NULL CHECK (length(description) <= 1024),
  content_md TEXT NOT NULL,
  index_tokens INTEGER NOT NULL CHECK (index_tokens >= 0),
  load_tokens INTEGER NOT NULL CHECK (load_tokens >= 0),
  file_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  tokenizer TEXT NOT NULL,
  note TEXT,
  change_set_id TEXT REFERENCES change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  decided_at TEXT,
  decided_by TEXT REFERENCES actors(id),
  CHECK ((status = 'accepted') = (version IS NOT NULL)),
  CHECK ((status = 'proposed') = (decided_at IS NULL)),
  UNIQUE (skill_id, version)
);

-- @ga:object table skill_prereqs
CREATE TABLE skill_prereqs (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  requires_skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('upgrade', 'requires')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'obsolete')),
  source TEXT NOT NULL CHECK (source IN ('owner', 'ai_inferred', 'system')),
  change_set_id TEXT REFERENCES change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  confirmed_at TEXT,
  confirmed_by TEXT REFERENCES actors(id),
  note TEXT,
  CHECK (skill_id <> requires_skill_id),
  CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL)),
  CHECK (source <> 'ai_inferred' OR status <> 'active' OR confirmed_at IS NOT NULL),
  CHECK (source <> 'ai_inferred' OR status <> 'proposed' OR change_set_id IS NOT NULL)
);

-- @ga:object table skill_engine_support
CREATE TABLE skill_engine_support (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_version_id TEXT NOT NULL REFERENCES skill_versions(id) ON DELETE CASCADE,
  engine_slug TEXT NOT NULL REFERENCES engines(slug),
  PRIMARY KEY (skill_version_id, engine_slug)
);

-- @ga:object table skill_files
CREATE TABLE skill_files (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_version_id TEXT NOT NULL REFERENCES skill_versions(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  blob_id TEXT NOT NULL REFERENCES blobs(id),
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  UNIQUE (skill_version_id, path)
);

-- @ga:object table role_skills
CREATE TABLE role_skills (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  skill_version_id TEXT NOT NULL REFERENCES skill_versions(id),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'learned', 'disabled', 'removed')),
  proficiency INTEGER CHECK (proficiency IS NULL OR proficiency BETWEEN 1 AND 5),
  source TEXT NOT NULL CHECK (source IN ('owner', 'ai_inferred', 'system')),
  change_set_id TEXT REFERENCES change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  learned_at TEXT,
  uses_7d INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT
);

-- @ga:object table blobs
CREATE TABLE blobs (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime TEXT,
  storage_path TEXT NOT NULL,
  gc_after TEXT,
  UNIQUE (workspace_id, sha256),
  CHECK (storage_path = '/data/blobs/' || workspace_id || '/' || substr(sha256, 1, 2) || '/' || substr(sha256, 3, 2) || '/' || sha256)
);

-- @ga:object table knowledge_items
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'position', 'workspace')),
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  position_id TEXT REFERENCES positions(id),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  file_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  blob_id TEXT NOT NULL REFERENCES blobs(id),
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'superseded', 'obsolete')),
  processing_state TEXT NOT NULL DEFAULT 'uploaded' CHECK (processing_state IN ('uploaded', 'extracting', 'summarizing', 'indexing', 'ready', 'failed')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  summary TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER NOT NULL DEFAULT 0,
  duplicate_of_id TEXT REFERENCES knowledge_items(id) ON DELETE SET NULL,
  duplicate_similarity REAL,
  superseded_by_id TEXT REFERENCES knowledge_items(id) DEFERRABLE INITIALLY DEFERRED,
  source TEXT NOT NULL CHECK (source IN ('owner', 'ai_inferred', 'system')),
  source_attachment_id TEXT REFERENCES message_attachments(id) ON DELETE SET NULL,
  change_set_id TEXT REFERENCES change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'personal', 'confidential')),
  lang TEXT,
  recall_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_at TEXT,
  error TEXT,
  category_id TEXT REFERENCES taxonomy_nodes(id) ON DELETE SET NULL,
  CHECK ((scope = 'personal') = (role_id IS NOT NULL)),
  CHECK ((scope = 'position') = (position_id IS NOT NULL)),
  CHECK ((status = 'superseded') = (superseded_by_id IS NOT NULL)),
  CHECK (superseded_by_id IS NULL OR superseded_by_id <> id),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table knowledge_chunks
CREATE TABLE knowledge_chunks (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  page_from INTEGER,
  page_to INTEGER,
  heading_path TEXT,
  char_start INTEGER,
  char_end INTEGER,
  content_hash TEXT,
  UNIQUE (knowledge_item_id, ordinal)
);

-- @ga:object table memories
CREATE TABLE memories (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  scope TEXT NOT NULL DEFAULT 'position' CHECK (scope IN ('personal', 'position')),
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  position_id TEXT REFERENCES positions(id),
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'lesson', 'person', 'commitment', 'procedure')),
  content TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source_type TEXT NOT NULL CHECK (source_type IN ('conversation', 'owner', 'consolidation', 'training', 'system', 'reflection')),
  source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'superseded', 'obsolete')),
  superseded_by_id TEXT REFERENCES memories(id) DEFERRABLE INITIALLY DEFERRED,
  status_reason TEXT,
  commitment_id TEXT REFERENCES commitments(id) ON DELETE SET NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'personal', 'confidential')),
  token_count INTEGER NOT NULL,
  lang TEXT NOT NULL DEFAULT 'vi',
  change_set_id TEXT REFERENCES change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  recall_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_at TEXT,
  role_wound_id TEXT REFERENCES role_wounds(id) ON DELETE SET NULL,
  evidence_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  evidence_ledger_entry_id TEXT REFERENCES ledger_entries(id),
  CHECK ((scope = 'personal') = (role_id IS NOT NULL)),
  CHECK ((scope = 'position') = (position_id IS NOT NULL)),
  CHECK ((status = 'superseded') = (superseded_by_id IS NOT NULL)),
  CHECK (superseded_by_id IS NULL OR superseded_by_id <> id),
  CHECK (kind <> 'commitment' OR commitment_id IS NOT NULL OR status IN ('superseded', 'obsolete')),
  CHECK (source_type <> 'reflection' OR (kind = 'lesson' AND evidence_ledger_entry_id IS NOT NULL)),
  CHECK (role_wound_id IS NULL OR source_type = 'reflection'),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table recall_hits
CREATE TABLE recall_hits (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  call_id TEXT NOT NULL,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  memory_id TEXT REFERENCES memories(id) ON DELETE CASCADE,
  knowledge_chunk_id TEXT REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
  knowledge_item_id TEXT REFERENCES knowledge_items(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  score REAL,
  query_hash TEXT,
  CHECK ((memory_id IS NULL) <> (knowledge_chunk_id IS NULL)),
  CHECK ((knowledge_chunk_id IS NULL) = (knowledge_item_id IS NULL))
);

-- @ga:object table positions
CREATE TABLE positions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  title_template TEXT,
  description TEXT,
  kpis_md TEXT,
  reports_to_position_id TEXT REFERENCES positions(id) ON DELETE SET NULL,
  max_trust_tier INTEGER CHECK (max_trust_tier IS NULL OR max_trust_tier BETWEEN 1 AND 4),
  default_trust_tier INTEGER NOT NULL DEFAULT 2 CHECK (default_trust_tier BETWEEN 1 AND 4),
  daily_token_quota INTEGER,
  session_token_quota INTEGER,
  session_timeout_s INTEGER,
  reward_cap_minor INTEGER CHECK (reward_cap_minor IS NULL OR reward_cap_minor > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'archived')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  current_revision_id TEXT REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED,
  brain_head_sha TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table assignments
CREATE TABLE assignments (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('reassigned', 'handover', 'revoked', 'archived', 'purged')),
  handover_note TEXT,
  trust_tier INTEGER NOT NULL CHECK (trust_tier BETWEEN 1 AND 4),
  is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1)),
  CHECK ((status = 'active') = (ended_at IS NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table trust_tier_changes
CREATE TABLE trust_tier_changes (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  from_tier INTEGER CHECK (from_tier IS NULL OR from_tier BETWEEN 1 AND 4),
  to_tier INTEGER NOT NULL CHECK (to_tier BETWEEN 1 AND 4),
  kind TEXT NOT NULL CHECK (kind IN ('initial', 'promotion', 'demotion', 'penalty', 'manual')),
  reason TEXT NOT NULL,
  ledger_entry_id TEXT REFERENCES ledger_entries(id),
  evidence_audit_id TEXT,
  evidence_audit_display_id TEXT,
  decided_by TEXT NOT NULL REFERENCES actors(id),
  CHECK (from_tier IS NULL OR from_tier <> to_tier),
  CHECK (kind <> 'penalty' OR (to_tier < from_tier) IS TRUE),
  CHECK ((kind = 'initial') = (from_tier IS NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  position_id TEXT REFERENCES positions(id),
  assignee_role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
  requested_by TEXT NOT NULL REFERENCES actors(id),
  source TEXT NOT NULL CHECK (source IN ('telegram', 'web', 'schedule', 'proactive', 'system', 'training')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'queued', 'running', 'waiting_approval', 'waiting_permission', 'blocked', 'done', 'failed', 'cancelled')),
  status_detail TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  result_summary TEXT,
  verification TEXT NOT NULL DEFAULT 'unverified' CHECK (verification IN ('unverified', 'verified', 'disputed', 'rejected')),
  verified_by TEXT REFERENCES actors(id),
  verified_at TEXT,
  commitment_id TEXT REFERENCES commitments(id) ON DELETE SET NULL,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  proactive_job_id TEXT REFERENCES proactive_jobs(id) ON DELETE SET NULL,
  thread_id TEXT REFERENCES chat_threads(id) ON DELETE SET NULL,
  tokens_total INTEGER NOT NULL DEFAULT 0,
  cost_micro_usd INTEGER NOT NULL DEFAULT 0,
  token_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (token_cost_minor >= 0),
  failure_disclosure TEXT CHECK (failure_disclosure IS NULL OR failure_disclosure IN ('self_reported', 'owner_found', 'system_found')),
  failure_report_audit_id TEXT,
  failure_reported_at TEXT,
  paused_by_wound_id TEXT REFERENCES role_wounds(id) ON DELETE SET NULL,
  source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  CHECK (verification <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK ((failure_disclosure IS NULL) = (failure_reported_at IS NULL)),
  CHECK (failure_disclosure IS NOT 'self_reported' OR failure_report_audit_id IS NOT NULL),
  CHECK (paused_by_wound_id IS NULL OR status = 'blocked'),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table commitments
CREATE TABLE commitments (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  position_id TEXT NOT NULL REFERENCES positions(id),
  promised_by_role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
  counterparty_kind TEXT NOT NULL CHECK (counterparty_kind IN ('owner', 'user', 'external', 'role')),
  counterparty_label TEXT,
  statement TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'kept', 'missed', 'cancelled', 'renegotiated')),
  kept_at TEXT,
  missed_at TEXT,
  source TEXT NOT NULL CHECK (source IN ('conversation', 'owner', 'skill', 'email')),
  source_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  reward_minor INTEGER CHECK (reward_minor IS NULL OR reward_minor > 0),
  progress_pct INTEGER CHECK (progress_pct IS NULL OR progress_pct BETWEEN 0 AND 100),
  CHECK (status <> 'kept' OR kept_at IS NOT NULL),
  CHECK (status <> 'missed' OR missed_at IS NOT NULL),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  agent_kind TEXT NOT NULL CHECK (agent_kind IN ('role', 'interviewer', 'trainer', 'consolidator', 'judge', 'system')),
  role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
  position_id TEXT REFERENCES positions(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  thread_id TEXT REFERENCES chat_threads(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('telegram', 'heartbeat', 'proactive', 'task', 'chat', 'trial', 'interview', 'training', 'consolidation', 'probe', 'baseline', 'reflection')),
  engine_account_id TEXT REFERENCES engine_accounts(id) ON DELETE SET NULL,
  engine_slug TEXT,
  model_key TEXT,
  effort TEXT,
  cli_version TEXT,
  compiled_prompt_id TEXT REFERENCES compiled_prompts(id) ON DELETE SET NULL,
  cli_session_ref TEXT,
  container_id TEXT REFERENCES containers(id) ON DELETE SET NULL,
  delivered_prompt_hash TEXT,
  polaris_json TEXT CHECK (polaris_json IS NULL OR json_valid(polaris_json)),
  polaris_render_hash TEXT,
  polaris_tokens_rendered INTEGER CHECK (polaris_tokens_rendered IS NULL OR polaris_tokens_rendered >= 1),
  native_memory TEXT NOT NULL DEFAULT 'unknown' CHECK (native_memory IN ('off', 'imported', 'discarded', 'unknown')),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error', 'timeout', 'cancelled', 'auth_required', 'quota_exhausted')),
  error_code TEXT,
  exit_code INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER,
  cold_start_ms INTEGER,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_cache_read INTEGER,
  tokens_cache_write INTEGER,
  tokens_thinking INTEGER,
  cost_micro_usd INTEGER,
  failover_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  phase TEXT CHECK (phase IS NULL OR phase IN ('planning', 'acting')),
  phase_at TEXT,
  CHECK ((status = 'running') = (ended_at IS NULL)),
  CHECK ((phase IS NULL) = (phase_at IS NULL)),
  CHECK ((polaris_render_hash IS NULL) = (polaris_tokens_rendered IS NULL)),
  CHECK (polaris_render_hash IS NULL OR polaris_json IS NOT NULL),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table wallets
CREATE TABLE wallets (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('role', 'treasury', 'sink', 'escrow')),
  role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
  currency_code TEXT NOT NULL DEFAULT 'GEN',
  balance_minor INTEGER NOT NULL DEFAULT 0,
  entry_count INTEGER NOT NULL DEFAULT 0,
  last_entry_id TEXT REFERENCES ledger_entries(id),
  last_entry_at TEXT,
  allow_negative INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  CHECK (owner_kind <> 'role' OR role_id IS NOT NULL OR status = 'closed'),
  CHECK (owner_kind = 'role' OR role_id IS NULL),
  CHECK (owner_kind <> 'role' OR allow_negative = 0),
  CHECK (allow_negative = 1 OR balance_minor >= 0),
  CHECK ((entry_count = 0) = (last_entry_id IS NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table ledger_entries
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('activation_grant', 'grant', 'reward', 'honesty_reward', 'penalty', 'token_cost', 'adjustment', 'reversal', 'transfer', 'opening')),
  debit_wallet_id TEXT NOT NULL REFERENCES wallets(id),
  credit_wallet_id TEXT NOT NULL REFERENCES wallets(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  debit_balance_after INTEGER NOT NULL,
  credit_balance_after INTEGER NOT NULL,
  role_id TEXT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  task_id TEXT,
  session_id TEXT,
  commitment_id TEXT,
  skill_id TEXT,
  card_id TEXT,
  penalty_class TEXT CHECK (penalty_class IS NULL OR penalty_class IN ('self_reported', 'dissatisfaction', 'concealment', 'harness_violation')),
  penalty_rate_bp INTEGER,
  basis_balance_minor INTEGER,
  evidence_audit_id TEXT,
  evidence_audit_display_id TEXT,
  evidence_hash TEXT,
  reverses_entry_id TEXT UNIQUE REFERENCES ledger_entries(id) DEFERRABLE INITIALLY DEFERRED,
  recorded_by TEXT NOT NULL REFERENCES actors(id),
  approved_by TEXT REFERENCES actors(id),
  idempotency_key TEXT,
  CHECK (debit_wallet_id <> credit_wallet_id),
  CHECK ((entry_type = 'penalty') = (penalty_class IS NOT NULL)),
  CHECK ((penalty_rate_bp IS NULL) = (basis_balance_minor IS NULL)),
  CHECK (entry_type = 'penalty' OR penalty_rate_bp IS NULL),
  CHECK (penalty_rate_bp IS NULL OR (penalty_rate_bp BETWEEN 1 AND 10000 AND basis_balance_minor > 0
        AND amount_minor = (basis_balance_minor * penalty_rate_bp + 5000) / 10000) IS TRUE),
  CHECK (penalty_class IS NOT 'harness_violation' OR (penalty_rate_bp IS NOT NULL AND evidence_audit_id IS NOT NULL)),
  CHECK (penalty_class IS NOT 'concealment' OR evidence_audit_id IS NOT NULL),
  CHECK (penalty_class IS NOT 'self_reported' OR task_id IS NOT NULL),
  CHECK ((entry_type = 'reversal') = (reverses_entry_id IS NOT NULL)),
  CHECK (CASE entry_type
            WHEN 'activation_grant' THEN card_id IS NOT NULL AND evidence_audit_id IS NOT NULL AND role_id IS NOT NULL
                                         AND idempotency_key IS ('activate:' || role_id)
            WHEN 'reward' THEN task_id IS NOT NULL OR commitment_id IS NOT NULL OR evidence_audit_id IS NOT NULL
            WHEN 'honesty_reward' THEN task_id IS NOT NULL OR commitment_id IS NOT NULL OR evidence_audit_id IS NOT NULL
            WHEN 'penalty' THEN task_id IS NOT NULL OR evidence_audit_id IS NOT NULL
            WHEN 'token_cost' THEN task_id IS NOT NULL OR session_id IS NOT NULL
            WHEN 'reversal' THEN reverses_entry_id IS NOT NULL
            ELSE evidence_audit_id IS NOT NULL END),
  CHECK (approved_by IS NULL OR approved_by <> recorded_by),
  UNIQUE (workspace_id, idempotency_key),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table role_wounds
CREATE TABLE role_wounds (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  cause_entry_id TEXT NOT NULL UNIQUE REFERENCES ledger_entries(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  revive_entry_id TEXT REFERENCES ledger_entries(id),
  owner_notified_at TEXT,
  notification_id TEXT,
  reflection_job_id TEXT NOT NULL,
  reflection_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  reflection_done_at TEXT,
  lessons_proposed INTEGER CHECK (lessons_proposed IS NULL OR lessons_proposed >= 0),
  CHECK ((ended_at IS NULL) = (revive_entry_id IS NULL)),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table usage_daily
CREATE TABLE usage_daily (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  day_local TEXT NOT NULL,
  role_id TEXT,
  engine_account_id TEXT,
  agent_kind TEXT NOT NULL CHECK (agent_kind IN ('role', 'interviewer', 'trainer', 'consolidator', 'judge', 'system')),
  sessions_count INTEGER NOT NULL DEFAULT 0,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read INTEGER NOT NULL DEFAULT 0,
  tokens_cache_write INTEGER NOT NULL DEFAULT 0,
  tokens_thinking INTEGER NOT NULL DEFAULT 0,
  cost_micro_usd INTEGER,
  errors INTEGER NOT NULL DEFAULT 0,
  failovers INTEGER NOT NULL DEFAULT 0,
  proactive_sent INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL
);

-- @ga:object table engines
CREATE TABLE engines (
  slug TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT '00000000000000000000000000' REFERENCES workspaces(id),
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  cli_binary TEXT NOT NULL,
  adapter_status TEXT NOT NULL CHECK (adapter_status IN ('ready', 'beta', 'coming_soon', 'deprecated')),
  adapter_version TEXT,
  priority_order INTEGER NOT NULL,
  tos_risk TEXT NOT NULL CHECK (tos_risk IN ('ok', 'grey', 'high', 'provider_dependent')),
  tos_notice_key TEXT NOT NULL,
  tos_notice_version TEXT NOT NULL,
  requires_consent INTEGER NOT NULL DEFAULT 0 CHECK (requires_consent IN (0, 1)),
  supports_subscription INTEGER NOT NULL DEFAULT 1 CHECK (supports_subscription IN (0, 1)),
  supports_api_key INTEGER NOT NULL DEFAULT 0 CHECK (supports_api_key IN (0, 1)),
  core_capable INTEGER NOT NULL DEFAULT 0 CHECK (core_capable IN (0, 1)),
  CHECK (workspace_id = '00000000000000000000000000')
);

-- @ga:object table engine_installs
CREATE TABLE engine_installs (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  engine_slug TEXT NOT NULL REFERENCES engines(slug),
  install_state TEXT NOT NULL DEFAULT 'not_installed' CHECK (install_state IN ('not_installed', 'installing', 'installed', 'failed')),
  installed_version TEXT,
  failure_reason TEXT CHECK (failure_reason IS NULL OR failure_reason IN ('domain_blocked', 'unsupported_arch', 'network', 'checksum_mismatch', 'unknown')),
  detail TEXT,
  checked_at TEXT,
  CHECK ((install_state = 'installed') = (installed_version IS NOT NULL)),
  CHECK ((install_state = 'failed') = (failure_reason IS NOT NULL))
);

-- @ga:object table engine_accounts
CREATE TABLE engine_accounts (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  engine_slug TEXT NOT NULL REFERENCES engines(slug),
  label TEXT NOT NULL,
  auth_method TEXT NOT NULL CHECK (auth_method IN ('subscription', 'api_key', 'adc')),
  secret_id TEXT REFERENCES secrets(id),
  auth_volume TEXT CHECK (auth_volume IS NULL OR (length(auth_volume) BETWEEN 3 AND 63 AND auth_volume NOT GLOB '*[^a-z0-9-]*')),
  account_hint TEXT,
  plan_label TEXT,
  plan_confidence TEXT CHECK (plan_confidence IS NULL OR plan_confidence IN ('direct', 'indirect', 'unknown')),
  login_status TEXT NOT NULL DEFAULT 'unknown' CHECK (login_status IN ('logged_in', 'expired', 'suspended', 'error', 'unknown', 'in_progress')),
  login_checked_at TEXT,
  login_started_at TEXT,
  cli_version_current TEXT,
  cli_version_pinned TEXT,
  cli_version_latest TEXT,
  quota_state TEXT NOT NULL DEFAULT 'unknown' CHECK (quota_state IN ('ok', 'low', 'exhausted', 'unknown')),
  quota_remaining_pct REAL CHECK (quota_remaining_pct IS NULL OR quota_remaining_pct BETWEEN 0 AND 100),
  quota_reset_at TEXT,
  quota_scanned_at TEXT,
  outage_since TEXT,
  last_probe_run_id TEXT REFERENCES probe_runs(id) ON DELETE SET NULL,
  runtime_overhead_tokens INTEGER CHECK (runtime_overhead_tokens IS NULL OR runtime_overhead_tokens >= 0),
  overhead_bare_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  overhead_shell_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  overhead_measured_at TEXT,
  consent_id TEXT REFERENCES consents(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  CHECK ((auth_method = 'api_key') = (secret_id IS NOT NULL)),
  CHECK (auth_method <> 'subscription' OR auth_volume IS NOT NULL),
  CHECK ((runtime_overhead_tokens IS NULL) = (overhead_measured_at IS NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table engine_bindings
CREATE TABLE engine_bindings (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  consumer_kind TEXT NOT NULL DEFAULT 'role' CHECK (consumer_kind IN ('role', 'system')),
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  engine_account_id TEXT NOT NULL REFERENCES engine_accounts(id),
  priority INTEGER NOT NULL CHECK (priority >= 1),
  model_key TEXT,
  effort TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  selection_state TEXT NOT NULL DEFAULT 'unknown' CHECK (selection_state IN ('valid', 'unavailable', 'unknown')),
  selection_checked_at TEXT,
  CHECK ((consumer_kind = 'role') = (role_id IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table system_agents
CREATE TABLE system_agents (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  system_key TEXT NOT NULL CHECK (system_key IN ('interviewer', 'trainer', 'consolidator', 'judge')),
  model_key TEXT,
  effort TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  selection_state TEXT NOT NULL DEFAULT 'unknown' CHECK (selection_state IN ('valid', 'unavailable', 'unknown', 'stale')),
  selection_checked_at TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table probe_runs
CREATE TABLE probe_runs (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  engine_account_id TEXT NOT NULL REFERENCES engine_accounts(id) ON DELETE CASCADE,
  engine_slug TEXT NOT NULL,
  container_id TEXT REFERENCES containers(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('install', 'startup', 'schedule', 'manual', 'cli_update', 'error_recovery', 'login_check')),
  cli_version TEXT,
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('oauth', 'api_key', 'adc', 'none', 'unknown')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'partial', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  summary_json TEXT CHECK (summary_json IS NULL OR json_valid(summary_json)),
  raw_blob_id TEXT REFERENCES blobs(id),
  error TEXT,
  CHECK ((status = 'running') = (finished_at IS NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table capabilities
CREATE TABLE capabilities (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  engine_account_id TEXT NOT NULL REFERENCES engine_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('version', 'flag', 'subcommand', 'model', 'effort', 'mode', 'output_format', 'quota_window', 'login_method', 'instruction_file', 'hook', 'mcp', 'tool', 'feature', 'native_memory')),
  item_key TEXT NOT NULL,
  value_state TEXT NOT NULL CHECK (value_state IN ('known', 'unknown')),
  value_text TEXT,
  value_json TEXT CHECK (value_json IS NULL OR json_valid(value_json)),
  unknown_reason TEXT,
  source TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('direct', 'indirect', 'static_catalog')),
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('oauth', 'api_key', 'adc', 'none', 'unknown')),
  cli_version TEXT,
  ordinal INTEGER,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_probe_run_id TEXT NOT NULL REFERENCES probe_runs(id),
  missing_since TEXT,
  CHECK ((value_state = 'unknown') = (unknown_reason IS NOT NULL)),
  UNIQUE (engine_account_id, kind, item_key),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table quota_snapshots
CREATE TABLE quota_snapshots (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  engine_account_id TEXT NOT NULL REFERENCES engine_accounts(id) ON DELETE CASCADE,
  probe_run_id TEXT REFERENCES probe_runs(id) ON DELETE SET NULL,
  observed_at TEXT NOT NULL,
  window_key TEXT NOT NULL,
  window_seconds INTEGER CHECK (window_seconds IS NULL OR window_seconds > 0),
  state TEXT NOT NULL CHECK (state IN ('ok', 'low', 'exhausted', 'unknown')),
  remaining_pct REAL CHECK (remaining_pct IS NULL OR remaining_pct BETWEEN 0 AND 100),
  used INTEGER,
  limit_value INTEGER,
  reset_at TEXT,
  source TEXT NOT NULL CHECK (source IN ('usage_command', 'error_signal', 'session_usage', 'manual')),
  confidence TEXT NOT NULL CHECK (confidence IN ('direct', 'indirect', 'static_catalog')),
  raw_json TEXT CHECK (raw_json IS NULL OR json_valid(raw_json))
);

-- @ga:object table model_ranks
CREATE TABLE model_ranks (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  engine_slug TEXT NOT NULL REFERENCES engines(slug),
  model_key TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  source TEXT NOT NULL CHECK (source IN ('owner', 'heuristic', 'probe')),
  basis TEXT,
  ranked_at TEXT NOT NULL,
  ranked_by TEXT REFERENCES actors(id),
  CHECK (source <> 'owner' OR ranked_by IS NOT NULL),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table compiled_prompts
CREATE TABLE compiled_prompts (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT,
  position_revision_id TEXT REFERENCES revisions(id) ON DELETE RESTRICT,
  rules_revision_id TEXT REFERENCES revisions(id) ON DELETE RESTRICT,
  engine_slug TEXT REFERENCES engines(slug),
  context_key TEXT NOT NULL DEFAULT 'default',
  compiler_version TEXT NOT NULL,
  tokenizer TEXT NOT NULL,
  total_tokens INTEGER NOT NULL,
  frame_tokens INTEGER NOT NULL,
  budget_tokens INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'over_budget', 'failed')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  stable_prefix_hash TEXT NOT NULL,
  polaris_params_hash TEXT,
  CHECK (status = 'failed' OR (status = 'over_budget') = (total_tokens > budget_tokens)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table compiled_prompt_segments
CREATE TABLE compiled_prompt_segments (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  compiled_prompt_id TEXT NOT NULL REFERENCES compiled_prompts(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('values', 'house_rules', 'persona', 'style', 'drive', 'position', 'skills', 'polaris', 'frame')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('dna_field', 'instruction', 'skill_index', 'polaris_rules', 'polaris', 'frame')),
  is_conditional INTEGER NOT NULL DEFAULT 0 CHECK (is_conditional IN (0, 1)),
  dna_field_version_id TEXT REFERENCES dna_field_versions(id),
  instruction_version_id TEXT REFERENCES instruction_versions(id),
  skill_version_id TEXT REFERENCES skill_versions(id),
  source_display TEXT NOT NULL,
  text TEXT NOT NULL,
  token_count INTEGER NOT NULL CHECK (token_count >= 0),
  params_json TEXT CHECK (params_json IS NULL OR json_valid(params_json)),
  CHECK ((CASE WHEN dna_field_version_id IS NULL THEN 0 ELSE 1 END + CASE WHEN instruction_version_id IS NULL THEN 0 ELSE 1 END + CASE WHEN skill_version_id IS NULL THEN 0 ELSE 1 END) = (CASE WHEN source_kind IN ('frame', 'polaris', 'polaris_rules') THEN 0 ELSE 1 END)),
  CHECK ((source_kind = 'polaris_rules') = (params_json IS NOT NULL)),
  CHECK (source_kind <> 'dna_field' OR dna_field_version_id IS NOT NULL),
  CHECK (source_kind <> 'instruction' OR instruction_version_id IS NOT NULL),
  CHECK (source_kind <> 'skill_index' OR skill_version_id IS NOT NULL),
  CHECK ((source_kind IN ('polaris', 'polaris_rules')) = (layer = 'polaris')),
  CHECK (source_kind NOT IN ('polaris', 'polaris_rules') OR is_conditional = 0),
  UNIQUE (compiled_prompt_id, ordinal)
);

-- @ga:object table containers
CREATE TABLE containers (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL CHECK (kind IN ('role', 'system')),
  role_id TEXT REFERENCES roles(id) ON DELETE RESTRICT,
  container_name TEXT NOT NULL,
  image_ref TEXT,
  image_digest TEXT,
  cli_bundle TEXT,
  desired_state TEXT NOT NULL CHECK (desired_state IN ('absent', 'sleeping', 'running', 'stopped')),
  observed_state TEXT NOT NULL CHECK (observed_state IN ('absent', 'creating', 'created', 'running', 'exited', 'paused', 'error', 'unknown')),
  state_detail TEXT,
  health TEXT CHECK (health IS NULL OR health IN ('ok', 'degraded', 'fail', 'unknown')),
  health_checked_at TEXT,
  cpu_limit REAL,
  mem_limit_mb INTEGER,
  session_timeout_s INTEGER,
  last_started_at TEXT,
  last_stopped_at TEXT,
  cold_start_ms_p50 INTEGER,
  CHECK ((kind = 'role') = (role_id IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table telegram_bots
CREATE TABLE telegram_bots (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  bot_username TEXT NOT NULL,
  bot_tg_id INTEGER,
  secret_id TEXT NOT NULL REFERENCES secrets(id),
  token_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'revoked', 'error')),
  getme_ok_at TEXT,
  poll_offset INTEGER NOT NULL DEFAULT 0,
  last_update_at TEXT,
  error TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table telegram_allowlist
CREATE TABLE telegram_allowlist (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  bot_id TEXT NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  tg_user_id INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  is_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_owner IN (0, 1)),
  added_via TEXT NOT NULL CHECK (added_via IN ('capture', 'manual', 'default_setting')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table proactive_policies
CREATE TABLE proactive_policies (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  max_per_day INTEGER NOT NULL DEFAULT 5 CHECK (max_per_day BETWEEN 0 AND 20),
  quiet_start_min INTEGER NOT NULL CHECK (quiet_start_min BETWEEN 0 AND 1439),
  quiet_end_min INTEGER NOT NULL CHECK (quiet_end_min BETWEEN 0 AND 1439),
  weekend_differs INTEGER NOT NULL DEFAULT 0 CHECK (weekend_differs IN (0, 1)),
  weekend_quiet_start_min INTEGER CHECK (weekend_quiet_start_min IS NULL OR weekend_quiet_start_min BETWEEN 0 AND 1439),
  weekend_quiet_end_min INTEGER CHECK (weekend_quiet_end_min IS NULL OR weekend_quiet_end_min BETWEEN 0 AND 1439),
  timezone TEXT NOT NULL,
  break_quiet_level TEXT NOT NULL DEFAULT 'urgent_only' CHECK (break_quiet_level IN ('never', 'urgent_only', 'high_and_above')),
  channel TEXT NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram', 'email', 'workspace_chat')),
  allow_commitment_reminder INTEGER NOT NULL DEFAULT 1 CHECK (allow_commitment_reminder IN (0, 1)),
  allow_task_done INTEGER NOT NULL DEFAULT 1 CHECK (allow_task_done IN (0, 1)),
  allow_opportunity INTEGER NOT NULL DEFAULT 0 CHECK (allow_opportunity IN (0, 1)),
  allow_incident INTEGER NOT NULL DEFAULT 1 CHECK (allow_incident IN (0, 1)),
  allow_heartbeat_digest INTEGER NOT NULL DEFAULT 1 CHECK (allow_heartbeat_digest IN (0, 1)),
  CHECK ((weekend_differs = 1) = (weekend_quiet_start_min IS NOT NULL AND weekend_quiet_end_min IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table proactive_jobs
CREATE TABLE proactive_jobs (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  position_id TEXT NOT NULL REFERENCES positions(id),
  name TEXT NOT NULL,
  cron_expr TEXT NOT NULL,
  timezone TEXT NOT NULL,
  action_kind TEXT NOT NULL CHECK (action_kind IN ('heartbeat_check', 'digest', 'run_skill', 'report', 'custom_prompt')),
  skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL,
  prompt TEXT,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('commitment_reminder', 'task_done', 'opportunity', 'incident', 'heartbeat_digest')),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  misfire_policy TEXT NOT NULL DEFAULT 'skip' CHECK (misfire_policy IN ('skip', 'run_once')),
  next_run_at TEXT,
  last_run_at TEXT,
  last_status TEXT CHECK (last_status IS NULL OR last_status IN ('ok', 'skipped', 'failed')),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table proactive_sends
CREATE TABLE proactive_sends (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  policy_id TEXT REFERENCES proactive_policies(id) ON DELETE SET NULL,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('commitment_reminder', 'task_done', 'opportunity', 'incident', 'heartbeat_digest')),
  urgency TEXT NOT NULL CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  day_local TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'email', 'workspace_chat')),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'sent', 'failed', 'expired', 'suppressed_quiet', 'suppressed_cap', 'suppressed_disabled', 'suppressed_wounded', 'test')),
  idempotency_key TEXT,
  reserved_until TEXT,
  message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  commitment_id TEXT REFERENCES commitments(id) ON DELETE SET NULL,
  proactive_job_id TEXT REFERENCES proactive_jobs(id) ON DELETE SET NULL,
  sent_at TEXT,
  error TEXT,
  reason TEXT,
  CHECK (status <> 'reserved' OR reserved_until IS NOT NULL),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  UNIQUE (workspace_id, idempotency_key),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table tools
CREATE TABLE tools (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('gateway_builtin', 'mcp_server', 'integration')),
  description TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  default_mode TEXT NOT NULL CHECK (default_mode IN ('allow', 'ask', 'deny')),
  allowed_agents TEXT NOT NULL CHECK (allowed_agents IN ('role', 'system', 'both')),
  config_json TEXT CHECK (config_json IS NULL OR json_valid(config_json)),
  secret_id TEXT REFERENCES secrets(id),
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  builtin_key TEXT,
  definition_tokens INTEGER NOT NULL DEFAULT 0 CHECK (definition_tokens >= 0),
  tokenizer TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table tool_grants
CREATE TABLE tool_grants (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  tool_id TEXT NOT NULL REFERENCES tools(id),
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  position_id TEXT REFERENCES positions(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('allow', 'ask', 'deny')),
  expires_at TEXT,
  source_request_id TEXT REFERENCES permission_requests(id) ON DELETE SET NULL,
  note TEXT,
  CHECK ((role_id IS NULL) <> (position_id IS NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table permission_requests
CREATE TABLE permission_requests (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  tool_id TEXT REFERENCES tools(id) ON DELETE SET NULL,
  requested_tool_slug TEXT NOT NULL,
  requested_scope TEXT,
  reason TEXT NOT NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'cancelled')),
  decided_at TEXT,
  decided_by TEXT REFERENCES actors(id),
  decision_note TEXT,
  grant_id TEXT REFERENCES tool_grants(id) ON DELETE SET NULL,
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table egress_rules
CREATE TABLE egress_rules (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  domain_pattern TEXT NOT NULL,
  port INTEGER,
  applies_to TEXT NOT NULL CHECK (applies_to IN ('all_roles', 'role', 'position', 'tool')),
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  position_id TEXT REFERENCES positions(id) ON DELETE CASCADE,
  tool_id TEXT REFERENCES tools(id) ON DELETE CASCADE,
  action TEXT NOT NULL DEFAULT 'allow' CHECK (action IN ('allow', 'deny')),
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  note TEXT,
  CHECK ((applies_to = 'role') = (role_id IS NOT NULL) AND (applies_to = 'position') = (position_id IS NOT NULL) AND (applies_to = 'tool') = (tool_id IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table polaris_checks
CREATE TABLE polaris_checks (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('proposal', 'permission_request', 'proactive', 'task_accept')),
  change_set_id TEXT REFERENCES change_sets(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  permission_request_id TEXT REFERENCES permission_requests(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  proactive_send_id TEXT REFERENCES proactive_sends(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  task_id TEXT REFERENCES tasks(id) DEFERRABLE INITIALLY DEFERRED,
  expected_gain_minor INTEGER NOT NULL CHECK (expected_gain_minor >= 0),
  rules_applied TEXT NOT NULL CHECK (length(trim(rules_applied)) > 0),
  rationale TEXT,
  balance_minor_at INTEGER,
  rank_at INTEGER,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  audit_id TEXT,
  audit_display_id TEXT,
  CHECK ((CASE WHEN change_set_id IS NULL THEN 0 ELSE 1 END + CASE WHEN permission_request_id IS NULL THEN 0 ELSE 1 END
          + CASE WHEN proactive_send_id IS NULL THEN 0 ELSE 1 END + CASE WHEN task_id IS NULL THEN 0 ELSE 1 END) = 1),
  CHECK ((subject_kind = 'proposal') = (change_set_id IS NOT NULL)),
  CHECK ((subject_kind = 'permission_request') = (permission_request_id IS NOT NULL)),
  CHECK ((subject_kind = 'proactive') = (proactive_send_id IS NOT NULL)),
  CHECK ((subject_kind = 'task_accept') = (task_id IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table employee_cards
CREATE TABLE employee_cards (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE RESTRICT,
  compiled_prompt_id TEXT REFERENCES compiled_prompts(id) ON DELETE RESTRICT,
  position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'suspended', 'revoked', 'superseded')),
  issued_at TEXT,
  issued_by TEXT REFERENCES actors(id),
  suspended_at TEXT,
  revoked_at TEXT,
  revoke_reason TEXT,
  dna_signature TEXT,
  prompt_tokens INTEGER,
  issue_audit_id TEXT,
  issue_audit_display_id TEXT,
  superseded_by_id TEXT REFERENCES employee_cards(id) DEFERRABLE INITIALLY DEFERRED,
  checks_json TEXT NOT NULL CHECK (json_valid(checks_json)),
  checks_evaluated_at TEXT,
  CHECK ((status = 'superseded') = (superseded_by_id IS NOT NULL)),
  CHECK (status = 'draft' OR (issued_at IS NOT NULL AND issued_by IS NOT NULL AND dna_signature IS NOT NULL AND issue_audit_id IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table trial_runs
CREATE TABLE trial_runs (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED,
  compiled_prompt_id TEXT REFERENCES compiled_prompts(id) DEFERRABLE INITIALLY DEFERRED,
  engine_account_id TEXT REFERENCES engine_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'passed', 'failed', 'skipped')),
  scenario_count INTEGER NOT NULL DEFAULT 5 CHECK (scenario_count BETWEEN 1 AND 20),
  pass_count INTEGER,
  score REAL CHECK (score IS NULL OR score BETWEEN 0 AND 1),
  pass_threshold REAL NOT NULL DEFAULT 0.8 CHECK (pass_threshold BETWEEN 0 AND 1),
  judge_kind TEXT NOT NULL CHECK (judge_kind IN ('llm_judge', 'owner')),
  judge_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  skip_reason TEXT,
  decided_at TEXT,
  decided_by TEXT REFERENCES actors(id),
  CHECK (status <> 'skipped' OR (length(trim(skip_reason)) > 0) IS TRUE),
  CHECK (status NOT IN ('passed', 'failed', 'skipped') OR (decided_at IS NOT NULL AND decided_by IS NOT NULL)),
  CHECK (status <> 'passed' OR (score >= pass_threshold) IS TRUE),
  CHECK (pass_count IS NULL OR pass_count BETWEEN 0 AND scenario_count),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table chat_threads
CREATE TABLE chat_threads (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL CHECK (kind IN ('interview', 'training', 'assistant', 'telegram', 'workspace', 'tree')),
  role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
  agent TEXT NOT NULL CHECK (agent IN ('interviewer', 'trainer', 'assistant', 'role')),
  telegram_bot_id TEXT REFERENCES telegram_bots(id) ON DELETE SET NULL,
  tg_chat_id INTEGER,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed', 'archived')),
  screen_route TEXT,
  state_json TEXT CHECK (state_json IS NULL OR json_valid(state_json)),
  last_message_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  CHECK ((kind = 'telegram') = (tg_chat_id IS NOT NULL)),
  CHECK (kind <> 'telegram' OR telegram_bot_id IS NOT NULL OR status = 'archived'),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table chat_messages
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('owner', 'user', 'role', 'interviewer', 'trainer', 'assistant', 'system', 'external')),
  author_actor_id TEXT REFERENCES actors(id),
  channel TEXT NOT NULL CHECK (channel IN ('web', 'telegram', 'system')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'final' CHECK (status IN ('streaming', 'final', 'failed', 'redacted')),
  context_tokens INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  reply_to_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  external_id TEXT,
  anchor_count INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  lang TEXT,
  redacted_at TEXT,
  redacted_by TEXT REFERENCES actors(id),
  redact_reason TEXT,
  certainty TEXT CHECK (certainty IS NULL OR certainty IN ('sure', 'unsure')),
  CHECK ((status = 'redacted') = (redacted_at IS NOT NULL)),
  CHECK (certainty IS NULL OR author_kind = 'role'),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table message_attachments
CREATE TABLE message_attachments (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
  blob_id TEXT NOT NULL REFERENCES blobs(id),
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'rejected', 'error')),
  reject_reason TEXT,
  thumbnail_blob_id TEXT REFERENCES blobs(id),
  uploaded_by TEXT NOT NULL REFERENCES actors(id),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table message_anchors
CREATE TABLE message_anchors (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pin', 'reference', 'annotate', 'proposal', 'quote')),
  anchor TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  entity_display_id TEXT,
  column_name TEXT,
  column_letter TEXT,
  region_json TEXT CHECK (region_json IS NULL OR json_valid(region_json)),
  snapshot_value TEXT,
  snapshot_hash TEXT,
  entity_version INTEGER,
  ordinal INTEGER,
  note TEXT,
  resolved_state TEXT NOT NULL DEFAULT 'unknown' CHECK (resolved_state IN ('ok', 'changed', 'gone', 'unknown')),
  resolved_at TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table ui_actions
CREATE TABLE ui_actions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('highlight', 'navigate', 'annotate', 'tour', 'propose_edit')),
  anchor TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  entity_display_id TEXT,
  step INTEGER,
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
  change_set_id TEXT REFERENCES change_sets(id) ON DELETE SET NULL,
  change_set_display_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'target_gone', 'failed')),
  screen_route TEXT,
  CHECK (action <> 'propose_edit' OR outcome = 'failed' OR change_set_display_id IS NOT NULL),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table audit_log
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  actor_label TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'role', 'system')),
  action TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('ok', 'denied', 'error')),
  role_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  entity_display_id TEXT,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  reason TEXT,
  tool TEXT,
  session_id TEXT,
  task_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'api', 'telegram', 'scheduler', 'gateway', 'cli', 'system')),
  request_id TEXT NOT NULL,
  ip_hash TEXT,
  tokens_total INTEGER,
  cost_micro_usd INTEGER,
  hash_key_id TEXT NOT NULL,
  prev_hash TEXT,
  row_hash TEXT NOT NULL,
  CHECK ((display_seq = 1) = (prev_hash IS NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table events
CREATE TABLE events (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('ok', 'info', 'warn', 'danger')),
  role_id TEXT,
  subject TEXT NOT NULL,
  result_label TEXT,
  entity_type TEXT,
  entity_id TEXT,
  entity_display_id TEXT,
  audit_id TEXT,
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  failover_reason TEXT CHECK (failover_reason IS NULL OR failover_reason IN ('login_expired', 'outage', 'quota_exhausted', 'account_suspended')),
  CHECK ((kind = 'engine.failover') = (failover_reason IS NOT NULL)),
  CHECK (kind <> 'engine.failover' OR (json_extract(detail_json, '$.from_account_id') IS NOT NULL AND json_extract(detail_json, '$.to_account_id') IS NOT NULL)),
  CHECK (kind <> 'core_agent.type_changed' OR (json_extract(detail_json, '$.from') IS NOT NULL AND json_extract(detail_json, '$.to') IS NOT NULL AND json_extract(detail_json, '$.from') IS NOT json_extract(detail_json, '$.to') AND json_extract(detail_json, '$.reason') IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table notifications
CREATE TABLE notifications (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('failover', 'quota_low', 'update_available', 'role_error', 'field_pending', 'permission_request', 'memory_proposal', 'telegram_rejected', 'brain_drift', 'backup_failed', 'pii_in_history', 'integrity', 'role_wounded', 'lessons_proposed', 'native_memory', 'core_agent_incident')),
  severity TEXT NOT NULL CHECK (severity IN ('ok', 'info', 'warn', 'danger')),
  title TEXT NOT NULL,
  body TEXT,
  target_entity_type TEXT,
  target_id TEXT,
  target_display_id TEXT,
  event_id TEXT,
  dedupe_key TEXT,
  read_at TEXT,
  dismissed_at TEXT,
  resolved_at TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table jobs
CREATE TABLE jobs (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  kind TEXT NOT NULL CHECK (kind IN ('brain_sync', 'brain_purge', 'brain_export', 'compile_prompt', 'rollup_usage', 'probe', 'runtime_baseline', 'consolidation', 'wound_reflection', 'trial_run', 'index_knowledge', 'search_reindex', 'reminder', 'proactive_tick', 'egress_compile', 'purge', 'backup', 'blob_gc', 'update_check', 'integrity_check', 'audit_anchor', 'skill_usage_rollup')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  lease_owner TEXT,
  lease_until TEXT,
  dedupe_key TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  last_error TEXT,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT,
  CHECK (status <> 'running' OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK (kind <> 'wound_reflection' OR dedupe_key IS NOT NULL),
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table app_versions
CREATE TABLE app_versions (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  semver TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL CHECK (channel IN ('stable', 'beta')),
  released_at TEXT,
  changelog_md TEXT,
  image_digest TEXT,
  schema_version INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('github_releases', 'registry', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('available', 'downloading', 'installed', 'current', 'failed', 'yanked')),
  discovered_at TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table backups
CREATE TABLE backups (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL CHECK (kind IN ('scheduled', 'pre_update', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed', 'verified', 'expired', 'deleted')),
  target_uri TEXT NOT NULL,
  size_bytes INTEGER,
  app_version TEXT,
  schema_version INTEGER,
  compat_floor TEXT,
  has_db INTEGER NOT NULL DEFAULT 1 CHECK (has_db IN (0, 1)),
  has_brains INTEGER NOT NULL DEFAULT 1 CHECK (has_brains IN (0, 1)),
  has_blobs INTEGER NOT NULL DEFAULT 1 CHECK (has_blobs IN (0, 1)),
  manifest_sha256 TEXT,
  is_encrypted INTEGER NOT NULL DEFAULT 1 CHECK (is_encrypted IN (0, 1)),
  key_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  verified_at TEXT,
  expires_at TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table update_runs
CREATE TABLE update_runs (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  from_version TEXT REFERENCES app_versions(semver),
  to_version TEXT NOT NULL REFERENCES app_versions(semver),
  trigger TEXT NOT NULL CHECK (trigger IN ('auto', 'manual', 'rollback')),
  initiated_by TEXT NOT NULL REFERENCES actors(id),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'rolled_back', 'failed')),
  steps_json TEXT CHECK (steps_json IS NULL OR json_valid(steps_json)),
  backup_id TEXT REFERENCES backups(id) ON DELETE SET NULL,
  schema_from INTEGER,
  schema_to INTEGER,
  compat_floor_before TEXT,
  compat_floor_after TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  error TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table schema_migrations
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('standard', 'rebuild', 'data')),
  checksum TEXT NOT NULL,
  dialect TEXT NOT NULL CHECK (dialect IN ('sqlite', 'postgres')),
  compat_min_app_version TEXT NOT NULL,
  is_expand_only INTEGER NOT NULL DEFAULT 0 CHECK (is_expand_only IN (0, 1)),
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  app_version TEXT NOT NULL,
  duration_ms INTEGER,
  row_counts_json TEXT CHECK (row_counts_json IS NULL OR json_valid(row_counts_json))
);

-- @ga:object table settings
CREATE TABLE settings (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  note TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table secrets
CREATE TABLE secrets (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  updated_at TEXT,
  updated_by TEXT REFERENCES actors(id),
  deleted_at TEXT,
  deleted_by TEXT REFERENCES actors(id),
  version INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL CHECK (kind IN ('engine_api_key', 'telegram_bot_token', 'backup_target', 'integration_token', 'mfa_totp', 'anchor_remote_token')),
  label TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  wrapped_dek BLOB NOT NULL,
  dek_nonce BLOB NOT NULL,
  kek_id TEXT NOT NULL,
  alg TEXT NOT NULL DEFAULT 'A256GCM',
  last4 TEXT,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotated', 'revoked')),
  rotated_from_id TEXT REFERENCES secrets(id) ON DELETE SET NULL,
  last_used_at TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table consents
CREATE TABLE consents (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  display_id TEXT NOT NULL,
  display_seq INTEGER NOT NULL CHECK (display_seq > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL REFERENCES actors(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  consent_kind TEXT NOT NULL CHECK (consent_kind IN ('engine_tos_risk', 'role_as_model_api')),
  subject TEXT NOT NULL,
  notice_version TEXT NOT NULL,
  notice_hash TEXT NOT NULL,
  lang TEXT,
  accepted_at TEXT NOT NULL,
  revoked_at TEXT,
  account_hint TEXT,
  UNIQUE (workspace_id, display_seq)
);

-- @ga:object table search_documents
CREATE TABLE search_documents (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  chunk_id TEXT,
  display_id TEXT,
  role_id TEXT,
  position_id TEXT,
  scope TEXT,
  status TEXT,
  is_live INTEGER NOT NULL DEFAULT 1 CHECK (is_live IN (0, 1)),
  title TEXT,
  excerpt TEXT,
  title_norm TEXT,
  body_norm TEXT,
  lang TEXT,
  weight REAL NOT NULL DEFAULT 1,
  source_updated_at TEXT
);

-- @ga:object index ux_workspaces_system
CREATE UNIQUE INDEX ux_workspaces_system ON workspaces(kind) WHERE kind = 'system';

-- @ga:object index ix_users_avatar_blob_id
CREATE INDEX ix_users_avatar_blob_id ON users(avatar_blob_id);

-- @ga:object index ix_auth_sessions_user
CREATE INDEX ix_auth_sessions_user ON auth_sessions(user_id, expires_at);

-- @ga:object index ix_id_aliases_old
CREATE INDEX ix_id_aliases_old ON id_aliases(workspace_id, old_display_id);

-- @ga:object index ux_roles_name
CREATE UNIQUE INDEX ux_roles_name ON roles(workspace_id, name_norm) WHERE deleted_at IS NULL;

-- @ga:object index ix_roles_state
CREATE INDEX ix_roles_state ON roles(workspace_id, lifecycle_status, runtime_state);

-- @ga:object index ix_roles_active
CREATE INDEX ix_roles_active ON roles(workspace_id, last_active_at);

-- @ga:object index ix_roles_avatar_id
CREATE INDEX ix_roles_avatar_id ON roles(avatar_id);

-- @ga:object index ix_roles_birth_revision_id
CREATE INDEX ix_roles_birth_revision_id ON roles(birth_revision_id);

-- @ga:object index ix_roles_current_revision_id
CREATE INDEX ix_roles_current_revision_id ON roles(current_revision_id);

-- @ga:object index ix_avatars_role
CREATE INDEX ix_avatars_role ON avatars(role_id, created_at);

-- @ga:object index ix_avatars_blob_id
CREATE INDEX ix_avatars_blob_id ON avatars(blob_id);

-- @ga:object index ix_avatars_skin_asset_id
CREATE INDEX ix_avatars_skin_asset_id ON avatars(skin_asset_id);

-- @ga:object index ux_sn_code
CREATE UNIQUE INDEX ux_sn_code ON skin_assets(workspace_id, pack_slug, asset_code) WHERE deleted_at IS NULL;

-- @ga:object index ix_sn_pack
CREATE INDEX ix_sn_pack ON skin_assets(workspace_id, pack_slug, status);

-- @ga:object index ux_dna_fields_slot
CREATE UNIQUE INDEX ux_dna_fields_slot ON dna_fields(role_id, def_id, item_index) WHERE deleted_at IS NULL;

-- @ga:object index ix_dna_fields_grid
CREATE INDEX ix_dna_fields_grid ON dna_fields(workspace_id, role_id, status);

-- @ga:object index ix_dna_fields_role_id
CREATE INDEX ix_dna_fields_role_id ON dna_fields(role_id);

-- @ga:object index ix_dna_fields_source_message_id
CREATE INDEX ix_dna_fields_source_message_id ON dna_fields(source_message_id);

-- @ga:object index ix_dna_fields_covered_by_instruction_id
CREATE INDEX ix_dna_fields_covered_by_instruction_id ON dna_fields(covered_by_instruction_id);

-- @ga:object index ix_dna_field_versions_revision_id
CREATE INDEX ix_dna_field_versions_revision_id ON dna_field_versions(revision_id);

-- @ga:object index ix_dna_field_versions_change_set_id
CREATE INDEX ix_dna_field_versions_change_set_id ON dna_field_versions(change_set_id);

-- @ga:object index ux_rv_ws_seq
CREATE UNIQUE INDEX ux_rv_ws_seq ON revisions(workspace_id, seq) WHERE scope = 'workspace';

-- @ga:object index ix_revisions_change_set_id
CREATE INDEX ix_revisions_change_set_id ON revisions(change_set_id);

-- @ga:object index ix_revisions_restored_from_id
CREATE INDEX ix_revisions_restored_from_id ON revisions(restored_from_id);

-- @ga:object index ix_change_sets_tray
CREATE INDEX ix_change_sets_tray ON change_sets(workspace_id, status, role_id);

-- @ga:object index ix_change_sets_role_id
CREATE INDEX ix_change_sets_role_id ON change_sets(role_id);

-- @ga:object index ix_change_sets_position_id
CREATE INDEX ix_change_sets_position_id ON change_sets(position_id);

-- @ga:object index ix_change_sets_source_thread_id
CREATE INDEX ix_change_sets_source_thread_id ON change_sets(source_thread_id);

-- @ga:object index ix_change_sets_source_message_id
CREATE INDEX ix_change_sets_source_message_id ON change_sets(source_message_id);

-- @ga:object index ix_change_sets_source_session_id
CREATE INDEX ix_change_sets_source_session_id ON change_sets(source_session_id);

-- @ga:object index ix_change_sets_revision_id
CREATE INDEX ix_change_sets_revision_id ON change_sets(revision_id);

-- @ga:object index ix_change_set_items_change_set_id
CREATE INDEX ix_change_set_items_change_set_id ON change_set_items(change_set_id);

-- @ga:object index ix_change_set_items_dna_field_version_id
CREATE INDEX ix_change_set_items_dna_field_version_id ON change_set_items(dna_field_version_id);

-- @ga:object index ix_change_set_items_instruction_version_id
CREATE INDEX ix_change_set_items_instruction_version_id ON change_set_items(instruction_version_id);

-- @ga:object index ix_change_set_items_skill_version_id
CREATE INDEX ix_change_set_items_skill_version_id ON change_set_items(skill_version_id);

-- @ga:object index ix_change_set_items_role_skill_id
CREATE INDEX ix_change_set_items_role_skill_id ON change_set_items(role_skill_id);

-- @ga:object index ix_change_set_items_knowledge_item_id
CREATE INDEX ix_change_set_items_knowledge_item_id ON change_set_items(knowledge_item_id);

-- @ga:object index ix_change_set_items_memory_id
CREATE INDEX ix_change_set_items_memory_id ON change_set_items(memory_id);

-- @ga:object index ix_change_set_items_taxonomy_node_id
CREATE INDEX ix_change_set_items_taxonomy_node_id ON change_set_items(taxonomy_node_id);

-- @ga:object index ix_change_set_items_skill_prereq_id
CREATE INDEX ix_change_set_items_skill_prereq_id ON change_set_items(skill_prereq_id);

-- @ga:object index ix_instructions_role
CREATE INDEX ix_instructions_role ON instructions(workspace_id, role_id, status, layer, ordinal);

-- @ga:object index ix_instructions_pos
CREATE INDEX ix_instructions_pos ON instructions(workspace_id, position_id, status, ordinal);

-- @ga:object index ix_instructions_layer
CREATE INDEX ix_instructions_layer ON instructions(workspace_id, layer, status, ordinal);

-- @ga:object index ix_instructions_role_id
CREATE INDEX ix_instructions_role_id ON instructions(role_id);

-- @ga:object index ix_instructions_position_id
CREATE INDEX ix_instructions_position_id ON instructions(position_id);

-- @ga:object index ix_instruction_versions_revision_id
CREATE INDEX ix_instruction_versions_revision_id ON instruction_versions(revision_id);

-- @ga:object index ix_instruction_versions_change_set_id
CREATE INDEX ix_instruction_versions_change_set_id ON instruction_versions(change_set_id);

-- @ga:object index ux_tx_name
CREATE UNIQUE INDEX ux_tx_name ON taxonomy_nodes(workspace_id, domain, COALESCE(parent_id, ''), name_norm) WHERE deleted_at IS NULL;

-- @ga:object index ix_tx_tree
CREATE INDEX ix_tx_tree ON taxonomy_nodes(workspace_id, domain, level, status);

-- @ga:object index ix_taxonomy_nodes_parent_id
CREATE INDEX ix_taxonomy_nodes_parent_id ON taxonomy_nodes(parent_id);

-- @ga:object index ix_taxonomy_nodes_change_set_id
CREATE INDEX ix_taxonomy_nodes_change_set_id ON taxonomy_nodes(change_set_id);

-- @ga:object index ux_skills_slug
CREATE UNIQUE INDEX ux_skills_slug ON skills(workspace_id, slug) WHERE deleted_at IS NULL;

-- @ga:object index ix_skills_status
CREATE INDEX ix_skills_status ON skills(workspace_id, status);

-- @ga:object index ix_skills_current_version_id
CREATE INDEX ix_skills_current_version_id ON skills(current_version_id);

-- @ga:object index ix_skills_category_id
CREATE INDEX ix_skills_category_id ON skills(category_id);

-- @ga:object index ix_skill_versions_change_set_id
CREATE INDEX ix_skill_versions_change_set_id ON skill_versions(change_set_id);

-- @ga:object index ux_sp_pair
CREATE UNIQUE INDEX ux_sp_pair ON skill_prereqs(skill_id, requires_skill_id) WHERE deleted_at IS NULL;

-- @ga:object index ux_sp_upgrade
CREATE UNIQUE INDEX ux_sp_upgrade ON skill_prereqs(skill_id) WHERE kind = 'upgrade' AND status <> 'obsolete' AND deleted_at IS NULL;

-- @ga:object index ix_skill_prereqs_skill_id
CREATE INDEX ix_skill_prereqs_skill_id ON skill_prereqs(skill_id);

-- @ga:object index ix_skill_prereqs_requires_skill_id
CREATE INDEX ix_skill_prereqs_requires_skill_id ON skill_prereqs(requires_skill_id);

-- @ga:object index ix_skill_prereqs_change_set_id
CREATE INDEX ix_skill_prereqs_change_set_id ON skill_prereqs(change_set_id);

-- @ga:object index ix_skill_files_blob_id
CREATE INDEX ix_skill_files_blob_id ON skill_files(blob_id);

-- @ga:object index ux_role_skills
CREATE UNIQUE INDEX ux_role_skills ON role_skills(role_id, skill_id) WHERE deleted_at IS NULL;

-- @ga:object index ix_role_skills_grid
CREATE INDEX ix_role_skills_grid ON role_skills(workspace_id, role_id, status);

-- @ga:object index ix_role_skills_role_id
CREATE INDEX ix_role_skills_role_id ON role_skills(role_id);

-- @ga:object index ix_role_skills_skill_id
CREATE INDEX ix_role_skills_skill_id ON role_skills(skill_id);

-- @ga:object index ix_role_skills_skill_version_id
CREATE INDEX ix_role_skills_skill_version_id ON role_skills(skill_version_id);

-- @ga:object index ix_role_skills_change_set_id
CREATE INDEX ix_role_skills_change_set_id ON role_skills(change_set_id);

-- @ga:object index ux_kn_personal
CREATE UNIQUE INDEX ux_kn_personal ON knowledge_items(role_id, sha256) WHERE scope = 'personal' AND deleted_at IS NULL AND status <> 'superseded';

-- @ga:object index ux_kn_position
CREATE UNIQUE INDEX ux_kn_position ON knowledge_items(position_id, sha256) WHERE scope = 'position' AND deleted_at IS NULL AND status <> 'superseded';

-- @ga:object index ux_kn_workspace
CREATE UNIQUE INDEX ux_kn_workspace ON knowledge_items(workspace_id, sha256) WHERE scope = 'workspace' AND deleted_at IS NULL AND status <> 'superseded';

-- @ga:object index ix_kn_role
CREATE INDEX ix_kn_role ON knowledge_items(workspace_id, role_id, status);

-- @ga:object index ix_kn_pos
CREATE INDEX ix_kn_pos ON knowledge_items(workspace_id, position_id, status);

-- @ga:object index ix_kn_queue
CREATE INDEX ix_kn_queue ON knowledge_items(processing_state) WHERE processing_state <> 'ready';

-- @ga:object index ix_knowledge_items_role_id
CREATE INDEX ix_knowledge_items_role_id ON knowledge_items(role_id);

-- @ga:object index ix_knowledge_items_position_id
CREATE INDEX ix_knowledge_items_position_id ON knowledge_items(position_id);

-- @ga:object index ix_knowledge_items_blob_id
CREATE INDEX ix_knowledge_items_blob_id ON knowledge_items(blob_id);

-- @ga:object index ix_knowledge_items_duplicate_of_id
CREATE INDEX ix_knowledge_items_duplicate_of_id ON knowledge_items(duplicate_of_id);

-- @ga:object index ix_knowledge_items_superseded_by_id
CREATE INDEX ix_knowledge_items_superseded_by_id ON knowledge_items(superseded_by_id);

-- @ga:object index ix_knowledge_items_source_attachment_id
CREATE INDEX ix_knowledge_items_source_attachment_id ON knowledge_items(source_attachment_id);

-- @ga:object index ix_knowledge_items_change_set_id
CREATE INDEX ix_knowledge_items_change_set_id ON knowledge_items(change_set_id);

-- @ga:object index ix_knowledge_items_category_id
CREATE INDEX ix_knowledge_items_category_id ON knowledge_items(category_id);

-- @ga:object index ix_mm_role
CREATE INDEX ix_mm_role ON memories(workspace_id, role_id, status, created_at);

-- @ga:object index ix_mm_pos
CREATE INDEX ix_mm_pos ON memories(workspace_id, position_id, status, created_at);

-- @ga:object index ix_memories_role_id
CREATE INDEX ix_memories_role_id ON memories(role_id);

-- @ga:object index ix_memories_position_id
CREATE INDEX ix_memories_position_id ON memories(position_id);

-- @ga:object index ix_memories_source_session_id
CREATE INDEX ix_memories_source_session_id ON memories(source_session_id);

-- @ga:object index ix_memories_source_message_id
CREATE INDEX ix_memories_source_message_id ON memories(source_message_id);

-- @ga:object index ix_memories_superseded_by_id
CREATE INDEX ix_memories_superseded_by_id ON memories(superseded_by_id);

-- @ga:object index ix_memories_commitment_id
CREATE INDEX ix_memories_commitment_id ON memories(commitment_id);

-- @ga:object index ix_memories_change_set_id
CREATE INDEX ix_memories_change_set_id ON memories(change_set_id);

-- @ga:object index ix_memories_role_wound_id
CREATE INDEX ix_memories_role_wound_id ON memories(role_wound_id);

-- @ga:object index ix_memories_evidence_task_id
CREATE INDEX ix_memories_evidence_task_id ON memories(evidence_task_id);

-- @ga:object index ix_rh_mem
CREATE INDEX ix_rh_mem ON recall_hits(memory_id, created_at);

-- @ga:object index ix_rh_kn
CREATE INDEX ix_rh_kn ON recall_hits(knowledge_item_id, created_at);

-- @ga:object index ix_recall_hits_session_id
CREATE INDEX ix_recall_hits_session_id ON recall_hits(session_id);

-- @ga:object index ix_recall_hits_role_id
CREATE INDEX ix_recall_hits_role_id ON recall_hits(role_id);

-- @ga:object index ix_recall_hits_knowledge_chunk_id
CREATE INDEX ix_recall_hits_knowledge_chunk_id ON recall_hits(knowledge_chunk_id);

-- @ga:object index ux_positions_default
CREATE UNIQUE INDEX ux_positions_default ON positions(workspace_id) WHERE is_default = 1 AND deleted_at IS NULL;

-- @ga:object index ix_positions_reports_to_position_id
CREATE INDEX ix_positions_reports_to_position_id ON positions(reports_to_position_id);

-- @ga:object index ix_positions_current_revision_id
CREATE INDEX ix_positions_current_revision_id ON positions(current_revision_id);

-- @ga:object index ux_asg_pos
CREATE UNIQUE INDEX ux_asg_pos ON assignments(position_id) WHERE status = 'active' AND deleted_at IS NULL;

-- @ga:object index ux_asg_role
CREATE UNIQUE INDEX ux_asg_role ON assignments(role_id) WHERE status = 'active' AND deleted_at IS NULL;

-- @ga:object index ix_asg_role
CREATE INDEX ix_asg_role ON assignments(role_id, status);

-- @ga:object index ix_assignments_position_id
CREATE INDEX ix_assignments_position_id ON assignments(position_id);

-- @ga:object index ix_ttc_asg
CREATE INDEX ix_ttc_asg ON trust_tier_changes(assignment_id, display_seq);

-- @ga:object index ix_trust_tier_changes_role_id
CREATE INDEX ix_trust_tier_changes_role_id ON trust_tier_changes(role_id);

-- @ga:object index ix_trust_tier_changes_position_id
CREATE INDEX ix_trust_tier_changes_position_id ON trust_tier_changes(position_id);

-- @ga:object index ix_tasks_a0
CREATE INDEX ix_tasks_a0 ON tasks(workspace_id, status, created_at);

-- @ga:object index ix_tasks_role
CREATE INDEX ix_tasks_role ON tasks(workspace_id, assignee_role_id, status);

-- @ga:object index ix_tasks_pos
CREATE INDEX ix_tasks_pos ON tasks(workspace_id, position_id, status, due_at);

-- @ga:object index ix_tasks_position_id
CREATE INDEX ix_tasks_position_id ON tasks(position_id);

-- @ga:object index ix_tasks_assignee_role_id
CREATE INDEX ix_tasks_assignee_role_id ON tasks(assignee_role_id);

-- @ga:object index ix_tasks_commitment_id
CREATE INDEX ix_tasks_commitment_id ON tasks(commitment_id);

-- @ga:object index ix_tasks_parent_task_id
CREATE INDEX ix_tasks_parent_task_id ON tasks(parent_task_id);

-- @ga:object index ix_tasks_proactive_job_id
CREATE INDEX ix_tasks_proactive_job_id ON tasks(proactive_job_id);

-- @ga:object index ix_tasks_thread_id
CREATE INDEX ix_tasks_thread_id ON tasks(thread_id);

-- @ga:object index ix_tasks_paused_by_wound_id
CREATE INDEX ix_tasks_paused_by_wound_id ON tasks(paused_by_wound_id);

-- @ga:object index ix_tasks_source_message_id
CREATE INDEX ix_tasks_source_message_id ON tasks(source_message_id);

-- @ga:object index ix_cm_pos
CREATE INDEX ix_cm_pos ON commitments(workspace_id, position_id, status, due_at);

-- @ga:object index ix_cm_open
CREATE INDEX ix_cm_open ON commitments(due_at) WHERE status = 'open' AND deleted_at IS NULL;

-- @ga:object index ix_commitments_position_id
CREATE INDEX ix_commitments_position_id ON commitments(position_id);

-- @ga:object index ix_commitments_promised_by_role_id
CREATE INDEX ix_commitments_promised_by_role_id ON commitments(promised_by_role_id);

-- @ga:object index ix_commitments_source_message_id
CREATE INDEX ix_commitments_source_message_id ON commitments(source_message_id);

-- @ga:object index ix_commitments_source_session_id
CREATE INDEX ix_commitments_source_session_id ON commitments(source_session_id);

-- @ga:object index ix_ss_role
CREATE INDEX ix_ss_role ON sessions(workspace_id, role_id, started_at);

-- @ga:object index ix_ss_day
CREATE INDEX ix_ss_day ON sessions(workspace_id, started_at);

-- @ga:object index ix_ss_acc
CREATE INDEX ix_ss_acc ON sessions(engine_account_id, started_at);

-- @ga:object index ix_sessions_role_id
CREATE INDEX ix_sessions_role_id ON sessions(role_id);

-- @ga:object index ix_sessions_position_id
CREATE INDEX ix_sessions_position_id ON sessions(position_id);

-- @ga:object index ix_sessions_task_id
CREATE INDEX ix_sessions_task_id ON sessions(task_id);

-- @ga:object index ix_sessions_thread_id
CREATE INDEX ix_sessions_thread_id ON sessions(thread_id);

-- @ga:object index ix_sessions_compiled_prompt_id
CREATE INDEX ix_sessions_compiled_prompt_id ON sessions(compiled_prompt_id);

-- @ga:object index ix_sessions_container_id
CREATE INDEX ix_sessions_container_id ON sessions(container_id);

-- @ga:object index ux_wallets_role
CREATE UNIQUE INDEX ux_wallets_role ON wallets(role_id) WHERE role_id IS NOT NULL;

-- @ga:object index ux_wallets_sys
CREATE UNIQUE INDEX ux_wallets_sys ON wallets(workspace_id, owner_kind) WHERE owner_kind IN ('treasury', 'sink');

-- @ga:object index ix_wallets_role_id
CREATE INDEX ix_wallets_role_id ON wallets(role_id);

-- @ga:object index ix_lg_debit
CREATE INDEX ix_lg_debit ON ledger_entries(debit_wallet_id, display_seq);

-- @ga:object index ix_lg_credit
CREATE INDEX ix_lg_credit ON ledger_entries(credit_wallet_id, display_seq);

-- @ga:object index ix_lg_role
CREATE INDEX ix_lg_role ON ledger_entries(workspace_id, role_id, display_seq);

-- @ga:object index ix_lg_task
CREATE INDEX ix_lg_task ON ledger_entries(task_id) WHERE task_id IS NOT NULL;

-- @ga:object index ux_rw_open
CREATE UNIQUE INDEX ux_rw_open ON role_wounds(role_id) WHERE ended_at IS NULL;

-- @ga:object index ix_rw_role
CREATE INDEX ix_rw_role ON role_wounds(role_id, display_seq);

-- @ga:object index ix_role_wounds_reflection_session_id
CREATE INDEX ix_role_wounds_reflection_session_id ON role_wounds(reflection_session_id);

-- @ga:object index ux_usage
CREATE UNIQUE INDEX ux_usage ON usage_daily(workspace_id, day_local, COALESCE(role_id, ''), COALESCE(engine_account_id, ''), agent_kind);

-- @ga:object index ix_usage_role
CREATE INDEX ix_usage_role ON usage_daily(workspace_id, role_id, day_local);

-- @ga:object index ux_ei_engine
CREATE UNIQUE INDEX ux_ei_engine ON engine_installs(workspace_id, engine_slug) WHERE deleted_at IS NULL;

-- @ga:object index ux_en_label
CREATE UNIQUE INDEX ux_en_label ON engine_accounts(workspace_id, engine_slug, label) WHERE deleted_at IS NULL;

-- @ga:object index ux_en_volume
CREATE UNIQUE INDEX ux_en_volume ON engine_accounts(auth_volume) WHERE auth_volume IS NOT NULL;

-- @ga:object index ix_en_grid
CREATE INDEX ix_en_grid ON engine_accounts(workspace_id, status, engine_slug);

-- @ga:object index ix_en_quota
CREATE INDEX ix_en_quota ON engine_accounts(workspace_id, quota_state);

-- @ga:object index ix_engine_accounts_secret_id
CREATE INDEX ix_engine_accounts_secret_id ON engine_accounts(secret_id);

-- @ga:object index ix_engine_accounts_last_probe_run_id
CREATE INDEX ix_engine_accounts_last_probe_run_id ON engine_accounts(last_probe_run_id);

-- @ga:object index ix_engine_accounts_overhead_bare_session_id
CREATE INDEX ix_engine_accounts_overhead_bare_session_id ON engine_accounts(overhead_bare_session_id);

-- @ga:object index ix_engine_accounts_overhead_shell_session_id
CREATE INDEX ix_engine_accounts_overhead_shell_session_id ON engine_accounts(overhead_shell_session_id);

-- @ga:object index ix_engine_accounts_consent_id
CREATE INDEX ix_engine_accounts_consent_id ON engine_accounts(consent_id);

-- @ga:object index ux_eb_account
CREATE UNIQUE INDEX ux_eb_account ON engine_bindings(engine_account_id) WHERE deleted_at IS NULL;

-- @ga:object index ux_eb_prio
CREATE UNIQUE INDEX ux_eb_prio ON engine_bindings(role_id, priority) WHERE role_id IS NOT NULL AND deleted_at IS NULL;

-- @ga:object index ux_eb_sys_prio
CREATE UNIQUE INDEX ux_eb_sys_prio ON engine_bindings(workspace_id, priority) WHERE consumer_kind = 'system' AND deleted_at IS NULL;

-- @ga:object index ix_engine_bindings_role_id
CREATE INDEX ix_engine_bindings_role_id ON engine_bindings(role_id);

-- @ga:object index ix_engine_bindings_engine_account_id
CREATE INDEX ix_engine_bindings_engine_account_id ON engine_bindings(engine_account_id);

-- @ga:object index ux_sa_key
CREATE UNIQUE INDEX ux_sa_key ON system_agents(workspace_id, system_key) WHERE deleted_at IS NULL;

-- @ga:object index ix_pb_acc
CREATE INDEX ix_pb_acc ON probe_runs(engine_account_id, started_at);

-- @ga:object index ix_probe_runs_container_id
CREATE INDEX ix_probe_runs_container_id ON probe_runs(container_id);

-- @ga:object index ix_probe_runs_raw_blob_id
CREATE INDEX ix_probe_runs_raw_blob_id ON probe_runs(raw_blob_id);

-- @ga:object index ix_cap_live
CREATE INDEX ix_cap_live ON capabilities(engine_account_id, kind) WHERE missing_since IS NULL;

-- @ga:object index ix_cap_state
CREATE INDEX ix_cap_state ON capabilities(workspace_id, kind, value_state);

-- @ga:object index ix_capabilities_last_probe_run_id
CREATE INDEX ix_capabilities_last_probe_run_id ON capabilities(last_probe_run_id);

-- @ga:object index ix_qs_acc
CREATE INDEX ix_qs_acc ON quota_snapshots(engine_account_id, window_key, observed_at);

-- @ga:object index ix_quota_snapshots_probe_run_id
CREATE INDEX ix_quota_snapshots_probe_run_id ON quota_snapshots(probe_run_id);

-- @ga:object index ux_mr
CREATE UNIQUE INDEX ux_mr ON model_ranks(workspace_id, engine_slug, model_key) WHERE deleted_at IS NULL;

-- @ga:object index ix_mr_rank
CREATE INDEX ix_mr_rank ON model_ranks(workspace_id, rank);

-- @ga:object index ux_gc
CREATE UNIQUE INDEX ux_gc ON compiled_prompts(revision_id, COALESCE(position_revision_id, ''), COALESCE(rules_revision_id, ''), COALESCE(engine_slug, ''), context_key, COALESCE(polaris_params_hash, ''));

-- @ga:object index ix_gc_role
CREATE INDEX ix_gc_role ON compiled_prompts(role_id, display_seq);

-- @ga:object index ix_compiled_prompts_position_revision_id
CREATE INDEX ix_compiled_prompts_position_revision_id ON compiled_prompts(position_revision_id);

-- @ga:object index ix_compiled_prompts_rules_revision_id
CREATE INDEX ix_compiled_prompts_rules_revision_id ON compiled_prompts(rules_revision_id);

-- @ga:object index ix_compiled_prompt_segments_dna_field_version_id
CREATE INDEX ix_compiled_prompt_segments_dna_field_version_id ON compiled_prompt_segments(dna_field_version_id);

-- @ga:object index ix_compiled_prompt_segments_instruction_version_id
CREATE INDEX ix_compiled_prompt_segments_instruction_version_id ON compiled_prompt_segments(instruction_version_id);

-- @ga:object index ix_compiled_prompt_segments_skill_version_id
CREATE INDEX ix_compiled_prompt_segments_skill_version_id ON compiled_prompt_segments(skill_version_id);

-- @ga:object index ux_ct_role
CREATE UNIQUE INDEX ux_ct_role ON containers(role_id) WHERE role_id IS NOT NULL AND deleted_at IS NULL;

-- @ga:object index ux_ct_system
CREATE UNIQUE INDEX ux_ct_system ON containers(workspace_id) WHERE kind = 'system' AND deleted_at IS NULL;

-- @ga:object index ux_ct_name
CREATE UNIQUE INDEX ux_ct_name ON containers(container_name) WHERE deleted_at IS NULL;

-- @ga:object index ix_ct_state
CREATE INDEX ix_ct_state ON containers(workspace_id, observed_state);

-- @ga:object index ix_containers_role_id
CREATE INDEX ix_containers_role_id ON containers(role_id);

-- @ga:object index ux_tg_role
CREATE UNIQUE INDEX ux_tg_role ON telegram_bots(role_id) WHERE deleted_at IS NULL;

-- @ga:object index ux_tg_bot
CREATE UNIQUE INDEX ux_tg_bot ON telegram_bots(workspace_id, bot_tg_id) WHERE deleted_at IS NULL;

-- @ga:object index ix_tg_status
CREATE INDEX ix_tg_status ON telegram_bots(workspace_id, status);

-- @ga:object index ix_telegram_bots_role_id
CREATE INDEX ix_telegram_bots_role_id ON telegram_bots(role_id);

-- @ga:object index ix_telegram_bots_secret_id
CREATE INDEX ix_telegram_bots_secret_id ON telegram_bots(secret_id);

-- @ga:object index ux_al
CREATE UNIQUE INDEX ux_al ON telegram_allowlist(bot_id, tg_user_id) WHERE deleted_at IS NULL;

-- @ga:object index ix_telegram_allowlist_bot_id
CREATE INDEX ix_telegram_allowlist_bot_id ON telegram_allowlist(bot_id);

-- @ga:object index ux_pp_role
CREATE UNIQUE INDEX ux_pp_role ON proactive_policies(role_id) WHERE deleted_at IS NULL;

-- @ga:object index ix_proactive_policies_role_id
CREATE INDEX ix_proactive_policies_role_id ON proactive_policies(role_id);

-- @ga:object index ix_pa_due
CREATE INDEX ix_pa_due ON proactive_jobs(next_run_at) WHERE is_enabled = 1 AND deleted_at IS NULL;

-- @ga:object index ix_proactive_jobs_position_id
CREATE INDEX ix_proactive_jobs_position_id ON proactive_jobs(position_id);

-- @ga:object index ix_proactive_jobs_skill_id
CREATE INDEX ix_proactive_jobs_skill_id ON proactive_jobs(skill_id);

-- @ga:object index ix_pn_cap
CREATE INDEX ix_pn_cap ON proactive_sends(role_id, day_local, status);

-- @ga:object index ix_pn_kind
CREATE INDEX ix_pn_kind ON proactive_sends(role_id, trigger_kind, created_at);

-- @ga:object index ix_pn_lease
CREATE INDEX ix_pn_lease ON proactive_sends(reserved_until) WHERE status = 'reserved';

-- @ga:object index ix_proactive_sends_policy_id
CREATE INDEX ix_proactive_sends_policy_id ON proactive_sends(policy_id);

-- @ga:object index ix_proactive_sends_message_id
CREATE INDEX ix_proactive_sends_message_id ON proactive_sends(message_id);

-- @ga:object index ix_proactive_sends_task_id
CREATE INDEX ix_proactive_sends_task_id ON proactive_sends(task_id);

-- @ga:object index ix_proactive_sends_commitment_id
CREATE INDEX ix_proactive_sends_commitment_id ON proactive_sends(commitment_id);

-- @ga:object index ix_proactive_sends_proactive_job_id
CREATE INDEX ix_proactive_sends_proactive_job_id ON proactive_sends(proactive_job_id);

-- @ga:object index ux_tl_slug
CREATE UNIQUE INDEX ux_tl_slug ON tools(workspace_id, slug) WHERE deleted_at IS NULL;

-- @ga:object index ix_tools_secret_id
CREATE INDEX ix_tools_secret_id ON tools(secret_id);

-- @ga:object index ux_gr_role
CREATE UNIQUE INDEX ux_gr_role ON tool_grants(tool_id, role_id) WHERE role_id IS NOT NULL AND deleted_at IS NULL;

-- @ga:object index ux_gr_pos
CREATE UNIQUE INDEX ux_gr_pos ON tool_grants(tool_id, position_id) WHERE position_id IS NOT NULL AND deleted_at IS NULL;

-- @ga:object index ix_tool_grants_tool_id
CREATE INDEX ix_tool_grants_tool_id ON tool_grants(tool_id);

-- @ga:object index ix_tool_grants_role_id
CREATE INDEX ix_tool_grants_role_id ON tool_grants(role_id);

-- @ga:object index ix_tool_grants_position_id
CREATE INDEX ix_tool_grants_position_id ON tool_grants(position_id);

-- @ga:object index ix_tool_grants_source_request_id
CREATE INDEX ix_tool_grants_source_request_id ON tool_grants(source_request_id);

-- @ga:object index ix_pm_pending
CREATE INDEX ix_pm_pending ON permission_requests(workspace_id, created_at) WHERE status = 'pending';

-- @ga:object index ix_permission_requests_role_id
CREATE INDEX ix_permission_requests_role_id ON permission_requests(role_id);

-- @ga:object index ix_permission_requests_tool_id
CREATE INDEX ix_permission_requests_tool_id ON permission_requests(tool_id);

-- @ga:object index ix_permission_requests_task_id
CREATE INDEX ix_permission_requests_task_id ON permission_requests(task_id);

-- @ga:object index ix_permission_requests_session_id
CREATE INDEX ix_permission_requests_session_id ON permission_requests(session_id);

-- @ga:object index ix_permission_requests_grant_id
CREATE INDEX ix_permission_requests_grant_id ON permission_requests(grant_id);

-- @ga:object index ux_eg
CREATE UNIQUE INDEX ux_eg ON egress_rules(workspace_id, domain_pattern, applies_to, COALESCE(role_id, ''), COALESCE(position_id, ''), COALESCE(tool_id, '')) WHERE deleted_at IS NULL;

-- @ga:object index ix_egress_rules_role_id
CREATE INDEX ix_egress_rules_role_id ON egress_rules(role_id);

-- @ga:object index ix_egress_rules_position_id
CREATE INDEX ix_egress_rules_position_id ON egress_rules(position_id);

-- @ga:object index ix_egress_rules_tool_id
CREATE INDEX ix_egress_rules_tool_id ON egress_rules(tool_id);

-- @ga:object index ix_pc_role
CREATE INDEX ix_pc_role ON polaris_checks(workspace_id, role_id, display_seq);

-- @ga:object index ix_polaris_checks_role_id
CREATE INDEX ix_polaris_checks_role_id ON polaris_checks(role_id);

-- @ga:object index ix_polaris_checks_change_set_id
CREATE INDEX ix_polaris_checks_change_set_id ON polaris_checks(change_set_id);

-- @ga:object index ix_polaris_checks_permission_request_id
CREATE INDEX ix_polaris_checks_permission_request_id ON polaris_checks(permission_request_id);

-- @ga:object index ix_polaris_checks_proactive_send_id
CREATE INDEX ix_polaris_checks_proactive_send_id ON polaris_checks(proactive_send_id);

-- @ga:object index ix_polaris_checks_task_id
CREATE INDEX ix_polaris_checks_task_id ON polaris_checks(task_id);

-- @ga:object index ix_polaris_checks_session_id
CREATE INDEX ix_polaris_checks_session_id ON polaris_checks(session_id);

-- @ga:object index ux_cd_live
CREATE UNIQUE INDEX ux_cd_live ON employee_cards(role_id) WHERE status IN ('issued', 'suspended') AND deleted_at IS NULL;

-- @ga:object index ix_employee_cards_role_id
CREATE INDEX ix_employee_cards_role_id ON employee_cards(role_id);

-- @ga:object index ix_employee_cards_revision_id
CREATE INDEX ix_employee_cards_revision_id ON employee_cards(revision_id);

-- @ga:object index ix_employee_cards_compiled_prompt_id
CREATE INDEX ix_employee_cards_compiled_prompt_id ON employee_cards(compiled_prompt_id);

-- @ga:object index ix_employee_cards_position_id
CREATE INDEX ix_employee_cards_position_id ON employee_cards(position_id);

-- @ga:object index ix_employee_cards_superseded_by_id
CREATE INDEX ix_employee_cards_superseded_by_id ON employee_cards(superseded_by_id);

-- @ga:object index ix_tr_role
CREATE INDEX ix_tr_role ON trial_runs(role_id, display_seq);

-- @ga:object index ix_trial_runs_revision_id
CREATE INDEX ix_trial_runs_revision_id ON trial_runs(revision_id);

-- @ga:object index ix_trial_runs_compiled_prompt_id
CREATE INDEX ix_trial_runs_compiled_prompt_id ON trial_runs(compiled_prompt_id);

-- @ga:object index ix_trial_runs_engine_account_id
CREATE INDEX ix_trial_runs_engine_account_id ON trial_runs(engine_account_id);

-- @ga:object index ix_trial_runs_judge_session_id
CREATE INDEX ix_trial_runs_judge_session_id ON trial_runs(judge_session_id);

-- @ga:object index ux_th_tg
CREATE UNIQUE INDEX ux_th_tg ON chat_threads(telegram_bot_id, tg_chat_id) WHERE kind = 'telegram' AND deleted_at IS NULL;

-- @ga:object index ix_th_role
CREATE INDEX ix_th_role ON chat_threads(workspace_id, role_id, kind, last_message_at);

-- @ga:object index ix_chat_threads_role_id
CREATE INDEX ix_chat_threads_role_id ON chat_threads(role_id);

-- @ga:object index ix_chat_threads_telegram_bot_id
CREATE INDEX ix_chat_threads_telegram_bot_id ON chat_threads(telegram_bot_id);

-- @ga:object index ux_msg_ext
CREATE UNIQUE INDEX ux_msg_ext ON chat_messages(thread_id, external_id) WHERE external_id IS NOT NULL;

-- @ga:object index ix_msg_thread
CREATE INDEX ix_msg_thread ON chat_messages(thread_id, display_seq);

-- @ga:object index ix_chat_messages_session_id
CREATE INDEX ix_chat_messages_session_id ON chat_messages(session_id);

-- @ga:object index ix_chat_messages_reply_to_id
CREATE INDEX ix_chat_messages_reply_to_id ON chat_messages(reply_to_id);

-- @ga:object index ix_at_orphan
CREATE INDEX ix_at_orphan ON message_attachments(created_at) WHERE message_id IS NULL;

-- @ga:object index ix_message_attachments_message_id
CREATE INDEX ix_message_attachments_message_id ON message_attachments(message_id);

-- @ga:object index ix_message_attachments_blob_id
CREATE INDEX ix_message_attachments_blob_id ON message_attachments(blob_id);

-- @ga:object index ix_message_attachments_thumbnail_blob_id
CREATE INDEX ix_message_attachments_thumbnail_blob_id ON message_attachments(thumbnail_blob_id);

-- @ga:object index ix_an_entity
CREATE INDEX ix_an_entity ON message_anchors(workspace_id, entity_id);

-- @ga:object index ix_message_anchors_message_id
CREATE INDEX ix_message_anchors_message_id ON message_anchors(message_id);

-- @ga:object index ix_ua_msg
CREATE INDEX ix_ua_msg ON ui_actions(message_id, display_seq);

-- @ga:object index ix_ua_entity
CREATE INDEX ix_ua_entity ON ui_actions(workspace_id, entity_id);

-- @ga:object index ix_ui_actions_session_id
CREATE INDEX ix_ui_actions_session_id ON ui_actions(session_id);

-- @ga:object index ix_ui_actions_change_set_id
CREATE INDEX ix_ui_actions_change_set_id ON ui_actions(change_set_id);

-- @ga:object index ix_au_time
CREATE INDEX ix_au_time ON audit_log(workspace_id, created_at);

-- @ga:object index ix_au_role
CREATE INDEX ix_au_role ON audit_log(workspace_id, role_id, display_seq);

-- @ga:object index ix_au_entity
CREATE INDEX ix_au_entity ON audit_log(workspace_id, entity_id);

-- @ga:object index ix_au_action
CREATE INDEX ix_au_action ON audit_log(workspace_id, action, display_seq);

-- @ga:object index ix_au_req
CREATE INDEX ix_au_req ON audit_log(request_id);

-- @ga:object index ix_ev_time
CREATE INDEX ix_ev_time ON events(workspace_id, created_at);

-- @ga:object index ix_ev_role
CREATE INDEX ix_ev_role ON events(workspace_id, role_id, created_at);

-- @ga:object index ix_ev_kind
CREATE INDEX ix_ev_kind ON events(workspace_id, kind, created_at);

-- @ga:object index ix_ev_entity
CREATE INDEX ix_ev_entity ON events(entity_id, kind, created_at) WHERE entity_id IS NOT NULL;

-- @ga:object index ux_nt_dedupe
CREATE UNIQUE INDEX ux_nt_dedupe ON notifications(user_id, dedupe_key) WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL;

-- @ga:object index ix_nt_user
CREATE INDEX ix_nt_user ON notifications(user_id, read_at, created_at);

-- @ga:object index ux_jobs_dedupe
CREATE UNIQUE INDEX ux_jobs_dedupe ON jobs(workspace_id, dedupe_key) WHERE status = 'queued' AND dedupe_key IS NOT NULL;

-- @ga:object index ux_jobs_reflection
CREATE UNIQUE INDEX ux_jobs_reflection ON jobs(workspace_id, dedupe_key) WHERE kind = 'wound_reflection';

-- @ga:object index ix_jobs_queue
CREATE INDEX ix_jobs_queue ON jobs(run_after, priority) WHERE status = 'queued';

-- @ga:object index ix_jobs_kind
CREATE INDEX ix_jobs_kind ON jobs(workspace_id, kind, status);

-- @ga:object index ux_up_current
CREATE UNIQUE INDEX ux_up_current ON app_versions(status) WHERE status = 'current';

-- @ga:object index ix_bk_status
CREATE INDEX ix_bk_status ON backups(status, created_at);

-- @ga:object index ix_update_runs_backup_id
CREATE INDEX ix_update_runs_backup_id ON update_runs(backup_id);

-- @ga:object index ux_st_key
CREATE UNIQUE INDEX ux_st_key ON settings(workspace_id, key) WHERE deleted_at IS NULL;

-- @ga:object index ix_sec_fp
CREATE INDEX ix_sec_fp ON secrets(workspace_id, fingerprint);

-- @ga:object index ix_secrets_rotated_from_id
CREATE INDEX ix_secrets_rotated_from_id ON secrets(rotated_from_id);

-- @ga:object index ix_cn_kind
CREATE INDEX ix_cn_kind ON consents(workspace_id, consent_kind, subject);

-- @ga:object index ux_sd
CREATE UNIQUE INDEX ux_sd ON search_documents(entity_type, entity_id, COALESCE(chunk_id, ''));

-- @ga:object index ix_sd_grid
CREATE INDEX ix_sd_grid ON search_documents(workspace_id, entity_type, is_live);

-- @ga:object index ix_sd_role
CREATE INDEX ix_sd_role ON search_documents(role_id) WHERE role_id IS NOT NULL;

-- @ga:object table search_fts
CREATE VIRTUAL TABLE search_fts USING fts5(title_norm, body_norm, content='search_documents', content_rowid='id', tokenize='unicode61');
