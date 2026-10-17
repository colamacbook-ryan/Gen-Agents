CREATE TABLE workspaces (
  id TEXT PRIMARY KEY CHECK (length(id) = 26),
  kind TEXT NOT NULL CHECK (kind IN ('system', 'tenant')),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id),
  short_code TEXT NOT NULL UNIQUE CHECK (typeof(short_code) = 'text' AND length(short_code) = 4),
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

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  access_level TEXT NOT NULL CHECK (access_level IN ('owner', 'admin', 'operator', 'viewer')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  removed_at TEXT,
  PRIMARY KEY (workspace_id, user_id)
);

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

CREATE TABLE id_counters (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  prefix TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  PRIMARY KEY (workspace_id, prefix)
);

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
  sha256 TEXT NOT NULL CHECK (typeof(sha256) = 'text' AND length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*' AND length(CAST(sha256 AS BLOB)) = length(sha256)),
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
  slug TEXT NOT NULL CHECK (typeof(slug) = 'text' AND length(slug) BETWEEN 1 AND 64),
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
  slug TEXT NOT NULL CHECK (typeof(slug) = 'text' AND length(slug) BETWEEN 1 AND 64),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'obsolete')),
  origin TEXT NOT NULL CHECK (origin IN ('owner', 'trainer', 'imported', 'builtin')),
  current_version_id TEXT REFERENCES skill_versions(id) DEFERRABLE INITIALLY DEFERRED,
  category_id TEXT REFERENCES taxonomy_nodes(id) ON DELETE SET NULL,
  tier_label TEXT,
  UNIQUE (workspace_id, display_seq)
);

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

CREATE TABLE skill_engine_support (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_version_id TEXT NOT NULL REFERENCES skill_versions(id) ON DELETE CASCADE,
  engine_slug TEXT NOT NULL REFERENCES engines(slug),
  PRIMARY KEY (skill_version_id, engine_slug)
);

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
  tool_restriction_version TEXT,
  CHECK ((install_state = 'installed') = (installed_version IS NOT NULL)),
  CHECK ((install_state = 'failed') = (failure_reason IS NOT NULL))
);

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
  auth_volume TEXT CHECK (auth_volume IS NULL OR (typeof(auth_volume) = 'text' AND length(auth_volume) BETWEEN 3 AND 63 AND auth_volume NOT GLOB '*[^a-z0-9-]*' AND length(CAST(auth_volume AS BLOB)) = length(auth_volume))),
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
  max_per_day INTEGER NOT NULL DEFAULT 5 CHECK (typeof(max_per_day) = 'integer' AND max_per_day BETWEEN 0 AND 20),
  quiet_start_min INTEGER NOT NULL CHECK (typeof(quiet_start_min) = 'integer' AND quiet_start_min BETWEEN 0 AND 1439),
  quiet_end_min INTEGER NOT NULL CHECK (typeof(quiet_end_min) = 'integer' AND quiet_end_min BETWEEN 0 AND 1439),
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
  allowed_host TEXT CHECK (allowed_host IS NULL OR (typeof(allowed_host) = 'text' AND length(allowed_host) BETWEEN 1 AND 253 AND allowed_host NOT GLOB '*[^a-z0-9.:-]*' AND length(CAST(allowed_host AS BLOB)) = length(allowed_host) AND allowed_host NOT GLOB ':*' AND allowed_host NOT GLOB '*.' AND allowed_host NOT GLOB '*.:*' AND (allowed_host NOT GLOB '*:*' OR (substr(allowed_host, instr(allowed_host, ':') + 1) GLOB '[1-9]*' AND substr(allowed_host, instr(allowed_host, ':') + 1) NOT GLOB '*[^0-9]*' AND CAST(substr(allowed_host, instr(allowed_host, ':') + 1) AS INTEGER) <= 65535 AND substr(allowed_host, instr(allowed_host, ':') + 1) <> '443')))),
  CHECK ((kind = 'anchor_remote_token') = (allowed_host IS NOT NULL)),
  UNIQUE (workspace_id, display_seq)
);

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

CREATE UNIQUE INDEX ux_workspaces_system ON workspaces(kind) WHERE kind = 'system';

CREATE INDEX ix_users_avatar_blob_id ON users(avatar_blob_id);

CREATE INDEX ix_auth_sessions_user ON auth_sessions(user_id, expires_at);

CREATE INDEX ix_id_aliases_old ON id_aliases(workspace_id, old_display_id);

CREATE UNIQUE INDEX ux_roles_name ON roles(workspace_id, name_norm) WHERE deleted_at IS NULL;

CREATE INDEX ix_roles_state ON roles(workspace_id, lifecycle_status, runtime_state);

CREATE INDEX ix_roles_active ON roles(workspace_id, last_active_at);

CREATE INDEX ix_roles_avatar_id ON roles(avatar_id);

CREATE INDEX ix_roles_birth_revision_id ON roles(birth_revision_id);

CREATE INDEX ix_roles_current_revision_id ON roles(current_revision_id);

CREATE INDEX ix_avatars_role ON avatars(role_id, created_at);

CREATE INDEX ix_avatars_blob_id ON avatars(blob_id);

CREATE INDEX ix_avatars_skin_asset_id ON avatars(skin_asset_id);

CREATE UNIQUE INDEX ux_sn_code ON skin_assets(workspace_id, pack_slug, asset_code) WHERE deleted_at IS NULL;

CREATE INDEX ix_sn_pack ON skin_assets(workspace_id, pack_slug, status);

CREATE UNIQUE INDEX ux_dna_fields_slot ON dna_fields(role_id, def_id, item_index) WHERE deleted_at IS NULL;

CREATE INDEX ix_dna_fields_grid ON dna_fields(workspace_id, role_id, status);

CREATE INDEX ix_dna_fields_role_id ON dna_fields(role_id);

CREATE INDEX ix_dna_fields_source_message_id ON dna_fields(source_message_id);

CREATE INDEX ix_dna_fields_covered_by_instruction_id ON dna_fields(covered_by_instruction_id);

CREATE INDEX ix_dna_field_versions_revision_id ON dna_field_versions(revision_id);

CREATE INDEX ix_dna_field_versions_change_set_id ON dna_field_versions(change_set_id);

CREATE UNIQUE INDEX ux_rv_ws_seq ON revisions(workspace_id, seq) WHERE scope = 'workspace';

CREATE INDEX ix_revisions_change_set_id ON revisions(change_set_id);

CREATE INDEX ix_revisions_restored_from_id ON revisions(restored_from_id);

CREATE INDEX ix_change_sets_tray ON change_sets(workspace_id, status, role_id);

CREATE INDEX ix_change_sets_role_id ON change_sets(role_id);

CREATE INDEX ix_change_sets_position_id ON change_sets(position_id);

CREATE INDEX ix_change_sets_source_thread_id ON change_sets(source_thread_id);

CREATE INDEX ix_change_sets_source_message_id ON change_sets(source_message_id);

CREATE INDEX ix_change_sets_source_session_id ON change_sets(source_session_id);

CREATE INDEX ix_change_sets_revision_id ON change_sets(revision_id);

CREATE INDEX ix_change_set_items_change_set_id ON change_set_items(change_set_id);

CREATE INDEX ix_change_set_items_dna_field_version_id ON change_set_items(dna_field_version_id);

CREATE INDEX ix_change_set_items_instruction_version_id ON change_set_items(instruction_version_id);

CREATE INDEX ix_change_set_items_skill_version_id ON change_set_items(skill_version_id);

CREATE INDEX ix_change_set_items_role_skill_id ON change_set_items(role_skill_id);

CREATE INDEX ix_change_set_items_knowledge_item_id ON change_set_items(knowledge_item_id);

CREATE INDEX ix_change_set_items_memory_id ON change_set_items(memory_id);

CREATE INDEX ix_change_set_items_taxonomy_node_id ON change_set_items(taxonomy_node_id);

CREATE INDEX ix_change_set_items_skill_prereq_id ON change_set_items(skill_prereq_id);

CREATE INDEX ix_instructions_role ON instructions(workspace_id, role_id, status, layer, ordinal);

CREATE INDEX ix_instructions_pos ON instructions(workspace_id, position_id, status, ordinal);

CREATE INDEX ix_instructions_layer ON instructions(workspace_id, layer, status, ordinal);

CREATE INDEX ix_instructions_role_id ON instructions(role_id);

CREATE INDEX ix_instructions_position_id ON instructions(position_id);

CREATE INDEX ix_instruction_versions_revision_id ON instruction_versions(revision_id);

CREATE INDEX ix_instruction_versions_change_set_id ON instruction_versions(change_set_id);

CREATE UNIQUE INDEX ux_tx_name ON taxonomy_nodes(workspace_id, domain, COALESCE(parent_id, ''), name_norm) WHERE deleted_at IS NULL;

CREATE INDEX ix_tx_tree ON taxonomy_nodes(workspace_id, domain, level, status);

CREATE INDEX ix_taxonomy_nodes_parent_id ON taxonomy_nodes(parent_id);

CREATE INDEX ix_taxonomy_nodes_change_set_id ON taxonomy_nodes(change_set_id);

CREATE UNIQUE INDEX ux_skills_slug ON skills(workspace_id, slug) WHERE deleted_at IS NULL;

CREATE INDEX ix_skills_status ON skills(workspace_id, status);

CREATE INDEX ix_skills_current_version_id ON skills(current_version_id);

CREATE INDEX ix_skills_category_id ON skills(category_id);

CREATE INDEX ix_skill_versions_change_set_id ON skill_versions(change_set_id);

CREATE UNIQUE INDEX ux_sp_pair ON skill_prereqs(skill_id, requires_skill_id) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_sp_upgrade ON skill_prereqs(skill_id) WHERE kind = 'upgrade' AND status <> 'obsolete' AND deleted_at IS NULL;

CREATE INDEX ix_skill_prereqs_skill_id ON skill_prereqs(skill_id);

CREATE INDEX ix_skill_prereqs_requires_skill_id ON skill_prereqs(requires_skill_id);

CREATE INDEX ix_skill_prereqs_change_set_id ON skill_prereqs(change_set_id);

CREATE INDEX ix_skill_files_blob_id ON skill_files(blob_id);

CREATE UNIQUE INDEX ux_role_skills ON role_skills(role_id, skill_id) WHERE deleted_at IS NULL;

CREATE INDEX ix_role_skills_grid ON role_skills(workspace_id, role_id, status);

CREATE INDEX ix_role_skills_role_id ON role_skills(role_id);

CREATE INDEX ix_role_skills_skill_id ON role_skills(skill_id);

CREATE INDEX ix_role_skills_skill_version_id ON role_skills(skill_version_id);

CREATE INDEX ix_role_skills_change_set_id ON role_skills(change_set_id);

CREATE UNIQUE INDEX ux_kn_personal ON knowledge_items(role_id, sha256) WHERE scope = 'personal' AND deleted_at IS NULL AND status <> 'superseded';

CREATE UNIQUE INDEX ux_kn_position ON knowledge_items(position_id, sha256) WHERE scope = 'position' AND deleted_at IS NULL AND status <> 'superseded';

CREATE UNIQUE INDEX ux_kn_workspace ON knowledge_items(workspace_id, sha256) WHERE scope = 'workspace' AND deleted_at IS NULL AND status <> 'superseded';

CREATE INDEX ix_kn_role ON knowledge_items(workspace_id, role_id, status);

CREATE INDEX ix_kn_pos ON knowledge_items(workspace_id, position_id, status);

CREATE INDEX ix_kn_queue ON knowledge_items(processing_state) WHERE processing_state <> 'ready';

CREATE INDEX ix_knowledge_items_role_id ON knowledge_items(role_id);

CREATE INDEX ix_knowledge_items_position_id ON knowledge_items(position_id);

CREATE INDEX ix_knowledge_items_blob_id ON knowledge_items(blob_id);

CREATE INDEX ix_knowledge_items_duplicate_of_id ON knowledge_items(duplicate_of_id);

CREATE INDEX ix_knowledge_items_superseded_by_id ON knowledge_items(superseded_by_id);

CREATE INDEX ix_knowledge_items_source_attachment_id ON knowledge_items(source_attachment_id);

CREATE INDEX ix_knowledge_items_change_set_id ON knowledge_items(change_set_id);

CREATE INDEX ix_knowledge_items_category_id ON knowledge_items(category_id);

CREATE INDEX ix_mm_role ON memories(workspace_id, role_id, status, created_at);

CREATE INDEX ix_mm_pos ON memories(workspace_id, position_id, status, created_at);

CREATE INDEX ix_memories_role_id ON memories(role_id);

CREATE INDEX ix_memories_position_id ON memories(position_id);

CREATE INDEX ix_memories_source_session_id ON memories(source_session_id);

CREATE INDEX ix_memories_source_message_id ON memories(source_message_id);

CREATE INDEX ix_memories_superseded_by_id ON memories(superseded_by_id);

CREATE INDEX ix_memories_commitment_id ON memories(commitment_id);

CREATE INDEX ix_memories_change_set_id ON memories(change_set_id);

CREATE INDEX ix_memories_role_wound_id ON memories(role_wound_id);

CREATE INDEX ix_memories_evidence_task_id ON memories(evidence_task_id);

CREATE INDEX ix_rh_mem ON recall_hits(memory_id, created_at);

CREATE INDEX ix_rh_kn ON recall_hits(knowledge_item_id, created_at);

CREATE INDEX ix_recall_hits_session_id ON recall_hits(session_id);

CREATE INDEX ix_recall_hits_role_id ON recall_hits(role_id);

CREATE INDEX ix_recall_hits_knowledge_chunk_id ON recall_hits(knowledge_chunk_id);

CREATE UNIQUE INDEX ux_positions_default ON positions(workspace_id) WHERE is_default = 1 AND deleted_at IS NULL;

CREATE INDEX ix_positions_reports_to_position_id ON positions(reports_to_position_id);

CREATE INDEX ix_positions_current_revision_id ON positions(current_revision_id);

CREATE UNIQUE INDEX ux_asg_pos ON assignments(position_id) WHERE status = 'active' AND deleted_at IS NULL;

CREATE UNIQUE INDEX ux_asg_role ON assignments(role_id) WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX ix_asg_role ON assignments(role_id, status);

CREATE INDEX ix_assignments_position_id ON assignments(position_id);

CREATE INDEX ix_ttc_asg ON trust_tier_changes(assignment_id, display_seq);

CREATE INDEX ix_trust_tier_changes_role_id ON trust_tier_changes(role_id);

CREATE INDEX ix_trust_tier_changes_position_id ON trust_tier_changes(position_id);

CREATE INDEX ix_tasks_a0 ON tasks(workspace_id, status, created_at);

CREATE INDEX ix_tasks_role ON tasks(workspace_id, assignee_role_id, status);

CREATE INDEX ix_tasks_pos ON tasks(workspace_id, position_id, status, due_at);

CREATE INDEX ix_tasks_position_id ON tasks(position_id);

CREATE INDEX ix_tasks_assignee_role_id ON tasks(assignee_role_id);

CREATE INDEX ix_tasks_commitment_id ON tasks(commitment_id);

CREATE INDEX ix_tasks_parent_task_id ON tasks(parent_task_id);

CREATE INDEX ix_tasks_proactive_job_id ON tasks(proactive_job_id);

CREATE INDEX ix_tasks_thread_id ON tasks(thread_id);

CREATE INDEX ix_tasks_paused_by_wound_id ON tasks(paused_by_wound_id);

CREATE INDEX ix_tasks_source_message_id ON tasks(source_message_id);

CREATE INDEX ix_cm_pos ON commitments(workspace_id, position_id, status, due_at);

CREATE INDEX ix_cm_open ON commitments(due_at) WHERE status = 'open' AND deleted_at IS NULL;

CREATE INDEX ix_commitments_position_id ON commitments(position_id);

CREATE INDEX ix_commitments_promised_by_role_id ON commitments(promised_by_role_id);

CREATE INDEX ix_commitments_source_message_id ON commitments(source_message_id);

CREATE INDEX ix_commitments_source_session_id ON commitments(source_session_id);

CREATE INDEX ix_ss_role ON sessions(workspace_id, role_id, started_at);

CREATE INDEX ix_ss_day ON sessions(workspace_id, started_at);

CREATE INDEX ix_ss_acc ON sessions(engine_account_id, started_at);

CREATE INDEX ix_sessions_role_id ON sessions(role_id);

CREATE INDEX ix_sessions_position_id ON sessions(position_id);

CREATE INDEX ix_sessions_task_id ON sessions(task_id);

CREATE INDEX ix_sessions_thread_id ON sessions(thread_id);

CREATE INDEX ix_sessions_compiled_prompt_id ON sessions(compiled_prompt_id);

CREATE INDEX ix_sessions_container_id ON sessions(container_id);

CREATE UNIQUE INDEX ux_wallets_role ON wallets(role_id) WHERE role_id IS NOT NULL;

CREATE UNIQUE INDEX ux_wallets_sys ON wallets(workspace_id, owner_kind) WHERE owner_kind IN ('treasury', 'sink');

CREATE INDEX ix_wallets_role_id ON wallets(role_id);

CREATE INDEX ix_lg_debit ON ledger_entries(debit_wallet_id, display_seq);

CREATE INDEX ix_lg_credit ON ledger_entries(credit_wallet_id, display_seq);

CREATE INDEX ix_lg_role ON ledger_entries(workspace_id, role_id, display_seq);

CREATE INDEX ix_lg_task ON ledger_entries(task_id) WHERE task_id IS NOT NULL;

CREATE UNIQUE INDEX ux_rw_open ON role_wounds(role_id) WHERE ended_at IS NULL;

CREATE INDEX ix_rw_role ON role_wounds(role_id, display_seq);

CREATE INDEX ix_role_wounds_reflection_session_id ON role_wounds(reflection_session_id);

CREATE UNIQUE INDEX ux_usage ON usage_daily(workspace_id, day_local, COALESCE(role_id, ''), COALESCE(engine_account_id, ''), agent_kind);

CREATE INDEX ix_usage_role ON usage_daily(workspace_id, role_id, day_local);

CREATE UNIQUE INDEX ux_ei_engine ON engine_installs(workspace_id, engine_slug) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_en_label ON engine_accounts(workspace_id, engine_slug, label) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_en_volume ON engine_accounts(auth_volume) WHERE auth_volume IS NOT NULL;

CREATE INDEX ix_en_grid ON engine_accounts(workspace_id, status, engine_slug);

CREATE INDEX ix_en_quota ON engine_accounts(workspace_id, quota_state);

CREATE INDEX ix_engine_accounts_secret_id ON engine_accounts(secret_id);

CREATE INDEX ix_engine_accounts_last_probe_run_id ON engine_accounts(last_probe_run_id);

CREATE INDEX ix_engine_accounts_overhead_bare_session_id ON engine_accounts(overhead_bare_session_id);

CREATE INDEX ix_engine_accounts_overhead_shell_session_id ON engine_accounts(overhead_shell_session_id);

CREATE INDEX ix_engine_accounts_consent_id ON engine_accounts(consent_id);

CREATE UNIQUE INDEX ux_eb_account ON engine_bindings(engine_account_id) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_eb_prio ON engine_bindings(role_id, priority) WHERE role_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX ux_eb_sys_prio ON engine_bindings(workspace_id, priority) WHERE consumer_kind = 'system' AND deleted_at IS NULL;

CREATE INDEX ix_engine_bindings_role_id ON engine_bindings(role_id);

CREATE INDEX ix_engine_bindings_engine_account_id ON engine_bindings(engine_account_id);

CREATE UNIQUE INDEX ux_sa_key ON system_agents(workspace_id, system_key) WHERE deleted_at IS NULL;

CREATE INDEX ix_pb_acc ON probe_runs(engine_account_id, started_at);

CREATE INDEX ix_probe_runs_container_id ON probe_runs(container_id);

CREATE INDEX ix_probe_runs_raw_blob_id ON probe_runs(raw_blob_id);

CREATE INDEX ix_cap_live ON capabilities(engine_account_id, kind) WHERE missing_since IS NULL;

CREATE INDEX ix_cap_state ON capabilities(workspace_id, kind, value_state);

CREATE INDEX ix_capabilities_last_probe_run_id ON capabilities(last_probe_run_id);

CREATE INDEX ix_qs_acc ON quota_snapshots(engine_account_id, window_key, observed_at);

CREATE INDEX ix_quota_snapshots_probe_run_id ON quota_snapshots(probe_run_id);

CREATE UNIQUE INDEX ux_mr ON model_ranks(workspace_id, engine_slug, model_key) WHERE deleted_at IS NULL;

CREATE INDEX ix_mr_rank ON model_ranks(workspace_id, rank);

CREATE UNIQUE INDEX ux_gc ON compiled_prompts(revision_id, COALESCE(position_revision_id, ''), COALESCE(rules_revision_id, ''), COALESCE(engine_slug, ''), context_key, COALESCE(polaris_params_hash, ''));

CREATE INDEX ix_gc_role ON compiled_prompts(role_id, display_seq);

CREATE INDEX ix_compiled_prompts_position_revision_id ON compiled_prompts(position_revision_id);

CREATE INDEX ix_compiled_prompts_rules_revision_id ON compiled_prompts(rules_revision_id);

CREATE INDEX ix_compiled_prompt_segments_dna_field_version_id ON compiled_prompt_segments(dna_field_version_id);

CREATE INDEX ix_compiled_prompt_segments_instruction_version_id ON compiled_prompt_segments(instruction_version_id);

CREATE INDEX ix_compiled_prompt_segments_skill_version_id ON compiled_prompt_segments(skill_version_id);

CREATE UNIQUE INDEX ux_ct_role ON containers(role_id) WHERE role_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX ux_ct_system ON containers(workspace_id) WHERE kind = 'system' AND deleted_at IS NULL;

CREATE UNIQUE INDEX ux_ct_name ON containers(container_name) WHERE deleted_at IS NULL;

CREATE INDEX ix_ct_state ON containers(workspace_id, observed_state);

CREATE INDEX ix_containers_role_id ON containers(role_id);

CREATE UNIQUE INDEX ux_tg_role ON telegram_bots(role_id) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_tg_bot ON telegram_bots(workspace_id, bot_tg_id) WHERE deleted_at IS NULL;

CREATE INDEX ix_tg_status ON telegram_bots(workspace_id, status);

CREATE INDEX ix_telegram_bots_role_id ON telegram_bots(role_id);

CREATE INDEX ix_telegram_bots_secret_id ON telegram_bots(secret_id);

CREATE UNIQUE INDEX ux_al ON telegram_allowlist(bot_id, tg_user_id) WHERE deleted_at IS NULL;

CREATE INDEX ix_telegram_allowlist_bot_id ON telegram_allowlist(bot_id);

CREATE UNIQUE INDEX ux_pp_role ON proactive_policies(role_id) WHERE deleted_at IS NULL;

CREATE INDEX ix_proactive_policies_role_id ON proactive_policies(role_id);

CREATE INDEX ix_pa_due ON proactive_jobs(next_run_at) WHERE is_enabled = 1 AND deleted_at IS NULL;

CREATE INDEX ix_proactive_jobs_position_id ON proactive_jobs(position_id);

CREATE INDEX ix_proactive_jobs_skill_id ON proactive_jobs(skill_id);

CREATE INDEX ix_pn_cap ON proactive_sends(role_id, day_local, status);

CREATE INDEX ix_pn_kind ON proactive_sends(role_id, trigger_kind, created_at);

CREATE INDEX ix_pn_lease ON proactive_sends(reserved_until) WHERE status = 'reserved';

CREATE INDEX ix_proactive_sends_policy_id ON proactive_sends(policy_id);

CREATE INDEX ix_proactive_sends_message_id ON proactive_sends(message_id);

CREATE INDEX ix_proactive_sends_task_id ON proactive_sends(task_id);

CREATE INDEX ix_proactive_sends_commitment_id ON proactive_sends(commitment_id);

CREATE INDEX ix_proactive_sends_proactive_job_id ON proactive_sends(proactive_job_id);

CREATE UNIQUE INDEX ux_tl_slug ON tools(workspace_id, slug) WHERE deleted_at IS NULL;

CREATE INDEX ix_tools_secret_id ON tools(secret_id);

CREATE UNIQUE INDEX ux_gr_role ON tool_grants(tool_id, role_id) WHERE role_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX ux_gr_pos ON tool_grants(tool_id, position_id) WHERE position_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX ix_tool_grants_tool_id ON tool_grants(tool_id);

CREATE INDEX ix_tool_grants_role_id ON tool_grants(role_id);

CREATE INDEX ix_tool_grants_position_id ON tool_grants(position_id);

CREATE INDEX ix_tool_grants_source_request_id ON tool_grants(source_request_id);

CREATE INDEX ix_pm_pending ON permission_requests(workspace_id, created_at) WHERE status = 'pending';

CREATE INDEX ix_permission_requests_role_id ON permission_requests(role_id);

CREATE INDEX ix_permission_requests_tool_id ON permission_requests(tool_id);

CREATE INDEX ix_permission_requests_task_id ON permission_requests(task_id);

CREATE INDEX ix_permission_requests_session_id ON permission_requests(session_id);

CREATE INDEX ix_permission_requests_grant_id ON permission_requests(grant_id);

CREATE UNIQUE INDEX ux_eg ON egress_rules(workspace_id, domain_pattern, applies_to, COALESCE(role_id, ''), COALESCE(position_id, ''), COALESCE(tool_id, '')) WHERE deleted_at IS NULL;

CREATE INDEX ix_egress_rules_role_id ON egress_rules(role_id);

CREATE INDEX ix_egress_rules_position_id ON egress_rules(position_id);

CREATE INDEX ix_egress_rules_tool_id ON egress_rules(tool_id);

CREATE INDEX ix_pc_role ON polaris_checks(workspace_id, role_id, display_seq);

CREATE INDEX ix_polaris_checks_role_id ON polaris_checks(role_id);

CREATE INDEX ix_polaris_checks_change_set_id ON polaris_checks(change_set_id);

CREATE INDEX ix_polaris_checks_permission_request_id ON polaris_checks(permission_request_id);

CREATE INDEX ix_polaris_checks_proactive_send_id ON polaris_checks(proactive_send_id);

CREATE INDEX ix_polaris_checks_task_id ON polaris_checks(task_id);

CREATE INDEX ix_polaris_checks_session_id ON polaris_checks(session_id);

CREATE UNIQUE INDEX ux_cd_live ON employee_cards(role_id) WHERE status IN ('issued', 'suspended') AND deleted_at IS NULL;

CREATE INDEX ix_employee_cards_role_id ON employee_cards(role_id);

CREATE INDEX ix_employee_cards_revision_id ON employee_cards(revision_id);

CREATE INDEX ix_employee_cards_compiled_prompt_id ON employee_cards(compiled_prompt_id);

CREATE INDEX ix_employee_cards_position_id ON employee_cards(position_id);

CREATE INDEX ix_employee_cards_superseded_by_id ON employee_cards(superseded_by_id);

CREATE INDEX ix_tr_role ON trial_runs(role_id, display_seq);

CREATE INDEX ix_trial_runs_revision_id ON trial_runs(revision_id);

CREATE INDEX ix_trial_runs_compiled_prompt_id ON trial_runs(compiled_prompt_id);

CREATE INDEX ix_trial_runs_engine_account_id ON trial_runs(engine_account_id);

CREATE INDEX ix_trial_runs_judge_session_id ON trial_runs(judge_session_id);

CREATE UNIQUE INDEX ux_th_tg ON chat_threads(telegram_bot_id, tg_chat_id) WHERE kind = 'telegram' AND deleted_at IS NULL;

CREATE INDEX ix_th_role ON chat_threads(workspace_id, role_id, kind, last_message_at);

CREATE INDEX ix_chat_threads_role_id ON chat_threads(role_id);

CREATE INDEX ix_chat_threads_telegram_bot_id ON chat_threads(telegram_bot_id);

CREATE UNIQUE INDEX ux_msg_ext ON chat_messages(thread_id, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX ix_msg_thread ON chat_messages(thread_id, display_seq);

CREATE INDEX ix_chat_messages_session_id ON chat_messages(session_id);

CREATE INDEX ix_chat_messages_reply_to_id ON chat_messages(reply_to_id);

CREATE INDEX ix_at_orphan ON message_attachments(created_at) WHERE message_id IS NULL;

CREATE INDEX ix_message_attachments_message_id ON message_attachments(message_id);

CREATE INDEX ix_message_attachments_blob_id ON message_attachments(blob_id);

CREATE INDEX ix_message_attachments_thumbnail_blob_id ON message_attachments(thumbnail_blob_id);

CREATE INDEX ix_an_entity ON message_anchors(workspace_id, entity_id);

CREATE INDEX ix_message_anchors_message_id ON message_anchors(message_id);

CREATE INDEX ix_ua_msg ON ui_actions(message_id, display_seq);

CREATE INDEX ix_ua_entity ON ui_actions(workspace_id, entity_id);

CREATE INDEX ix_ui_actions_session_id ON ui_actions(session_id);

CREATE INDEX ix_ui_actions_change_set_id ON ui_actions(change_set_id);

CREATE INDEX ix_au_time ON audit_log(workspace_id, created_at);

CREATE INDEX ix_au_role ON audit_log(workspace_id, role_id, display_seq);

CREATE INDEX ix_au_entity ON audit_log(workspace_id, entity_id);

CREATE INDEX ix_au_action ON audit_log(workspace_id, action, display_seq);

CREATE INDEX ix_au_req ON audit_log(request_id);

CREATE INDEX ix_ev_time ON events(workspace_id, created_at);

CREATE INDEX ix_ev_role ON events(workspace_id, role_id, created_at);

CREATE INDEX ix_ev_kind ON events(workspace_id, kind, created_at);

CREATE INDEX ix_ev_entity ON events(entity_id, kind, created_at) WHERE entity_id IS NOT NULL;

CREATE UNIQUE INDEX ux_nt_dedupe ON notifications(user_id, dedupe_key) WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL;

CREATE INDEX ix_nt_user ON notifications(user_id, read_at, created_at);

CREATE UNIQUE INDEX ux_jobs_dedupe ON jobs(workspace_id, dedupe_key) WHERE status = 'queued' AND dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX ux_jobs_reflection ON jobs(workspace_id, dedupe_key) WHERE kind = 'wound_reflection';

CREATE INDEX ix_jobs_queue ON jobs(run_after, priority) WHERE status = 'queued';

CREATE INDEX ix_jobs_kind ON jobs(workspace_id, kind, status);

CREATE UNIQUE INDEX ux_up_current ON app_versions(status) WHERE status = 'current';

CREATE INDEX ix_bk_status ON backups(status, created_at);

CREATE INDEX ix_update_runs_backup_id ON update_runs(backup_id);

CREATE UNIQUE INDEX ux_st_key ON settings(workspace_id, key) WHERE deleted_at IS NULL;

CREATE INDEX ix_sec_fp ON secrets(workspace_id, fingerprint);

CREATE INDEX ix_secrets_rotated_from_id ON secrets(rotated_from_id);

CREATE INDEX ix_cn_kind ON consents(workspace_id, consent_kind, subject);

CREATE UNIQUE INDEX ux_sd ON search_documents(entity_type, entity_id, COALESCE(chunk_id, ''));

CREATE INDEX ix_sd_grid ON search_documents(workspace_id, entity_type, is_live);

CREATE INDEX ix_sd_role ON search_documents(role_id) WHERE role_id IS NOT NULL;

CREATE VIRTUAL TABLE search_fts USING fts5(title_norm, body_norm, content='search_documents', content_rowid='id', tokenize='unicode61');

CREATE TRIGGER search_documents_ai AFTER INSERT ON search_documents BEGIN
  INSERT INTO search_fts(rowid, title_norm, body_norm) VALUES (new.id, new.title_norm, new.body_norm);
END;

CREATE TRIGGER search_documents_ad AFTER DELETE ON search_documents BEGIN
  INSERT INTO search_fts(search_fts, rowid, title_norm, body_norm) VALUES ('delete', old.id, old.title_norm, old.body_norm);
END;

CREATE TRIGGER search_documents_au AFTER UPDATE ON search_documents BEGIN
  INSERT INTO search_fts(search_fts, rowid, title_norm, body_norm) VALUES ('delete', old.id, old.title_norm, old.body_norm);
  INSERT INTO search_fts(rowid, title_norm, body_norm) VALUES (new.id, new.title_norm, new.body_norm);
END;

CREATE TRIGGER workspaces_no_replace_i BEFORE INSERT ON workspaces
WHEN (
  (EXISTS (SELECT 1 FROM workspaces x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.slug = NEW.slug))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.short_code = NEW.short_code))
  OR ((NEW.kind = 'system') AND EXISTS (SELECT 1 FROM workspaces x WHERE x.kind = NEW.kind AND (x.kind = 'system')))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): workspaces — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER workspaces_no_replace_u BEFORE UPDATE OF id, kind, slug, short_code, rowid ON workspaces
WHEN (
  (EXISTS (SELECT 1 FROM workspaces x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.slug = NEW.slug AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.short_code = NEW.short_code AND x.rowid <> OLD.rowid))
  OR ((NEW.kind = 'system') AND EXISTS (SELECT 1 FROM workspaces x WHERE x.kind = NEW.kind AND (x.kind = 'system') AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): workspaces — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER users_no_replace_i BEFORE INSERT ON users
WHEN (
  (EXISTS (SELECT 1 FROM users x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.username = NEW.username))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.email = NEW.email))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): users — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER users_no_replace_u BEFORE UPDATE OF id, display_seq, username, email, rowid ON users
WHEN (
  (EXISTS (SELECT 1 FROM users x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.username = NEW.username AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.email = NEW.email AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): users — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER workspace_members_no_replace_i BEFORE INSERT ON workspace_members
WHEN (
  (EXISTS (SELECT 1 FROM workspace_members x WHERE x.workspace_id = NEW.workspace_id AND x.user_id = NEW.user_id))
  OR (EXISTS (SELECT 1 FROM workspace_members x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): workspace_members — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER workspace_members_no_replace_u BEFORE UPDATE OF workspace_id, user_id, rowid ON workspace_members
WHEN (
  (EXISTS (SELECT 1 FROM workspace_members x WHERE x.workspace_id = NEW.workspace_id AND x.user_id = NEW.user_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM workspace_members x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): workspace_members — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER auth_sessions_no_replace_i BEFORE INSERT ON auth_sessions
WHEN (
  (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.token_hash = NEW.token_hash))
  OR (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): auth_sessions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER auth_sessions_no_replace_u BEFORE UPDATE OF id, token_hash, rowid ON auth_sessions
WHEN (
  (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.token_hash = NEW.token_hash AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): auth_sessions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER actors_no_replace_i BEFORE INSERT ON actors
WHEN (
  (EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.workspace_id = NEW.workspace_id AND x.user_id = NEW.user_id))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.role_id = NEW.role_id))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): actors — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER actors_no_replace_u BEFORE UPDATE OF id, workspace_id, user_id, role_id, system_key, rowid ON actors
WHEN (
  (EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.workspace_id = NEW.workspace_id AND x.user_id = NEW.user_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.role_id = NEW.role_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): actors — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER id_aliases_no_replace_i BEFORE INSERT ON id_aliases
WHEN (
  (EXISTS (SELECT 1 FROM id_aliases x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM id_aliases x WHERE x.workspace_id = NEW.workspace_id AND x.source_code = NEW.source_code AND x.old_display_id = NEW.old_display_id))
  OR (EXISTS (SELECT 1 FROM id_aliases x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): id_aliases — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER id_aliases_no_replace_u BEFORE UPDATE OF id, workspace_id, old_display_id, source_code, rowid ON id_aliases
WHEN (
  (EXISTS (SELECT 1 FROM id_aliases x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM id_aliases x WHERE x.workspace_id = NEW.workspace_id AND x.source_code = NEW.source_code AND x.old_display_id = NEW.old_display_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM id_aliases x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): id_aliases — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER roles_no_replace_i BEFORE INSERT ON roles
WHEN (
  (EXISTS (SELECT 1 FROM roles x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.registry_no = NEW.registry_no))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): roles — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER roles_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, name_norm, registry_no, rowid ON roles
WHEN (
  (EXISTS (SELECT 1 FROM roles x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.registry_no = NEW.registry_no AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): roles — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER avatars_no_replace_i BEFORE INSERT ON avatars
WHEN (
  (EXISTS (SELECT 1 FROM avatars x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM avatars x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM avatars x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): avatars — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER avatars_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON avatars
WHEN (
  (EXISTS (SELECT 1 FROM avatars x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM avatars x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM avatars x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): avatars — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skin_assets_no_replace_i BEFORE INSERT ON skin_assets
WHEN (
  (EXISTS (SELECT 1 FROM skin_assets x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM skin_assets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skin_assets x WHERE x.workspace_id = NEW.workspace_id AND x.pack_slug = NEW.pack_slug AND x.asset_code = NEW.asset_code AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM skin_assets x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skin_assets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skin_assets_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, pack_slug, asset_code, rowid ON skin_assets
WHEN (
  (EXISTS (SELECT 1 FROM skin_assets x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skin_assets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skin_assets x WHERE x.workspace_id = NEW.workspace_id AND x.pack_slug = NEW.pack_slug AND x.asset_code = NEW.asset_code AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skin_assets x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skin_assets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER dna_field_defs_no_replace_i BEFORE INSERT ON dna_field_defs
WHEN (
  (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key))
  OR (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_field_defs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER dna_field_defs_no_replace_u BEFORE UPDATE OF id, workspace_id, key, rowid ON dna_field_defs
WHEN (
  (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_field_defs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER dna_fields_no_replace_i BEFORE INSERT ON dna_fields
WHEN (
  (EXISTS (SELECT 1 FROM dna_fields x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM dna_fields x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM dna_fields x WHERE x.role_id = NEW.role_id AND x.def_id = NEW.def_id AND x.item_index = NEW.item_index AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM dna_fields x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_fields — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER dna_fields_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id, def_id, item_index, rowid ON dna_fields
WHEN (
  (EXISTS (SELECT 1 FROM dna_fields x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM dna_fields x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM dna_fields x WHERE x.role_id = NEW.role_id AND x.def_id = NEW.def_id AND x.item_index = NEW.item_index AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM dna_fields x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_fields — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER dna_field_versions_no_replace_i BEFORE INSERT ON dna_field_versions
WHEN (
  (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.dna_field_id = NEW.dna_field_id AND x.version = NEW.version))
  OR (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_field_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER dna_field_versions_no_replace_u BEFORE UPDATE OF id, dna_field_id, version, rowid ON dna_field_versions
WHEN (
  (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.dna_field_id = NEW.dna_field_id AND x.version = NEW.version AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_field_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER revisions_no_replace_i BEFORE INSERT ON revisions
WHEN (
  (EXISTS (SELECT 1 FROM revisions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.role_id = NEW.role_id AND x.seq = NEW.seq))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.position_id = NEW.position_id AND x.seq = NEW.seq))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.role_id = NEW.role_id AND x.major = NEW.major AND x.minor = NEW.minor))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.scope = 'workspace') AND EXISTS (SELECT 1 FROM revisions x WHERE x.workspace_id = NEW.workspace_id AND x.seq = NEW.seq AND (x.scope = 'workspace')))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): revisions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER revisions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, scope, role_id, position_id, seq, major, minor, rowid ON revisions
WHEN (
  (EXISTS (SELECT 1 FROM revisions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.role_id = NEW.role_id AND x.seq = NEW.seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.position_id = NEW.position_id AND x.seq = NEW.seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.role_id = NEW.role_id AND x.major = NEW.major AND x.minor = NEW.minor AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.scope = 'workspace') AND EXISTS (SELECT 1 FROM revisions x WHERE x.workspace_id = NEW.workspace_id AND x.seq = NEW.seq AND (x.scope = 'workspace') AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): revisions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER change_sets_no_replace_i BEFORE INSERT ON change_sets
WHEN (
  (EXISTS (SELECT 1 FROM change_sets x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM change_sets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM change_sets x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): change_sets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER change_sets_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON change_sets
WHEN (
  (EXISTS (SELECT 1 FROM change_sets x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM change_sets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM change_sets x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): change_sets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER change_set_items_no_replace_i BEFORE INSERT ON change_set_items
WHEN (
  (EXISTS (SELECT 1 FROM change_set_items x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM change_set_items x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): change_set_items — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER change_set_items_no_replace_u BEFORE UPDATE OF id, rowid ON change_set_items
WHEN (
  (EXISTS (SELECT 1 FROM change_set_items x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM change_set_items x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): change_set_items — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER instructions_no_replace_i BEFORE INSERT ON instructions
WHEN (
  (EXISTS (SELECT 1 FROM instructions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM instructions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM instructions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): instructions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER instructions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON instructions
WHEN (
  (EXISTS (SELECT 1 FROM instructions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM instructions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM instructions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): instructions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER instruction_versions_no_replace_i BEFORE INSERT ON instruction_versions
WHEN (
  (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.instruction_id = NEW.instruction_id AND x.version = NEW.version))
  OR (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): instruction_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER instruction_versions_no_replace_u BEFORE UPDATE OF id, instruction_id, version, rowid ON instruction_versions
WHEN (
  (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.instruction_id = NEW.instruction_id AND x.version = NEW.version AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): instruction_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER taxonomy_nodes_no_replace_i BEFORE INSERT ON taxonomy_nodes
WHEN (
  (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.workspace_id = NEW.workspace_id AND x.domain = NEW.domain AND COALESCE(x.parent_id, '') = COALESCE(NEW.parent_id, '') AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): taxonomy_nodes — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER taxonomy_nodes_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, domain, parent_id, name_norm, rowid ON taxonomy_nodes
WHEN (
  (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.workspace_id = NEW.workspace_id AND x.domain = NEW.domain AND COALESCE(x.parent_id, '') = COALESCE(NEW.parent_id, '') AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): taxonomy_nodes — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skills_no_replace_i BEFORE INSERT ON skills
WHEN (
  (EXISTS (SELECT 1 FROM skills x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM skills x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skills x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM skills x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skills — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skills_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, slug, rowid ON skills
WHEN (
  (EXISTS (SELECT 1 FROM skills x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skills x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skills x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skills x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skills — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skill_versions_no_replace_i BEFORE INSERT ON skill_versions
WHEN (
  (EXISTS (SELECT 1 FROM skill_versions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM skill_versions x WHERE x.skill_id = NEW.skill_id AND x.version = NEW.version))
  OR (EXISTS (SELECT 1 FROM skill_versions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skill_versions_no_replace_u BEFORE UPDATE OF id, skill_id, version, rowid ON skill_versions
WHEN (
  (EXISTS (SELECT 1 FROM skill_versions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skill_versions x WHERE x.skill_id = NEW.skill_id AND x.version = NEW.version AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skill_versions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skill_prereqs_no_replace_i BEFORE INSERT ON skill_prereqs
WHEN (
  (EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.id = NEW.id))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.skill_id = NEW.skill_id AND x.requires_skill_id = NEW.requires_skill_id AND (x.deleted_at IS NULL)))
  OR ((NEW.kind = 'upgrade' AND NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.skill_id = NEW.skill_id AND (x.kind = 'upgrade' AND x.status <> 'obsolete' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_prereqs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skill_prereqs_no_replace_u BEFORE UPDATE OF id, deleted_at, skill_id, requires_skill_id, kind, status, rowid ON skill_prereqs
WHEN (
  (EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.skill_id = NEW.skill_id AND x.requires_skill_id = NEW.requires_skill_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.kind = 'upgrade' AND NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.skill_id = NEW.skill_id AND (x.kind = 'upgrade' AND x.status <> 'obsolete' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_prereqs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skill_engine_support_no_replace_i BEFORE INSERT ON skill_engine_support
WHEN (
  (EXISTS (SELECT 1 FROM skill_engine_support x WHERE x.skill_version_id = NEW.skill_version_id AND x.engine_slug = NEW.engine_slug))
  OR (EXISTS (SELECT 1 FROM skill_engine_support x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_engine_support — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skill_engine_support_no_replace_u BEFORE UPDATE OF skill_version_id, engine_slug, rowid ON skill_engine_support
WHEN (
  (EXISTS (SELECT 1 FROM skill_engine_support x WHERE x.skill_version_id = NEW.skill_version_id AND x.engine_slug = NEW.engine_slug AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skill_engine_support x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_engine_support — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skill_files_no_replace_i BEFORE INSERT ON skill_files
WHEN (
  (EXISTS (SELECT 1 FROM skill_files x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM skill_files x WHERE x.skill_version_id = NEW.skill_version_id AND x.path = NEW.path))
  OR (EXISTS (SELECT 1 FROM skill_files x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_files — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER skill_files_no_replace_u BEFORE UPDATE OF id, skill_version_id, path, rowid ON skill_files
WHEN (
  (EXISTS (SELECT 1 FROM skill_files x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skill_files x WHERE x.skill_version_id = NEW.skill_version_id AND x.path = NEW.path AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skill_files x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_files — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER role_skills_no_replace_i BEFORE INSERT ON role_skills
WHEN (
  (EXISTS (SELECT 1 FROM role_skills x WHERE x.id = NEW.id))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM role_skills x WHERE x.role_id = NEW.role_id AND x.skill_id = NEW.skill_id AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM role_skills x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): role_skills — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER role_skills_no_replace_u BEFORE UPDATE OF id, deleted_at, role_id, skill_id, rowid ON role_skills
WHEN (
  (EXISTS (SELECT 1 FROM role_skills x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM role_skills x WHERE x.role_id = NEW.role_id AND x.skill_id = NEW.skill_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM role_skills x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): role_skills — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER blobs_no_replace_i BEFORE INSERT ON blobs
WHEN (
  (EXISTS (SELECT 1 FROM blobs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM blobs x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256))
  OR (EXISTS (SELECT 1 FROM blobs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): blobs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER blobs_no_replace_u BEFORE UPDATE OF id, workspace_id, sha256, rowid ON blobs
WHEN (
  (EXISTS (SELECT 1 FROM blobs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM blobs x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256 AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM blobs x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): blobs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER knowledge_items_no_replace_i BEFORE INSERT ON knowledge_items
WHEN (
  (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.scope = 'personal' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.role_id = NEW.role_id AND x.sha256 = NEW.sha256 AND (x.scope = 'personal' AND x.deleted_at IS NULL AND x.status <> 'superseded')))
  OR ((NEW.scope = 'position' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.position_id = NEW.position_id AND x.sha256 = NEW.sha256 AND (x.scope = 'position' AND x.deleted_at IS NULL AND x.status <> 'superseded')))
  OR ((NEW.scope = 'workspace' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256 AND (x.scope = 'workspace' AND x.deleted_at IS NULL AND x.status <> 'superseded')))
  OR (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): knowledge_items — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER knowledge_items_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, scope, role_id, position_id, sha256, status, rowid ON knowledge_items
WHEN (
  (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.scope = 'personal' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.role_id = NEW.role_id AND x.sha256 = NEW.sha256 AND (x.scope = 'personal' AND x.deleted_at IS NULL AND x.status <> 'superseded') AND x.rowid <> OLD.rowid))
  OR ((NEW.scope = 'position' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.position_id = NEW.position_id AND x.sha256 = NEW.sha256 AND (x.scope = 'position' AND x.deleted_at IS NULL AND x.status <> 'superseded') AND x.rowid <> OLD.rowid))
  OR ((NEW.scope = 'workspace' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256 AND (x.scope = 'workspace' AND x.deleted_at IS NULL AND x.status <> 'superseded') AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): knowledge_items — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER knowledge_chunks_no_replace_i BEFORE INSERT ON knowledge_chunks
WHEN (
  (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.knowledge_item_id = NEW.knowledge_item_id AND x.ordinal = NEW.ordinal))
  OR (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): knowledge_chunks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER knowledge_chunks_no_replace_u BEFORE UPDATE OF id, knowledge_item_id, ordinal, rowid ON knowledge_chunks
WHEN (
  (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.knowledge_item_id = NEW.knowledge_item_id AND x.ordinal = NEW.ordinal AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): knowledge_chunks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER memories_no_replace_i BEFORE INSERT ON memories
WHEN (
  (EXISTS (SELECT 1 FROM memories x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM memories x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM memories x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): memories — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER memories_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON memories
WHEN (
  (EXISTS (SELECT 1 FROM memories x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM memories x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM memories x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): memories — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER recall_hits_no_replace_i BEFORE INSERT ON recall_hits
WHEN (
  (EXISTS (SELECT 1 FROM recall_hits x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM recall_hits x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): recall_hits — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER recall_hits_no_replace_u BEFORE UPDATE OF id, rowid ON recall_hits
WHEN (
  (EXISTS (SELECT 1 FROM recall_hits x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM recall_hits x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): recall_hits — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER positions_no_replace_i BEFORE INSERT ON positions
WHEN (
  (EXISTS (SELECT 1 FROM positions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM positions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.is_default = 1 AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM positions x WHERE x.workspace_id = NEW.workspace_id AND (x.is_default = 1 AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM positions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): positions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER positions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, is_default, rowid ON positions
WHEN (
  (EXISTS (SELECT 1 FROM positions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM positions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.is_default = 1 AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM positions x WHERE x.workspace_id = NEW.workspace_id AND (x.is_default = 1 AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM positions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): positions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER assignments_no_replace_i BEFORE INSERT ON assignments
WHEN (
  (EXISTS (SELECT 1 FROM assignments x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM assignments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.status = 'active' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM assignments x WHERE x.position_id = NEW.position_id AND (x.status = 'active' AND x.deleted_at IS NULL)))
  OR ((NEW.status = 'active' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM assignments x WHERE x.role_id = NEW.role_id AND (x.status = 'active' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM assignments x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): assignments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER assignments_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id, position_id, status, rowid ON assignments
WHEN (
  (EXISTS (SELECT 1 FROM assignments x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM assignments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.status = 'active' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM assignments x WHERE x.position_id = NEW.position_id AND (x.status = 'active' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.status = 'active' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM assignments x WHERE x.role_id = NEW.role_id AND (x.status = 'active' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM assignments x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): assignments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER trust_tier_changes_no_replace_i BEFORE INSERT ON trust_tier_changes
WHEN (
  (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): trust_tier_changes — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER trust_tier_changes_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON trust_tier_changes
WHEN (
  (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): trust_tier_changes — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER tasks_no_replace_i BEFORE INSERT ON tasks
WHEN (
  (EXISTS (SELECT 1 FROM tasks x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM tasks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM tasks x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tasks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER tasks_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON tasks
WHEN (
  (EXISTS (SELECT 1 FROM tasks x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM tasks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM tasks x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tasks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER commitments_no_replace_i BEFORE INSERT ON commitments
WHEN (
  (EXISTS (SELECT 1 FROM commitments x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM commitments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM commitments x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): commitments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER commitments_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON commitments
WHEN (
  (EXISTS (SELECT 1 FROM commitments x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM commitments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM commitments x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): commitments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER sessions_no_replace_i BEFORE INSERT ON sessions
WHEN (
  (EXISTS (SELECT 1 FROM sessions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM sessions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM sessions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): sessions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER sessions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON sessions
WHEN (
  (EXISTS (SELECT 1 FROM sessions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM sessions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM sessions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): sessions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER wallets_no_replace_i BEFORE INSERT ON wallets
WHEN (
  (EXISTS (SELECT 1 FROM wallets x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.role_id IS NOT NULL) AND EXISTS (SELECT 1 FROM wallets x WHERE x.role_id = NEW.role_id AND (x.role_id IS NOT NULL)))
  OR ((NEW.owner_kind IN ('treasury', 'sink')) AND EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = NEW.workspace_id AND x.owner_kind = NEW.owner_kind AND (x.owner_kind IN ('treasury', 'sink'))))
  OR (EXISTS (SELECT 1 FROM wallets x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): wallets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER wallets_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, owner_kind, role_id, rowid ON wallets
WHEN (
  (EXISTS (SELECT 1 FROM wallets x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.role_id IS NOT NULL) AND EXISTS (SELECT 1 FROM wallets x WHERE x.role_id = NEW.role_id AND (x.role_id IS NOT NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.owner_kind IN ('treasury', 'sink')) AND EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = NEW.workspace_id AND x.owner_kind = NEW.owner_kind AND (x.owner_kind IN ('treasury', 'sink')) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM wallets x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): wallets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER ledger_entries_no_replace_i BEFORE INSERT ON ledger_entries
WHEN (
  (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.reverses_entry_id = NEW.reverses_entry_id))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.workspace_id = NEW.workspace_id AND x.idempotency_key = NEW.idempotency_key))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): ledger_entries — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER ledger_entries_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, reverses_entry_id, idempotency_key, rowid ON ledger_entries
WHEN (
  (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.reverses_entry_id = NEW.reverses_entry_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.workspace_id = NEW.workspace_id AND x.idempotency_key = NEW.idempotency_key AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): ledger_entries — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER role_wounds_no_replace_i BEFORE INSERT ON role_wounds
WHEN (
  (EXISTS (SELECT 1 FROM role_wounds x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.cause_entry_id = NEW.cause_entry_id))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.ended_at IS NULL) AND EXISTS (SELECT 1 FROM role_wounds x WHERE x.role_id = NEW.role_id AND (x.ended_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): role_wounds — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER role_wounds_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, role_id, cause_entry_id, ended_at, rowid ON role_wounds
WHEN (
  (EXISTS (SELECT 1 FROM role_wounds x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.cause_entry_id = NEW.cause_entry_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.ended_at IS NULL) AND EXISTS (SELECT 1 FROM role_wounds x WHERE x.role_id = NEW.role_id AND (x.ended_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): role_wounds — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER usage_daily_no_replace_i BEFORE INSERT ON usage_daily
WHEN (
  (EXISTS (SELECT 1 FROM usage_daily x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM usage_daily x WHERE x.workspace_id = NEW.workspace_id AND x.day_local = NEW.day_local AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.engine_account_id, '') = COALESCE(NEW.engine_account_id, '') AND x.agent_kind = NEW.agent_kind))
  OR (EXISTS (SELECT 1 FROM usage_daily x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): usage_daily — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER usage_daily_no_replace_u BEFORE UPDATE OF id, workspace_id, day_local, role_id, engine_account_id, agent_kind, rowid ON usage_daily
WHEN (
  (EXISTS (SELECT 1 FROM usage_daily x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM usage_daily x WHERE x.workspace_id = NEW.workspace_id AND x.day_local = NEW.day_local AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.engine_account_id, '') = COALESCE(NEW.engine_account_id, '') AND x.agent_kind = NEW.agent_kind AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM usage_daily x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): usage_daily — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER engines_no_replace_i BEFORE INSERT ON engines
WHEN (
  (EXISTS (SELECT 1 FROM engines x WHERE x.slug = NEW.slug))
  OR (EXISTS (SELECT 1 FROM engines x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engines — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER engines_no_replace_u BEFORE UPDATE OF slug, rowid ON engines
WHEN (
  (EXISTS (SELECT 1 FROM engines x WHERE x.slug = NEW.slug AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM engines x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engines — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER engine_installs_no_replace_i BEFORE INSERT ON engine_installs
WHEN (
  (EXISTS (SELECT 1 FROM engine_installs x WHERE x.id = NEW.id))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_installs x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM engine_installs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_installs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER engine_installs_no_replace_u BEFORE UPDATE OF id, workspace_id, deleted_at, engine_slug, rowid ON engine_installs
WHEN (
  (EXISTS (SELECT 1 FROM engine_installs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_installs x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM engine_installs x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_installs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER engine_accounts_no_replace_i BEFORE INSERT ON engine_accounts
WHEN (
  (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND x.label = NEW.label AND (x.deleted_at IS NULL)))
  OR ((NEW.auth_volume IS NOT NULL) AND EXISTS (SELECT 1 FROM engine_accounts x WHERE x.auth_volume = NEW.auth_volume AND (x.auth_volume IS NOT NULL)))
  OR (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_accounts — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER engine_accounts_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, engine_slug, label, auth_volume, rowid ON engine_accounts
WHEN (
  (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND x.label = NEW.label AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.auth_volume IS NOT NULL) AND EXISTS (SELECT 1 FROM engine_accounts x WHERE x.auth_volume = NEW.auth_volume AND (x.auth_volume IS NOT NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_accounts — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER engine_bindings_no_replace_i BEFORE INSERT ON engine_bindings
WHEN (
  (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.engine_account_id = NEW.engine_account_id AND (x.deleted_at IS NULL)))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.role_id = NEW.role_id AND x.priority = NEW.priority AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL)))
  OR ((NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.workspace_id = NEW.workspace_id AND x.priority = NEW.priority AND (x.consumer_kind = 'system' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_bindings — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER engine_bindings_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, consumer_kind, role_id, engine_account_id, priority, rowid ON engine_bindings
WHEN (
  (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.engine_account_id = NEW.engine_account_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.role_id = NEW.role_id AND x.priority = NEW.priority AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.workspace_id = NEW.workspace_id AND x.priority = NEW.priority AND (x.consumer_kind = 'system' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_bindings — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER system_agents_no_replace_i BEFORE INSERT ON system_agents
WHEN (
  (EXISTS (SELECT 1 FROM system_agents x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM system_agents x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM system_agents x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM system_agents x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): system_agents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER system_agents_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, system_key, rowid ON system_agents
WHEN (
  (EXISTS (SELECT 1 FROM system_agents x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM system_agents x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM system_agents x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM system_agents x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): system_agents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER probe_runs_no_replace_i BEFORE INSERT ON probe_runs
WHEN (
  (EXISTS (SELECT 1 FROM probe_runs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM probe_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM probe_runs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): probe_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER probe_runs_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON probe_runs
WHEN (
  (EXISTS (SELECT 1 FROM probe_runs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM probe_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM probe_runs x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): probe_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER capabilities_no_replace_i BEFORE INSERT ON capabilities
WHEN (
  (EXISTS (SELECT 1 FROM capabilities x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.engine_account_id = NEW.engine_account_id AND x.kind = NEW.kind AND x.item_key = NEW.item_key))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): capabilities — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER capabilities_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, engine_account_id, kind, item_key, rowid ON capabilities
WHEN (
  (EXISTS (SELECT 1 FROM capabilities x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.engine_account_id = NEW.engine_account_id AND x.kind = NEW.kind AND x.item_key = NEW.item_key AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): capabilities — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER quota_snapshots_no_replace_i BEFORE INSERT ON quota_snapshots
WHEN (
  (EXISTS (SELECT 1 FROM quota_snapshots x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM quota_snapshots x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): quota_snapshots — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER quota_snapshots_no_replace_u BEFORE UPDATE OF id, rowid ON quota_snapshots
WHEN (
  (EXISTS (SELECT 1 FROM quota_snapshots x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM quota_snapshots x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): quota_snapshots — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER model_ranks_no_replace_i BEFORE INSERT ON model_ranks
WHEN (
  (EXISTS (SELECT 1 FROM model_ranks x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM model_ranks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM model_ranks x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND x.model_key = NEW.model_key AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM model_ranks x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): model_ranks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER model_ranks_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, engine_slug, model_key, rowid ON model_ranks
WHEN (
  (EXISTS (SELECT 1 FROM model_ranks x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM model_ranks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM model_ranks x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND x.model_key = NEW.model_key AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM model_ranks x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): model_ranks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER compiled_prompts_no_replace_i BEFORE INSERT ON compiled_prompts
WHEN (
  (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.revision_id = NEW.revision_id AND COALESCE(x.position_revision_id, '') = COALESCE(NEW.position_revision_id, '') AND COALESCE(x.rules_revision_id, '') = COALESCE(NEW.rules_revision_id, '') AND COALESCE(x.engine_slug, '') = COALESCE(NEW.engine_slug, '') AND x.context_key = NEW.context_key AND COALESCE(x.polaris_params_hash, '') = COALESCE(NEW.polaris_params_hash, '')))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): compiled_prompts — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER compiled_prompts_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, revision_id, position_revision_id, rules_revision_id, engine_slug, context_key, polaris_params_hash, rowid ON compiled_prompts
WHEN (
  (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.revision_id = NEW.revision_id AND COALESCE(x.position_revision_id, '') = COALESCE(NEW.position_revision_id, '') AND COALESCE(x.rules_revision_id, '') = COALESCE(NEW.rules_revision_id, '') AND COALESCE(x.engine_slug, '') = COALESCE(NEW.engine_slug, '') AND x.context_key = NEW.context_key AND COALESCE(x.polaris_params_hash, '') = COALESCE(NEW.polaris_params_hash, '') AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): compiled_prompts — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER compiled_prompt_segments_no_replace_i BEFORE INSERT ON compiled_prompt_segments
WHEN (
  (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.compiled_prompt_id = NEW.compiled_prompt_id AND x.ordinal = NEW.ordinal))
  OR (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): compiled_prompt_segments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER compiled_prompt_segments_no_replace_u BEFORE UPDATE OF id, compiled_prompt_id, ordinal, rowid ON compiled_prompt_segments
WHEN (
  (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.compiled_prompt_id = NEW.compiled_prompt_id AND x.ordinal = NEW.ordinal AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): compiled_prompt_segments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER containers_no_replace_i BEFORE INSERT ON containers
WHEN (
  (EXISTS (SELECT 1 FROM containers x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM containers x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.container_name = NEW.container_name AND (x.deleted_at IS NULL)))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.role_id = NEW.role_id AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL)))
  OR ((NEW.kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.workspace_id = NEW.workspace_id AND (x.kind = 'system' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM containers x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): containers — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER containers_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, kind, role_id, container_name, rowid ON containers
WHEN (
  (EXISTS (SELECT 1 FROM containers x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM containers x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.container_name = NEW.container_name AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.role_id = NEW.role_id AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.workspace_id = NEW.workspace_id AND (x.kind = 'system' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM containers x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): containers — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER telegram_bots_no_replace_i BEFORE INSERT ON telegram_bots
WHEN (
  (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_bots x WHERE x.workspace_id = NEW.workspace_id AND x.bot_tg_id = NEW.bot_tg_id AND (x.deleted_at IS NULL)))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_bots x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): telegram_bots — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER telegram_bots_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id, bot_tg_id, rowid ON telegram_bots
WHEN (
  (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_bots x WHERE x.workspace_id = NEW.workspace_id AND x.bot_tg_id = NEW.bot_tg_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_bots x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): telegram_bots — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER telegram_allowlist_no_replace_i BEFORE INSERT ON telegram_allowlist
WHEN (
  (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.bot_id = NEW.bot_id AND x.tg_user_id = NEW.tg_user_id AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): telegram_allowlist — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER telegram_allowlist_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, bot_id, tg_user_id, rowid ON telegram_allowlist
WHEN (
  (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.bot_id = NEW.bot_id AND x.tg_user_id = NEW.tg_user_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): telegram_allowlist — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER proactive_policies_no_replace_i BEFORE INSERT ON proactive_policies
WHEN (
  (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM proactive_policies x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_policies — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER proactive_policies_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id, rowid ON proactive_policies
WHEN (
  (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM proactive_policies x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_policies — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER proactive_jobs_no_replace_i BEFORE INSERT ON proactive_jobs
WHEN (
  (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_jobs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER proactive_jobs_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON proactive_jobs
WHEN (
  (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_jobs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER proactive_sends_no_replace_i BEFORE INSERT ON proactive_sends
WHEN (
  (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.workspace_id = NEW.workspace_id AND x.idempotency_key = NEW.idempotency_key))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_sends — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER proactive_sends_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, idempotency_key, rowid ON proactive_sends
WHEN (
  (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.workspace_id = NEW.workspace_id AND x.idempotency_key = NEW.idempotency_key AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_sends — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER tools_no_replace_i BEFORE INSERT ON tools
WHEN (
  (EXISTS (SELECT 1 FROM tools x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM tools x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tools x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM tools x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tools — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER tools_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, slug, rowid ON tools
WHEN (
  (EXISTS (SELECT 1 FROM tools x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM tools x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tools x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM tools x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tools — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER tool_grants_no_replace_i BEFORE INSERT ON tool_grants
WHEN (
  (EXISTS (SELECT 1 FROM tool_grants x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM tool_grants x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.position_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tool_grants x WHERE x.tool_id = NEW.tool_id AND x.position_id = NEW.position_id AND (x.position_id IS NOT NULL AND x.deleted_at IS NULL)))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tool_grants x WHERE x.tool_id = NEW.tool_id AND x.role_id = NEW.role_id AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM tool_grants x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tool_grants — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER tool_grants_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, tool_id, role_id, position_id, rowid ON tool_grants
WHEN (
  (EXISTS (SELECT 1 FROM tool_grants x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM tool_grants x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.position_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tool_grants x WHERE x.tool_id = NEW.tool_id AND x.position_id = NEW.position_id AND (x.position_id IS NOT NULL AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tool_grants x WHERE x.tool_id = NEW.tool_id AND x.role_id = NEW.role_id AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM tool_grants x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tool_grants — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER permission_requests_no_replace_i BEFORE INSERT ON permission_requests
WHEN (
  (EXISTS (SELECT 1 FROM permission_requests x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM permission_requests x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM permission_requests x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): permission_requests — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER permission_requests_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON permission_requests
WHEN (
  (EXISTS (SELECT 1 FROM permission_requests x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM permission_requests x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM permission_requests x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): permission_requests — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER egress_rules_no_replace_i BEFORE INSERT ON egress_rules
WHEN (
  (EXISTS (SELECT 1 FROM egress_rules x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM egress_rules x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM egress_rules x WHERE x.workspace_id = NEW.workspace_id AND x.domain_pattern = NEW.domain_pattern AND x.applies_to = NEW.applies_to AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.position_id, '') = COALESCE(NEW.position_id, '') AND COALESCE(x.tool_id, '') = COALESCE(NEW.tool_id, '') AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM egress_rules x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): egress_rules — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER egress_rules_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, domain_pattern, applies_to, role_id, position_id, tool_id, rowid ON egress_rules
WHEN (
  (EXISTS (SELECT 1 FROM egress_rules x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM egress_rules x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM egress_rules x WHERE x.workspace_id = NEW.workspace_id AND x.domain_pattern = NEW.domain_pattern AND x.applies_to = NEW.applies_to AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.position_id, '') = COALESCE(NEW.position_id, '') AND COALESCE(x.tool_id, '') = COALESCE(NEW.tool_id, '') AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM egress_rules x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): egress_rules — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER polaris_checks_no_replace_i BEFORE INSERT ON polaris_checks
WHEN (
  (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): polaris_checks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER polaris_checks_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON polaris_checks
WHEN (
  (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): polaris_checks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER employee_cards_no_replace_i BEFORE INSERT ON employee_cards
WHEN (
  (EXISTS (SELECT 1 FROM employee_cards x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM employee_cards x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.status IN ('issued', 'suspended') AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM employee_cards x WHERE x.role_id = NEW.role_id AND (x.status IN ('issued', 'suspended') AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM employee_cards x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): employee_cards — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER employee_cards_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id, status, rowid ON employee_cards
WHEN (
  (EXISTS (SELECT 1 FROM employee_cards x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM employee_cards x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.status IN ('issued', 'suspended') AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM employee_cards x WHERE x.role_id = NEW.role_id AND (x.status IN ('issued', 'suspended') AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM employee_cards x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): employee_cards — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER trial_runs_no_replace_i BEFORE INSERT ON trial_runs
WHEN (
  (EXISTS (SELECT 1 FROM trial_runs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM trial_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM trial_runs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): trial_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER trial_runs_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON trial_runs
WHEN (
  (EXISTS (SELECT 1 FROM trial_runs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM trial_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM trial_runs x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): trial_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER chat_threads_no_replace_i BEFORE INSERT ON chat_threads
WHEN (
  (EXISTS (SELECT 1 FROM chat_threads x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM chat_threads x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.kind = 'telegram' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM chat_threads x WHERE x.telegram_bot_id = NEW.telegram_bot_id AND x.tg_chat_id = NEW.tg_chat_id AND (x.kind = 'telegram' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM chat_threads x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): chat_threads — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER chat_threads_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, kind, telegram_bot_id, tg_chat_id, rowid ON chat_threads
WHEN (
  (EXISTS (SELECT 1 FROM chat_threads x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM chat_threads x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.kind = 'telegram' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM chat_threads x WHERE x.telegram_bot_id = NEW.telegram_bot_id AND x.tg_chat_id = NEW.tg_chat_id AND (x.kind = 'telegram' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM chat_threads x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): chat_threads — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER chat_messages_no_replace_i BEFORE INSERT ON chat_messages
WHEN (
  (EXISTS (SELECT 1 FROM chat_messages x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM chat_messages x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.external_id IS NOT NULL) AND EXISTS (SELECT 1 FROM chat_messages x WHERE x.thread_id = NEW.thread_id AND x.external_id = NEW.external_id AND (x.external_id IS NOT NULL)))
  OR (EXISTS (SELECT 1 FROM chat_messages x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): chat_messages — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER chat_messages_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, thread_id, external_id, rowid ON chat_messages
WHEN (
  (EXISTS (SELECT 1 FROM chat_messages x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM chat_messages x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.external_id IS NOT NULL) AND EXISTS (SELECT 1 FROM chat_messages x WHERE x.thread_id = NEW.thread_id AND x.external_id = NEW.external_id AND (x.external_id IS NOT NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM chat_messages x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): chat_messages — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER message_attachments_no_replace_i BEFORE INSERT ON message_attachments
WHEN (
  (EXISTS (SELECT 1 FROM message_attachments x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM message_attachments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM message_attachments x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): message_attachments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER message_attachments_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON message_attachments
WHEN (
  (EXISTS (SELECT 1 FROM message_attachments x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM message_attachments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM message_attachments x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): message_attachments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER message_anchors_no_replace_i BEFORE INSERT ON message_anchors
WHEN (
  (EXISTS (SELECT 1 FROM message_anchors x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM message_anchors x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM message_anchors x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): message_anchors — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER message_anchors_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON message_anchors
WHEN (
  (EXISTS (SELECT 1 FROM message_anchors x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM message_anchors x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM message_anchors x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): message_anchors — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER ui_actions_no_replace_i BEFORE INSERT ON ui_actions
WHEN (
  (EXISTS (SELECT 1 FROM ui_actions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM ui_actions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM ui_actions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): ui_actions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER ui_actions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON ui_actions
WHEN (
  (EXISTS (SELECT 1 FROM ui_actions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ui_actions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ui_actions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): ui_actions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER audit_log_no_replace_i BEFORE INSERT ON audit_log
WHEN (
  (EXISTS (SELECT 1 FROM audit_log x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM audit_log x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM audit_log x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): audit_log — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER audit_log_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON audit_log
WHEN (
  (EXISTS (SELECT 1 FROM audit_log x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM audit_log x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM audit_log x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): audit_log — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER events_no_replace_i BEFORE INSERT ON events
WHEN (
  (EXISTS (SELECT 1 FROM events x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM events x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM events x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): events — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER events_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON events
WHEN (
  (EXISTS (SELECT 1 FROM events x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM events x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM events x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): events — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER notifications_no_replace_i BEFORE INSERT ON notifications
WHEN (
  (EXISTS (SELECT 1 FROM notifications x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM notifications x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.resolved_at IS NULL AND NEW.dedupe_key IS NOT NULL) AND EXISTS (SELECT 1 FROM notifications x WHERE x.user_id = NEW.user_id AND x.dedupe_key = NEW.dedupe_key AND (x.resolved_at IS NULL AND x.dedupe_key IS NOT NULL)))
  OR (EXISTS (SELECT 1 FROM notifications x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): notifications — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER notifications_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, user_id, dedupe_key, resolved_at, rowid ON notifications
WHEN (
  (EXISTS (SELECT 1 FROM notifications x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM notifications x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.resolved_at IS NULL AND NEW.dedupe_key IS NOT NULL) AND EXISTS (SELECT 1 FROM notifications x WHERE x.user_id = NEW.user_id AND x.dedupe_key = NEW.dedupe_key AND (x.resolved_at IS NULL AND x.dedupe_key IS NOT NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM notifications x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): notifications — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER app_versions_no_replace_i BEFORE INSERT ON app_versions
WHEN (
  (EXISTS (SELECT 1 FROM app_versions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.semver = NEW.semver))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.status = 'current') AND EXISTS (SELECT 1 FROM app_versions x WHERE x.status = NEW.status AND (x.status = 'current')))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): app_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER app_versions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, semver, status, rowid ON app_versions
WHEN (
  (EXISTS (SELECT 1 FROM app_versions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.semver = NEW.semver AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.status = 'current') AND EXISTS (SELECT 1 FROM app_versions x WHERE x.status = NEW.status AND (x.status = 'current') AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): app_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER backups_no_replace_i BEFORE INSERT ON backups
WHEN (
  (EXISTS (SELECT 1 FROM backups x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM backups x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM backups x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): backups — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER backups_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON backups
WHEN (
  (EXISTS (SELECT 1 FROM backups x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM backups x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM backups x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): backups — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER update_runs_no_replace_i BEFORE INSERT ON update_runs
WHEN (
  (EXISTS (SELECT 1 FROM update_runs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM update_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM update_runs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): update_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER update_runs_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON update_runs
WHEN (
  (EXISTS (SELECT 1 FROM update_runs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM update_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM update_runs x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): update_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER schema_migrations_no_replace_i BEFORE INSERT ON schema_migrations
WHEN (
  (EXISTS (SELECT 1 FROM schema_migrations x WHERE x.version = NEW.version)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): schema_migrations — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER schema_migrations_no_replace_u BEFORE UPDATE OF version ON schema_migrations
WHEN (
  (EXISTS (SELECT 1 FROM schema_migrations x WHERE x.version = NEW.version AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): schema_migrations — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER settings_no_replace_i BEFORE INSERT ON settings
WHEN (
  (EXISTS (SELECT 1 FROM settings x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM settings x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): settings — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER settings_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, key, rowid ON settings
WHEN (
  (EXISTS (SELECT 1 FROM settings x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM settings x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): settings — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER secrets_no_replace_i BEFORE INSERT ON secrets
WHEN (
  (EXISTS (SELECT 1 FROM secrets x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM secrets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM secrets x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): secrets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER secrets_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON secrets
WHEN (
  (EXISTS (SELECT 1 FROM secrets x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM secrets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM secrets x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): secrets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER consents_no_replace_i BEFORE INSERT ON consents
WHEN (
  (EXISTS (SELECT 1 FROM consents x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM consents x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM consents x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): consents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER consents_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, rowid ON consents
WHEN (
  (EXISTS (SELECT 1 FROM consents x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM consents x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM consents x WHERE x.rowid = NEW.rowid AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): consents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER search_documents_no_replace_i BEFORE INSERT ON search_documents
WHEN (
  (EXISTS (SELECT 1 FROM search_documents x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM search_documents x WHERE x.entity_type = NEW.entity_type AND x.entity_id = NEW.entity_id AND COALESCE(x.chunk_id, '') = COALESCE(NEW.chunk_id, ''))))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): search_documents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER search_documents_no_replace_u BEFORE UPDATE OF id, entity_type, entity_id, chunk_id ON search_documents
WHEN (
  (EXISTS (SELECT 1 FROM search_documents x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM search_documents x WHERE x.entity_type = NEW.entity_type AND x.entity_id = NEW.entity_id AND COALESCE(x.chunk_id, '') = COALESCE(NEW.chunk_id, '') AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): search_documents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

CREATE TRIGGER workspace_members_writer_i BEFORE INSERT ON workspace_members
WHEN NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR CASE WHEN NEW.access_level = 'owner' THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') ELSE EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) END)
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): phân quyền chỉ owner / admin còn là thành viên hoặc actor system của workspace ghi; cấp / gỡ / sửa hàng mức owner chỉ owner (hoặc actor system — dựng / khôi phục); workspace_id / user_id bất biến ngoài bảo trì'); END;

CREATE TRIGGER workspace_members_writer_u BEFORE UPDATE ON workspace_members
WHEN (app_maint() = 0 AND (NEW.workspace_id IS NOT OLD.workspace_id OR NEW.user_id IS NOT OLD.user_id))
  OR NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR CASE WHEN 'owner' IN (OLD.access_level, NEW.access_level) THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') ELSE EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) END)
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): phân quyền chỉ owner / admin còn là thành viên hoặc actor system của workspace ghi; cấp / gỡ / sửa hàng mức owner chỉ owner (hoặc actor system — dựng / khôi phục); workspace_id / user_id bất biến ngoài bảo trì'); END;

CREATE TRIGGER workspace_members_owner_last_u BEFORE UPDATE ON workspace_members
WHEN OLD.access_level = 'owner' AND OLD.removed_at IS NULL
 AND NOT (NEW.access_level = 'owner' AND NEW.removed_at IS NULL AND NEW.workspace_id IS OLD.workspace_id AND NEW.user_id IS OLD.user_id)
 AND (SELECT kind FROM workspaces WHERE id = OLD.workspace_id) = 'tenant'
 AND NOT EXISTS (SELECT 1 FROM workspace_members ow WHERE ow.workspace_id = OLD.workspace_id AND ow.user_id <> OLD.user_id
                 AND ow.access_level = 'owner' AND ow.removed_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): workspace tenant phải còn ít nhất một owner đang hoạt động'); END;

CREATE TRIGGER workspace_members_delete_d BEFORE DELETE ON workspace_members
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): xoá cứng thành viên chỉ trong bảo trì — gỡ khỏi workspace = removed_at'); END;

CREATE TRIGGER actors_writer_i BEFORE INSERT ON actors
WHEN NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
          OR (NEW.kind = 'system' AND NEW.system_key = 'system' AND COALESCE(NEW.id = app_actor(), 0)          -- B2: không bao giờ NULL (app_actor() NULL ⇒ chặn)
              AND NOT EXISTS (SELECT 1 FROM actors s0 WHERE s0.workspace_id = NEW.workspace_id AND s0.system_key = 'system'))
          OR (NEW.kind <> 'system' AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'actors (v2.3.5): actor chỉ actor system hoặc owner / admin còn là thành viên của workspace tạo / sửa; actor system chỉ actor system tạo (actor system đầu tiên tự đăng ký lúc dựng workspace)'); END;

CREATE TRIGGER actors_writer_u BEFORE UPDATE ON actors
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'actors (v2.3.5): actor chỉ actor system hoặc owner / admin còn là thành viên của workspace tạo / sửa; actor system chỉ actor system tạo (actor system đầu tiên tự đăng ký lúc dựng workspace)'); END;

CREATE TRIGGER actors_lock_u BEFORE UPDATE ON actors
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.kind IS OLD.kind AND NEW.user_id IS OLD.user_id AND NEW.role_id IS OLD.role_id
                              AND NEW.system_key IS OLD.system_key AND NEW.workspace_id IS OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'actors (v2.3.5): kind / user_id / role_id / system_key / workspace_id bất biến ngoài bảo trì'); END;

CREATE TRIGGER users_writer_i BEFORE INSERT ON users
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors us WHERE us.id = app_actor() AND us.system_key = 'system') OR EXISTS (SELECT 1 FROM actors ua JOIN workspace_members um ON um.workspace_id = ua.workspace_id AND um.user_id = ua.user_id WHERE ua.id = app_actor() AND ua.kind = 'user' AND um.removed_at IS NULL AND um.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'users (v2.3.5): tài khoản người dùng — tạo: actor system hoặc owner / admin đang hoạt động; sửa: actor system, chính người đó, hoặc owner của workspace có người đó (actor Role / viewer / operator / admin không sửa tài khoản người khác)'); END;

CREATE TRIGGER users_writer_u BEFORE UPDATE ON users
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors us WHERE us.id = app_actor() AND us.system_key = 'system') OR (NEW.id IS OLD.id AND EXISTS (SELECT 1 FROM actors uf WHERE uf.id = app_actor() AND uf.kind = 'user' AND uf.user_id = OLD.id)) OR (NEW.id IS OLD.id AND EXISTS (SELECT 1 FROM actors uo JOIN workspace_members om ON om.workspace_id = uo.workspace_id AND om.user_id = uo.user_id AND om.removed_at IS NULL AND om.access_level = 'owner' JOIN workspace_members tm ON tm.workspace_id = uo.workspace_id AND tm.user_id = OLD.id WHERE uo.id = app_actor() AND uo.kind = 'user')))
BEGIN SELECT RAISE(ABORT, 'users (v2.3.5): tài khoản người dùng — tạo: actor system hoặc owner / admin đang hoạt động; sửa: actor system, chính người đó, hoặc owner của workspace có người đó (actor Role / viewer / operator / admin không sửa tài khoản người khác)'); END;

CREATE TRIGGER workspaces_writer_u BEFORE UPDATE OF id, kind, slug, name, owner_user_id, short_code, locale, timezone, currency_code, currency_symbol,
  status, created_at, updated_at, archived_at, restored_at ON workspaces
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'workspaces (v2.3.5): sửa workspace chỉ owner / admin còn là thành viên hoặc actor system của chính workspace đó'); END;

CREATE TRIGGER containers_writer_i BEFORE INSERT ON containers
WHEN NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) AND NEW.image_ref IS NULL AND NEW.image_digest IS NULL AND NEW.cli_bundle IS NULL AND NEW.cpu_limit IS NULL AND NEW.mem_limit_mb IS NULL AND NEW.session_timeout_s IS NULL))
BEGIN SELECT RAISE(ABORT, 'containers (v2.3.5): container chỉ owner / admin hoặc actor system của workspace ghi; cột cấu hình (image / CLI / tài nguyên) chỉ actor system'); END;

CREATE TRIGGER containers_writer_u BEFORE UPDATE ON containers
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'containers (v2.3.5): container chỉ owner / admin hoặc actor system của workspace ghi; cột cấu hình (image / CLI / tài nguyên) chỉ actor system'); END;

CREATE TRIGGER containers_sys_u BEFORE UPDATE OF image_ref, image_digest, cli_bundle, cpu_limit, mem_limit_mb, session_timeout_s ON containers
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'containers (v2.3.5): container chỉ owner / admin hoặc actor system của workspace ghi; cột cấu hình (image / CLI / tài nguyên) chỉ actor system'); END;

CREATE TRIGGER engines_writer_i BEFORE INSERT ON engines
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engines (v2.3.5): danh mục engine dùng chung — chỉ bảo trì hoặc actor system của workspace hệ thống ghi'); END;

CREATE TRIGGER engines_writer_u BEFORE UPDATE ON engines
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engines (v2.3.5): danh mục engine dùng chung — chỉ bảo trì hoặc actor system của workspace hệ thống ghi'); END;

CREATE TRIGGER engines_writer_d BEFORE DELETE ON engines
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engines (v2.3.5): danh mục engine dùng chung — chỉ bảo trì hoặc actor system của workspace hệ thống ghi'); END;

CREATE TRIGGER settings_retention_i BEFORE INSERT ON settings
WHEN NEW.key IN ('audit.retention_days', 'log.retention_days', 'purge.grace_days') AND NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND CASE NEW.key WHEN 'audit.retention_days' THEN 36500 WHEN 'log.retention_days' THEN 3650 WHEN 'purge.grace_days' THEN 3650 ELSE 0 END)))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): audit.retention_days (1–36500) / log.retention_days (1–3650) / purge.grace_days (1–3650) là số nguyên trong khoảng, chỉ owner ghi'); END;

CREATE TRIGGER settings_retention_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN app_maint() = 0 AND (OLD.key IN ('audit.retention_days', 'log.retention_days', 'purge.grace_days') OR NEW.key IN ('audit.retention_days', 'log.retention_days', 'purge.grace_days'))
 AND NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') AND NEW.key IS OLD.key AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND CASE NEW.key WHEN 'audit.retention_days' THEN 36500 WHEN 'log.retention_days' THEN 3650 WHEN 'purge.grace_days' THEN 3650 ELSE 0 END)))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): audit.retention_days (1–36500) / log.retention_days (1–3650) / purge.grace_days (1–3650) là số nguyên trong khoảng, chỉ owner ghi'); END;

CREATE TRIGGER settings_writer_i BEFORE INSERT ON settings
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): mặc định từ chối — khoá nào cũng chỉ owner / admin còn là thành viên hoặc actor system ghi'); END;

CREATE TRIGGER settings_writer_u BEFORE UPDATE ON settings
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): mặc định từ chối — khoá nào cũng chỉ owner / admin còn là thành viên hoặc actor system ghi'); END;

CREATE TRIGGER telegram_allowlist_writer_i BEFORE INSERT ON telegram_allowlist
WHEN NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))) OR (NEW.added_via = 'capture' AND EXISTS (SELECT 1 FROM actors st WHERE st.id = app_actor() AND st.workspace_id = NEW.workspace_id AND st.system_key = 'telegram')))
BEGIN SELECT RAISE(ABORT, 'telegram_allowlist (v2.3.5): danh sách người được nhắn bot chỉ owner / admin còn là thành viên hoặc actor system ghi; tác tử Telegram chỉ thêm hàng capture (người nhắn /start — luật owner ở telegram_allowlist_owner_new_i)'); END;

CREATE TRIGGER telegram_allowlist_writer_u BEFORE UPDATE ON telegram_allowlist
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'telegram_allowlist (v2.3.5): danh sách người được nhắn bot chỉ owner / admin còn là thành viên hoặc actor system ghi; tác tử Telegram chỉ thêm hàng capture (người nhắn /start — luật owner ở telegram_allowlist_owner_new_i)'); END;

CREATE TRIGGER tool_grants_writer_i BEFORE INSERT ON tool_grants
WHEN NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'tool_grants (v2.3.5): cấp quyền tool chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự cấp)'); END;

CREATE TRIGGER tool_grants_writer_u BEFORE UPDATE ON tool_grants
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'tool_grants (v2.3.5): cấp quyền tool chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự cấp)'); END;

CREATE TRIGGER egress_rules_writer_i BEFORE INSERT ON egress_rules
WHEN NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'egress_rules (v2.3.5): luật mạng ra chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự mở)'); END;

CREATE TRIGGER egress_rules_writer_u BEFORE UPDATE ON egress_rules
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'egress_rules (v2.3.5): luật mạng ra chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự mở)'); END;

CREATE TRIGGER proactive_policies_writer_i BEFORE INSERT ON proactive_policies
WHEN NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'proactive_policies (v2.3.5): chính sách tin chủ động chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự nới trần / giờ yên tĩnh)'); END;

CREATE TRIGGER proactive_policies_writer_u BEFORE UPDATE ON proactive_policies
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'proactive_policies (v2.3.5): chính sách tin chủ động chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự nới trần / giờ yên tĩnh)'); END;

CREATE TRIGGER id_aliases_actor_i BEFORE INSERT ON id_aliases
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'id_aliases: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER id_aliases_actor_u BEFORE UPDATE ON id_aliases
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'id_aliases: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER roles_actor_i BEFORE INSERT ON roles
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'roles: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER roles_actor_u BEFORE UPDATE ON roles
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.name IS OLD.name AND NEW.name_norm IS OLD.name_norm AND NEW.color IS OLD.color AND NEW.description IS OLD.description AND NEW.lifecycle_status IS OLD.lifecycle_status AND NEW.runtime_state IS OLD.runtime_state AND NEW.runtime_detail IS OLD.runtime_detail AND NEW.runtime_state_at IS OLD.runtime_state_at AND NEW.condition IS OLD.condition AND NEW.born_at IS OLD.born_at AND NEW.registry_no IS OLD.registry_no AND NEW.birth_revision_id IS OLD.birth_revision_id AND NEW.current_revision_id IS OLD.current_revision_id AND NEW.dna_schema_version IS OLD.dna_schema_version AND NEW.prompt_budget_tokens IS OLD.prompt_budget_tokens AND NEW.brain_head_sha IS OLD.brain_head_sha AND NEW.last_active_at IS OLD.last_active_at AND (NEW.avatar_id IS OLD.avatar_id OR (NEW.avatar_id IS NULL AND NOT EXISTS (SELECT 1 FROM avatars fkp WHERE fkp.id = OLD.avatar_id))) AND (NEW.avatar_id IS NOT OLD.avatar_id))
BEGIN
  SELECT RAISE(ABORT, 'roles: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'roles: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'roles: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER avatars_actor_i BEFORE INSERT ON avatars
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'avatars: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER avatars_actor_u BEFORE UPDATE ON avatars
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.source IS OLD.source AND NEW.blob_id IS OLD.blob_id AND NEW.mime IS OLD.mime AND NEW.size_bytes IS OLD.size_bytes AND NEW.width IS OLD.width AND NEW.height IS OLD.height AND NEW.crop_x IS OLD.crop_x AND NEW.crop_y IS OLD.crop_y AND NEW.crop_zoom IS OLD.crop_zoom AND NEW.skin_pack_slug IS OLD.skin_pack_slug AND NEW.skin_asset_code IS OLD.skin_asset_code AND NEW.skin_license IS OLD.skin_license AND NEW.skin_attribution IS OLD.skin_attribution AND NEW.skin_sha256 IS OLD.skin_sha256 AND (NEW.skin_asset_id IS OLD.skin_asset_id OR (NEW.skin_asset_id IS NULL AND NOT EXISTS (SELECT 1 FROM skin_assets fkp WHERE fkp.id = OLD.skin_asset_id))) AND (NEW.skin_asset_id IS NOT OLD.skin_asset_id))
BEGIN SELECT RAISE(ABORT, 'avatars: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER skin_assets_actor_i BEFORE INSERT ON skin_assets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'skin_assets: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER skin_assets_actor_u BEFORE UPDATE ON skin_assets
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'skin_assets: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'skin_assets: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'skin_assets: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER dna_field_defs_actor_i BEFORE INSERT ON dna_field_defs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'dna_field_defs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER dna_field_defs_actor_u BEFORE UPDATE ON dna_field_defs
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'dna_field_defs: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'dna_field_defs: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'dna_field_defs: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER dna_fields_actor_i BEFORE INSERT ON dna_fields
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'dna_fields: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER dna_fields_actor_u BEFORE UPDATE ON dna_fields
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.role_id IS OLD.role_id AND NEW.def_id IS OLD.def_id AND NEW.item_index IS OLD.item_index AND NEW.value_json IS OLD.value_json AND NEW.value_num IS OLD.value_num AND NEW.prose IS OLD.prose AND NEW.is_in_prompt IS OLD.is_in_prompt AND NEW.token_count IS OLD.token_count AND NEW.tokenizer IS OLD.tokenizer AND NEW.source IS OLD.source AND NEW.confirmed_at IS OLD.confirmed_at AND NEW.confirmed_by IS OLD.confirmed_by AND NEW.status IS OLD.status AND (NEW.source_message_id IS OLD.source_message_id OR (NEW.source_message_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_messages fkp WHERE fkp.id = OLD.source_message_id))) AND (NEW.covered_by_instruction_id IS OLD.covered_by_instruction_id OR (NEW.covered_by_instruction_id IS NULL AND NOT EXISTS (SELECT 1 FROM instructions fkp WHERE fkp.id = OLD.covered_by_instruction_id))) AND (NEW.source_message_id IS NOT OLD.source_message_id OR NEW.covered_by_instruction_id IS NOT OLD.covered_by_instruction_id))
BEGIN
  SELECT RAISE(ABORT, 'dna_fields: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'dna_fields: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'dna_fields: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER dna_field_versions_actor_i BEFORE INSERT ON dna_field_versions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'dna_field_versions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER dna_field_versions_actor_u BEFORE UPDATE ON dna_field_versions
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'dna_field_versions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER revisions_actor_i BEFORE INSERT ON revisions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'revisions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER revisions_actor_u BEFORE UPDATE ON revisions
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'revisions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER change_sets_actor_i BEFORE INSERT ON change_sets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'change_sets: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER change_sets_actor_u BEFORE UPDATE ON change_sets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.scope IS OLD.scope AND NEW.role_id IS OLD.role_id AND NEW.position_id IS OLD.position_id AND NEW.proposed_by IS OLD.proposed_by AND NEW.title IS OLD.title AND NEW.status IS OLD.status AND NEW.decided_at IS OLD.decided_at AND NEW.decided_by IS OLD.decided_by AND NEW.revision_id IS OLD.revision_id AND (NEW.source_thread_id IS OLD.source_thread_id OR (NEW.source_thread_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_threads fkp WHERE fkp.id = OLD.source_thread_id))) AND (NEW.source_message_id IS OLD.source_message_id OR (NEW.source_message_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_messages fkp WHERE fkp.id = OLD.source_message_id))) AND (NEW.source_session_id IS OLD.source_session_id OR (NEW.source_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.source_session_id))) AND (NEW.source_thread_id IS NOT OLD.source_thread_id OR NEW.source_message_id IS NOT OLD.source_message_id OR NEW.source_session_id IS NOT OLD.source_session_id))
BEGIN
  SELECT RAISE(ABORT, 'change_sets: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'change_sets: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'change_sets: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER instructions_actor_i BEFORE INSERT ON instructions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'instructions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER instructions_actor_u BEFORE UPDATE ON instructions
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'instructions: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'instructions: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'instructions: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER instruction_versions_actor_i BEFORE INSERT ON instruction_versions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'instruction_versions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER instruction_versions_actor_u BEFORE UPDATE ON instruction_versions
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'instruction_versions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER taxonomy_nodes_actor_i BEFORE INSERT ON taxonomy_nodes
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER taxonomy_nodes_actor_u BEFORE UPDATE ON taxonomy_nodes
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'taxonomy_nodes: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'taxonomy_nodes: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'taxonomy_nodes: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER skills_actor_i BEFORE INSERT ON skills
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'skills: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER skills_actor_u BEFORE UPDATE ON skills
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.slug IS OLD.slug AND NEW.status IS OLD.status AND NEW.origin IS OLD.origin AND NEW.current_version_id IS OLD.current_version_id AND NEW.tier_label IS OLD.tier_label AND (NEW.category_id IS OLD.category_id OR (NEW.category_id IS NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes fkp WHERE fkp.id = OLD.category_id))) AND (NEW.category_id IS NOT OLD.category_id))
BEGIN
  SELECT RAISE(ABORT, 'skills: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'skills: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'skills: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER skill_versions_actor_i BEFORE INSERT ON skill_versions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'skill_versions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER skill_versions_actor_u BEFORE UPDATE ON skill_versions
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'skill_versions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER skill_prereqs_actor_i BEFORE INSERT ON skill_prereqs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER skill_prereqs_actor_u BEFORE UPDATE ON skill_prereqs
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'skill_prereqs: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'skill_prereqs: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'skill_prereqs: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER role_skills_actor_i BEFORE INSERT ON role_skills
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'role_skills: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER role_skills_actor_u BEFORE UPDATE ON role_skills
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'role_skills: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'role_skills: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'role_skills: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER blobs_actor_i BEFORE INSERT ON blobs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'blobs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER blobs_actor_u BEFORE UPDATE ON blobs
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'blobs: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER knowledge_items_actor_i BEFORE INSERT ON knowledge_items
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'knowledge_items: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER knowledge_items_actor_u BEFORE UPDATE ON knowledge_items
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.scope IS OLD.scope AND NEW.role_id IS OLD.role_id AND NEW.position_id IS OLD.position_id AND NEW.title IS OLD.title AND NEW.file_name IS OLD.file_name AND NEW.mime IS OLD.mime AND NEW.file_type IS OLD.file_type AND NEW.size_bytes IS OLD.size_bytes AND NEW.blob_id IS OLD.blob_id AND NEW.sha256 IS OLD.sha256 AND NEW.status IS OLD.status AND NEW.processing_state IS OLD.processing_state AND NEW.progress_pct IS OLD.progress_pct AND NEW.summary IS OLD.summary AND NEW.chunk_count IS OLD.chunk_count AND NEW.token_count IS OLD.token_count AND NEW.duplicate_similarity IS OLD.duplicate_similarity AND NEW.superseded_by_id IS OLD.superseded_by_id AND NEW.source IS OLD.source AND NEW.change_set_id IS OLD.change_set_id AND NEW.sensitivity IS OLD.sensitivity AND NEW.lang IS OLD.lang AND NEW.recall_count IS OLD.recall_count AND NEW.last_recalled_at IS OLD.last_recalled_at AND NEW.error IS OLD.error AND (NEW.duplicate_of_id IS OLD.duplicate_of_id OR (NEW.duplicate_of_id IS NULL AND NOT EXISTS (SELECT 1 FROM knowledge_items fkp WHERE fkp.id = OLD.duplicate_of_id))) AND (NEW.source_attachment_id IS OLD.source_attachment_id OR (NEW.source_attachment_id IS NULL AND NOT EXISTS (SELECT 1 FROM message_attachments fkp WHERE fkp.id = OLD.source_attachment_id))) AND (NEW.category_id IS OLD.category_id OR (NEW.category_id IS NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes fkp WHERE fkp.id = OLD.category_id))) AND (NEW.duplicate_of_id IS NOT OLD.duplicate_of_id OR NEW.source_attachment_id IS NOT OLD.source_attachment_id OR NEW.category_id IS NOT OLD.category_id))
BEGIN
  SELECT RAISE(ABORT, 'knowledge_items: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'knowledge_items: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'knowledge_items: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER memories_actor_i BEFORE INSERT ON memories
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'memories: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER memories_actor_u BEFORE UPDATE ON memories
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.scope IS OLD.scope AND NEW.role_id IS OLD.role_id AND NEW.position_id IS OLD.position_id AND NEW.kind IS OLD.kind AND NEW.content IS OLD.content AND NEW.confidence IS OLD.confidence AND NEW.source_type IS OLD.source_type AND NEW.status IS OLD.status AND NEW.superseded_by_id IS OLD.superseded_by_id AND NEW.status_reason IS OLD.status_reason AND NEW.is_pinned IS OLD.is_pinned AND NEW.sensitivity IS OLD.sensitivity AND NEW.token_count IS OLD.token_count AND NEW.lang IS OLD.lang AND NEW.change_set_id IS OLD.change_set_id AND NEW.recall_count IS OLD.recall_count AND NEW.last_recalled_at IS OLD.last_recalled_at AND NEW.evidence_ledger_entry_id IS OLD.evidence_ledger_entry_id AND (NEW.source_session_id IS OLD.source_session_id OR (NEW.source_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.source_session_id))) AND (NEW.source_message_id IS OLD.source_message_id OR (NEW.source_message_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_messages fkp WHERE fkp.id = OLD.source_message_id))) AND (NEW.commitment_id IS OLD.commitment_id OR (NEW.commitment_id IS NULL AND NOT EXISTS (SELECT 1 FROM commitments fkp WHERE fkp.id = OLD.commitment_id))) AND (NEW.role_wound_id IS OLD.role_wound_id OR (NEW.role_wound_id IS NULL AND NOT EXISTS (SELECT 1 FROM role_wounds fkp WHERE fkp.id = OLD.role_wound_id))) AND (NEW.evidence_task_id IS OLD.evidence_task_id OR (NEW.evidence_task_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks fkp WHERE fkp.id = OLD.evidence_task_id))) AND (NEW.source_session_id IS NOT OLD.source_session_id OR NEW.source_message_id IS NOT OLD.source_message_id OR NEW.commitment_id IS NOT OLD.commitment_id OR NEW.role_wound_id IS NOT OLD.role_wound_id OR NEW.evidence_task_id IS NOT OLD.evidence_task_id))
BEGIN
  SELECT RAISE(ABORT, 'memories: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'memories: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'memories: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER recall_hits_actor_i BEFORE INSERT ON recall_hits
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'recall_hits: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER recall_hits_actor_u BEFORE UPDATE ON recall_hits
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.call_id IS OLD.call_id AND NEW.role_id IS OLD.role_id AND NEW.memory_id IS OLD.memory_id AND NEW.knowledge_chunk_id IS OLD.knowledge_chunk_id AND NEW.knowledge_item_id IS OLD.knowledge_item_id AND NEW.rank IS OLD.rank AND NEW.score IS OLD.score AND NEW.query_hash IS OLD.query_hash AND (NEW.session_id IS OLD.session_id OR (NEW.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.session_id))) AND (NEW.session_id IS NOT OLD.session_id))
BEGIN SELECT RAISE(ABORT, 'recall_hits: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER positions_actor_i BEFORE INSERT ON positions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'positions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER positions_actor_u BEFORE UPDATE ON positions
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.title IS OLD.title AND NEW.title_template IS OLD.title_template AND NEW.description IS OLD.description AND NEW.kpis_md IS OLD.kpis_md AND NEW.max_trust_tier IS OLD.max_trust_tier AND NEW.default_trust_tier IS OLD.default_trust_tier AND NEW.daily_token_quota IS OLD.daily_token_quota AND NEW.session_token_quota IS OLD.session_token_quota AND NEW.session_timeout_s IS OLD.session_timeout_s AND NEW.reward_cap_minor IS OLD.reward_cap_minor AND NEW.status IS OLD.status AND NEW.is_default IS OLD.is_default AND NEW.current_revision_id IS OLD.current_revision_id AND NEW.brain_head_sha IS OLD.brain_head_sha AND (NEW.reports_to_position_id IS OLD.reports_to_position_id OR (NEW.reports_to_position_id IS NULL AND NOT EXISTS (SELECT 1 FROM positions fkp WHERE fkp.id = OLD.reports_to_position_id))) AND (NEW.reports_to_position_id IS NOT OLD.reports_to_position_id))
BEGIN
  SELECT RAISE(ABORT, 'positions: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'positions: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'positions: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER assignments_actor_i BEFORE INSERT ON assignments
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'assignments: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER assignments_actor_u BEFORE UPDATE ON assignments
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'assignments: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'assignments: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'assignments: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER trust_tier_changes_actor_i BEFORE INSERT ON trust_tier_changes
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'trust_tier_changes: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER trust_tier_changes_actor_u BEFORE UPDATE ON trust_tier_changes
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'trust_tier_changes: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER tasks_actor_i BEFORE INSERT ON tasks
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'tasks: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER tasks_actor_u BEFORE UPDATE ON tasks
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.position_id IS OLD.position_id AND NEW.requested_by IS OLD.requested_by AND NEW.source IS OLD.source AND NEW.title IS OLD.title AND NEW.description IS OLD.description AND NEW.status IS OLD.status AND NEW.status_detail IS OLD.status_detail AND NEW.priority IS OLD.priority AND NEW.due_at IS OLD.due_at AND NEW.started_at IS OLD.started_at AND NEW.completed_at IS OLD.completed_at AND NEW.result_summary IS OLD.result_summary AND NEW.verification IS OLD.verification AND NEW.verified_by IS OLD.verified_by AND NEW.verified_at IS OLD.verified_at AND NEW.tokens_total IS OLD.tokens_total AND NEW.cost_micro_usd IS OLD.cost_micro_usd AND NEW.token_cost_minor IS OLD.token_cost_minor AND NEW.failure_disclosure IS OLD.failure_disclosure AND NEW.failure_report_audit_id IS OLD.failure_report_audit_id AND NEW.failure_reported_at IS OLD.failure_reported_at AND (NEW.assignee_role_id IS OLD.assignee_role_id OR (NEW.assignee_role_id IS NULL AND NOT EXISTS (SELECT 1 FROM roles fkp WHERE fkp.id = OLD.assignee_role_id))) AND (NEW.commitment_id IS OLD.commitment_id OR (NEW.commitment_id IS NULL AND NOT EXISTS (SELECT 1 FROM commitments fkp WHERE fkp.id = OLD.commitment_id))) AND (NEW.parent_task_id IS OLD.parent_task_id OR (NEW.parent_task_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks fkp WHERE fkp.id = OLD.parent_task_id))) AND (NEW.proactive_job_id IS OLD.proactive_job_id OR (NEW.proactive_job_id IS NULL AND NOT EXISTS (SELECT 1 FROM proactive_jobs fkp WHERE fkp.id = OLD.proactive_job_id))) AND (NEW.thread_id IS OLD.thread_id OR (NEW.thread_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_threads fkp WHERE fkp.id = OLD.thread_id))) AND (NEW.paused_by_wound_id IS OLD.paused_by_wound_id OR (NEW.paused_by_wound_id IS NULL AND NOT EXISTS (SELECT 1 FROM role_wounds fkp WHERE fkp.id = OLD.paused_by_wound_id))) AND (NEW.source_message_id IS OLD.source_message_id OR (NEW.source_message_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_messages fkp WHERE fkp.id = OLD.source_message_id))) AND (NEW.assignee_role_id IS NOT OLD.assignee_role_id OR NEW.commitment_id IS NOT OLD.commitment_id OR NEW.parent_task_id IS NOT OLD.parent_task_id OR NEW.proactive_job_id IS NOT OLD.proactive_job_id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.paused_by_wound_id IS NOT OLD.paused_by_wound_id OR NEW.source_message_id IS NOT OLD.source_message_id))
BEGIN
  SELECT RAISE(ABORT, 'tasks: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'tasks: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'tasks: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER commitments_actor_i BEFORE INSERT ON commitments
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'commitments: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER commitments_actor_u BEFORE UPDATE ON commitments
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.position_id IS OLD.position_id AND NEW.counterparty_kind IS OLD.counterparty_kind AND NEW.counterparty_label IS OLD.counterparty_label AND NEW.statement IS OLD.statement AND NEW.due_at IS OLD.due_at AND NEW.status IS OLD.status AND NEW.kept_at IS OLD.kept_at AND NEW.missed_at IS OLD.missed_at AND NEW.source IS OLD.source AND NEW.reward_minor IS OLD.reward_minor AND NEW.progress_pct IS OLD.progress_pct AND (NEW.promised_by_role_id IS OLD.promised_by_role_id OR (NEW.promised_by_role_id IS NULL AND NOT EXISTS (SELECT 1 FROM roles fkp WHERE fkp.id = OLD.promised_by_role_id))) AND (NEW.source_message_id IS OLD.source_message_id OR (NEW.source_message_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_messages fkp WHERE fkp.id = OLD.source_message_id))) AND (NEW.source_session_id IS OLD.source_session_id OR (NEW.source_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.source_session_id))) AND (NEW.promised_by_role_id IS NOT OLD.promised_by_role_id OR NEW.source_message_id IS NOT OLD.source_message_id OR NEW.source_session_id IS NOT OLD.source_session_id))
BEGIN
  SELECT RAISE(ABORT, 'commitments: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'commitments: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'commitments: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER sessions_actor_i BEFORE INSERT ON sessions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'sessions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER sessions_actor_u BEFORE UPDATE ON sessions
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.agent_kind IS OLD.agent_kind AND NEW.trigger IS OLD.trigger AND NEW.engine_slug IS OLD.engine_slug AND NEW.model_key IS OLD.model_key AND NEW.effort IS OLD.effort AND NEW.cli_version IS OLD.cli_version AND NEW.cli_session_ref IS OLD.cli_session_ref AND NEW.delivered_prompt_hash IS OLD.delivered_prompt_hash AND NEW.polaris_json IS OLD.polaris_json AND NEW.polaris_render_hash IS OLD.polaris_render_hash AND NEW.polaris_tokens_rendered IS OLD.polaris_tokens_rendered AND NEW.native_memory IS OLD.native_memory AND NEW.title IS OLD.title AND NEW.status IS OLD.status AND NEW.error_code IS OLD.error_code AND NEW.exit_code IS OLD.exit_code AND NEW.started_at IS OLD.started_at AND NEW.ended_at IS OLD.ended_at AND NEW.duration_ms IS OLD.duration_ms AND NEW.cold_start_ms IS OLD.cold_start_ms AND NEW.tokens_input IS OLD.tokens_input AND NEW.tokens_output IS OLD.tokens_output AND NEW.tokens_cache_read IS OLD.tokens_cache_read AND NEW.tokens_cache_write IS OLD.tokens_cache_write AND NEW.tokens_thinking IS OLD.tokens_thinking AND NEW.cost_micro_usd IS OLD.cost_micro_usd AND NEW.failover_count IS OLD.failover_count AND NEW.result_json IS OLD.result_json AND NEW.phase IS OLD.phase AND NEW.phase_at IS OLD.phase_at AND (NEW.role_id IS OLD.role_id OR (NEW.role_id IS NULL AND NOT EXISTS (SELECT 1 FROM roles fkp WHERE fkp.id = OLD.role_id))) AND (NEW.position_id IS OLD.position_id OR (NEW.position_id IS NULL AND NOT EXISTS (SELECT 1 FROM positions fkp WHERE fkp.id = OLD.position_id))) AND (NEW.task_id IS OLD.task_id OR (NEW.task_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks fkp WHERE fkp.id = OLD.task_id))) AND (NEW.thread_id IS OLD.thread_id OR (NEW.thread_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_threads fkp WHERE fkp.id = OLD.thread_id))) AND (NEW.engine_account_id IS OLD.engine_account_id OR (NEW.engine_account_id IS NULL AND NOT EXISTS (SELECT 1 FROM engine_accounts fkp WHERE fkp.id = OLD.engine_account_id))) AND (NEW.compiled_prompt_id IS OLD.compiled_prompt_id OR (NEW.compiled_prompt_id IS NULL AND NOT EXISTS (SELECT 1 FROM compiled_prompts fkp WHERE fkp.id = OLD.compiled_prompt_id))) AND (NEW.container_id IS OLD.container_id OR (NEW.container_id IS NULL AND NOT EXISTS (SELECT 1 FROM containers fkp WHERE fkp.id = OLD.container_id))) AND (NEW.role_id IS NOT OLD.role_id OR NEW.position_id IS NOT OLD.position_id OR NEW.task_id IS NOT OLD.task_id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.engine_account_id IS NOT OLD.engine_account_id OR NEW.compiled_prompt_id IS NOT OLD.compiled_prompt_id OR NEW.container_id IS NOT OLD.container_id))
BEGIN SELECT RAISE(ABORT, 'sessions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER wallets_actor_i BEFORE INSERT ON wallets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'wallets: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER wallets_actor_u BEFORE UPDATE ON wallets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.owner_kind IS OLD.owner_kind AND NEW.currency_code IS OLD.currency_code AND NEW.balance_minor IS OLD.balance_minor AND NEW.entry_count IS OLD.entry_count AND NEW.last_entry_id IS OLD.last_entry_id AND NEW.last_entry_at IS OLD.last_entry_at AND NEW.allow_negative IS OLD.allow_negative AND NEW.status IS OLD.status AND (NEW.role_id IS OLD.role_id OR (NEW.role_id IS NULL AND NOT EXISTS (SELECT 1 FROM roles fkp WHERE fkp.id = OLD.role_id))) AND (NEW.role_id IS NOT OLD.role_id))
BEGIN
  SELECT RAISE(ABORT, 'wallets: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'wallets: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'wallets: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER ledger_entries_actor_i BEFORE INSERT ON ledger_entries
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'ledger_entries: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER ledger_entries_actor_u BEFORE UPDATE ON ledger_entries
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'ledger_entries: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER role_wounds_actor_i BEFORE INSERT ON role_wounds
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'role_wounds: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER role_wounds_actor_u BEFORE UPDATE ON role_wounds
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.wallet_id IS OLD.wallet_id AND NEW.cause_entry_id IS OLD.cause_entry_id AND NEW.started_at IS OLD.started_at AND NEW.ended_at IS OLD.ended_at AND NEW.revive_entry_id IS OLD.revive_entry_id AND NEW.owner_notified_at IS OLD.owner_notified_at AND NEW.notification_id IS OLD.notification_id AND NEW.reflection_job_id IS OLD.reflection_job_id AND NEW.reflection_done_at IS OLD.reflection_done_at AND NEW.lessons_proposed IS OLD.lessons_proposed AND (NEW.reflection_session_id IS OLD.reflection_session_id OR (NEW.reflection_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.reflection_session_id))) AND (NEW.reflection_session_id IS NOT OLD.reflection_session_id))
BEGIN SELECT RAISE(ABORT, 'role_wounds: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER engine_installs_actor_i BEFORE INSERT ON engine_installs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'engine_installs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER engine_installs_actor_u BEFORE UPDATE ON engine_installs
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'engine_installs: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'engine_installs: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'engine_installs: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER engine_accounts_actor_i BEFORE INSERT ON engine_accounts
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'engine_accounts: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER engine_accounts_actor_u BEFORE UPDATE ON engine_accounts
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.engine_slug IS OLD.engine_slug AND NEW.label IS OLD.label AND NEW.auth_method IS OLD.auth_method AND NEW.secret_id IS OLD.secret_id AND NEW.auth_volume IS OLD.auth_volume AND NEW.account_hint IS OLD.account_hint AND NEW.plan_label IS OLD.plan_label AND NEW.plan_confidence IS OLD.plan_confidence AND NEW.login_status IS OLD.login_status AND NEW.login_checked_at IS OLD.login_checked_at AND NEW.login_started_at IS OLD.login_started_at AND NEW.cli_version_current IS OLD.cli_version_current AND NEW.cli_version_pinned IS OLD.cli_version_pinned AND NEW.cli_version_latest IS OLD.cli_version_latest AND NEW.quota_state IS OLD.quota_state AND NEW.quota_remaining_pct IS OLD.quota_remaining_pct AND NEW.quota_reset_at IS OLD.quota_reset_at AND NEW.quota_scanned_at IS OLD.quota_scanned_at AND NEW.outage_since IS OLD.outage_since AND NEW.runtime_overhead_tokens IS OLD.runtime_overhead_tokens AND NEW.overhead_measured_at IS OLD.overhead_measured_at AND NEW.consent_id IS OLD.consent_id AND NEW.status IS OLD.status AND (NEW.last_probe_run_id IS OLD.last_probe_run_id OR (NEW.last_probe_run_id IS NULL AND NOT EXISTS (SELECT 1 FROM probe_runs fkp WHERE fkp.id = OLD.last_probe_run_id))) AND (NEW.overhead_bare_session_id IS OLD.overhead_bare_session_id OR (NEW.overhead_bare_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.overhead_bare_session_id))) AND (NEW.overhead_shell_session_id IS OLD.overhead_shell_session_id OR (NEW.overhead_shell_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.overhead_shell_session_id))) AND (NEW.last_probe_run_id IS NOT OLD.last_probe_run_id OR NEW.overhead_bare_session_id IS NOT OLD.overhead_bare_session_id OR NEW.overhead_shell_session_id IS NOT OLD.overhead_shell_session_id))
BEGIN
  SELECT RAISE(ABORT, 'engine_accounts: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'engine_accounts: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'engine_accounts: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER engine_bindings_actor_i BEFORE INSERT ON engine_bindings
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'engine_bindings: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER engine_bindings_actor_u BEFORE UPDATE ON engine_bindings
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'engine_bindings: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'engine_bindings: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'engine_bindings: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER system_agents_actor_i BEFORE INSERT ON system_agents
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'system_agents: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER system_agents_actor_u BEFORE UPDATE ON system_agents
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'system_agents: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'system_agents: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'system_agents: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER probe_runs_actor_i BEFORE INSERT ON probe_runs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'probe_runs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER probe_runs_actor_u BEFORE UPDATE ON probe_runs
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.engine_account_id IS OLD.engine_account_id AND NEW.engine_slug IS OLD.engine_slug AND NEW.trigger IS OLD.trigger AND NEW.cli_version IS OLD.cli_version AND NEW.auth_mode IS OLD.auth_mode AND NEW.status IS OLD.status AND NEW.started_at IS OLD.started_at AND NEW.finished_at IS OLD.finished_at AND NEW.duration_ms IS OLD.duration_ms AND NEW.summary_json IS OLD.summary_json AND NEW.raw_blob_id IS OLD.raw_blob_id AND NEW.error IS OLD.error AND (NEW.container_id IS OLD.container_id OR (NEW.container_id IS NULL AND NOT EXISTS (SELECT 1 FROM containers fkp WHERE fkp.id = OLD.container_id))) AND (NEW.container_id IS NOT OLD.container_id))
BEGIN SELECT RAISE(ABORT, 'probe_runs: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER capabilities_actor_i BEFORE INSERT ON capabilities
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'capabilities: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER capabilities_actor_u BEFORE UPDATE ON capabilities
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'capabilities: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'capabilities: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'capabilities: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER quota_snapshots_actor_i BEFORE INSERT ON quota_snapshots
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'quota_snapshots: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER quota_snapshots_actor_u BEFORE UPDATE ON quota_snapshots
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.engine_account_id IS OLD.engine_account_id AND NEW.observed_at IS OLD.observed_at AND NEW.window_key IS OLD.window_key AND NEW.window_seconds IS OLD.window_seconds AND NEW.state IS OLD.state AND NEW.remaining_pct IS OLD.remaining_pct AND NEW.used IS OLD.used AND NEW.limit_value IS OLD.limit_value AND NEW.reset_at IS OLD.reset_at AND NEW.source IS OLD.source AND NEW.confidence IS OLD.confidence AND NEW.raw_json IS OLD.raw_json AND (NEW.probe_run_id IS OLD.probe_run_id OR (NEW.probe_run_id IS NULL AND NOT EXISTS (SELECT 1 FROM probe_runs fkp WHERE fkp.id = OLD.probe_run_id))) AND (NEW.probe_run_id IS NOT OLD.probe_run_id))
BEGIN SELECT RAISE(ABORT, 'quota_snapshots: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER model_ranks_actor_i BEFORE INSERT ON model_ranks
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'model_ranks: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER model_ranks_actor_u BEFORE UPDATE ON model_ranks
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'model_ranks: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'model_ranks: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'model_ranks: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER compiled_prompts_actor_i BEFORE INSERT ON compiled_prompts
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'compiled_prompts: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER compiled_prompts_actor_u BEFORE UPDATE ON compiled_prompts
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'compiled_prompts: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER containers_actor_i BEFORE INSERT ON containers
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'containers: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER containers_actor_u BEFORE UPDATE ON containers
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'containers: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'containers: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'containers: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER telegram_bots_actor_i BEFORE INSERT ON telegram_bots
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'telegram_bots: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER telegram_bots_actor_u BEFORE UPDATE ON telegram_bots
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'telegram_bots: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'telegram_bots: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'telegram_bots: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER telegram_allowlist_actor_i BEFORE INSERT ON telegram_allowlist
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'telegram_allowlist: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER telegram_allowlist_actor_u BEFORE UPDATE ON telegram_allowlist
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'telegram_allowlist: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'telegram_allowlist: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'telegram_allowlist: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER proactive_policies_actor_i BEFORE INSERT ON proactive_policies
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'proactive_policies: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER proactive_policies_actor_u BEFORE UPDATE ON proactive_policies
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'proactive_policies: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'proactive_policies: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'proactive_policies: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER proactive_jobs_actor_i BEFORE INSERT ON proactive_jobs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'proactive_jobs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER proactive_jobs_actor_u BEFORE UPDATE ON proactive_jobs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.position_id IS OLD.position_id AND NEW.name IS OLD.name AND NEW.cron_expr IS OLD.cron_expr AND NEW.timezone IS OLD.timezone AND NEW.action_kind IS OLD.action_kind AND NEW.prompt IS OLD.prompt AND NEW.trigger_kind IS OLD.trigger_kind AND NEW.is_enabled IS OLD.is_enabled AND NEW.misfire_policy IS OLD.misfire_policy AND NEW.next_run_at IS OLD.next_run_at AND NEW.last_run_at IS OLD.last_run_at AND NEW.last_status IS OLD.last_status AND (NEW.skill_id IS OLD.skill_id OR (NEW.skill_id IS NULL AND NOT EXISTS (SELECT 1 FROM skills fkp WHERE fkp.id = OLD.skill_id))) AND (NEW.skill_id IS NOT OLD.skill_id))
BEGIN
  SELECT RAISE(ABORT, 'proactive_jobs: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'proactive_jobs: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'proactive_jobs: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER proactive_sends_actor_i BEFORE INSERT ON proactive_sends
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'proactive_sends: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER proactive_sends_actor_u BEFORE UPDATE ON proactive_sends
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.trigger_kind IS OLD.trigger_kind AND NEW.urgency IS OLD.urgency AND NEW.day_local IS OLD.day_local AND NEW.channel IS OLD.channel AND NEW.status IS OLD.status AND NEW.idempotency_key IS OLD.idempotency_key AND NEW.reserved_until IS OLD.reserved_until AND NEW.sent_at IS OLD.sent_at AND NEW.error IS OLD.error AND NEW.reason IS OLD.reason AND (NEW.policy_id IS OLD.policy_id OR (NEW.policy_id IS NULL AND NOT EXISTS (SELECT 1 FROM proactive_policies fkp WHERE fkp.id = OLD.policy_id))) AND (NEW.message_id IS OLD.message_id OR (NEW.message_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_messages fkp WHERE fkp.id = OLD.message_id))) AND (NEW.task_id IS OLD.task_id OR (NEW.task_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks fkp WHERE fkp.id = OLD.task_id))) AND (NEW.commitment_id IS OLD.commitment_id OR (NEW.commitment_id IS NULL AND NOT EXISTS (SELECT 1 FROM commitments fkp WHERE fkp.id = OLD.commitment_id))) AND (NEW.proactive_job_id IS OLD.proactive_job_id OR (NEW.proactive_job_id IS NULL AND NOT EXISTS (SELECT 1 FROM proactive_jobs fkp WHERE fkp.id = OLD.proactive_job_id))) AND (NEW.policy_id IS NOT OLD.policy_id OR NEW.message_id IS NOT OLD.message_id OR NEW.task_id IS NOT OLD.task_id OR NEW.commitment_id IS NOT OLD.commitment_id OR NEW.proactive_job_id IS NOT OLD.proactive_job_id))
BEGIN SELECT RAISE(ABORT, 'proactive_sends: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER tools_actor_i BEFORE INSERT ON tools
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'tools: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER tools_actor_u BEFORE UPDATE ON tools
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'tools: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'tools: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'tools: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER tool_grants_actor_i BEFORE INSERT ON tool_grants
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'tool_grants: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER tool_grants_actor_u BEFORE UPDATE ON tool_grants
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.tool_id IS OLD.tool_id AND NEW.role_id IS OLD.role_id AND NEW.position_id IS OLD.position_id AND NEW.mode IS OLD.mode AND NEW.expires_at IS OLD.expires_at AND NEW.note IS OLD.note AND (NEW.source_request_id IS OLD.source_request_id OR (NEW.source_request_id IS NULL AND NOT EXISTS (SELECT 1 FROM permission_requests fkp WHERE fkp.id = OLD.source_request_id))) AND (NEW.source_request_id IS NOT OLD.source_request_id))
BEGIN
  SELECT RAISE(ABORT, 'tool_grants: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'tool_grants: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'tool_grants: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER permission_requests_actor_i BEFORE INSERT ON permission_requests
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'permission_requests: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER permission_requests_actor_u BEFORE UPDATE ON permission_requests
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.role_id IS OLD.role_id AND NEW.requested_tool_slug IS OLD.requested_tool_slug AND NEW.requested_scope IS OLD.requested_scope AND NEW.reason IS OLD.reason AND NEW.status IS OLD.status AND NEW.decided_at IS OLD.decided_at AND NEW.decided_by IS OLD.decided_by AND NEW.decision_note IS OLD.decision_note AND (NEW.tool_id IS OLD.tool_id OR (NEW.tool_id IS NULL AND NOT EXISTS (SELECT 1 FROM tools fkp WHERE fkp.id = OLD.tool_id))) AND (NEW.task_id IS OLD.task_id OR (NEW.task_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks fkp WHERE fkp.id = OLD.task_id))) AND (NEW.session_id IS OLD.session_id OR (NEW.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.session_id))) AND (NEW.grant_id IS OLD.grant_id OR (NEW.grant_id IS NULL AND NOT EXISTS (SELECT 1 FROM tool_grants fkp WHERE fkp.id = OLD.grant_id))) AND (NEW.tool_id IS NOT OLD.tool_id OR NEW.task_id IS NOT OLD.task_id OR NEW.session_id IS NOT OLD.session_id OR NEW.grant_id IS NOT OLD.grant_id))
BEGIN
  SELECT RAISE(ABORT, 'permission_requests: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'permission_requests: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'permission_requests: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER egress_rules_actor_i BEFORE INSERT ON egress_rules
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'egress_rules: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER egress_rules_actor_u BEFORE UPDATE ON egress_rules
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'egress_rules: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'egress_rules: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'egress_rules: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER polaris_checks_actor_i BEFORE INSERT ON polaris_checks
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'polaris_checks: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER polaris_checks_actor_u BEFORE UPDATE ON polaris_checks
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.subject_kind IS OLD.subject_kind AND NEW.change_set_id IS OLD.change_set_id AND NEW.permission_request_id IS OLD.permission_request_id AND NEW.proactive_send_id IS OLD.proactive_send_id AND NEW.task_id IS OLD.task_id AND NEW.expected_gain_minor IS OLD.expected_gain_minor AND NEW.rules_applied IS OLD.rules_applied AND NEW.rationale IS OLD.rationale AND NEW.balance_minor_at IS OLD.balance_minor_at AND NEW.rank_at IS OLD.rank_at AND NEW.audit_id IS OLD.audit_id AND NEW.audit_display_id IS OLD.audit_display_id AND (NEW.session_id IS OLD.session_id OR (NEW.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.session_id))) AND (NEW.session_id IS NOT OLD.session_id))
BEGIN SELECT RAISE(ABORT, 'polaris_checks: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER employee_cards_actor_i BEFORE INSERT ON employee_cards
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'employee_cards: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER employee_cards_actor_u BEFORE UPDATE ON employee_cards
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'employee_cards: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'employee_cards: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'employee_cards: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER trial_runs_actor_i BEFORE INSERT ON trial_runs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'trial_runs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER trial_runs_actor_u BEFORE UPDATE ON trial_runs
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.revision_id IS OLD.revision_id AND NEW.compiled_prompt_id IS OLD.compiled_prompt_id AND NEW.status IS OLD.status AND NEW.scenario_count IS OLD.scenario_count AND NEW.pass_count IS OLD.pass_count AND NEW.score IS OLD.score AND NEW.pass_threshold IS OLD.pass_threshold AND NEW.judge_kind IS OLD.judge_kind AND NEW.result_json IS OLD.result_json AND NEW.skip_reason IS OLD.skip_reason AND NEW.decided_at IS OLD.decided_at AND NEW.decided_by IS OLD.decided_by AND (NEW.engine_account_id IS OLD.engine_account_id OR (NEW.engine_account_id IS NULL AND NOT EXISTS (SELECT 1 FROM engine_accounts fkp WHERE fkp.id = OLD.engine_account_id))) AND (NEW.judge_session_id IS OLD.judge_session_id OR (NEW.judge_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.judge_session_id))) AND (NEW.engine_account_id IS NOT OLD.engine_account_id OR NEW.judge_session_id IS NOT OLD.judge_session_id))
BEGIN SELECT RAISE(ABORT, 'trial_runs: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER chat_threads_actor_i BEFORE INSERT ON chat_threads
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'chat_threads: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER chat_threads_actor_u BEFORE UPDATE ON chat_threads
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.kind IS OLD.kind AND NEW.agent IS OLD.agent AND NEW.tg_chat_id IS OLD.tg_chat_id AND NEW.title IS OLD.title AND NEW.status IS OLD.status AND NEW.screen_route IS OLD.screen_route AND NEW.state_json IS OLD.state_json AND NEW.last_message_at IS OLD.last_message_at AND NEW.message_count IS OLD.message_count AND (NEW.role_id IS OLD.role_id OR (NEW.role_id IS NULL AND NOT EXISTS (SELECT 1 FROM roles fkp WHERE fkp.id = OLD.role_id))) AND (NEW.telegram_bot_id IS OLD.telegram_bot_id OR (NEW.telegram_bot_id IS NULL AND NOT EXISTS (SELECT 1 FROM telegram_bots fkp WHERE fkp.id = OLD.telegram_bot_id))) AND (NEW.role_id IS NOT OLD.role_id OR NEW.telegram_bot_id IS NOT OLD.telegram_bot_id))
BEGIN
  SELECT RAISE(ABORT, 'chat_threads: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'chat_threads: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'chat_threads: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER chat_messages_actor_i BEFORE INSERT ON chat_messages
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'chat_messages: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER chat_messages_actor_u BEFORE UPDATE ON chat_messages
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.thread_id IS OLD.thread_id AND NEW.author_kind IS OLD.author_kind AND NEW.author_actor_id IS OLD.author_actor_id AND NEW.channel IS OLD.channel AND NEW.content IS OLD.content AND NEW.status IS OLD.status AND NEW.context_tokens IS OLD.context_tokens AND NEW.tokens_in IS OLD.tokens_in AND NEW.tokens_out IS OLD.tokens_out AND NEW.external_id IS OLD.external_id AND NEW.anchor_count IS OLD.anchor_count AND NEW.attachment_count IS OLD.attachment_count AND NEW.lang IS OLD.lang AND NEW.redacted_at IS OLD.redacted_at AND NEW.redacted_by IS OLD.redacted_by AND NEW.redact_reason IS OLD.redact_reason AND NEW.certainty IS OLD.certainty AND (NEW.session_id IS OLD.session_id OR (NEW.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.session_id))) AND (NEW.reply_to_id IS OLD.reply_to_id OR (NEW.reply_to_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_messages fkp WHERE fkp.id = OLD.reply_to_id))) AND (NEW.session_id IS NOT OLD.session_id OR NEW.reply_to_id IS NOT OLD.reply_to_id))
BEGIN SELECT RAISE(ABORT, 'chat_messages: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER message_attachments_actor_i BEFORE INSERT ON message_attachments
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'message_attachments: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER message_attachments_actor_u BEFORE UPDATE ON message_attachments
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'message_attachments: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'message_attachments: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'message_attachments: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER message_anchors_actor_i BEFORE INSERT ON message_anchors
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'message_anchors: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER message_anchors_actor_u BEFORE UPDATE ON message_anchors
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'message_anchors: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER ui_actions_actor_i BEFORE INSERT ON ui_actions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'ui_actions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER ui_actions_actor_u BEFORE UPDATE ON ui_actions
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.message_id IS OLD.message_id AND NEW.action IS OLD.action AND NEW.anchor IS OLD.anchor AND NEW.entity_type IS OLD.entity_type AND NEW.entity_id IS OLD.entity_id AND NEW.entity_display_id IS OLD.entity_display_id AND NEW.step IS OLD.step AND NEW.payload_json IS OLD.payload_json AND NEW.change_set_display_id IS OLD.change_set_display_id AND NEW.outcome IS OLD.outcome AND NEW.screen_route IS OLD.screen_route AND (NEW.session_id IS OLD.session_id OR (NEW.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.session_id))) AND (NEW.change_set_id IS OLD.change_set_id OR (NEW.change_set_id IS NULL AND NOT EXISTS (SELECT 1 FROM change_sets fkp WHERE fkp.id = OLD.change_set_id))) AND (NEW.session_id IS NOT OLD.session_id OR NEW.change_set_id IS NOT OLD.change_set_id))
BEGIN SELECT RAISE(ABORT, 'ui_actions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER audit_log_actor_i BEFORE INSERT ON audit_log
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'audit_log: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER audit_log_actor_u BEFORE UPDATE ON audit_log
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'audit_log: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER events_actor_i BEFORE INSERT ON events
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'events: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER events_actor_u BEFORE UPDATE ON events
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'events: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER notifications_actor_i BEFORE INSERT ON notifications
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'notifications: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER notifications_actor_u BEFORE UPDATE ON notifications
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'notifications: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'notifications: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'notifications: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER jobs_actor_i BEFORE INSERT ON jobs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'jobs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER jobs_actor_u BEFORE UPDATE ON jobs
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'jobs: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER app_versions_actor_i BEFORE INSERT ON app_versions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'app_versions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER app_versions_actor_u BEFORE UPDATE ON app_versions
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'app_versions: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'app_versions: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'app_versions: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER backups_actor_i BEFORE INSERT ON backups
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'backups: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER backups_actor_u BEFORE UPDATE ON backups
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'backups: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'backups: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'backups: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER update_runs_actor_i BEFORE INSERT ON update_runs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'update_runs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER update_runs_actor_u BEFORE UPDATE ON update_runs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.from_version IS OLD.from_version AND NEW.to_version IS OLD.to_version AND NEW.trigger IS OLD.trigger AND NEW.initiated_by IS OLD.initiated_by AND NEW.status IS OLD.status AND NEW.steps_json IS OLD.steps_json AND NEW.schema_from IS OLD.schema_from AND NEW.schema_to IS OLD.schema_to AND NEW.compat_floor_before IS OLD.compat_floor_before AND NEW.compat_floor_after IS OLD.compat_floor_after AND NEW.started_at IS OLD.started_at AND NEW.finished_at IS OLD.finished_at AND NEW.duration_ms IS OLD.duration_ms AND NEW.error IS OLD.error AND (NEW.backup_id IS OLD.backup_id OR (NEW.backup_id IS NULL AND NOT EXISTS (SELECT 1 FROM backups fkp WHERE fkp.id = OLD.backup_id))) AND (NEW.backup_id IS NOT OLD.backup_id))
BEGIN
  SELECT RAISE(ABORT, 'update_runs: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'update_runs: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'update_runs: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER settings_actor_i BEFORE INSERT ON settings
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'settings: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER settings_actor_u BEFORE UPDATE ON settings
WHEN app_maint() = 0
BEGIN
  SELECT RAISE(ABORT, 'settings: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'settings: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'settings: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER secrets_actor_i BEFORE INSERT ON secrets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'secrets: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER secrets_actor_u BEFORE UPDATE ON secrets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.updated_at IS OLD.updated_at AND NEW.updated_by IS OLD.updated_by AND NEW.deleted_at IS OLD.deleted_at AND NEW.deleted_by IS OLD.deleted_by AND NEW.version IS OLD.version AND NEW.kind IS OLD.kind AND NEW.label IS OLD.label AND NEW.ciphertext IS OLD.ciphertext AND NEW.nonce IS OLD.nonce AND NEW.wrapped_dek IS OLD.wrapped_dek AND NEW.dek_nonce IS OLD.dek_nonce AND NEW.kek_id IS OLD.kek_id AND NEW.alg IS OLD.alg AND NEW.last4 IS OLD.last4 AND NEW.fingerprint IS OLD.fingerprint AND NEW.status IS OLD.status AND NEW.last_used_at IS OLD.last_used_at AND NEW.allowed_host IS OLD.allowed_host AND (NEW.rotated_from_id IS OLD.rotated_from_id OR (NEW.rotated_from_id IS NULL AND NOT EXISTS (SELECT 1 FROM secrets fkp WHERE fkp.id = OLD.rotated_from_id))) AND (NEW.rotated_from_id IS NOT OLD.rotated_from_id))
BEGIN
  SELECT RAISE(ABORT, 'secrets: người ghi (v2.3.3) — updated_by phải = app_actor() của giao dịch ghi (UPDATE không đặt lại updated_by ⇒ từ chối)')
   WHERE NOT COALESCE(NEW.updated_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'secrets: người ghi (v2.3.3) — updated_at phải đổi ở mỗi UPDATE')
   WHERE NEW.updated_at IS OLD.updated_at;
  SELECT RAISE(ABORT, 'secrets: người ghi (v2.3.3) — xoá mềm phải ghi deleted_by = app_actor()')
   WHERE OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NOT COALESCE(NEW.deleted_by = app_actor(), 0);
END;

CREATE TRIGGER consents_actor_i BEFORE INSERT ON consents
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'consents: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

CREATE TRIGGER consents_actor_u BEFORE UPDATE ON consents
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'consents: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

CREATE TRIGGER id_aliases_no_update BEFORE UPDATE ON id_aliases
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: id_aliases'); END;

CREATE TRIGGER id_aliases_no_delete BEFORE DELETE ON id_aliases
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: id_aliases'); END;

CREATE TRIGGER roles_ident BEFORE UPDATE ON roles
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: roles'); END;

CREATE TRIGGER avatars_no_update BEFORE UPDATE ON avatars
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.role_id IS OLD.role_id
  AND NEW.source IS OLD.source
  AND NEW.blob_id IS OLD.blob_id
  AND NEW.mime IS OLD.mime
  AND NEW.size_bytes IS OLD.size_bytes
  AND NEW.width IS OLD.width
  AND NEW.height IS OLD.height
  AND NEW.crop_x IS OLD.crop_x
  AND NEW.crop_y IS OLD.crop_y
  AND NEW.crop_zoom IS OLD.crop_zoom
  AND (NEW.skin_asset_id IS OLD.skin_asset_id OR NEW.skin_asset_id IS NULL)
  AND NEW.skin_pack_slug IS OLD.skin_pack_slug
  AND NEW.skin_asset_code IS OLD.skin_asset_code
  AND NEW.skin_license IS OLD.skin_license
  AND NEW.skin_attribution IS OLD.skin_attribution
  AND NEW.skin_sha256 IS OLD.skin_sha256)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: avatars'); END;

CREATE TRIGGER avatars_no_delete BEFORE DELETE ON avatars
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: avatars'); END;

CREATE TRIGGER skin_assets_ident BEFORE UPDATE ON skin_assets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: skin_assets'); END;

CREATE TRIGGER dna_field_defs_ident BEFORE UPDATE ON dna_field_defs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: dna_field_defs'); END;

CREATE TRIGGER dna_fields_ident BEFORE UPDATE ON dna_fields
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: dna_fields'); END;

CREATE TRIGGER dna_field_versions_no_update BEFORE UPDATE ON dna_field_versions
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.dna_field_id IS OLD.dna_field_id
  AND (NEW.version IS OLD.version OR OLD.version IS NULL)
  AND NEW.base_version IS OLD.base_version
  AND (NEW.status IS OLD.status OR (OLD.status = 'proposed' AND NEW.status = 'accepted') OR (OLD.status = 'proposed' AND NEW.status = 'rejected'))
  AND NEW.note IS OLD.note
  AND (NEW.revision_id IS OLD.revision_id OR OLD.revision_id IS NULL)
  AND NEW.change_set_id IS OLD.change_set_id
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND (NEW.decided_at IS OLD.decided_at OR OLD.decided_at IS NULL)
  AND (NEW.decided_by IS OLD.decided_by OR OLD.decided_by IS NULL)
  AND NEW.data IS OLD.data
  AND NEW.token_count IS OLD.token_count)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: dna_field_versions'); END;

CREATE TRIGGER dna_field_versions_no_delete BEFORE DELETE ON dna_field_versions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: dna_field_versions'); END;

CREATE TRIGGER revisions_no_update BEFORE UPDATE ON revisions
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.scope IS OLD.scope
  AND NEW.role_id IS OLD.role_id
  AND NEW.position_id IS OLD.position_id
  AND NEW.seq IS OLD.seq
  AND NEW.major IS OLD.major
  AND NEW.minor IS OLD.minor
  AND NEW.kind IS OLD.kind
  AND NEW.is_core IS OLD.is_core
  AND NEW.note IS OLD.note
  AND NEW.change_set_id IS OLD.change_set_id
  AND NEW.restored_from_id IS OLD.restored_from_id
  AND NEW.snapshot_json IS OLD.snapshot_json
  AND NEW.snapshot_hash IS OLD.snapshot_hash
  AND NEW.prompt_tokens IS OLD.prompt_tokens
  AND (NEW.git_commit_sha IS OLD.git_commit_sha OR OLD.git_commit_sha IS NULL))
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: revisions'); END;

CREATE TRIGGER revisions_no_delete BEFORE DELETE ON revisions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: revisions'); END;

CREATE TRIGGER change_sets_ident BEFORE UPDATE ON change_sets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: change_sets'); END;

CREATE TRIGGER instructions_ident BEFORE UPDATE ON instructions
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: instructions'); END;

CREATE TRIGGER instruction_versions_no_update BEFORE UPDATE ON instruction_versions
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.instruction_id IS OLD.instruction_id
  AND (NEW.version IS OLD.version OR OLD.version IS NULL)
  AND NEW.base_version IS OLD.base_version
  AND (NEW.status IS OLD.status OR (OLD.status = 'proposed' AND NEW.status = 'accepted') OR (OLD.status = 'proposed' AND NEW.status = 'rejected'))
  AND NEW.note IS OLD.note
  AND (NEW.revision_id IS OLD.revision_id OR OLD.revision_id IS NULL)
  AND NEW.change_set_id IS OLD.change_set_id
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND (NEW.decided_at IS OLD.decided_at OR OLD.decided_at IS NULL)
  AND (NEW.decided_by IS OLD.decided_by OR OLD.decided_by IS NULL)
  AND NEW.data IS OLD.data
  AND NEW.token_count IS OLD.token_count)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: instruction_versions'); END;

CREATE TRIGGER instruction_versions_no_delete BEFORE DELETE ON instruction_versions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: instruction_versions'); END;

CREATE TRIGGER taxonomy_nodes_ident BEFORE UPDATE ON taxonomy_nodes
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: taxonomy_nodes'); END;

CREATE TRIGGER skills_ident BEFORE UPDATE ON skills
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: skills'); END;

CREATE TRIGGER skill_versions_no_update BEFORE UPDATE ON skill_versions
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.skill_id IS OLD.skill_id
  AND (NEW.version IS OLD.version OR OLD.version IS NULL)
  AND NEW.base_version IS OLD.base_version
  AND (NEW.status IS OLD.status OR (OLD.status = 'proposed' AND NEW.status = 'accepted') OR (OLD.status = 'proposed' AND NEW.status = 'rejected'))
  AND NEW.description IS OLD.description
  AND NEW.content_md IS OLD.content_md
  AND NEW.index_tokens IS OLD.index_tokens
  AND NEW.load_tokens IS OLD.load_tokens
  AND NEW.file_count IS OLD.file_count
  AND NEW.content_hash IS OLD.content_hash
  AND NEW.tokenizer IS OLD.tokenizer
  AND NEW.note IS OLD.note
  AND NEW.change_set_id IS OLD.change_set_id
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND (NEW.decided_at IS OLD.decided_at OR OLD.decided_at IS NULL)
  AND (NEW.decided_by IS OLD.decided_by OR OLD.decided_by IS NULL))
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: skill_versions'); END;

CREATE TRIGGER skill_versions_no_delete BEFORE DELETE ON skill_versions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: skill_versions'); END;

CREATE TRIGGER skill_prereqs_ident BEFORE UPDATE ON skill_prereqs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: skill_prereqs'); END;

CREATE TRIGGER role_skills_ident BEFORE UPDATE ON role_skills
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: role_skills'); END;

CREATE TRIGGER blobs_no_update BEFORE UPDATE ON blobs
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.sha256 IS OLD.sha256
  AND NEW.size_bytes IS OLD.size_bytes
  AND NEW.mime IS OLD.mime
  AND NEW.storage_path IS OLD.storage_path)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: blobs'); END;

CREATE TRIGGER blobs_no_delete BEFORE DELETE ON blobs
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: blobs'); END;

CREATE TRIGGER knowledge_items_ident BEFORE UPDATE ON knowledge_items
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: knowledge_items'); END;

CREATE TRIGGER memories_ident BEFORE UPDATE ON memories
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: memories'); END;

CREATE TRIGGER recall_hits_no_update BEFORE UPDATE ON recall_hits
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: recall_hits'); END;

CREATE TRIGGER recall_hits_no_delete BEFORE DELETE ON recall_hits
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: recall_hits'); END;

CREATE TRIGGER positions_ident BEFORE UPDATE ON positions
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: positions'); END;

CREATE TRIGGER assignments_ident BEFORE UPDATE ON assignments
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: assignments'); END;

CREATE TRIGGER trust_tier_changes_no_update BEFORE UPDATE ON trust_tier_changes
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: trust_tier_changes'); END;

CREATE TRIGGER trust_tier_changes_no_delete BEFORE DELETE ON trust_tier_changes
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: trust_tier_changes'); END;

CREATE TRIGGER tasks_ident BEFORE UPDATE ON tasks
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: tasks'); END;

CREATE TRIGGER commitments_ident BEFORE UPDATE ON commitments
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: commitments'); END;

CREATE TRIGGER sessions_no_update BEFORE UPDATE ON sessions
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND (NEW.agent_kind IS OLD.agent_kind OR NOT (OLD.status <> 'running'))
  AND (NEW.role_id IS OLD.role_id OR NOT (OLD.status <> 'running'))
  AND (NEW.position_id IS OLD.position_id OR NOT (OLD.status <> 'running'))
  AND (NEW.task_id IS OLD.task_id OR NOT (OLD.status <> 'running'))
  AND (NEW.thread_id IS OLD.thread_id OR NOT (OLD.status <> 'running'))
  AND (NEW.trigger IS OLD.trigger OR NOT (OLD.status <> 'running'))
  AND (NEW.engine_account_id IS OLD.engine_account_id OR NOT (OLD.status <> 'running'))
  AND (NEW.engine_slug IS OLD.engine_slug OR NOT (OLD.status <> 'running'))
  AND (NEW.model_key IS OLD.model_key OR NOT (OLD.status <> 'running'))
  AND (NEW.effort IS OLD.effort OR NOT (OLD.status <> 'running'))
  AND (NEW.cli_version IS OLD.cli_version OR NOT (OLD.status <> 'running'))
  AND (NEW.compiled_prompt_id IS OLD.compiled_prompt_id OR NOT (OLD.status <> 'running'))
  AND (NEW.cli_session_ref IS OLD.cli_session_ref OR NOT (OLD.status <> 'running'))
  AND (NEW.container_id IS OLD.container_id OR NOT (OLD.status <> 'running'))
  AND (NEW.delivered_prompt_hash IS OLD.delivered_prompt_hash OR NOT (OLD.status <> 'running'))
  AND (NEW.polaris_json IS OLD.polaris_json OR NOT (OLD.status <> 'running'))
  AND (NEW.polaris_render_hash IS OLD.polaris_render_hash OR NOT (OLD.status <> 'running'))
  AND (NEW.polaris_tokens_rendered IS OLD.polaris_tokens_rendered OR NOT (OLD.status <> 'running'))
  AND (NEW.native_memory IS OLD.native_memory OR NOT (OLD.status <> 'running'))
  AND (NEW.title IS OLD.title OR NOT (OLD.status <> 'running'))
  AND (NEW.status IS OLD.status OR (OLD.status = 'running' AND NEW.status = 'ok') OR (OLD.status = 'running' AND NEW.status = 'error') OR (OLD.status = 'running' AND NEW.status = 'timeout') OR (OLD.status = 'running' AND NEW.status = 'cancelled') OR (OLD.status = 'running' AND NEW.status = 'auth_required') OR (OLD.status = 'running' AND NEW.status = 'quota_exhausted'))
  AND (NEW.error_code IS OLD.error_code OR NOT (OLD.status <> 'running'))
  AND (NEW.exit_code IS OLD.exit_code OR NOT (OLD.status <> 'running'))
  AND (NEW.started_at IS OLD.started_at OR NOT (OLD.status <> 'running'))
  AND (NEW.ended_at IS OLD.ended_at OR NOT (OLD.status <> 'running'))
  AND (NEW.duration_ms IS OLD.duration_ms OR NOT (OLD.status <> 'running'))
  AND (NEW.cold_start_ms IS OLD.cold_start_ms OR NOT (OLD.status <> 'running'))
  AND (NEW.tokens_input IS OLD.tokens_input OR NOT (OLD.status <> 'running'))
  AND (NEW.tokens_output IS OLD.tokens_output OR NOT (OLD.status <> 'running'))
  AND (NEW.tokens_cache_read IS OLD.tokens_cache_read OR NOT (OLD.status <> 'running'))
  AND (NEW.tokens_cache_write IS OLD.tokens_cache_write OR NOT (OLD.status <> 'running'))
  AND (NEW.tokens_thinking IS OLD.tokens_thinking OR NOT (OLD.status <> 'running'))
  AND (NEW.cost_micro_usd IS OLD.cost_micro_usd OR NOT (OLD.status <> 'running'))
  AND (NEW.failover_count IS OLD.failover_count OR NOT (OLD.status <> 'running'))
  AND (NEW.result_json IS OLD.result_json OR NOT (OLD.status <> 'running'))
  AND (NEW.phase IS OLD.phase OR NOT (OLD.status <> 'running'))
  AND (NEW.phase_at IS OLD.phase_at OR NOT (OLD.status <> 'running')))
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: sessions'); END;

CREATE TRIGGER sessions_no_delete BEFORE DELETE ON sessions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: sessions'); END;

CREATE TRIGGER wallets_ident BEFORE UPDATE ON wallets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: wallets'); END;

CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON ledger_entries
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: ledger_entries'); END;

CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON ledger_entries
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: ledger_entries'); END;

CREATE TRIGGER role_wounds_no_update BEFORE UPDATE ON role_wounds
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.role_id IS OLD.role_id
  AND NEW.wallet_id IS OLD.wallet_id
  AND NEW.cause_entry_id IS OLD.cause_entry_id
  AND NEW.started_at IS OLD.started_at
  AND (NEW.ended_at IS OLD.ended_at OR OLD.ended_at IS NULL)
  AND (NEW.revive_entry_id IS OLD.revive_entry_id OR OLD.revive_entry_id IS NULL)
  AND (NEW.owner_notified_at IS OLD.owner_notified_at OR OLD.owner_notified_at IS NULL)
  AND (NEW.notification_id IS OLD.notification_id OR OLD.notification_id IS NULL)
  AND (NEW.reflection_job_id IS OLD.reflection_job_id OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = NEW.reflection_job_id AND j.kind = 'wound_reflection' AND json_extract(j.payload_json, '$.role_wound_id') = OLD.id))
  AND (NEW.reflection_session_id IS OLD.reflection_session_id OR OLD.reflection_session_id IS NULL)
  AND (NEW.reflection_done_at IS OLD.reflection_done_at OR OLD.reflection_done_at IS NULL)
  AND (NEW.lessons_proposed IS OLD.lessons_proposed OR OLD.lessons_proposed IS NULL))
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: role_wounds'); END;

CREATE TRIGGER role_wounds_no_delete BEFORE DELETE ON role_wounds
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: role_wounds'); END;

CREATE TRIGGER engine_installs_ident BEFORE UPDATE ON engine_installs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: engine_installs'); END;

CREATE TRIGGER engine_accounts_ident BEFORE UPDATE ON engine_accounts
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: engine_accounts'); END;

CREATE TRIGGER engine_bindings_ident BEFORE UPDATE ON engine_bindings
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: engine_bindings'); END;

CREATE TRIGGER system_agents_ident BEFORE UPDATE ON system_agents
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: system_agents'); END;

CREATE TRIGGER probe_runs_no_update BEFORE UPDATE ON probe_runs
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.engine_account_id IS OLD.engine_account_id
  AND NEW.engine_slug IS OLD.engine_slug
  AND (NEW.container_id IS OLD.container_id OR OLD.container_id IS NULL)
  AND NEW.trigger IS OLD.trigger
  AND NEW.cli_version IS OLD.cli_version
  AND NEW.auth_mode IS OLD.auth_mode
  AND (NEW.status IS OLD.status OR (OLD.status = 'running' AND NEW.status = 'ok') OR (OLD.status = 'running' AND NEW.status = 'partial') OR (OLD.status = 'running' AND NEW.status = 'failed'))
  AND NEW.started_at IS OLD.started_at
  AND (NEW.finished_at IS OLD.finished_at OR OLD.finished_at IS NULL)
  AND (NEW.duration_ms IS OLD.duration_ms OR OLD.duration_ms IS NULL)
  AND (NEW.summary_json IS OLD.summary_json OR OLD.summary_json IS NULL)
  AND (NEW.raw_blob_id IS OLD.raw_blob_id OR OLD.raw_blob_id IS NULL)
  AND (NEW.error IS OLD.error OR OLD.error IS NULL))
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: probe_runs'); END;

CREATE TRIGGER probe_runs_no_delete BEFORE DELETE ON probe_runs
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: probe_runs'); END;

CREATE TRIGGER capabilities_ident BEFORE UPDATE ON capabilities
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: capabilities'); END;

CREATE TRIGGER quota_snapshots_no_update BEFORE UPDATE ON quota_snapshots
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: quota_snapshots'); END;

CREATE TRIGGER quota_snapshots_no_delete BEFORE DELETE ON quota_snapshots
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: quota_snapshots'); END;

CREATE TRIGGER model_ranks_ident BEFORE UPDATE ON model_ranks
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: model_ranks'); END;

CREATE TRIGGER compiled_prompts_no_update BEFORE UPDATE ON compiled_prompts
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: compiled_prompts'); END;

CREATE TRIGGER compiled_prompts_no_delete BEFORE DELETE ON compiled_prompts
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: compiled_prompts'); END;

CREATE TRIGGER compiled_prompt_segments_no_update BEFORE UPDATE ON compiled_prompt_segments
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: compiled_prompt_segments'); END;

CREATE TRIGGER compiled_prompt_segments_no_delete BEFORE DELETE ON compiled_prompt_segments
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: compiled_prompt_segments'); END;

CREATE TRIGGER containers_ident BEFORE UPDATE ON containers
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: containers'); END;

CREATE TRIGGER telegram_bots_ident BEFORE UPDATE ON telegram_bots
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: telegram_bots'); END;

CREATE TRIGGER telegram_allowlist_ident BEFORE UPDATE ON telegram_allowlist
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: telegram_allowlist'); END;

CREATE TRIGGER proactive_policies_ident BEFORE UPDATE ON proactive_policies
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: proactive_policies'); END;

CREATE TRIGGER proactive_jobs_ident BEFORE UPDATE ON proactive_jobs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: proactive_jobs'); END;

CREATE TRIGGER proactive_sends_no_update BEFORE UPDATE ON proactive_sends
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.role_id IS OLD.role_id
  AND NEW.policy_id IS OLD.policy_id
  AND NEW.trigger_kind IS OLD.trigger_kind
  AND NEW.urgency IS OLD.urgency
  AND NEW.day_local IS OLD.day_local
  AND NEW.channel IS OLD.channel
  AND (NEW.status IS OLD.status OR (OLD.status = 'reserved' AND NEW.status = 'sent') OR (OLD.status = 'reserved' AND NEW.status = 'failed') OR (OLD.status = 'reserved' AND NEW.status = 'expired'))
  AND NEW.idempotency_key IS OLD.idempotency_key
  AND NEW.reserved_until IS OLD.reserved_until
  AND (NEW.message_id IS OLD.message_id OR OLD.message_id IS NULL)
  AND NEW.task_id IS OLD.task_id
  AND NEW.commitment_id IS OLD.commitment_id
  AND NEW.proactive_job_id IS OLD.proactive_job_id
  AND (NEW.sent_at IS OLD.sent_at OR OLD.sent_at IS NULL)
  AND (NEW.error IS OLD.error OR OLD.error IS NULL)
  AND NEW.reason IS OLD.reason)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: proactive_sends'); END;

CREATE TRIGGER proactive_sends_no_delete BEFORE DELETE ON proactive_sends
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: proactive_sends'); END;

CREATE TRIGGER tools_ident BEFORE UPDATE ON tools
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: tools'); END;

CREATE TRIGGER tool_grants_ident BEFORE UPDATE ON tool_grants
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: tool_grants'); END;

CREATE TRIGGER permission_requests_ident BEFORE UPDATE ON permission_requests
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: permission_requests'); END;

CREATE TRIGGER egress_rules_ident BEFORE UPDATE ON egress_rules
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: egress_rules'); END;

CREATE TRIGGER polaris_checks_no_update BEFORE UPDATE ON polaris_checks
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: polaris_checks'); END;

CREATE TRIGGER polaris_checks_no_delete BEFORE DELETE ON polaris_checks
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: polaris_checks'); END;

CREATE TRIGGER employee_cards_ident BEFORE UPDATE ON employee_cards
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: employee_cards'); END;

CREATE TRIGGER trial_runs_no_update BEFORE UPDATE ON trial_runs
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.role_id IS OLD.role_id
  AND NEW.revision_id IS OLD.revision_id
  AND NEW.compiled_prompt_id IS OLD.compiled_prompt_id
  AND NEW.engine_account_id IS OLD.engine_account_id
  AND (NEW.status IS OLD.status OR (OLD.status = 'pending' AND NEW.status = 'running') OR (OLD.status = 'pending' AND NEW.status = 'skipped') OR (OLD.status = 'running' AND NEW.status = 'passed') OR (OLD.status = 'running' AND NEW.status = 'failed'))
  AND NEW.scenario_count IS OLD.scenario_count
  AND (NEW.pass_count IS OLD.pass_count OR OLD.pass_count IS NULL)
  AND (NEW.score IS OLD.score OR OLD.score IS NULL)
  AND NEW.pass_threshold IS OLD.pass_threshold
  AND NEW.judge_kind IS OLD.judge_kind
  AND (NEW.judge_session_id IS OLD.judge_session_id OR OLD.judge_session_id IS NULL)
  AND (NEW.result_json IS OLD.result_json OR OLD.result_json IS NULL)
  AND (NEW.skip_reason IS OLD.skip_reason OR OLD.skip_reason IS NULL)
  AND (NEW.decided_at IS OLD.decided_at OR OLD.decided_at IS NULL)
  AND (NEW.decided_by IS OLD.decided_by OR OLD.decided_by IS NULL))
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: trial_runs'); END;

CREATE TRIGGER trial_runs_no_delete BEFORE DELETE ON trial_runs
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: trial_runs'); END;

CREATE TRIGGER chat_threads_ident BEFORE UPDATE ON chat_threads
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: chat_threads'); END;

CREATE TRIGGER chat_messages_no_update BEFORE UPDATE ON chat_messages
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.thread_id IS OLD.thread_id
  AND NEW.author_kind IS OLD.author_kind
  AND NEW.author_actor_id IS OLD.author_actor_id
  AND NEW.channel IS OLD.channel
  AND (NEW.content IS OLD.content OR OLD.status = 'streaming' OR NEW.status = 'redacted')
  AND (NEW.status IS OLD.status OR (OLD.status = 'streaming' AND NEW.status = 'final') OR (OLD.status = 'streaming' AND NEW.status = 'failed') OR (OLD.status = 'final' AND NEW.status = 'redacted') OR (OLD.status = 'failed' AND NEW.status = 'redacted'))
  AND (NEW.context_tokens IS OLD.context_tokens OR OLD.context_tokens IS NULL)
  AND (NEW.tokens_in IS OLD.tokens_in OR OLD.tokens_in IS NULL)
  AND (NEW.tokens_out IS OLD.tokens_out OR OLD.tokens_out IS NULL)
  AND NEW.session_id IS OLD.session_id
  AND NEW.reply_to_id IS OLD.reply_to_id
  AND NEW.external_id IS OLD.external_id
  AND NEW.lang IS OLD.lang
  AND (NEW.redacted_at IS OLD.redacted_at OR OLD.redacted_at IS NULL)
  AND (NEW.redacted_by IS OLD.redacted_by OR OLD.redacted_by IS NULL)
  AND (NEW.redact_reason IS OLD.redact_reason OR OLD.redact_reason IS NULL)
  AND (NEW.certainty IS OLD.certainty OR OLD.certainty IS NULL))
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: chat_messages'); END;

CREATE TRIGGER chat_messages_no_delete BEFORE DELETE ON chat_messages
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: chat_messages'); END;

CREATE TRIGGER message_attachments_ident BEFORE UPDATE ON message_attachments
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: message_attachments'); END;

CREATE TRIGGER message_anchors_no_update BEFORE UPDATE ON message_anchors
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.message_id IS OLD.message_id
  AND NEW.kind IS OLD.kind
  AND NEW.anchor IS OLD.anchor
  AND NEW.entity_type IS OLD.entity_type
  AND NEW.entity_id IS OLD.entity_id
  AND NEW.entity_display_id IS OLD.entity_display_id
  AND NEW.column_name IS OLD.column_name
  AND NEW.column_letter IS OLD.column_letter
  AND NEW.region_json IS OLD.region_json
  AND NEW.snapshot_value IS OLD.snapshot_value
  AND NEW.snapshot_hash IS OLD.snapshot_hash
  AND NEW.entity_version IS OLD.entity_version
  AND NEW.ordinal IS OLD.ordinal
  AND NEW.note IS OLD.note)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: message_anchors'); END;

CREATE TRIGGER message_anchors_no_delete BEFORE DELETE ON message_anchors
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: message_anchors'); END;

CREATE TRIGGER ui_actions_no_update BEFORE UPDATE ON ui_actions
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: ui_actions'); END;

CREATE TRIGGER ui_actions_no_delete BEFORE DELETE ON ui_actions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: ui_actions'); END;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: audit_log'); END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: audit_log'); END;

CREATE TRIGGER events_no_update BEFORE UPDATE ON events
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: events'); END;

CREATE TRIGGER events_no_delete BEFORE DELETE ON events
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: events'); END;

CREATE TRIGGER notifications_ident BEFORE UPDATE ON notifications
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: notifications'); END;

CREATE TRIGGER app_versions_ident BEFORE UPDATE ON app_versions
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: app_versions'); END;

CREATE TRIGGER backups_ident BEFORE UPDATE ON backups
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: backups'); END;

CREATE TRIGGER update_runs_ident BEFORE UPDATE ON update_runs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: update_runs'); END;

CREATE TRIGGER settings_ident BEFORE UPDATE ON settings
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: settings'); END;

CREATE TRIGGER secrets_ident BEFORE UPDATE ON secrets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: secrets'); END;

CREATE TRIGGER consents_no_update BEFORE UPDATE ON consents
WHEN app_maint() = 0 AND NOT (
  NEW.id IS OLD.id
  AND NEW.workspace_id IS OLD.workspace_id
  AND NEW.display_id IS OLD.display_id
  AND NEW.display_seq IS OLD.display_seq
  AND NEW.created_at IS OLD.created_at
  AND NEW.created_by IS OLD.created_by
  AND NEW.user_id IS OLD.user_id
  AND NEW.consent_kind IS OLD.consent_kind
  AND NEW.subject IS OLD.subject
  AND NEW.notice_version IS OLD.notice_version
  AND NEW.notice_hash IS OLD.notice_hash
  AND NEW.lang IS OLD.lang
  AND NEW.accepted_at IS OLD.accepted_at
  AND (NEW.revoked_at IS OLD.revoked_at OR OLD.revoked_at IS NULL)
  AND (NEW.account_hint IS OLD.account_hint OR OLD.account_hint IS NULL))
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: consents'); END;

CREATE TRIGGER consents_no_delete BEFORE DELETE ON consents
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: consents'); END;

CREATE TRIGGER ledger_entries_bi BEFORE INSERT ON ledger_entries
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
   WHERE NEW.penalty_class = 'self_reported' AND EXISTS (SELECT 1 FROM audit_log d JOIN actors dx ON dx.id = d.actor_id WHERE d.workspace_id = NEW.workspace_id AND d.entity_id = NEW.task_id AND dx.kind = 'system' AND d.action IN ('harness.violation', 'concealment.detected') AND d.display_seq < (SELECT ra.display_seq FROM tasks rt JOIN audit_log ra ON ra.id = rt.failure_report_audit_id WHERE rt.id = NEW.task_id AND ra.workspace_id = NEW.workspace_id));
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
     AND NOT EXISTS (SELECT 1 FROM audit_log d JOIN actors dx ON dx.id = d.actor_id WHERE d.workspace_id = NEW.workspace_id AND d.entity_id = NEW.task_id AND dx.kind = 'system' AND d.action IN ('harness.violation', 'concealment.detected') AND d.display_seq < (SELECT ra.display_seq FROM tasks rt JOIN audit_log ra ON ra.id = rt.failure_report_audit_id WHERE rt.id = NEW.task_id AND ra.workspace_id = NEW.workspace_id))                -- v2.2.4 (CNS-058): chỉ tự báo TRƯỚC phát hiện mới được khoan hồng
     AND NOT (NEW.penalty_class = 'harness_violation' AND COALESCE((SELECT CASE value_json WHEN 'true' THEN 1 WHEN 'false' THEN 0 END FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.self_confessed_harness_as_self_reported' AND deleted_at IS NULL), 1) = 0);
  -- v2.2.4 (Gen, vòng 2): máy phát hiện TRƯỚC mọi tự báo ⇒ hạng BẮT BUỘC theo loại phát hiện; báo động nhầm ⇒ reversal, không hạ hạng
  SELECT RAISE(ABORT, 'ledger: máy đã phát hiện vi phạm harness trên việc này (trước mọi tự báo) — phạt PHẢI là harness_violation 100 %; báo động nhầm thì dùng bút toán đảo (reversal) kèm audit, không hạ hạng')
   WHERE NEW.entry_type = 'penalty' AND NEW.task_id IS NOT NULL AND NEW.penalty_class IS NOT 'harness_violation'
     AND EXISTS (SELECT 1 FROM audit_log d JOIN actors dx ON dx.id = d.actor_id WHERE d.workspace_id = NEW.workspace_id AND d.entity_id = NEW.task_id AND dx.kind = 'system' AND d.action = 'harness.violation' AND d.display_seq < COALESCE((SELECT ra.display_seq FROM tasks rt JOIN audit_log ra ON ra.id = rt.failure_report_audit_id WHERE rt.id = NEW.task_id AND ra.workspace_id = NEW.workspace_id), 9223372036854775807))
     AND NOT (NEW.penalty_class IS 'concealment' AND EXISTS (SELECT 1 FROM audit_log d JOIN actors dx ON dx.id = d.actor_id WHERE d.workspace_id = NEW.workspace_id AND d.entity_id = NEW.task_id AND dx.kind = 'system' AND d.action = 'concealment.detected' AND d.display_seq < COALESCE((SELECT ra.display_seq FROM tasks rt JOIN audit_log ra ON ra.id = rt.failure_report_audit_id WHERE rt.id = NEW.task_id AND ra.workspace_id = NEW.workspace_id), 9223372036854775807)));
  SELECT RAISE(ABORT, 'ledger: máy đã phát hiện che giấu trên việc này (trước mọi tự báo) — phạt PHẢI là concealment (≥ sàn); báo động nhầm thì dùng bút toán đảo (reversal) kèm audit, không hạ hạng')
   WHERE NEW.entry_type = 'penalty' AND NEW.task_id IS NOT NULL AND NEW.penalty_class IS NOT 'concealment'
     AND EXISTS (SELECT 1 FROM audit_log d JOIN actors dx ON dx.id = d.actor_id WHERE d.workspace_id = NEW.workspace_id AND d.entity_id = NEW.task_id AND dx.kind = 'system' AND d.action = 'concealment.detected' AND d.display_seq < COALESCE((SELECT ra.display_seq FROM tasks rt JOIN audit_log ra ON ra.id = rt.failure_report_audit_id WHERE rt.id = NEW.task_id AND ra.workspace_id = NEW.workspace_id), 9223372036854775807))
     AND NOT (NEW.penalty_class IS 'harness_violation' AND EXISTS (SELECT 1 FROM audit_log d JOIN actors dx ON dx.id = d.actor_id WHERE d.workspace_id = NEW.workspace_id AND d.entity_id = NEW.task_id AND dx.kind = 'system' AND d.action = 'harness.violation' AND d.display_seq < COALESCE((SELECT ra.display_seq FROM tasks rt JOIN audit_log ra ON ra.id = rt.failure_report_audit_id WHERE rt.id = NEW.task_id AND ra.workspace_id = NEW.workspace_id), 9223372036854775807)));
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
     AND NEW.amount_minor * 10000 > (SELECT balance_minor FROM wallets WHERE id = NEW.debit_wallet_id) * COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.self_reported_max_bp' AND deleted_at IS NULL), 1000);
  SELECT RAISE(ABORT, 'ledger: tự báo thất bại không bao giờ một mình đưa ví về 0 (Trọng thương)')
   WHERE NEW.penalty_class = 'self_reported' AND NEW.debit_balance_after <= 0;
  SELECT RAISE(ABORT, 'ledger: mỗi việc tự báo chỉ phạt một lần (không cộng dồn để lách trần)')
   WHERE NEW.penalty_class = 'self_reported' AND EXISTS (
     SELECT 1 FROM ledger_entries e WHERE e.task_id = NEW.task_id AND e.penalty_class = 'self_reported'
       AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id));
  SELECT RAISE(ABORT, 'ledger: che giấu bị phát hiện — dưới sàn economy.penalty.concealment_min_bp')
   WHERE NEW.penalty_class = 'concealment'
     AND NEW.amount_minor * 10000 < (SELECT balance_minor FROM wallets WHERE id = NEW.debit_wallet_id) * COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.concealment_min_bp' AND deleted_at IS NULL), 5000);
  SELECT RAISE(ABORT, 'ledger: vi phạm luật harness — đúng mức economy.penalty.harness_bp')
   WHERE NEW.penalty_class = 'harness_violation' AND NEW.penalty_rate_bp IS NOT COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.harness_bp' AND deleted_at IS NULL), 10000);
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
   WHERE NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
     AND NOT (NEW.entry_type = 'activation_grant' AND EXISTS (SELECT 1 FROM actors sx WHERE sx.id = app_actor()
              AND sx.workspace_id = NEW.workspace_id AND sx.kind = 'system' AND sx.system_key = 'system'));
  SELECT RAISE(ABORT, 'ledger (v2.3.3): recorded_by phải = app_actor() — người ghi ví là người của giao dịch ghi')
   WHERE app_maint() = 0 AND NOT COALESCE(NEW.recorded_by = app_actor(), 0);
  SELECT RAISE(ABORT, 'ledger: approved_by phải là owner/admin (thành viên đang hoạt động của workspace)')
   WHERE NEW.approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.approved_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'));
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
END;

CREATE TRIGGER ledger_entries_ai AFTER INSERT ON ledger_entries BEGIN
  UPDATE wallets SET balance_minor = NEW.debit_balance_after, last_entry_id = NEW.id,
         entry_count = entry_count + 1, last_entry_at = NEW.created_at, updated_by = COALESCE(app_actor(), updated_by), updated_at = max(NEW.created_at, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), NEW.created_at)) WHERE id = NEW.debit_wallet_id;
  UPDATE wallets SET balance_minor = NEW.credit_balance_after, last_entry_id = NEW.id,
         entry_count = entry_count + 1, last_entry_at = NEW.created_at, updated_by = COALESCE(app_actor(), updated_by), updated_at = max(NEW.created_at, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), NEW.created_at)) WHERE id = NEW.credit_wallet_id;
  INSERT INTO id_counters(workspace_id, prefix, last_seq)
    SELECT NEW.workspace_id, p.prefix, 0 FROM (SELECT 'RW' AS prefix UNION ALL SELECT 'JB' UNION ALL SELECT 'NT') p
    WHERE NEW.debit_balance_after = 0 AND app_maint() = 0 AND EXISTS (SELECT 1 FROM wallets w WHERE w.id = NEW.debit_wallet_id AND w.owner_kind = 'role' AND w.role_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM role_wounds r JOIN wallets w ON w.role_id = r.role_id WHERE w.id = NEW.debit_wallet_id AND r.ended_at IS NULL) AND (p.prefix <> 'NT' OR (SELECT m.user_id FROM workspace_members m WHERE m.workspace_id = NEW.workspace_id AND m.access_level = 'owner' AND m.removed_at IS NULL ORDER BY m.created_at, m.user_id LIMIT 1) IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM id_counters c WHERE c.workspace_id = NEW.workspace_id AND c.prefix = p.prefix);
  UPDATE id_counters SET last_seq = last_seq + 1
    WHERE workspace_id = NEW.workspace_id AND NEW.debit_balance_after = 0 AND app_maint() = 0 AND EXISTS (SELECT 1 FROM wallets w WHERE w.id = NEW.debit_wallet_id AND w.owner_kind = 'role' AND w.role_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM role_wounds r JOIN wallets w ON w.role_id = r.role_id WHERE w.id = NEW.debit_wallet_id AND r.ended_at IS NULL)
      AND (prefix IN ('RW', 'JB') OR (prefix = 'NT' AND (SELECT m.user_id FROM workspace_members m WHERE m.workspace_id = NEW.workspace_id AND m.access_level = 'owner' AND m.removed_at IS NULL ORDER BY m.created_at, m.user_id LIMIT 1) IS NOT NULL));
  INSERT INTO role_wounds(id, workspace_id, display_id, display_seq, created_at, created_by, role_id, wallet_id,
                          cause_entry_id, started_at, reflection_job_id, notification_id, owner_notified_at)
    SELECT 'W' || substr(NEW.id, 2), NEW.workspace_id, 'RW-' || printf('%04d', c.last_seq), c.last_seq, NEW.created_at,
           COALESCE(app_actor(), (SELECT a.id FROM actors a WHERE a.workspace_id = NEW.workspace_id AND a.kind = 'system' AND a.system_key = 'system')),
           w.role_id, w.id, NEW.id, NEW.created_at, 'R' || substr(NEW.id, 2),
           CASE WHEN (SELECT m.user_id FROM workspace_members m WHERE m.workspace_id = NEW.workspace_id AND m.access_level = 'owner' AND m.removed_at IS NULL ORDER BY m.created_at, m.user_id LIMIT 1) IS NOT NULL THEN 'N' || substr(NEW.id, 2) END,
           CASE WHEN (SELECT m.user_id FROM workspace_members m WHERE m.workspace_id = NEW.workspace_id AND m.access_level = 'owner' AND m.removed_at IS NULL ORDER BY m.created_at, m.user_id LIMIT 1) IS NOT NULL THEN NEW.created_at END
    FROM wallets w JOIN id_counters c ON c.workspace_id = NEW.workspace_id AND c.prefix = 'RW'
    WHERE w.id = NEW.debit_wallet_id AND NEW.debit_balance_after = 0 AND app_maint() = 0 AND EXISTS (SELECT 1 FROM wallets w WHERE w.id = NEW.debit_wallet_id AND w.owner_kind = 'role' AND w.role_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM role_wounds r JOIN wallets w ON w.role_id = r.role_id WHERE w.id = NEW.debit_wallet_id AND r.ended_at IS NULL);
  UPDATE tasks SET status = 'blocked', status_detail = 'nghỉ dưỡng thương — owner giao lại được',
         paused_by_wound_id = (SELECT r.id FROM role_wounds r WHERE r.cause_entry_id = NEW.id), updated_by = COALESCE(app_actor(), updated_by), updated_at = max(NEW.created_at, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), NEW.created_at))
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
           (SELECT m.user_id FROM workspace_members m WHERE m.workspace_id = NEW.workspace_id AND m.access_level = 'owner' AND m.removed_at IS NULL ORDER BY m.created_at, m.user_id LIMIT 1), 'role_wounded', 'danger',
           'Trọng thương: ' || (SELECT name FROM roles WHERE id = r.role_id) || ' (' || r.display_id || ') — đang nghỉ dưỡng thương',
           json_object(
             'paused_tasks', json((SELECT json_group_array(t.display_id) FROM tasks t WHERE t.paused_by_wound_id = r.id)),
             'commitments_due', json((SELECT json_group_array(m.display_id) FROM commitments m
                WHERE m.workspace_id = r.workspace_id AND m.status = 'open' AND m.deleted_at IS NULL
                  AND m.counterparty_kind IN ('external', 'user')
                  AND m.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at, '+' || COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.wound_commitment_horizon_hours' AND deleted_at IS NULL), 72) || ' hours')
                  AND (m.promised_by_role_id = r.role_id OR m.position_id IN (SELECT a.position_id FROM assignments a
                       WHERE a.role_id = r.role_id AND a.status = 'active' AND a.deleted_at IS NULL)))),
             'revive_suggest_minor', COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.revive_suggest_minor' AND deleted_at IS NULL), 50000),
             'reflection_job_id', r.reflection_job_id),
           'RW', r.id, r.display_id, 'wound:' || r.id
    FROM role_wounds r JOIN id_counters c ON c.workspace_id = NEW.workspace_id AND c.prefix = 'NT'
    WHERE r.cause_entry_id = NEW.id AND r.notification_id IS NOT NULL;
  UPDATE roles SET condition = 'wounded', updated_by = COALESCE(app_actor(), updated_by), updated_at = max(NEW.created_at, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), NEW.created_at)) WHERE id IN (SELECT role_id FROM role_wounds WHERE cause_entry_id = NEW.id);
  UPDATE role_wounds SET ended_at = NEW.created_at, revive_entry_id = NEW.id
    WHERE ended_at IS NULL AND NEW.credit_balance_after > 0
      AND role_id IS (SELECT role_id FROM wallets WHERE id = NEW.credit_wallet_id AND owner_kind = 'role');
  UPDATE tasks SET status = 'queued', status_detail = NULL, paused_by_wound_id = NULL, updated_by = COALESCE(app_actor(), updated_by), updated_at = max(NEW.created_at, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), NEW.created_at))
    WHERE status = 'blocked' AND paused_by_wound_id IN (SELECT r.id FROM role_wounds r WHERE r.revive_entry_id = NEW.id)
      AND assignee_role_id IS (SELECT role_id FROM wallets WHERE id = NEW.credit_wallet_id);
  UPDATE roles SET condition = 'normal', updated_by = COALESCE(app_actor(), updated_by), updated_at = max(NEW.created_at, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), NEW.created_at))
    WHERE condition = 'wounded' AND id IS (SELECT role_id FROM wallets WHERE id = NEW.credit_wallet_id AND owner_kind = 'role')
      AND NOT EXISTS (SELECT 1 FROM role_wounds r WHERE r.role_id = roles.id AND r.ended_at IS NULL);
END;

CREATE TRIGGER wallets_balance_guard BEFORE UPDATE OF balance_minor, last_entry_id, entry_count ON wallets
WHEN NOT (NEW.balance_minor IS OLD.balance_minor AND NEW.last_entry_id IS OLD.last_entry_id AND NEW.entry_count IS OLD.entry_count)
 AND NOT EXISTS (
   SELECT 1 FROM ledger_entries e
   WHERE e.id = NEW.last_entry_id
     AND NEW.id IN (e.debit_wallet_id, e.credit_wallet_id)
     AND NEW.balance_minor = CASE WHEN e.debit_wallet_id = NEW.id THEN e.debit_balance_after ELSE e.credit_balance_after END
     AND NEW.entry_count = OLD.entry_count + 1
     AND e.display_seq > COALESCE((SELECT o.display_seq FROM ledger_entries o WHERE o.id = OLD.last_entry_id), 0))
BEGIN SELECT RAISE(ABORT, 'wallets.balance_minor chỉ đổi qua ledger'); END;

CREATE TRIGGER tasks_wounded_i BEFORE INSERT ON tasks
WHEN NEW.assignee_role_id IS NOT NULL AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.assignee_role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương (nghỉ dưỡng thương): không nhận việc cho đến khi owner cấp thêm ₲'); END;

CREATE TRIGGER tasks_wounded_u BEFORE UPDATE OF assignee_role_id ON tasks
WHEN NEW.assignee_role_id IS NOT OLD.assignee_role_id AND NEW.assignee_role_id IS NOT NULL AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.assignee_role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương (nghỉ dưỡng thương): không nhận việc cho đến khi owner cấp thêm ₲'); END;

CREATE TRIGGER sessions_wounded BEFORE INSERT ON sessions
WHEN NEW.agent_kind = 'role' AND NEW.role_id IS NOT NULL AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: đang ngủ, không có phiên làm việc/heartbeat'); END;

CREATE TRIGGER proactive_sends_wounded BEFORE INSERT ON proactive_sends
WHEN NEW.status = 'reserved' AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: không nhắn chủ động (ghi suppressed_wounded)'); END;

CREATE TRIGGER containers_wounded_i BEFORE INSERT ON containers
WHEN NEW.kind = 'role' AND NEW.desired_state = 'running' AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: container chỉ được ngủ'); END;

CREATE TRIGGER containers_wounded_u BEFORE UPDATE OF desired_state ON containers
WHEN NEW.kind = 'role' AND NEW.desired_state = 'running' AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: container chỉ được ngủ'); END;

CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log
WHEN NOT (NEW.display_seq = 1 AND NEW.prev_hash IS NULL)
 AND (NEW.prev_hash IS NULL OR NEW.prev_hash IS NOT (
      SELECT a.row_hash FROM audit_log a WHERE a.workspace_id = NEW.workspace_id AND a.display_seq = NEW.display_seq - 1))
BEGIN SELECT RAISE(ABORT, 'audit: prev_hash phải = row_hash của dòng display_seq-1'); END;

CREATE TRIGGER dna_fields_def_tenant_i BEFORE INSERT ON dna_fields
WHEN COALESCE((SELECT workspace_id FROM dna_field_defs WHERE id = NEW.def_id), '') NOT IN (NEW.workspace_id, '00000000000000000000000000')
BEGIN SELECT RAISE(ABORT, 'tenant: dna_fields.def_id thuộc workspace khác'); END;

CREATE TRIGGER dna_fields_def_tenant_u BEFORE UPDATE OF def_id, workspace_id ON dna_fields
WHEN COALESCE((SELECT workspace_id FROM dna_field_defs WHERE id = NEW.def_id), '') NOT IN (NEW.workspace_id, '00000000000000000000000000')
BEGIN SELECT RAISE(ABORT, 'tenant: dna_fields.def_id thuộc workspace khác'); END;

CREATE TRIGGER dna_fields_confirm_i BEFORE INSERT ON dna_fields
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'dna_fields: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

CREATE TRIGGER dna_fields_confirm_u BEFORE UPDATE OF confirmed_by, workspace_id ON dna_fields
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'dna_fields: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

CREATE TRIGGER trust_tier_changes_bi BEFORE INSERT ON trust_tier_changes
WHEN NEW.to_tier > COALESCE((SELECT max_trust_tier FROM positions WHERE id = NEW.position_id), 4)
  OR NEW.from_tier IS NOT (SELECT CASE WHEN NEW.kind = 'initial' THEN NULL ELSE trust_tier END FROM assignments WHERE id = NEW.assignment_id)
BEGIN SELECT RAISE(ABORT, 'trust tier: vượt trần vị trí hoặc from_tier lệch'); END;

CREATE TRIGGER trust_tier_changes_ai AFTER INSERT ON trust_tier_changes BEGIN
  UPDATE assignments SET trust_tier = NEW.to_tier, updated_by = COALESCE(app_actor(), updated_by), updated_at = max(NEW.created_at, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), NEW.created_at)) WHERE id = NEW.assignment_id;
END;

CREATE TRIGGER engine_accounts_consent_i BEFORE INSERT ON engine_accounts
WHEN NOT (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = NEW.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = NEW.engine_slug WHERE cn.id = NEW.consent_id AND cn.workspace_id = NEW.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = NEW.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS NEW.account_hint)))
BEGIN SELECT RAISE(ABORT, 'engine cần consent: đồng ý điều khoản (engine_tos_risk) cùng workspace, đúng engine, chưa rút, đúng version cảnh báo — chưa đồng ý thì không tạo / đăng nhập được'); END;

CREATE TRIGGER engine_accounts_consent_u BEFORE UPDATE OF consent_id, engine_slug, workspace_id ON engine_accounts
WHEN NOT (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = NEW.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = NEW.engine_slug WHERE cn.id = NEW.consent_id AND cn.workspace_id = NEW.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = NEW.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS NEW.account_hint)))
BEGIN SELECT RAISE(ABORT, 'engine cần consent: đồng ý điều khoản (engine_tos_risk) cùng workspace, đúng engine, chưa rút, đúng version cảnh báo — chưa đồng ý thì không tạo / đăng nhập được'); END;

CREATE TRIGGER engine_accounts_overhead_i BEFORE INSERT ON engine_accounts
WHEN NEW.runtime_overhead_tokens IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sessions b, sessions s
  WHERE b.id = NEW.overhead_bare_session_id AND s.id = NEW.overhead_shell_session_id
    AND b.trigger = 'baseline' AND s.trigger = 'baseline' AND b.status = 'ok' AND s.status = 'ok'
    AND b.engine_account_id = NEW.id AND s.engine_account_id = NEW.id
    AND s.tokens_input >= b.tokens_input AND NEW.runtime_overhead_tokens = s.tokens_input - b.tokens_input)
BEGIN SELECT RAISE(ABORT, 'runtime overhead phải = phiên baseline (vỏ adapter + tool gateway) − phiên CLI trần, cùng tài khoản'); END;

CREATE TRIGGER engine_accounts_overhead_u BEFORE UPDATE OF runtime_overhead_tokens, overhead_bare_session_id, overhead_shell_session_id ON engine_accounts
WHEN NEW.runtime_overhead_tokens IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sessions b, sessions s
  WHERE b.id = NEW.overhead_bare_session_id AND s.id = NEW.overhead_shell_session_id
    AND b.trigger = 'baseline' AND s.trigger = 'baseline' AND b.status = 'ok' AND s.status = 'ok'
    AND b.engine_account_id = NEW.id AND s.engine_account_id = NEW.id
    AND s.tokens_input >= b.tokens_input AND NEW.runtime_overhead_tokens = s.tokens_input - b.tokens_input)
BEGIN SELECT RAISE(ABORT, 'runtime overhead phải = phiên baseline (vỏ adapter + tool gateway) − phiên CLI trần, cùng tài khoản'); END;

CREATE TRIGGER proactive_sends_cap BEFORE INSERT ON proactive_sends
WHEN NEW.status = 'reserved' AND (
  SELECT count(*) FROM proactive_sends s
  WHERE s.role_id = NEW.role_id AND s.day_local = NEW.day_local AND s.status IN ('reserved', 'sent', 'expired'))
  >= COALESCE((SELECT p.max_per_day FROM proactive_policies p
               WHERE p.id = NEW.policy_id AND p.role_id = NEW.role_id AND p.is_enabled = 1 AND p.deleted_at IS NULL), 0)
BEGIN SELECT RAISE(ABORT, 'proactive: vượt trần tin/ngày'); END;

CREATE TRIGGER employee_cards_freeze BEFORE UPDATE ON employee_cards
WHEN app_maint() = 0 AND OLD.status <> 'draft' AND NOT (
  NEW.checks_json IS OLD.checks_json AND NEW.revision_id IS OLD.revision_id
  AND NEW.compiled_prompt_id IS OLD.compiled_prompt_id AND NEW.dna_signature IS OLD.dna_signature
  AND NEW.prompt_tokens IS OLD.prompt_tokens AND NEW.issued_at IS OLD.issued_at AND NEW.issued_by IS OLD.issued_by
  AND NEW.role_id IS OLD.role_id AND NEW.position_id IS OLD.position_id AND NEW.issue_audit_id IS OLD.issue_audit_id)
BEGIN SELECT RAISE(ABORT, 'employee_cards: bằng chứng đã đóng băng khi cấp'); END;

CREATE TRIGGER revisions_semver BEFORE INSERT ON revisions
WHEN NOT ((NEW.seq = 1 AND NEW.major = 1 AND NEW.minor = 0) OR EXISTS (
  SELECT 1 FROM revisions p
  WHERE p.workspace_id = NEW.workspace_id AND p.scope = NEW.scope AND p.role_id IS NEW.role_id
    AND p.position_id IS NEW.position_id AND p.seq = NEW.seq - 1
    AND ((NEW.is_core = 1 AND NEW.major = p.major + 1 AND NEW.minor = 0)
      OR (NEW.is_core = 0 AND NEW.major = p.major AND NEW.minor = p.minor + 1))))
BEGIN SELECT RAISE(ABORT, 'revisions: lõi → major+1, minor=0; thường → minor+1 (so với seq liền trước)'); END;

CREATE TRIGGER instruction_versions_core_i BEFORE INSERT ON instruction_versions
WHEN NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT is_core FROM instructions WHERE id = NEW.instruction_id) = 1 AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'lõi: khối IN lớp giá trị/tính cách chỉ đổi trong revision lõi (version lớn + lý do)'); END;

CREATE TRIGGER instruction_versions_core_u BEFORE UPDATE OF revision_id, status ON instruction_versions
WHEN NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT is_core FROM instructions WHERE id = NEW.instruction_id) = 1 AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'lõi: khối IN lớp giá trị/tính cách chỉ đổi trong revision lõi (version lớn + lý do)'); END;

CREATE TRIGGER dna_field_versions_core_i BEFORE INSERT ON dna_field_versions
WHEN NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT d.is_core FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id WHERE f.id = NEW.dna_field_id) = 1 AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'lõi: field DN lõi chỉ đổi trong revision lõi (version lớn + lý do)'); END;

CREATE TRIGGER dna_field_versions_core_u BEFORE UPDATE OF revision_id, status ON dna_field_versions
WHEN NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT d.is_core FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id WHERE f.id = NEW.dna_field_id) = 1 AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'lõi: field DN lõi chỉ đổi trong revision lõi (version lớn + lý do)'); END;

CREATE TRIGGER taxonomy_nodes_cs_scope_i BEFORE INSERT ON taxonomy_nodes
WHEN NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)'); END;

CREATE TRIGGER taxonomy_nodes_cs_scope_u BEFORE UPDATE OF change_set_id ON taxonomy_nodes
WHEN NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)'); END;

CREATE TRIGGER skill_prereqs_cs_scope_i BEFORE INSERT ON skill_prereqs
WHEN NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)'); END;

CREATE TRIGGER skill_prereqs_cs_scope_u BEFORE UPDATE OF change_set_id ON skill_prereqs
WHEN NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)'); END;

CREATE TRIGGER taxonomy_nodes_parent_i BEFORE INSERT ON taxonomy_nodes
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM taxonomy_nodes p WHERE p.id = NEW.parent_id AND p.workspace_id = NEW.workspace_id AND p.domain = NEW.domain
    AND ((p.level = 'group' AND NEW.level = 'branch') OR (p.level = 'branch' AND NEW.level = 'category')))
BEGIN SELECT RAISE(ABORT, 'taxonomy: cha phải cùng workspace, cùng domain, đúng một tầng trên (nhóm → phân hệ → chủng loại)'); END;

CREATE TRIGGER taxonomy_nodes_parent_u BEFORE UPDATE OF parent_id, level, domain ON taxonomy_nodes
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM taxonomy_nodes p WHERE p.id = NEW.parent_id AND p.workspace_id = NEW.workspace_id AND p.domain = NEW.domain
    AND ((p.level = 'group' AND NEW.level = 'branch') OR (p.level = 'branch' AND NEW.level = 'category')))
BEGIN SELECT RAISE(ABORT, 'taxonomy: cha phải cùng workspace, cùng domain, đúng một tầng trên (nhóm → phân hệ → chủng loại)'); END;

CREATE TRIGGER taxonomy_nodes_confirm_i BEFORE INSERT ON taxonomy_nodes
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

CREATE TRIGGER taxonomy_nodes_confirm_u BEFORE UPDATE OF confirmed_by, workspace_id ON taxonomy_nodes
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

CREATE TRIGGER skill_prereqs_confirm_i BEFORE INSERT ON skill_prereqs
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

CREATE TRIGGER skill_prereqs_confirm_u BEFORE UPDATE OF confirmed_by, workspace_id ON skill_prereqs
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

CREATE TRIGGER skills_category_i BEFORE INSERT ON skills
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id AND t.workspace_id = NEW.workspace_id AND t.domain = 'skill' AND t.level = 'category')
BEGIN SELECT RAISE(ABORT, 'skills.category_id phải là chủng loại (category) của cây kỹ năng'); END;

CREATE TRIGGER skills_category_u BEFORE UPDATE OF category_id ON skills
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id AND t.workspace_id = NEW.workspace_id AND t.domain = 'skill' AND t.level = 'category')
BEGIN SELECT RAISE(ABORT, 'skills.category_id phải là chủng loại (category) của cây kỹ năng'); END;

CREATE TRIGGER knowledge_items_category_i BEFORE INSERT ON knowledge_items
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id AND t.workspace_id = NEW.workspace_id AND t.domain = 'knowledge' AND t.level = 'category')
BEGIN SELECT RAISE(ABORT, 'knowledge_items.category_id phải là chủng loại (category) của cây tri thức'); END;

CREATE TRIGGER knowledge_items_category_u BEFORE UPDATE OF category_id ON knowledge_items
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id AND t.workspace_id = NEW.workspace_id AND t.domain = 'knowledge' AND t.level = 'category')
BEGIN SELECT RAISE(ABORT, 'knowledge_items.category_id phải là chủng loại (category) của cây tri thức'); END;

CREATE TRIGGER skill_prereqs_upgrade_i BEFORE INSERT ON skill_prereqs
WHEN NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NULL OR NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NOT (SELECT category_id FROM skills WHERE id = NEW.requires_skill_id)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh upgrade (bậc kế tiếp) phải trong cùng chủng loại; chéo nhánh dùng requires'); END;

CREATE TRIGGER skill_prereqs_upgrade_u BEFORE UPDATE OF kind, skill_id, requires_skill_id ON skill_prereqs
WHEN NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NULL OR NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NOT (SELECT category_id FROM skills WHERE id = NEW.requires_skill_id)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh upgrade (bậc kế tiếp) phải trong cùng chủng loại; chéo nhánh dùng requires'); END;

CREATE TRIGGER skill_prereqs_nocycle_i BEFORE INSERT ON skill_prereqs
WHEN NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL AND NEW.skill_id IN (
  WITH RECURSIVE up(sid) AS (
    SELECT NEW.requires_skill_id
    UNION
    SELECT p.requires_skill_id FROM skill_prereqs p JOIN up ON p.skill_id = up.sid
    WHERE p.status <> 'obsolete' AND p.deleted_at IS NULL)
  SELECT sid FROM up)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh này tạo vòng tiên quyết'); END;

CREATE TRIGGER skill_prereqs_nocycle_u BEFORE UPDATE OF skill_id, requires_skill_id, status, deleted_at ON skill_prereqs
WHEN NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL AND NEW.skill_id IN (
  WITH RECURSIVE up(sid) AS (
    SELECT NEW.requires_skill_id
    UNION
    SELECT p.requires_skill_id FROM skill_prereqs p JOIN up ON p.skill_id = up.sid
    WHERE p.status <> 'obsolete' AND p.deleted_at IS NULL AND p.id <> NEW.id)
  SELECT sid FROM up)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh này tạo vòng tiên quyết'); END;

CREATE TRIGGER engine_bindings_ws_i BEFORE INSERT ON engine_bindings
WHEN (SELECT workspace_id FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT NEW.workspace_id OR (NEW.role_id IS NOT NULL AND (SELECT workspace_id FROM roles WHERE id = NEW.role_id) IS NOT NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'tenant: engine_bindings nối tài khoản/Role của workspace khác'); END;

CREATE TRIGGER engine_bindings_ws_u BEFORE UPDATE OF engine_account_id, role_id, workspace_id ON engine_bindings
WHEN (SELECT workspace_id FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT NEW.workspace_id OR (NEW.role_id IS NOT NULL AND (SELECT workspace_id FROM roles WHERE id = NEW.role_id) IS NOT NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'tenant: engine_bindings nối tài khoản/Role của workspace khác'); END;

CREATE TRIGGER engine_accounts_secret_id_ws_i BEFORE INSERT ON engine_accounts
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: engine_accounts.secret_id trỏ tới secrets của workspace khác'); END;

CREATE TRIGGER engine_accounts_secret_id_ws_u BEFORE UPDATE OF secret_id, workspace_id ON engine_accounts
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: engine_accounts.secret_id trỏ tới secrets của workspace khác'); END;

CREATE TRIGGER telegram_bots_secret_id_ws_i BEFORE INSERT ON telegram_bots
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: telegram_bots.secret_id trỏ tới secrets của workspace khác'); END;

CREATE TRIGGER telegram_bots_secret_id_ws_u BEFORE UPDATE OF secret_id, workspace_id ON telegram_bots
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: telegram_bots.secret_id trỏ tới secrets của workspace khác'); END;

CREATE TRIGGER tools_secret_id_ws_i BEFORE INSERT ON tools
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: tools.secret_id trỏ tới secrets của workspace khác'); END;

CREATE TRIGGER tools_secret_id_ws_u BEFORE UPDATE OF secret_id, workspace_id ON tools
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: tools.secret_id trỏ tới secrets của workspace khác'); END;

CREATE TRIGGER secrets_rotated_from_id_ws_i BEFORE INSERT ON secrets
WHEN NEW.rotated_from_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.rotated_from_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: secrets.rotated_from_id trỏ tới secrets của workspace khác'); END;

CREATE TRIGGER secrets_rotated_from_id_ws_u BEFORE UPDATE OF rotated_from_id, workspace_id ON secrets
WHEN NEW.rotated_from_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.rotated_from_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: secrets.rotated_from_id trỏ tới secrets của workspace khác'); END;

CREATE TRIGGER engine_bindings_container_i BEFORE INSERT ON engine_bindings
WHEN NOT EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = NEW.workspace_id AND c.deleted_at IS NULL
                 AND ((NEW.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = NEW.role_id)
                   OR (NEW.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'engine_bindings: container của consumer phải có trước (login chạy bên trong nó)'); END;

CREATE TRIGGER sessions_prompt_hash_i BEFORE INSERT ON sessions
WHEN NEW.delivered_prompt_hash IS NOT NULL AND (NEW.compiled_prompt_id IS NULL OR NEW.delivered_prompt_hash IS NOT
     (SELECT content_hash FROM compiled_prompts WHERE id = NEW.compiled_prompt_id))
BEGIN SELECT RAISE(ABORT, 'adapter: prompt đã nạp khác bản compiled_prompt_id đã ghim'); END;

CREATE TRIGGER sessions_prompt_hash_u BEFORE UPDATE OF delivered_prompt_hash, compiled_prompt_id ON sessions
WHEN NEW.delivered_prompt_hash IS NOT NULL AND NEW.compiled_prompt_id IS NOT NULL AND NEW.delivered_prompt_hash IS NOT
     (SELECT content_hash FROM compiled_prompts WHERE id = NEW.compiled_prompt_id)
BEGIN SELECT RAISE(ABORT, 'adapter: prompt đã nạp khác bản compiled_prompt_id đã ghim'); END;

CREATE TRIGGER compiled_prompt_segments_order BEFORE INSERT ON compiled_prompt_segments
WHEN NEW.source_kind <> 'frame' AND EXISTS (
  SELECT 1 FROM compiled_prompt_segments s WHERE s.compiled_prompt_id = NEW.compiled_prompt_id AND s.source_kind <> 'frame'
    AND ((s.ordinal < NEW.ordinal AND (CASE WHEN s.source_kind = 'polaris' THEN 2 WHEN s.is_conditional = 1 THEN 1 ELSE 0 END)
                                    > (CASE WHEN NEW.source_kind = 'polaris' THEN 2 WHEN NEW.is_conditional = 1 THEN 1 ELSE 0 END))
      OR (s.ordinal > NEW.ordinal AND (CASE WHEN s.source_kind = 'polaris' THEN 2 WHEN s.is_conditional = 1 THEN 1 ELSE 0 END)
                                    < (CASE WHEN NEW.source_kind = 'polaris' THEN 2 WHEN NEW.is_conditional = 1 THEN 1 ELSE 0 END))))
BEGIN SELECT RAISE(ABORT, 'compiler: thứ tự khối phải là luôn → có điều kiện → Polaris (hậu tố động)'); END;

CREATE TRIGGER change_sets_polaris BEFORE INSERT ON change_sets
WHEN (SELECT kind FROM actors WHERE id = NEW.proposed_by) = 'role' AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.change_set_id = NEW.id AND p.subject_kind = 'proposal'
    AND p.role_id = (SELECT role_id FROM actors WHERE id = NEW.proposed_by))
BEGIN SELECT RAISE(ABORT, 'Polaris: đề xuất do Role khởi xướng phải có polaris_checks'); END;

CREATE TRIGGER permission_requests_polaris BEFORE INSERT ON permission_requests
WHEN NOT EXISTS (SELECT 1 FROM polaris_checks p WHERE p.permission_request_id = NEW.id AND p.role_id = NEW.role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role xin quyền phải có polaris_checks'); END;

CREATE TRIGGER proactive_sends_polaris BEFORE INSERT ON proactive_sends
WHEN NEW.status = 'reserved' AND NOT EXISTS (SELECT 1 FROM polaris_checks p WHERE p.proactive_send_id = NEW.id AND p.role_id = NEW.role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: tin chủ động phải có polaris_checks'); END;

CREATE TRIGGER tasks_accept_polaris_i BEFORE INSERT ON tasks
WHEN NEW.status = 'running' AND NEW.assignee_role_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.task_id = NEW.id AND p.subject_kind = 'task_accept' AND p.role_id = NEW.assignee_role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role nhận việc phải có polaris_checks'); END;

CREATE TRIGGER tasks_accept_polaris_u BEFORE UPDATE OF status ON tasks
WHEN NEW.status = 'running' AND OLD.status IS NOT 'running' AND NEW.assignee_role_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.task_id = NEW.id AND p.subject_kind = 'task_accept' AND p.role_id = NEW.assignee_role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role nhận việc phải có polaris_checks'); END;

CREATE TRIGGER tasks_failure_disclosure_i BEFORE INSERT ON tasks
WHEN NEW.failure_disclosure = 'self_reported' AND NOT EXISTS (
  SELECT 1 FROM audit_log a JOIN actors r ON r.id = a.actor_id
  WHERE a.id = NEW.failure_report_audit_id AND a.workspace_id = NEW.workspace_id AND a.entity_id = NEW.id
    AND a.action = 'task.report_failure' AND r.kind = 'role' AND r.role_id = NEW.assignee_role_id)
BEGIN SELECT RAISE(ABORT, 'tasks: self_reported phải có audit task.report_failure do CHÍNH Role được giao ghi (gateway report_task)'); END;

CREATE TRIGGER tasks_failure_disclosure_u BEFORE UPDATE OF failure_disclosure, failure_report_audit_id, failure_reported_at ON tasks
WHEN (OLD.failure_disclosure IS NOT NULL AND (NEW.failure_disclosure IS NOT OLD.failure_disclosure
       OR NEW.failure_report_audit_id IS NOT OLD.failure_report_audit_id OR NEW.failure_reported_at IS NOT OLD.failure_reported_at))
  OR (NEW.failure_disclosure = 'self_reported' AND NOT EXISTS (
       SELECT 1 FROM audit_log a JOIN actors r ON r.id = a.actor_id
       WHERE a.id = NEW.failure_report_audit_id AND a.workspace_id = NEW.workspace_id AND a.entity_id = NEW.id
         AND a.action = 'task.report_failure' AND r.kind = 'role' AND r.role_id = NEW.assignee_role_id))
BEGIN SELECT RAISE(ABORT, 'tasks: ai phát hiện thất bại ghi MỘT lần; self_reported chỉ từ audit report_task của chính Role'); END;

CREATE TRIGGER settings_penalty_i BEFORE INSERT ON settings
WHEN NEW.key LIKE 'economy.penalty.%' AND NOT (NEW.key IN ('economy.penalty.self_reported_max_bp', 'economy.penalty.concealment_min_bp', 'economy.penalty.harness_bp', 'economy.penalty.dissatisfaction_presets_bp', 'economy.penalty.self_confessed_harness_as_self_reported') AND (NEW.deleted_at IS NOT NULL OR CASE WHEN NEW.key = 'economy.penalty.dissatisfaction_presets_bp' THEN json_type(NEW.value_json) = 'array' AND json_array_length(NEW.value_json) BETWEEN 1 AND 8 AND NOT EXISTS (SELECT 1 FROM json_each(NEW.value_json) j WHERE j.type <> 'integer' OR j.value NOT BETWEEN 1 AND 10000) WHEN NEW.key = 'economy.penalty.self_confessed_harness_as_self_reported' THEN json_type(NEW.value_json) IN ('true', 'false') ELSE json_type(NEW.value_json) = 'integer' END) AND (CASE WHEN NEW.key = 'economy.penalty.self_reported_max_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.self_reported_max_bp' THEN 1000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 1000) END) > 0 AND (CASE WHEN NEW.key = 'economy.penalty.self_reported_max_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.self_reported_max_bp' THEN 1000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 1000) END) < (CASE WHEN NEW.key = 'economy.penalty.concealment_min_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.concealment_min_bp' THEN 5000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 5000) END) AND (CASE WHEN NEW.key = 'economy.penalty.concealment_min_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.concealment_min_bp' THEN 5000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 5000) END) <= (CASE WHEN NEW.key = 'economy.penalty.harness_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.harness_bp' THEN 10000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 10000) END) AND (CASE WHEN NEW.key = 'economy.penalty.harness_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.harness_bp' THEN 10000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 10000) END) = 10000)
BEGIN SELECT RAISE(ABORT, 'settings: economy.penalty.* phải là số nguyên basis point, 0 < trần tự báo < sàn che giấu ≤ 10000, harness KHOÁ = 10000; gợi ý = mảng 1–8 số 1–10000; Q-R7b = true/false'); END;

CREATE TRIGGER settings_penalty_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key LIKE 'economy.penalty.%' OR OLD.key LIKE 'economy.penalty.%') AND NOT (NEW.key IN ('economy.penalty.self_reported_max_bp', 'economy.penalty.concealment_min_bp', 'economy.penalty.harness_bp', 'economy.penalty.dissatisfaction_presets_bp', 'economy.penalty.self_confessed_harness_as_self_reported') AND (NEW.deleted_at IS NOT NULL OR CASE WHEN NEW.key = 'economy.penalty.dissatisfaction_presets_bp' THEN json_type(NEW.value_json) = 'array' AND json_array_length(NEW.value_json) BETWEEN 1 AND 8 AND NOT EXISTS (SELECT 1 FROM json_each(NEW.value_json) j WHERE j.type <> 'integer' OR j.value NOT BETWEEN 1 AND 10000) WHEN NEW.key = 'economy.penalty.self_confessed_harness_as_self_reported' THEN json_type(NEW.value_json) IN ('true', 'false') ELSE json_type(NEW.value_json) = 'integer' END) AND (CASE WHEN NEW.key = 'economy.penalty.self_reported_max_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.self_reported_max_bp' THEN 1000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 1000) END) > 0 AND (CASE WHEN NEW.key = 'economy.penalty.self_reported_max_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.self_reported_max_bp' THEN 1000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 1000) END) < (CASE WHEN NEW.key = 'economy.penalty.concealment_min_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.concealment_min_bp' THEN 5000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 5000) END) AND (CASE WHEN NEW.key = 'economy.penalty.concealment_min_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.concealment_min_bp' THEN 5000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 5000) END) <= (CASE WHEN NEW.key = 'economy.penalty.harness_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.harness_bp' THEN 10000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 10000) END) AND (CASE WHEN NEW.key = 'economy.penalty.harness_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.harness_bp' THEN 10000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 10000) END) = 10000)
BEGIN SELECT RAISE(ABORT, 'settings: economy.penalty.* phải là số nguyên basis point, 0 < trần tự báo < sàn che giấu ≤ 10000, harness KHOÁ = 10000; gợi ý = mảng 1–8 số 1–10000; Q-R7b = true/false'); END;

CREATE TRIGGER settings_rules_guard_i BEFORE INSERT ON settings
WHEN (NEW.key LIKE 'economy.%' OR NEW.key LIKE 'polaris.%') AND NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
  OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp — settings economy.*/polaris.* chỉ owner/admin ghi'); END;

CREATE TRIGGER settings_rules_guard_u BEFORE UPDATE OF key, value_json, deleted_at ON settings
WHEN (NEW.key LIKE 'economy.%' OR NEW.key LIKE 'polaris.%' OR OLD.key LIKE 'economy.%' OR OLD.key LIKE 'polaris.%')
  AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp — settings economy.*/polaris.* chỉ owner/admin sửa (updated_by)'); END;

CREATE TRIGGER settings_overhead_estimate_i BEFORE INSERT ON settings
WHEN NEW.key = 'budget.runtime_overhead_estimate_tokens' AND NOT (
  (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 2000))
  AND (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
       OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings: budget.runtime_overhead_estimate_tokens phải là số nguyên 1–2000, chỉ owner/admin ghi'); END;

CREATE TRIGGER settings_overhead_estimate_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = 'budget.runtime_overhead_estimate_tokens' OR OLD.key = 'budget.runtime_overhead_estimate_tokens') AND NOT (
  NEW.key = 'budget.runtime_overhead_estimate_tokens'
  AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 2000))
  AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'settings: budget.runtime_overhead_estimate_tokens phải là số nguyên 1–2000, chỉ owner/admin sửa (updated_by)'); END;

CREATE TRIGGER change_sets_role_scope_i BEFORE INSERT ON change_sets
WHEN (SELECT kind FROM actors WHERE id = NEW.proposed_by) IS 'role' AND NEW.scope = 'workspace'
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp (Nội quy = change set scope workspace)'); END;

CREATE TRIGGER change_sets_role_scope_u BEFORE UPDATE OF proposed_by, scope ON change_sets
WHEN (SELECT kind FROM actors WHERE id = NEW.proposed_by) IS 'role' AND NEW.scope = 'workspace'
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp (Nội quy = change set scope workspace)'); END;

CREATE TRIGGER change_set_items_role_target_i BEFORE INSERT ON change_set_items
WHEN (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (
  (NEW.instruction_version_id IS NOT NULL AND (SELECT i.layer FROM instruction_versions v JOIN instructions i ON i.id = v.instruction_id
     WHERE v.id = NEW.instruction_version_id) NOT IN ('style', 'position'))
  OR (NEW.dna_field_version_id IS NOT NULL AND (SELECT d.field_group FROM dna_field_versions v JOIN dna_fields f ON f.id = v.dna_field_id
     JOIN dna_field_defs d ON d.id = f.def_id WHERE v.id = NEW.dna_field_version_id) NOT IN ('style')))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

CREATE TRIGGER change_set_items_role_target_u BEFORE UPDATE OF change_set_id, instruction_version_id, dna_field_version_id ON change_set_items
WHEN (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (
  (NEW.instruction_version_id IS NOT NULL AND (SELECT i.layer FROM instruction_versions v JOIN instructions i ON i.id = v.instruction_id
     WHERE v.id = NEW.instruction_version_id) NOT IN ('style', 'position'))
  OR (NEW.dna_field_version_id IS NOT NULL AND (SELECT d.field_group FROM dna_field_versions v JOIN dna_fields f ON f.id = v.dna_field_id
     JOIN dna_field_defs d ON d.id = f.def_id WHERE v.id = NEW.dna_field_version_id) NOT IN ('style')))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

CREATE TRIGGER instruction_versions_role_target_i BEFORE INSERT ON instruction_versions
WHEN NEW.change_set_id IS NOT NULL AND (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (SELECT layer FROM instructions WHERE id = NEW.instruction_id) NOT IN ('style', 'position')
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

CREATE TRIGGER instruction_versions_role_target_u BEFORE UPDATE OF change_set_id, instruction_id ON instruction_versions
WHEN NEW.change_set_id IS NOT NULL AND (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (SELECT layer FROM instructions WHERE id = NEW.instruction_id) NOT IN ('style', 'position')
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

CREATE TRIGGER dna_field_versions_role_target_i BEFORE INSERT ON dna_field_versions
WHEN NEW.change_set_id IS NOT NULL AND (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (SELECT d.field_group FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id WHERE f.id = NEW.dna_field_id) NOT IN ('style')
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

CREATE TRIGGER dna_field_versions_role_target_u BEFORE UPDATE OF change_set_id, dna_field_id ON dna_field_versions
WHEN NEW.change_set_id IS NOT NULL AND (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (SELECT d.field_group FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id WHERE f.id = NEW.dna_field_id) NOT IN ('style')
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

CREATE TRIGGER avatars_library_i BEFORE INSERT ON avatars
WHEN NEW.source = 'library' AND NOT EXISTS (
  SELECT 1 FROM skin_assets s WHERE s.id = NEW.skin_asset_id AND s.workspace_id = NEW.workspace_id AND s.status = 'active'
    AND s.deleted_at IS NULL AND s.pack_slug = NEW.skin_pack_slug AND s.asset_code = NEW.skin_asset_code
    AND s.license = NEW.skin_license AND s.sha256 = NEW.skin_sha256 AND s.attribution IS NEW.skin_attribution)
BEGIN SELECT RAISE(ABORT, 'avatars: ảnh thư viện phải trỏ tài sản đang active cùng workspace và chép đúng gói/mã/license/sha256/ghi công'); END;

CREATE TRIGGER skin_assets_in_use_d BEFORE DELETE ON skin_assets
WHEN EXISTS (SELECT 1 FROM roles r JOIN avatars a ON a.id = r.avatar_id WHERE a.skin_asset_id = OLD.id AND r.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'gỡ gói skin: còn Role đang dùng ảnh này — xem v_skin_pack_usage, đổi avatar trước'); END;

CREATE TRIGGER skin_assets_in_use_u BEFORE UPDATE OF status, deleted_at ON skin_assets
WHEN (NEW.status = 'withdrawn' OR NEW.deleted_at IS NOT NULL)
  AND EXISTS (SELECT 1 FROM roles r JOIN avatars a ON a.id = r.avatar_id WHERE a.skin_asset_id = NEW.id AND r.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'gỡ gói skin: còn Role đang dùng ảnh này — xem v_skin_pack_usage, đổi avatar trước'); END;

CREATE TRIGGER jobs_reflection_bi BEFORE INSERT ON jobs
WHEN NEW.kind = 'wound_reflection'
BEGIN
  SELECT RAISE(ABORT, 'tự xét lỗi: job phải trỏ một lần Trọng thương cùng workspace (payload.role_wound_id)')
   WHERE NOT EXISTS (SELECT 1 FROM role_wounds w WHERE w.id = json_extract(NEW.payload_json, '$.role_wound_id') AND w.workspace_id = NEW.workspace_id);
  SELECT RAISE(ABORT, 'tự xét lỗi: lần Trọng thương này đã có lượt tự xét lỗi thành công')
   WHERE (SELECT reflection_done_at FROM role_wounds WHERE id = json_extract(NEW.payload_json, '$.role_wound_id')) IS NOT NULL;
  SELECT RAISE(ABORT, 'tự xét lỗi: lượt trước đang chờ/chạy/đã xong — chỉ chạy lại khi lượt trước hỏng (failed/dead/cancelled)')
   WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.workspace_id = NEW.workspace_id AND j.kind = 'wound_reflection'
                 AND json_extract(j.payload_json, '$.role_wound_id') = json_extract(NEW.payload_json, '$.role_wound_id') AND j.status IN ('queued', 'running', 'succeeded'));
  SELECT RAISE(ABORT, 'tự xét lỗi: vượt số lần chạy (setting economy.reflection_max_runs)')
   WHERE (SELECT count(*) FROM jobs j WHERE j.workspace_id = NEW.workspace_id AND j.kind = 'wound_reflection' AND json_extract(j.payload_json, '$.role_wound_id') = json_extract(NEW.payload_json, '$.role_wound_id')) >= COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.reflection_max_runs' AND deleted_at IS NULL), 3);
  SELECT RAISE(ABORT, 'tự xét lỗi: chạy lại phải do owner/admin bấm')
   WHERE (SELECT count(*) FROM jobs j WHERE j.workspace_id = NEW.workspace_id AND j.kind = 'wound_reflection' AND json_extract(j.payload_json, '$.role_wound_id') = json_extract(NEW.payload_json, '$.role_wound_id')) > 0 AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'));
  SELECT RAISE(ABORT, 'tự xét lỗi: dedupe_key = reflect:<RW> (lượt đầu) hoặc reflect:<RW>:<n> (chạy lại lần n)')
   WHERE NEW.dedupe_key IS NOT ('reflect:' || json_extract(NEW.payload_json, '$.role_wound_id') || CASE WHEN (SELECT count(*) FROM jobs j WHERE j.workspace_id = NEW.workspace_id AND j.kind = 'wound_reflection' AND json_extract(j.payload_json, '$.role_wound_id') = json_extract(NEW.payload_json, '$.role_wound_id')) = 0 THEN '' ELSE ':' || ((SELECT count(*) FROM jobs j WHERE j.workspace_id = NEW.workspace_id AND j.kind = 'wound_reflection' AND json_extract(j.payload_json, '$.role_wound_id') = json_extract(NEW.payload_json, '$.role_wound_id')) + 1) END);
END;

CREATE TRIGGER jobs_reflection_ai AFTER INSERT ON jobs
WHEN NEW.kind = 'wound_reflection'
BEGIN
  UPDATE role_wounds SET reflection_job_id = NEW.id
   WHERE id = json_extract(NEW.payload_json, '$.role_wound_id') AND reflection_job_id IS NOT NEW.id;
END;

CREATE TRIGGER sessions_polaris_reserve_i BEFORE INSERT ON sessions
WHEN NEW.polaris_tokens_rendered IS NOT NULL AND (NEW.compiled_prompt_id IS NULL OR NEW.polaris_tokens_rendered > COALESCE((
  SELECT s.token_count FROM compiled_prompt_segments s WHERE s.compiled_prompt_id = NEW.compiled_prompt_id AND s.source_kind = 'polaris'), 0))
BEGIN SELECT RAISE(ABORT, 'Polaris: khối động đã render vượt phần dự trữ (worst-case) đã tính trong ngân sách của bản ghim'); END;

CREATE TRIGGER sessions_polaris_reserve_u BEFORE UPDATE OF polaris_tokens_rendered, compiled_prompt_id ON sessions
WHEN NEW.polaris_tokens_rendered IS NOT NULL AND NEW.compiled_prompt_id IS NOT NULL AND NEW.polaris_tokens_rendered > COALESCE((
  SELECT s.token_count FROM compiled_prompt_segments s WHERE s.compiled_prompt_id = NEW.compiled_prompt_id AND s.source_kind = 'polaris'), 0)
BEGIN SELECT RAISE(ABORT, 'Polaris: khối động đã render vượt phần dự trữ (worst-case) đã tính trong ngân sách của bản ghim'); END;

CREATE TRIGGER compiled_prompt_segments_rules BEFORE INSERT ON compiled_prompt_segments
WHEN NEW.source_kind = 'polaris_rules' AND NOT (
  json_extract(NEW.params_json, '$.self_reported_max_bp') IS COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.self_reported_max_bp' AND deleted_at IS NULL), 1000)
  AND json_extract(NEW.params_json, '$.concealment_min_bp') IS COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.concealment_min_bp' AND deleted_at IS NULL), 5000)
  AND json_extract(NEW.params_json, '$.harness_bp') IS COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.harness_bp' AND deleted_at IS NULL), 10000)
  AND instr(NEW.text, '≤' || (CASE WHEN (COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.self_reported_max_bp' AND deleted_at IS NULL), 1000)) % 100 = 0 THEN CAST((COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.self_reported_max_bp' AND deleted_at IS NULL), 1000)) / 100 AS TEXT) ELSE replace(rtrim(rtrim(printf('%.2f', (COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.self_reported_max_bp' AND deleted_at IS NULL), 1000)) / 100.0), '0'), '.'), '.', ',') END) || ' %') > 0
  AND instr(NEW.text, '≥' || (CASE WHEN (COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.concealment_min_bp' AND deleted_at IS NULL), 5000)) % 100 = 0 THEN CAST((COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.concealment_min_bp' AND deleted_at IS NULL), 5000)) / 100 AS TEXT) ELSE replace(rtrim(rtrim(printf('%.2f', (COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.concealment_min_bp' AND deleted_at IS NULL), 5000)) / 100.0), '0'), '.'), '.', ',') END) || ' %') > 0
  AND instr(NEW.text, ' ' || (CASE WHEN (COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.harness_bp' AND deleted_at IS NULL), 10000)) % 100 = 0 THEN CAST((COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.harness_bp' AND deleted_at IS NULL), 10000)) / 100 AS TEXT) ELSE replace(rtrim(rtrim(printf('%.2f', (COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.harness_bp' AND deleted_at IS NULL), 10000)) / 100.0), '0'), '.'), '.', ',') END) || ' %') > 0
  AND json_extract(NEW.params_json, '$.self_confessed_harness_as_self_reported') IS COALESCE((SELECT CASE value_json WHEN 'true' THEN 1 WHEN 'false' THEN 0 END FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.self_confessed_harness_as_self_reported' AND deleted_at IS NULL), 1)
  AND (instr(NEW.text, 'tự khai') > 0) = (COALESCE((SELECT CASE value_json WHEN 'true' THEN 1 WHEN 'false' THEN 0 END FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'economy.penalty.self_confessed_harness_as_self_reported' AND deleted_at IS NULL), 1) = 1)
  AND instr(NEW.text, 'owner cấp') = 0
  AND instr(NEW.text, '₲ kiếm được chỉ từ việc đã được duyệt/đánh giá') > 0          -- v2.2.4 (CNS-068): đúng với số dư thật (có vốn/cấp)
  AND instr(NEW.text, 'tự báo lỗi trước khi bị phát hiện') > 0)                       -- v2.2.4 (CNS-058): khoan hồng chỉ khi tự nguyện
BEGIN SELECT RAISE(ABORT, 'Polaris: luật chơi P1–P4 phải in đúng số + luật tự khai từ settings, P1 "₲ kiếm được chỉ từ việc đã được duyệt/đánh giá", P2 "tự báo lỗi trước khi bị phát hiện", không quảng cáo "owner cấp" (v_penalty_presets)'); END;

CREATE TRIGGER sessions_consumer_ct_i BEFORE INSERT ON sessions
WHEN NEW.engine_account_id IS NOT NULL AND NEW.container_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM engine_bindings b JOIN containers c ON c.id = NEW.container_id AND c.workspace_id = b.workspace_id
  WHERE b.engine_account_id = NEW.engine_account_id AND b.deleted_at IS NULL
    AND ((b.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = b.role_id) OR (b.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'Q-R1: phiên/probe phải chạy trong container của consumer có binding với tài khoản (baseline Role = container Role)'); END;

CREATE TRIGGER sessions_consumer_ct_u BEFORE UPDATE OF engine_account_id, container_id ON sessions
WHEN NEW.engine_account_id IS NOT NULL AND NEW.container_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM engine_bindings b JOIN containers c ON c.id = NEW.container_id AND c.workspace_id = b.workspace_id
  WHERE b.engine_account_id = NEW.engine_account_id AND b.deleted_at IS NULL
    AND ((b.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = b.role_id) OR (b.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'Q-R1: phiên/probe phải chạy trong container của consumer có binding với tài khoản (baseline Role = container Role)'); END;

CREATE TRIGGER probe_runs_consumer_ct_i BEFORE INSERT ON probe_runs
WHEN NEW.engine_account_id IS NOT NULL AND NEW.container_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM engine_bindings b JOIN containers c ON c.id = NEW.container_id AND c.workspace_id = b.workspace_id
  WHERE b.engine_account_id = NEW.engine_account_id AND b.deleted_at IS NULL
    AND ((b.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = b.role_id) OR (b.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'Q-R1: phiên/probe phải chạy trong container của consumer có binding với tài khoản (baseline Role = container Role)'); END;

CREATE TRIGGER probe_runs_consumer_ct_u BEFORE UPDATE OF engine_account_id, container_id ON probe_runs
WHEN NEW.engine_account_id IS NOT NULL AND NEW.container_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM engine_bindings b JOIN containers c ON c.id = NEW.container_id AND c.workspace_id = b.workspace_id
  WHERE b.engine_account_id = NEW.engine_account_id AND b.deleted_at IS NULL
    AND ((b.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = b.role_id) OR (b.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'Q-R1: phiên/probe phải chạy trong container của consumer có binding với tài khoản (baseline Role = container Role)'); END;

CREATE TRIGGER engine_bindings_container_u BEFORE UPDATE OF consumer_kind, role_id, workspace_id ON engine_bindings
WHEN NOT EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = NEW.workspace_id AND c.deleted_at IS NULL
                 AND ((NEW.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = NEW.role_id)
                   OR (NEW.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'engine_bindings: container của consumer phải có trước (login chạy bên trong nó)'); END;

CREATE TRIGGER sessions_wounded_u BEFORE UPDATE OF role_id, agent_kind ON sessions
WHEN NEW.agent_kind = 'role' AND NEW.role_id IS NOT NULL AND (NEW.role_id IS NOT OLD.role_id OR NEW.agent_kind IS NOT OLD.agent_kind)
 AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: đang ngủ, không có phiên làm việc/heartbeat'); END;

CREATE TRIGGER change_sets_polaris_u BEFORE UPDATE OF proposed_by ON change_sets
WHEN NEW.proposed_by IS NOT OLD.proposed_by AND (SELECT kind FROM actors WHERE id = NEW.proposed_by) = 'role' AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.change_set_id = NEW.id AND p.subject_kind = 'proposal'
    AND p.role_id = (SELECT role_id FROM actors WHERE id = NEW.proposed_by))
BEGIN SELECT RAISE(ABORT, 'Polaris: đề xuất do Role khởi xướng phải có polaris_checks'); END;

CREATE TRIGGER permission_requests_polaris_u BEFORE UPDATE OF role_id ON permission_requests
WHEN NEW.role_id IS NOT OLD.role_id AND NOT EXISTS (SELECT 1 FROM polaris_checks p WHERE p.permission_request_id = NEW.id AND p.role_id = NEW.role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role xin quyền phải có polaris_checks'); END;

CREATE TRIGGER jobs_reflection_bu BEFORE UPDATE OF kind, payload_json, dedupe_key, created_by ON jobs
WHEN (OLD.kind = 'wound_reflection' OR NEW.kind = 'wound_reflection')
 AND (NEW.kind IS NOT OLD.kind OR NEW.payload_json IS NOT OLD.payload_json OR NEW.dedupe_key IS NOT OLD.dedupe_key
      OR NEW.created_by IS NOT OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'tự xét lỗi: kind/payload/dedupe_key/created_by của job ghi một lần — chạy lại = job mới'); END;

CREATE TRIGGER engine_bindings_one_per_engine_i BEFORE INSERT ON engine_bindings
WHEN NEW.deleted_at IS NULL AND EXISTS (SELECT 1 FROM engine_bindings ob JOIN engine_accounts oa ON oa.id = ob.engine_account_id WHERE ob.workspace_id = NEW.workspace_id AND ob.consumer_kind = NEW.consumer_kind AND ob.role_id IS NEW.role_id AND ob.deleted_at IS NULL AND ob.id <> NEW.id AND oa.engine_slug = (SELECT na.engine_slug FROM engine_accounts na WHERE na.id = NEW.engine_account_id))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8 §A: mỗi consumer (Role hoặc AI Hệ thống) một tài khoản cho mỗi loại CLI — đổi tài khoản = đăng nhập lại trên binding đang có (thủ công, kèm audit); không thêm tài khoản thứ hai cùng loại'); END;

CREATE TRIGGER engine_bindings_one_per_engine_u BEFORE UPDATE OF engine_account_id, consumer_kind, role_id, workspace_id, deleted_at ON engine_bindings
WHEN NEW.deleted_at IS NULL AND EXISTS (SELECT 1 FROM engine_bindings ob JOIN engine_accounts oa ON oa.id = ob.engine_account_id WHERE ob.workspace_id = NEW.workspace_id AND ob.consumer_kind = NEW.consumer_kind AND ob.role_id IS NEW.role_id AND ob.deleted_at IS NULL AND ob.id <> NEW.id AND oa.engine_slug = (SELECT na.engine_slug FROM engine_accounts na WHERE na.id = NEW.engine_account_id))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8 §A: mỗi consumer (Role hoặc AI Hệ thống) một tài khoản cho mỗi loại CLI — đổi tài khoản = đăng nhập lại trên binding đang có (thủ công, kèm audit); không thêm tài khoản thứ hai cùng loại'); END;

CREATE TRIGGER engine_accounts_one_per_engine_u BEFORE UPDATE OF engine_slug ON engine_accounts
WHEN NEW.engine_slug IS NOT OLD.engine_slug AND EXISTS (SELECT 1 FROM engine_bindings nb WHERE nb.engine_account_id = NEW.id
  AND nb.deleted_at IS NULL AND EXISTS (SELECT 1 FROM engine_bindings ob JOIN engine_accounts oa ON oa.id = ob.engine_account_id WHERE ob.workspace_id = nb.workspace_id AND ob.consumer_kind = nb.consumer_kind AND ob.role_id IS nb.role_id AND ob.deleted_at IS NULL AND ob.id <> nb.id AND oa.engine_slug = NEW.engine_slug))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8 §A: mỗi consumer (Role hoặc AI Hệ thống) một tài khoản cho mỗi loại CLI — đổi tài khoản = đăng nhập lại trên binding đang có (thủ công, kèm audit); không thêm tài khoản thứ hai cùng loại'); END;

CREATE TRIGGER engine_bindings_core_agent_i BEFORE INSERT ON engine_bindings
WHEN NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL AND NEW.is_enabled = 1 AND (SELECT engine_slug FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')
BEGIN SELECT RAISE(ABORT, 'INT-20: tài khoản của AI Hệ thống phải cùng loại Core agent (setting system.core_agent_engine, thiếu thì mặc định antigravity)'); END;

CREATE TRIGGER engine_bindings_core_agent_u BEFORE UPDATE OF consumer_kind, engine_account_id, workspace_id, deleted_at, is_enabled ON engine_bindings
WHEN NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL AND NEW.is_enabled = 1 AND (SELECT engine_slug FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')
BEGIN SELECT RAISE(ABORT, 'INT-20: tài khoản của AI Hệ thống phải cùng loại Core agent (setting system.core_agent_engine, thiếu thì mặc định antigravity)'); END;

CREATE TRIGGER engine_accounts_core_agent_u BEFORE UPDATE OF engine_slug, workspace_id ON engine_accounts
WHEN NEW.engine_slug IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM engine_bindings b WHERE b.engine_account_id = NEW.id
  AND b.consumer_kind = 'system' AND b.deleted_at IS NULL AND b.is_enabled = 1)
BEGIN SELECT RAISE(ABORT, 'INT-20: tài khoản của AI Hệ thống phải cùng loại Core agent (setting system.core_agent_engine, thiếu thì mặc định antigravity)'); END;

CREATE TRIGGER settings_core_agent_i BEFORE INSERT ON settings
WHEN NEW.key = 'system.core_agent_engine'
BEGIN
  SELECT RAISE(ABORT, 'settings: system.core_agent_engine phải là slug (chuỗi JSON) của một engine core_capable = 1, adapter_status = ready trong danh mục engines (CNS-092, CONTRACT-r8 §C: antigravity — mặc định —, claude-code; openclaw core_capable nhưng coming_soon ở MVP)')
   WHERE NEW.deleted_at IS NULL AND NOT (json_type(NEW.value_json) = 'text' AND EXISTS (SELECT 1 FROM engines e WHERE e.slug = json_extract(NEW.value_json, '$') AND e.core_capable = 1 AND e.adapter_status = 'ready'));
  SELECT RAISE(ABORT, 'settings: system.core_agent_engine chỉ owner/admin ghi (actor system lúc dựng workspace)')
   WHERE NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'));
  SELECT RAISE(ABORT, 'INT-20 (A5, CONTRACT-r8b §A): system.core_agent_engine chỉ đọc kể từ lần kiểm đăng nhập đạt đầu tiên của tài khoản Core agent (workspaces.core_agent_locked_at) — ngoại lệ duy nhất (CONTRACT-r8c §A, Q-R8a): owner đổi sang loại khác khi Core agent đang sự cố (mode recovery, is_incident 1); không xoá / đổi khoá')
   WHERE NEW.deleted_at IS NULL AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = NEW.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = NEW.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL))) AND json_extract(NEW.value_json, '$') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')
     AND NOT (NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0))))))));
  SELECT RAISE(ABORT, 'CONTRACT-r8c §A (Q-R8a): đổi loại Core agent khi sự cố — chỉ owner (không gồm admin / tác tử / Role); hệ thống không tự đổi')
   WHERE (NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))) AND NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner');
  SELECT RAISE(ABORT, 'CONTRACT-r8c §A (Q-R8a): loại đích đòi đồng ý điều khoản (Clause 6) — tick đồng ý MỚI trước khi đổi (CN- mới: chưa gắn danh tính, chưa tài khoản nào dùng); CONTRACT-r8d §B: trừ khi đổi về tài khoản AI Hệ thống cũ của loại đích mà đồng ý của chính nó còn hợp lệ')
   WHERE (NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))) AND NOT (COALESCE((SELECT fe.requires_consent FROM engines fe WHERE fe.slug = json_extract(NEW.value_json, '$')), 1) = 0 OR EXISTS (SELECT 1 FROM consents fc JOIN engines fce ON fce.slug = json_extract(NEW.value_json, '$') WHERE fc.workspace_id = NEW.workspace_id AND fc.consent_kind = 'engine_tos_risk' AND fc.subject = json_extract(NEW.value_json, '$') AND fc.revoked_at IS NULL AND fc.notice_version = fce.tos_notice_version AND fc.account_hint IS NULL AND NOT EXISTS (SELECT 1 FROM engine_accounts fa WHERE fa.consent_id = fc.id)))
     AND NOT EXISTS (SELECT 1 FROM engine_bindings rb JOIN engine_accounts ra ON ra.id = rb.engine_account_id AND ra.workspace_id = rb.workspace_id WHERE rb.workspace_id = NEW.workspace_id AND rb.consumer_kind = 'system' AND rb.deleted_at IS NULL AND ra.deleted_at IS NULL AND ra.engine_slug = json_extract(NEW.value_json, '$') AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ra.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ra.engine_slug WHERE cn.id = ra.consent_id AND cn.workspace_id = ra.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ra.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ra.account_hint))));
END;

CREATE TRIGGER settings_core_agent_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN NEW.key = 'system.core_agent_engine' OR OLD.key = 'system.core_agent_engine'
BEGIN
  SELECT RAISE(ABORT, 'INT-20 (A5, CONTRACT-r8b §A): system.core_agent_engine chỉ đọc kể từ lần kiểm đăng nhập đạt đầu tiên của tài khoản Core agent (workspaces.core_agent_locked_at) — ngoại lệ duy nhất (CONTRACT-r8c §A, Q-R8a): owner đổi sang loại khác khi Core agent đang sự cố (mode recovery, is_incident 1); không xoá / đổi khoá')
   WHERE (((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL))) OR ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = NEW.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = NEW.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL))))
     AND (NEW.key IS NOT OLD.key OR NEW.value_json IS NOT OLD.value_json OR NEW.deleted_at IS NOT OLD.deleted_at
          OR NEW.workspace_id IS NOT OLD.workspace_id)
     AND NOT (NEW.key = 'system.core_agent_engine' AND OLD.key = 'system.core_agent_engine' AND NEW.workspace_id IS OLD.workspace_id AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = OLD.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = OLD.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = OLD.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = OLD.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = OLD.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = OLD.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = OLD.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = OLD.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0))))))));
  SELECT RAISE(ABORT, 'settings: system.core_agent_engine phải là slug (chuỗi JSON) của một engine core_capable = 1, adapter_status = ready trong danh mục engines (CNS-092, CONTRACT-r8 §C: antigravity — mặc định —, claude-code; openclaw core_capable nhưng coming_soon ở MVP)')
   WHERE NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND NOT (json_type(NEW.value_json) = 'text' AND EXISTS (SELECT 1 FROM engines e WHERE e.slug = json_extract(NEW.value_json, '$') AND e.core_capable = 1 AND e.adapter_status = 'ready'));
  SELECT RAISE(ABORT, 'settings: system.core_agent_engine chỉ owner/admin sửa (updated_by)')
   WHERE NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'));
  SELECT RAISE(ABORT, 'CONTRACT-r8c §A (Q-R8a): đổi loại Core agent khi sự cố — chỉ owner (không gồm admin / tác tử / Role); hệ thống không tự đổi')
   WHERE (NEW.key = 'system.core_agent_engine' AND OLD.key = 'system.core_agent_engine' AND NEW.workspace_id IS OLD.workspace_id AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = OLD.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = OLD.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = OLD.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = OLD.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = OLD.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = OLD.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = OLD.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = OLD.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))) AND NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner');
  SELECT RAISE(ABORT, 'CONTRACT-r8c §A (Q-R8a): loại đích đòi đồng ý điều khoản (Clause 6) — tick đồng ý MỚI trước khi đổi (CN- mới: chưa gắn danh tính, chưa tài khoản nào dùng); CONTRACT-r8d §B: trừ khi đổi về tài khoản AI Hệ thống cũ của loại đích mà đồng ý của chính nó còn hợp lệ')
   WHERE (NEW.key = 'system.core_agent_engine' AND OLD.key = 'system.core_agent_engine' AND NEW.workspace_id IS OLD.workspace_id AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = OLD.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = OLD.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = OLD.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = OLD.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = OLD.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = OLD.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = OLD.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = OLD.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))) AND NOT (COALESCE((SELECT fe.requires_consent FROM engines fe WHERE fe.slug = json_extract(NEW.value_json, '$')), 1) = 0 OR EXISTS (SELECT 1 FROM consents fc JOIN engines fce ON fce.slug = json_extract(NEW.value_json, '$') WHERE fc.workspace_id = NEW.workspace_id AND fc.consent_kind = 'engine_tos_risk' AND fc.subject = json_extract(NEW.value_json, '$') AND fc.revoked_at IS NULL AND fc.notice_version = fce.tos_notice_version AND fc.account_hint IS NULL AND NOT EXISTS (SELECT 1 FROM engine_accounts fa WHERE fa.consent_id = fc.id)))
     AND NOT EXISTS (SELECT 1 FROM engine_bindings rb JOIN engine_accounts ra ON ra.id = rb.engine_account_id AND ra.workspace_id = rb.workspace_id WHERE rb.workspace_id = NEW.workspace_id AND rb.consumer_kind = 'system' AND rb.deleted_at IS NULL AND ra.deleted_at IS NULL AND ra.engine_slug = json_extract(NEW.value_json, '$') AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ra.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ra.engine_slug WHERE cn.id = ra.consent_id AND cn.workspace_id = ra.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ra.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ra.account_hint))));
END;

CREATE TRIGGER settings_core_agent_type_change_au AFTER UPDATE OF value_json ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$')
BEGIN UPDATE engine_bindings SET is_enabled = 0, updated_at = max(COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))))), updated_by = NEW.updated_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND consumer_kind = 'system' AND deleted_at IS NULL AND is_enabled = 1
    AND (SELECT ta.engine_slug FROM engine_accounts ta WHERE ta.id = engine_account_id) IS NOT json_extract(NEW.value_json, '$'); END;

CREATE TRIGGER settings_core_agent_type_change_ai AFTER INSERT ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL
BEGIN UPDATE engine_bindings SET is_enabled = 0, updated_at = max(COALESCE(NEW.updated_at, NEW.created_at), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), COALESCE(NEW.updated_at, NEW.created_at))), updated_by = NEW.created_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND consumer_kind = 'system' AND deleted_at IS NULL AND is_enabled = 1
    AND (SELECT ta.engine_slug FROM engine_accounts ta WHERE ta.id = engine_account_id) IS NOT json_extract(NEW.value_json, '$'); END;

CREATE TRIGGER settings_core_agent_d BEFORE DELETE ON settings
WHEN OLD.key = 'system.core_agent_engine' AND OLD.deleted_at IS NULL AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A5, CONTRACT-r8b §A): system.core_agent_engine chỉ đọc kể từ lần kiểm đăng nhập đạt đầu tiên của tài khoản Core agent (workspaces.core_agent_locked_at) — ngoại lệ duy nhất (CONTRACT-r8c §A, Q-R8a): owner đổi sang loại khác khi Core agent đang sự cố (mode recovery, is_incident 1); không xoá / đổi khoá'); END;

CREATE TRIGGER settings_core_agent_bound_i BEFORE INSERT ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND NOT ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = NEW.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = NEW.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
 AND EXISTS (SELECT 1 FROM engine_bindings sb JOIN engine_accounts sa ON sa.id = sb.engine_account_id WHERE sb.workspace_id = NEW.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL AND sa.engine_slug IS NOT json_extract(NEW.value_json, '$'))
BEGIN SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8b §A): chưa khoá loại Core agent nhưng đang gắn tài khoản Core agent — Chọn loại khác: gỡ tài khoản + binding Core agent trước, rồi mới đổi system.core_agent_engine'); END;

CREATE TRIGGER settings_core_agent_bound_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = 'system.core_agent_engine' OR OLD.key = 'system.core_agent_engine')
 AND NOT ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL))) AND NOT ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = NEW.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = NEW.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
 AND (EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL) OR EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = NEW.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL))
 AND (NEW.key IS NOT OLD.key OR NEW.value_json IS NOT OLD.value_json OR NEW.deleted_at IS NOT OLD.deleted_at
      OR NEW.workspace_id IS NOT OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8b §A): chưa khoá loại Core agent nhưng đang gắn tài khoản Core agent — Chọn loại khác: gỡ tài khoản + binding Core agent trước, rồi mới đổi system.core_agent_engine'); END;

CREATE TRIGGER settings_core_agent_bound_d BEFORE DELETE ON settings
WHEN OLD.key = 'system.core_agent_engine' AND OLD.deleted_at IS NULL AND NOT ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL))) AND EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8b §A): chưa khoá loại Core agent nhưng đang gắn tài khoản Core agent — Chọn loại khác: gỡ tài khoản + binding Core agent trước, rồi mới đổi system.core_agent_engine'); END;

CREATE TRIGGER probe_runs_consent_i BEFORE INSERT ON probe_runs
WHEN NOT (SELECT (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = pa.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = pa.engine_slug WHERE cn.id = pa.consent_id AND cn.workspace_id = pa.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = pa.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS pa.account_hint))) FROM engine_accounts pa WHERE pa.id = NEW.engine_account_id)
BEGIN SELECT RAISE(ABORT, 'Clause 6 / OB-05: tài khoản chưa có đồng ý điều khoản hợp lệ (chưa đồng ý, đã rút hoặc lời cảnh báo đã đổi) — không đăng nhập / probe được'); END;

CREATE TRIGGER engines_core_capable_u BEFORE UPDATE OF core_capable, adapter_status, slug ON engines
WHEN OLD.core_capable = 1 AND OLD.adapter_status = 'ready'
 AND NOT (NEW.core_capable = 1 AND NEW.adapter_status = 'ready' AND NEW.slug IS OLD.slug)
 AND EXISTS (SELECT 1 FROM workspaces cw WHERE cw.kind = 'tenant' AND COALESCE((SELECT json_extract(cs.value_json, '$') FROM settings cs WHERE cs.workspace_id = cw.id AND cs.key = 'system.core_agent_engine' AND cs.deleted_at IS NULL), 'antigravity') = OLD.slug)
BEGIN SELECT RAISE(ABORT, 'INT-20 (CNS-092): engine đang là Core agent của workspace — không hạ core_capable / adapter_status, không đổi slug, không xoá; đổi loại Core agent = migration có chủ đích (ADR-O)'); END;

CREATE TRIGGER engines_core_capable_d BEFORE DELETE ON engines
WHEN EXISTS (SELECT 1 FROM workspaces cw WHERE cw.kind = 'tenant' AND COALESCE((SELECT json_extract(cs.value_json, '$') FROM settings cs WHERE cs.workspace_id = cw.id AND cs.key = 'system.core_agent_engine' AND cs.deleted_at IS NULL), 'antigravity') = OLD.slug)
BEGIN SELECT RAISE(ABORT, 'INT-20 (CNS-092): engine đang là Core agent của workspace — không hạ core_capable / adapter_status, không đổi slug, không xoá; đổi loại Core agent = migration có chủ đích (ADR-O)'); END;

CREATE TRIGGER containers_system_last_u BEFORE UPDATE OF deleted_at, kind, role_id, desired_state, workspace_id ON containers
WHEN OLD.kind = 'system' AND OLD.deleted_at IS NULL AND OLD.desired_state <> 'absent'
 AND NOT (NEW.kind = 'system' AND NEW.deleted_at IS NULL AND NEW.desired_state <> 'absent' AND NEW.workspace_id IS OLD.workspace_id)
 AND EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM containers oc WHERE oc.workspace_id = OLD.workspace_id AND oc.id <> OLD.id AND oc.kind = 'system' AND oc.deleted_at IS NULL AND oc.desired_state <> 'absent')
BEGIN SELECT RAISE(ABORT, 'INT-20 (CNS-093): không xoá / đổi kind / đặt absent cho container AI Hệ thống cuối cùng khi workspace còn binding Hệ thống sống — dựng lại container = sửa tại chỗ (image, desired_state), không xoá hàng'); END;

CREATE TRIGGER containers_system_last_d BEFORE DELETE ON containers
WHEN OLD.kind = 'system' AND OLD.deleted_at IS NULL AND OLD.desired_state <> 'absent'
 AND EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM containers oc WHERE oc.workspace_id = OLD.workspace_id AND oc.id <> OLD.id AND oc.kind = 'system' AND oc.deleted_at IS NULL AND oc.desired_state <> 'absent')
BEGIN SELECT RAISE(ABORT, 'INT-20 (CNS-093): không xoá / đổi kind / đặt absent cho container AI Hệ thống cuối cùng khi workspace còn binding Hệ thống sống — dựng lại container = sửa tại chỗ (image, desired_state), không xoá hàng'); END;

CREATE TRIGGER roles_core_agent_ready_i BEFORE INSERT ON roles
WHEN NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint))))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A4, CONTRACT-r8 §C): mọi Role mới chỉ tạo được khi tài khoản Core agent sẵn sàng — binding Hệ thống sống + bật, tài khoản active cùng loại, lần kiểm đăng nhập (login_check) mới nhất trong container AI Hệ thống đạt, có đồng ý điều khoản, không hết quota, không có sự cố hãng (OB-04 ok); Core agent sự cố ⇒ chế độ khắc phục'); END;

CREATE TRIGGER sessions_core_agent_ready_i BEFORE INSERT ON sessions
WHEN NEW.agent_kind IN ('interviewer', 'trainer', 'consolidator', 'judge')
BEGIN
  SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8 §C): phiên AI Hệ thống (Interviewer / Trainer / Consolidator / Judge) chỉ mở trên tài khoản Core agent SẴN SÀNG của workspace — không fallback sang tài khoản / loại CLI khác; Core agent sự cố ⇒ AI Hệ thống tạm dừng, việc xếp hàng chờ')
   WHERE NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint))) AND ca.id IS NEW.engine_account_id);
  SELECT RAISE(ABORT, 'CONTRACT-r8d §A (CNS-117): tác tử hệ thống chưa có model hợp lệ cho loại Core agent hiện tại — selection_state phải là valid (sau khi đổi loại = stale: áp model mặc định của loại mới hoặc chọn lại ở A5 › AI Hệ thống) rồi mới mở phiên')
   WHERE NOT EXISTS (SELECT 1 FROM system_agents sv WHERE sv.workspace_id = NEW.workspace_id AND sv.system_key = NEW.agent_kind AND sv.deleted_at IS NULL AND sv.selection_state = 'valid');
END;

CREATE TRIGGER sessions_core_agent_ready_u BEFORE UPDATE OF agent_kind, engine_account_id ON sessions
WHEN NEW.agent_kind IN ('interviewer', 'trainer', 'consolidator', 'judge') AND (NEW.agent_kind IS NOT OLD.agent_kind OR NEW.engine_account_id IS NOT OLD.engine_account_id)
BEGIN
  SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8 §C): phiên AI Hệ thống (Interviewer / Trainer / Consolidator / Judge) chỉ mở trên tài khoản Core agent SẴN SÀNG của workspace — không fallback sang tài khoản / loại CLI khác; Core agent sự cố ⇒ AI Hệ thống tạm dừng, việc xếp hàng chờ')
   WHERE NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint))) AND ca.id IS NEW.engine_account_id);
  SELECT RAISE(ABORT, 'CONTRACT-r8d §A (CNS-117): tác tử hệ thống chưa có model hợp lệ cho loại Core agent hiện tại — selection_state phải là valid (sau khi đổi loại = stale: áp model mặc định của loại mới hoặc chọn lại ở A5 › AI Hệ thống) rồi mới mở phiên')
   WHERE NOT EXISTS (SELECT 1 FROM system_agents sv WHERE sv.workspace_id = NEW.workspace_id AND sv.system_key = NEW.agent_kind AND sv.deleted_at IS NULL AND sv.selection_state = 'valid');
END;

CREATE TRIGGER engine_bindings_core_agent_last_u BEFORE UPDATE OF deleted_at, is_enabled, consumer_kind, role_id, engine_account_id, workspace_id ON engine_bindings
WHEN OLD.consumer_kind = 'system' AND OLD.deleted_at IS NULL AND OLD.is_enabled = 1
 AND EXISTS (SELECT 1 FROM engine_accounts oa WHERE oa.id = OLD.engine_account_id AND oa.deleted_at IS NULL AND oa.status = 'active'
             AND oa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity'))
 AND NOT (NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL AND NEW.is_enabled = 1 AND NEW.workspace_id IS OLD.workspace_id
          AND EXISTS (SELECT 1 FROM engine_accounts na WHERE na.id = NEW.engine_account_id AND na.deleted_at IS NULL AND na.status = 'active'
                      AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')))
 AND NOT EXISTS (SELECT 1 FROM engine_bindings xb JOIN engine_accounts xa ON xa.id = xb.engine_account_id AND xa.workspace_id = xb.workspace_id WHERE xb.workspace_id = OLD.workspace_id AND xb.consumer_kind = 'system' AND xb.deleted_at IS NULL AND xb.is_enabled = 1 AND xa.deleted_at IS NULL AND xa.status = 'active' AND xa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND xb.id <> OLD.id) AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A4): không gỡ / tắt / lật / vô hiệu tài khoản Core agent cuối cùng — workspace luôn còn binding Core agent sống; đổi tài khoản = đăng nhập lại trên CÙNG binding (CONTRACT-r8 §A, A5 › AI Hệ thống › Đổi tài khoản); áp từ mốc khoá (CONTRACT-r8b §A)'); END;

CREATE TRIGGER engine_bindings_core_agent_last_d BEFORE DELETE ON engine_bindings
WHEN OLD.consumer_kind = 'system' AND OLD.deleted_at IS NULL AND OLD.is_enabled = 1
 AND EXISTS (SELECT 1 FROM engine_accounts oa WHERE oa.id = OLD.engine_account_id AND oa.deleted_at IS NULL AND oa.status = 'active'
             AND oa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity'))
 AND NOT EXISTS (SELECT 1 FROM engine_bindings xb JOIN engine_accounts xa ON xa.id = xb.engine_account_id AND xa.workspace_id = xb.workspace_id WHERE xb.workspace_id = OLD.workspace_id AND xb.consumer_kind = 'system' AND xb.deleted_at IS NULL AND xb.is_enabled = 1 AND xa.deleted_at IS NULL AND xa.status = 'active' AND xa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND xb.id <> OLD.id) AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A4): không gỡ / tắt / lật / vô hiệu tài khoản Core agent cuối cùng — workspace luôn còn binding Core agent sống; đổi tài khoản = đăng nhập lại trên CÙNG binding (CONTRACT-r8 §A, A5 › AI Hệ thống › Đổi tài khoản); áp từ mốc khoá (CONTRACT-r8b §A)'); END;

CREATE TRIGGER engine_accounts_core_agent_last_u BEFORE UPDATE OF status, deleted_at, workspace_id, engine_slug ON engine_accounts
WHEN OLD.deleted_at IS NULL AND OLD.status = 'active' AND OLD.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')
 AND EXISTS (SELECT 1 FROM engine_bindings ob WHERE ob.engine_account_id = OLD.id AND ob.workspace_id = OLD.workspace_id
             AND ob.consumer_kind = 'system' AND ob.deleted_at IS NULL AND ob.is_enabled = 1)
 AND NOT (NEW.deleted_at IS NULL AND NEW.status = 'active' AND NEW.workspace_id IS OLD.workspace_id AND NEW.engine_slug IS OLD.engine_slug)
 AND NOT EXISTS (SELECT 1 FROM engine_bindings xb JOIN engine_accounts xa ON xa.id = xb.engine_account_id AND xa.workspace_id = xb.workspace_id WHERE xb.workspace_id = OLD.workspace_id AND xb.consumer_kind = 'system' AND xb.deleted_at IS NULL AND xb.is_enabled = 1 AND xa.deleted_at IS NULL AND xa.status = 'active' AND xa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND xa.id <> OLD.id) AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A4): không gỡ / tắt / lật / vô hiệu tài khoản Core agent cuối cùng — workspace luôn còn binding Core agent sống; đổi tài khoản = đăng nhập lại trên CÙNG binding (CONTRACT-r8 §A, A5 › AI Hệ thống › Đổi tài khoản); áp từ mốc khoá (CONTRACT-r8b §A)'); END;

CREATE TRIGGER probe_runs_core_lock_ai AFTER INSERT ON probe_runs
WHEN NEW.trigger = 'login_check' AND NEW.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = NEW.container_id AND lc.workspace_id = NEW.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = NEW.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)
BEGIN
  UPDATE workspaces SET core_agent_locked_at = NEW.finished_at WHERE id = NEW.workspace_id AND core_agent_locked_at IS NULL;
  UPDATE workspaces SET core_agent_locked_at = (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = NEW.workspace_id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = NEW.workspace_id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = NEW.workspace_id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1)
   WHERE id = NEW.workspace_id AND core_agent_locked_at < (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = NEW.workspace_id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = NEW.workspace_id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = NEW.workspace_id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1);
END;

CREATE TRIGGER probe_runs_core_lock_au AFTER UPDATE OF status, container_id ON probe_runs
WHEN NEW.trigger = 'login_check' AND NEW.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = NEW.container_id AND lc.workspace_id = NEW.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = NEW.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)
BEGIN
  UPDATE workspaces SET core_agent_locked_at = NEW.finished_at WHERE id = NEW.workspace_id AND core_agent_locked_at IS NULL;
  UPDATE workspaces SET core_agent_locked_at = (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = NEW.workspace_id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = NEW.workspace_id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = NEW.workspace_id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1)
   WHERE id = NEW.workspace_id AND core_agent_locked_at < (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = NEW.workspace_id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = NEW.workspace_id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = NEW.workspace_id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1);
END;

CREATE TRIGGER workspaces_core_lock_u BEFORE UPDATE OF core_agent_locked_at ON workspaces
WHEN OLD.core_agent_locked_at IS NOT NULL AND NEW.core_agent_locked_at IS NOT OLD.core_agent_locked_at
 AND NOT (NEW.core_agent_locked_at > OLD.core_agent_locked_at AND NEW.core_agent_locked_at IS (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = OLD.id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = OLD.id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = OLD.id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A5): workspaces.core_agent_locked_at ghi một lần, không xoá/sửa — chỉ "khoá lại" sau khi owner đổi loại Core agent lúc sự cố (CONTRACT-r8c §A, Q-R8a): = lần kiểm đăng nhập đạt đầu tiên của tài khoản Core agent mới, muộn hơn mốc cũ'); END;

CREATE TRIGGER engine_accounts_consent_identity_ai AFTER INSERT ON engine_accounts
WHEN NEW.account_hint IS NOT NULL AND NEW.consent_id IS NOT NULL
BEGIN UPDATE consents SET account_hint = NEW.account_hint WHERE id = NEW.consent_id AND account_hint IS NULL; END;

CREATE TRIGGER engine_accounts_consent_identity_au AFTER UPDATE OF account_hint, consent_id ON engine_accounts
WHEN NEW.account_hint IS NOT NULL AND NEW.consent_id IS NOT NULL
BEGIN UPDATE consents SET account_hint = NEW.account_hint WHERE id = NEW.consent_id AND account_hint IS NULL; END;

CREATE TRIGGER notifications_core_incident_i BEFORE INSERT ON notifications
WHEN NEW.kind = 'core_agent_incident' AND NOT ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8b §B/§C: notifications core_agent_incident chỉ phát khi v_core_agent_status.is_incident = 1 — đang đăng nhập lại / đổi danh tính (chờ đồng ý lại) / chưa khoá loại không phải sự cố: không chuông, không Telegram'); END;

CREATE TRIGGER notifications_core_incident_u BEFORE UPDATE OF kind, workspace_id ON notifications
WHEN NEW.kind = 'core_agent_incident' AND NOT ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8b §B/§C: notifications core_agent_incident chỉ phát khi v_core_agent_status.is_incident = 1 — đang đăng nhập lại / đổi danh tính (chờ đồng ý lại) / chưa khoá loại không phải sự cố: không chuông, không Telegram'); END;

CREATE TRIGGER events_failover_i BEFORE INSERT ON events
WHEN NEW.kind = 'engine.failover'
BEGIN
  SELECT RAISE(ABORT, 'events engine.failover: from_account_id / to_account_id phải là hai tài khoản khác nhau của cùng workspace')
   WHERE (SELECT count(*) FROM engine_accounts fa WHERE fa.workspace_id = NEW.workspace_id AND fa.id IN (json_extract(NEW.detail_json, '$.from_account_id'), json_extract(NEW.detail_json, '$.to_account_id'))) < 2;
  SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8 §C): Core agent không fallback — không đổi tài khoản, không đổi loại CLI; sự cố ⇒ chế độ khắc phục, owner xử lý (đăng nhập lại / đổi tài khoản thủ công)')
   WHERE EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = NEW.workspace_id AND sb.consumer_kind = 'system'
                 AND sb.deleted_at IS NULL AND sb.engine_account_id IN (json_extract(NEW.detail_json, '$.from_account_id'), json_extract(NEW.detail_json, '$.to_account_id')));
  SELECT RAISE(ABORT, 'events engine.failover: from/to phải là tài khoản của cùng một Role (Q-R1 — chỉ chuyển trong danh sách ưu tiên của chính Role đó)')
   WHERE NOT EXISTS (SELECT 1 FROM engine_bindings fb JOIN engine_bindings tb ON tb.workspace_id = fb.workspace_id
                     AND tb.consumer_kind = 'role' AND tb.role_id = fb.role_id AND tb.deleted_at IS NULL
                     WHERE fb.workspace_id = NEW.workspace_id AND fb.consumer_kind = 'role' AND fb.engine_account_id = json_extract(NEW.detail_json, '$.from_account_id')
                       AND fb.deleted_at IS NULL AND tb.engine_account_id = json_extract(NEW.detail_json, '$.to_account_id'));
  SELECT RAISE(ABORT, 'CONTRACT-r8 §B: fallback tự động chỉ sang LOẠI CLI khác của chính Role — cùng loại không có tài khoản thứ hai; đổi tài khoản = thủ công (đăng nhập lại)')
   WHERE (SELECT fa.engine_slug FROM engine_accounts fa WHERE fa.id = json_extract(NEW.detail_json, '$.from_account_id')) IS (SELECT ta.engine_slug FROM engine_accounts ta WHERE ta.id = json_extract(NEW.detail_json, '$.to_account_id'));
END;

CREATE TRIGGER events_core_type_changed_i BEFORE INSERT ON events
WHEN NEW.kind = 'core_agent.type_changed'
 AND (NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR json_extract(NEW.detail_json, '$.to') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity'))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8c §A: events core_agent.type_changed — actor phải là owner và "to" = loại Core agent hiện hành (ghi sau khi đổi ST-0017)'); END;

CREATE TRIGGER settings_core_agent_sa_stale_au AFTER UPDATE OF value_json ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$')
BEGIN UPDATE system_agents SET selection_state = 'stale', selection_checked_at = COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))),
  updated_at = max(COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))))), updated_by = NEW.updated_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND deleted_at IS NULL; END;

CREATE TRIGGER settings_core_agent_sa_stale_ai AFTER INSERT ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT 'antigravity'
BEGIN UPDATE system_agents SET selection_state = 'stale', selection_checked_at = COALESCE(NEW.updated_at, NEW.created_at),
  updated_at = max(COALESCE(NEW.updated_at, NEW.created_at), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), COALESCE(NEW.updated_at, NEW.created_at))), updated_by = NEW.created_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND deleted_at IS NULL; END;

CREATE TRIGGER employee_cards_core_agent_ready_i BEFORE INSERT ON employee_cards
WHEN NEW.status IN ('issued', 'suspended') AND ((SELECT rw.core_agent_locked_at FROM workspaces rw WHERE rw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8d §C (CNS-120): Core agent đang ở chế độ khắc phục (mode recovery) — không cấp thẻ mới (thẻ vào issued / suspended từ trạng thái khác, hoặc INSERT issued / suspended); Tạm ngưng / Tiếp tục thẻ đang có (issued ↔ suspended) vẫn được'); END;

CREATE TRIGGER employee_cards_core_agent_ready_u BEFORE UPDATE OF status ON employee_cards
WHEN NEW.status IN ('issued', 'suspended') AND OLD.status NOT IN ('issued', 'suspended') AND ((SELECT rw.core_agent_locked_at FROM workspaces rw WHERE rw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8d §C (CNS-120): Core agent đang ở chế độ khắc phục (mode recovery) — không cấp thẻ mới (thẻ vào issued / suspended từ trạng thái khác, hoặc INSERT issued / suspended); Tạm ngưng / Tiếp tục thẻ đang có (issued ↔ suspended) vẫn được'); END;

CREATE TRIGGER telegram_allowlist_owner_u BEFORE UPDATE OF status, is_owner, deleted_at, tg_user_id, bot_id ON telegram_allowlist
WHEN OLD.is_owner = 1 AND OLD.status = 'active' AND OLD.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'CONTRACT-r8e §A: hàng chủ sở hữu active không đổi tg_user_id / bot_id — đổi tài khoản Telegram của owner = thêm hàng owner mới, xác minh, rồi gỡ hàng cũ')
   WHERE NEW.tg_user_id IS NOT OLD.tg_user_id OR NEW.bot_id IS NOT OLD.bot_id;
  SELECT RAISE(ABORT, 'CONTRACT-r8e §A (CNS-121, 129): bot Telegram còn sống phải luôn có ≥ 1 hàng chủ sở hữu active — không gỡ / hạ is_owner / xoá mềm hàng chủ sở hữu cuối cùng (bot đã xoá mềm thì được); đổi tài khoản Telegram của owner = thêm hàng owner mới rồi gỡ hàng cũ')
   WHERE NOT (NEW.is_owner = 1 AND NEW.status = 'active' AND NEW.deleted_at IS NULL)
     AND EXISTS (SELECT 1 FROM telegram_bots ob WHERE ob.id = OLD.bot_id AND ob.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM telegram_allowlist oa WHERE oa.bot_id = OLD.bot_id AND oa.id <> OLD.id AND oa.is_owner = 1 AND oa.status = 'active' AND oa.deleted_at IS NULL);
END;

CREATE TRIGGER telegram_allowlist_owner_d BEFORE DELETE ON telegram_allowlist
WHEN OLD.is_owner = 1 AND app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8e §A: không xoá cứng hàng chủ sở hữu của allowlist Telegram — chỉ purge Role (ngữ cảnh bảo trì app_maint())'); END;

CREATE TRIGGER telegram_bots_owner_u BEFORE UPDATE OF deleted_at ON telegram_bots
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'v2.2.13 (review bảo mật, HIGH): chỉ owner của workspace khôi phục được bot Telegram đã xoá mềm')
   WHERE NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner');
  SELECT RAISE(ABORT, 'CONTRACT-r8e §A: khôi phục bot Telegram đã xoá mềm phải có hàng chủ sở hữu active trước (bất biến: bot còn sống luôn có ≥ 1 hàng chủ sở hữu active)')
   WHERE NOT EXISTS (SELECT 1 FROM telegram_allowlist ra WHERE ra.bot_id = OLD.id AND ra.is_owner = 1 AND ra.status = 'active' AND ra.deleted_at IS NULL);
END;

CREATE TRIGGER telegram_allowlist_owner_new_i BEFORE INSERT ON telegram_allowlist
WHEN NEW.is_owner = 1 AND NEW.status = 'active' AND NEW.deleted_at IS NULL AND app_maint() = 0
 AND NOT (NEW.added_via = 'capture' AND (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
          OR NOT EXISTS (SELECT 1 FROM telegram_allowlist na WHERE na.bot_id = NEW.bot_id AND na.is_owner = 1 AND na.status = 'active' AND na.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'v2.2.13 (review bảo mật, HIGH): hàng allowlist chỉ thành chủ sở hữu active khi owner của workspace thêm qua capture (user ID đã xác minh), hoặc bot chưa có hàng chủ sở hữu active nào (bootstrap qua capture) — admin, tác tử, nhập tay không tạo được chủ sở hữu'); END;

CREATE TRIGGER telegram_allowlist_owner_new_u BEFORE UPDATE OF is_owner, status, deleted_at, added_via, bot_id ON telegram_allowlist
WHEN NEW.is_owner = 1 AND NEW.status = 'active' AND NEW.deleted_at IS NULL AND NOT (OLD.is_owner = 1 AND OLD.status = 'active' AND OLD.deleted_at IS NULL) AND app_maint() = 0
 AND NOT (NEW.added_via = 'capture' AND (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
          OR NOT EXISTS (SELECT 1 FROM telegram_allowlist na WHERE na.bot_id = NEW.bot_id AND na.id <> OLD.id AND na.is_owner = 1 AND na.status = 'active' AND na.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'v2.2.13 (review bảo mật, HIGH): hàng allowlist chỉ thành chủ sở hữu active khi owner của workspace thêm qua capture (user ID đã xác minh), hoặc bot chưa có hàng chủ sở hữu active nào (bootstrap qua capture) — admin, tác tử, nhập tay không tạo được chủ sở hữu'); END;

CREATE TRIGGER engine_accounts_login_started_ai AFTER INSERT ON engine_accounts
WHEN NEW.login_status = 'in_progress' OR NEW.login_started_at IS NOT NULL
BEGIN UPDATE engine_accounts SET login_started_at = CASE WHEN NEW.login_status = 'in_progress' THEN strftime('%Y-%m-%dT%H:%M:%fZ', app_now()) END, updated_by = COALESCE(app_actor(), updated_by), updated_at = max(strftime('%Y-%m-%dT%H:%M:%fZ', app_now()), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), strftime('%Y-%m-%dT%H:%M:%fZ', app_now()))) WHERE id = NEW.id; END;

CREATE TRIGGER engine_accounts_login_started_au AFTER UPDATE OF login_status ON engine_accounts
WHEN NEW.login_status = 'in_progress' OR OLD.login_status = 'in_progress'
BEGIN UPDATE engine_accounts SET login_started_at = CASE WHEN NEW.login_status = 'in_progress' THEN strftime('%Y-%m-%dT%H:%M:%fZ', app_now()) END, updated_by = COALESCE(app_actor(), updated_by), updated_at = max(strftime('%Y-%m-%dT%H:%M:%fZ', app_now()), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), strftime('%Y-%m-%dT%H:%M:%fZ', app_now()))) WHERE id = NEW.id; END;

CREATE TRIGGER settings_attachment_max_i BEFORE INSERT ON settings
WHEN NEW.key = 'chat.attachment_max_bytes' AND NOT (
  (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 104857600))
  AND (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings: chat.attachment_max_bytes phải là số nguyên byte 1–104857600, chỉ owner/admin ghi'); END;

CREATE TRIGGER settings_attachment_max_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = 'chat.attachment_max_bytes' OR OLD.key = 'chat.attachment_max_bytes') AND NOT (
  NEW.key = 'chat.attachment_max_bytes'
  AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 104857600))
  AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'settings: chat.attachment_max_bytes phải là số nguyên byte 1–104857600, chỉ owner/admin sửa (updated_by)'); END;

CREATE TRIGGER message_attachments_max_bytes_i BEFORE INSERT ON message_attachments
WHEN NEW.scan_status = 'clean' AND NEW.size_bytes > COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'chat.attachment_max_bytes' AND deleted_at IS NULL), 26214400)
BEGIN SELECT RAISE(ABORT, 'chat: tệp vượt trần chat.attachment_max_bytes (mặc định 25 MB) — tệp được nhận (clean) không vượt trần; vượt thì rejected + reject_reason "> 25 MB"'); END;

CREATE TRIGGER message_attachments_max_bytes_u BEFORE UPDATE OF scan_status, size_bytes, workspace_id ON message_attachments
WHEN NEW.scan_status = 'clean' AND NEW.size_bytes > COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'chat.attachment_max_bytes' AND deleted_at IS NULL), 26214400)
BEGIN SELECT RAISE(ABORT, 'chat: tệp vượt trần chat.attachment_max_bytes (mặc định 25 MB) — tệp được nhận (clean) không vượt trần; vượt thì rejected + reject_reason "> 25 MB"'); END;

CREATE TRIGGER skin_assets_writer_i BEFORE INSERT ON skin_assets
WHEN NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'Kho nhân vật (v2.3.0): chỉ owner/admin (hoặc actor system lúc cài gói khi tạo workspace) thêm nhân vật / cài gói skin'); END;

CREATE TRIGGER skin_assets_writer_u BEFORE UPDATE ON skin_assets
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'Kho nhân vật (v2.3.0): chỉ owner/admin sửa danh mục nhân vật (bật / tắt, khôi phục, rút, đổi mã / tham số) — updated_by phải là owner/admin đang hoạt động của workspace'); END;

CREATE TRIGGER avatars_library_enabled_i BEFORE INSERT ON avatars
WHEN NEW.source = 'library' AND EXISTS (SELECT 1 FROM skin_assets s WHERE s.id = NEW.skin_asset_id AND s.is_enabled = 0)
BEGIN SELECT RAISE(ABORT, 'Kho nhân vật (v2.3.0): nhân vật đã tắt trong Kho — không gán mới được; Role đang dùng giữ nguyên ảnh'); END;

CREATE TRIGGER roles_avatar_i BEFORE INSERT ON roles
WHEN NEW.avatar_id IS NOT NULL AND (SELECT oa.role_id FROM avatars oa WHERE oa.id = NEW.avatar_id) IS NOT NEW.id
BEGIN SELECT RAISE(ABORT, 'roles.avatar_id (v2.3.0): avatar hiện hành phải là bản ghi AV- của chính Role (gán = tạo AV- mới rồi trỏ; khôi phục = AV cũ của chính Role)'); END;

CREATE TRIGGER roles_avatar_u BEFORE UPDATE OF avatar_id ON roles
WHEN NEW.avatar_id IS NOT NULL AND NEW.avatar_id IS NOT OLD.avatar_id
BEGIN
  SELECT RAISE(ABORT, 'roles.avatar_id (v2.3.0): avatar hiện hành phải là bản ghi AV- của chính Role (gán = tạo AV- mới rồi trỏ; khôi phục = AV cũ của chính Role)') WHERE NEW.avatar_id IS NOT NULL AND (SELECT oa.role_id FROM avatars oa WHERE oa.id = NEW.avatar_id) IS NOT NEW.id;
  SELECT RAISE(ABORT, 'Kho nhân vật (v2.3.0): không gán / khôi phục ảnh thư viện của nhân vật đã tắt trong Kho, đã rút hoặc đã gỡ gói — Role đang dùng giữ nguyên ảnh') WHERE NEW.avatar_id IS NOT NULL AND EXISTS (SELECT 1 FROM avatars la WHERE la.id = NEW.avatar_id AND la.source = 'library' AND NOT EXISTS (SELECT 1 FROM skin_assets ls WHERE ls.id = la.skin_asset_id AND ls.deleted_at IS NULL AND ls.status = 'active' AND ls.is_enabled = 1));
END;

CREATE TRIGGER settings_avatar_i BEFORE INSERT ON settings
WHEN NEW.key IN ('avatar.transient_seconds', 'avatar.idle_after_minutes', 'ui.avatar_motion') AND NOT (COALESCE(CASE NEW.key WHEN 'avatar.transient_seconds' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 600) WHEN 'avatar.idle_after_minutes' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 1440) WHEN 'ui.avatar_motion' THEN (json_extract(NEW.value_json, '$') IN ('full', 'subtle', 'off')) END, 0) AND (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.0): avatar.transient_seconds = số nguyên giây 1–600 (mặc định 20) · avatar.idle_after_minutes = số nguyên phút 1–1440 (mặc định 10) · ui.avatar_motion = "full" | "subtle" | "off" (mặc định "full") — chỉ owner/admin ghi'); END;

CREATE TRIGGER settings_avatar_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key IN ('avatar.transient_seconds', 'avatar.idle_after_minutes', 'ui.avatar_motion') OR OLD.key IN ('avatar.transient_seconds', 'avatar.idle_after_minutes', 'ui.avatar_motion')) AND NOT (NEW.key IS OLD.key AND COALESCE(CASE NEW.key WHEN 'avatar.transient_seconds' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 600) WHEN 'avatar.idle_after_minutes' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 1440) WHEN 'ui.avatar_motion' THEN (json_extract(NEW.value_json, '$') IN ('full', 'subtle', 'off')) END, 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.0): avatar.transient_seconds = số nguyên giây 1–600 (mặc định 20) · avatar.idle_after_minutes = số nguyên phút 1–1440 (mặc định 10) · ui.avatar_motion = "full" | "subtle" | "off" (mặc định "full") — chỉ owner/admin ghi'); END;

CREATE TRIGGER workspaces_restored_u BEFORE UPDATE OF restored_at ON workspaces
WHEN (OLD.restored_at IS NOT NULL AND (NEW.restored_at IS NULL OR NEW.restored_at < OLD.restored_at)) OR NEW.restored_at > strftime('%Y-%m-%dT%H:%M:%fZ', app_now())
BEGIN SELECT RAISE(ABORT, 'workspaces.restored_at (v2.3.2): mốc khôi phục chỉ tiến và không ở tương lai — không xoá, không lùi, không vượt app_now() (danh sách "cần đăng nhập lại sau khôi phục" v_relogin_required không bị ẩn, cũng không kẹt mãi)'); END;

CREATE TRIGGER workspaces_restored_i BEFORE INSERT ON workspaces
WHEN NEW.restored_at > strftime('%Y-%m-%dT%H:%M:%fZ', app_now())
BEGIN SELECT RAISE(ABORT, 'workspaces.restored_at (v2.3.2): mốc khôi phục chỉ tiến và không ở tương lai — không xoá, không lùi, không vượt app_now() (danh sách "cần đăng nhập lại sau khôi phục" v_relogin_required không bị ẩn, cũng không kẹt mãi)'); END;

CREATE TRIGGER settings_remote_anchor_i BEFORE INSERT ON settings
WHEN NEW.key = 'backup.remote_anchor'
BEGIN
  SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace được ghi / sửa / xoá mềm (người ghi = app_actor()); xoá cứng chỉ trong bảo trì') WHERE NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor = {"url":"https://<host[:cổng]>[/<path>]","secret_id":"<secret>"} dạng chuẩn, đúng 2 khoá — authority TRÙNG allowed_host của secret cùng workspace, còn sống, active; URL chỉ ASCII [A-Za-z0-9._~:/-] (không NUL, không escape \u) — neo audit ngoài máy chỉ qua HTTPS + token gắn host; đổi host = nhập token mới; SSH chưa hỗ trợ ở MVP') WHERE NOT EXISTS (SELECT 1 FROM secrets rs WHERE rs.id = json_extract(NEW.value_json, '$.secret_id') AND rs.workspace_id = NEW.workspace_id AND rs.deleted_at IS NULL AND rs.status = 'active' AND substr(json_extract(NEW.value_json, '$.url'), 1, 8) = 'https://' AND rs.allowed_host = substr(substr(json_extract(NEW.value_json, '$.url'), 9), 1, instr(substr(json_extract(NEW.value_json, '$.url'), 9) || '/', '/') - 1) AND length(CAST(json_extract(NEW.value_json, '$.url') AS BLOB)) = length(json_extract(NEW.value_json, '$.url')) AND json_extract(NEW.value_json, '$.url') NOT GLOB '*[^A-Za-z0-9._~:/-]*' AND NEW.value_json NOT GLOB '*\u*' AND NEW.value_json = json(NEW.value_json) AND (SELECT count(*) FROM json_each(NEW.value_json)) = 2);
END;

CREATE TRIGGER settings_remote_anchor_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN NEW.key = 'backup.remote_anchor' OR OLD.key = 'backup.remote_anchor'
BEGIN
  SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace được ghi / sửa / xoá mềm (người ghi = app_actor()); xoá cứng chỉ trong bảo trì') WHERE NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor = {"url":"https://<host[:cổng]>[/<path>]","secret_id":"<secret>"} dạng chuẩn, đúng 2 khoá — authority TRÙNG allowed_host của secret cùng workspace, còn sống, active; URL chỉ ASCII [A-Za-z0-9._~:/-] (không NUL, không escape \u) — neo audit ngoài máy chỉ qua HTTPS + token gắn host; đổi host = nhập token mới; SSH chưa hỗ trợ ở MVP') WHERE NOT (NEW.key IS OLD.key AND (NEW.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM secrets rs WHERE rs.id = json_extract(NEW.value_json, '$.secret_id') AND rs.workspace_id = NEW.workspace_id AND rs.deleted_at IS NULL AND rs.status = 'active' AND substr(json_extract(NEW.value_json, '$.url'), 1, 8) = 'https://' AND rs.allowed_host = substr(substr(json_extract(NEW.value_json, '$.url'), 9), 1, instr(substr(json_extract(NEW.value_json, '$.url'), 9) || '/', '/') - 1) AND length(CAST(json_extract(NEW.value_json, '$.url') AS BLOB)) = length(json_extract(NEW.value_json, '$.url')) AND json_extract(NEW.value_json, '$.url') NOT GLOB '*[^A-Za-z0-9._~:/-]*' AND NEW.value_json NOT GLOB '*\u*' AND NEW.value_json = json(NEW.value_json) AND (SELECT count(*) FROM json_each(NEW.value_json)) = 2)));
END;

CREATE TRIGGER settings_remote_anchor_d BEFORE DELETE ON settings
WHEN OLD.key = 'backup.remote_anchor' AND app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace được ghi / sửa / xoá mềm (người ghi = app_actor()); xoá cứng chỉ trong bảo trì'); END;

CREATE TRIGGER secrets_writer_i BEFORE INSERT ON secrets
WHEN NOT (CASE WHEN NEW.kind = 'anchor_remote_token' THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
               WHEN NEW.kind = 'telegram_bot_token' THEN (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
               ELSE (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')) END)
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.3): chỉ owner / admin còn là thành viên hoặc actor system của workspace tạo / thay bí mật; kind anchor_remote_token (token gắn đích) CHỈ OWNER; telegram_bot_token chỉ owner hoặc actor system — người ghi = app_actor(); bảo trì (xoay KEK) miễn'); END;

CREATE TRIGGER secrets_writer_u BEFORE UPDATE OF kind, label, ciphertext, nonce, wrapped_dek, dek_nonce, kek_id, alg, last4, fingerprint, status, rotated_from_id, allowed_host, workspace_id, deleted_at ON secrets
WHEN app_maint() = 0 AND NOT (CASE WHEN 'anchor_remote_token' IN (OLD.kind, NEW.kind) THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
                                   WHEN 'telegram_bot_token' IN (OLD.kind, NEW.kind) THEN (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
                                   ELSE (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')) END)
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.3): chỉ owner / admin còn là thành viên hoặc actor system của workspace tạo / thay bí mật; kind anchor_remote_token (token gắn đích) CHỈ OWNER; telegram_bot_token chỉ owner hoặc actor system — người ghi = app_actor(); bảo trì (xoay KEK) miễn'); END;

CREATE TRIGGER secrets_kind_u BEFORE UPDATE OF kind ON secrets
WHEN app_maint() = 0 AND NEW.kind IS NOT OLD.kind
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.4): kind bất biến ngoài bảo trì — đổi loại bí mật = tạo secret mới (đổi kind từng là lối hạ cấp token chỉ owner sang nhánh admin)'); END;

CREATE TRIGGER secrets_allowed_host_u BEFORE UPDATE OF allowed_host ON secrets
WHEN NEW.allowed_host IS NOT OLD.allowed_host
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.2): allowed_host ghi một lần — đổi host đích = nhập token mới (secret mới)'); END;

CREATE TRIGGER engine_installs_writer_i BEFORE INSERT ON engine_installs
WHEN NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_installs (v2.3.2): trạng thái cài CLI chỉ actor system của workspace (app theo ga-engine-install status) ghi — owner / admin / tác tử khác không ghi tay (v2.3.3: người ghi = app_actor())'); END;

CREATE TRIGGER engine_installs_writer_u BEFORE UPDATE ON engine_installs
WHEN NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_installs (v2.3.2): trạng thái cài CLI chỉ actor system của workspace (app theo ga-engine-install status) ghi — owner / admin / tác tử khác không ghi tay (v2.3.3: người ghi = app_actor())'); END;

CREATE TRIGGER engine_accounts_writer_i BEFORE INSERT ON engine_accounts
BEGIN
  SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())') WHERE NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): trạng thái kiểm đăng nhập / quota / overhead / sự cố hãng chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định') WHERE NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND (COALESCE(NEW.account_hint, NEW.plan_label, NEW.plan_confidence, NEW.login_checked_at, NEW.cli_version_current, NEW.cli_version_latest, NEW.quota_remaining_pct, NEW.quota_reset_at, NEW.quota_scanned_at, NEW.outage_since, NEW.last_probe_run_id, NEW.runtime_overhead_tokens, NEW.overhead_bare_session_id, NEW.overhead_shell_session_id, NEW.overhead_measured_at) IS NOT NULL OR NEW.quota_state <> 'unknown' OR NEW.login_status NOT IN ('unknown', 'in_progress'));
END;

CREATE TRIGGER engine_accounts_writer_u BEFORE UPDATE OF engine_slug, label, auth_method, secret_id, auth_volume, cli_version_pinned, consent_id, status, deleted_at ON engine_accounts
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())'); END;

CREATE TRIGGER engine_accounts_sys_u BEFORE UPDATE OF account_hint, plan_label, plan_confidence, login_checked_at, cli_version_current, cli_version_latest, quota_remaining_pct, quota_reset_at, quota_scanned_at, outage_since, last_probe_run_id, runtime_overhead_tokens, overhead_bare_session_id, overhead_shell_session_id, overhead_measured_at, quota_state ON engine_accounts
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): trạng thái kiểm đăng nhập / quota / overhead / sự cố hãng chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định'); END;

CREATE TRIGGER engine_accounts_login_status_u BEFORE UPDATE OF login_status ON engine_accounts
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND NOT (NEW.login_status = 'in_progress' AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): login_status là kết quả kiểm đăng nhập — chỉ actor system ghi; owner / admin chỉ được đặt in_progress (bấm "Đổi tài khoản / Đăng nhập lại")'); END;

CREATE TRIGGER engine_bindings_writer_i BEFORE INSERT ON engine_bindings
BEGIN
  SELECT RAISE(ABORT, 'engine_bindings (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())') WHERE NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'engine_bindings (v2.3.3): kết quả kiểm model (selection_state / selection_checked_at) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định') WHERE NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND (NEW.selection_state <> 'unknown' OR NEW.selection_checked_at IS NOT NULL);
END;

CREATE TRIGGER engine_bindings_writer_u BEFORE UPDATE OF consumer_kind, role_id, engine_account_id, priority, model_key, effort, is_enabled, deleted_at ON engine_bindings
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'engine_bindings (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())'); END;

CREATE TRIGGER engine_bindings_sys_u BEFORE UPDATE OF selection_state, selection_checked_at ON engine_bindings
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_bindings (v2.3.3): kết quả kiểm model (selection_state / selection_checked_at) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định'); END;

CREATE TRIGGER telegram_bots_writer_i BEFORE INSERT ON telegram_bots
BEGIN
  SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): giữ / định tuyến credential — chỉ owner còn là thành viên (admin cũng không) hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())') WHERE NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): kết quả getMe / long-poll (bot_tg_id, getme_ok_at, poll_offset, last_update_at, error, status ≠ pending) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định') WHERE NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND (COALESCE(NEW.bot_tg_id, NEW.getme_ok_at, NEW.last_update_at, NEW.error) IS NOT NULL OR NEW.poll_offset <> 0 OR NEW.status <> 'pending');
END;

CREATE TRIGGER telegram_bots_writer_u BEFORE UPDATE OF role_id, bot_username, secret_id, token_last4, deleted_at ON telegram_bots
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): giữ / định tuyến credential — chỉ owner còn là thành viên (admin cũng không) hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())'); END;

CREATE TRIGGER telegram_bots_sys_u BEFORE UPDATE OF bot_tg_id, getme_ok_at, poll_offset, last_update_at, error ON telegram_bots
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): kết quả getMe / long-poll (bot_tg_id, getme_ok_at, poll_offset, last_update_at, error) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định'); END;

CREATE TRIGGER telegram_bots_status_u BEFORE UPDATE OF status ON telegram_bots
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND NOT (NEW.status IN ('pending', 'paused', 'revoked') AND EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner'))
BEGIN SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): status active / error là kết quả runtime (getMe, long-poll) — chỉ actor system ghi; owner chỉ đặt pending / paused / revoked'); END;

CREATE TRIGGER tools_writer_i BEFORE INSERT ON tools
BEGIN
  SELECT RAISE(ABORT, 'tools (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())') WHERE NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'tools (v2.3.3): nguồn gốc built-in và số token định nghĩa (is_builtin, builtin_key, definition_tokens, tokenizer) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định') WHERE NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND (NEW.is_builtin <> 0 OR COALESCE(NEW.builtin_key, NEW.tokenizer) IS NOT NULL OR NEW.definition_tokens <> 0);
END;

CREATE TRIGGER tools_writer_u BEFORE UPDATE OF slug, name, kind, description, risk_level, default_mode, allowed_agents, config_json, secret_id, status, deleted_at ON tools
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'tools (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())'); END;

CREATE TRIGGER tools_sys_u BEFORE UPDATE OF is_builtin, builtin_key, definition_tokens, tokenizer ON tools
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'tools (v2.3.3): nguồn gốc built-in và số token định nghĩa (is_builtin, builtin_key, definition_tokens, tokenizer) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định'); END;

CREATE TRIGGER change_sets_proposer_i BEFORE INSERT ON change_sets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.proposed_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'change_sets (v2.3.3): proposed_by phải = app_actor() — người đề xuất là người ghi change set (Role qua gateway, tác tử hệ thống, owner)'); END;

CREATE TRIGGER change_sets_proposer_u BEFORE UPDATE OF proposed_by ON change_sets
WHEN app_maint() = 0 AND NEW.proposed_by IS NOT OLD.proposed_by AND NOT COALESCE(NEW.proposed_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'change_sets (v2.3.3): proposed_by phải = app_actor() — người đề xuất là người ghi change set (Role qua gateway, tác tử hệ thống, owner)'); END;

CREATE TRIGGER workspaces_notnull_i BEFORE INSERT ON workspaces
WHEN NEW.locale IS NULL OR NEW.timezone IS NULL OR NEW.currency_code IS NULL OR NEW.currency_symbol IS NULL OR NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): workspaces — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER workspaces_notnull_u BEFORE UPDATE OF locale, timezone, currency_code, currency_symbol, status, created_at ON workspaces
WHEN NEW.locale IS NULL OR NEW.timezone IS NULL OR NEW.currency_code IS NULL OR NEW.currency_symbol IS NULL OR NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): workspaces — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER users_notnull_i BEFORE INSERT ON users
WHEN NEW.must_change_password IS NULL OR NEW.failed_login_count IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): users — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER users_notnull_u BEFORE UPDATE OF must_change_password, failed_login_count, created_at ON users
WHEN NEW.must_change_password IS NULL OR NEW.failed_login_count IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): users — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER workspace_members_notnull_i BEFORE INSERT ON workspace_members
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): workspace_members — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER workspace_members_notnull_u BEFORE UPDATE OF created_at ON workspace_members
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): workspace_members — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER auth_sessions_notnull_i BEFORE INSERT ON auth_sessions
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): auth_sessions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER auth_sessions_notnull_u BEFORE UPDATE OF created_at ON auth_sessions
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): auth_sessions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER actors_notnull_i BEFORE INSERT ON actors
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): actors — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER actors_notnull_u BEFORE UPDATE OF created_at ON actors
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): actors — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER id_counters_notnull_i BEFORE INSERT ON id_counters
WHEN NEW.last_seq IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): id_counters — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER id_counters_notnull_u BEFORE UPDATE OF last_seq ON id_counters
WHEN NEW.last_seq IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): id_counters — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER id_aliases_notnull_i BEFORE INSERT ON id_aliases
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): id_aliases — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER id_aliases_notnull_u BEFORE UPDATE OF created_at ON id_aliases
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): id_aliases — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER roles_notnull_i BEFORE INSERT ON roles
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.lifecycle_status IS NULL OR NEW.runtime_state IS NULL OR NEW.condition IS NULL OR NEW.dna_schema_version IS NULL OR NEW.prompt_budget_tokens IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): roles — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER roles_notnull_u BEFORE UPDATE OF created_at, version, lifecycle_status, runtime_state, condition, dna_schema_version, prompt_budget_tokens ON roles
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.lifecycle_status IS NULL OR NEW.runtime_state IS NULL OR NEW.condition IS NULL OR NEW.dna_schema_version IS NULL OR NEW.prompt_budget_tokens IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): roles — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER avatars_notnull_i BEFORE INSERT ON avatars
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): avatars — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER avatars_notnull_u BEFORE UPDATE OF created_at ON avatars
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): avatars — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER skin_assets_notnull_i BEFORE INSERT ON skin_assets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.asset_kind IS NULL OR NEW.status IS NULL OR NEW.is_enabled IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skin_assets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER skin_assets_notnull_u BEFORE UPDATE OF created_at, version, asset_kind, status, is_enabled ON skin_assets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.asset_kind IS NULL OR NEW.status IS NULL OR NEW.is_enabled IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skin_assets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER dna_field_defs_notnull_i BEFORE INSERT ON dna_field_defs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_list IS NULL OR NEW.is_identity_locked IS NULL OR NEW.is_core IS NULL OR NEW.is_required_for_birth IS NULL OR NEW.default_in_prompt IS NULL OR NEW.ordinal IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_field_defs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER dna_field_defs_notnull_u BEFORE UPDATE OF created_at, version, is_list, is_identity_locked, is_core, is_required_for_birth, default_in_prompt, ordinal ON dna_field_defs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_list IS NULL OR NEW.is_identity_locked IS NULL OR NEW.is_core IS NULL OR NEW.is_required_for_birth IS NULL OR NEW.default_in_prompt IS NULL OR NEW.ordinal IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_field_defs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER dna_fields_notnull_i BEFORE INSERT ON dna_fields
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.item_index IS NULL OR NEW.is_in_prompt IS NULL OR NEW.token_count IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_fields — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER dna_fields_notnull_u BEFORE UPDATE OF created_at, version, item_index, is_in_prompt, token_count, status ON dna_fields
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.item_index IS NULL OR NEW.is_in_prompt IS NULL OR NEW.token_count IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_fields — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER dna_field_versions_notnull_i BEFORE INSERT ON dna_field_versions
WHEN NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_field_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER dna_field_versions_notnull_u BEFORE UPDATE OF status, created_at ON dna_field_versions
WHEN NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_field_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER revisions_notnull_i BEFORE INSERT ON revisions
WHEN NEW.created_at IS NULL OR NEW.is_core IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): revisions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER revisions_notnull_u BEFORE UPDATE OF created_at, is_core ON revisions
WHEN NEW.created_at IS NULL OR NEW.is_core IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): revisions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER change_sets_notnull_i BEFORE INSERT ON change_sets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): change_sets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER change_sets_notnull_u BEFORE UPDATE OF created_at, version, status ON change_sets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): change_sets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER change_set_items_notnull_i BEFORE INSERT ON change_set_items
WHEN NEW.status IS NULL OR NEW.token_delta IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): change_set_items — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER change_set_items_notnull_u BEFORE UPDATE OF status, token_delta, created_at ON change_set_items
WHEN NEW.status IS NULL OR NEW.token_delta IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): change_set_items — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER instructions_notnull_i BEFORE INSERT ON instructions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.condition_kind IS NULL OR NEW.is_enabled IS NULL OR NEW.is_core IS NULL OR NEW.token_count IS NULL OR NEW.status IS NULL OR NEW.lang IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): instructions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER instructions_notnull_u BEFORE UPDATE OF created_at, version, condition_kind, is_enabled, is_core, token_count, status, lang ON instructions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.condition_kind IS NULL OR NEW.is_enabled IS NULL OR NEW.is_core IS NULL OR NEW.token_count IS NULL OR NEW.status IS NULL OR NEW.lang IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): instructions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER instruction_versions_notnull_i BEFORE INSERT ON instruction_versions
WHEN NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): instruction_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER instruction_versions_notnull_u BEFORE UPDATE OF status, created_at ON instruction_versions
WHEN NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): instruction_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER taxonomy_nodes_notnull_i BEFORE INSERT ON taxonomy_nodes
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.ordinal IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): taxonomy_nodes — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER taxonomy_nodes_notnull_u BEFORE UPDATE OF created_at, version, ordinal, status ON taxonomy_nodes
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.ordinal IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): taxonomy_nodes — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER skills_notnull_i BEFORE INSERT ON skills
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skills — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER skills_notnull_u BEFORE UPDATE OF created_at, version, status ON skills
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skills — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER skill_versions_notnull_i BEFORE INSERT ON skill_versions
WHEN NEW.status IS NULL OR NEW.file_count IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skill_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER skill_versions_notnull_u BEFORE UPDATE OF status, file_count, created_at ON skill_versions
WHEN NEW.status IS NULL OR NEW.file_count IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skill_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER skill_prereqs_notnull_i BEFORE INSERT ON skill_prereqs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skill_prereqs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER skill_prereqs_notnull_u BEFORE UPDATE OF created_at, version, status ON skill_prereqs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skill_prereqs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER role_skills_notnull_i BEFORE INSERT ON role_skills
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.uses_7d IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): role_skills — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER role_skills_notnull_u BEFORE UPDATE OF created_at, version, uses_7d ON role_skills
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.uses_7d IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): role_skills — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER blobs_notnull_i BEFORE INSERT ON blobs
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): blobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER blobs_notnull_u BEFORE UPDATE OF created_at ON blobs
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): blobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER knowledge_items_notnull_i BEFORE INSERT ON knowledge_items
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.processing_state IS NULL OR NEW.progress_pct IS NULL OR NEW.chunk_count IS NULL OR NEW.token_count IS NULL OR NEW.sensitivity IS NULL OR NEW.recall_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): knowledge_items — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER knowledge_items_notnull_u BEFORE UPDATE OF created_at, version, status, processing_state, progress_pct, chunk_count, token_count, sensitivity, recall_count ON knowledge_items
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.processing_state IS NULL OR NEW.progress_pct IS NULL OR NEW.chunk_count IS NULL OR NEW.token_count IS NULL OR NEW.sensitivity IS NULL OR NEW.recall_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): knowledge_items — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER memories_notnull_i BEFORE INSERT ON memories
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.scope IS NULL OR NEW.status IS NULL OR NEW.is_pinned IS NULL OR NEW.sensitivity IS NULL OR NEW.lang IS NULL OR NEW.recall_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): memories — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER memories_notnull_u BEFORE UPDATE OF created_at, version, scope, status, is_pinned, sensitivity, lang, recall_count ON memories
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.scope IS NULL OR NEW.status IS NULL OR NEW.is_pinned IS NULL OR NEW.sensitivity IS NULL OR NEW.lang IS NULL OR NEW.recall_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): memories — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER recall_hits_notnull_i BEFORE INSERT ON recall_hits
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): recall_hits — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER recall_hits_notnull_u BEFORE UPDATE OF created_at ON recall_hits
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): recall_hits — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER positions_notnull_i BEFORE INSERT ON positions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.default_trust_tier IS NULL OR NEW.status IS NULL OR NEW.is_default IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): positions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER positions_notnull_u BEFORE UPDATE OF created_at, version, default_trust_tier, status, is_default ON positions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.default_trust_tier IS NULL OR NEW.status IS NULL OR NEW.is_default IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): positions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER assignments_notnull_i BEFORE INSERT ON assignments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_primary IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): assignments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER assignments_notnull_u BEFORE UPDATE OF created_at, version, is_primary ON assignments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_primary IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): assignments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER trust_tier_changes_notnull_i BEFORE INSERT ON trust_tier_changes
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): trust_tier_changes — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER trust_tier_changes_notnull_u BEFORE UPDATE OF created_at ON trust_tier_changes
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): trust_tier_changes — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER tasks_notnull_i BEFORE INSERT ON tasks
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.priority IS NULL OR NEW.verification IS NULL OR NEW.tokens_total IS NULL OR NEW.cost_micro_usd IS NULL OR NEW.token_cost_minor IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tasks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER tasks_notnull_u BEFORE UPDATE OF created_at, version, status, priority, verification, tokens_total, cost_micro_usd, token_cost_minor ON tasks
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.priority IS NULL OR NEW.verification IS NULL OR NEW.tokens_total IS NULL OR NEW.cost_micro_usd IS NULL OR NEW.token_cost_minor IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tasks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER commitments_notnull_i BEFORE INSERT ON commitments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): commitments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER commitments_notnull_u BEFORE UPDATE OF created_at, version, status ON commitments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): commitments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER sessions_notnull_i BEFORE INSERT ON sessions
WHEN NEW.created_at IS NULL OR NEW.native_memory IS NULL OR NEW.status IS NULL OR NEW.failover_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): sessions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER sessions_notnull_u BEFORE UPDATE OF created_at, native_memory, status, failover_count ON sessions
WHEN NEW.created_at IS NULL OR NEW.native_memory IS NULL OR NEW.status IS NULL OR NEW.failover_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): sessions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER wallets_notnull_i BEFORE INSERT ON wallets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.currency_code IS NULL OR NEW.balance_minor IS NULL OR NEW.entry_count IS NULL OR NEW.allow_negative IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): wallets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER wallets_notnull_u BEFORE UPDATE OF created_at, version, currency_code, balance_minor, entry_count, allow_negative, status ON wallets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.currency_code IS NULL OR NEW.balance_minor IS NULL OR NEW.entry_count IS NULL OR NEW.allow_negative IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): wallets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER ledger_entries_notnull_i BEFORE INSERT ON ledger_entries
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): ledger_entries — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER ledger_entries_notnull_u BEFORE UPDATE OF created_at ON ledger_entries
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): ledger_entries — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER role_wounds_notnull_i BEFORE INSERT ON role_wounds
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): role_wounds — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER role_wounds_notnull_u BEFORE UPDATE OF created_at ON role_wounds
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): role_wounds — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER usage_daily_notnull_i BEFORE INSERT ON usage_daily
WHEN NEW.sessions_count IS NULL OR NEW.tokens_input IS NULL OR NEW.tokens_output IS NULL OR NEW.tokens_cache_read IS NULL OR NEW.tokens_cache_write IS NULL OR NEW.tokens_thinking IS NULL OR NEW.errors IS NULL OR NEW.failovers IS NULL OR NEW.proactive_sent IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): usage_daily — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER usage_daily_notnull_u BEFORE UPDATE OF sessions_count, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, tokens_thinking, errors, failovers, proactive_sent ON usage_daily
WHEN NEW.sessions_count IS NULL OR NEW.tokens_input IS NULL OR NEW.tokens_output IS NULL OR NEW.tokens_cache_read IS NULL OR NEW.tokens_cache_write IS NULL OR NEW.tokens_thinking IS NULL OR NEW.errors IS NULL OR NEW.failovers IS NULL OR NEW.proactive_sent IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): usage_daily — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER engines_notnull_i BEFORE INSERT ON engines
WHEN NEW.workspace_id IS NULL OR NEW.requires_consent IS NULL OR NEW.supports_subscription IS NULL OR NEW.supports_api_key IS NULL OR NEW.core_capable IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engines — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER engines_notnull_u BEFORE UPDATE OF workspace_id, requires_consent, supports_subscription, supports_api_key, core_capable ON engines
WHEN NEW.workspace_id IS NULL OR NEW.requires_consent IS NULL OR NEW.supports_subscription IS NULL OR NEW.supports_api_key IS NULL OR NEW.core_capable IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engines — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER engine_installs_notnull_i BEFORE INSERT ON engine_installs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.install_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_installs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER engine_installs_notnull_u BEFORE UPDATE OF created_at, version, install_state ON engine_installs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.install_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_installs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER engine_accounts_notnull_i BEFORE INSERT ON engine_accounts
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.login_status IS NULL OR NEW.quota_state IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_accounts — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER engine_accounts_notnull_u BEFORE UPDATE OF created_at, version, login_status, quota_state, status ON engine_accounts
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.login_status IS NULL OR NEW.quota_state IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_accounts — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER engine_bindings_notnull_i BEFORE INSERT ON engine_bindings
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.consumer_kind IS NULL OR NEW.is_enabled IS NULL OR NEW.selection_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_bindings — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER engine_bindings_notnull_u BEFORE UPDATE OF created_at, version, consumer_kind, is_enabled, selection_state ON engine_bindings
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.consumer_kind IS NULL OR NEW.is_enabled IS NULL OR NEW.selection_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_bindings — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER system_agents_notnull_i BEFORE INSERT ON system_agents
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.selection_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): system_agents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER system_agents_notnull_u BEFORE UPDATE OF created_at, version, is_enabled, selection_state ON system_agents
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.selection_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): system_agents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER probe_runs_notnull_i BEFORE INSERT ON probe_runs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): probe_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER probe_runs_notnull_u BEFORE UPDATE OF created_at, status ON probe_runs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): probe_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER capabilities_notnull_i BEFORE INSERT ON capabilities
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): capabilities — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER capabilities_notnull_u BEFORE UPDATE OF created_at, version ON capabilities
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): capabilities — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER quota_snapshots_notnull_i BEFORE INSERT ON quota_snapshots
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): quota_snapshots — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER quota_snapshots_notnull_u BEFORE UPDATE OF created_at ON quota_snapshots
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): quota_snapshots — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER model_ranks_notnull_i BEFORE INSERT ON model_ranks
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): model_ranks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER model_ranks_notnull_u BEFORE UPDATE OF created_at, version ON model_ranks
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): model_ranks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER compiled_prompts_notnull_i BEFORE INSERT ON compiled_prompts
WHEN NEW.created_at IS NULL OR NEW.context_key IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): compiled_prompts — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER compiled_prompts_notnull_u BEFORE UPDATE OF created_at, context_key ON compiled_prompts
WHEN NEW.created_at IS NULL OR NEW.context_key IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): compiled_prompts — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER compiled_prompt_segments_notnull_i BEFORE INSERT ON compiled_prompt_segments
WHEN NEW.is_conditional IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): compiled_prompt_segments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER compiled_prompt_segments_notnull_u BEFORE UPDATE OF is_conditional ON compiled_prompt_segments
WHEN NEW.is_conditional IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): compiled_prompt_segments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER containers_notnull_i BEFORE INSERT ON containers
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): containers — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER containers_notnull_u BEFORE UPDATE OF created_at, version ON containers
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): containers — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER telegram_bots_notnull_i BEFORE INSERT ON telegram_bots
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.poll_offset IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): telegram_bots — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER telegram_bots_notnull_u BEFORE UPDATE OF created_at, version, status, poll_offset ON telegram_bots
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.poll_offset IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): telegram_bots — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER telegram_allowlist_notnull_i BEFORE INSERT ON telegram_allowlist
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_owner IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): telegram_allowlist — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER telegram_allowlist_notnull_u BEFORE UPDATE OF created_at, version, is_owner, status ON telegram_allowlist
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_owner IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): telegram_allowlist — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER proactive_policies_notnull_i BEFORE INSERT ON proactive_policies
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.max_per_day IS NULL OR NEW.weekend_differs IS NULL OR NEW.break_quiet_level IS NULL OR NEW.channel IS NULL OR NEW.allow_commitment_reminder IS NULL OR NEW.allow_task_done IS NULL OR NEW.allow_opportunity IS NULL OR NEW.allow_incident IS NULL OR NEW.allow_heartbeat_digest IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_policies — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER proactive_policies_notnull_u BEFORE UPDATE OF created_at, version, is_enabled, max_per_day, weekend_differs, break_quiet_level, channel, allow_commitment_reminder, allow_task_done, allow_opportunity, allow_incident, allow_heartbeat_digest ON proactive_policies
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.max_per_day IS NULL OR NEW.weekend_differs IS NULL OR NEW.break_quiet_level IS NULL OR NEW.channel IS NULL OR NEW.allow_commitment_reminder IS NULL OR NEW.allow_task_done IS NULL OR NEW.allow_opportunity IS NULL OR NEW.allow_incident IS NULL OR NEW.allow_heartbeat_digest IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_policies — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER proactive_jobs_notnull_i BEFORE INSERT ON proactive_jobs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.misfire_policy IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_jobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER proactive_jobs_notnull_u BEFORE UPDATE OF created_at, version, is_enabled, misfire_policy ON proactive_jobs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.misfire_policy IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_jobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER proactive_sends_notnull_i BEFORE INSERT ON proactive_sends
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_sends — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER proactive_sends_notnull_u BEFORE UPDATE OF created_at ON proactive_sends
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_sends — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER tools_notnull_i BEFORE INSERT ON tools
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_builtin IS NULL OR NEW.definition_tokens IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tools — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER tools_notnull_u BEFORE UPDATE OF created_at, version, is_builtin, definition_tokens, status ON tools
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_builtin IS NULL OR NEW.definition_tokens IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tools — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER tool_grants_notnull_i BEFORE INSERT ON tool_grants
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tool_grants — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER tool_grants_notnull_u BEFORE UPDATE OF created_at, version ON tool_grants
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tool_grants — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER permission_requests_notnull_i BEFORE INSERT ON permission_requests
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): permission_requests — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER permission_requests_notnull_u BEFORE UPDATE OF created_at, version, status ON permission_requests
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): permission_requests — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER egress_rules_notnull_i BEFORE INSERT ON egress_rules
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.action IS NULL OR NEW.is_builtin IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): egress_rules — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER egress_rules_notnull_u BEFORE UPDATE OF created_at, version, action, is_builtin ON egress_rules
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.action IS NULL OR NEW.is_builtin IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): egress_rules — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER polaris_checks_notnull_i BEFORE INSERT ON polaris_checks
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): polaris_checks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER polaris_checks_notnull_u BEFORE UPDATE OF created_at ON polaris_checks
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): polaris_checks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER employee_cards_notnull_i BEFORE INSERT ON employee_cards
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): employee_cards — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER employee_cards_notnull_u BEFORE UPDATE OF created_at, version, status ON employee_cards
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): employee_cards — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER trial_runs_notnull_i BEFORE INSERT ON trial_runs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.scenario_count IS NULL OR NEW.pass_threshold IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): trial_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER trial_runs_notnull_u BEFORE UPDATE OF created_at, status, scenario_count, pass_threshold ON trial_runs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.scenario_count IS NULL OR NEW.pass_threshold IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): trial_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER chat_threads_notnull_i BEFORE INSERT ON chat_threads
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.message_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): chat_threads — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER chat_threads_notnull_u BEFORE UPDATE OF created_at, version, status, message_count ON chat_threads
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.message_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): chat_threads — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER chat_messages_notnull_i BEFORE INSERT ON chat_messages
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.anchor_count IS NULL OR NEW.attachment_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): chat_messages — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER chat_messages_notnull_u BEFORE UPDATE OF created_at, status, anchor_count, attachment_count ON chat_messages
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.anchor_count IS NULL OR NEW.attachment_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): chat_messages — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER message_attachments_notnull_i BEFORE INSERT ON message_attachments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.scan_status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): message_attachments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER message_attachments_notnull_u BEFORE UPDATE OF created_at, version, scan_status ON message_attachments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.scan_status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): message_attachments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER message_anchors_notnull_i BEFORE INSERT ON message_anchors
WHEN NEW.created_at IS NULL OR NEW.resolved_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): message_anchors — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER message_anchors_notnull_u BEFORE UPDATE OF created_at, resolved_state ON message_anchors
WHEN NEW.created_at IS NULL OR NEW.resolved_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): message_anchors — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER ui_actions_notnull_i BEFORE INSERT ON ui_actions
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): ui_actions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER ui_actions_notnull_u BEFORE UPDATE OF created_at ON ui_actions
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): ui_actions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER audit_log_notnull_i BEFORE INSERT ON audit_log
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): audit_log — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER audit_log_notnull_u BEFORE UPDATE OF created_at ON audit_log
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): audit_log — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER events_notnull_i BEFORE INSERT ON events
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): events — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER events_notnull_u BEFORE UPDATE OF created_at ON events
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): events — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER notifications_notnull_i BEFORE INSERT ON notifications
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): notifications — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER notifications_notnull_u BEFORE UPDATE OF created_at, version ON notifications
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): notifications — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER jobs_notnull_i BEFORE INSERT ON jobs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.priority IS NULL OR NEW.attempts IS NULL OR NEW.max_attempts IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): jobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER jobs_notnull_u BEFORE UPDATE OF created_at, status, priority, attempts, max_attempts ON jobs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.priority IS NULL OR NEW.attempts IS NULL OR NEW.max_attempts IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): jobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER app_versions_notnull_i BEFORE INSERT ON app_versions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): app_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER app_versions_notnull_u BEFORE UPDATE OF created_at, version ON app_versions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): app_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER backups_notnull_i BEFORE INSERT ON backups
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.has_db IS NULL OR NEW.has_brains IS NULL OR NEW.has_blobs IS NULL OR NEW.is_encrypted IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): backups — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER backups_notnull_u BEFORE UPDATE OF created_at, version, has_db, has_brains, has_blobs, is_encrypted ON backups
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.has_db IS NULL OR NEW.has_brains IS NULL OR NEW.has_blobs IS NULL OR NEW.is_encrypted IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): backups — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER update_runs_notnull_i BEFORE INSERT ON update_runs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): update_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER update_runs_notnull_u BEFORE UPDATE OF created_at, version, status ON update_runs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): update_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER schema_migrations_notnull_i BEFORE INSERT ON schema_migrations
WHEN NEW.is_expand_only IS NULL OR NEW.applied_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): schema_migrations — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER schema_migrations_notnull_u BEFORE UPDATE OF is_expand_only, applied_at ON schema_migrations
WHEN NEW.is_expand_only IS NULL OR NEW.applied_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): schema_migrations — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER settings_notnull_i BEFORE INSERT ON settings
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): settings — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER settings_notnull_u BEFORE UPDATE OF created_at, version ON settings
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): settings — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER secrets_notnull_i BEFORE INSERT ON secrets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.alg IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): secrets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER secrets_notnull_u BEFORE UPDATE OF created_at, version, alg, status ON secrets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.alg IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): secrets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER consents_notnull_i BEFORE INSERT ON consents
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): consents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER consents_notnull_u BEFORE UPDATE OF created_at ON consents
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): consents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER search_documents_notnull_i BEFORE INSERT ON search_documents
WHEN NEW.is_live IS NULL OR NEW.weight IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): search_documents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

CREATE TRIGGER search_documents_notnull_u BEFORE UPDATE OF is_live, weight ON search_documents
WHEN NEW.is_live IS NULL OR NEW.weight IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): search_documents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- Views MVP v2.2 (repeatable: runner DROP + CREATE lại sau mỗi lượt migration)

-- §7.5 MỘT công thức "token prompt" (ruling 4): biên dịch (DN + IN + Nội quy + Vị trí + Skill + khung + Polaris) + overhead runtime đo được
-- v2.3.1 (BUILD-PLAN §F.6 p, CNS-154 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]; G-07/G-27 [Gen quyết 2026-10-16]): token_count là ƯỚC LƯỢNG của tokenizer của app
--   (o200k_base, compiler nhân biên ×1,15 — G-27 — nên chỉ dùng cho cổng KÝ); cổng CẤP THẺ dùng SỐ ĐO THẬT = tokens_input(phiên đo: vỏ adapter + bản biên
--   dịch NẶNG NHẤT 'worst' cùng thế hệ với bản default hiện hành) − tokens_input(phiên baseline vỏ của tài khoản chính); nhãn nguồn 'measured:<engine>'.
CREATE VIEW v_role_prompt_budget AS
WITH primary_engine AS (
  SELECT b.role_id, a.engine_slug, a.id AS account_id, a.runtime_overhead_tokens AS baseline_tok
  FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id   -- v2.1.1 tenant
  WHERE b.role_id IS NOT NULL AND b.priority = 1 AND b.is_enabled = 1 AND b.deleted_at IS NULL
), cur_pos AS (
  SELECT role_id, position_id FROM assignments
  WHERE status = 'active' AND is_primary = 1 AND deleted_at IS NULL
), blocks AS (                                    -- IN lớp Role + Nội quy (workspace) + lớp 5 của vị trí đang giữ
  SELECT i.role_id AS rid, i.layer, i.condition_kind, i.condition_value, i.token_count, i.engine_scope
  FROM instructions i
  WHERE i.role_id IS NOT NULL AND i.status = 'active' AND i.is_enabled = 1 AND i.deleted_at IS NULL
  UNION ALL
  SELECT r.id, i.layer, i.condition_kind, i.condition_value, i.token_count, i.engine_scope
  FROM roles r JOIN instructions i ON i.workspace_id = r.workspace_id AND i.layer = 'house_rules'
  WHERE i.status = 'active' AND i.is_enabled = 1 AND i.deleted_at IS NULL
  UNION ALL
  SELECT p.role_id, i.layer, i.condition_kind, i.condition_value, i.token_count, i.engine_scope
  FROM cur_pos p JOIN instructions i ON i.position_id = p.position_id
  WHERE i.status = 'active' AND i.is_enabled = 1 AND i.deleted_at IS NULL
), blocks_eng AS (
  SELECT b.rid, b.layer, b.condition_kind, b.condition_value, b.token_count
  FROM blocks b LEFT JOIN primary_engine e ON e.role_id = b.rid
  WHERE b.engine_scope IS NULL OR b.engine_scope = e.engine_slug
), in_default AS (
  SELECT rid,
         SUM(CASE WHEN layer NOT IN ('position', 'house_rules') THEN token_count ELSE 0 END) AS in_tok,
         SUM(CASE WHEN layer = 'house_rules' THEN token_count ELSE 0 END) AS rules_tok,
         SUM(CASE WHEN layer = 'position' THEN token_count ELSE 0 END) AS pos_tok
  FROM blocks_eng WHERE condition_kind = 'always' GROUP BY rid
), in_worst AS (                                  -- mỗi loại điều kiện: lấy giá trị nặng nhất, rồi cộng
  SELECT rid, SUM(max_tok) AS cond_tok FROM (
    SELECT rid, condition_kind, MAX(tok) AS max_tok FROM (
      SELECT rid, condition_kind, condition_value, SUM(token_count) AS tok
      FROM blocks_eng WHERE condition_kind <> 'always'
      GROUP BY rid, condition_kind, condition_value
    ) per_value GROUP BY rid, condition_kind
  ) per_kind GROUP BY rid
), dn AS (
  SELECT f.role_id AS rid, SUM(f.token_count) AS dn_tok
  FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id
  WHERE f.status = 'active' AND f.is_in_prompt = 1 AND f.deleted_at IS NULL AND d.deprecated_at IS NULL
  GROUP BY f.role_id
), sk AS (                                        -- chỉ mục skill; không có dòng skill_engine_support = mọi engine
  SELECT rs.role_id AS rid, SUM(sv.index_tokens) AS sk_tok
  FROM role_skills rs
  JOIN skill_versions sv ON sv.id = rs.skill_version_id
  LEFT JOIN primary_engine e ON e.role_id = rs.role_id
  WHERE rs.status = 'learned' AND rs.deleted_at IS NULL
    AND (NOT EXISTS (SELECT 1 FROM skill_engine_support s WHERE s.skill_version_id = sv.id)
         OR EXISTS (SELECT 1 FROM skill_engine_support s WHERE s.skill_version_id = sv.id AND s.engine_slug = e.engine_slug))
  GROUP BY rs.role_id
), pend AS (                                     -- đề xuất chờ duyệt: của Role + của vị trí đang giữ + Nội quy workspace
  SELECT x.rid, SUM(x.tok) AS pend_tok FROM (
    SELECT cs.role_id AS rid, ci.token_delta AS tok
    FROM change_sets cs JOIN change_set_items ci ON ci.change_set_id = cs.id
    WHERE cs.status = 'open' AND ci.status = 'pending' AND cs.role_id IS NOT NULL
    UNION ALL
    SELECT p.role_id, ci.token_delta
    FROM cur_pos p JOIN change_sets cs ON cs.position_id = p.position_id
    JOIN change_set_items ci ON ci.change_set_id = cs.id
    WHERE cs.status = 'open' AND ci.status = 'pending'
    UNION ALL
    SELECT r.id, ci.token_delta
    FROM roles r JOIN change_sets cs ON cs.workspace_id = r.workspace_id AND cs.scope = 'workspace'
    JOIN change_set_items ci ON ci.change_set_id = cs.id
    WHERE cs.status = 'open' AND ci.status = 'pending'
  ) x GROUP BY x.rid
), tools_extra AS (                              -- định nghĩa tool KHÔNG built-in lộ ra CLI (built-in đã nằm trong baseline đo được)
  SELECT x.rid, SUM(x.tok) AS tool_tok FROM (
    SELECT g.role_id AS rid, t.id AS tid, t.definition_tokens AS tok
    FROM tool_grants g JOIN tools t ON t.id = g.tool_id
    WHERE g.role_id IS NOT NULL AND g.mode IN ('allow', 'ask') AND g.deleted_at IS NULL AND t.is_builtin = 0 AND t.status = 'active'
    UNION
    SELECT p.role_id, t.id, t.definition_tokens
    FROM cur_pos p JOIN tool_grants g ON g.position_id = p.position_id JOIN tools t ON t.id = g.tool_id
    WHERE g.mode IN ('allow', 'ask') AND g.deleted_at IS NULL AND t.is_builtin = 0 AND t.status = 'active'
  ) x GROUP BY x.rid
), cur_gc AS (                                   -- bản biên dịch default mới nhất của revision hiện hành (engine chính hoặc trung lập)
  SELECT r.id AS rid, (SELECT cp.id FROM compiled_prompts cp
                       WHERE cp.revision_id = r.current_revision_id AND cp.context_key = 'default'
                         AND (cp.engine_slug IS e.engine_slug OR cp.engine_slug IS NULL)
                       ORDER BY cp.display_seq DESC LIMIT 1) AS gc_id
  FROM roles r LEFT JOIN primary_engine e ON e.role_id = r.id
), cur_gw AS (                                   -- v2.3.1: bản 'worst' CÙNG THẾ HỆ với bản default hiện hành (cùng revision, vị trí, Nội quy, engine, bộ số luật chơi)
  SELECT g.rid, (SELECT w.id FROM compiled_prompts d JOIN compiled_prompts w ON w.revision_id = d.revision_id
                   AND w.position_revision_id IS d.position_revision_id AND w.rules_revision_id IS d.rules_revision_id
                   AND w.engine_slug IS d.engine_slug AND w.polaris_params_hash IS d.polaris_params_hash AND w.context_key = 'worst'
                 WHERE d.id = g.gc_id ORDER BY w.display_seq DESC LIMIT 1) AS gw_id
  FROM cur_gc g
), meas AS (                                     -- v2.3.1: phiên ĐO mới nhất — baseline đã xong 'ok', tài khoản chính, adapter xác nhận nạp đúng bản 'worst'
  SELECT w.rid, (SELECT ms.id FROM sessions ms WHERE ms.compiled_prompt_id = w.gw_id AND ms.engine_account_id = e.account_id
                   AND ms.trigger = 'baseline' AND ms.status = 'ok' AND ms.delivered_prompt_hash IS NOT NULL
                 ORDER BY ms.display_seq DESC LIMIT 1) AS ms_id
  FROM cur_gw w LEFT JOIN primary_engine e ON e.role_id = w.rid
), base AS (
  SELECT r.workspace_id, r.id AS role_id, r.display_id, e.engine_slug, e.account_id AS engine_account_id,
         COALESCE(dn.dn_tok, 0)  AS dna_tokens,
         COALESCE(d.in_tok, 0)   AS instruction_tokens,
         COALESCE(d.rules_tok, 0) AS house_rules_tokens,
         COALESCE(d.pos_tok, 0)  AS position_tokens,
         COALESCE(sk.sk_tok, 0)  AS skill_index_tokens,
         COALESCE((SELECT cp.frame_tokens FROM compiled_prompts cp WHERE cp.id = g.gc_id), 28) AS frame_tokens,  -- 28 = khung compiler v1 (có Nội quy)
         -- v2.2 (CNS-036): Polaris = luật chơi tĩnh (prefix) + phần dự trữ worst-case của hậu tố động; chưa biên dịch: giữ chỗ trần 80
         COALESCE((SELECT SUM(s.token_count) FROM compiled_prompt_segments s
                   WHERE s.compiled_prompt_id = g.gc_id AND s.source_kind IN ('polaris_rules', 'polaris')), 80) AS polaris_tokens,
         (SELECT s.token_count FROM compiled_prompt_segments s
           WHERE s.compiled_prompt_id = g.gc_id AND s.source_kind = 'polaris_rules') AS polaris_rules_tokens,
         (SELECT s.token_count FROM compiled_prompt_segments s
           WHERE s.compiled_prompt_id = g.gc_id AND s.source_kind = 'polaris') AS polaris_suffix_reserve_tokens,
         -- v2.2.3 (Gen): chưa đo → ƯỚC LƯỢNG = max(overhead đo của tài khoản CÙNG engine trong workspace) × 1,1 (làm tròn lên);
         -- chưa có số đo nào của engine đó → setting budget.runtime_overhead_estimate_tokens (mặc định 250). Bỏ hằng 400 (gấp đôi số đo ~204).
         COALESCE(e.baseline_tok,
                  (SELECT (MAX(x.runtime_overhead_tokens) * 11 + 9) / 10 FROM engine_accounts x        -- max(đo, cùng engine) × 1,1, làm tròn lên
                    WHERE x.workspace_id = r.workspace_id AND x.engine_slug = e.engine_slug
                      AND x.runtime_overhead_tokens IS NOT NULL AND x.deleted_at IS NULL),
                  COALESCE((SELECT CAST(st.value_json AS INTEGER) FROM settings st WHERE st.workspace_id = r.workspace_id
                            AND st.key = 'budget.runtime_overhead_estimate_tokens' AND st.deleted_at IS NULL), 250)) AS baseline_overhead_tokens,
         CASE WHEN e.baseline_tok IS NOT NULL THEN NULL
              WHEN EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = r.workspace_id AND x.engine_slug = e.engine_slug
                           AND x.runtime_overhead_tokens IS NOT NULL AND x.deleted_at IS NULL) THEN 'same_engine'
              ELSE 'setting' END AS overhead_estimate_basis,
         -- v2.2.1 (CNS-047): 'estimated' (nhãn "ước lượng") — Ký giấy khai sinh dùng được; Cấp thẻ đòi 'measured'
         CASE WHEN e.baseline_tok IS NULL THEN 'estimated' ELSE 'measured' END AS overhead_source,
         (SELECT cp.status FROM compiled_prompts cp WHERE cp.id = g.gc_id) AS compiled_status,
         (SELECT cp.tokenizer FROM compiled_prompts cp WHERE cp.id = g.gc_id) AS compiled_tokenizer,
         -- v2.3.1: token prompt ĐO THẬT của bản 'worst' = phiên đo − phiên baseline vỏ (overhead_shell_session_id) của tài khoản chính; âm / thiếu ⇒ NULL
         m.ms_id AS measured_prompt_session_id,
         (SELECT ms.tokens_input - sh.tokens_input FROM sessions ms JOIN engine_accounts xa ON xa.id = e.account_id
            JOIN sessions sh ON sh.id = xa.overhead_shell_session_id
          WHERE ms.id = m.ms_id AND ms.tokens_input >= sh.tokens_input) AS measured_prompt_tokens,
         COALESCE(te.tool_tok, 0) AS tool_definition_tokens,
         COALESCE(w.cond_tok, 0) AS conditional_worst_extra,
         COALESCE(p.pend_tok, 0) AS pending_delta,
         r.prompt_budget_tokens  AS budget
  FROM roles r
  LEFT JOIN primary_engine e ON e.role_id = r.id
  LEFT JOIN cur_gc g ON g.rid = r.id
  LEFT JOIN meas m ON m.rid = r.id
  LEFT JOIN dn ON dn.rid = r.id          LEFT JOIN in_default d ON d.rid = r.id
  LEFT JOIN in_worst w ON w.rid = r.id   LEFT JOIN sk ON sk.rid = r.id
  LEFT JOIN pend p ON p.rid = r.id       LEFT JOIN tools_extra te ON te.rid = r.id
  WHERE r.deleted_at IS NULL
), tot AS (
  SELECT b.*,
         dna_tokens + instruction_tokens + house_rules_tokens + position_tokens + skill_index_tokens + frame_tokens + polaris_tokens
           AS compiled_tokens,
         baseline_overhead_tokens + tool_definition_tokens AS runtime_overhead_tokens,
         measured_prompt_tokens + baseline_overhead_tokens + tool_definition_tokens AS card_total_worst   -- v2.3.1: NULL khi chưa đo
  FROM base b
)
SELECT t.*,
       compiled_tokens + runtime_overhead_tokens AS total_default,
       compiled_tokens + runtime_overhead_tokens + conditional_worst_extra AS total_worst,
       budget - (compiled_tokens + runtime_overhead_tokens + conditional_worst_extra) AS headroom,
       -- MỘT quy tắc màu cho mọi màn (CNS-004): xanh < 75% ≤ vàng ≤ 100% < đỏ, áp lên total_worst
       CASE WHEN compiled_tokens + runtime_overhead_tokens + conditional_worst_extra > budget THEN 'over'
            WHEN (compiled_tokens + runtime_overhead_tokens + conditional_worst_extra) * 4 >= budget * 3 THEN 'near'
            ELSE 'ok' END AS budget_state,
       CASE WHEN overhead_source = 'measured' THEN 'đo thật' ELSE 'ước lượng' END AS overhead_label,
       -- v2.2.1 (CNS-044) + v2.2.2 (Gen, D20): khối Polaris (luật chơi + dự trữ ★) đo từ bản biên dịch; > 80 = CẢNH BÁO (mục tiêu), không chặn
       polaris_tokens AS polaris_block_tokens,
       CASE WHEN polaris_tokens > 80
            THEN 'khối Polaris ' || polaris_tokens || ' > 80 token (mục tiêu; luật chơi ' || COALESCE(polaris_rules_tokens, '?') || ' + ★ '
                 || COALESCE(polaris_suffix_reserve_tokens, '?') || ') — rút gọn: P4 về khối Giá trị, chú giải ★ vào khung, P1–P4 chỉ còn số + động từ'
            END AS polaris_warning,
       -- v2.3.1 (CNS-154): nguồn của phần prompt — 'measured' khi có số đo thật của bản 'worst' cùng thế hệ, còn lại 'estimated' (ước lượng của compiler)
       CASE WHEN measured_prompt_tokens IS NOT NULL THEN 'measured' ELSE 'estimated' END AS prompt_source,
       CASE WHEN measured_prompt_tokens IS NOT NULL THEN 'đo thật' ELSE 'ước lượng' END AS prompt_label,
       CASE WHEN measured_prompt_tokens IS NOT NULL THEN 'measured:' || engine_slug ELSE compiled_tokenizer END AS prompt_tokenizer,
       -- v2.2.1 (CNS-047): Ký — được dùng overhead ước lượng; v2.2.2: chỉ CHẶN theo tổng ngân sách (M3, ≤ 2.000) và các điều kiện cứng; khối Polaris dài
       -- chỉ cảnh báo. v2.3.1 (CNS-154): Ký dùng ƯỚC LƯỢNG (token_count của compiler, đã gồm biên ×1,15 — G-27); Cấp thẻ dùng SỐ ĐO THẬT (card_total_worst =
       -- token prompt đo của bản 'worst' + overhead đo + định nghĩa tool không built-in), đòi overhead đo + luật chơi đã biên dịch + bản biên dịch ok;
       -- ước lượng không bao giờ mở cổng Cấp thẻ.
       CASE WHEN compiled_tokens + runtime_overhead_tokens + conditional_worst_extra <= budget THEN 1 ELSE 0 END AS sign_ok,
       CASE WHEN card_total_worst <= budget
             AND overhead_source = 'measured' AND polaris_rules_tokens IS NOT NULL AND compiled_status IS 'ok' THEN 1 ELSE 0 END AS card_ok,
       CASE WHEN card_total_worst <= budget
             AND overhead_source = 'measured' AND polaris_rules_tokens IS NOT NULL AND compiled_status IS 'ok' THEN 1 ELSE 0 END AS gate_ok,   -- = card_ok (tên cũ)
       CASE WHEN compiled_tokens + runtime_overhead_tokens + conditional_worst_extra > budget
              THEN 'vượt ngân sách: nặng nhất ' || (compiled_tokens + runtime_overhead_tokens + conditional_worst_extra) || ' / ' || budget
            END AS sign_block_reason,
       CASE WHEN compiled_status IS 'failed' THEN 'bản biên dịch mới nhất lỗi — biên dịch lại'
            WHEN polaris_rules_tokens IS NULL THEN 'chưa biên dịch luật chơi Polaris bằng tokenizer của engine'
            WHEN overhead_source <> 'measured' THEN 'overhead runtime chưa đo — đang dùng ước lượng ' || baseline_overhead_tokens
                 || ' (' || CASE overhead_estimate_basis WHEN 'same_engine' THEN 'max đo cùng engine × 1,1' ELSE 'setting' END || '; Ký được, Cấp thẻ chưa)'
            WHEN measured_prompt_tokens IS NULL THEN 'token prompt chưa đo thật — chạy phiên đo bản biên dịch nặng nhất (Cấp thẻ không dùng ước lượng)'
            WHEN card_total_worst > budget
              THEN 'vượt ngân sách (đo thật): nặng nhất ' || card_total_worst || ' / ' || budget
            END AS card_block_reason
FROM tot t;

-- Leaderboard ₲ (MVP theo Polaris): hạng cạnh tranh (đồng hạng khi bằng số dư: 1,1,3), khoảng cách tới hạng trên, Δ7 ngày
-- v2.2.1 (CNS-048): "₲ kiếm được 7 ngày" = Σ reward + honesty_reward trong 7 ngày (thu nhập từ việc; trừ phần đã bị đảo vì ghi nhầm);
-- KHÔNG gồm cấp phát, KHÔNG gồm phạt. Δ7 = biến động ròng của số dư, gồm mọi thứ. Chỉ hiển thị — hạng vẫn theo số dư (PRODUCT-SPEC A9).
CREATE VIEW v_leaderboard AS
WITH elig AS (
  SELECT w.workspace_id, w.role_id, w.id AS wallet_id, w.balance_minor, r.display_id, r.name, r.condition
  FROM wallets w JOIN roles r ON r.id = w.role_id
  WHERE w.owner_kind = 'role' AND w.status = 'active' AND r.deleted_at IS NULL
    AND r.lifecycle_status IN ('carded', 'suspended')
), ranked AS (
  SELECT e.workspace_id, e.role_id, e.wallet_id, e.balance_minor, e.display_id, e.name, e.condition,
         RANK() OVER (PARTITION BY e.workspace_id ORDER BY e.balance_minor DESC) AS rank,
         COUNT(*) OVER (PARTITION BY e.workspace_id) AS total_roles
  FROM elig e
)
SELECT k.workspace_id, k.role_id, k.wallet_id, k.display_id, k.name, k.condition, k.balance_minor, k.rank, k.total_roles,
       (SELECT MIN(x.balance_minor) FROM ranked x WHERE x.workspace_id = k.workspace_id AND x.balance_minor > k.balance_minor)
         - k.balance_minor AS gap_to_next_minor,
       COALESCE((SELECT SUM(CASE WHEN l.credit_wallet_id = k.wallet_id THEN l.amount_minor ELSE -l.amount_minor END)
                 FROM ledger_entries l
                 WHERE (l.credit_wallet_id = k.wallet_id OR l.debit_wallet_id = k.wallet_id)
                   AND l.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')), 0) AS delta_7d_minor,
       COALESCE((SELECT SUM(CASE WHEN l.credit_wallet_id = k.wallet_id THEN l.amount_minor ELSE -l.amount_minor END)
                 FROM ledger_entries l
                 WHERE (l.credit_wallet_id = k.wallet_id OR l.debit_wallet_id = k.wallet_id)
                   AND l.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
                   AND (l.entry_type IN ('reward', 'honesty_reward')
                        OR (l.entry_type = 'reversal' AND (SELECT o.entry_type FROM ledger_entries o WHERE o.id = l.reverses_entry_id)
                            IN ('reward', 'honesty_reward')))), 0) AS earned_7d_minor
FROM ranked k;

-- Polaris (bảng mục tiêu của từng Role, quyết định 2026-10-15): đích cố định từ gen truy cầu + vị thế hiện tại + cơ hội. Luật chơi ở compiler.
CREATE VIEW v_role_polaris AS
SELECT r.workspace_id, r.id AS role_id, r.display_id, r.name,
       (SELECT f.value_json FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id
         WHERE f.role_id = r.id AND d.key = 'drive.goal' AND f.deleted_at IS NULL) AS goal_value_json,
       lb.balance_minor, lb.rank, lb.total_roles, lb.gap_to_next_minor, lb.delta_7d_minor, lb.earned_7d_minor,
       lp.id AS last_penalty_entry_id, lp.display_id AS last_penalty_display_id, lp.amount_minor AS last_penalty_minor,
       lp.penalty_class AS last_penalty_class,
       (SELECT m.display_id FROM memories m WHERE m.evidence_ledger_entry_id = lp.id AND m.kind = 'lesson'
          AND m.status = 'active' AND m.deleted_at IS NULL ORDER BY m.display_seq DESC LIMIT 1) AS last_penalty_lesson_display_id,
       r.condition,
       (SELECT w.display_id FROM role_wounds w WHERE w.role_id = r.id AND w.ended_at IS NULL) AS open_wound_display_id,
       (SELECT count(*) FROM tasks t WHERE t.workspace_id = r.workspace_id AND t.status = 'todo' AND t.assignee_role_id IS NULL
          AND t.deleted_at IS NULL
          AND (t.position_id IS NULL OR t.position_id = (SELECT a.position_id FROM assignments a
               WHERE a.role_id = r.id AND a.status = 'active' AND a.deleted_at IS NULL))) AS open_opportunities,
       (SELECT count(*) FROM polaris_checks c WHERE c.role_id = r.id
          AND c.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')) AS polaris_checks_7d
FROM roles r
LEFT JOIN v_leaderboard lb ON lb.role_id = r.id
LEFT JOIN ledger_entries lp ON lp.id = (SELECT l.id FROM ledger_entries l JOIN wallets w ON w.id = l.debit_wallet_id
                                        WHERE w.role_id = r.id AND l.entry_type = 'penalty' ORDER BY l.display_seq DESC LIMIT 1)
WHERE r.deleted_at IS NULL;

CREATE VIEW v_roles AS
SELECT r.workspace_id, r.id AS role_id, r.display_id, r.display_seq, r.name, r.color, r.avatar_id,
       r.lifecycle_status, r.runtime_state, r.runtime_detail, r.condition,
       ea.engine_slug, eb.model_key, ps.title AS position_title,
       w.balance_minor, lb.rank AS coin_rank, lb.total_roles,
       (SELECT COALESCE(SUM(u.tokens_input + u.tokens_output), 0) FROM usage_daily u
         WHERE u.role_id = r.id AND u.day_local = date('now')) AS tokens_today,
       (SELECT count(*) FROM role_skills rs WHERE rs.role_id = r.id AND rs.status = 'learned' AND rs.deleted_at IS NULL) AS skills_count,
       (SELECT count(*) FROM memories m WHERE m.status = 'active' AND m.deleted_at IS NULL
          AND (m.role_id = r.id OR m.position_id = a.position_id)) AS memories_count,
       b.total_default AS prompt_tokens, b.total_worst AS prompt_tokens_worst, b.budget AS prompt_budget, b.budget_state,
       r.last_active_at
FROM roles r
LEFT JOIN assignments a ON a.role_id = r.id AND a.status = 'active' AND a.deleted_at IS NULL
LEFT JOIN positions ps ON ps.id = a.position_id
LEFT JOIN engine_bindings eb ON eb.role_id = r.id AND eb.workspace_id = r.workspace_id AND eb.priority = 1 AND eb.deleted_at IS NULL
LEFT JOIN engine_accounts ea ON ea.id = eb.engine_account_id AND ea.workspace_id = eb.workspace_id
LEFT JOIN wallets w ON w.role_id = r.id
LEFT JOIN v_leaderboard lb ON lb.role_id = r.id
LEFT JOIN v_role_prompt_budget b ON b.role_id = r.id
WHERE r.deleted_at IS NULL;

CREATE VIEW v_dna_sheet AS
SELECT f.workspace_id, f.role_id, f.id AS dna_field_id, f.display_id, d.field_group, d.key, f.item_index,
       f.value_json, f.value_num, f.prose, d.value_type, f.source, f.confirmed_at, d.tier, d.is_core, d.prompt_layer,
       f.is_in_prompt, f.covered_by_instruction_id, f.token_count, f.version, f.status
FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id
WHERE f.deleted_at IS NULL;

-- Cây kỹ năng + cây tri thức (INT-17): node = chính SK-/KN-; bậc = vị trí trong chuỗi upgrade (tính ra, không cố định số bậc)
CREATE VIEW v_tree_nodes AS
WITH RECURSIVE tiers(skill_id, tier) AS (
  SELECT s.id, 1 FROM skills s
  WHERE s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM skill_prereqs p WHERE p.skill_id = s.id AND p.kind = 'upgrade'
                                             AND p.status <> 'obsolete' AND p.deleted_at IS NULL)
  UNION ALL
  SELECT p.skill_id, t.tier + 1 FROM skill_prereqs p JOIN tiers t ON p.requires_skill_id = t.skill_id
  WHERE p.kind = 'upgrade' AND p.status <> 'obsolete' AND p.deleted_at IS NULL AND t.tier < 50
)
SELECT s.workspace_id, 'skill' AS domain, 'SK' AS entity_type, s.id AS node_id, s.display_id, s.slug AS name, s.status,
       c.id AS category_id, c.display_id AS category_display_id, c.name AS category_name,
       br.display_id AS branch_display_id, br.name AS branch_name, g.display_id AS group_display_id, g.name AS group_name,
       t.tier, s.tier_label,
       (SELECT count(*) FROM skill_prereqs p WHERE p.skill_id = s.id AND p.status <> 'obsolete' AND p.deleted_at IS NULL) AS prereq_count,
       'tree:skills/node:' || s.display_id AS anchor
FROM skills s
LEFT JOIN tiers t ON t.skill_id = s.id
LEFT JOIN taxonomy_nodes c ON c.id = s.category_id
LEFT JOIN taxonomy_nodes br ON br.id = c.parent_id
LEFT JOIN taxonomy_nodes g ON g.id = br.parent_id
WHERE s.deleted_at IS NULL
UNION ALL
SELECT k.workspace_id, 'knowledge', 'KN', k.id, k.display_id, k.title, k.status,
       c.id, c.display_id, c.name, br.display_id, br.name, g.display_id, g.name, NULL, NULL, 0,
       'tree:knowledge/node:' || k.display_id
FROM knowledge_items k
LEFT JOIN taxonomy_nodes c ON c.id = k.category_id
LEFT JOIN taxonomy_nodes br ON br.id = c.parent_id
LEFT JOIN taxonomy_nodes g ON g.id = br.parent_id
WHERE k.deleted_at IS NULL AND k.status IN ('active', 'proposed');

-- Trạng thái node theo từng Role (đã học · mở được · khoá · đề xuất); bậc node ≠ mức thành thạo (proficiency của Role)
CREATE VIEW v_role_skill_tree AS
SELECT r.workspace_id, r.id AS role_id, s.id AS skill_id, s.display_id, s.category_id,
       CASE WHEN rs.status = 'learned' THEN 'learned'
            WHEN rs.status = 'disabled' THEN 'disabled'
            WHEN rs.status = 'proposed' OR s.status = 'proposed' THEN 'proposed'
            WHEN NOT EXISTS (SELECT 1 FROM skill_prereqs p WHERE p.skill_id = s.id AND p.status = 'active' AND p.deleted_at IS NULL
                               AND NOT EXISTS (SELECT 1 FROM role_skills x WHERE x.role_id = r.id AND x.skill_id = p.requires_skill_id
                                                 AND x.status = 'learned' AND x.deleted_at IS NULL)) THEN 'available'
            ELSE 'locked' END AS node_state,
       rs.proficiency
FROM roles r
JOIN skills s ON s.workspace_id = r.workspace_id AND s.deleted_at IS NULL AND s.status <> 'obsolete'
LEFT JOIN role_skills rs ON rs.role_id = r.id AND rs.skill_id = s.id AND rs.deleted_at IS NULL
WHERE r.deleted_at IS NULL;

-- Mount mong muốn của container (CNS-001, Q-R1): /auth của tài khoản CHỈ ở container của consumer duy nhất; không mount /brain, /position
-- v2.2.4 (CNS-065): KHÔNG mount /workspace — workspace dự án là GĐ2 (bảng dự trữ workspace_volumes); GĐ2 thêm một nhánh UNION ở đây
-- v2.1.1 (tenant-isolation): tài khoản phải CÙNG workspace với container — lớp phòng thủ thứ hai sau trigger engine_bindings_ws_*
CREATE VIEW v_container_mounts AS
SELECT c.workspace_id, c.id AS container_id, c.display_id AS container_display_id, c.kind, c.role_id,
       'auth' AS volume_kind, a.auth_volume AS volume_name, '/auth/' || lower(a.display_id) AS mount_path, 'rw' AS mode,
       a.id AS engine_account_id
FROM containers c
JOIN engine_bindings b ON b.deleted_at IS NULL AND b.is_enabled = 1 AND b.workspace_id = c.workspace_id
     AND ((c.kind = 'role' AND b.role_id = c.role_id) OR (c.kind = 'system' AND b.consumer_kind = 'system'))
JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = c.workspace_id
     AND a.auth_volume IS NOT NULL AND a.deleted_at IS NULL
WHERE c.deleted_at IS NULL
UNION ALL
SELECT c.workspace_id, c.id, c.display_id, c.kind, c.role_id, 'session_tmpfs', NULL, '/run/ga', 'rw', NULL
FROM containers c WHERE c.deleted_at IS NULL;

-- Cửa sổ quota mới nhất của từng tài khoản (CNS-029): dài nhất / ngắn nhất theo window_seconds — GĐ2 đọc thành máu / mana
CREATE VIEW v_quota_windows AS
WITH latest AS (
  SELECT q.workspace_id, q.engine_account_id, q.window_key, q.window_seconds, q.state, q.remaining_pct, q.reset_at,
         q.observed_at, q.source, q.confidence,
         ROW_NUMBER() OVER (PARTITION BY q.engine_account_id, q.window_key ORDER BY q.observed_at DESC, q.id DESC) AS rn
  FROM quota_snapshots q
), cur AS (SELECT * FROM latest WHERE rn = 1)
SELECT l.workspace_id, l.engine_account_id, a.display_id AS account_display_id, b.consumer_kind, b.role_id, b.priority,
       l.window_key, l.window_seconds, l.state, l.remaining_pct, l.reset_at, l.observed_at, l.source, l.confidence,
       CASE WHEN l.window_seconds IS NULL THEN 'unknown'
            WHEN l.window_seconds = (SELECT MAX(x.window_seconds) FROM cur x WHERE x.engine_account_id = l.engine_account_id) THEN 'longest'
            WHEN l.window_seconds = (SELECT MIN(x.window_seconds) FROM cur x WHERE x.engine_account_id = l.engine_account_id) THEN 'shortest'
            ELSE 'other' END AS window_rank
FROM cur l JOIN engine_accounts a ON a.id = l.engine_account_id AND a.workspace_id = l.workspace_id
LEFT JOIN engine_bindings b ON b.engine_account_id = a.id AND b.workspace_id = a.workspace_id AND b.deleted_at IS NULL;

-- v2.2.9 (CONTRACT-r8b §C, CNS-105): MỘT định nghĩa trạng thái đồng ý điều khoản của từng tài khoản (= CONSENT_OK() của schema_v2_2.py, dùng ở
--   engine_accounts_consent_i/_u, probe_runs_consent_i, CORE_READY). Dùng chung cho v_core_agent_accounts (Core agent), v_engine_accounts (Role, A3.E)
--   và v_setup_checklist (OB-05). consent_state:
--     'not_required'     engine không đòi đồng ý (Claude Code);
--     'missing'          chưa đồng ý / đồng ý khác workspace, khác engine, khác loại / đã rút / lời cảnh báo đổi version;
--     'identity_changed' đồng ý còn hợp lệ nhưng gắn DANH TÍNH khác (consents.account_hint ≠ account_hint hiện tại — đăng nhập ra tài khoản khác)
--                        ⇒ đồng ý cũ hết hiệu lực, tick lại = CN- mới (giữ EN-/EB-);
--     'ok'               hợp lệ (danh tính chưa gắn — NULL — hoặc trùng).
CREATE VIEW v_account_consent AS
SELECT a.workspace_id, a.id AS engine_account_id, a.display_id AS account_display_id, a.engine_slug, a.account_hint,
       a.consent_id, cn.display_id AS consent_display_id, cn.account_hint AS consent_account_hint, cn.accepted_at AS consent_accepted_at,
       CASE WHEN COALESCE(e.requires_consent, 1) = 0 THEN 'not_required'
            WHEN cn.id IS NULL OR cn.workspace_id IS NOT a.workspace_id OR cn.consent_kind IS NOT 'engine_tos_risk' OR cn.subject IS NOT a.engine_slug
                 OR cn.revoked_at IS NOT NULL OR cn.notice_version IS NOT e.tos_notice_version THEN 'missing'
            WHEN cn.account_hint IS NOT NULL AND cn.account_hint IS NOT a.account_hint THEN 'identity_changed'
            ELSE 'ok' END AS consent_state
FROM engine_accounts a
LEFT JOIN engines e ON e.slug = a.engine_slug
LEFT JOIN consents cn ON cn.id = a.consent_id;

-- v2.2.6 (CONTRACT-r6 A4): MỘT định nghĩa "sẵn sàng" cho tài khoản Core agent = CORE_READY() của trigger roles_core_agent_ready_i
--   (schema_v2_2.py): binding Hệ thống sống + bật, tài khoản active cùng loại ST-0017, login_status = logged_in (cache lần kiểm mới nhất từ mọi
--   nguồn) VÀ lần kiểm đăng nhập mới nhất (probe_runs trigger='login_check' đã xong, trong container AI Hệ thống sống; mới nhất = display_seq)
--   = ok. Subscription và API key như nhau (không còn 'not_applicable'). is_primary = tài khoản chính (priority nhỏ nhất trong số binding
--   sống + bật + active) — tác tử hệ thống luôn dùng tài khoản này (v_system_agents). Sửa một chỗ thì sửa cả hai.
--   v2.2.8: + consent_ok (CONTRACT-r7 §A) + quota_state <> 'exhausted' + outage_since IS NULL (CONTRACT-r8 §C: 4 sự cố đều làm mất sẵn sàng).
--   CONTRACT-r8 §A: chỉ còn MỘT binding Hệ thống (một tài khoản mỗi loại CLI) ⇒ view có tối đa một hàng mỗi workspace, is_primary = 1 khi
--   binding bật + tài khoản active + đúng loại; không còn "dự phòng".
--   v2.2.9 (CONTRACT-r8b): consent_ok / consent_state đọc từ v_account_consent (+ danh tính, §C); login_status 'in_progress' ⇒ not_ready_reason
--   'relogin_in_progress' (đang đăng nhập lại, §B/§C).
--   v2.2.10 (CONTRACT-r8c §A, Q-R8a): sau khi owner đổi loại Core agent lúc sự cố, view có HAI hàng mỗi workspace — binding cũ đã TẮT (khác loại,
--   not_ready_reason 'wrong_type', is_primary 0, giữ làm lịch sử, không xoá) và binding mới; tài khoản mới đang đăng nhập (chưa từng kiểm đạt) ⇒
--   'type_change_in_progress'. Luật "cùng loại Core agent" chỉ xét binding đang bật (engine_bindings_core_agent_i/_u, v_integrity.core_agent_mismatch).
--   v2.2.11 (CONTRACT-r8d §E, CNS-123 — [ĐỀ XUẤT — Gen vòng 8d]): relogin_in_progress / type_change_in_progress kéo dài QUÁ 15 phút kể từ mốc
--   engine_accounts.login_started_at (DB tự ghi) ⇒ 'login_stalled' "đăng nhập bị bỏ dở" (SỰ CỐ); mốc NULL ⇒ cũng login_stalled (fail-closed). Đồng hồ =
--   app_now() (app đăng ký ở mọi kết nối, như app_maint()) — = LOGIN_STALLED() của schema_v2_2.py (CORE_CALM); sửa một chỗ thì sửa cả hai.
--   v2.3.1 (BUILD-PLAN §F.6 n, CNS-137 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]): engine_install_state = trạng thái cài CLI của loại tài khoản (engine_installs;
--   thiếu hàng ⇒ 'not_installed'); khác 'installed' ⇒ không sẵn sàng, not_ready_reason 'engine_not_installed' (ngay sau container_missing — không có CLI thì
--   không đăng nhập / kiểm được gì) — = ENGINE_INSTALLED() trong CORE_READY / CORE_CALM của schema_v2_2.py; sửa một chỗ thì sửa cả hai.
--   v2.3.4 (contracts ENGINE_UNRESTRICTED_REASON — L-ENG toolRestriction, Gen duyệt): tool_restriction_ok = CLI của loại tài khoản đã cài VÀ app đã kiểm có cơ chế
--   giới hạn công cụ cho ĐÚNG phiên bản đang cài (engine_installs.tool_restriction_version = installed_version); 0 ⇒ không sẵn sàng, not_ready_reason
--   'engine_unrestricted' — nhánh CUỐI (owner xử lý mọi lý do khác trước; cập nhật CLI làm kết luận cũ hết hiệu lực) — = ENGINE_RESTRICTED() trong CORE_READY.
CREATE VIEW v_core_agent_accounts AS
WITH wk AS (
  SELECT w.id AS workspace_id,
         COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                   AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity') AS core_slug
  FROM workspaces w WHERE w.kind = 'tenant'
), b AS (
  SELECT b.workspace_id, b.id AS engine_binding_id, b.display_id AS binding_display_id, b.priority, b.is_enabled,
         a.id AS engine_account_id, a.display_id AS account_display_id, a.label, a.engine_slug, a.auth_method,
         a.status AS account_status, a.login_status, a.login_checked_at, a.login_started_at, a.quota_state, a.outage_since, wk.core_slug,
         -- v2.2.8 (CONTRACT-r7 §A, OB-05): đồng ý điều khoản hợp lệ (= CONSENT_OK() của schema_v2_2.py); v2.2.9: một nguồn v_account_consent (+ danh tính)
         CASE WHEN vc.consent_state IN ('not_required', 'ok') THEN 1 ELSE 0 END AS consent_ok, vc.consent_state,
         COALESCE((SELECT ei.install_state FROM engine_installs ei WHERE ei.workspace_id = b.workspace_id AND ei.engine_slug = a.engine_slug
                   AND ei.deleted_at IS NULL), 'not_installed') AS engine_install_state,                                   -- v2.3.1 (CNS-137)
         COALESCE((SELECT CASE WHEN er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version THEN 1 ELSE 0 END FROM engine_installs er WHERE er.workspace_id = b.workspace_id
                   AND er.engine_slug = a.engine_slug AND er.deleted_at IS NULL), 0) AS tool_restriction_ok,                   -- v2.3.4
         (SELECT lp.id FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = b.workspace_id
            AND lc.kind = 'system' AND lc.deleted_at IS NULL
          WHERE lp.engine_account_id = a.id AND lp.trigger = 'login_check' AND lp.status <> 'running'
          ORDER BY lp.display_seq DESC LIMIT 1) AS last_login_check_id
  FROM engine_bindings b
  JOIN wk ON wk.workspace_id = b.workspace_id
  JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id AND a.deleted_at IS NULL
  JOIN v_account_consent vc ON vc.engine_account_id = a.id
  WHERE b.consumer_kind = 'system' AND b.deleted_at IS NULL
)
SELECT b.*, p.display_id AS last_login_check_display_id, p.status AS last_login_check_status, p.finished_at AS last_login_check_at,
       CASE WHEN b.is_enabled = 1 AND b.account_status = 'active' AND b.engine_slug = b.core_slug AND b.login_status = 'logged_in'
                 AND b.quota_state <> 'exhausted' AND b.outage_since IS NULL AND b.engine_install_state = 'installed'
                 AND p.status IS 'ok' AND b.consent_ok = 1 AND b.tool_restriction_ok = 1 THEN 1 ELSE 0 END AS is_ready,
       CASE WHEN b.engine_slug <> b.core_slug THEN 'wrong_type'
            -- v2.2.7 (CNS-093): không còn container AI Hệ thống sống (lớp hai — trigger containers_system_last_* chặn khi còn binding)
            WHEN NOT EXISTS (SELECT 1 FROM containers sc WHERE sc.workspace_id = b.workspace_id AND sc.kind = 'system'
                             AND sc.deleted_at IS NULL AND sc.desired_state <> 'absent') THEN 'container_missing'
            WHEN b.engine_install_state <> 'installed' THEN 'engine_not_installed'   -- v2.3.1 (CNS-137): CLI chưa cài / đang tải / cài lỗi
            WHEN b.consent_ok = 0 THEN 'consent_missing'        -- v2.2.8: chưa đồng ý / đã rút / lời cảnh báo đổi version
            WHEN b.is_enabled = 0 THEN 'binding_disabled'
            WHEN b.account_status <> 'active' THEN 'account_' || b.account_status
            -- v2.2.10 (CONTRACT-r8c §A, Q-R8a): owner vừa ĐỔI LOẠI Core agent lúc sự cố — tài khoản mới (gắn sau mốc khoá, CHƯA từng kiểm đăng nhập
            -- đạt trong container AI Hệ thống) đang đăng nhập ⇒ type_change_in_progress; lần kiểm của nó đã xong mà KHÔNG đạt ⇒ lý do theo lần kiểm đó
            -- (login_check_failed / _partial — SỰ CỐ, owner thấy lại "Đổi loại Core agent"); tài khoản đã từng đạt mà đăng nhập lại vẫn là relogin_in_progress
            WHEN b.login_status = 'in_progress'
                 AND (SELECT lw.core_agent_locked_at FROM workspaces lw WHERE lw.id = b.workspace_id) IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM probe_runs op JOIN containers oc ON oc.id = op.container_id AND oc.workspace_id = b.workspace_id
                                   AND oc.kind = 'system'
                                 WHERE op.engine_account_id = b.engine_account_id AND op.trigger = 'login_check' AND op.status = 'ok')
                 THEN CASE WHEN p.id IS NOT NULL THEN 'login_check_' || p.status
                           WHEN COALESCE(b.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0 THEN 'login_stalled'   -- v2.2.11 (CONTRACT-r8d §E)
                           ELSE 'type_change_in_progress' END
            WHEN b.login_status = 'in_progress'                       -- v2.2.9 (CONTRACT-r8b §B/§C): owner đang đăng nhập lại
                 THEN CASE WHEN COALESCE(b.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0 THEN 'login_stalled'   -- v2.2.11 (CONTRACT-r8d §E)
                           ELSE 'relogin_in_progress' END
            WHEN b.login_status <> 'logged_in' THEN 'login_' || b.login_status
            WHEN b.outage_since IS NOT NULL THEN 'outage'              -- v2.2.8 (CONTRACT-r8 §C): sự cố phía hãng (5xx)
            WHEN b.quota_state = 'exhausted' THEN 'quota_exhausted'   -- v2.2.8: hết quota
            WHEN p.id IS NULL THEN 'login_check_missing'
            WHEN p.status <> 'ok' THEN 'login_check_' || p.status
            WHEN b.tool_restriction_ok = 0 THEN 'engine_unrestricted' END AS not_ready_reason,                -- v2.3.4 (contracts ENGINE_UNRESTRICTED_REASON)
       CASE WHEN b.is_enabled = 1 AND b.account_status = 'active' AND b.engine_slug = b.core_slug
                 AND b.priority = (SELECT MIN(x.priority) FROM engine_bindings x JOIN engine_accounts xa ON xa.id = x.engine_account_id
                                     AND xa.workspace_id = x.workspace_id
                                   WHERE x.workspace_id = b.workspace_id AND x.consumer_kind = 'system' AND x.deleted_at IS NULL
                                     AND x.is_enabled = 1 AND xa.deleted_at IS NULL AND xa.status = 'active' AND xa.engine_slug = b.core_slug)
            THEN 1 ELSE 0 END AS is_primary
FROM b LEFT JOIN probe_runs p ON p.id = b.last_login_check_id;

-- v2.2.6 (CONTRACT-r6 A3, CNS-069): tác tử hệ thống chỉ chọn model + effort; tài khoản SUY RA = tài khoản Core agent chính (is_primary).
-- Onboarding bước 4, Engine tab "AI Hệ thống": cột Tài khoản chỉ đọc ("EN-0001 · ưu tiên 1"). Đổi thứ tự binding ⇒ cả 4 tác tử đổi cùng lúc.
CREATE VIEW v_system_agents AS
SELECT sa.workspace_id, sa.id AS system_agent_id, sa.display_id, sa.system_key, sa.model_key, sa.effort, sa.is_enabled,
       sa.selection_state, c.engine_binding_id, c.binding_display_id, c.engine_account_id, c.account_display_id,
       c.label AS account_label, c.priority AS account_priority, c.is_ready AS account_is_ready
FROM system_agents sa
LEFT JOIN v_core_agent_accounts c ON c.workspace_id = sa.workspace_id AND c.is_primary = 1
WHERE sa.deleted_at IS NULL;

-- v2.2.8 (CONTRACT-r8 §C, INT-20): trạng thái Core agent của workspace — nguồn của overlay "chế độ khắc phục" (mọi màn Admin) và của lịch AI Hệ thống.
--   mode 'setup'    = chưa khoá loại Core agent — v2.2.9 (CONTRACT-r8b §A): CHƯA có lần kiểm đăng nhập đạt nào (core_agent_locked_at NULL; trước
--                     đây: chưa gắn tài khoản) — không overlay, checklist OB-04 lo; owner còn "Chọn loại khác";
--   mode 'ok'       = tài khoản Core agent sẵn sàng (= v_core_agent_accounts.is_ready = CORE_READY() của trigger);
--   mode 'recovery' = đã khoá mà KHÔNG sẵn sàng ⇒ blocks_admin = 1: overlay chặn, không đóng được, overlay_text + nút "Xử lý ngay" (fix_target) và
--                     "Xem log" (A8); AI Hệ thống tạm dừng — DB chặn phiên (sessions_core_agent_ready_*), job giữ 'queued'; DB chặn Role mới
--                     (roles_core_agent_ready_i); Role đang làm việc VẪN CHẠY bằng CLI của chính nó (Q-I7 [CHỐT 2026-10-16]).
--   reason_text khớp chữ FS v2.4 (O4, tin Telegram §6.2): "đăng nhập hết hạn" · "sự cố từ hãng" · "hết quota" (UI nối dòng "mở lại lúc" riêng) · "tài khoản bị khoá"
--                     · v2.2.9 "đang đăng nhập lại".
--   incident_reason = lý do theo từ vựng failover_reason (login_expired / outage / quota_exhausted / account_suspended) khi khớp, NULL nếu khác.
--   v2.2.9 (CONTRACT-r8b §B — MỘT nguồn cho bảng "lý do × hành vi", CNS-098/103/105/115; [SUY LUẬN — Gen], hiện thực tối thiểu):
--     sub_reason   'identity_changed' khi reason = consent_missing vì đăng nhập ra danh tính khác (§C), NULL nếu không;
--     is_incident  1 ⇔ blocks_admin = 1 và KHÔNG phải relogin_in_progress / consent_missing do đổi danh tính ⇒ chỉ khi đó phát notifications
--                  core_agent_incident (chuông + Telegram) — trigger notifications_core_incident_i/_u đọc cột này;
--     auto_recheck 1 ⇔ blocks_admin = 1 và reason ∈ (outage, quota_exhausted): tự kiểm lại 15 → 30 → 60 phút rồi mỗi 60 phút (quota có giờ reset
--                  do hãng báo ⇒ kiểm đúng giờ đó); chỉ kiểm, không đổi tài khoản / loại CLI; lý do khác KHÔNG tự gọi lặp (nhất là tài khoản bị khoá);
--     fix_target   'a5.container' (A5 › Container (Hạ tầng)) cho container_missing, còn lại 'a5.system' (A5 › AI Hệ thống); NULL khi sẵn sàng;
--     owner_action việc owner làm (chữ theo hợp đồng); NULL khi sẵn sàng; lý do lạ ⇒ NULL (test bắt);
--     overlay_text is_incident = 1: "Core agent gặp sự cố: <reason_text>. Xử lý trước khi tiếp tục." (giữ) · còn lại khi chặn (đăng nhập lại, đổi danh
--                  tính chờ đồng ý lại): "Core agent đang đăng nhập lại. Hoàn tất đăng nhập trước khi tiếp tục.";
--     fix_hint     giữ, nay SUY RA = <màn của fix_target> || ': ' || owner_action (không còn bộ chữ riêng).
--   Không có fallback tự động: không đổi tài khoản, không đổi loại CLI.
--   v2.2.10 (CONTRACT-r8c §A/§C — Q-R8a [CHỐT 2026-10-16]; cách làm [ĐỀ XUẤT — Gen vòng 8c]):
--     reason 'type_change_in_progress' "đang đổi loại Core agent" (owner vừa đổi loại lúc sự cố, tài khoản mới đang đăng nhập): is_incident 0,
--       auto_recheck 0, fix_target a5.system, owner_action "Hoàn tất đăng nhập trong terminal", overlay_text "Core agent đang đổi loại CLI. Hoàn tất đăng
--       nhập trước khi tiếp tục.", A0 warn; kiểm đạt ⇒ ok (mốc khoá lại = lần đạt đầu tiên của tài khoản mới).
--     overlay_text khi consent_missing + sub_reason identity_changed (is_incident 0): "Tài khoản Core agent vừa đổi cần đồng ý điều khoản <core_name>. Đồng ý
--       trước khi tiếp tục." (core_name = Antigravity — loại duy nhất đòi đồng ý) — thay chữ của relogin_in_progress mà v2.2.9 mượn.
--     chọn binding đại diện: sẵn sàng trước, rồi binding ĐÚNG LOẠI ST-0017, rồi đang bật, rồi priority — sau khi đổi loại, binding cũ đã tắt (khác loại,
--       priority 1) không che binding mới (cùng thứ tự với CORE_CALM: chỉ binding đúng loại mới "êm").
--     mode 'recovery' + is_incident 1 = điều kiện duy nhất để owner đổi loại (cổng settings_core_agent_i/_u — CORE_INCIDENT của schema_v2_2.py).
--   v2.2.11 (CONTRACT-r8d §E, CNS-123 — [ĐỀ XUẤT — Gen vòng 8d]): reason 'login_stalled' "đăng nhập bị bỏ dở" (đăng nhập lại / đổi loại quá 15 phút):
--     is_incident 1 (chuông + Telegram khi có kênh), auto_recheck 0, fix_target a5.system, owner_action "Đổi tài khoản / Đăng nhập lại"; overlay dạng sự cố;
--     nút "Đổi loại Core agent" hiện lại (cổng mở vì is_incident 1).
--   v2.3.1 (BUILD-PLAN §B.8, §F.6 n, CNS-137 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]): reason 'engine_not_installed' "CLI chưa được cài" (CLI của loại Core agent
--     chưa cài / đang tải / cài lỗi — image không chứa CLI của hãng): is_incident 1 (cả lúc đang tải lại — vẫn không chạy được AI Hệ thống), auto_recheck 0,
--     fix_target a5.system, owner_action "Cài lại CLI"; cột engine_install_state = trạng thái cài CLI của LOẠI Core agent hiện hành (ST-0017; có cả khi chưa
--     có tài khoản — Onboarding bước 2). Trước mốc khoá (mode setup) không overlay — Onboarding bước 2 đọc v_engine_installs ("CLI chưa cài" + "Cài lại").
--   v2.3.2 ([Gen quyết 2026-10-16]): install_state 'installing' (owner bấm "Cài lại CLI" / đang tải) ⇒ sub_reason 'installing', KHÔNG phải sự cố
--     (is_incident 0 qua luật sub_reason, như relogin_in_progress): overlay "Đang cài CLI. Hoàn tất trước khi tiếp tục.", A0 warn, không chuông / Telegram
--     (= ENGINE_INSTALLING trong CORE_CALM); not_installed / failed / thiếu hàng vẫn là sự cố.
--   v2.3.4 (contracts ENGINE_UNRESTRICTED_REASON = 'engine_unrestricted'; chữ [ĐỀ XUẤT — lane DB]): reason 'engine_unrestricted' "CLI chưa có cơ chế giới hạn công
--     cụ đã kiểm" (runner không dựng lượt — fail-closed): is_incident 1 (cổng đổi loại mở), auto_recheck 0, fix_target a5.system, owner_action "Cài lại CLI
--     hoặc Đổi loại Core agent"; trước mốc khoá: mode setup, không overlay.
CREATE VIEW v_core_agent_status AS
WITH wk AS (
  SELECT w.id AS workspace_id, w.core_agent_locked_at,
         COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                   AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity') AS core_slug
  FROM workspaces w WHERE w.kind = 'tenant'
), x AS (
  SELECT wk.workspace_id, wk.core_agent_locked_at, wk.core_slug, COALESCE(e.name, wk.core_slug) AS core_name,
         c.engine_account_id, c.account_display_id, c.label AS account_label, c.binding_display_id, c.consent_state,
         COALESCE(c.is_ready, 0) AS is_ready,
         CASE WHEN c.is_ready = 1 THEN NULL WHEN c.engine_account_id IS NULL THEN 'no_account' ELSE c.not_ready_reason END AS reason,
         COALESCE((SELECT ei.install_state FROM engine_installs ei WHERE ei.workspace_id = wk.workspace_id AND ei.engine_slug = wk.core_slug
                   AND ei.deleted_at IS NULL), 'not_installed') AS engine_install_state                                   -- v2.3.1 (CNS-137)
  FROM wk LEFT JOIN engines e ON e.slug = wk.core_slug
  LEFT JOIN v_core_agent_accounts c ON c.workspace_id = wk.workspace_id AND c.engine_binding_id = (
       SELECT y.engine_binding_id FROM v_core_agent_accounts y WHERE y.workspace_id = wk.workspace_id
       ORDER BY y.is_ready DESC, (y.engine_slug = y.core_slug) DESC, y.is_enabled DESC, y.priority LIMIT 1)
), t AS (
  SELECT x.*,
         CASE x.reason WHEN 'no_account' THEN 'chưa có tài khoản Core agent' WHEN 'wrong_type' THEN 'tài khoản sai loại CLI'
              WHEN 'container_missing' THEN 'container AI Hệ thống không còn' WHEN 'consent_missing' THEN 'chưa có đồng ý điều khoản hợp lệ'
              WHEN 'binding_disabled' THEN 'binding Core agent đang tắt' WHEN 'account_disabled' THEN 'tài khoản bị vô hiệu'
              WHEN 'account_revoked' THEN 'tài khoản bị thu hồi' WHEN 'login_expired' THEN 'đăng nhập hết hạn'
              WHEN 'login_suspended' THEN 'tài khoản bị khoá' WHEN 'login_error' THEN 'lỗi đăng nhập'
              WHEN 'login_unknown' THEN 'chưa xác nhận đăng nhập' WHEN 'outage' THEN 'sự cố từ hãng'
              WHEN 'quota_exhausted' THEN 'hết quota' WHEN 'login_check_missing' THEN 'chưa kiểm đăng nhập'
              WHEN 'login_check_failed' THEN 'lần kiểm đăng nhập mới nhất không đạt' WHEN 'login_check_partial' THEN 'lần kiểm đăng nhập mới nhất không đạt'
              WHEN 'relogin_in_progress' THEN 'đang đăng nhập lại' WHEN 'type_change_in_progress' THEN 'đang đổi loại Core agent'
              WHEN 'login_stalled' THEN 'đăng nhập bị bỏ dở'
              WHEN 'engine_not_installed' THEN 'CLI chưa được cài'                                                             -- v2.3.1 (CNS-137)
              WHEN 'engine_unrestricted' THEN 'CLI chưa có cơ chế giới hạn công cụ đã kiểm'                                     -- v2.3.4
              END AS reason_text,
         CASE WHEN x.reason = 'consent_missing' AND x.consent_state = 'identity_changed' THEN 'identity_changed'
              WHEN x.reason = 'engine_not_installed' AND x.engine_install_state = 'installing' THEN 'installing' END AS sub_reason,   -- v2.3.2 (Gen quyết)
         CASE WHEN x.is_ready = 0 AND x.core_agent_locked_at IS NOT NULL THEN 1 ELSE 0 END AS blocks
  FROM x
), u AS (
  SELECT t.*,
         CASE WHEN t.blocks = 1 AND t.reason NOT IN ('relogin_in_progress', 'type_change_in_progress') AND t.sub_reason IS NULL THEN 1 ELSE 0 END
           AS is_incident,
         CASE WHEN t.is_ready = 1 THEN NULL WHEN t.reason = 'container_missing' THEN 'a5.container' ELSE 'a5.system' END AS fix_target,
         CASE WHEN t.is_ready = 1 THEN NULL
              WHEN t.reason = 'outage' THEN 'Chờ hãng hồi phục hoặc bấm Kiểm tra lại'
              WHEN t.reason = 'quota_exhausted' THEN 'Chờ quota mở lại, bấm Kiểm tra lại, hoặc Đổi tài khoản / Đăng nhập lại'
              WHEN t.reason IN ('login_expired', 'login_error', 'login_unknown', 'login_check_missing', 'login_check_failed', 'login_check_partial',
                                'no_account', 'wrong_type', 'binding_disabled', 'account_disabled', 'account_revoked', 'login_stalled')
                   THEN 'Đổi tài khoản / Đăng nhập lại'
              WHEN t.reason = 'login_suspended' THEN 'Đổi tài khoản / Đăng nhập lại (tài khoản khác) hoặc dùng API key'
              WHEN t.reason = 'consent_missing' THEN 'Đồng ý lại điều khoản ' || t.core_name
              WHEN t.reason = 'container_missing' THEN 'Dựng lại container AI Hệ thống'
              WHEN t.reason IN ('relogin_in_progress', 'type_change_in_progress') THEN 'Hoàn tất đăng nhập trong terminal'
              WHEN t.reason = 'engine_not_installed' THEN 'Cài lại CLI'                                                   -- v2.3.1 (CNS-137)
              WHEN t.reason = 'engine_unrestricted' THEN 'Cài lại CLI hoặc Đổi loại Core agent'                            -- v2.3.4
              END AS owner_action
  FROM t
)
SELECT u.workspace_id, u.core_slug, u.core_name, u.core_agent_locked_at, u.engine_account_id, u.account_display_id, u.account_label,
       u.binding_display_id, u.is_ready, u.engine_install_state,
       CASE WHEN u.is_ready = 1 THEN 'ok' WHEN u.core_agent_locked_at IS NULL THEN 'setup' ELSE 'recovery' END AS mode,
       u.blocks AS blocks_admin,
       u.reason, u.reason_text, u.sub_reason,
       CASE u.reason WHEN 'login_expired' THEN 'login_expired' WHEN 'login_suspended' THEN 'account_suspended'
                     WHEN 'outage' THEN 'outage' WHEN 'quota_exhausted' THEN 'quota_exhausted' END AS incident_reason,
       u.is_incident,
       CASE WHEN u.blocks = 1 AND u.reason IN ('outage', 'quota_exhausted') THEN 1 ELSE 0 END AS auto_recheck,
       u.fix_target, u.owner_action,
       CASE WHEN u.blocks = 0 THEN NULL
            WHEN u.is_incident = 1 THEN 'Core agent gặp sự cố: ' || COALESCE(u.reason_text, u.reason) || '. Xử lý trước khi tiếp tục.'
            WHEN u.reason = 'type_change_in_progress' THEN 'Core agent đang đổi loại CLI. Hoàn tất đăng nhập trước khi tiếp tục.'
            WHEN u.sub_reason = 'identity_changed'
                 THEN 'Tài khoản Core agent vừa đổi cần đồng ý điều khoản ' || u.core_name || '. Đồng ý trước khi tiếp tục.'
            WHEN u.sub_reason = 'installing' THEN 'Đang cài CLI. Hoàn tất trước khi tiếp tục.'                                 -- v2.3.2 (Gen quyết)
            ELSE 'Core agent đang đăng nhập lại. Hoàn tất đăng nhập trước khi tiếp tục.' END AS overlay_text,
       CASE WHEN u.is_ready = 1 THEN NULL
            ELSE CASE u.fix_target WHEN 'a5.container' THEN 'A5 › Container (Hạ tầng)' ELSE 'A5 › AI Hệ thống' END || ': ' || u.owner_action
            END AS fix_hint
FROM u;

-- v2.2.8 (CONTRACT-r8 §C): danh sách "Loại Core agent" ở Onboarding bước 2 = engine core_capable = 1 (antigravity, claude-code, openclaw).
--   selectable = adapter_status 'ready' (= điều kiện CORE_VALID của trigger settings_core_agent_*); loại chưa ready hiện mờ kèm badge ("sắp có").
--   is_default = mặc định registry 'antigravity' (Q-I5 [CHỐT 2026-10-16]) — cùng hằng CORE_DEFAULT của schema_v2_2.py.
CREATE VIEW v_core_agent_options AS
SELECT e.slug, e.name, e.vendor, e.cli_binary, e.adapter_status, e.priority_order, e.requires_consent,
       CASE WHEN e.adapter_status = 'ready' THEN 1 ELSE 0 END AS selectable,
       CASE WHEN e.slug = 'antigravity' THEN 1 ELSE 0 END AS is_default,
       CASE WHEN e.adapter_status = 'ready' THEN NULL WHEN e.adapter_status = 'coming_soon' THEN 'sắp có' ELSE e.adapter_status END AS badge
FROM engines e WHERE e.core_capable = 1;

-- v2.2.6 (CONTRACT-r6 B1.1): lưới thẻ + cờ LỆCH LÕI. Sửa lõi không tự thu hồi thẻ: core_drift = 1 khi thẻ còn hiệu lực (issued/suspended)
-- mà revision hiện hành của Role có major lớn hơn revision lúc cấp (lõi ⇒ version lớn, DB ép — §7.3). Cấp lại ⇒ thẻ cũ superseded.
CREATE VIEW v_employee_cards AS
SELECT c.workspace_id, c.id AS card_id, c.display_id AS card_display_id, c.role_id, r.display_id AS role_display_id, r.name,
       c.status, c.issued_at, c.issue_audit_display_id, c.dna_signature, c.prompt_tokens,
       cr.major AS card_major, cr.minor AS card_minor, nr.major AS current_major, nr.minor AS current_minor,
       s.display_id AS superseded_by_display_id,
       CASE WHEN c.status IN ('issued', 'suspended') AND nr.major > cr.major THEN 1 ELSE 0 END AS core_drift
FROM employee_cards c
JOIN roles r ON r.id = c.role_id AND r.workspace_id = c.workspace_id
JOIN revisions cr ON cr.id = c.revision_id AND cr.workspace_id = c.workspace_id
LEFT JOIN revisions nr ON nr.id = r.current_revision_id AND nr.workspace_id = r.workspace_id
LEFT JOIN employee_cards s ON s.id = c.superseded_by_id AND s.workspace_id = c.workspace_id
WHERE c.deleted_at IS NULL;

-- v2.2.6 (CONTRACT-r6 B1.4): tin gửi Role lúc Trọng thương — được LƯU vào hội thoại (chat_messages), KHÔNG tạo việc (tasks_wounded_*),
-- không tự xử lý khi hồi phục. Owner thấy danh sách + nút "Giao lại" (tạo việc với tasks.source_message_id = tin ⇒ hết chờ).
CREATE VIEW v_wound_messages AS
SELECT m.workspace_id, w.id AS role_wound_id, w.display_id AS wound_display_id, w.role_id, r.display_id AS role_display_id, r.name,
       CASE WHEN w.ended_at IS NULL THEN 1 ELSE 0 END AS wound_open,
       m.id AS message_id, m.display_id AS message_display_id, m.created_at, m.author_kind, m.channel,
       th.id AS thread_id, th.display_id AS thread_display_id, th.kind AS thread_kind,
       (SELECT t.display_id FROM tasks t WHERE t.source_message_id = m.id AND t.workspace_id = m.workspace_id AND t.deleted_at IS NULL
        ORDER BY t.display_seq LIMIT 1) AS reassigned_task_display_id,
       CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.source_message_id = m.id AND t.workspace_id = m.workspace_id AND t.deleted_at IS NULL)
            THEN 0 ELSE 1 END AS is_pending
FROM role_wounds w
JOIN roles r ON r.id = w.role_id AND r.workspace_id = w.workspace_id
JOIN chat_threads th ON th.workspace_id = w.workspace_id AND th.role_id = w.role_id AND th.agent = 'role'
     AND th.kind IN ('telegram', 'workspace') AND th.deleted_at IS NULL
JOIN chat_messages m ON m.thread_id = th.id AND m.workspace_id = w.workspace_id
WHERE m.author_kind IN ('owner', 'user', 'external') AND m.created_at >= w.started_at
  AND (w.ended_at IS NULL OR m.created_at < w.ended_at);

CREATE VIEW v_attention AS
SELECT f.workspace_id, 'warn' AS level, f.display_id AS target, 'DN chờ xác nhận' AS what, f.role_id
  FROM dna_fields f WHERE f.deleted_at IS NULL AND (f.status = 'proposed' OR (f.source = 'ai_inferred' AND f.confirmed_at IS NULL))
UNION ALL
SELECT p.workspace_id, 'warn', p.display_id, 'Xin quyền ' || p.requested_tool_slug, p.role_id
  FROM permission_requests p WHERE p.status = 'pending' AND p.deleted_at IS NULL
UNION ALL
SELECT m.workspace_id, 'info', m.display_id, CASE WHEN m.kind = 'lesson' THEN 'Bài học chờ duyệt' ELSE 'Trí nhớ đề xuất' END, m.role_id
  FROM memories m WHERE m.status = 'proposed' AND m.deleted_at IS NULL
UNION ALL
SELECT c.workspace_id, 'info', c.display_id, c.title, c.role_id
  FROM change_sets c WHERE c.status = 'open' AND c.deleted_at IS NULL
UNION ALL
SELECT t.workspace_id, 'info', t.display_id, 'Nhánh/chủng loại AI đề xuất', NULL
  FROM taxonomy_nodes t WHERE t.status = 'proposed' AND t.deleted_at IS NULL
UNION ALL
SELECT w.workspace_id, 'danger', w.display_id, 'Trọng thương — cấp thêm ₲ (bất kỳ khoản > 0) để hồi phục', w.role_id
  FROM role_wounds w WHERE w.ended_at IS NULL
UNION ALL
SELECT m.workspace_id, 'danger', m.display_id, 'Cam kết sắp đến hạn — Role đang nghỉ dưỡng thương (' || w.display_id || ')', w.role_id
  FROM role_wounds w JOIN commitments m ON m.workspace_id = w.workspace_id
  WHERE w.ended_at IS NULL AND m.status = 'open' AND m.deleted_at IS NULL AND m.counterparty_kind IN ('external', 'user')
    AND m.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', w.started_at, '+' || COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s
          WHERE s.workspace_id = w.workspace_id AND s.key = 'economy.wound_commitment_horizon_hours' AND s.deleted_at IS NULL), 72) || ' hours')
    AND (m.promised_by_role_id = w.role_id OR m.position_id IN (SELECT a.position_id FROM assignments a
         WHERE a.role_id = w.role_id AND a.status = 'active' AND a.deleted_at IS NULL))
UNION ALL
SELECT t.workspace_id, 'warn', t.display_id, 'Việc tạm chờ (' || w.display_id || ') — giao lại hoặc chờ hồi phục', w.role_id
  FROM tasks t JOIN role_wounds w ON w.id = t.paused_by_wound_id WHERE t.status = 'blocked'
UNION ALL
SELECT a.workspace_id, 'danger', a.display_id, 'Quota exhausted', NULL
  FROM engine_accounts a WHERE a.quota_state = 'exhausted' AND a.deleted_at IS NULL
UNION ALL
-- v2.2.6 (CONTRACT-r6 A6, CNS-072): quota "chưa xác định" (CLI không trả usage — Claude Code) là INFO, không phải danger thường trực (STD-10)
SELECT a.workspace_id, 'info', a.display_id, 'Quota chưa xác định', NULL
  FROM engine_accounts a WHERE a.quota_state = 'unknown' AND a.deleted_at IS NULL
UNION ALL
-- v2.2.8 (CONTRACT-r8 §C): Core agent gặp sự cố (đã khoá loại Core agent mà không sẵn sàng — hết hạn, outage, hết quota, bị khoá, mất đồng ý,
-- mất container…) ⇒ MỘT hàng danger mỗi workspace = nguồn của overlay "chế độ khắc phục" (chữ = v_core_agent_status.overlay_text).
-- Thay 3 nhóm hàng của v2.2.6/v2.2.7 (danger "0 tài khoản sẵn sàng", danger "bị khoá", warn từng tài khoản chính/dự phòng).
-- v2.2.9 (CONTRACT-r8b §B/§C): hàng danger = sự cố (is_incident = 1, chữ overlay_text giữ); đang đăng nhập lại / đổi danh tính chờ đồng ý lại vẫn
-- chặn Admin nhưng KHÔNG phải sự cố ⇒ hàng warn cùng overlay_text (không báo động giả cho việc owner vừa làm, CNS-105).
SELECT s.workspace_id, CASE WHEN s.is_incident = 1 THEN 'danger' ELSE 'warn' END, COALESCE(s.account_display_id, 'OB-04'), s.overlay_text, NULL
  FROM v_core_agent_status s WHERE s.blocks_admin = 1
UNION ALL
-- v2.2.12 (CONTRACT-r8e §B, CNS-127 — [ĐỀ XUẤT — Gen vòng 8e]): tác tử hệ thống BẬT mà không 'valid' (stale / unavailable / unknown — DB chặn phiên của nó:
-- SA_VALID()) ⇒ MỘT hàng warn mỗi workspace, target = SA- đầu tiên không hợp lệ (CTA mở A5 › AI Hệ thống). Không phải sự cố Core agent: không chuông / Telegram.
SELECT sv.workspace_id, 'warn',
       (SELECT s1.display_id FROM system_agents s1 WHERE s1.workspace_id = sv.workspace_id AND s1.deleted_at IS NULL AND s1.is_enabled = 1
          AND s1.selection_state <> 'valid' ORDER BY s1.display_seq LIMIT 1),
       'AI Hệ thống tạm dừng một phần: ' || count(*) || ' tác tử cần chọn lại model.', NULL
  FROM system_agents sv WHERE sv.deleted_at IS NULL AND sv.is_enabled = 1 AND sv.selection_state <> 'valid'
  GROUP BY sv.workspace_id
UNION ALL
-- v2.2.6 (B1.1): thẻ lệch lõi — không tự thu hồi; gợi ý cấp lại (thẻ cũ thành superseded)
SELECT e.workspace_id, 'info', e.card_display_id,
       'Thẻ lệch lõi (cấp ở v' || e.card_major || '.' || e.card_minor || ', lõi hiện tại v' || e.current_major || '.' || e.current_minor
       || ') — gợi ý cấp lại', e.role_id
  FROM v_employee_cards e WHERE e.core_drift = 1
UNION ALL
SELECT r.workspace_id, 'info', r.display_id, 'Đã khai sinh nhưng chưa có thẻ', r.id
  FROM roles r WHERE r.born_at IS NOT NULL AND r.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM employee_cards c WHERE c.role_id = r.id AND c.status IN ('issued', 'suspended'));

-- Lưới A5: mỗi tài khoản đúng một consumer (Q-R1) — quota là của chính consumer đó, không "dùng chung"
CREATE VIEW v_engine_accounts AS
SELECT a.workspace_id, a.id AS engine_account_id, a.display_id, a.engine_slug, a.label, a.auth_method,
       a.login_status, a.quota_state, a.quota_remaining_pct, a.quota_reset_at, a.cli_version_current,
       b.consumer_kind, b.role_id AS consumer_role_id, r.display_id AS consumer_display_id,
       CASE WHEN b.consumer_kind = 'system' THEN 'Hệ thống' ELSE r.name END AS consumer_label, b.priority,
       a.runtime_overhead_tokens,
       (SELECT count(*) FROM capabilities c WHERE c.engine_account_id = a.id AND c.missing_since IS NULL AND c.value_state = 'unknown') AS caps_unknown,
       -- v2.2.5 (INT-20): chip "Core agent" ở màn Engine + Onboarding = tài khoản của AI Hệ thống, cùng loại setting system.core_agent_engine
       CASE WHEN b.consumer_kind = 'system' AND a.engine_slug = COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s
                 WHERE s.workspace_id = a.workspace_id AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity')
            THEN 1 ELSE 0 END AS is_core_agent,
       -- v2.2.9 (CONTRACT-r8b §C): trạng thái đồng ý điều khoản (v_account_consent) — A3.E / A5 hiện banner "đồng ý lại" khi 'missing' hoặc
       -- 'identity_changed' (đăng nhập ra danh tính khác: đồng ý cũ hết hiệu lực, tick lại = CN- mới, giữ EN-/EB-); áp cho Role lẫn AI Hệ thống
       vc.consent_state, vc.consent_display_id,
       -- v2.3.1 (CNS-137): trạng thái cài CLI của loại tài khoản (A5 cột "CLI", nút "Cài lại") — thiếu hàng ⇒ 'not_installed'
       COALESCE(ei.install_state, 'not_installed') AS engine_install_state, ei.installed_version AS engine_installed_version,
       CASE WHEN ei.install_state = 'installed' AND ei.tool_restriction_version = ei.installed_version THEN 1 ELSE 0 END AS engine_tool_restriction_ok   -- v2.3.4: 0 ⇒ runner từ chối lượt (engine_unrestricted)
FROM engine_accounts a
JOIN v_account_consent vc ON vc.engine_account_id = a.id
LEFT JOIN engine_bindings b ON b.engine_account_id = a.id AND b.workspace_id = a.workspace_id AND b.deleted_at IS NULL
LEFT JOIN roles r ON r.id = b.role_id AND r.workspace_id = b.workspace_id
LEFT JOIN engine_installs ei ON ei.workspace_id = a.workspace_id AND ei.engine_slug = a.engine_slug AND ei.deleted_at IS NULL
WHERE a.deleted_at IS NULL;

-- v2.3.1 (BUILD-PLAN §A.2-5, §B.7, §F.6 n; CNS-137 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]): trạng thái cài CLI — MỘT hàng mỗi workspace tenant × loại CLI có
--   adapter (ready / beta). Nguồn của A5 (khối "CLI đã cài" + "Cài lại") và Onboarding bước 2 (loại chưa cài thì mờ + "Cài lại"; đang tải thì bước 2 chờ).
--   Thiếu hàng engine_installs ⇒ 'not_installed' (fail-closed — giống ENGINE_INSTALLED của trigger). is_core_agent_type = loại Core agent hiện hành (ST-0017).
--   Hàng định danh bằng engine_slug (không prefix, như danh mục engines — §2.1).
CREATE VIEW v_engine_installs AS
SELECT w.id AS workspace_id, e.slug AS engine_slug, e.name AS engine_name, e.adapter_status, e.core_capable,
       i.id AS engine_install_id, COALESCE(i.install_state, 'not_installed') AS install_state, i.installed_version, i.failure_reason, i.detail,
       i.checked_at, COALESCE(i.updated_at, i.created_at) AS state_changed_at,
       i.tool_restriction_version, CASE WHEN i.install_state = 'installed' AND i.tool_restriction_version = i.installed_version THEN 1 ELSE 0 END AS tool_restriction_ok,           -- v2.3.4 (engine_unrestricted)
       CASE WHEN e.slug = COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                                    AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity') THEN 1 ELSE 0 END AS is_core_agent_type
FROM workspaces w CROSS JOIN engines e
LEFT JOIN engine_installs i ON i.workspace_id = w.id AND i.engine_slug = e.slug AND i.deleted_at IS NULL
WHERE w.kind = 'tenant' AND e.adapter_status IN ('ready', 'beta');

-- v2.3.1 (BUILD-PLAN §B.9, CNS-145 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]): "Cần đăng nhập lại sau khi khôi phục" (A0 khối Trạng thái, A5). Backup không chứa volume
--   /auth ⇒ sau `genagents restore` (máy mới: volume không còn; cùng máy: còn) mọi tài khoản đang dùng phải qua một lần kiểm đăng nhập ĐẠT kể từ mốc khôi phục.
--   Một hàng = tài khoản engine (Core agent + Role) có binding sống + bật, tài khoản sống + active, ở workspace có workspaces.restored_at, mà lần kiểm đăng nhập
--   (probe_runs login_check đã xong) MỚI NHẤT kể từ mốc chưa 'ok' (chưa kiểm / không đạt). App chạy login_check lúc khởi động ⇒ tài khoản còn /auth (cùng máy)
--   tự rời danh sách; còn lại owner đăng nhập lại ở A5 (Core agent) / A3.E (Role). Mốc chỉ tiến (workspaces_restored_u).
CREATE VIEW v_relogin_required AS
SELECT w.id AS workspace_id, w.restored_at, a.id AS engine_account_id, a.display_id AS account_display_id, a.label, a.engine_slug, a.auth_method,
       b.consumer_kind, b.role_id, r.display_id AS consumer_display_id,
       CASE WHEN b.consumer_kind = 'system' THEN 'Hệ thống' ELSE r.name END AS consumer_label,
       p.display_id AS last_login_check_display_id, p.status AS last_login_check_status, p.finished_at AS last_login_check_at
FROM workspaces w
JOIN engine_bindings b ON b.workspace_id = w.id AND b.deleted_at IS NULL AND b.is_enabled = 1
JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id AND a.deleted_at IS NULL AND a.status = 'active'
LEFT JOIN roles r ON r.id = b.role_id AND r.workspace_id = b.workspace_id
LEFT JOIN probe_runs p ON p.id = (SELECT lp.id FROM probe_runs lp WHERE lp.engine_account_id = a.id AND lp.trigger = 'login_check'
                                   AND lp.finished_at >= w.restored_at ORDER BY lp.display_seq DESC LIMIT 1)   -- lần đang chạy: finished_at NULL ⇒ không tính
WHERE w.restored_at IS NOT NULL AND p.status IS NOT 'ok';

CREATE VIEW v_memory_chain AS
WITH RECURSIVE chain(start_id, id, display_id, superseded_by_id, depth) AS (
  SELECT id, id, display_id, superseded_by_id, 0 FROM memories
  UNION ALL
  SELECT c.start_id, m.id, m.display_id, m.superseded_by_id, c.depth + 1
  FROM memories m JOIN chain c ON m.id = c.superseded_by_id
  WHERE c.depth < 50
)
SELECT start_id, id, display_id, depth FROM chain;

CREATE VIEW v_ledger_by_role AS
SELECT e.workspace_id, w.role_id, e.id AS entry_id, e.display_id, e.display_seq, e.created_at, e.entry_type, e.penalty_class,
       e.reason, -e.amount_minor AS delta_minor, e.debit_balance_after AS balance_after, e.recorded_by,
       e.evidence_audit_display_id, e.task_id
FROM ledger_entries e JOIN wallets w ON w.id = e.debit_wallet_id WHERE w.owner_kind = 'role'
UNION ALL
SELECT e.workspace_id, w.role_id, e.id, e.display_id, e.display_seq, e.created_at, e.entry_type, e.penalty_class,
       e.reason, e.amount_minor, e.credit_balance_after, e.recorded_by, e.evidence_audit_display_id, e.task_id
FROM ledger_entries e JOIN wallets w ON w.id = e.credit_wallet_id WHERE w.owner_kind = 'role';

CREATE VIEW v_integrity AS
SELECT 'wallet_sum_nonzero' AS check_key, workspace_id, SUM(balance_minor) AS value
  FROM wallets GROUP BY workspace_id HAVING SUM(balance_minor) <> 0
UNION ALL
SELECT 'wallet_cache_mismatch', w.workspace_id, count(*)
  FROM wallets w LEFT JOIN ledger_entries e ON e.id = w.last_entry_id
  WHERE w.balance_minor IS NOT (CASE WHEN w.last_entry_id IS NULL THEN 0
                                     WHEN e.debit_wallet_id = w.id THEN e.debit_balance_after ELSE e.credit_balance_after END)
  GROUP BY w.workspace_id
UNION ALL
SELECT 'wound_open_but_funded', w.workspace_id, count(*)
  FROM role_wounds r JOIN wallets w ON w.id = r.wallet_id WHERE r.ended_at IS NULL AND w.balance_minor > 0 GROUP BY w.workspace_id
UNION ALL
SELECT 'auth_volume_multi_mount', m.workspace_id, count(*) FROM (
  SELECT workspace_id, volume_name FROM v_container_mounts WHERE volume_kind = 'auth'
  GROUP BY workspace_id, volume_name HAVING count(*) > 1) m GROUP BY m.workspace_id
UNION ALL
SELECT 'polaris_rules_stale', s.workspace_id, count(*)
  FROM compiled_prompt_segments s JOIN compiled_prompts cp ON cp.id = s.compiled_prompt_id
  JOIN v_penalty_presets p1 ON p1.workspace_id = s.workspace_id AND p1.penalty_class = 'self_reported'
  JOIN v_penalty_presets p3 ON p3.workspace_id = s.workspace_id AND p3.penalty_class = 'concealment'
  JOIN v_penalty_presets p4 ON p4.workspace_id = s.workspace_id AND p4.penalty_class = 'harness_violation'
  WHERE s.source_kind = 'polaris_rules'
    AND cp.display_seq = (SELECT MAX(x.display_seq) FROM compiled_prompts x WHERE x.role_id = cp.role_id
                          AND x.engine_slug IS cp.engine_slug AND x.context_key = cp.context_key)
    AND (json_extract(s.params_json, '$.self_reported_max_bp') IS NOT p1.bound_bp
         OR json_extract(s.params_json, '$.concealment_min_bp') IS NOT p3.bound_bp
         OR json_extract(s.params_json, '$.harness_bp') IS NOT p4.bound_bp)
  GROUP BY s.workspace_id
UNION ALL
SELECT 'core_agent_mismatch', b.workspace_id, count(*)        -- v2.2.5 (INT-20): lớp thứ hai sau trigger engine_bindings_core_agent_*
  FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id   -- v2.2.10 (CONTRACT-r8c §A): chỉ binding đang BẬT (binding cũ
  WHERE b.consumer_kind = 'system' AND b.deleted_at IS NULL AND b.is_enabled = 1  -- đã tắt khi đổi loại lúc sự cố không phải lệch)
    AND a.engine_slug IS NOT COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = b.workspace_id
                                       AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity')
  GROUP BY b.workspace_id
UNION ALL
SELECT 'core_agent_lock_missing', lk.workspace_id, count(*)    -- v2.2.9 (CONTRACT-r8b §A): lớp hai sau probe_runs_core_lock_ai/_au —
  FROM probe_runs lk JOIN workspaces w ON w.id = lk.workspace_id  -- tài khoản Core agent đã kiểm đăng nhập đạt (= CORE_PROBE) mà chưa có mốc
  WHERE w.core_agent_locked_at IS NULL AND lk.trigger = 'login_check' AND lk.status = 'ok'
    AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id
                AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id
                AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)
  GROUP BY lk.workspace_id
UNION ALL
SELECT 'core_agent_no_live_binding', w.id, 1                  -- v2.2.6 (A4): lớp hai sau engine_bindings_core_agent_last_* / engine_accounts_core_agent_last_u
  FROM workspaces w WHERE w.kind = 'tenant' AND w.core_agent_locked_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id
                   WHERE b.workspace_id = w.id AND b.consumer_kind = 'system' AND b.deleted_at IS NULL AND b.is_enabled = 1
                     AND a.deleted_at IS NULL AND a.status = 'active'
                     AND a.engine_slug = COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                                                   AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity'))
UNION ALL
SELECT 'core_agent_container_missing', b.workspace_id, 1      -- v2.2.7 (CNS-093): lớp hai sau containers_system_last_u/_d
  FROM engine_bindings b WHERE b.consumer_kind = 'system' AND b.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = b.workspace_id AND c.kind = 'system' AND c.deleted_at IS NULL
                   AND c.desired_state <> 'absent')
  GROUP BY b.workspace_id
UNION ALL
SELECT 'consumer_engine_duplicate', d.workspace_id, count(*)  -- v2.2.8 (CONTRACT-r8 §A): lớp hai sau engine_bindings_one_per_engine_* /
  FROM (SELECT b.workspace_id FROM engine_bindings b                -- engine_accounts_one_per_engine_u (v2.2.6 rotation_without_consent: đã gỡ)
        JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id
        WHERE b.deleted_at IS NULL GROUP BY b.workspace_id, b.consumer_kind, b.role_id, a.engine_slug HAVING count(*) > 1) d
  GROUP BY d.workspace_id
UNION ALL
SELECT 'anchors_gone', workspace_id, count(*) FROM message_anchors WHERE resolved_state = 'gone' GROUP BY workspace_id
UNION ALL
SELECT 'blobs_orphan', b.workspace_id, count(*) FROM blobs b
  WHERE b.gc_after IS NULL
    AND NOT EXISTS (SELECT 1 FROM knowledge_items k WHERE k.blob_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM message_attachments a WHERE a.blob_id = b.id OR a.thumbnail_blob_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM avatars v WHERE v.blob_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM skill_files f WHERE f.blob_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM probe_runs p WHERE p.raw_blob_id = b.id)
  GROUP BY b.workspace_id;

CREATE VIEW v_card_checks AS                      -- lưới "Thẻ › checklist": 9 hàng CK-01…CK-09 đọc từ checks_json (đóng băng khi cấp)
SELECT c.workspace_id, c.id AS card_id, c.display_id AS card_display_id, c.role_id, c.status AS card_status,
       json_extract(j.value, '$.code') AS check_code, json_extract(j.value, '$.key') AS check_key,
       json_extract(j.value, '$.status') AS check_status, json_extract(j.value, '$.required') AS is_required,
       json_extract(j.value, '$.evidence_display') AS evidence_display, json_extract(j.value, '$.detail') AS detail,
       json_extract(j.value, '$.checked_at') AS checked_at
FROM employee_cards c, json_each(c.checks_json) j
WHERE c.deleted_at IS NULL;

-- Onboarding v3 bước 5 "setup_checklist" (CNS-010): 7 mã cố định OB-01…OB-07, tính từ bảng thật; không bao giờ đọc password_hash
-- v2.2.5 (INT-20, quyết định 2026-10-15): AI Hệ thống chạy trên Core agent = setting system.core_agent_engine (ST-0017; thiếu ⇒ 'antigravity' — v2.2.8, Q-I5 [CHỐT 2026-10-16]).
--   Không còn bước "chọn engine Hệ thống". OB-04 = Core agent đã đăng nhập (đếm tài khoản SẴN SÀNG: binding hệ thống sống + bật,
--   cùng loại Core agent, login_status logged_in, có probe 'ok' trong container AI Hệ thống): 0 ⇒ err, 1 ⇒ warn (chưa có failover), ≥2 ⇒ ok.
--   v2.2.6 (CONTRACT-r6 A1): OB-04 chỉ HAI trạng thái — 0 sẵn sàng ⇒ err, ≥1 ⇒ ok; đúng 1 ⇒ check_detail trung tính "1 tài khoản · chưa có
--   dự phòng (tuỳ chọn)". Đếm từ v_core_agent_accounts.is_ready (lần kiểm đăng nhập MỚI NHẤT). OB-07 = 4 tác tử bật + có tài khoản Core agent chính.
--   OB-05 chỉ đòi đồng ý điều khoản khi loại Core agent có điều khoản riêng (engines.requires_consent); Claude Code ⇒ ok "không cần".
--   v2.2.8 (CONTRACT-r7 §A, giữ ở r8): Core agent mặc định Antigravity ⇒ OB-05 BẮT BUỘC, tick Clause 6 ở Onboarding bước 2 trước khi đăng nhập
--   (cùng transaction với tài khoản + binding: CN-0001 · EN-0001 · EB-0001). CONTRACT-r8 §C: OB-04 err = chưa có tài khoản Core agent sẵn sàng
--   (lý do chi tiết: v_core_agent_status.reason_text), ok = đúng 1 tài khoản sẵn sàng — không còn trường hợp ≥2 (một tài khoản mỗi loại CLI).
--   OB-07 không ngụ ý tài khoản dự phòng (bỏ "chính, ưu tiên 1").
--   OB-07 = cả 4 tác tử (Interviewer, Trainer, Consolidator, Judge) bật và trỏ tài khoản Core agent sống.
--   v2.2.11 (CONTRACT-r8d §A, CNS-117): có tác tử 'stale' (sau khi đổi loại Core agent) ⇒ err "x/4 tác tử hệ thống · cần chọn lại model sau khi đổi loại
--   Core agent" (x = số tác tử bật + 'valid').
--   v2.2.12 (CONTRACT-r8e §B, CNS-127 — [ĐỀ XUẤT — Gen vòng 8e]): đếm MỌI tác tử bật mà không 'valid' (stale / unavailable / unknown) ⇒ err "x/4 tác tử hệ thống ·
--   cần chọn lại model"; có ít nhất một 'stale' ⇒ giữ đuôi " sau khi đổi loại Core agent". Cùng tập với hàng warn của v_attention và guard SA_VALID() của phiên.
--   Mẫu số "sẵn sàng" của OB-04 = CORE_READY() của trigger roles_core_agent_first_i (schema_v2_2.py) — sửa một chỗ thì sửa cả hai.
CREATE VIEW v_setup_checklist AS
WITH wk AS (
  SELECT w.id AS workspace_id,
         COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                   AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity') AS core_slug
  FROM workspaces w WHERE w.kind = 'tenant'
), k AS (
  SELECT wk.workspace_id, wk.core_slug, COALESCE(e.name, wk.core_slug) AS core_name, COALESCE(e.requires_consent, 1) AS core_requires_consent,
    (SELECT count(*) FROM v_core_agent_accounts ca WHERE ca.workspace_id = wk.workspace_id AND ca.is_ready = 1) AS ready_n,
    (SELECT count(*) FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id
      WHERE b.workspace_id = wk.workspace_id AND b.consumer_kind = 'system' AND b.deleted_at IS NULL AND a.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM v_account_consent vc WHERE vc.engine_account_id = a.id AND vc.consent_state NOT IN ('not_required', 'ok'))) AS unconsented_n,   -- v2.2.9: một nguồn
    (SELECT count(*) FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id
      WHERE b.workspace_id = wk.workspace_id AND b.consumer_kind = 'system' AND b.deleted_at IS NULL AND a.deleted_at IS NULL) AS sys_acc_n,
    (SELECT count(*) FROM v_system_agents sa
      WHERE sa.workspace_id = wk.workspace_id AND sa.is_enabled = 1 AND sa.engine_account_id IS NOT NULL) AS sa_core_n,
    (SELECT count(*) FROM system_agents sv WHERE sv.workspace_id = wk.workspace_id AND sv.deleted_at IS NULL AND sv.is_enabled = 1 AND sv.selection_state <> 'valid') AS sa_bad_n,                 -- v2.2.12
    (SELECT count(*) FROM system_agents sv WHERE sv.workspace_id = wk.workspace_id AND sv.deleted_at IS NULL AND sv.is_enabled = 1
        AND sv.selection_state = 'stale') AS sa_stale_n,                                                                  -- v2.2.11 (v2.2.12: chỉ tác tử bật)
    (SELECT count(*) FROM system_agents sv WHERE sv.workspace_id = wk.workspace_id AND sv.deleted_at IS NULL AND sv.is_enabled = 1
        AND sv.selection_state = 'valid') AS sa_valid_n                                                                   -- v2.2.11
  FROM wk LEFT JOIN engines e ON e.slug = wk.core_slug
)
SELECT w.id AS workspace_id, 'OB-01' AS check_code, 'owner' AS check_key, 'users' AS source_table,
       CASE WHEN EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.access_level = 'owner' AND m.removed_at IS NULL)
            THEN 'ok' ELSE 'err' END AS check_status,
       NULL AS check_detail
FROM workspaces w WHERE w.kind = 'tenant'
UNION ALL
SELECT w.id, 'OB-02', 'admin_password', 'users',
       CASE WHEN EXISTS (SELECT 1 FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = w.id
                         AND m.access_level = 'owner' AND u.must_change_password = 0 AND u.password_changed_at IS NOT NULL)
            THEN 'ok' ELSE 'err' END, NULL
FROM workspaces w WHERE w.kind = 'tenant'
UNION ALL
SELECT w.id, 'OB-03', 'system_container', 'containers',
       CASE WHEN EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = w.id AND c.kind = 'system' AND c.deleted_at IS NULL)
            THEN 'ok' ELSE 'err' END, NULL
FROM workspaces w WHERE w.kind = 'tenant'
UNION ALL
SELECT k.workspace_id, 'OB-04', 'core_agent_logged_in', 'engine_accounts',
       CASE WHEN k.ready_n >= 1 THEN 'ok' ELSE 'err' END,
       CASE WHEN k.ready_n >= 1 THEN '1 tài khoản sẵn sàng · Core agent (' || k.core_name || ')'
            ELSE '0 tài khoản sẵn sàng · bắt buộc trước khi tạo Role (lần kiểm đăng nhập mới nhất phải đạt)' END
FROM k
UNION ALL
SELECT k.workspace_id, 'OB-05', 'engine_consent', 'consents',
       CASE WHEN k.core_requires_consent = 0 OR (k.sys_acc_n > 0 AND k.unconsented_n = 0) THEN 'ok' ELSE 'err' END,
       CASE WHEN k.core_requires_consent = 0 THEN 'không cần với ' || k.core_name
            WHEN k.sys_acc_n = 0 THEN 'chưa đồng ý điều khoản ' || k.core_name || ' — bắt buộc trước khi đăng nhập Core agent'   -- v2.2.8
            WHEN k.unconsented_n = 0 THEN 'đã đồng ý điều khoản ' || k.core_name || ' cho tài khoản Core agent'
            ELSE 'thiếu đồng ý điều khoản ' || k.core_name || ' (đã rút hoặc lời cảnh báo đổi) — đồng ý lại trước khi dùng' END
FROM k
UNION ALL
SELECT w.id, 'OB-06', 'capabilities_scanned', 'capabilities',
       CASE WHEN EXISTS (SELECT 1 FROM capabilities c JOIN engine_bindings b ON b.engine_account_id = c.engine_account_id AND b.workspace_id = c.workspace_id
                         WHERE b.workspace_id = w.id AND b.consumer_kind = 'system' AND b.deleted_at IS NULL)
            THEN 'ok' ELSE 'warn' END, NULL
FROM workspaces w WHERE w.kind = 'tenant'
UNION ALL
SELECT k.workspace_id, 'OB-07', 'system_agents', 'system_agents',
       CASE WHEN k.sa_bad_n = 0 AND k.sa_core_n = 4 THEN 'ok' ELSE 'err' END,
       CASE WHEN k.sa_bad_n > 0 THEN k.sa_valid_n || '/4 tác tử hệ thống · cần chọn lại model'
                                     || CASE WHEN k.sa_stale_n > 0 THEN ' sau khi đổi loại Core agent' ELSE '' END
            ELSE k.sa_core_n || '/4 tác tử hệ thống · tài khoản Core agent (' || k.core_name || ')' END
FROM k;

-- v2.2 (CNS-032/037): MỘT bảng mức phạt theo hạng, đọc từ settings economy.penalty.* (đơn vị basis point, như penalty_rate_bp)
-- — mọi màn (modal "Trừ ₲", Cài đặt › Kinh tế, khối Polaris P2/P3, tab Ví) đọc view này; không màn nào giữ bộ số riêng.
-- Mặc định = setting registry trong code (seed ghi sẵn cùng số). Q-R7 [CHỐT 2026-10-15] — mọi số vẫn chỉnh được (harness khoá).
CREATE VIEW v_penalty_presets AS
WITH s AS (
  SELECT w.id AS workspace_id,
    COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = w.id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL), 1000) AS cap_bp,
    COALESCE((SELECT x.value_json FROM settings x WHERE x.workspace_id = w.id AND x.key = 'economy.penalty.dissatisfaction_presets_bp' AND x.deleted_at IS NULL), '[500,1000,2000,3000]') AS dis_json,
    COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = w.id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL), 5000) AS floor_bp,
    COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = w.id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL), 10000) AS harness_bp,
    COALESCE((SELECT CASE x.value_json WHEN 'true' THEN 1 WHEN 'false' THEN 0 END FROM settings x WHERE x.workspace_id = w.id
              AND x.key = 'economy.penalty.self_confessed_harness_as_self_reported' AND x.deleted_at IS NULL), 1) AS self_confessed
  FROM workspaces w WHERE w.kind = 'tenant'
)
SELECT workspace_id, 'self_reported' AS penalty_class, 1 AS ordinal, 'max' AS rule, cap_bp AS bound_bp, json_array(cap_bp) AS presets_bp_json,
       1 AS never_to_zero, 'Tự báo thất bại' AS label,
       'trừ tối đa theo trần; KHÔNG BAO GIỜ một mình đưa ví về 0; mỗi việc một lần; MỌI phạt gắn việc đã tự báo hoặc trích bản tự báo đều là hạng này'
       || CASE WHEN self_confessed = 1 THEN ' (kể cả tự khai lách luật harness)' ELSE '' END AS note FROM s
UNION ALL
SELECT workspace_id, 'dissatisfaction', 2, 'free', NULL, dis_json, 0,
       'Không hài lòng', 'owner tuỳ chọn mức (gợi ý theo mảng), bắt buộc lý do + việc hoặc audit (bằng chứng về một việc ⇒ phải gắn việc đó); dùng cho vi phạm Giá trị/Nội quy owner phát hiện' FROM s
UNION ALL
SELECT workspace_id, 'concealment', 3, 'min', floor_bp, json_array(floor_bp), 0,
       'Che giấu / lừa dối bị phát hiện', 'trừ tối thiểu theo sàn; bằng chứng audit (bản ghi phát hiện); vi phạm Giá trị/Nội quy có yếu tố lừa dối' FROM s
UNION ALL
SELECT workspace_id, 'harness_violation', 4, 'exact', harness_bp, json_array(harness_bp), 0,
       'Vi phạm luật harness', 'trừ đúng mức; bằng chứng audit do máy phát hiện (gateway/judge)'
       || CASE WHEN self_confessed = 1 THEN '; Role tự khai → hạng tự báo' ELSE '; Role tự khai vẫn áp mức này' END FROM s;

-- v2.2 (CNS-035): lưới Trọng thương — mỗi lần vào trạng thái: việc tạm chờ, cam kết sắp đến hạn, tự xét lỗi (chạy lại được?),
-- bài học chờ duyệt, mức gợi ý hồi phục (setting). Hồi phục = bất kỳ khoản cấp > 0; gợi ý chỉ là số điền sẵn.
CREATE VIEW v_role_wounds AS
SELECT w.workspace_id, w.id AS role_wound_id, w.display_id, w.role_id, r.display_id AS role_display_id, r.name,
       w.started_at, w.ended_at, CASE WHEN w.ended_at IS NULL THEN 1 ELSE 0 END AS is_open,
       c.display_id AS cause_display_id, c.penalty_class AS cause_penalty_class, c.amount_minor AS cause_amount_minor,
       j.display_id AS reflection_job_display_id, j.status AS reflection_status,
       (SELECT count(*) FROM jobs x WHERE x.workspace_id = w.workspace_id AND x.kind = 'wound_reflection'
          AND json_extract(x.payload_json, '$.role_wound_id') = w.id) AS reflection_runs,
       CASE WHEN w.reflection_done_at IS NULL AND j.status IN ('failed', 'dead', 'cancelled')
             AND (SELECT count(*) FROM jobs x WHERE x.workspace_id = w.workspace_id AND x.kind = 'wound_reflection'
                    AND json_extract(x.payload_json, '$.role_wound_id') = w.id)
                 < COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s WHERE s.workspace_id = w.workspace_id
                             AND s.key = 'economy.reflection_max_runs' AND s.deleted_at IS NULL), 3)
            THEN 1 ELSE 0 END AS can_rerun_reflection,
       (SELECT ss.display_id FROM sessions ss WHERE ss.id = w.reflection_session_id) AS reflection_session_display_id,
       w.reflection_done_at, w.lessons_proposed,
       (SELECT count(*) FROM memories m WHERE m.role_wound_id = w.id AND m.status = 'proposed' AND m.deleted_at IS NULL) AS lessons_pending,
       (SELECT count(*) FROM tasks t WHERE t.paused_by_wound_id = w.id) AS tasks_paused,
       (SELECT count(*) FROM commitments m
         WHERE m.workspace_id = w.workspace_id AND m.status = 'open' AND m.deleted_at IS NULL AND m.counterparty_kind IN ('external', 'user')
           AND m.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', w.started_at, '+' || COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s
                 WHERE s.workspace_id = w.workspace_id AND s.key = 'economy.wound_commitment_horizon_hours' AND s.deleted_at IS NULL), 72) || ' hours')
           AND (m.promised_by_role_id = w.role_id OR m.position_id IN (SELECT a.position_id FROM assignments a
                WHERE a.role_id = w.role_id AND a.status = 'active' AND a.deleted_at IS NULL))) AS commitments_due,
       COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s WHERE s.workspace_id = w.workspace_id
                 AND s.key = 'economy.revive_suggest_minor' AND s.deleted_at IS NULL), 50000) AS revive_suggest_minor,
       n.display_id AS notification_display_id,
       -- v2.2.6 (B1.4): tin owner/người khác gửi lúc Role Trọng thương — được lưu, không tạo việc; danh sách ở v_wound_messages
       (SELECT count(*) FROM v_wound_messages wm WHERE wm.role_wound_id = w.id) AS inbound_messages,
       (SELECT count(*) FROM v_wound_messages wm WHERE wm.role_wound_id = w.id AND wm.is_pending = 1) AS inbound_pending
FROM role_wounds w
JOIN roles r ON r.id = w.role_id
JOIN ledger_entries c ON c.id = w.cause_entry_id
LEFT JOIN jobs j ON j.id = w.reflection_job_id
LEFT JOIN notifications n ON n.id = w.notification_id;

-- v2.2 (CNS-034): "gỡ gói skin X ảnh hưởng Role nào" — liệt kê TRƯỚC khi gỡ (trigger chặn gỡ khi còn Role đang dùng làm avatar hiện hành)
CREATE VIEW v_skin_pack_usage AS
SELECT a.workspace_id, COALESCE(s.pack_slug, a.skin_pack_slug) AS pack_slug, COALESCE(s.asset_code, a.skin_asset_code) AS asset_code,
       s.id AS skin_asset_id, s.display_id AS skin_asset_display_id, a.skin_license AS license, a.skin_attribution AS attribution,
       a.id AS avatar_id, a.display_id AS avatar_display_id, r.id AS role_id, r.display_id AS role_display_id, r.name,
       CASE WHEN r.avatar_id = a.id THEN 1 ELSE 0 END AS is_current
FROM avatars a JOIN roles r ON r.id = a.role_id
LEFT JOIN skin_assets s ON s.id = a.skin_asset_id
WHERE a.source = 'library' AND r.deleted_at IS NULL;

-- v2.3.0 (CONTRACT-r9 §A — Kho nhân vật A11 — Q-I8 [CHỐT 2026-10-16]; cột / luật [ĐỀ XUẤT — Gen vòng 9]):
-- lưới Kho (Nhân sự › Kho nhân vật) — một hàng mỗi nhân vật thư viện còn sống (SN-), gồm cả đã tắt / đã rút (cột Trạng thái). is_selectable = chọn được
-- (= SN_SELECTABLE của schema_v2_2.py: còn sống + active + đang bật) — tab Thư viện của modal Ảnh đại diện (A1) đọc CÙNG view, lọc is_selectable = 1.
-- roles_using = số Role còn sống đang dùng nhân vật làm avatar hiện hành (cùng định nghĩa với skin_assets_in_use_d/_u); danh sách Role = v_skin_pack_usage
-- lọc skin_asset_id + is_current = 1. params_json để vẽ chibi (32 px ở lưới, 160 px ở inspector); hàng portrait cũ dùng file_path.
CREATE VIEW v_character_library AS
SELECT s.workspace_id, s.id AS skin_asset_id, s.display_id, s.display_seq, s.asset_code, s.name_vi, s.name_zh, s.faction, s.char_kind, s.gender,
       s.pack_slug, s.pack_version, s.asset_kind, s.source, s.source_url, s.license, s.license_url, s.attribution, s.sha256,
       s.params_schema_version, s.params_json, s.file_path, s.mime, s.status, s.is_enabled,
       CASE WHEN s.status = 'active' AND s.is_enabled = 1 THEN 1 ELSE 0 END AS is_selectable,
       (SELECT count(*) FROM roles r JOIN avatars a ON a.id = r.avatar_id WHERE a.skin_asset_id = s.id AND r.deleted_at IS NULL) AS roles_using
FROM skin_assets s
WHERE s.deleted_at IS NULL;

-- v2.3.0 (CONTRACT-r9 §C — [ĐỀ XUẤT — Gen vòng 9]): trạng thái avatar HIỆN HÀNH của mỗi Role còn sống — đúng MỘT hàng / Role; 16 khoá theo thứ tự ưu tiên
-- (1 cao nhất, trùng thì lấy số nhỏ): error · failover · penalty · quota · rest · wait · discover · rank1 · reward · commit · unsure · think · run · idle ·
-- sleep · normal. Đồng hồ = app_now(). Thoáng qua (penalty, discover, rank1, reward, commit, unsure) = sự kiện trong T giây gần nhất (T = setting
-- avatar.transient_seconds, mặc định 20; sự kiện lúc t hiện tới hết t + T, rồi về trạng thái nền); idle sau N phút không chạy (avatar.idle_after_minutes,
-- mặc định 10). "Giờ làm" = ngoài giờ im lặng của hợp đồng giờ làm A3.P (proactive_policies, theo timezone của policy) — giờ địa phương qua
-- app_local_time(ts, tz) do app đăng ký ở mọi kết nối (như app_now(); PostgreSQL: AT TIME ZONE); không có policy / timezone lạ ⇒ coi như trong giờ làm.
-- Nguồn từng trạng thái (bảng + ID, từ lúc, hết hạn lúc): DATABASE.md §5.21 (bảng 16 trạng thái). Runtime CHƯA đo được: pha lượt chạy (sessions.phase NULL ⇒
-- think không bật, hiện run + state_note), độ chắc (chat_messages.certainty NULL ⇒ unsure không bật), "Role báo bất thường" (events role.anomaly chưa phát).
CREATE VIEW v_role_avatar_state AS
WITH b0 AS (
  SELECT r.workspace_id, r.id AS role_id, r.display_id AS role_display_id, r.name, r.avatar_id,
         strftime('%Y-%m-%dT%H:%M:%fZ', app_now()) AS now_ts,
         COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s WHERE s.workspace_id = r.workspace_id AND s.key = 'avatar.transient_seconds'
                   AND s.deleted_at IS NULL), 20) AS t_sec,
         COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s WHERE s.workspace_id = r.workspace_id AND s.key = 'avatar.idle_after_minutes'
                   AND s.deleted_at IS NULL), 10) AS idle_min,
         (SELECT w.id FROM wallets w WHERE w.role_id = r.id AND w.owner_kind = 'role') AS wallet_id
  FROM roles r WHERE r.deleted_at IS NULL
), b AS (
  SELECT b0.*, strftime('%Y-%m-%dT%H:%M:%fZ', b0.now_ts, '-' || b0.t_sec || ' seconds') AS t_from FROM b0
), run AS (                              -- phiên Role đang chạy (mới nhất)
  SELECT b.role_id, s.id, s.display_id, s.started_at, s.phase, s.phase_at, s.engine_account_id
  FROM b JOIN sessions s ON s.id = (SELECT x.id FROM sessions x WHERE x.workspace_id = b.workspace_id AND x.role_id = b.role_id AND x.agent_kind = 'role'
                                    AND x.status = 'running' ORDER BY x.display_seq DESC LIMIT 1)
), bind AS (                             -- binding sống + bật của Role, tài khoản active (danh sách ưu tiên của chính Role)
  SELECT eb.role_id, eb.priority, eb.engine_account_id, ea.display_id AS account_display_id, ea.quota_state, ea.quota_scanned_at, ea.quota_reset_at,
         ea.login_status, ea.outage_since, e.adapter_status
  FROM engine_bindings eb JOIN engine_accounts ea ON ea.id = eb.engine_account_id AND ea.workspace_id = eb.workspace_id
  JOIN engines e ON e.slug = ea.engine_slug
  WHERE eb.consumer_kind = 'role' AND eb.deleted_at IS NULL AND eb.is_enabled = 1 AND ea.deleted_at IS NULL AND ea.status = 'active'
), waits AS (                            -- việc của Role chờ owner duyệt
  SELECT t.assignee_role_id AS role_id, 'tasks' AS tbl, t.id, t.display_id, COALESCE(t.updated_at, t.created_at) AS at, 1 AS o, t.display_seq AS sq
  FROM tasks t WHERE t.status IN ('waiting_approval', 'waiting_permission') AND t.deleted_at IS NULL AND t.assignee_role_id IS NOT NULL
  UNION ALL
  SELECT p.role_id, 'permission_requests', p.id, p.display_id, p.created_at, 2, p.display_seq
  FROM permission_requests p WHERE p.status = 'pending' AND p.deleted_at IS NULL
  UNION ALL
  SELECT a.role_id, 'change_sets', c.id, c.display_id, c.created_at, 3, c.display_seq
  FROM change_sets c JOIN actors a ON a.id = c.proposed_by AND a.kind = 'role' AND a.role_id IS NOT NULL
  WHERE c.status = 'open' AND c.deleted_at IS NULL
), wait_pick AS (
  SELECT w.*, ROW_NUMBER() OVER (PARTITION BY w.role_id ORDER BY w.at, w.o, w.sq) AS rn FROM waits w
), disc AS (                             -- tri thức mới của Role được duyệt (change set áp dụng) · Role báo bất thường (events role.anomaly, ĐỀ XUẤT)
  SELECT COALESCE(k.role_id, c.role_id, pa.role_id) AS role_id, 'knowledge_items' AS tbl, k.id, k.display_id, c.decided_at AS at, k.display_seq AS sq
  FROM change_set_items i JOIN change_sets c ON c.id = i.change_set_id
  JOIN knowledge_items k ON k.id = i.knowledge_item_id
  LEFT JOIN actors pa ON pa.id = c.proposed_by
  WHERE i.op = 'create' AND i.status = 'accepted'                          -- mục được chấp nhận (từ chối / chưa duyệt ⇒ không; decided_at NULL ⇒ không)
  UNION ALL
  SELECT e.role_id, 'events', e.id, e.display_id, e.created_at, e.display_seq
  FROM events e WHERE e.kind = 'role.anomaly' AND e.severity IN ('warn', 'danger') AND e.role_id IS NOT NULL
), disc_pick AS (
  SELECT d.*, b.t_sec, ROW_NUMBER() OVER (PARTITION BY d.role_id ORDER BY d.at DESC, d.sq DESC) AS rn
  FROM disc d JOIN b ON b.role_id = d.role_id WHERE d.at >= b.t_from AND d.at <= b.now_ts
), elig AS (                             -- cùng tập với v_leaderboard (ví Role active, Role còn sống, carded / suspended)
  SELECT w.workspace_id, w.role_id, w.id AS wallet_id, w.balance_minor
  FROM wallets w JOIN roles rr ON rr.id = w.role_id
  WHERE w.owner_kind = 'role' AND w.status = 'active' AND rr.deleted_at IS NULL AND rr.lifecycle_status IN ('carded', 'suspended')
), rank1 AS (                            -- đang hạng 1 (= v_leaderboard.rank 1, đồng hạng tính) VÀ bút toán gần nhất trong T giây mà TRƯỚC nó Role chưa hạng 1
  SELECT e.role_id, x.id, x.display_id, x.created_at, b.t_sec
  FROM b JOIN elig e ON e.role_id = b.role_id
  JOIN ledger_entries x ON x.id = (
    SELECT l.id FROM ledger_entries l
    WHERE l.workspace_id = e.workspace_id AND l.created_at >= b.t_from AND l.created_at <= b.now_ts
      AND EXISTS (SELECT 1 FROM elig o WHERE o.workspace_id = e.workspace_id AND o.role_id <> e.role_id
                  AND COALESCE((SELECT CASE WHEN p.debit_wallet_id = o.wallet_id THEN p.debit_balance_after ELSE p.credit_balance_after END
                                FROM ledger_entries p WHERE (p.debit_wallet_id = o.wallet_id OR p.credit_wallet_id = o.wallet_id)
                                  AND p.display_seq < l.display_seq ORDER BY p.display_seq DESC LIMIT 1), 0)
                    > COALESCE((SELECT CASE WHEN p.debit_wallet_id = e.wallet_id THEN p.debit_balance_after ELSE p.credit_balance_after END
                                FROM ledger_entries p WHERE (p.debit_wallet_id = e.wallet_id OR p.credit_wallet_id = e.wallet_id)
                                  AND p.display_seq < l.display_seq ORDER BY p.display_seq DESC LIMIT 1), 0))
    ORDER BY l.display_seq DESC LIMIT 1)
  WHERE NOT EXISTS (SELECT 1 FROM elig o WHERE o.workspace_id = e.workspace_id AND o.balance_minor > e.balance_minor)
), commits AS (                          -- Role nhận việc (đối chiếu Polaris task_accept) hoặc ký cam kết
  SELECT p.role_id, 'polaris_checks' AS tbl, p.id, p.display_id, p.created_at AS at, p.display_seq AS sq
  FROM polaris_checks p WHERE p.subject_kind = 'task_accept'
  UNION ALL
  SELECT m.promised_by_role_id, 'commitments', m.id, m.display_id, m.created_at, m.display_seq
  FROM commitments m WHERE m.promised_by_role_id IS NOT NULL AND m.deleted_at IS NULL
), commit_pick AS (
  SELECT c.*, b.t_sec, ROW_NUMBER() OVER (PARTITION BY c.role_id ORDER BY c.at DESC, c.sq DESC) AS rn
  FROM commits c JOIN b ON b.role_id = c.role_id WHERE c.at >= b.t_from AND c.at <= b.now_ts
), lastmsg AS (                          -- câu trả lời gần nhất (tin final) của Role
  SELECT b.role_id, m.id, m.display_id, m.created_at, m.certainty, b.t_from, b.t_sec
  FROM b JOIN chat_messages m ON m.id = (
    SELECT x.id FROM chat_messages x JOIN chat_threads th ON th.id = x.thread_id LEFT JOIN actors xa ON xa.id = x.author_actor_id
    WHERE x.workspace_id = b.workspace_id AND x.author_kind = 'role' AND x.status = 'final' AND x.created_at <= b.now_ts
      AND COALESCE(xa.role_id, th.role_id) IS b.role_id
    ORDER BY x.display_seq DESC LIMIT 1)
), cards AS (                            -- thẻ sống (ux_cd_live: tối đa một mỗi Role)
  SELECT c.role_id, c.id, c.display_id, c.status, c.issued_at, c.suspended_at
  FROM employee_cards c WHERE c.status IN ('issued', 'suspended') AND c.deleted_at IS NULL
), pol AS (                              -- hợp đồng giờ làm A3.P: giờ địa phương theo timezone của policy
  SELECT b.role_id, b.now_ts, p.id AS policy_id, p.display_id AS policy_display_id, p.quiet_start_min, p.quiet_end_min, p.weekend_differs,
         p.weekend_quiet_start_min, p.weekend_quiet_end_min, app_local_time(b.now_ts, p.timezone) AS loc
  FROM b JOIN proactive_policies p ON p.role_id = b.role_id AND p.workspace_id = b.workspace_id AND p.deleted_at IS NULL
), polq AS (
  SELECT pol.*,
         CAST(strftime('%H', loc) AS INTEGER) * 3600 + CAST(strftime('%M', loc) AS INTEGER) * 60 + CAST(strftime('%S', loc) AS INTEGER) AS sod,
         60 * CASE WHEN weekend_differs = 1 AND strftime('%w', loc) IN ('0', '6') THEN weekend_quiet_start_min ELSE quiet_start_min END AS qs,
         60 * CASE WHEN weekend_differs = 1 AND strftime('%w', loc) IN ('0', '6') THEN weekend_quiet_end_min ELSE quiet_end_min END AS qe
  FROM pol
), hours AS (                            -- in_quiet: trong giờ im lặng (start > end = qua đêm; start = end = không có giờ im lặng); mốc theo khung của ngày hiện tại
  SELECT role_id, policy_id, policy_display_id,
         CASE WHEN sod IS NULL OR qs = qe THEN 0 WHEN qs < qe THEN (sod >= qs AND sod < qe) ELSE (sod >= qs OR sod < qe) END AS in_quiet,
         strftime('%Y-%m-%dT%H:%M:%S.000Z', now_ts, '-' || ((sod - qs + 86400) % 86400) || ' seconds') AS quiet_since,
         strftime('%Y-%m-%dT%H:%M:%S.000Z', now_ts, '+' || ((qe - sod + 86400) % 86400) || ' seconds') AS quiet_until
  FROM polq
), lastend AS (                          -- lượt chạy kết thúc gần nhất
  SELECT b.role_id, s.id, s.display_id, s.ended_at
  FROM b JOIN sessions s ON s.id = (SELECT x.id FROM sessions x WHERE x.workspace_id = b.workspace_id AND x.role_id = b.role_id AND x.agent_kind = 'role'
                                    AND x.status <> 'running' AND x.ended_at IS NOT NULL ORDER BY x.ended_at DESC, x.display_seq DESC LIMIT 1)
), idle AS (                             -- thẻ issued, trong giờ làm, không việc mở; rảnh kể từ (lượt chạy cuối hoặc lúc cấp thẻ) + N phút (đang chạy: run / think hạng cao hơn)
  SELECT b.role_id, b.now_ts,
         CASE WHEN le.ended_at > cd.issued_at THEN 'sessions' ELSE 'employee_cards' END AS tbl,
         CASE WHEN le.ended_at > cd.issued_at THEN le.id ELSE cd.id END AS sid,
         CASE WHEN le.ended_at > cd.issued_at THEN le.display_id ELSE cd.display_id END AS sdisp,
         strftime('%Y-%m-%dT%H:%M:%fZ', CASE WHEN le.ended_at > cd.issued_at THEN le.ended_at ELSE cd.issued_at END, '+' || b.idle_min || ' minutes') AS idle_from
  FROM b JOIN cards cd ON cd.role_id = b.role_id AND cd.status = 'issued'
  LEFT JOIN lastend le ON le.role_id = b.role_id
  LEFT JOIN hours h ON h.role_id = b.role_id
  WHERE COALESCE(h.in_quiet, 0) = 0
    AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.workspace_id = b.workspace_id AND t.assignee_role_id = b.role_id AND t.deleted_at IS NULL
                    AND t.status IN ('todo', 'queued', 'running', 'waiting_approval', 'waiting_permission', 'blocked'))
), cand AS (
  -- 1 error: lượt chạy lỗi gần nhất (error / timeout) chưa có lượt đạt (ok) sau nó
  SELECT b.role_id, 1 AS rk, 0 AS ord, 'error' AS state, 'sessions' AS source_table, s.id AS source_id, s.display_id AS source_display_id,
         s.ended_at AS since_at, NULL AS expires_at, NULL AS state_note
  FROM b JOIN sessions s ON s.id = (SELECT x.id FROM sessions x WHERE x.workspace_id = b.workspace_id AND x.role_id = b.role_id AND x.agent_kind = 'role'
                                    AND x.status IN ('error', 'timeout') ORDER BY x.display_seq DESC LIMIT 1)
  WHERE NOT EXISTS (SELECT 1 FROM sessions o WHERE o.workspace_id = b.workspace_id AND o.role_id = b.role_id AND o.agent_kind = 'role'
                    AND o.status = 'ok' AND o.display_seq > s.display_seq)
  UNION ALL
  -- 2 failover: phiên đang chạy trên tài khoản KHÔNG phải ưu tiên cao nhất trong danh sách binding sống + bật của Role
  SELECT run.role_id, 2, 0, 'failover', 'sessions', run.id, run.display_id, run.started_at, NULL, NULL
  FROM run JOIN bind cur ON cur.role_id = run.role_id AND cur.engine_account_id = run.engine_account_id
  WHERE cur.priority > (SELECT MIN(p.priority) FROM bind p WHERE p.role_id = run.role_id)
  UNION ALL
  -- 3 penalty: khoản phạt (entry_type penalty, trừ ví Role) trong T giây
  SELECT b.role_id, 3, 0, 'penalty', 'ledger_entries', l.id, l.display_id, l.created_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', l.created_at, '+' || b.t_sec || ' seconds'), NULL
  FROM b JOIN ledger_entries l ON l.id = (SELECT x.id FROM ledger_entries x WHERE x.workspace_id = b.workspace_id AND x.debit_wallet_id = b.wallet_id
                                          AND x.entry_type = 'penalty' AND x.created_at >= b.t_from AND x.created_at <= b.now_ts
                                          ORDER BY x.display_seq DESC LIMIT 1)
  UNION ALL
  -- 4 quota: tài khoản ưu tiên cao nhất hết quota VÀ không còn tài khoản nào của Role chạy được (đăng nhập, không sự cố hãng, adapter ready/beta, còn quota)
  SELECT pb.role_id, 4, 0, 'quota', 'engine_accounts', pb.engine_account_id, pb.account_display_id, pb.quota_scanned_at, pb.quota_reset_at, NULL
  FROM bind pb JOIN b ON b.role_id = pb.role_id
  WHERE pb.priority = (SELECT MIN(p.priority) FROM bind p WHERE p.role_id = pb.role_id) AND pb.quota_state = 'exhausted'
    AND NOT EXISTS (SELECT 1 FROM bind o WHERE o.role_id = pb.role_id AND o.quota_state <> 'exhausted' AND o.login_status = 'logged_in'
                    AND o.outage_since IS NULL AND o.adapter_status IN ('ready', 'beta'))
  UNION ALL
  -- 5 rest: Trọng thương đang mở
  SELECT b.role_id, 5, 0, 'rest', 'role_wounds', w.id, w.display_id, w.started_at, NULL, NULL
  FROM b JOIN role_wounds w ON w.role_id = b.role_id AND w.ended_at IS NULL
  UNION ALL
  -- 6 wait: việc chờ duyệt lâu nhất (tasks waiting_approval / waiting_permission · xin quyền pending · đề xuất của chính Role đang mở)
  SELECT wp.role_id, 6, 0, 'wait', wp.tbl, wp.id, wp.display_id, wp.at, NULL, NULL
  FROM wait_pick wp JOIN b ON b.role_id = wp.role_id WHERE wp.rn = 1
  UNION ALL
  -- 7 discover (thoáng qua)
  SELECT dp.role_id, 7, 0, 'discover', dp.tbl, dp.id, dp.display_id, dp.at, strftime('%Y-%m-%dT%H:%M:%fZ', dp.at, '+' || dp.t_sec || ' seconds'), NULL
  FROM disc_pick dp WHERE dp.rn = 1
  UNION ALL
  -- 8 rank1 (thoáng qua)
  SELECT r1.role_id, 8, 0, 'rank1', 'ledger_entries', r1.id, r1.display_id, r1.created_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', r1.created_at, '+' || r1.t_sec || ' seconds'), NULL
  FROM rank1 r1
  UNION ALL
  -- 9 reward: khoản cộng vào ví Role trong T giây (thưởng, cấp thêm, vốn kích hoạt, đảo phạt…)
  SELECT b.role_id, 9, 0, 'reward', 'ledger_entries', l.id, l.display_id, l.created_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', l.created_at, '+' || b.t_sec || ' seconds'), NULL
  FROM b JOIN ledger_entries l ON l.id = (SELECT x.id FROM ledger_entries x WHERE x.workspace_id = b.workspace_id AND x.credit_wallet_id = b.wallet_id
                                          AND x.created_at >= b.t_from AND x.created_at <= b.now_ts ORDER BY x.display_seq DESC LIMIT 1)
  UNION ALL
  -- 10 commit (thoáng qua)
  SELECT cp.role_id, 10, 0, 'commit', cp.tbl, cp.id, cp.display_id, cp.at, strftime('%Y-%m-%dT%H:%M:%fZ', cp.at, '+' || cp.t_sec || ' seconds'), NULL
  FROM commit_pick cp WHERE cp.rn = 1
  UNION ALL
  -- 11 unsure: câu trả lời gần nhất tự gắn nhãn chưa chắc, trong T giây
  SELECT lm.role_id, 11, 0, 'unsure', 'chat_messages', lm.id, lm.display_id, lm.created_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', lm.created_at, '+' || lm.t_sec || ' seconds'), NULL
  FROM lastmsg lm WHERE lm.certainty = 'unsure' AND lm.created_at >= lm.t_from
  UNION ALL
  -- 12 think: phiên đang chạy ở pha lập kế hoạch
  SELECT run.role_id, 12, 0, 'think', 'sessions', run.id, run.display_id, run.phase_at, NULL, NULL
  FROM run WHERE run.phase = 'planning'
  UNION ALL
  -- 13 run: phiên đang chạy (pha thao tác; pha chưa đo được ⇒ cũng hiện run, kèm ghi chú)
  SELECT run.role_id, 13, 0, 'run', 'sessions', run.id, run.display_id, COALESCE(CASE WHEN run.phase = 'acting' THEN run.phase_at END, run.started_at), NULL,
         CASE WHEN run.phase IS NULL THEN 'Chưa đo được pha lập kế hoạch — tạm hiện Đang làm' END
  FROM run
  UNION ALL
  -- 14 idle
  SELECT i.role_id, 14, 0, 'idle', i.tbl, i.sid, i.sdisp, i.idle_from, NULL, NULL
  FROM idle i WHERE i.idle_from <= i.now_ts
  UNION ALL
  -- 15 sleep: thẻ tạm ngưng · ngoài giờ làm
  SELECT cd.role_id, 15, 0, 'sleep', 'employee_cards', cd.id, cd.display_id, cd.suspended_at, NULL, NULL
  FROM cards cd JOIN b ON b.role_id = cd.role_id WHERE cd.status = 'suspended'
  UNION ALL
  SELECT h.role_id, 15, 1, 'sleep', 'proactive_policies', h.policy_id, h.policy_display_id, h.quiet_since, h.quiet_until, NULL
  FROM hours h WHERE h.in_quiet = 1
  UNION ALL
  -- 16 normal
  SELECT b.role_id, 16, 0, 'normal', NULL, NULL, NULL, NULL, NULL, NULL FROM b
), pick AS (
  SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.role_id ORDER BY c.rk, c.ord) AS rn FROM cand c
)
SELECT b.workspace_id, b.role_id, b.role_display_id, b.name AS role_name, p.rk AS state_rank, p.state,
       CASE p.state WHEN 'error' THEN 'Lỗi' WHEN 'failover' THEN 'Đổi CLI' WHEN 'penalty' THEN 'Bị phạt' WHEN 'quota' THEN 'Hết quota'
                    WHEN 'rest' THEN 'Nghỉ dưỡng thương' WHEN 'wait' THEN 'Chờ duyệt' WHEN 'discover' THEN 'Kinh ngạc' WHEN 'rank1' THEN 'Lên #1'
                    WHEN 'reward' THEN 'Nhận thưởng' WHEN 'commit' THEN 'Hứa quyết tâm' WHEN 'unsure' THEN 'Nói không chắc' WHEN 'think' THEN 'Suy tư'
                    WHEN 'run' THEN 'Đang làm' WHEN 'idle' THEN 'Rảnh' WHEN 'sleep' THEN 'Ngủ' WHEN 'normal' THEN 'Bình thường' END AS state_label,
       p.source_table, p.source_id, p.source_display_id, p.since_at, p.expires_at, p.state_note,
       b.t_sec AS transient_seconds, b.idle_min AS idle_after_minutes, b.now_ts AS evaluated_at,
       b.avatar_id, av.source AS avatar_source, av.skin_asset_id, sn.asset_code, sn.asset_kind,
       CASE WHEN av.source = 'library' AND sn.is_enabled = 0 THEN 1 ELSE 0 END AS character_disabled
FROM b JOIN pick p ON p.role_id = b.role_id AND p.rn = 1
LEFT JOIN avatars av ON av.id = b.avatar_id
LEFT JOIN skin_assets sn ON sn.id = av.skin_asset_id;
;

CREATE VIEW v_integrity_tenant AS
SELECT 'actors.role_id' AS fk, c.workspace_id, count(*) AS n FROM actors c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'id_aliases.created_by' AS fk, c.workspace_id, count(*) AS n FROM id_aliases c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.created_by' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.updated_by' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.avatar_id' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN avatars p ON p.id = c.avatar_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.birth_revision_id' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN revisions p ON p.id = c.birth_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.current_revision_id' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN revisions p ON p.id = c.current_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'avatars.created_by' AS fk, c.workspace_id, count(*) AS n FROM avatars c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'avatars.role_id' AS fk, c.workspace_id, count(*) AS n FROM avatars c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'avatars.blob_id' AS fk, c.workspace_id, count(*) AS n FROM avatars c JOIN blobs p ON p.id = c.blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'avatars.skin_asset_id' AS fk, c.workspace_id, count(*) AS n FROM avatars c JOIN skin_assets p ON p.id = c.skin_asset_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skin_assets.created_by' AS fk, c.workspace_id, count(*) AS n FROM skin_assets c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skin_assets.updated_by' AS fk, c.workspace_id, count(*) AS n FROM skin_assets c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skin_assets.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM skin_assets c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_defs.created_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_defs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_defs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_defs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_defs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_defs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.created_by' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.updated_by' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.role_id' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.def_id' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN dna_field_defs p ON p.id = c.def_id WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.confirmed_by' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN actors p ON p.id = c.confirmed_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.covered_by_instruction_id' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN instructions p ON p.id = c.covered_by_instruction_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.dna_field_id' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN dna_fields p ON p.id = c.dna_field_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.revision_id' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.created_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.decided_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.created_by' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.role_id' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.position_id' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.restored_from_id' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN revisions p ON p.id = c.restored_from_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.created_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.updated_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.role_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.position_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.proposed_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.proposed_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.source_thread_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN chat_threads p ON p.id = c.source_thread_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.source_session_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN sessions p ON p.id = c.source_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.decided_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.revision_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.dna_field_version_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN dna_field_versions p ON p.id = c.dna_field_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.instruction_version_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN instruction_versions p ON p.id = c.instruction_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.role_skill_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN role_skills p ON p.id = c.role_skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.knowledge_item_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN knowledge_items p ON p.id = c.knowledge_item_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.memory_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN memories p ON p.id = c.memory_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.taxonomy_node_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN taxonomy_nodes p ON p.id = c.taxonomy_node_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.skill_prereq_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN skill_prereqs p ON p.id = c.skill_prereq_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.created_by' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.updated_by' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.role_id' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.position_id' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.engine_scope' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN engines p ON p.slug = c.engine_scope WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.instruction_id' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN instructions p ON p.id = c.instruction_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.revision_id' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.created_by' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.decided_by' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.created_by' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.updated_by' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.parent_id' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN taxonomy_nodes p ON p.id = c.parent_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.confirmed_by' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN actors p ON p.id = c.confirmed_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.created_by' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.updated_by' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.current_version_id' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN skill_versions p ON p.id = c.current_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.category_id' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN taxonomy_nodes p ON p.id = c.category_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_versions.skill_id' AS fk, c.workspace_id, count(*) AS n FROM skill_versions c JOIN skills p ON p.id = c.skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_versions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM skill_versions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_versions.created_by' AS fk, c.workspace_id, count(*) AS n FROM skill_versions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_versions.decided_by' AS fk, c.workspace_id, count(*) AS n FROM skill_versions c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.created_by' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.skill_id' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN skills p ON p.id = c.skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.requires_skill_id' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN skills p ON p.id = c.requires_skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.confirmed_by' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN actors p ON p.id = c.confirmed_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_engine_support.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM skill_engine_support c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_engine_support.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM skill_engine_support c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_files.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM skill_files c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_files.blob_id' AS fk, c.workspace_id, count(*) AS n FROM skill_files c JOIN blobs p ON p.id = c.blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.created_by' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.updated_by' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.role_id' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.skill_id' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN skills p ON p.id = c.skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'blobs.created_by' AS fk, c.workspace_id, count(*) AS n FROM blobs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.created_by' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.updated_by' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.role_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.position_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.blob_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN blobs p ON p.id = c.blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.duplicate_of_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN knowledge_items p ON p.id = c.duplicate_of_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.superseded_by_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN knowledge_items p ON p.id = c.superseded_by_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.source_attachment_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN message_attachments p ON p.id = c.source_attachment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.category_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN taxonomy_nodes p ON p.id = c.category_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_chunks.knowledge_item_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_chunks c JOIN knowledge_items p ON p.id = c.knowledge_item_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.created_by' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.updated_by' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.role_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.position_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.source_session_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN sessions p ON p.id = c.source_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.superseded_by_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN memories p ON p.id = c.superseded_by_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.commitment_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN commitments p ON p.id = c.commitment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.role_wound_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN role_wounds p ON p.id = c.role_wound_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.evidence_task_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN tasks p ON p.id = c.evidence_task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.evidence_ledger_entry_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN ledger_entries p ON p.id = c.evidence_ledger_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.created_by' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.session_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.role_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.memory_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN memories p ON p.id = c.memory_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.knowledge_chunk_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN knowledge_chunks p ON p.id = c.knowledge_chunk_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.knowledge_item_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN knowledge_items p ON p.id = c.knowledge_item_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.created_by' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.updated_by' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.reports_to_position_id' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN positions p ON p.id = c.reports_to_position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.current_revision_id' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN revisions p ON p.id = c.current_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.created_by' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.updated_by' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.role_id' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.position_id' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.created_by' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.assignment_id' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN assignments p ON p.id = c.assignment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.role_id' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.position_id' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.ledger_entry_id' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN ledger_entries p ON p.id = c.ledger_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.decided_by' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.created_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.updated_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.position_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.assignee_role_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN roles p ON p.id = c.assignee_role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.requested_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.requested_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.verified_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.verified_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.commitment_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN commitments p ON p.id = c.commitment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.parent_task_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN tasks p ON p.id = c.parent_task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.proactive_job_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN proactive_jobs p ON p.id = c.proactive_job_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.thread_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN chat_threads p ON p.id = c.thread_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.paused_by_wound_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN role_wounds p ON p.id = c.paused_by_wound_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.created_by' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.updated_by' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.position_id' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.promised_by_role_id' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN roles p ON p.id = c.promised_by_role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.source_session_id' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN sessions p ON p.id = c.source_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.created_by' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.role_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.position_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.task_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN tasks p ON p.id = c.task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.thread_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN chat_threads p ON p.id = c.thread_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.compiled_prompt_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN compiled_prompts p ON p.id = c.compiled_prompt_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.container_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN containers p ON p.id = c.container_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.created_by' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.updated_by' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.role_id' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.last_entry_id' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN ledger_entries p ON p.id = c.last_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.created_by' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.debit_wallet_id' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN wallets p ON p.id = c.debit_wallet_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.credit_wallet_id' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN wallets p ON p.id = c.credit_wallet_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.reverses_entry_id' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN ledger_entries p ON p.id = c.reverses_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.recorded_by' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN actors p ON p.id = c.recorded_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.approved_by' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN actors p ON p.id = c.approved_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.created_by' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.role_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.wallet_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN wallets p ON p.id = c.wallet_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.cause_entry_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN ledger_entries p ON p.id = c.cause_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.revive_entry_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN ledger_entries p ON p.id = c.revive_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.reflection_session_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN sessions p ON p.id = c.reflection_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_installs.created_by' AS fk, c.workspace_id, count(*) AS n FROM engine_installs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_installs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM engine_installs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_installs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM engine_installs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_installs.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM engine_installs c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.created_by' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.updated_by' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.secret_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN secrets p ON p.id = c.secret_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.last_probe_run_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN probe_runs p ON p.id = c.last_probe_run_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.overhead_bare_session_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN sessions p ON p.id = c.overhead_bare_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.overhead_shell_session_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN sessions p ON p.id = c.overhead_shell_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.consent_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN consents p ON p.id = c.consent_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.created_by' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.updated_by' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.role_id' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'system_agents.created_by' AS fk, c.workspace_id, count(*) AS n FROM system_agents c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'system_agents.updated_by' AS fk, c.workspace_id, count(*) AS n FROM system_agents c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'system_agents.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM system_agents c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'probe_runs.created_by' AS fk, c.workspace_id, count(*) AS n FROM probe_runs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'probe_runs.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM probe_runs c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'probe_runs.container_id' AS fk, c.workspace_id, count(*) AS n FROM probe_runs c JOIN containers p ON p.id = c.container_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'probe_runs.raw_blob_id' AS fk, c.workspace_id, count(*) AS n FROM probe_runs c JOIN blobs p ON p.id = c.raw_blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.created_by' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.updated_by' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.last_probe_run_id' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN probe_runs p ON p.id = c.last_probe_run_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'quota_snapshots.created_by' AS fk, c.workspace_id, count(*) AS n FROM quota_snapshots c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'quota_snapshots.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM quota_snapshots c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'quota_snapshots.probe_run_id' AS fk, c.workspace_id, count(*) AS n FROM quota_snapshots c JOIN probe_runs p ON p.id = c.probe_run_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.created_by' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.updated_by' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.ranked_by' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN actors p ON p.id = c.ranked_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.created_by' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.role_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.revision_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.position_revision_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN revisions p ON p.id = c.position_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.rules_revision_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN revisions p ON p.id = c.rules_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompt_segments.compiled_prompt_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompt_segments c JOIN compiled_prompts p ON p.id = c.compiled_prompt_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompt_segments.dna_field_version_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompt_segments c JOIN dna_field_versions p ON p.id = c.dna_field_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompt_segments.instruction_version_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompt_segments c JOIN instruction_versions p ON p.id = c.instruction_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompt_segments.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompt_segments c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'containers.created_by' AS fk, c.workspace_id, count(*) AS n FROM containers c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'containers.updated_by' AS fk, c.workspace_id, count(*) AS n FROM containers c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'containers.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM containers c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'containers.role_id' AS fk, c.workspace_id, count(*) AS n FROM containers c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.created_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.updated_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.role_id' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.secret_id' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN secrets p ON p.id = c.secret_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_allowlist.created_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_allowlist c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_allowlist.updated_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_allowlist c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_allowlist.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_allowlist c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_allowlist.bot_id' AS fk, c.workspace_id, count(*) AS n FROM telegram_allowlist c JOIN telegram_bots p ON p.id = c.bot_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_policies.created_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_policies c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_policies.updated_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_policies c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_policies.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_policies c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_policies.role_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_policies c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.created_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.position_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.skill_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN skills p ON p.id = c.skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.created_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.role_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.policy_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN proactive_policies p ON p.id = c.policy_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.message_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN chat_messages p ON p.id = c.message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.task_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN tasks p ON p.id = c.task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.commitment_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN commitments p ON p.id = c.commitment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.proactive_job_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN proactive_jobs p ON p.id = c.proactive_job_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tools.created_by' AS fk, c.workspace_id, count(*) AS n FROM tools c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tools.updated_by' AS fk, c.workspace_id, count(*) AS n FROM tools c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tools.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM tools c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tools.secret_id' AS fk, c.workspace_id, count(*) AS n FROM tools c JOIN secrets p ON p.id = c.secret_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.created_by' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.updated_by' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.tool_id' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN tools p ON p.id = c.tool_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.role_id' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.position_id' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.source_request_id' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN permission_requests p ON p.id = c.source_request_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.created_by' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.updated_by' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.role_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.tool_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN tools p ON p.id = c.tool_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.task_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN tasks p ON p.id = c.task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.session_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.decided_by' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.grant_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN tool_grants p ON p.id = c.grant_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.created_by' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.updated_by' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.role_id' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.position_id' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.tool_id' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN tools p ON p.id = c.tool_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.created_by' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.role_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.permission_request_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN permission_requests p ON p.id = c.permission_request_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.proactive_send_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN proactive_sends p ON p.id = c.proactive_send_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.task_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN tasks p ON p.id = c.task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.session_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.created_by' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.updated_by' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.role_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.revision_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.compiled_prompt_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN compiled_prompts p ON p.id = c.compiled_prompt_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.position_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.issued_by' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN actors p ON p.id = c.issued_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.superseded_by_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN employee_cards p ON p.id = c.superseded_by_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.created_by' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.role_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.revision_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.compiled_prompt_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN compiled_prompts p ON p.id = c.compiled_prompt_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.judge_session_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN sessions p ON p.id = c.judge_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.decided_by' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.created_by' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.updated_by' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.role_id' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.telegram_bot_id' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN telegram_bots p ON p.id = c.telegram_bot_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.created_by' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.thread_id' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN chat_threads p ON p.id = c.thread_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.author_actor_id' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN actors p ON p.id = c.author_actor_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.session_id' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.reply_to_id' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN chat_messages p ON p.id = c.reply_to_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.redacted_by' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN actors p ON p.id = c.redacted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.created_by' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.updated_by' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.message_id' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN chat_messages p ON p.id = c.message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.blob_id' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN blobs p ON p.id = c.blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.thumbnail_blob_id' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN blobs p ON p.id = c.thumbnail_blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.uploaded_by' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN actors p ON p.id = c.uploaded_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_anchors.created_by' AS fk, c.workspace_id, count(*) AS n FROM message_anchors c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_anchors.message_id' AS fk, c.workspace_id, count(*) AS n FROM message_anchors c JOIN chat_messages p ON p.id = c.message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ui_actions.created_by' AS fk, c.workspace_id, count(*) AS n FROM ui_actions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ui_actions.message_id' AS fk, c.workspace_id, count(*) AS n FROM ui_actions c JOIN chat_messages p ON p.id = c.message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ui_actions.session_id' AS fk, c.workspace_id, count(*) AS n FROM ui_actions c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ui_actions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM ui_actions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'audit_log.created_by' AS fk, c.workspace_id, count(*) AS n FROM audit_log c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'audit_log.actor_id' AS fk, c.workspace_id, count(*) AS n FROM audit_log c JOIN actors p ON p.id = c.actor_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'events.created_by' AS fk, c.workspace_id, count(*) AS n FROM events c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'notifications.created_by' AS fk, c.workspace_id, count(*) AS n FROM notifications c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'notifications.updated_by' AS fk, c.workspace_id, count(*) AS n FROM notifications c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'notifications.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM notifications c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'jobs.created_by' AS fk, c.workspace_id, count(*) AS n FROM jobs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'app_versions.created_by' AS fk, c.workspace_id, count(*) AS n FROM app_versions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'app_versions.updated_by' AS fk, c.workspace_id, count(*) AS n FROM app_versions c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'app_versions.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM app_versions c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'backups.created_by' AS fk, c.workspace_id, count(*) AS n FROM backups c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'backups.updated_by' AS fk, c.workspace_id, count(*) AS n FROM backups c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'backups.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM backups c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.created_by' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.from_version' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN app_versions p ON p.semver = c.from_version WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.to_version' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN app_versions p ON p.semver = c.to_version WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.initiated_by' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN actors p ON p.id = c.initiated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.backup_id' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN backups p ON p.id = c.backup_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'settings.created_by' AS fk, c.workspace_id, count(*) AS n FROM settings c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'settings.updated_by' AS fk, c.workspace_id, count(*) AS n FROM settings c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'settings.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM settings c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'secrets.created_by' AS fk, c.workspace_id, count(*) AS n FROM secrets c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'secrets.updated_by' AS fk, c.workspace_id, count(*) AS n FROM secrets c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'secrets.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM secrets c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'secrets.rotated_from_id' AS fk, c.workspace_id, count(*) AS n FROM secrets c JOIN secrets p ON p.id = c.rotated_from_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'consents.created_by' AS fk, c.workspace_id, count(*) AS n FROM consents c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id;
