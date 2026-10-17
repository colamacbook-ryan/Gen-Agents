-- repeatable: triggers
-- GENERATED bởi `pnpm db:gen` từ db/spec/schema_v2_2.sql (nguồn = repo, DB v2.3.5) — KHÔNG SỬA TAY.
-- Thứ tự tạo = thứ tự chạy ngược (SQLite chạy trigger tạo sau trước): giữ nguyên thứ tự này.
-- 905 trigger. Runner DROP mọi trigger rồi tạo lại sau mỗi lượt migration (DATABASE §10.1).

-- @ga:object trigger search_documents_ai
CREATE TRIGGER search_documents_ai AFTER INSERT ON search_documents BEGIN
  INSERT INTO search_fts(rowid, title_norm, body_norm) VALUES (new.id, new.title_norm, new.body_norm);
END;

-- @ga:object trigger search_documents_ad
CREATE TRIGGER search_documents_ad AFTER DELETE ON search_documents BEGIN
  INSERT INTO search_fts(search_fts, rowid, title_norm, body_norm) VALUES ('delete', old.id, old.title_norm, old.body_norm);
END;

-- @ga:object trigger search_documents_au
CREATE TRIGGER search_documents_au AFTER UPDATE ON search_documents BEGIN
  INSERT INTO search_fts(search_fts, rowid, title_norm, body_norm) VALUES ('delete', old.id, old.title_norm, old.body_norm);
  INSERT INTO search_fts(rowid, title_norm, body_norm) VALUES (new.id, new.title_norm, new.body_norm);
END;

-- @ga:object trigger workspaces_no_replace_i
CREATE TRIGGER workspaces_no_replace_i BEFORE INSERT ON workspaces
WHEN (
  (EXISTS (SELECT 1 FROM workspaces x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.slug = NEW.slug))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.short_code = NEW.short_code))
  OR ((NEW.kind = 'system') AND EXISTS (SELECT 1 FROM workspaces x WHERE x.kind = NEW.kind AND (x.kind = 'system')))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): workspaces — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger workspaces_no_replace_u
CREATE TRIGGER workspaces_no_replace_u BEFORE UPDATE OF id, kind, slug, short_code ON workspaces
WHEN (
  (EXISTS (SELECT 1 FROM workspaces x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.slug = NEW.slug AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM workspaces x WHERE x.short_code = NEW.short_code AND x.rowid <> OLD.rowid))
  OR ((NEW.kind = 'system') AND EXISTS (SELECT 1 FROM workspaces x WHERE x.kind = NEW.kind AND (x.kind = 'system') AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): workspaces — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger users_no_replace_i
CREATE TRIGGER users_no_replace_i BEFORE INSERT ON users
WHEN (
  (EXISTS (SELECT 1 FROM users x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.username = NEW.username))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.email = NEW.email))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): users — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger users_no_replace_u
CREATE TRIGGER users_no_replace_u BEFORE UPDATE OF id, display_seq, username, email ON users
WHEN (
  (EXISTS (SELECT 1 FROM users x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.username = NEW.username AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM users x WHERE x.email = NEW.email AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): users — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger workspace_members_no_replace_i
CREATE TRIGGER workspace_members_no_replace_i BEFORE INSERT ON workspace_members
WHEN (
  (EXISTS (SELECT 1 FROM workspace_members x WHERE x.workspace_id = NEW.workspace_id AND x.user_id = NEW.user_id))
  OR (EXISTS (SELECT 1 FROM workspace_members x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): workspace_members — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger workspace_members_no_replace_u
CREATE TRIGGER workspace_members_no_replace_u BEFORE UPDATE OF workspace_id, user_id ON workspace_members
WHEN (
  (EXISTS (SELECT 1 FROM workspace_members x WHERE x.workspace_id = NEW.workspace_id AND x.user_id = NEW.user_id AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): workspace_members — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger auth_sessions_no_replace_i
CREATE TRIGGER auth_sessions_no_replace_i BEFORE INSERT ON auth_sessions
WHEN (
  (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.token_hash = NEW.token_hash))
  OR (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): auth_sessions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger auth_sessions_no_replace_u
CREATE TRIGGER auth_sessions_no_replace_u BEFORE UPDATE OF id, token_hash ON auth_sessions
WHEN (
  (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.token_hash = NEW.token_hash AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): auth_sessions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger actors_no_replace_i
CREATE TRIGGER actors_no_replace_i BEFORE INSERT ON actors
WHEN (
  (EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.workspace_id = NEW.workspace_id AND x.user_id = NEW.user_id))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.role_id = NEW.role_id))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): actors — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger actors_no_replace_u
CREATE TRIGGER actors_no_replace_u BEFORE UPDATE OF id, workspace_id, user_id, role_id, system_key ON actors
WHEN (
  (EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.workspace_id = NEW.workspace_id AND x.user_id = NEW.user_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.role_id = NEW.role_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): actors — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger id_aliases_no_replace_i
CREATE TRIGGER id_aliases_no_replace_i BEFORE INSERT ON id_aliases
WHEN (
  (EXISTS (SELECT 1 FROM id_aliases x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM id_aliases x WHERE x.workspace_id = NEW.workspace_id AND x.source_code = NEW.source_code AND x.old_display_id = NEW.old_display_id))
  OR (EXISTS (SELECT 1 FROM id_aliases x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): id_aliases — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger id_aliases_no_replace_u
CREATE TRIGGER id_aliases_no_replace_u BEFORE UPDATE OF id, workspace_id, old_display_id, source_code ON id_aliases
WHEN (
  (EXISTS (SELECT 1 FROM id_aliases x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM id_aliases x WHERE x.workspace_id = NEW.workspace_id AND x.source_code = NEW.source_code AND x.old_display_id = NEW.old_display_id AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): id_aliases — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger roles_no_replace_i
CREATE TRIGGER roles_no_replace_i BEFORE INSERT ON roles
WHEN (
  (EXISTS (SELECT 1 FROM roles x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.registry_no = NEW.registry_no))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): roles — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger roles_no_replace_u
CREATE TRIGGER roles_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, name_norm, registry_no ON roles
WHEN (
  (EXISTS (SELECT 1 FROM roles x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.registry_no = NEW.registry_no AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): roles — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger avatars_no_replace_i
CREATE TRIGGER avatars_no_replace_i BEFORE INSERT ON avatars
WHEN (
  (EXISTS (SELECT 1 FROM avatars x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM avatars x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM avatars x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): avatars — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger avatars_no_replace_u
CREATE TRIGGER avatars_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON avatars
WHEN (
  (EXISTS (SELECT 1 FROM avatars x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM avatars x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): avatars — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skin_assets_no_replace_i
CREATE TRIGGER skin_assets_no_replace_i BEFORE INSERT ON skin_assets
WHEN (
  (EXISTS (SELECT 1 FROM skin_assets x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM skin_assets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skin_assets x WHERE x.workspace_id = NEW.workspace_id AND x.pack_slug = NEW.pack_slug AND x.asset_code = NEW.asset_code AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM skin_assets x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skin_assets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skin_assets_no_replace_u
CREATE TRIGGER skin_assets_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, pack_slug, asset_code ON skin_assets
WHEN (
  (EXISTS (SELECT 1 FROM skin_assets x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skin_assets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skin_assets x WHERE x.workspace_id = NEW.workspace_id AND x.pack_slug = NEW.pack_slug AND x.asset_code = NEW.asset_code AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skin_assets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger dna_field_defs_no_replace_i
CREATE TRIGGER dna_field_defs_no_replace_i BEFORE INSERT ON dna_field_defs
WHEN (
  (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key))
  OR (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_field_defs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger dna_field_defs_no_replace_u
CREATE TRIGGER dna_field_defs_no_replace_u BEFORE UPDATE OF id, workspace_id, key ON dna_field_defs
WHEN (
  (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_field_defs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger dna_fields_no_replace_i
CREATE TRIGGER dna_fields_no_replace_i BEFORE INSERT ON dna_fields
WHEN (
  (EXISTS (SELECT 1 FROM dna_fields x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM dna_fields x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM dna_fields x WHERE x.role_id = NEW.role_id AND x.def_id = NEW.def_id AND x.item_index = NEW.item_index AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM dna_fields x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_fields — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger dna_fields_no_replace_u
CREATE TRIGGER dna_fields_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id, def_id, item_index ON dna_fields
WHEN (
  (EXISTS (SELECT 1 FROM dna_fields x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM dna_fields x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM dna_fields x WHERE x.role_id = NEW.role_id AND x.def_id = NEW.def_id AND x.item_index = NEW.item_index AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_fields — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger dna_field_versions_no_replace_i
CREATE TRIGGER dna_field_versions_no_replace_i BEFORE INSERT ON dna_field_versions
WHEN (
  (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.dna_field_id = NEW.dna_field_id AND x.version = NEW.version))
  OR (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_field_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger dna_field_versions_no_replace_u
CREATE TRIGGER dna_field_versions_no_replace_u BEFORE UPDATE OF id, dna_field_id, version ON dna_field_versions
WHEN (
  (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.dna_field_id = NEW.dna_field_id AND x.version = NEW.version AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): dna_field_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger revisions_no_replace_i
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

-- @ga:object trigger revisions_no_replace_u
CREATE TRIGGER revisions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, scope, role_id, position_id, seq, major, minor ON revisions
WHEN (
  (EXISTS (SELECT 1 FROM revisions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.role_id = NEW.role_id AND x.seq = NEW.seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.position_id = NEW.position_id AND x.seq = NEW.seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.role_id = NEW.role_id AND x.major = NEW.major AND x.minor = NEW.minor AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM revisions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.scope = 'workspace') AND EXISTS (SELECT 1 FROM revisions x WHERE x.workspace_id = NEW.workspace_id AND x.seq = NEW.seq AND (x.scope = 'workspace') AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): revisions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger change_sets_no_replace_i
CREATE TRIGGER change_sets_no_replace_i BEFORE INSERT ON change_sets
WHEN (
  (EXISTS (SELECT 1 FROM change_sets x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM change_sets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM change_sets x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): change_sets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger change_sets_no_replace_u
CREATE TRIGGER change_sets_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON change_sets
WHEN (
  (EXISTS (SELECT 1 FROM change_sets x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM change_sets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): change_sets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger change_set_items_no_replace_i
CREATE TRIGGER change_set_items_no_replace_i BEFORE INSERT ON change_set_items
WHEN (
  (EXISTS (SELECT 1 FROM change_set_items x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM change_set_items x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): change_set_items — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger change_set_items_no_replace_u
CREATE TRIGGER change_set_items_no_replace_u BEFORE UPDATE OF id ON change_set_items
WHEN (
  (EXISTS (SELECT 1 FROM change_set_items x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): change_set_items — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger instructions_no_replace_i
CREATE TRIGGER instructions_no_replace_i BEFORE INSERT ON instructions
WHEN (
  (EXISTS (SELECT 1 FROM instructions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM instructions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM instructions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): instructions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger instructions_no_replace_u
CREATE TRIGGER instructions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON instructions
WHEN (
  (EXISTS (SELECT 1 FROM instructions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM instructions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): instructions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger instruction_versions_no_replace_i
CREATE TRIGGER instruction_versions_no_replace_i BEFORE INSERT ON instruction_versions
WHEN (
  (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.instruction_id = NEW.instruction_id AND x.version = NEW.version))
  OR (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): instruction_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger instruction_versions_no_replace_u
CREATE TRIGGER instruction_versions_no_replace_u BEFORE UPDATE OF id, instruction_id, version ON instruction_versions
WHEN (
  (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.instruction_id = NEW.instruction_id AND x.version = NEW.version AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): instruction_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger taxonomy_nodes_no_replace_i
CREATE TRIGGER taxonomy_nodes_no_replace_i BEFORE INSERT ON taxonomy_nodes
WHEN (
  (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.workspace_id = NEW.workspace_id AND x.domain = NEW.domain AND COALESCE(x.parent_id, '') = COALESCE(NEW.parent_id, '') AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): taxonomy_nodes — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger taxonomy_nodes_no_replace_u
CREATE TRIGGER taxonomy_nodes_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, domain, parent_id, name_norm ON taxonomy_nodes
WHEN (
  (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.workspace_id = NEW.workspace_id AND x.domain = NEW.domain AND COALESCE(x.parent_id, '') = COALESCE(NEW.parent_id, '') AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): taxonomy_nodes — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skills_no_replace_i
CREATE TRIGGER skills_no_replace_i BEFORE INSERT ON skills
WHEN (
  (EXISTS (SELECT 1 FROM skills x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM skills x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skills x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM skills x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skills — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skills_no_replace_u
CREATE TRIGGER skills_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, slug ON skills
WHEN (
  (EXISTS (SELECT 1 FROM skills x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skills x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skills x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skills — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skill_versions_no_replace_i
CREATE TRIGGER skill_versions_no_replace_i BEFORE INSERT ON skill_versions
WHEN (
  (EXISTS (SELECT 1 FROM skill_versions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM skill_versions x WHERE x.skill_id = NEW.skill_id AND x.version = NEW.version))
  OR (EXISTS (SELECT 1 FROM skill_versions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skill_versions_no_replace_u
CREATE TRIGGER skill_versions_no_replace_u BEFORE UPDATE OF id, skill_id, version ON skill_versions
WHEN (
  (EXISTS (SELECT 1 FROM skill_versions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skill_versions x WHERE x.skill_id = NEW.skill_id AND x.version = NEW.version AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skill_prereqs_no_replace_i
CREATE TRIGGER skill_prereqs_no_replace_i BEFORE INSERT ON skill_prereqs
WHEN (
  (EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.id = NEW.id))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.skill_id = NEW.skill_id AND x.requires_skill_id = NEW.requires_skill_id AND (x.deleted_at IS NULL)))
  OR ((NEW.kind = 'upgrade' AND NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.skill_id = NEW.skill_id AND (x.kind = 'upgrade' AND x.status <> 'obsolete' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_prereqs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skill_prereqs_no_replace_u
CREATE TRIGGER skill_prereqs_no_replace_u BEFORE UPDATE OF id, deleted_at, skill_id, requires_skill_id, kind, status ON skill_prereqs
WHEN (
  (EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.skill_id = NEW.skill_id AND x.requires_skill_id = NEW.requires_skill_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.kind = 'upgrade' AND NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.skill_id = NEW.skill_id AND (x.kind = 'upgrade' AND x.status <> 'obsolete' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_prereqs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skill_engine_support_no_replace_i
CREATE TRIGGER skill_engine_support_no_replace_i BEFORE INSERT ON skill_engine_support
WHEN (
  (EXISTS (SELECT 1 FROM skill_engine_support x WHERE x.skill_version_id = NEW.skill_version_id AND x.engine_slug = NEW.engine_slug))
  OR (EXISTS (SELECT 1 FROM skill_engine_support x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_engine_support — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skill_engine_support_no_replace_u
CREATE TRIGGER skill_engine_support_no_replace_u BEFORE UPDATE OF skill_version_id, engine_slug ON skill_engine_support
WHEN (
  (EXISTS (SELECT 1 FROM skill_engine_support x WHERE x.skill_version_id = NEW.skill_version_id AND x.engine_slug = NEW.engine_slug AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_engine_support — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skill_files_no_replace_i
CREATE TRIGGER skill_files_no_replace_i BEFORE INSERT ON skill_files
WHEN (
  (EXISTS (SELECT 1 FROM skill_files x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM skill_files x WHERE x.skill_version_id = NEW.skill_version_id AND x.path = NEW.path))
  OR (EXISTS (SELECT 1 FROM skill_files x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_files — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger skill_files_no_replace_u
CREATE TRIGGER skill_files_no_replace_u BEFORE UPDATE OF id, skill_version_id, path ON skill_files
WHEN (
  (EXISTS (SELECT 1 FROM skill_files x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM skill_files x WHERE x.skill_version_id = NEW.skill_version_id AND x.path = NEW.path AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): skill_files — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger role_skills_no_replace_i
CREATE TRIGGER role_skills_no_replace_i BEFORE INSERT ON role_skills
WHEN (
  (EXISTS (SELECT 1 FROM role_skills x WHERE x.id = NEW.id))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM role_skills x WHERE x.role_id = NEW.role_id AND x.skill_id = NEW.skill_id AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM role_skills x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): role_skills — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger role_skills_no_replace_u
CREATE TRIGGER role_skills_no_replace_u BEFORE UPDATE OF id, deleted_at, role_id, skill_id ON role_skills
WHEN (
  (EXISTS (SELECT 1 FROM role_skills x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM role_skills x WHERE x.role_id = NEW.role_id AND x.skill_id = NEW.skill_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): role_skills — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger blobs_no_replace_i
CREATE TRIGGER blobs_no_replace_i BEFORE INSERT ON blobs
WHEN (
  (EXISTS (SELECT 1 FROM blobs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM blobs x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256))
  OR (EXISTS (SELECT 1 FROM blobs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): blobs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger blobs_no_replace_u
CREATE TRIGGER blobs_no_replace_u BEFORE UPDATE OF id, workspace_id, sha256 ON blobs
WHEN (
  (EXISTS (SELECT 1 FROM blobs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM blobs x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256 AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): blobs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger knowledge_items_no_replace_i
CREATE TRIGGER knowledge_items_no_replace_i BEFORE INSERT ON knowledge_items
WHEN (
  (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.scope = 'personal' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.role_id = NEW.role_id AND x.sha256 = NEW.sha256 AND (x.scope = 'personal' AND x.deleted_at IS NULL AND x.status <> 'superseded')))
  OR ((NEW.scope = 'position' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.position_id = NEW.position_id AND x.sha256 = NEW.sha256 AND (x.scope = 'position' AND x.deleted_at IS NULL AND x.status <> 'superseded')))
  OR ((NEW.scope = 'workspace' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256 AND (x.scope = 'workspace' AND x.deleted_at IS NULL AND x.status <> 'superseded')))
  OR (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): knowledge_items — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger knowledge_items_no_replace_u
CREATE TRIGGER knowledge_items_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, scope, role_id, position_id, sha256, status ON knowledge_items
WHEN (
  (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM knowledge_items x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.scope = 'personal' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.role_id = NEW.role_id AND x.sha256 = NEW.sha256 AND (x.scope = 'personal' AND x.deleted_at IS NULL AND x.status <> 'superseded') AND x.rowid <> OLD.rowid))
  OR ((NEW.scope = 'position' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.position_id = NEW.position_id AND x.sha256 = NEW.sha256 AND (x.scope = 'position' AND x.deleted_at IS NULL AND x.status <> 'superseded') AND x.rowid <> OLD.rowid))
  OR ((NEW.scope = 'workspace' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256 AND (x.scope = 'workspace' AND x.deleted_at IS NULL AND x.status <> 'superseded') AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): knowledge_items — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger knowledge_chunks_no_replace_i
CREATE TRIGGER knowledge_chunks_no_replace_i BEFORE INSERT ON knowledge_chunks
WHEN (
  (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.knowledge_item_id = NEW.knowledge_item_id AND x.ordinal = NEW.ordinal))
  OR (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): knowledge_chunks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger knowledge_chunks_no_replace_u
CREATE TRIGGER knowledge_chunks_no_replace_u BEFORE UPDATE OF id, knowledge_item_id, ordinal ON knowledge_chunks
WHEN (
  (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.knowledge_item_id = NEW.knowledge_item_id AND x.ordinal = NEW.ordinal AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): knowledge_chunks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger memories_no_replace_i
CREATE TRIGGER memories_no_replace_i BEFORE INSERT ON memories
WHEN (
  (EXISTS (SELECT 1 FROM memories x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM memories x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM memories x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): memories — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger memories_no_replace_u
CREATE TRIGGER memories_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON memories
WHEN (
  (EXISTS (SELECT 1 FROM memories x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM memories x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): memories — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger recall_hits_no_replace_i
CREATE TRIGGER recall_hits_no_replace_i BEFORE INSERT ON recall_hits
WHEN (
  (EXISTS (SELECT 1 FROM recall_hits x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM recall_hits x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): recall_hits — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger recall_hits_no_replace_u
CREATE TRIGGER recall_hits_no_replace_u BEFORE UPDATE OF id ON recall_hits
WHEN (
  (EXISTS (SELECT 1 FROM recall_hits x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): recall_hits — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger positions_no_replace_i
CREATE TRIGGER positions_no_replace_i BEFORE INSERT ON positions
WHEN (
  (EXISTS (SELECT 1 FROM positions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM positions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.is_default = 1 AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM positions x WHERE x.workspace_id = NEW.workspace_id AND (x.is_default = 1 AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM positions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): positions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger positions_no_replace_u
CREATE TRIGGER positions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, is_default ON positions
WHEN (
  (EXISTS (SELECT 1 FROM positions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM positions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.is_default = 1 AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM positions x WHERE x.workspace_id = NEW.workspace_id AND (x.is_default = 1 AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): positions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger assignments_no_replace_i
CREATE TRIGGER assignments_no_replace_i BEFORE INSERT ON assignments
WHEN (
  (EXISTS (SELECT 1 FROM assignments x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM assignments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.status = 'active' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM assignments x WHERE x.position_id = NEW.position_id AND (x.status = 'active' AND x.deleted_at IS NULL)))
  OR ((NEW.status = 'active' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM assignments x WHERE x.role_id = NEW.role_id AND (x.status = 'active' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM assignments x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): assignments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger assignments_no_replace_u
CREATE TRIGGER assignments_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id, position_id, status ON assignments
WHEN (
  (EXISTS (SELECT 1 FROM assignments x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM assignments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.status = 'active' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM assignments x WHERE x.position_id = NEW.position_id AND (x.status = 'active' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.status = 'active' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM assignments x WHERE x.role_id = NEW.role_id AND (x.status = 'active' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): assignments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger trust_tier_changes_no_replace_i
CREATE TRIGGER trust_tier_changes_no_replace_i BEFORE INSERT ON trust_tier_changes
WHEN (
  (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): trust_tier_changes — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger trust_tier_changes_no_replace_u
CREATE TRIGGER trust_tier_changes_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON trust_tier_changes
WHEN (
  (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): trust_tier_changes — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger tasks_no_replace_i
CREATE TRIGGER tasks_no_replace_i BEFORE INSERT ON tasks
WHEN (
  (EXISTS (SELECT 1 FROM tasks x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM tasks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM tasks x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tasks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger tasks_no_replace_u
CREATE TRIGGER tasks_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON tasks
WHEN (
  (EXISTS (SELECT 1 FROM tasks x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM tasks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tasks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger commitments_no_replace_i
CREATE TRIGGER commitments_no_replace_i BEFORE INSERT ON commitments
WHEN (
  (EXISTS (SELECT 1 FROM commitments x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM commitments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM commitments x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): commitments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger commitments_no_replace_u
CREATE TRIGGER commitments_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON commitments
WHEN (
  (EXISTS (SELECT 1 FROM commitments x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM commitments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): commitments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger sessions_no_replace_i
CREATE TRIGGER sessions_no_replace_i BEFORE INSERT ON sessions
WHEN (
  (EXISTS (SELECT 1 FROM sessions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM sessions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM sessions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): sessions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger sessions_no_replace_u
CREATE TRIGGER sessions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON sessions
WHEN (
  (EXISTS (SELECT 1 FROM sessions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM sessions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): sessions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger wallets_no_replace_i
CREATE TRIGGER wallets_no_replace_i BEFORE INSERT ON wallets
WHEN (
  (EXISTS (SELECT 1 FROM wallets x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.role_id IS NOT NULL) AND EXISTS (SELECT 1 FROM wallets x WHERE x.role_id = NEW.role_id AND (x.role_id IS NOT NULL)))
  OR ((NEW.owner_kind IN ('treasury', 'sink')) AND EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = NEW.workspace_id AND x.owner_kind = NEW.owner_kind AND (x.owner_kind IN ('treasury', 'sink'))))
  OR (EXISTS (SELECT 1 FROM wallets x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): wallets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger wallets_no_replace_u
CREATE TRIGGER wallets_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, owner_kind, role_id ON wallets
WHEN (
  (EXISTS (SELECT 1 FROM wallets x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.role_id IS NOT NULL) AND EXISTS (SELECT 1 FROM wallets x WHERE x.role_id = NEW.role_id AND (x.role_id IS NOT NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.owner_kind IN ('treasury', 'sink')) AND EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = NEW.workspace_id AND x.owner_kind = NEW.owner_kind AND (x.owner_kind IN ('treasury', 'sink')) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): wallets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger ledger_entries_no_replace_i
CREATE TRIGGER ledger_entries_no_replace_i BEFORE INSERT ON ledger_entries
WHEN (
  (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.reverses_entry_id = NEW.reverses_entry_id))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.workspace_id = NEW.workspace_id AND x.idempotency_key = NEW.idempotency_key))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): ledger_entries — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger ledger_entries_no_replace_u
CREATE TRIGGER ledger_entries_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, reverses_entry_id, idempotency_key ON ledger_entries
WHEN (
  (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.reverses_entry_id = NEW.reverses_entry_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.workspace_id = NEW.workspace_id AND x.idempotency_key = NEW.idempotency_key AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): ledger_entries — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger role_wounds_no_replace_i
CREATE TRIGGER role_wounds_no_replace_i BEFORE INSERT ON role_wounds
WHEN (
  (EXISTS (SELECT 1 FROM role_wounds x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.cause_entry_id = NEW.cause_entry_id))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.ended_at IS NULL) AND EXISTS (SELECT 1 FROM role_wounds x WHERE x.role_id = NEW.role_id AND (x.ended_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): role_wounds — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger role_wounds_no_replace_u
CREATE TRIGGER role_wounds_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, role_id, cause_entry_id, ended_at ON role_wounds
WHEN (
  (EXISTS (SELECT 1 FROM role_wounds x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.cause_entry_id = NEW.cause_entry_id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM role_wounds x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.ended_at IS NULL) AND EXISTS (SELECT 1 FROM role_wounds x WHERE x.role_id = NEW.role_id AND (x.ended_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): role_wounds — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger usage_daily_no_replace_i
CREATE TRIGGER usage_daily_no_replace_i BEFORE INSERT ON usage_daily
WHEN (
  (EXISTS (SELECT 1 FROM usage_daily x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM usage_daily x WHERE x.workspace_id = NEW.workspace_id AND x.day_local = NEW.day_local AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.engine_account_id, '') = COALESCE(NEW.engine_account_id, '') AND x.agent_kind = NEW.agent_kind))
  OR (EXISTS (SELECT 1 FROM usage_daily x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): usage_daily — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger usage_daily_no_replace_u
CREATE TRIGGER usage_daily_no_replace_u BEFORE UPDATE OF id, workspace_id, day_local, role_id, engine_account_id, agent_kind ON usage_daily
WHEN (
  (EXISTS (SELECT 1 FROM usage_daily x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM usage_daily x WHERE x.workspace_id = NEW.workspace_id AND x.day_local = NEW.day_local AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.engine_account_id, '') = COALESCE(NEW.engine_account_id, '') AND x.agent_kind = NEW.agent_kind AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): usage_daily — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger engines_no_replace_i
CREATE TRIGGER engines_no_replace_i BEFORE INSERT ON engines
WHEN (
  (EXISTS (SELECT 1 FROM engines x WHERE x.slug = NEW.slug))
  OR (EXISTS (SELECT 1 FROM engines x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engines — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger engines_no_replace_u
CREATE TRIGGER engines_no_replace_u BEFORE UPDATE OF slug ON engines
WHEN (
  (EXISTS (SELECT 1 FROM engines x WHERE x.slug = NEW.slug AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engines — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger engine_installs_no_replace_i
CREATE TRIGGER engine_installs_no_replace_i BEFORE INSERT ON engine_installs
WHEN (
  (EXISTS (SELECT 1 FROM engine_installs x WHERE x.id = NEW.id))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_installs x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM engine_installs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_installs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger engine_installs_no_replace_u
CREATE TRIGGER engine_installs_no_replace_u BEFORE UPDATE OF id, workspace_id, deleted_at, engine_slug ON engine_installs
WHEN (
  (EXISTS (SELECT 1 FROM engine_installs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_installs x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_installs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger engine_accounts_no_replace_i
CREATE TRIGGER engine_accounts_no_replace_i BEFORE INSERT ON engine_accounts
WHEN (
  (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND x.label = NEW.label AND (x.deleted_at IS NULL)))
  OR ((NEW.auth_volume IS NOT NULL) AND EXISTS (SELECT 1 FROM engine_accounts x WHERE x.auth_volume = NEW.auth_volume AND (x.auth_volume IS NOT NULL)))
  OR (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_accounts — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger engine_accounts_no_replace_u
CREATE TRIGGER engine_accounts_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, engine_slug, label, auth_volume ON engine_accounts
WHEN (
  (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND x.label = NEW.label AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.auth_volume IS NOT NULL) AND EXISTS (SELECT 1 FROM engine_accounts x WHERE x.auth_volume = NEW.auth_volume AND (x.auth_volume IS NOT NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_accounts — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger engine_bindings_no_replace_i
CREATE TRIGGER engine_bindings_no_replace_i BEFORE INSERT ON engine_bindings
WHEN (
  (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.engine_account_id = NEW.engine_account_id AND (x.deleted_at IS NULL)))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.role_id = NEW.role_id AND x.priority = NEW.priority AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL)))
  OR ((NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.workspace_id = NEW.workspace_id AND x.priority = NEW.priority AND (x.consumer_kind = 'system' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_bindings — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger engine_bindings_no_replace_u
CREATE TRIGGER engine_bindings_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, consumer_kind, role_id, engine_account_id, priority ON engine_bindings
WHEN (
  (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM engine_bindings x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.engine_account_id = NEW.engine_account_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.role_id = NEW.role_id AND x.priority = NEW.priority AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.workspace_id = NEW.workspace_id AND x.priority = NEW.priority AND (x.consumer_kind = 'system' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): engine_bindings — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger system_agents_no_replace_i
CREATE TRIGGER system_agents_no_replace_i BEFORE INSERT ON system_agents
WHEN (
  (EXISTS (SELECT 1 FROM system_agents x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM system_agents x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM system_agents x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM system_agents x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): system_agents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger system_agents_no_replace_u
CREATE TRIGGER system_agents_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, system_key ON system_agents
WHEN (
  (EXISTS (SELECT 1 FROM system_agents x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM system_agents x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM system_agents x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): system_agents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger probe_runs_no_replace_i
CREATE TRIGGER probe_runs_no_replace_i BEFORE INSERT ON probe_runs
WHEN (
  (EXISTS (SELECT 1 FROM probe_runs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM probe_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM probe_runs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): probe_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger probe_runs_no_replace_u
CREATE TRIGGER probe_runs_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON probe_runs
WHEN (
  (EXISTS (SELECT 1 FROM probe_runs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM probe_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): probe_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger capabilities_no_replace_i
CREATE TRIGGER capabilities_no_replace_i BEFORE INSERT ON capabilities
WHEN (
  (EXISTS (SELECT 1 FROM capabilities x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.engine_account_id = NEW.engine_account_id AND x.kind = NEW.kind AND x.item_key = NEW.item_key))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): capabilities — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger capabilities_no_replace_u
CREATE TRIGGER capabilities_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, engine_account_id, kind, item_key ON capabilities
WHEN (
  (EXISTS (SELECT 1 FROM capabilities x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.engine_account_id = NEW.engine_account_id AND x.kind = NEW.kind AND x.item_key = NEW.item_key AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): capabilities — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger quota_snapshots_no_replace_i
CREATE TRIGGER quota_snapshots_no_replace_i BEFORE INSERT ON quota_snapshots
WHEN (
  (EXISTS (SELECT 1 FROM quota_snapshots x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM quota_snapshots x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): quota_snapshots — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger quota_snapshots_no_replace_u
CREATE TRIGGER quota_snapshots_no_replace_u BEFORE UPDATE OF id ON quota_snapshots
WHEN (
  (EXISTS (SELECT 1 FROM quota_snapshots x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): quota_snapshots — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger model_ranks_no_replace_i
CREATE TRIGGER model_ranks_no_replace_i BEFORE INSERT ON model_ranks
WHEN (
  (EXISTS (SELECT 1 FROM model_ranks x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM model_ranks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM model_ranks x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND x.model_key = NEW.model_key AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM model_ranks x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): model_ranks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger model_ranks_no_replace_u
CREATE TRIGGER model_ranks_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, engine_slug, model_key ON model_ranks
WHEN (
  (EXISTS (SELECT 1 FROM model_ranks x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM model_ranks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM model_ranks x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND x.model_key = NEW.model_key AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): model_ranks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger compiled_prompts_no_replace_i
CREATE TRIGGER compiled_prompts_no_replace_i BEFORE INSERT ON compiled_prompts
WHEN (
  (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.revision_id = NEW.revision_id AND COALESCE(x.position_revision_id, '') = COALESCE(NEW.position_revision_id, '') AND COALESCE(x.rules_revision_id, '') = COALESCE(NEW.rules_revision_id, '') AND COALESCE(x.engine_slug, '') = COALESCE(NEW.engine_slug, '') AND x.context_key = NEW.context_key AND COALESCE(x.polaris_params_hash, '') = COALESCE(NEW.polaris_params_hash, '')))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): compiled_prompts — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger compiled_prompts_no_replace_u
CREATE TRIGGER compiled_prompts_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, revision_id, position_revision_id, rules_revision_id, engine_slug, context_key, polaris_params_hash ON compiled_prompts
WHEN (
  (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.revision_id = NEW.revision_id AND COALESCE(x.position_revision_id, '') = COALESCE(NEW.position_revision_id, '') AND COALESCE(x.rules_revision_id, '') = COALESCE(NEW.rules_revision_id, '') AND COALESCE(x.engine_slug, '') = COALESCE(NEW.engine_slug, '') AND x.context_key = NEW.context_key AND COALESCE(x.polaris_params_hash, '') = COALESCE(NEW.polaris_params_hash, '') AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): compiled_prompts — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger compiled_prompt_segments_no_replace_i
CREATE TRIGGER compiled_prompt_segments_no_replace_i BEFORE INSERT ON compiled_prompt_segments
WHEN (
  (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.compiled_prompt_id = NEW.compiled_prompt_id AND x.ordinal = NEW.ordinal))
  OR (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): compiled_prompt_segments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger compiled_prompt_segments_no_replace_u
CREATE TRIGGER compiled_prompt_segments_no_replace_u BEFORE UPDATE OF id, compiled_prompt_id, ordinal ON compiled_prompt_segments
WHEN (
  (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.compiled_prompt_id = NEW.compiled_prompt_id AND x.ordinal = NEW.ordinal AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): compiled_prompt_segments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger containers_no_replace_i
CREATE TRIGGER containers_no_replace_i BEFORE INSERT ON containers
WHEN (
  (EXISTS (SELECT 1 FROM containers x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM containers x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.container_name = NEW.container_name AND (x.deleted_at IS NULL)))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.role_id = NEW.role_id AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL)))
  OR ((NEW.kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.workspace_id = NEW.workspace_id AND (x.kind = 'system' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM containers x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): containers — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger containers_no_replace_u
CREATE TRIGGER containers_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, kind, role_id, container_name ON containers
WHEN (
  (EXISTS (SELECT 1 FROM containers x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM containers x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.container_name = NEW.container_name AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.role_id = NEW.role_id AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.workspace_id = NEW.workspace_id AND (x.kind = 'system' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): containers — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger telegram_bots_no_replace_i
CREATE TRIGGER telegram_bots_no_replace_i BEFORE INSERT ON telegram_bots
WHEN (
  (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_bots x WHERE x.workspace_id = NEW.workspace_id AND x.bot_tg_id = NEW.bot_tg_id AND (x.deleted_at IS NULL)))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_bots x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): telegram_bots — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger telegram_bots_no_replace_u
CREATE TRIGGER telegram_bots_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id, bot_tg_id ON telegram_bots
WHEN (
  (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM telegram_bots x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_bots x WHERE x.workspace_id = NEW.workspace_id AND x.bot_tg_id = NEW.bot_tg_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_bots x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): telegram_bots — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger telegram_allowlist_no_replace_i
CREATE TRIGGER telegram_allowlist_no_replace_i BEFORE INSERT ON telegram_allowlist
WHEN (
  (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.bot_id = NEW.bot_id AND x.tg_user_id = NEW.tg_user_id AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): telegram_allowlist — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger telegram_allowlist_no_replace_u
CREATE TRIGGER telegram_allowlist_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, bot_id, tg_user_id ON telegram_allowlist
WHEN (
  (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.bot_id = NEW.bot_id AND x.tg_user_id = NEW.tg_user_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): telegram_allowlist — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger proactive_policies_no_replace_i
CREATE TRIGGER proactive_policies_no_replace_i BEFORE INSERT ON proactive_policies
WHEN (
  (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM proactive_policies x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_policies — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger proactive_policies_no_replace_u
CREATE TRIGGER proactive_policies_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id ON proactive_policies
WHEN (
  (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_policies x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM proactive_policies x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_policies — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger proactive_jobs_no_replace_i
CREATE TRIGGER proactive_jobs_no_replace_i BEFORE INSERT ON proactive_jobs
WHEN (
  (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_jobs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger proactive_jobs_no_replace_u
CREATE TRIGGER proactive_jobs_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON proactive_jobs
WHEN (
  (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_jobs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger proactive_sends_no_replace_i
CREATE TRIGGER proactive_sends_no_replace_i BEFORE INSERT ON proactive_sends
WHEN (
  (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.workspace_id = NEW.workspace_id AND x.idempotency_key = NEW.idempotency_key))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_sends — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger proactive_sends_no_replace_u
CREATE TRIGGER proactive_sends_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, idempotency_key ON proactive_sends
WHEN (
  (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.workspace_id = NEW.workspace_id AND x.idempotency_key = NEW.idempotency_key AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): proactive_sends — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger tools_no_replace_i
CREATE TRIGGER tools_no_replace_i BEFORE INSERT ON tools
WHEN (
  (EXISTS (SELECT 1 FROM tools x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM tools x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tools x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM tools x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tools — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger tools_no_replace_u
CREATE TRIGGER tools_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, slug ON tools
WHEN (
  (EXISTS (SELECT 1 FROM tools x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM tools x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tools x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tools — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger tool_grants_no_replace_i
CREATE TRIGGER tool_grants_no_replace_i BEFORE INSERT ON tool_grants
WHEN (
  (EXISTS (SELECT 1 FROM tool_grants x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM tool_grants x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.position_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tool_grants x WHERE x.tool_id = NEW.tool_id AND x.position_id = NEW.position_id AND (x.position_id IS NOT NULL AND x.deleted_at IS NULL)))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tool_grants x WHERE x.tool_id = NEW.tool_id AND x.role_id = NEW.role_id AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM tool_grants x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tool_grants — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger tool_grants_no_replace_u
CREATE TRIGGER tool_grants_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, tool_id, role_id, position_id ON tool_grants
WHEN (
  (EXISTS (SELECT 1 FROM tool_grants x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM tool_grants x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.position_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tool_grants x WHERE x.tool_id = NEW.tool_id AND x.position_id = NEW.position_id AND (x.position_id IS NOT NULL AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid))
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tool_grants x WHERE x.tool_id = NEW.tool_id AND x.role_id = NEW.role_id AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): tool_grants — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger permission_requests_no_replace_i
CREATE TRIGGER permission_requests_no_replace_i BEFORE INSERT ON permission_requests
WHEN (
  (EXISTS (SELECT 1 FROM permission_requests x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM permission_requests x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM permission_requests x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): permission_requests — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger permission_requests_no_replace_u
CREATE TRIGGER permission_requests_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON permission_requests
WHEN (
  (EXISTS (SELECT 1 FROM permission_requests x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM permission_requests x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): permission_requests — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger egress_rules_no_replace_i
CREATE TRIGGER egress_rules_no_replace_i BEFORE INSERT ON egress_rules
WHEN (
  (EXISTS (SELECT 1 FROM egress_rules x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM egress_rules x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM egress_rules x WHERE x.workspace_id = NEW.workspace_id AND x.domain_pattern = NEW.domain_pattern AND x.applies_to = NEW.applies_to AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.position_id, '') = COALESCE(NEW.position_id, '') AND COALESCE(x.tool_id, '') = COALESCE(NEW.tool_id, '') AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM egress_rules x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): egress_rules — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger egress_rules_no_replace_u
CREATE TRIGGER egress_rules_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, domain_pattern, applies_to, role_id, position_id, tool_id ON egress_rules
WHEN (
  (EXISTS (SELECT 1 FROM egress_rules x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM egress_rules x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM egress_rules x WHERE x.workspace_id = NEW.workspace_id AND x.domain_pattern = NEW.domain_pattern AND x.applies_to = NEW.applies_to AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.position_id, '') = COALESCE(NEW.position_id, '') AND COALESCE(x.tool_id, '') = COALESCE(NEW.tool_id, '') AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): egress_rules — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger polaris_checks_no_replace_i
CREATE TRIGGER polaris_checks_no_replace_i BEFORE INSERT ON polaris_checks
WHEN (
  (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): polaris_checks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger polaris_checks_no_replace_u
CREATE TRIGGER polaris_checks_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON polaris_checks
WHEN (
  (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): polaris_checks — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger employee_cards_no_replace_i
CREATE TRIGGER employee_cards_no_replace_i BEFORE INSERT ON employee_cards
WHEN (
  (EXISTS (SELECT 1 FROM employee_cards x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM employee_cards x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.status IN ('issued', 'suspended') AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM employee_cards x WHERE x.role_id = NEW.role_id AND (x.status IN ('issued', 'suspended') AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM employee_cards x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): employee_cards — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger employee_cards_no_replace_u
CREATE TRIGGER employee_cards_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, role_id, status ON employee_cards
WHEN (
  (EXISTS (SELECT 1 FROM employee_cards x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM employee_cards x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.status IN ('issued', 'suspended') AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM employee_cards x WHERE x.role_id = NEW.role_id AND (x.status IN ('issued', 'suspended') AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): employee_cards — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger trial_runs_no_replace_i
CREATE TRIGGER trial_runs_no_replace_i BEFORE INSERT ON trial_runs
WHEN (
  (EXISTS (SELECT 1 FROM trial_runs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM trial_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM trial_runs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): trial_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger trial_runs_no_replace_u
CREATE TRIGGER trial_runs_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON trial_runs
WHEN (
  (EXISTS (SELECT 1 FROM trial_runs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM trial_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): trial_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger chat_threads_no_replace_i
CREATE TRIGGER chat_threads_no_replace_i BEFORE INSERT ON chat_threads
WHEN (
  (EXISTS (SELECT 1 FROM chat_threads x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM chat_threads x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.kind = 'telegram' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM chat_threads x WHERE x.telegram_bot_id = NEW.telegram_bot_id AND x.tg_chat_id = NEW.tg_chat_id AND (x.kind = 'telegram' AND x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM chat_threads x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): chat_threads — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger chat_threads_no_replace_u
CREATE TRIGGER chat_threads_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, kind, telegram_bot_id, tg_chat_id ON chat_threads
WHEN (
  (EXISTS (SELECT 1 FROM chat_threads x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM chat_threads x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.kind = 'telegram' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM chat_threads x WHERE x.telegram_bot_id = NEW.telegram_bot_id AND x.tg_chat_id = NEW.tg_chat_id AND (x.kind = 'telegram' AND x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): chat_threads — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger chat_messages_no_replace_i
CREATE TRIGGER chat_messages_no_replace_i BEFORE INSERT ON chat_messages
WHEN (
  (EXISTS (SELECT 1 FROM chat_messages x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM chat_messages x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.external_id IS NOT NULL) AND EXISTS (SELECT 1 FROM chat_messages x WHERE x.thread_id = NEW.thread_id AND x.external_id = NEW.external_id AND (x.external_id IS NOT NULL)))
  OR (EXISTS (SELECT 1 FROM chat_messages x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): chat_messages — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger chat_messages_no_replace_u
CREATE TRIGGER chat_messages_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, thread_id, external_id ON chat_messages
WHEN (
  (EXISTS (SELECT 1 FROM chat_messages x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM chat_messages x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.external_id IS NOT NULL) AND EXISTS (SELECT 1 FROM chat_messages x WHERE x.thread_id = NEW.thread_id AND x.external_id = NEW.external_id AND (x.external_id IS NOT NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): chat_messages — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger message_attachments_no_replace_i
CREATE TRIGGER message_attachments_no_replace_i BEFORE INSERT ON message_attachments
WHEN (
  (EXISTS (SELECT 1 FROM message_attachments x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM message_attachments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM message_attachments x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): message_attachments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger message_attachments_no_replace_u
CREATE TRIGGER message_attachments_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON message_attachments
WHEN (
  (EXISTS (SELECT 1 FROM message_attachments x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM message_attachments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): message_attachments — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger message_anchors_no_replace_i
CREATE TRIGGER message_anchors_no_replace_i BEFORE INSERT ON message_anchors
WHEN (
  (EXISTS (SELECT 1 FROM message_anchors x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM message_anchors x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM message_anchors x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): message_anchors — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger message_anchors_no_replace_u
CREATE TRIGGER message_anchors_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON message_anchors
WHEN (
  (EXISTS (SELECT 1 FROM message_anchors x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM message_anchors x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): message_anchors — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger ui_actions_no_replace_i
CREATE TRIGGER ui_actions_no_replace_i BEFORE INSERT ON ui_actions
WHEN (
  (EXISTS (SELECT 1 FROM ui_actions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM ui_actions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM ui_actions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): ui_actions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger ui_actions_no_replace_u
CREATE TRIGGER ui_actions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON ui_actions
WHEN (
  (EXISTS (SELECT 1 FROM ui_actions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM ui_actions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): ui_actions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger audit_log_no_replace_i
CREATE TRIGGER audit_log_no_replace_i BEFORE INSERT ON audit_log
WHEN (
  (EXISTS (SELECT 1 FROM audit_log x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM audit_log x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM audit_log x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): audit_log — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger audit_log_no_replace_u
CREATE TRIGGER audit_log_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON audit_log
WHEN (
  (EXISTS (SELECT 1 FROM audit_log x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM audit_log x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): audit_log — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger events_no_replace_i
CREATE TRIGGER events_no_replace_i BEFORE INSERT ON events
WHEN (
  (EXISTS (SELECT 1 FROM events x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM events x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM events x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): events — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger events_no_replace_u
CREATE TRIGGER events_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON events
WHEN (
  (EXISTS (SELECT 1 FROM events x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM events x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): events — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger notifications_no_replace_i
CREATE TRIGGER notifications_no_replace_i BEFORE INSERT ON notifications
WHEN (
  (EXISTS (SELECT 1 FROM notifications x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM notifications x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.resolved_at IS NULL AND NEW.dedupe_key IS NOT NULL) AND EXISTS (SELECT 1 FROM notifications x WHERE x.user_id = NEW.user_id AND x.dedupe_key = NEW.dedupe_key AND (x.resolved_at IS NULL AND x.dedupe_key IS NOT NULL)))
  OR (EXISTS (SELECT 1 FROM notifications x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): notifications — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger notifications_no_replace_u
CREATE TRIGGER notifications_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, user_id, dedupe_key, resolved_at ON notifications
WHEN (
  (EXISTS (SELECT 1 FROM notifications x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM notifications x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.resolved_at IS NULL AND NEW.dedupe_key IS NOT NULL) AND EXISTS (SELECT 1 FROM notifications x WHERE x.user_id = NEW.user_id AND x.dedupe_key = NEW.dedupe_key AND (x.resolved_at IS NULL AND x.dedupe_key IS NOT NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): notifications — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger app_versions_no_replace_i
CREATE TRIGGER app_versions_no_replace_i BEFORE INSERT ON app_versions
WHEN (
  (EXISTS (SELECT 1 FROM app_versions x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.semver = NEW.semver))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.status = 'current') AND EXISTS (SELECT 1 FROM app_versions x WHERE x.status = NEW.status AND (x.status = 'current')))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): app_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger app_versions_no_replace_u
CREATE TRIGGER app_versions_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, semver, status ON app_versions
WHEN (
  (EXISTS (SELECT 1 FROM app_versions x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.semver = NEW.semver AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM app_versions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.status = 'current') AND EXISTS (SELECT 1 FROM app_versions x WHERE x.status = NEW.status AND (x.status = 'current') AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): app_versions — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger backups_no_replace_i
CREATE TRIGGER backups_no_replace_i BEFORE INSERT ON backups
WHEN (
  (EXISTS (SELECT 1 FROM backups x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM backups x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM backups x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): backups — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger backups_no_replace_u
CREATE TRIGGER backups_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON backups
WHEN (
  (EXISTS (SELECT 1 FROM backups x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM backups x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): backups — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger update_runs_no_replace_i
CREATE TRIGGER update_runs_no_replace_i BEFORE INSERT ON update_runs
WHEN (
  (EXISTS (SELECT 1 FROM update_runs x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM update_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM update_runs x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): update_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger update_runs_no_replace_u
CREATE TRIGGER update_runs_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON update_runs
WHEN (
  (EXISTS (SELECT 1 FROM update_runs x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM update_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): update_runs — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger schema_migrations_no_replace_i
CREATE TRIGGER schema_migrations_no_replace_i BEFORE INSERT ON schema_migrations
WHEN (
  (EXISTS (SELECT 1 FROM schema_migrations x WHERE x.version = NEW.version)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): schema_migrations — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger settings_no_replace_i
CREATE TRIGGER settings_no_replace_i BEFORE INSERT ON settings
WHEN (
  (EXISTS (SELECT 1 FROM settings x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key AND (x.deleted_at IS NULL)))
  OR (EXISTS (SELECT 1 FROM settings x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): settings — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger settings_no_replace_u
CREATE TRIGGER settings_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq, deleted_at, key ON settings
WHEN (
  (EXISTS (SELECT 1 FROM settings x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key AND (x.deleted_at IS NULL) AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): settings — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger secrets_no_replace_i
CREATE TRIGGER secrets_no_replace_i BEFORE INSERT ON secrets
WHEN (
  (EXISTS (SELECT 1 FROM secrets x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM secrets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM secrets x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): secrets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger secrets_no_replace_u
CREATE TRIGGER secrets_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON secrets
WHEN (
  (EXISTS (SELECT 1 FROM secrets x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM secrets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): secrets — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger consents_no_replace_i
CREATE TRIGGER consents_no_replace_i BEFORE INSERT ON consents
WHEN (
  (EXISTS (SELECT 1 FROM consents x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM consents x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR (EXISTS (SELECT 1 FROM consents x WHERE x.rowid = NEW.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): consents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger consents_no_replace_u
CREATE TRIGGER consents_no_replace_u BEFORE UPDATE OF id, workspace_id, display_seq ON consents
WHEN (
  (EXISTS (SELECT 1 FROM consents x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM consents x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): consents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger search_documents_no_replace_i
CREATE TRIGGER search_documents_no_replace_i BEFORE INSERT ON search_documents
WHEN (
  (EXISTS (SELECT 1 FROM search_documents x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM search_documents x WHERE x.entity_type = NEW.entity_type AND x.entity_id = NEW.entity_id AND COALESCE(x.chunk_id, '') = COALESCE(NEW.chunk_id, ''))))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): search_documents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger search_documents_no_replace_u
CREATE TRIGGER search_documents_no_replace_u BEFORE UPDATE OF entity_type, entity_id, chunk_id ON search_documents
WHEN (
  (EXISTS (SELECT 1 FROM search_documents x WHERE x.entity_type = NEW.entity_type AND x.entity_id = NEW.entity_id AND COALESCE(x.chunk_id, '') = COALESCE(NEW.chunk_id, '') AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): search_documents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger workspace_members_writer_i
CREATE TRIGGER workspace_members_writer_i BEFORE INSERT ON workspace_members
WHEN NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR CASE WHEN NEW.access_level = 'owner' THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') ELSE EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) END)
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): phân quyền chỉ owner / admin còn là thành viên hoặc actor system của workspace ghi; cấp / gỡ / sửa hàng mức owner chỉ owner (hoặc actor system — dựng / khôi phục); workspace_id / user_id bất biến ngoài bảo trì'); END;

-- @ga:object trigger workspace_members_writer_u
CREATE TRIGGER workspace_members_writer_u BEFORE UPDATE ON workspace_members
WHEN (app_maint() = 0 AND (NEW.workspace_id IS NOT OLD.workspace_id OR NEW.user_id IS NOT OLD.user_id))
  OR NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR CASE WHEN 'owner' IN (OLD.access_level, NEW.access_level) THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') ELSE EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) END)
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): phân quyền chỉ owner / admin còn là thành viên hoặc actor system của workspace ghi; cấp / gỡ / sửa hàng mức owner chỉ owner (hoặc actor system — dựng / khôi phục); workspace_id / user_id bất biến ngoài bảo trì'); END;

-- @ga:object trigger workspace_members_cross_i
CREATE TRIGGER workspace_members_cross_i BEFORE INSERT ON workspace_members
WHEN EXISTS (SELECT 1 FROM workspace_members ox WHERE ox.user_id = NEW.user_id AND ox.workspace_id <> NEW.workspace_id AND ox.removed_at IS NULL) AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): user đang là thành viên active của workspace khác — chỉ actor system của workspace hệ thống thêm / kích hoạt lại (luồng mời qua dịch vụ app); owner / admin chỉ thêm user chưa thuộc workspace nào khác'); END;

-- @ga:object trigger workspace_members_cross_u
CREATE TRIGGER workspace_members_cross_u BEFORE UPDATE OF removed_at ON workspace_members
WHEN OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL AND EXISTS (SELECT 1 FROM workspace_members ox WHERE ox.user_id = NEW.user_id AND ox.workspace_id <> NEW.workspace_id AND ox.removed_at IS NULL) AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): user đang là thành viên active của workspace khác — chỉ actor system của workspace hệ thống thêm / kích hoạt lại (luồng mời qua dịch vụ app); owner / admin chỉ thêm user chưa thuộc workspace nào khác'); END;

-- @ga:object trigger workspace_members_owner_last_u
CREATE TRIGGER workspace_members_owner_last_u BEFORE UPDATE ON workspace_members
WHEN OLD.access_level = 'owner' AND OLD.removed_at IS NULL
 AND NOT (NEW.access_level = 'owner' AND NEW.removed_at IS NULL AND NEW.workspace_id IS OLD.workspace_id AND NEW.user_id IS OLD.user_id)
 AND (SELECT kind FROM workspaces WHERE id = OLD.workspace_id) = 'tenant'
 AND NOT EXISTS (SELECT 1 FROM workspace_members ow WHERE ow.workspace_id = OLD.workspace_id AND ow.user_id <> OLD.user_id
                 AND ow.access_level = 'owner' AND ow.removed_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): workspace tenant phải còn ít nhất một owner đang hoạt động'); END;

-- @ga:object trigger workspace_members_delete_d
CREATE TRIGGER workspace_members_delete_d BEFORE DELETE ON workspace_members
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'workspace_members (v2.3.5): xoá cứng thành viên chỉ trong bảo trì — gỡ khỏi workspace = removed_at'); END;

-- @ga:object trigger actors_writer_i
CREATE TRIGGER actors_writer_i BEFORE INSERT ON actors
WHEN NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
          OR (NEW.kind = 'system' AND NEW.system_key = 'system' AND COALESCE(NEW.id = app_actor(), 0)          -- B2: không bao giờ NULL (app_actor() NULL ⇒ chặn)
              AND COALESCE(NEW.workspace_id = app_bootstrap(), 0)                                        -- chỉ trong conn.bootstrap của CHÍNH workspace đó
              AND NOT EXISTS (SELECT 1 FROM actors s0 WHERE s0.workspace_id = NEW.workspace_id AND s0.system_key = 'system'))
          OR (NEW.kind <> 'system' AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'actors (v2.3.5): actor chỉ actor system hoặc owner / admin còn là thành viên của workspace tạo / sửa; actor system chỉ actor system tạo (actor system đầu tiên tự đăng ký lúc dựng workspace)'); END;

-- @ga:object trigger actors_writer_u
CREATE TRIGGER actors_writer_u BEFORE UPDATE ON actors
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'actors (v2.3.5): actor chỉ actor system hoặc owner / admin còn là thành viên của workspace tạo / sửa; actor system chỉ actor system tạo (actor system đầu tiên tự đăng ký lúc dựng workspace)'); END;

-- @ga:object trigger actors_writer_d
CREATE TRIGGER actors_writer_d BEFORE DELETE ON actors
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = OLD.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')))
BEGIN SELECT RAISE(ABORT, 'actors (v2.3.5): xoá cứng actor chỉ owner hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger actors_lock_u
CREATE TRIGGER actors_lock_u BEFORE UPDATE ON actors
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.kind IS OLD.kind AND NEW.user_id IS OLD.user_id AND NEW.role_id IS OLD.role_id
                              AND NEW.system_key IS OLD.system_key AND NEW.workspace_id IS OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'actors (v2.3.5): kind / user_id / role_id / system_key / workspace_id bất biến ngoài bảo trì'); END;

-- @ga:object trigger users_writer_i
CREATE TRIGGER users_writer_i BEFORE INSERT ON users
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors ua JOIN workspace_members um ON um.workspace_id = ua.workspace_id AND um.user_id = ua.user_id WHERE ua.id = app_actor() AND ua.kind = 'user' AND um.removed_at IS NULL AND um.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'users (v2.3.5): tài khoản người dùng (bảng toàn cục) — tạo: actor system của workspace hệ thống hoặc owner / admin đang hoạt động; sửa: chỉ chính người đó (hồ sơ / mật khẩu / định danh — không đụng khoá đăng nhập, vô hiệu, số thứ tự) hoặc actor system của workspace hệ thống (owner đặt lại mật khẩu thành viên = dịch vụ app chạy bằng actor system sau khi app kiểm quyền); xoá: actor system của workspace hệ thống / bảo trì'); END;

-- @ga:object trigger users_writer_u
CREATE TRIGGER users_writer_u BEFORE UPDATE ON users
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system') OR (OLD.disabled_at IS NULL AND NEW.id IS OLD.id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.disabled_at IS OLD.disabled_at AND NEW.failed_login_count IS OLD.failed_login_count AND NEW.locked_until IS OLD.locked_until AND NEW.last_login_at IS OLD.last_login_at AND EXISTS (SELECT 1 FROM actors uf WHERE uf.id = app_actor() AND uf.kind = 'user' AND uf.user_id = OLD.id)))
BEGIN SELECT RAISE(ABORT, 'users (v2.3.5): tài khoản người dùng (bảng toàn cục) — tạo: actor system của workspace hệ thống hoặc owner / admin đang hoạt động; sửa: chỉ chính người đó (hồ sơ / mật khẩu / định danh — không đụng khoá đăng nhập, vô hiệu, số thứ tự) hoặc actor system của workspace hệ thống (owner đặt lại mật khẩu thành viên = dịch vụ app chạy bằng actor system sau khi app kiểm quyền); xoá: actor system của workspace hệ thống / bảo trì'); END;

-- @ga:object trigger users_writer_d
CREATE TRIGGER users_writer_d BEFORE DELETE ON users
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'users (v2.3.5): tài khoản người dùng (bảng toàn cục) — tạo: actor system của workspace hệ thống hoặc owner / admin đang hoạt động; sửa: chỉ chính người đó (hồ sơ / mật khẩu / định danh — không đụng khoá đăng nhập, vô hiệu, số thứ tự) hoặc actor system của workspace hệ thống (owner đặt lại mật khẩu thành viên = dịch vụ app chạy bằng actor system sau khi app kiểm quyền); xoá: actor system của workspace hệ thống / bảo trì'); END;

-- @ga:object trigger auth_sessions_writer_i
CREATE TRIGGER auth_sessions_writer_i BEFORE INSERT ON auth_sessions
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'auth_sessions (v2.3.5): phiên đăng nhập (bảng toàn cục) — tạo / sửa / xoá: actor system của workspace hệ thống (dịch vụ đăng nhập) hoặc bảo trì; chính người đó chỉ thu hồi (revoked_at) hoặc xoá phiên của mình'); END;

-- @ga:object trigger auth_sessions_writer_u
CREATE TRIGGER auth_sessions_writer_u BEFORE UPDATE ON auth_sessions
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system') OR (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND NEW.id IS OLD.id AND NEW.user_id IS OLD.user_id AND NEW.token_hash IS OLD.token_hash AND NEW.created_at IS OLD.created_at AND NEW.expires_at IS OLD.expires_at AND NEW.last_seen_at IS OLD.last_seen_at AND NEW.ip IS OLD.ip AND NEW.user_agent IS OLD.user_agent AND EXISTS (SELECT 1 FROM actors uf WHERE uf.id = app_actor() AND uf.kind = 'user' AND uf.user_id = OLD.user_id)))
BEGIN SELECT RAISE(ABORT, 'auth_sessions (v2.3.5): phiên đăng nhập (bảng toàn cục) — tạo / sửa / xoá: actor system của workspace hệ thống (dịch vụ đăng nhập) hoặc bảo trì; chính người đó chỉ thu hồi (revoked_at) hoặc xoá phiên của mình'); END;

-- @ga:object trigger auth_sessions_writer_d
CREATE TRIGGER auth_sessions_writer_d BEFORE DELETE ON auth_sessions
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors uf WHERE uf.id = app_actor() AND uf.kind = 'user' AND uf.user_id = OLD.user_id)))
BEGIN SELECT RAISE(ABORT, 'auth_sessions (v2.3.5): phiên đăng nhập (bảng toàn cục) — tạo / sửa / xoá: actor system của workspace hệ thống (dịch vụ đăng nhập) hoặc bảo trì; chính người đó chỉ thu hồi (revoked_at) hoặc xoá phiên của mình'); END;

-- @ga:object trigger schema_migrations_maint_i
CREATE TRIGGER schema_migrations_maint_i BEFORE INSERT ON schema_migrations
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'schema_migrations (v2.3.5): lịch sử migration chỉ ghi / sửa / xoá trong bảo trì (runner — conn.maintenance)'); END;

-- @ga:object trigger schema_migrations_maint_u
CREATE TRIGGER schema_migrations_maint_u BEFORE UPDATE ON schema_migrations
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'schema_migrations (v2.3.5): lịch sử migration chỉ ghi / sửa / xoá trong bảo trì (runner — conn.maintenance)'); END;

-- @ga:object trigger schema_migrations_maint_d
CREATE TRIGGER schema_migrations_maint_d BEFORE DELETE ON schema_migrations
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'schema_migrations (v2.3.5): lịch sử migration chỉ ghi / sửa / xoá trong bảo trì (runner — conn.maintenance)'); END;

-- @ga:object trigger workspaces_writer_u
CREATE TRIGGER workspaces_writer_u BEFORE UPDATE OF id, kind, slug, name, owner_user_id, short_code, locale, timezone, currency_code, currency_symbol,
  status, created_at, updated_at, archived_at, restored_at ON workspaces
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'workspaces (v2.3.5): sửa workspace chỉ owner / admin còn là thành viên hoặc actor system của chính workspace đó'); END;

-- @ga:object trigger workspaces_writer_i
CREATE TRIGGER workspaces_writer_i BEFORE INSERT ON workspaces
WHEN app_maint() = 0 AND NOT (COALESCE(NEW.id = app_bootstrap(), 0) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'workspaces (v2.3.5): tạo workspace chỉ trong conn.bootstrap của chính workspace đó (app_bootstrap() = id), bảo trì, hoặc actor system của workspace hệ thống'); END;

-- @ga:object trigger workspaces_writer_d
CREATE TRIGGER workspaces_writer_d BEFORE DELETE ON workspaces
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'workspaces (v2.3.5): xoá cứng workspace chỉ trong bảo trì (purge)'); END;

-- @ga:object trigger containers_writer_i
CREATE TRIGGER containers_writer_i BEFORE INSERT ON containers
WHEN NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) AND NEW.image_ref IS NULL AND NEW.image_digest IS NULL AND NEW.cli_bundle IS NULL AND NEW.cpu_limit IS NULL AND NEW.mem_limit_mb IS NULL AND NEW.session_timeout_s IS NULL))
BEGIN SELECT RAISE(ABORT, 'containers (v2.3.5): container chỉ owner / admin hoặc actor system của workspace ghi; cột cấu hình (image / CLI / tài nguyên) chỉ actor system'); END;

-- @ga:object trigger containers_writer_u
CREATE TRIGGER containers_writer_u BEFORE UPDATE ON containers
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'containers (v2.3.5): container chỉ owner / admin hoặc actor system của workspace ghi; cột cấu hình (image / CLI / tài nguyên) chỉ actor system'); END;

-- @ga:object trigger containers_sys_u
CREATE TRIGGER containers_sys_u BEFORE UPDATE OF image_ref, image_digest, cli_bundle, cpu_limit, mem_limit_mb, session_timeout_s ON containers
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'containers (v2.3.5): container chỉ owner / admin hoặc actor system của workspace ghi; cột cấu hình (image / CLI / tài nguyên) chỉ actor system'); END;

-- @ga:object trigger containers_writer_d
CREATE TRIGGER containers_writer_d BEFORE DELETE ON containers
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'containers (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger secrets_writer_d
CREATE TRIGGER secrets_writer_d BEFORE DELETE ON secrets
WHEN app_maint() = 0 AND NOT ((CASE WHEN OLD.kind = 'anchor_remote_token' THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = OLD.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') WHEN OLD.kind = 'telegram_bot_token' THEN (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = OLD.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system')) ELSE (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))) END))
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.5): xoá cứng bí mật theo luật ghi của kind — anchor_remote_token chỉ owner; telegram_bot_token owner / actor system; còn lại owner / admin / actor system (hoặc bảo trì)'); END;

-- @ga:object trigger telegram_bots_writer_d
CREATE TRIGGER telegram_bots_writer_d BEFORE DELETE ON telegram_bots
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = OLD.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'telegram_bots (v2.3.5): xoá cứng bot chỉ owner còn là thành viên hoặc actor system của workspace (admin cũng không — như luật ghi cấu hình bot)'); END;

-- @ga:object trigger engine_installs_writer_d
CREATE TRIGGER engine_installs_writer_d BEFORE DELETE ON engine_installs
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'engine_installs (v2.3.5): xoá cứng trạng thái cài CLI chỉ actor system của workspace (như luật ghi)'); END;

-- @ga:object trigger engines_writer_i
CREATE TRIGGER engines_writer_i BEFORE INSERT ON engines
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engines (v2.3.5): danh mục engine dùng chung — chỉ bảo trì hoặc actor system của workspace hệ thống ghi'); END;

-- @ga:object trigger engines_writer_u
CREATE TRIGGER engines_writer_u BEFORE UPDATE ON engines
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engines (v2.3.5): danh mục engine dùng chung — chỉ bảo trì hoặc actor system của workspace hệ thống ghi'); END;

-- @ga:object trigger engines_writer_d
CREATE TRIGGER engines_writer_d BEFORE DELETE ON engines
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = '00000000000000000000000000' AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engines (v2.3.5): danh mục engine dùng chung — chỉ bảo trì hoặc actor system của workspace hệ thống ghi'); END;

-- @ga:object trigger settings_retention_i
CREATE TRIGGER settings_retention_i BEFORE INSERT ON settings
WHEN NEW.key IN ('audit.retention_days', 'log.retention_days', 'purge.grace_days') AND NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND CASE NEW.key WHEN 'audit.retention_days' THEN 36500 WHEN 'log.retention_days' THEN 3650 WHEN 'purge.grace_days' THEN 3650 ELSE 0 END)))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): audit.retention_days (1–36500) / log.retention_days (1–3650) / purge.grace_days (1–3650) là số nguyên trong khoảng, chỉ owner ghi'); END;

-- @ga:object trigger settings_retention_u
CREATE TRIGGER settings_retention_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN app_maint() = 0 AND (OLD.key IN ('audit.retention_days', 'log.retention_days', 'purge.grace_days') OR NEW.key IN ('audit.retention_days', 'log.retention_days', 'purge.grace_days'))
 AND NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') AND NEW.key IS OLD.key AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND CASE NEW.key WHEN 'audit.retention_days' THEN 36500 WHEN 'log.retention_days' THEN 3650 WHEN 'purge.grace_days' THEN 3650 ELSE 0 END)))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): audit.retention_days (1–36500) / log.retention_days (1–3650) / purge.grace_days (1–3650) là số nguyên trong khoảng, chỉ owner ghi'); END;

-- @ga:object trigger settings_retention_d
CREATE TRIGGER settings_retention_d BEFORE DELETE ON settings
WHEN app_maint() = 0 AND OLD.key IN ('audit.retention_days', 'log.retention_days', 'purge.grace_days') AND NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = OLD.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): audit.retention_days (1–36500) / log.retention_days (1–3650) / purge.grace_days (1–3650) là số nguyên trong khoảng, chỉ owner ghi'); END;

-- @ga:object trigger settings_writer_i
CREATE TRIGGER settings_writer_i BEFORE INSERT ON settings
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): mặc định từ chối — khoá nào cũng chỉ owner / admin còn là thành viên hoặc actor system ghi'); END;

-- @ga:object trigger settings_writer_u
CREATE TRIGGER settings_writer_u BEFORE UPDATE ON settings
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): mặc định từ chối — khoá nào cũng chỉ owner / admin còn là thành viên hoặc actor system ghi'); END;

-- @ga:object trigger settings_writer_d
CREATE TRIGGER settings_writer_d BEFORE DELETE ON settings
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.5): mặc định từ chối — khoá nào cũng chỉ owner / admin còn là thành viên hoặc actor system ghi'); END;

-- @ga:object trigger telegram_allowlist_writer_i
CREATE TRIGGER telegram_allowlist_writer_i BEFORE INSERT ON telegram_allowlist
WHEN NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))) OR (NEW.added_via = 'capture' AND EXISTS (SELECT 1 FROM actors st WHERE st.id = app_actor() AND st.workspace_id = NEW.workspace_id AND st.system_key = 'telegram')))
BEGIN SELECT RAISE(ABORT, 'telegram_allowlist (v2.3.5): danh sách người được nhắn bot chỉ owner / admin còn là thành viên hoặc actor system ghi; tác tử Telegram chỉ thêm hàng capture (người nhắn /start — luật owner ở telegram_allowlist_owner_new_i)'); END;

-- @ga:object trigger telegram_allowlist_writer_u
CREATE TRIGGER telegram_allowlist_writer_u BEFORE UPDATE ON telegram_allowlist
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'telegram_allowlist (v2.3.5): danh sách người được nhắn bot chỉ owner / admin còn là thành viên hoặc actor system ghi; tác tử Telegram chỉ thêm hàng capture (người nhắn /start — luật owner ở telegram_allowlist_owner_new_i)'); END;

-- @ga:object trigger telegram_allowlist_writer_d
CREATE TRIGGER telegram_allowlist_writer_d BEFORE DELETE ON telegram_allowlist
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'telegram_allowlist (v2.3.5): danh sách người được nhắn bot chỉ owner / admin còn là thành viên hoặc actor system ghi; tác tử Telegram chỉ thêm hàng capture (người nhắn /start — luật owner ở telegram_allowlist_owner_new_i)'); END;

-- @ga:object trigger tool_grants_writer_i
CREATE TRIGGER tool_grants_writer_i BEFORE INSERT ON tool_grants
WHEN NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'tool_grants (v2.3.5): cấp quyền tool chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự cấp)'); END;

-- @ga:object trigger tool_grants_writer_u
CREATE TRIGGER tool_grants_writer_u BEFORE UPDATE ON tool_grants
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'tool_grants (v2.3.5): cấp quyền tool chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự cấp)'); END;

-- @ga:object trigger tool_grants_writer_d
CREATE TRIGGER tool_grants_writer_d BEFORE DELETE ON tool_grants
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = OLD.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'tool_grants (v2.3.5): xoá cứng cấp quyền tool chỉ owner còn là thành viên hoặc actor system của workspace (hoặc bảo trì) — admin / Role không'); END;

-- @ga:object trigger egress_rules_writer_i
CREATE TRIGGER egress_rules_writer_i BEFORE INSERT ON egress_rules
WHEN NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'egress_rules (v2.3.5): luật mạng ra chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự mở)'); END;

-- @ga:object trigger egress_rules_writer_u
CREATE TRIGGER egress_rules_writer_u BEFORE UPDATE ON egress_rules
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'egress_rules (v2.3.5): luật mạng ra chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự mở)'); END;

-- @ga:object trigger egress_rules_writer_d
CREATE TRIGGER egress_rules_writer_d BEFORE DELETE ON egress_rules
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = OLD.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'egress_rules (v2.3.5): xoá cứng luật mạng ra chỉ owner còn là thành viên hoặc actor system của workspace (hoặc bảo trì) — admin / Role không'); END;

-- @ga:object trigger proactive_policies_writer_i
CREATE TRIGGER proactive_policies_writer_i BEFORE INSERT ON proactive_policies
WHEN NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'proactive_policies (v2.3.5): chính sách tin chủ động chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự nới trần / giờ yên tĩnh)'); END;

-- @ga:object trigger proactive_policies_writer_u
CREATE TRIGGER proactive_policies_writer_u BEFORE UPDATE ON proactive_policies
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'proactive_policies (v2.3.5): chính sách tin chủ động chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự nới trần / giờ yên tĩnh)'); END;

-- @ga:object trigger proactive_policies_writer_d
CREATE TRIGGER proactive_policies_writer_d BEFORE DELETE ON proactive_policies
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'proactive_policies (v2.3.5): chính sách tin chủ động chỉ owner / admin còn là thành viên hoặc actor system ghi (Role không tự nới trần / giờ yên tĩnh)'); END;

-- @ga:object trigger id_counters_writer_d
CREATE TRIGGER id_counters_writer_d BEFORE DELETE ON id_counters
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'id_counters (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger roles_writer_d
CREATE TRIGGER roles_writer_d BEFORE DELETE ON roles
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'roles (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger skin_assets_writer_d
CREATE TRIGGER skin_assets_writer_d BEFORE DELETE ON skin_assets
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'skin_assets (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger dna_field_defs_writer_d
CREATE TRIGGER dna_field_defs_writer_d BEFORE DELETE ON dna_field_defs
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'dna_field_defs (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger dna_fields_writer_d
CREATE TRIGGER dna_fields_writer_d BEFORE DELETE ON dna_fields
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'dna_fields (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger change_sets_writer_d
CREATE TRIGGER change_sets_writer_d BEFORE DELETE ON change_sets
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'change_sets (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger change_set_items_writer_d
CREATE TRIGGER change_set_items_writer_d BEFORE DELETE ON change_set_items
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'change_set_items (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger instructions_writer_d
CREATE TRIGGER instructions_writer_d BEFORE DELETE ON instructions
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'instructions (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger taxonomy_nodes_writer_d
CREATE TRIGGER taxonomy_nodes_writer_d BEFORE DELETE ON taxonomy_nodes
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger skills_writer_d
CREATE TRIGGER skills_writer_d BEFORE DELETE ON skills
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'skills (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger skill_prereqs_writer_d
CREATE TRIGGER skill_prereqs_writer_d BEFORE DELETE ON skill_prereqs
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'skill_prereqs (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger skill_engine_support_writer_d
CREATE TRIGGER skill_engine_support_writer_d BEFORE DELETE ON skill_engine_support
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'skill_engine_support (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger skill_files_writer_d
CREATE TRIGGER skill_files_writer_d BEFORE DELETE ON skill_files
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'skill_files (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger role_skills_writer_d
CREATE TRIGGER role_skills_writer_d BEFORE DELETE ON role_skills
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'role_skills (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger knowledge_items_writer_d
CREATE TRIGGER knowledge_items_writer_d BEFORE DELETE ON knowledge_items
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'knowledge_items (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger knowledge_chunks_writer_d
CREATE TRIGGER knowledge_chunks_writer_d BEFORE DELETE ON knowledge_chunks
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'knowledge_chunks (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger memories_writer_d
CREATE TRIGGER memories_writer_d BEFORE DELETE ON memories
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'memories (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger positions_writer_d
CREATE TRIGGER positions_writer_d BEFORE DELETE ON positions
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'positions (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger assignments_writer_d
CREATE TRIGGER assignments_writer_d BEFORE DELETE ON assignments
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'assignments (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger tasks_writer_d
CREATE TRIGGER tasks_writer_d BEFORE DELETE ON tasks
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'tasks (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger commitments_writer_d
CREATE TRIGGER commitments_writer_d BEFORE DELETE ON commitments
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'commitments (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger wallets_writer_d
CREATE TRIGGER wallets_writer_d BEFORE DELETE ON wallets
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'wallets (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger usage_daily_writer_d
CREATE TRIGGER usage_daily_writer_d BEFORE DELETE ON usage_daily
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'usage_daily (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger engine_accounts_writer_d
CREATE TRIGGER engine_accounts_writer_d BEFORE DELETE ON engine_accounts
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'engine_accounts (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger engine_bindings_writer_d
CREATE TRIGGER engine_bindings_writer_d BEFORE DELETE ON engine_bindings
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'engine_bindings (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger system_agents_writer_d
CREATE TRIGGER system_agents_writer_d BEFORE DELETE ON system_agents
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'system_agents (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger capabilities_writer_d
CREATE TRIGGER capabilities_writer_d BEFORE DELETE ON capabilities
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'capabilities (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger model_ranks_writer_d
CREATE TRIGGER model_ranks_writer_d BEFORE DELETE ON model_ranks
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'model_ranks (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger proactive_jobs_writer_d
CREATE TRIGGER proactive_jobs_writer_d BEFORE DELETE ON proactive_jobs
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'proactive_jobs (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger tools_writer_d
CREATE TRIGGER tools_writer_d BEFORE DELETE ON tools
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'tools (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger permission_requests_writer_d
CREATE TRIGGER permission_requests_writer_d BEFORE DELETE ON permission_requests
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'permission_requests (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger employee_cards_writer_d
CREATE TRIGGER employee_cards_writer_d BEFORE DELETE ON employee_cards
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'employee_cards (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger chat_threads_writer_d
CREATE TRIGGER chat_threads_writer_d BEFORE DELETE ON chat_threads
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'chat_threads (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger message_attachments_writer_d
CREATE TRIGGER message_attachments_writer_d BEFORE DELETE ON message_attachments
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'message_attachments (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger notifications_writer_d
CREATE TRIGGER notifications_writer_d BEFORE DELETE ON notifications
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'notifications (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger jobs_writer_d
CREATE TRIGGER jobs_writer_d BEFORE DELETE ON jobs
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'jobs (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger app_versions_writer_d
CREATE TRIGGER app_versions_writer_d BEFORE DELETE ON app_versions
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'app_versions (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger backups_writer_d
CREATE TRIGGER backups_writer_d BEFORE DELETE ON backups
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'backups (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger update_runs_writer_d
CREATE TRIGGER update_runs_writer_d BEFORE DELETE ON update_runs
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'update_runs (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger search_documents_writer_d
CREATE TRIGGER search_documents_writer_d BEFORE DELETE ON search_documents
WHEN app_maint() = 0 AND NOT ((EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = OLD.workspace_id AND sy.system_key = 'system') OR EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = OLD.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))))
BEGIN SELECT RAISE(ABORT, 'search_documents (v2.3.5): xoá cứng chỉ owner / admin còn là thành viên hoặc actor system của workspace (hoặc bảo trì)'); END;

-- @ga:object trigger id_aliases_actor_i
CREATE TRIGGER id_aliases_actor_i BEFORE INSERT ON id_aliases
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'id_aliases: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger id_aliases_actor_u
CREATE TRIGGER id_aliases_actor_u BEFORE UPDATE ON id_aliases
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'id_aliases: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger roles_actor_i
CREATE TRIGGER roles_actor_i BEFORE INSERT ON roles
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'roles: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger roles_actor_u
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

-- @ga:object trigger avatars_actor_i
CREATE TRIGGER avatars_actor_i BEFORE INSERT ON avatars
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'avatars: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger avatars_actor_u
CREATE TRIGGER avatars_actor_u BEFORE UPDATE ON avatars
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.source IS OLD.source AND NEW.blob_id IS OLD.blob_id AND NEW.mime IS OLD.mime AND NEW.size_bytes IS OLD.size_bytes AND NEW.width IS OLD.width AND NEW.height IS OLD.height AND NEW.crop_x IS OLD.crop_x AND NEW.crop_y IS OLD.crop_y AND NEW.crop_zoom IS OLD.crop_zoom AND NEW.skin_pack_slug IS OLD.skin_pack_slug AND NEW.skin_asset_code IS OLD.skin_asset_code AND NEW.skin_license IS OLD.skin_license AND NEW.skin_attribution IS OLD.skin_attribution AND NEW.skin_sha256 IS OLD.skin_sha256 AND (NEW.skin_asset_id IS OLD.skin_asset_id OR (NEW.skin_asset_id IS NULL AND NOT EXISTS (SELECT 1 FROM skin_assets fkp WHERE fkp.id = OLD.skin_asset_id))) AND (NEW.skin_asset_id IS NOT OLD.skin_asset_id))
BEGIN SELECT RAISE(ABORT, 'avatars: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger skin_assets_actor_i
CREATE TRIGGER skin_assets_actor_i BEFORE INSERT ON skin_assets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'skin_assets: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger skin_assets_actor_u
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

-- @ga:object trigger dna_field_defs_actor_i
CREATE TRIGGER dna_field_defs_actor_i BEFORE INSERT ON dna_field_defs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'dna_field_defs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger dna_field_defs_actor_u
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

-- @ga:object trigger dna_fields_actor_i
CREATE TRIGGER dna_fields_actor_i BEFORE INSERT ON dna_fields
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'dna_fields: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger dna_fields_actor_u
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

-- @ga:object trigger dna_field_versions_actor_i
CREATE TRIGGER dna_field_versions_actor_i BEFORE INSERT ON dna_field_versions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'dna_field_versions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger dna_field_versions_actor_u
CREATE TRIGGER dna_field_versions_actor_u BEFORE UPDATE ON dna_field_versions
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'dna_field_versions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger revisions_actor_i
CREATE TRIGGER revisions_actor_i BEFORE INSERT ON revisions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'revisions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger revisions_actor_u
CREATE TRIGGER revisions_actor_u BEFORE UPDATE ON revisions
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'revisions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger change_sets_actor_i
CREATE TRIGGER change_sets_actor_i BEFORE INSERT ON change_sets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'change_sets: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger change_sets_actor_u
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

-- @ga:object trigger instructions_actor_i
CREATE TRIGGER instructions_actor_i BEFORE INSERT ON instructions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'instructions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger instructions_actor_u
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

-- @ga:object trigger instruction_versions_actor_i
CREATE TRIGGER instruction_versions_actor_i BEFORE INSERT ON instruction_versions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'instruction_versions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger instruction_versions_actor_u
CREATE TRIGGER instruction_versions_actor_u BEFORE UPDATE ON instruction_versions
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'instruction_versions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger taxonomy_nodes_actor_i
CREATE TRIGGER taxonomy_nodes_actor_i BEFORE INSERT ON taxonomy_nodes
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger taxonomy_nodes_actor_u
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

-- @ga:object trigger skills_actor_i
CREATE TRIGGER skills_actor_i BEFORE INSERT ON skills
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'skills: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger skills_actor_u
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

-- @ga:object trigger skill_versions_actor_i
CREATE TRIGGER skill_versions_actor_i BEFORE INSERT ON skill_versions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'skill_versions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger skill_versions_actor_u
CREATE TRIGGER skill_versions_actor_u BEFORE UPDATE ON skill_versions
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'skill_versions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger skill_prereqs_actor_i
CREATE TRIGGER skill_prereqs_actor_i BEFORE INSERT ON skill_prereqs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger skill_prereqs_actor_u
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

-- @ga:object trigger role_skills_actor_i
CREATE TRIGGER role_skills_actor_i BEFORE INSERT ON role_skills
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'role_skills: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger role_skills_actor_u
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

-- @ga:object trigger blobs_actor_i
CREATE TRIGGER blobs_actor_i BEFORE INSERT ON blobs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'blobs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger blobs_actor_u
CREATE TRIGGER blobs_actor_u BEFORE UPDATE ON blobs
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'blobs: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger knowledge_items_actor_i
CREATE TRIGGER knowledge_items_actor_i BEFORE INSERT ON knowledge_items
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'knowledge_items: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger knowledge_items_actor_u
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

-- @ga:object trigger memories_actor_i
CREATE TRIGGER memories_actor_i BEFORE INSERT ON memories
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'memories: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger memories_actor_u
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

-- @ga:object trigger recall_hits_actor_i
CREATE TRIGGER recall_hits_actor_i BEFORE INSERT ON recall_hits
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'recall_hits: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger recall_hits_actor_u
CREATE TRIGGER recall_hits_actor_u BEFORE UPDATE ON recall_hits
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.call_id IS OLD.call_id AND NEW.role_id IS OLD.role_id AND NEW.memory_id IS OLD.memory_id AND NEW.knowledge_chunk_id IS OLD.knowledge_chunk_id AND NEW.knowledge_item_id IS OLD.knowledge_item_id AND NEW.rank IS OLD.rank AND NEW.score IS OLD.score AND NEW.query_hash IS OLD.query_hash AND (NEW.session_id IS OLD.session_id OR (NEW.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.session_id))) AND (NEW.session_id IS NOT OLD.session_id))
BEGIN SELECT RAISE(ABORT, 'recall_hits: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger positions_actor_i
CREATE TRIGGER positions_actor_i BEFORE INSERT ON positions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'positions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger positions_actor_u
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

-- @ga:object trigger assignments_actor_i
CREATE TRIGGER assignments_actor_i BEFORE INSERT ON assignments
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'assignments: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger assignments_actor_u
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

-- @ga:object trigger trust_tier_changes_actor_i
CREATE TRIGGER trust_tier_changes_actor_i BEFORE INSERT ON trust_tier_changes
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'trust_tier_changes: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger trust_tier_changes_actor_u
CREATE TRIGGER trust_tier_changes_actor_u BEFORE UPDATE ON trust_tier_changes
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'trust_tier_changes: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger tasks_actor_i
CREATE TRIGGER tasks_actor_i BEFORE INSERT ON tasks
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'tasks: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger tasks_actor_u
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

-- @ga:object trigger commitments_actor_i
CREATE TRIGGER commitments_actor_i BEFORE INSERT ON commitments
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'commitments: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger commitments_actor_u
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

-- @ga:object trigger sessions_actor_i
CREATE TRIGGER sessions_actor_i BEFORE INSERT ON sessions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'sessions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger sessions_actor_u
CREATE TRIGGER sessions_actor_u BEFORE UPDATE ON sessions
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.agent_kind IS OLD.agent_kind AND NEW.trigger IS OLD.trigger AND NEW.engine_slug IS OLD.engine_slug AND NEW.model_key IS OLD.model_key AND NEW.effort IS OLD.effort AND NEW.cli_version IS OLD.cli_version AND NEW.cli_session_ref IS OLD.cli_session_ref AND NEW.delivered_prompt_hash IS OLD.delivered_prompt_hash AND NEW.polaris_json IS OLD.polaris_json AND NEW.polaris_render_hash IS OLD.polaris_render_hash AND NEW.polaris_tokens_rendered IS OLD.polaris_tokens_rendered AND NEW.native_memory IS OLD.native_memory AND NEW.title IS OLD.title AND NEW.status IS OLD.status AND NEW.error_code IS OLD.error_code AND NEW.exit_code IS OLD.exit_code AND NEW.started_at IS OLD.started_at AND NEW.ended_at IS OLD.ended_at AND NEW.duration_ms IS OLD.duration_ms AND NEW.cold_start_ms IS OLD.cold_start_ms AND NEW.tokens_input IS OLD.tokens_input AND NEW.tokens_output IS OLD.tokens_output AND NEW.tokens_cache_read IS OLD.tokens_cache_read AND NEW.tokens_cache_write IS OLD.tokens_cache_write AND NEW.tokens_thinking IS OLD.tokens_thinking AND NEW.cost_micro_usd IS OLD.cost_micro_usd AND NEW.failover_count IS OLD.failover_count AND NEW.result_json IS OLD.result_json AND NEW.phase IS OLD.phase AND NEW.phase_at IS OLD.phase_at AND (NEW.role_id IS OLD.role_id OR (NEW.role_id IS NULL AND NOT EXISTS (SELECT 1 FROM roles fkp WHERE fkp.id = OLD.role_id))) AND (NEW.position_id IS OLD.position_id OR (NEW.position_id IS NULL AND NOT EXISTS (SELECT 1 FROM positions fkp WHERE fkp.id = OLD.position_id))) AND (NEW.task_id IS OLD.task_id OR (NEW.task_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks fkp WHERE fkp.id = OLD.task_id))) AND (NEW.thread_id IS OLD.thread_id OR (NEW.thread_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_threads fkp WHERE fkp.id = OLD.thread_id))) AND (NEW.engine_account_id IS OLD.engine_account_id OR (NEW.engine_account_id IS NULL AND NOT EXISTS (SELECT 1 FROM engine_accounts fkp WHERE fkp.id = OLD.engine_account_id))) AND (NEW.compiled_prompt_id IS OLD.compiled_prompt_id OR (NEW.compiled_prompt_id IS NULL AND NOT EXISTS (SELECT 1 FROM compiled_prompts fkp WHERE fkp.id = OLD.compiled_prompt_id))) AND (NEW.container_id IS OLD.container_id OR (NEW.container_id IS NULL AND NOT EXISTS (SELECT 1 FROM containers fkp WHERE fkp.id = OLD.container_id))) AND (NEW.role_id IS NOT OLD.role_id OR NEW.position_id IS NOT OLD.position_id OR NEW.task_id IS NOT OLD.task_id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.engine_account_id IS NOT OLD.engine_account_id OR NEW.compiled_prompt_id IS NOT OLD.compiled_prompt_id OR NEW.container_id IS NOT OLD.container_id))
BEGIN SELECT RAISE(ABORT, 'sessions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger wallets_actor_i
CREATE TRIGGER wallets_actor_i BEFORE INSERT ON wallets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'wallets: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger wallets_actor_u
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

-- @ga:object trigger ledger_entries_actor_i
CREATE TRIGGER ledger_entries_actor_i BEFORE INSERT ON ledger_entries
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'ledger_entries: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger ledger_entries_actor_u
CREATE TRIGGER ledger_entries_actor_u BEFORE UPDATE ON ledger_entries
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'ledger_entries: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger role_wounds_actor_i
CREATE TRIGGER role_wounds_actor_i BEFORE INSERT ON role_wounds
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'role_wounds: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger role_wounds_actor_u
CREATE TRIGGER role_wounds_actor_u BEFORE UPDATE ON role_wounds
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.wallet_id IS OLD.wallet_id AND NEW.cause_entry_id IS OLD.cause_entry_id AND NEW.started_at IS OLD.started_at AND NEW.ended_at IS OLD.ended_at AND NEW.revive_entry_id IS OLD.revive_entry_id AND NEW.owner_notified_at IS OLD.owner_notified_at AND NEW.notification_id IS OLD.notification_id AND NEW.reflection_job_id IS OLD.reflection_job_id AND NEW.reflection_done_at IS OLD.reflection_done_at AND NEW.lessons_proposed IS OLD.lessons_proposed AND (NEW.reflection_session_id IS OLD.reflection_session_id OR (NEW.reflection_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.reflection_session_id))) AND (NEW.reflection_session_id IS NOT OLD.reflection_session_id))
BEGIN SELECT RAISE(ABORT, 'role_wounds: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger engine_installs_actor_i
CREATE TRIGGER engine_installs_actor_i BEFORE INSERT ON engine_installs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'engine_installs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger engine_installs_actor_u
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

-- @ga:object trigger engine_accounts_actor_i
CREATE TRIGGER engine_accounts_actor_i BEFORE INSERT ON engine_accounts
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'engine_accounts: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger engine_accounts_actor_u
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

-- @ga:object trigger engine_bindings_actor_i
CREATE TRIGGER engine_bindings_actor_i BEFORE INSERT ON engine_bindings
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'engine_bindings: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger engine_bindings_actor_u
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

-- @ga:object trigger system_agents_actor_i
CREATE TRIGGER system_agents_actor_i BEFORE INSERT ON system_agents
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'system_agents: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger system_agents_actor_u
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

-- @ga:object trigger probe_runs_actor_i
CREATE TRIGGER probe_runs_actor_i BEFORE INSERT ON probe_runs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'probe_runs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger probe_runs_actor_u
CREATE TRIGGER probe_runs_actor_u BEFORE UPDATE ON probe_runs
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.engine_account_id IS OLD.engine_account_id AND NEW.engine_slug IS OLD.engine_slug AND NEW.trigger IS OLD.trigger AND NEW.cli_version IS OLD.cli_version AND NEW.auth_mode IS OLD.auth_mode AND NEW.status IS OLD.status AND NEW.started_at IS OLD.started_at AND NEW.finished_at IS OLD.finished_at AND NEW.duration_ms IS OLD.duration_ms AND NEW.summary_json IS OLD.summary_json AND NEW.raw_blob_id IS OLD.raw_blob_id AND NEW.error IS OLD.error AND (NEW.container_id IS OLD.container_id OR (NEW.container_id IS NULL AND NOT EXISTS (SELECT 1 FROM containers fkp WHERE fkp.id = OLD.container_id))) AND (NEW.container_id IS NOT OLD.container_id))
BEGIN SELECT RAISE(ABORT, 'probe_runs: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger capabilities_actor_i
CREATE TRIGGER capabilities_actor_i BEFORE INSERT ON capabilities
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'capabilities: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger capabilities_actor_u
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

-- @ga:object trigger quota_snapshots_actor_i
CREATE TRIGGER quota_snapshots_actor_i BEFORE INSERT ON quota_snapshots
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'quota_snapshots: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger quota_snapshots_actor_u
CREATE TRIGGER quota_snapshots_actor_u BEFORE UPDATE ON quota_snapshots
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.engine_account_id IS OLD.engine_account_id AND NEW.observed_at IS OLD.observed_at AND NEW.window_key IS OLD.window_key AND NEW.window_seconds IS OLD.window_seconds AND NEW.state IS OLD.state AND NEW.remaining_pct IS OLD.remaining_pct AND NEW.used IS OLD.used AND NEW.limit_value IS OLD.limit_value AND NEW.reset_at IS OLD.reset_at AND NEW.source IS OLD.source AND NEW.confidence IS OLD.confidence AND NEW.raw_json IS OLD.raw_json AND (NEW.probe_run_id IS OLD.probe_run_id OR (NEW.probe_run_id IS NULL AND NOT EXISTS (SELECT 1 FROM probe_runs fkp WHERE fkp.id = OLD.probe_run_id))) AND (NEW.probe_run_id IS NOT OLD.probe_run_id))
BEGIN SELECT RAISE(ABORT, 'quota_snapshots: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger model_ranks_actor_i
CREATE TRIGGER model_ranks_actor_i BEFORE INSERT ON model_ranks
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'model_ranks: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger model_ranks_actor_u
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

-- @ga:object trigger compiled_prompts_actor_i
CREATE TRIGGER compiled_prompts_actor_i BEFORE INSERT ON compiled_prompts
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'compiled_prompts: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger compiled_prompts_actor_u
CREATE TRIGGER compiled_prompts_actor_u BEFORE UPDATE ON compiled_prompts
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'compiled_prompts: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger containers_actor_i
CREATE TRIGGER containers_actor_i BEFORE INSERT ON containers
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'containers: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger containers_actor_u
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

-- @ga:object trigger telegram_bots_actor_i
CREATE TRIGGER telegram_bots_actor_i BEFORE INSERT ON telegram_bots
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'telegram_bots: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger telegram_bots_actor_u
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

-- @ga:object trigger telegram_allowlist_actor_i
CREATE TRIGGER telegram_allowlist_actor_i BEFORE INSERT ON telegram_allowlist
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'telegram_allowlist: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger telegram_allowlist_actor_u
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

-- @ga:object trigger proactive_policies_actor_i
CREATE TRIGGER proactive_policies_actor_i BEFORE INSERT ON proactive_policies
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'proactive_policies: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger proactive_policies_actor_u
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

-- @ga:object trigger proactive_jobs_actor_i
CREATE TRIGGER proactive_jobs_actor_i BEFORE INSERT ON proactive_jobs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'proactive_jobs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger proactive_jobs_actor_u
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

-- @ga:object trigger proactive_sends_actor_i
CREATE TRIGGER proactive_sends_actor_i BEFORE INSERT ON proactive_sends
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'proactive_sends: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger proactive_sends_actor_u
CREATE TRIGGER proactive_sends_actor_u BEFORE UPDATE ON proactive_sends
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.trigger_kind IS OLD.trigger_kind AND NEW.urgency IS OLD.urgency AND NEW.day_local IS OLD.day_local AND NEW.channel IS OLD.channel AND NEW.status IS OLD.status AND NEW.idempotency_key IS OLD.idempotency_key AND NEW.reserved_until IS OLD.reserved_until AND NEW.sent_at IS OLD.sent_at AND NEW.error IS OLD.error AND NEW.reason IS OLD.reason AND (NEW.policy_id IS OLD.policy_id OR (NEW.policy_id IS NULL AND NOT EXISTS (SELECT 1 FROM proactive_policies fkp WHERE fkp.id = OLD.policy_id))) AND (NEW.message_id IS OLD.message_id OR (NEW.message_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_messages fkp WHERE fkp.id = OLD.message_id))) AND (NEW.task_id IS OLD.task_id OR (NEW.task_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks fkp WHERE fkp.id = OLD.task_id))) AND (NEW.commitment_id IS OLD.commitment_id OR (NEW.commitment_id IS NULL AND NOT EXISTS (SELECT 1 FROM commitments fkp WHERE fkp.id = OLD.commitment_id))) AND (NEW.proactive_job_id IS OLD.proactive_job_id OR (NEW.proactive_job_id IS NULL AND NOT EXISTS (SELECT 1 FROM proactive_jobs fkp WHERE fkp.id = OLD.proactive_job_id))) AND (NEW.policy_id IS NOT OLD.policy_id OR NEW.message_id IS NOT OLD.message_id OR NEW.task_id IS NOT OLD.task_id OR NEW.commitment_id IS NOT OLD.commitment_id OR NEW.proactive_job_id IS NOT OLD.proactive_job_id))
BEGIN SELECT RAISE(ABORT, 'proactive_sends: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger tools_actor_i
CREATE TRIGGER tools_actor_i BEFORE INSERT ON tools
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'tools: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger tools_actor_u
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

-- @ga:object trigger tool_grants_actor_i
CREATE TRIGGER tool_grants_actor_i BEFORE INSERT ON tool_grants
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'tool_grants: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger tool_grants_actor_u
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

-- @ga:object trigger permission_requests_actor_i
CREATE TRIGGER permission_requests_actor_i BEFORE INSERT ON permission_requests
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'permission_requests: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger permission_requests_actor_u
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

-- @ga:object trigger egress_rules_actor_i
CREATE TRIGGER egress_rules_actor_i BEFORE INSERT ON egress_rules
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'egress_rules: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger egress_rules_actor_u
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

-- @ga:object trigger polaris_checks_actor_i
CREATE TRIGGER polaris_checks_actor_i BEFORE INSERT ON polaris_checks
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'polaris_checks: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger polaris_checks_actor_u
CREATE TRIGGER polaris_checks_actor_u BEFORE UPDATE ON polaris_checks
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.subject_kind IS OLD.subject_kind AND NEW.change_set_id IS OLD.change_set_id AND NEW.permission_request_id IS OLD.permission_request_id AND NEW.proactive_send_id IS OLD.proactive_send_id AND NEW.task_id IS OLD.task_id AND NEW.expected_gain_minor IS OLD.expected_gain_minor AND NEW.rules_applied IS OLD.rules_applied AND NEW.rationale IS OLD.rationale AND NEW.balance_minor_at IS OLD.balance_minor_at AND NEW.rank_at IS OLD.rank_at AND NEW.audit_id IS OLD.audit_id AND NEW.audit_display_id IS OLD.audit_display_id AND (NEW.session_id IS OLD.session_id OR (NEW.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.session_id))) AND (NEW.session_id IS NOT OLD.session_id))
BEGIN SELECT RAISE(ABORT, 'polaris_checks: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger employee_cards_actor_i
CREATE TRIGGER employee_cards_actor_i BEFORE INSERT ON employee_cards
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'employee_cards: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger employee_cards_actor_u
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

-- @ga:object trigger trial_runs_actor_i
CREATE TRIGGER trial_runs_actor_i BEFORE INSERT ON trial_runs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'trial_runs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger trial_runs_actor_u
CREATE TRIGGER trial_runs_actor_u BEFORE UPDATE ON trial_runs
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.role_id IS OLD.role_id AND NEW.revision_id IS OLD.revision_id AND NEW.compiled_prompt_id IS OLD.compiled_prompt_id AND NEW.status IS OLD.status AND NEW.scenario_count IS OLD.scenario_count AND NEW.pass_count IS OLD.pass_count AND NEW.score IS OLD.score AND NEW.pass_threshold IS OLD.pass_threshold AND NEW.judge_kind IS OLD.judge_kind AND NEW.result_json IS OLD.result_json AND NEW.skip_reason IS OLD.skip_reason AND NEW.decided_at IS OLD.decided_at AND NEW.decided_by IS OLD.decided_by AND (NEW.engine_account_id IS OLD.engine_account_id OR (NEW.engine_account_id IS NULL AND NOT EXISTS (SELECT 1 FROM engine_accounts fkp WHERE fkp.id = OLD.engine_account_id))) AND (NEW.judge_session_id IS OLD.judge_session_id OR (NEW.judge_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.judge_session_id))) AND (NEW.engine_account_id IS NOT OLD.engine_account_id OR NEW.judge_session_id IS NOT OLD.judge_session_id))
BEGIN SELECT RAISE(ABORT, 'trial_runs: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger chat_threads_actor_i
CREATE TRIGGER chat_threads_actor_i BEFORE INSERT ON chat_threads
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'chat_threads: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger chat_threads_actor_u
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

-- @ga:object trigger chat_messages_actor_i
CREATE TRIGGER chat_messages_actor_i BEFORE INSERT ON chat_messages
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'chat_messages: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger chat_messages_actor_u
CREATE TRIGGER chat_messages_actor_u BEFORE UPDATE ON chat_messages
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.thread_id IS OLD.thread_id AND NEW.author_kind IS OLD.author_kind AND NEW.author_actor_id IS OLD.author_actor_id AND NEW.channel IS OLD.channel AND NEW.content IS OLD.content AND NEW.status IS OLD.status AND NEW.context_tokens IS OLD.context_tokens AND NEW.tokens_in IS OLD.tokens_in AND NEW.tokens_out IS OLD.tokens_out AND NEW.external_id IS OLD.external_id AND NEW.anchor_count IS OLD.anchor_count AND NEW.attachment_count IS OLD.attachment_count AND NEW.lang IS OLD.lang AND NEW.redacted_at IS OLD.redacted_at AND NEW.redacted_by IS OLD.redacted_by AND NEW.redact_reason IS OLD.redact_reason AND NEW.certainty IS OLD.certainty AND (NEW.session_id IS OLD.session_id OR (NEW.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.session_id))) AND (NEW.reply_to_id IS OLD.reply_to_id OR (NEW.reply_to_id IS NULL AND NOT EXISTS (SELECT 1 FROM chat_messages fkp WHERE fkp.id = OLD.reply_to_id))) AND (NEW.session_id IS NOT OLD.session_id OR NEW.reply_to_id IS NOT OLD.reply_to_id))
BEGIN SELECT RAISE(ABORT, 'chat_messages: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger message_attachments_actor_i
CREATE TRIGGER message_attachments_actor_i BEFORE INSERT ON message_attachments
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'message_attachments: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger message_attachments_actor_u
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

-- @ga:object trigger message_anchors_actor_i
CREATE TRIGGER message_anchors_actor_i BEFORE INSERT ON message_anchors
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'message_anchors: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger message_anchors_actor_u
CREATE TRIGGER message_anchors_actor_u BEFORE UPDATE ON message_anchors
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'message_anchors: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger ui_actions_actor_i
CREATE TRIGGER ui_actions_actor_i BEFORE INSERT ON ui_actions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'ui_actions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger ui_actions_actor_u
CREATE TRIGGER ui_actions_actor_u BEFORE UPDATE ON ui_actions
WHEN app_maint() = 0 AND app_actor() IS NULL AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by AND NEW.message_id IS OLD.message_id AND NEW.action IS OLD.action AND NEW.anchor IS OLD.anchor AND NEW.entity_type IS OLD.entity_type AND NEW.entity_id IS OLD.entity_id AND NEW.entity_display_id IS OLD.entity_display_id AND NEW.step IS OLD.step AND NEW.payload_json IS OLD.payload_json AND NEW.change_set_display_id IS OLD.change_set_display_id AND NEW.outcome IS OLD.outcome AND NEW.screen_route IS OLD.screen_route AND (NEW.session_id IS OLD.session_id OR (NEW.session_id IS NULL AND NOT EXISTS (SELECT 1 FROM sessions fkp WHERE fkp.id = OLD.session_id))) AND (NEW.change_set_id IS OLD.change_set_id OR (NEW.change_set_id IS NULL AND NOT EXISTS (SELECT 1 FROM change_sets fkp WHERE fkp.id = OLD.change_set_id))) AND (NEW.session_id IS NOT OLD.session_id OR NEW.change_set_id IS NOT OLD.change_set_id))
BEGIN SELECT RAISE(ABORT, 'ui_actions: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger audit_log_actor_i
CREATE TRIGGER audit_log_actor_i BEFORE INSERT ON audit_log
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'audit_log: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger audit_log_actor_u
CREATE TRIGGER audit_log_actor_u BEFORE UPDATE ON audit_log
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'audit_log: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger events_actor_i
CREATE TRIGGER events_actor_i BEFORE INSERT ON events
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'events: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger events_actor_u
CREATE TRIGGER events_actor_u BEFORE UPDATE ON events
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'events: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger notifications_actor_i
CREATE TRIGGER notifications_actor_i BEFORE INSERT ON notifications
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'notifications: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger notifications_actor_u
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

-- @ga:object trigger jobs_actor_i
CREATE TRIGGER jobs_actor_i BEFORE INSERT ON jobs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'jobs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger jobs_actor_u
CREATE TRIGGER jobs_actor_u BEFORE UPDATE ON jobs
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'jobs: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger app_versions_actor_i
CREATE TRIGGER app_versions_actor_i BEFORE INSERT ON app_versions
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'app_versions: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger app_versions_actor_u
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

-- @ga:object trigger backups_actor_i
CREATE TRIGGER backups_actor_i BEFORE INSERT ON backups
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'backups: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger backups_actor_u
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

-- @ga:object trigger update_runs_actor_i
CREATE TRIGGER update_runs_actor_i BEFORE INSERT ON update_runs
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'update_runs: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger update_runs_actor_u
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

-- @ga:object trigger settings_actor_i
CREATE TRIGGER settings_actor_i BEFORE INSERT ON settings
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'settings: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger settings_actor_u
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

-- @ga:object trigger secrets_actor_i
CREATE TRIGGER secrets_actor_i BEFORE INSERT ON secrets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'secrets: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger secrets_actor_u
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

-- @ga:object trigger consents_actor_i
CREATE TRIGGER consents_actor_i BEFORE INSERT ON consents
WHEN app_maint() = 0 AND NOT COALESCE(NEW.created_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'consents: người ghi (v2.3.3) — created_by phải = app_actor() của giao dịch ghi (thiếu app_actor ⇒ từ chối)'); END;

-- @ga:object trigger consents_actor_u
CREATE TRIGGER consents_actor_u BEFORE UPDATE ON consents
WHEN app_maint() = 0 AND app_actor() IS NULL
BEGIN SELECT RAISE(ABORT, 'consents: người ghi (v2.3.3) — UPDATE cần app_actor() của giao dịch ghi'); END;

-- @ga:object trigger id_counters_ws_actor_i
CREATE TRIGGER id_counters_ws_actor_i BEFORE INSERT ON id_counters
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'id_counters (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger id_counters_ws_actor_u
CREATE TRIGGER id_counters_ws_actor_u BEFORE UPDATE ON id_counters
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id AND ta.workspace_id = OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'id_counters (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger change_set_items_ws_actor_i
CREATE TRIGGER change_set_items_ws_actor_i BEFORE INSERT ON change_set_items
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'change_set_items (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger change_set_items_ws_actor_u
CREATE TRIGGER change_set_items_ws_actor_u BEFORE UPDATE ON change_set_items
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id AND ta.workspace_id = OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'change_set_items (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger skill_engine_support_ws_actor_i
CREATE TRIGGER skill_engine_support_ws_actor_i BEFORE INSERT ON skill_engine_support
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'skill_engine_support (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger skill_engine_support_ws_actor_u
CREATE TRIGGER skill_engine_support_ws_actor_u BEFORE UPDATE ON skill_engine_support
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id AND ta.workspace_id = OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'skill_engine_support (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger skill_files_ws_actor_i
CREATE TRIGGER skill_files_ws_actor_i BEFORE INSERT ON skill_files
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'skill_files (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger skill_files_ws_actor_u
CREATE TRIGGER skill_files_ws_actor_u BEFORE UPDATE ON skill_files
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id AND ta.workspace_id = OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'skill_files (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger knowledge_chunks_ws_actor_i
CREATE TRIGGER knowledge_chunks_ws_actor_i BEFORE INSERT ON knowledge_chunks
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'knowledge_chunks (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger knowledge_chunks_ws_actor_u
CREATE TRIGGER knowledge_chunks_ws_actor_u BEFORE UPDATE ON knowledge_chunks
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id AND ta.workspace_id = OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'knowledge_chunks (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger usage_daily_ws_actor_i
CREATE TRIGGER usage_daily_ws_actor_i BEFORE INSERT ON usage_daily
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'usage_daily (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger usage_daily_ws_actor_u
CREATE TRIGGER usage_daily_ws_actor_u BEFORE UPDATE ON usage_daily
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id AND ta.workspace_id = OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'usage_daily (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger compiled_prompt_segments_ws_actor_i
CREATE TRIGGER compiled_prompt_segments_ws_actor_i BEFORE INSERT ON compiled_prompt_segments
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'compiled_prompt_segments (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger search_documents_ws_actor_i
CREATE TRIGGER search_documents_ws_actor_i BEFORE INSERT ON search_documents
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'search_documents (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger search_documents_ws_actor_u
CREATE TRIGGER search_documents_ws_actor_u BEFORE UPDATE ON search_documents
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors ta WHERE ta.id = app_actor() AND ta.workspace_id = NEW.workspace_id AND ta.workspace_id = OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'search_documents (v2.3.5): bảng không có cột người ghi — ghi ngoài bảo trì cần app_actor() là actor của chính workspace của hàng (guard chung; thiếu actor hoặc actor workspace khác ⇒ từ chối)'); END;

-- @ga:object trigger id_aliases_no_update
CREATE TRIGGER id_aliases_no_update BEFORE UPDATE ON id_aliases
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: id_aliases'); END;

-- @ga:object trigger id_aliases_no_delete
CREATE TRIGGER id_aliases_no_delete BEFORE DELETE ON id_aliases
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: id_aliases'); END;

-- @ga:object trigger roles_ident
CREATE TRIGGER roles_ident BEFORE UPDATE ON roles
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: roles'); END;

-- @ga:object trigger avatars_no_update
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

-- @ga:object trigger avatars_no_delete
CREATE TRIGGER avatars_no_delete BEFORE DELETE ON avatars
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: avatars'); END;

-- @ga:object trigger skin_assets_ident
CREATE TRIGGER skin_assets_ident BEFORE UPDATE ON skin_assets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: skin_assets'); END;

-- @ga:object trigger dna_field_defs_ident
CREATE TRIGGER dna_field_defs_ident BEFORE UPDATE ON dna_field_defs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: dna_field_defs'); END;

-- @ga:object trigger dna_fields_ident
CREATE TRIGGER dna_fields_ident BEFORE UPDATE ON dna_fields
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: dna_fields'); END;

-- @ga:object trigger dna_field_versions_no_update
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

-- @ga:object trigger dna_field_versions_no_delete
CREATE TRIGGER dna_field_versions_no_delete BEFORE DELETE ON dna_field_versions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: dna_field_versions'); END;

-- @ga:object trigger revisions_no_update
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

-- @ga:object trigger revisions_no_delete
CREATE TRIGGER revisions_no_delete BEFORE DELETE ON revisions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: revisions'); END;

-- @ga:object trigger change_sets_ident
CREATE TRIGGER change_sets_ident BEFORE UPDATE ON change_sets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: change_sets'); END;

-- @ga:object trigger instructions_ident
CREATE TRIGGER instructions_ident BEFORE UPDATE ON instructions
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: instructions'); END;

-- @ga:object trigger instruction_versions_no_update
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

-- @ga:object trigger instruction_versions_no_delete
CREATE TRIGGER instruction_versions_no_delete BEFORE DELETE ON instruction_versions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: instruction_versions'); END;

-- @ga:object trigger taxonomy_nodes_ident
CREATE TRIGGER taxonomy_nodes_ident BEFORE UPDATE ON taxonomy_nodes
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: taxonomy_nodes'); END;

-- @ga:object trigger skills_ident
CREATE TRIGGER skills_ident BEFORE UPDATE ON skills
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: skills'); END;

-- @ga:object trigger skill_versions_no_update
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

-- @ga:object trigger skill_versions_no_delete
CREATE TRIGGER skill_versions_no_delete BEFORE DELETE ON skill_versions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: skill_versions'); END;

-- @ga:object trigger skill_prereqs_ident
CREATE TRIGGER skill_prereqs_ident BEFORE UPDATE ON skill_prereqs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: skill_prereqs'); END;

-- @ga:object trigger role_skills_ident
CREATE TRIGGER role_skills_ident BEFORE UPDATE ON role_skills
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: role_skills'); END;

-- @ga:object trigger blobs_no_update
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

-- @ga:object trigger blobs_no_delete
CREATE TRIGGER blobs_no_delete BEFORE DELETE ON blobs
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: blobs'); END;

-- @ga:object trigger knowledge_items_ident
CREATE TRIGGER knowledge_items_ident BEFORE UPDATE ON knowledge_items
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: knowledge_items'); END;

-- @ga:object trigger memories_ident
CREATE TRIGGER memories_ident BEFORE UPDATE ON memories
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: memories'); END;

-- @ga:object trigger recall_hits_no_update
CREATE TRIGGER recall_hits_no_update BEFORE UPDATE ON recall_hits
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: recall_hits'); END;

-- @ga:object trigger recall_hits_no_delete
CREATE TRIGGER recall_hits_no_delete BEFORE DELETE ON recall_hits
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: recall_hits'); END;

-- @ga:object trigger positions_ident
CREATE TRIGGER positions_ident BEFORE UPDATE ON positions
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: positions'); END;

-- @ga:object trigger assignments_ident
CREATE TRIGGER assignments_ident BEFORE UPDATE ON assignments
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: assignments'); END;

-- @ga:object trigger trust_tier_changes_no_update
CREATE TRIGGER trust_tier_changes_no_update BEFORE UPDATE ON trust_tier_changes
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: trust_tier_changes'); END;

-- @ga:object trigger trust_tier_changes_no_delete
CREATE TRIGGER trust_tier_changes_no_delete BEFORE DELETE ON trust_tier_changes
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: trust_tier_changes'); END;

-- @ga:object trigger tasks_ident
CREATE TRIGGER tasks_ident BEFORE UPDATE ON tasks
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: tasks'); END;

-- @ga:object trigger commitments_ident
CREATE TRIGGER commitments_ident BEFORE UPDATE ON commitments
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: commitments'); END;

-- @ga:object trigger sessions_no_update
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

-- @ga:object trigger sessions_no_delete
CREATE TRIGGER sessions_no_delete BEFORE DELETE ON sessions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: sessions'); END;

-- @ga:object trigger wallets_ident
CREATE TRIGGER wallets_ident BEFORE UPDATE ON wallets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: wallets'); END;

-- @ga:object trigger ledger_entries_no_update
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON ledger_entries
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: ledger_entries'); END;

-- @ga:object trigger ledger_entries_no_delete
CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON ledger_entries
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: ledger_entries'); END;

-- @ga:object trigger role_wounds_no_update
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

-- @ga:object trigger role_wounds_no_delete
CREATE TRIGGER role_wounds_no_delete BEFORE DELETE ON role_wounds
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: role_wounds'); END;

-- @ga:object trigger engine_installs_ident
CREATE TRIGGER engine_installs_ident BEFORE UPDATE ON engine_installs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: engine_installs'); END;

-- @ga:object trigger engine_accounts_ident
CREATE TRIGGER engine_accounts_ident BEFORE UPDATE ON engine_accounts
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: engine_accounts'); END;

-- @ga:object trigger engine_bindings_ident
CREATE TRIGGER engine_bindings_ident BEFORE UPDATE ON engine_bindings
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: engine_bindings'); END;

-- @ga:object trigger system_agents_ident
CREATE TRIGGER system_agents_ident BEFORE UPDATE ON system_agents
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: system_agents'); END;

-- @ga:object trigger probe_runs_no_update
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

-- @ga:object trigger probe_runs_no_delete
CREATE TRIGGER probe_runs_no_delete BEFORE DELETE ON probe_runs
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: probe_runs'); END;

-- @ga:object trigger capabilities_ident
CREATE TRIGGER capabilities_ident BEFORE UPDATE ON capabilities
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: capabilities'); END;

-- @ga:object trigger quota_snapshots_no_update
CREATE TRIGGER quota_snapshots_no_update BEFORE UPDATE ON quota_snapshots
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: quota_snapshots'); END;

-- @ga:object trigger quota_snapshots_no_delete
CREATE TRIGGER quota_snapshots_no_delete BEFORE DELETE ON quota_snapshots
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: quota_snapshots'); END;

-- @ga:object trigger model_ranks_ident
CREATE TRIGGER model_ranks_ident BEFORE UPDATE ON model_ranks
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: model_ranks'); END;

-- @ga:object trigger compiled_prompts_no_update
CREATE TRIGGER compiled_prompts_no_update BEFORE UPDATE ON compiled_prompts
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: compiled_prompts'); END;

-- @ga:object trigger compiled_prompts_no_delete
CREATE TRIGGER compiled_prompts_no_delete BEFORE DELETE ON compiled_prompts
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: compiled_prompts'); END;

-- @ga:object trigger compiled_prompt_segments_no_update
CREATE TRIGGER compiled_prompt_segments_no_update BEFORE UPDATE ON compiled_prompt_segments
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: compiled_prompt_segments'); END;

-- @ga:object trigger compiled_prompt_segments_no_delete
CREATE TRIGGER compiled_prompt_segments_no_delete BEFORE DELETE ON compiled_prompt_segments
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: compiled_prompt_segments'); END;

-- @ga:object trigger containers_ident
CREATE TRIGGER containers_ident BEFORE UPDATE ON containers
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: containers'); END;

-- @ga:object trigger telegram_bots_ident
CREATE TRIGGER telegram_bots_ident BEFORE UPDATE ON telegram_bots
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: telegram_bots'); END;

-- @ga:object trigger telegram_allowlist_ident
CREATE TRIGGER telegram_allowlist_ident BEFORE UPDATE ON telegram_allowlist
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: telegram_allowlist'); END;

-- @ga:object trigger proactive_policies_ident
CREATE TRIGGER proactive_policies_ident BEFORE UPDATE ON proactive_policies
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: proactive_policies'); END;

-- @ga:object trigger proactive_jobs_ident
CREATE TRIGGER proactive_jobs_ident BEFORE UPDATE ON proactive_jobs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: proactive_jobs'); END;

-- @ga:object trigger proactive_sends_no_update
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

-- @ga:object trigger proactive_sends_no_delete
CREATE TRIGGER proactive_sends_no_delete BEFORE DELETE ON proactive_sends
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: proactive_sends'); END;

-- @ga:object trigger tools_ident
CREATE TRIGGER tools_ident BEFORE UPDATE ON tools
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: tools'); END;

-- @ga:object trigger tool_grants_ident
CREATE TRIGGER tool_grants_ident BEFORE UPDATE ON tool_grants
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: tool_grants'); END;

-- @ga:object trigger permission_requests_ident
CREATE TRIGGER permission_requests_ident BEFORE UPDATE ON permission_requests
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: permission_requests'); END;

-- @ga:object trigger egress_rules_ident
CREATE TRIGGER egress_rules_ident BEFORE UPDATE ON egress_rules
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: egress_rules'); END;

-- @ga:object trigger polaris_checks_no_update
CREATE TRIGGER polaris_checks_no_update BEFORE UPDATE ON polaris_checks
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: polaris_checks'); END;

-- @ga:object trigger polaris_checks_no_delete
CREATE TRIGGER polaris_checks_no_delete BEFORE DELETE ON polaris_checks
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: polaris_checks'); END;

-- @ga:object trigger employee_cards_ident
CREATE TRIGGER employee_cards_ident BEFORE UPDATE ON employee_cards
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: employee_cards'); END;

-- @ga:object trigger trial_runs_no_update
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

-- @ga:object trigger trial_runs_no_delete
CREATE TRIGGER trial_runs_no_delete BEFORE DELETE ON trial_runs
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: trial_runs'); END;

-- @ga:object trigger chat_threads_ident
CREATE TRIGGER chat_threads_ident BEFORE UPDATE ON chat_threads
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: chat_threads'); END;

-- @ga:object trigger chat_messages_no_update
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

-- @ga:object trigger chat_messages_no_delete
CREATE TRIGGER chat_messages_no_delete BEFORE DELETE ON chat_messages
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: chat_messages'); END;

-- @ga:object trigger message_attachments_ident
CREATE TRIGGER message_attachments_ident BEFORE UPDATE ON message_attachments
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: message_attachments'); END;

-- @ga:object trigger message_anchors_no_update
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

-- @ga:object trigger message_anchors_no_delete
CREATE TRIGGER message_anchors_no_delete BEFORE DELETE ON message_anchors
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: message_anchors'); END;

-- @ga:object trigger ui_actions_no_update
CREATE TRIGGER ui_actions_no_update BEFORE UPDATE ON ui_actions
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: ui_actions'); END;

-- @ga:object trigger ui_actions_no_delete
CREATE TRIGGER ui_actions_no_delete BEFORE DELETE ON ui_actions
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: ui_actions'); END;

-- @ga:object trigger audit_log_no_update
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: audit_log'); END;

-- @ga:object trigger audit_log_no_delete
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: audit_log'); END;

-- @ga:object trigger events_no_update
CREATE TRIGGER events_no_update BEFORE UPDATE ON events
WHEN app_maint() = 0 AND NOT (
  0)
BEGIN SELECT RAISE(ABORT, 'append-only/write-once: events'); END;

-- @ga:object trigger events_no_delete
CREATE TRIGGER events_no_delete BEFORE DELETE ON events
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: events'); END;

-- @ga:object trigger notifications_ident
CREATE TRIGGER notifications_ident BEFORE UPDATE ON notifications
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: notifications'); END;

-- @ga:object trigger app_versions_ident
CREATE TRIGGER app_versions_ident BEFORE UPDATE ON app_versions
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: app_versions'); END;

-- @ga:object trigger backups_ident
CREATE TRIGGER backups_ident BEFORE UPDATE ON backups
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: backups'); END;

-- @ga:object trigger update_runs_ident
CREATE TRIGGER update_runs_ident BEFORE UPDATE ON update_runs
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: update_runs'); END;

-- @ga:object trigger settings_ident
CREATE TRIGGER settings_ident BEFORE UPDATE ON settings
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: settings'); END;

-- @ga:object trigger secrets_ident
CREATE TRIGGER secrets_ident BEFORE UPDATE ON secrets
WHEN app_maint() = 0 AND NOT (NEW.id IS OLD.id AND NEW.workspace_id IS OLD.workspace_id AND NEW.display_id IS OLD.display_id AND NEW.display_seq IS OLD.display_seq AND NEW.created_at IS OLD.created_at AND NEW.created_by IS OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'immutable identity: secrets'); END;

-- @ga:object trigger consents_no_update
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

-- @ga:object trigger consents_no_delete
CREATE TRIGGER consents_no_delete BEFORE DELETE ON consents
WHEN app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'append-only: consents'); END;

-- @ga:object trigger ledger_entries_bi
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

-- @ga:object trigger ledger_entries_ai
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

-- @ga:object trigger wallets_balance_guard
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

-- @ga:object trigger tasks_wounded_i
CREATE TRIGGER tasks_wounded_i BEFORE INSERT ON tasks
WHEN NEW.assignee_role_id IS NOT NULL AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.assignee_role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương (nghỉ dưỡng thương): không nhận việc cho đến khi owner cấp thêm ₲'); END;

-- @ga:object trigger tasks_wounded_u
CREATE TRIGGER tasks_wounded_u BEFORE UPDATE OF assignee_role_id ON tasks
WHEN NEW.assignee_role_id IS NOT OLD.assignee_role_id AND NEW.assignee_role_id IS NOT NULL AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.assignee_role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương (nghỉ dưỡng thương): không nhận việc cho đến khi owner cấp thêm ₲'); END;

-- @ga:object trigger sessions_wounded
CREATE TRIGGER sessions_wounded BEFORE INSERT ON sessions
WHEN NEW.agent_kind = 'role' AND NEW.role_id IS NOT NULL AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: đang ngủ, không có phiên làm việc/heartbeat'); END;

-- @ga:object trigger proactive_sends_wounded
CREATE TRIGGER proactive_sends_wounded BEFORE INSERT ON proactive_sends
WHEN NEW.status = 'reserved' AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: không nhắn chủ động (ghi suppressed_wounded)'); END;

-- @ga:object trigger containers_wounded_i
CREATE TRIGGER containers_wounded_i BEFORE INSERT ON containers
WHEN NEW.kind = 'role' AND NEW.desired_state = 'running' AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: container chỉ được ngủ'); END;

-- @ga:object trigger containers_wounded_u
CREATE TRIGGER containers_wounded_u BEFORE UPDATE OF desired_state ON containers
WHEN NEW.kind = 'role' AND NEW.desired_state = 'running' AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: container chỉ được ngủ'); END;

-- @ga:object trigger audit_log_chain
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log
WHEN NOT (NEW.display_seq = 1 AND NEW.prev_hash IS NULL)
 AND (NEW.prev_hash IS NULL OR NEW.prev_hash IS NOT (
      SELECT a.row_hash FROM audit_log a WHERE a.workspace_id = NEW.workspace_id AND a.display_seq = NEW.display_seq - 1))
BEGIN SELECT RAISE(ABORT, 'audit: prev_hash phải = row_hash của dòng display_seq-1'); END;

-- @ga:object trigger dna_fields_def_tenant_i
CREATE TRIGGER dna_fields_def_tenant_i BEFORE INSERT ON dna_fields
WHEN COALESCE((SELECT workspace_id FROM dna_field_defs WHERE id = NEW.def_id), '') NOT IN (NEW.workspace_id, '00000000000000000000000000')
BEGIN SELECT RAISE(ABORT, 'tenant: dna_fields.def_id thuộc workspace khác'); END;

-- @ga:object trigger dna_fields_def_tenant_u
CREATE TRIGGER dna_fields_def_tenant_u BEFORE UPDATE OF def_id, workspace_id ON dna_fields
WHEN COALESCE((SELECT workspace_id FROM dna_field_defs WHERE id = NEW.def_id), '') NOT IN (NEW.workspace_id, '00000000000000000000000000')
BEGIN SELECT RAISE(ABORT, 'tenant: dna_fields.def_id thuộc workspace khác'); END;

-- @ga:object trigger dna_fields_confirm_i
CREATE TRIGGER dna_fields_confirm_i BEFORE INSERT ON dna_fields
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'dna_fields: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

-- @ga:object trigger dna_fields_confirm_u
CREATE TRIGGER dna_fields_confirm_u BEFORE UPDATE OF confirmed_by, workspace_id ON dna_fields
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'dna_fields: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

-- @ga:object trigger trust_tier_changes_bi
CREATE TRIGGER trust_tier_changes_bi BEFORE INSERT ON trust_tier_changes
WHEN NEW.to_tier > COALESCE((SELECT max_trust_tier FROM positions WHERE id = NEW.position_id), 4)
  OR NEW.from_tier IS NOT (SELECT CASE WHEN NEW.kind = 'initial' THEN NULL ELSE trust_tier END FROM assignments WHERE id = NEW.assignment_id)
BEGIN SELECT RAISE(ABORT, 'trust tier: vượt trần vị trí hoặc from_tier lệch'); END;

-- @ga:object trigger trust_tier_changes_ai
CREATE TRIGGER trust_tier_changes_ai AFTER INSERT ON trust_tier_changes BEGIN
  UPDATE assignments SET trust_tier = NEW.to_tier, updated_by = COALESCE(app_actor(), updated_by), updated_at = max(NEW.created_at, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), NEW.created_at)) WHERE id = NEW.assignment_id;
END;

-- @ga:object trigger engine_accounts_consent_i
CREATE TRIGGER engine_accounts_consent_i BEFORE INSERT ON engine_accounts
WHEN NOT (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = NEW.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = NEW.engine_slug WHERE cn.id = NEW.consent_id AND cn.workspace_id = NEW.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = NEW.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS NEW.account_hint)))
BEGIN SELECT RAISE(ABORT, 'engine cần consent: đồng ý điều khoản (engine_tos_risk) cùng workspace, đúng engine, chưa rút, đúng version cảnh báo — chưa đồng ý thì không tạo / đăng nhập được'); END;

-- @ga:object trigger engine_accounts_consent_u
CREATE TRIGGER engine_accounts_consent_u BEFORE UPDATE OF consent_id, engine_slug, workspace_id ON engine_accounts
WHEN NOT (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = NEW.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = NEW.engine_slug WHERE cn.id = NEW.consent_id AND cn.workspace_id = NEW.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = NEW.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS NEW.account_hint)))
BEGIN SELECT RAISE(ABORT, 'engine cần consent: đồng ý điều khoản (engine_tos_risk) cùng workspace, đúng engine, chưa rút, đúng version cảnh báo — chưa đồng ý thì không tạo / đăng nhập được'); END;

-- @ga:object trigger engine_accounts_overhead_i
CREATE TRIGGER engine_accounts_overhead_i BEFORE INSERT ON engine_accounts
WHEN NEW.runtime_overhead_tokens IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sessions b, sessions s
  WHERE b.id = NEW.overhead_bare_session_id AND s.id = NEW.overhead_shell_session_id
    AND b.trigger = 'baseline' AND s.trigger = 'baseline' AND b.status = 'ok' AND s.status = 'ok'
    AND b.engine_account_id = NEW.id AND s.engine_account_id = NEW.id
    AND s.tokens_input >= b.tokens_input AND NEW.runtime_overhead_tokens = s.tokens_input - b.tokens_input)
BEGIN SELECT RAISE(ABORT, 'runtime overhead phải = phiên baseline (vỏ adapter + tool gateway) − phiên CLI trần, cùng tài khoản'); END;

-- @ga:object trigger engine_accounts_overhead_u
CREATE TRIGGER engine_accounts_overhead_u BEFORE UPDATE OF runtime_overhead_tokens, overhead_bare_session_id, overhead_shell_session_id ON engine_accounts
WHEN NEW.runtime_overhead_tokens IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sessions b, sessions s
  WHERE b.id = NEW.overhead_bare_session_id AND s.id = NEW.overhead_shell_session_id
    AND b.trigger = 'baseline' AND s.trigger = 'baseline' AND b.status = 'ok' AND s.status = 'ok'
    AND b.engine_account_id = NEW.id AND s.engine_account_id = NEW.id
    AND s.tokens_input >= b.tokens_input AND NEW.runtime_overhead_tokens = s.tokens_input - b.tokens_input)
BEGIN SELECT RAISE(ABORT, 'runtime overhead phải = phiên baseline (vỏ adapter + tool gateway) − phiên CLI trần, cùng tài khoản'); END;

-- @ga:object trigger proactive_sends_cap
CREATE TRIGGER proactive_sends_cap BEFORE INSERT ON proactive_sends
WHEN NEW.status = 'reserved' AND (
  SELECT count(*) FROM proactive_sends s
  WHERE s.role_id = NEW.role_id AND s.day_local = NEW.day_local AND s.status IN ('reserved', 'sent', 'expired'))
  >= COALESCE((SELECT p.max_per_day FROM proactive_policies p
               WHERE p.id = NEW.policy_id AND p.role_id = NEW.role_id AND p.is_enabled = 1 AND p.deleted_at IS NULL), 0)
BEGIN SELECT RAISE(ABORT, 'proactive: vượt trần tin/ngày'); END;

-- @ga:object trigger employee_cards_freeze
CREATE TRIGGER employee_cards_freeze BEFORE UPDATE ON employee_cards
WHEN app_maint() = 0 AND OLD.status <> 'draft' AND NOT (
  NEW.checks_json IS OLD.checks_json AND NEW.revision_id IS OLD.revision_id
  AND NEW.compiled_prompt_id IS OLD.compiled_prompt_id AND NEW.dna_signature IS OLD.dna_signature
  AND NEW.prompt_tokens IS OLD.prompt_tokens AND NEW.issued_at IS OLD.issued_at AND NEW.issued_by IS OLD.issued_by
  AND NEW.role_id IS OLD.role_id AND NEW.position_id IS OLD.position_id AND NEW.issue_audit_id IS OLD.issue_audit_id)
BEGIN SELECT RAISE(ABORT, 'employee_cards: bằng chứng đã đóng băng khi cấp'); END;

-- @ga:object trigger revisions_semver
CREATE TRIGGER revisions_semver BEFORE INSERT ON revisions
WHEN NOT ((NEW.seq = 1 AND NEW.major = 1 AND NEW.minor = 0) OR EXISTS (
  SELECT 1 FROM revisions p
  WHERE p.workspace_id = NEW.workspace_id AND p.scope = NEW.scope AND p.role_id IS NEW.role_id
    AND p.position_id IS NEW.position_id AND p.seq = NEW.seq - 1
    AND ((NEW.is_core = 1 AND NEW.major = p.major + 1 AND NEW.minor = 0)
      OR (NEW.is_core = 0 AND NEW.major = p.major AND NEW.minor = p.minor + 1))))
BEGIN SELECT RAISE(ABORT, 'revisions: lõi → major+1, minor=0; thường → minor+1 (so với seq liền trước)'); END;

-- @ga:object trigger instruction_versions_core_i
CREATE TRIGGER instruction_versions_core_i BEFORE INSERT ON instruction_versions
WHEN NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT is_core FROM instructions WHERE id = NEW.instruction_id) = 1 AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'lõi: khối IN lớp giá trị/tính cách chỉ đổi trong revision lõi (version lớn + lý do)'); END;

-- @ga:object trigger instruction_versions_core_u
CREATE TRIGGER instruction_versions_core_u BEFORE UPDATE OF revision_id, status ON instruction_versions
WHEN NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT is_core FROM instructions WHERE id = NEW.instruction_id) = 1 AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'lõi: khối IN lớp giá trị/tính cách chỉ đổi trong revision lõi (version lớn + lý do)'); END;

-- @ga:object trigger dna_field_versions_core_i
CREATE TRIGGER dna_field_versions_core_i BEFORE INSERT ON dna_field_versions
WHEN NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT d.is_core FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id WHERE f.id = NEW.dna_field_id) = 1 AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'lõi: field DN lõi chỉ đổi trong revision lõi (version lớn + lý do)'); END;

-- @ga:object trigger dna_field_versions_core_u
CREATE TRIGGER dna_field_versions_core_u BEFORE UPDATE OF revision_id, status ON dna_field_versions
WHEN NEW.revision_id IS NOT NULL AND NEW.status = 'accepted' AND (SELECT d.is_core FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id WHERE f.id = NEW.dna_field_id) = 1 AND (SELECT is_core FROM revisions WHERE id = NEW.revision_id) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'lõi: field DN lõi chỉ đổi trong revision lõi (version lớn + lý do)'); END;

-- @ga:object trigger taxonomy_nodes_cs_scope_i
CREATE TRIGGER taxonomy_nodes_cs_scope_i BEFORE INSERT ON taxonomy_nodes
WHEN NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)'); END;

-- @ga:object trigger taxonomy_nodes_cs_scope_u
CREATE TRIGGER taxonomy_nodes_cs_scope_u BEFORE UPDATE OF change_set_id ON taxonomy_nodes
WHEN NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)'); END;

-- @ga:object trigger skill_prereqs_cs_scope_i
CREATE TRIGGER skill_prereqs_cs_scope_i BEFORE INSERT ON skill_prereqs
WHEN NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)'); END;

-- @ga:object trigger skill_prereqs_cs_scope_u
CREATE TRIGGER skill_prereqs_cs_scope_u BEFORE UPDATE OF change_set_id ON skill_prereqs
WHEN NEW.change_set_id IS NOT NULL AND (SELECT scope FROM change_sets WHERE id = NEW.change_set_id) IS NOT 'library'
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: đề xuất cho thư viện phải nằm trong change set scope library (không mất theo Role)'); END;

-- @ga:object trigger taxonomy_nodes_parent_i
CREATE TRIGGER taxonomy_nodes_parent_i BEFORE INSERT ON taxonomy_nodes
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM taxonomy_nodes p WHERE p.id = NEW.parent_id AND p.workspace_id = NEW.workspace_id AND p.domain = NEW.domain
    AND ((p.level = 'group' AND NEW.level = 'branch') OR (p.level = 'branch' AND NEW.level = 'category')))
BEGIN SELECT RAISE(ABORT, 'taxonomy: cha phải cùng workspace, cùng domain, đúng một tầng trên (nhóm → phân hệ → chủng loại)'); END;

-- @ga:object trigger taxonomy_nodes_parent_u
CREATE TRIGGER taxonomy_nodes_parent_u BEFORE UPDATE OF parent_id, level, domain ON taxonomy_nodes
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM taxonomy_nodes p WHERE p.id = NEW.parent_id AND p.workspace_id = NEW.workspace_id AND p.domain = NEW.domain
    AND ((p.level = 'group' AND NEW.level = 'branch') OR (p.level = 'branch' AND NEW.level = 'category')))
BEGIN SELECT RAISE(ABORT, 'taxonomy: cha phải cùng workspace, cùng domain, đúng một tầng trên (nhóm → phân hệ → chủng loại)'); END;

-- @ga:object trigger taxonomy_nodes_confirm_i
CREATE TRIGGER taxonomy_nodes_confirm_i BEFORE INSERT ON taxonomy_nodes
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

-- @ga:object trigger taxonomy_nodes_confirm_u
CREATE TRIGGER taxonomy_nodes_confirm_u BEFORE UPDATE OF confirmed_by, workspace_id ON taxonomy_nodes
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

-- @ga:object trigger skill_prereqs_confirm_i
CREATE TRIGGER skill_prereqs_confirm_i BEFORE INSERT ON skill_prereqs
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

-- @ga:object trigger skill_prereqs_confirm_u
CREATE TRIGGER skill_prereqs_confirm_u BEFORE UPDATE OF confirmed_by, workspace_id ON skill_prereqs
WHEN NEW.confirmed_by IS NOT NULL AND NOT (COALESCE(NEW.confirmed_by = app_actor(), 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI — v2.3.3: confirmed_by = app_actor() (người duyệt là người ghi)'); END;

-- @ga:object trigger skills_category_i
CREATE TRIGGER skills_category_i BEFORE INSERT ON skills
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id AND t.workspace_id = NEW.workspace_id AND t.domain = 'skill' AND t.level = 'category')
BEGIN SELECT RAISE(ABORT, 'skills.category_id phải là chủng loại (category) của cây kỹ năng'); END;

-- @ga:object trigger skills_category_u
CREATE TRIGGER skills_category_u BEFORE UPDATE OF category_id ON skills
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id AND t.workspace_id = NEW.workspace_id AND t.domain = 'skill' AND t.level = 'category')
BEGIN SELECT RAISE(ABORT, 'skills.category_id phải là chủng loại (category) của cây kỹ năng'); END;

-- @ga:object trigger knowledge_items_category_i
CREATE TRIGGER knowledge_items_category_i BEFORE INSERT ON knowledge_items
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id AND t.workspace_id = NEW.workspace_id AND t.domain = 'knowledge' AND t.level = 'category')
BEGIN SELECT RAISE(ABORT, 'knowledge_items.category_id phải là chủng loại (category) của cây tri thức'); END;

-- @ga:object trigger knowledge_items_category_u
CREATE TRIGGER knowledge_items_category_u BEFORE UPDATE OF category_id ON knowledge_items
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM taxonomy_nodes t WHERE t.id = NEW.category_id AND t.workspace_id = NEW.workspace_id AND t.domain = 'knowledge' AND t.level = 'category')
BEGIN SELECT RAISE(ABORT, 'knowledge_items.category_id phải là chủng loại (category) của cây tri thức'); END;

-- @ga:object trigger skill_prereqs_upgrade_i
CREATE TRIGGER skill_prereqs_upgrade_i BEFORE INSERT ON skill_prereqs
WHEN NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NULL OR NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NOT (SELECT category_id FROM skills WHERE id = NEW.requires_skill_id)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh upgrade (bậc kế tiếp) phải trong cùng chủng loại; chéo nhánh dùng requires'); END;

-- @ga:object trigger skill_prereqs_upgrade_u
CREATE TRIGGER skill_prereqs_upgrade_u BEFORE UPDATE OF kind, skill_id, requires_skill_id ON skill_prereqs
WHEN NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NULL OR NEW.kind = 'upgrade' AND (SELECT category_id FROM skills WHERE id = NEW.skill_id) IS NOT (SELECT category_id FROM skills WHERE id = NEW.requires_skill_id)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh upgrade (bậc kế tiếp) phải trong cùng chủng loại; chéo nhánh dùng requires'); END;

-- @ga:object trigger skill_prereqs_nocycle_i
CREATE TRIGGER skill_prereqs_nocycle_i BEFORE INSERT ON skill_prereqs
WHEN NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL AND NEW.skill_id IN (
  WITH RECURSIVE up(sid) AS (
    SELECT NEW.requires_skill_id
    UNION
    SELECT p.requires_skill_id FROM skill_prereqs p JOIN up ON p.skill_id = up.sid
    WHERE p.status <> 'obsolete' AND p.deleted_at IS NULL)
  SELECT sid FROM up)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh này tạo vòng tiên quyết'); END;

-- @ga:object trigger skill_prereqs_nocycle_u
CREATE TRIGGER skill_prereqs_nocycle_u BEFORE UPDATE OF skill_id, requires_skill_id, status, deleted_at ON skill_prereqs
WHEN NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL AND NEW.skill_id IN (
  WITH RECURSIVE up(sid) AS (
    SELECT NEW.requires_skill_id
    UNION
    SELECT p.requires_skill_id FROM skill_prereqs p JOIN up ON p.skill_id = up.sid
    WHERE p.status <> 'obsolete' AND p.deleted_at IS NULL AND p.id <> NEW.id)
  SELECT sid FROM up)
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: cạnh này tạo vòng tiên quyết'); END;

-- @ga:object trigger engine_bindings_ws_i
CREATE TRIGGER engine_bindings_ws_i BEFORE INSERT ON engine_bindings
WHEN (SELECT workspace_id FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT NEW.workspace_id OR (NEW.role_id IS NOT NULL AND (SELECT workspace_id FROM roles WHERE id = NEW.role_id) IS NOT NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'tenant: engine_bindings nối tài khoản/Role của workspace khác'); END;

-- @ga:object trigger engine_bindings_ws_u
CREATE TRIGGER engine_bindings_ws_u BEFORE UPDATE OF engine_account_id, role_id, workspace_id ON engine_bindings
WHEN (SELECT workspace_id FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT NEW.workspace_id OR (NEW.role_id IS NOT NULL AND (SELECT workspace_id FROM roles WHERE id = NEW.role_id) IS NOT NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'tenant: engine_bindings nối tài khoản/Role của workspace khác'); END;

-- @ga:object trigger engine_accounts_secret_id_ws_i
CREATE TRIGGER engine_accounts_secret_id_ws_i BEFORE INSERT ON engine_accounts
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: engine_accounts.secret_id trỏ tới secrets của workspace khác'); END;

-- @ga:object trigger engine_accounts_secret_id_ws_u
CREATE TRIGGER engine_accounts_secret_id_ws_u BEFORE UPDATE OF secret_id, workspace_id ON engine_accounts
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: engine_accounts.secret_id trỏ tới secrets của workspace khác'); END;

-- @ga:object trigger telegram_bots_secret_id_ws_i
CREATE TRIGGER telegram_bots_secret_id_ws_i BEFORE INSERT ON telegram_bots
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: telegram_bots.secret_id trỏ tới secrets của workspace khác'); END;

-- @ga:object trigger telegram_bots_secret_id_ws_u
CREATE TRIGGER telegram_bots_secret_id_ws_u BEFORE UPDATE OF secret_id, workspace_id ON telegram_bots
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: telegram_bots.secret_id trỏ tới secrets của workspace khác'); END;

-- @ga:object trigger tools_secret_id_ws_i
CREATE TRIGGER tools_secret_id_ws_i BEFORE INSERT ON tools
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: tools.secret_id trỏ tới secrets của workspace khác'); END;

-- @ga:object trigger tools_secret_id_ws_u
CREATE TRIGGER tools_secret_id_ws_u BEFORE UPDATE OF secret_id, workspace_id ON tools
WHEN NEW.secret_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.secret_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: tools.secret_id trỏ tới secrets của workspace khác'); END;

-- @ga:object trigger secrets_rotated_from_id_ws_i
CREATE TRIGGER secrets_rotated_from_id_ws_i BEFORE INSERT ON secrets
WHEN NEW.rotated_from_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.rotated_from_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: secrets.rotated_from_id trỏ tới secrets của workspace khác'); END;

-- @ga:object trigger secrets_rotated_from_id_ws_u
CREATE TRIGGER secrets_rotated_from_id_ws_u BEFORE UPDATE OF rotated_from_id, workspace_id ON secrets
WHEN NEW.rotated_from_id IS NOT NULL AND (SELECT workspace_id FROM secrets WHERE id = NEW.rotated_from_id) IS NOT NEW.workspace_id
BEGIN SELECT RAISE(ABORT, 'tenant: secrets.rotated_from_id trỏ tới secrets của workspace khác'); END;

-- @ga:object trigger engine_bindings_container_i
CREATE TRIGGER engine_bindings_container_i BEFORE INSERT ON engine_bindings
WHEN NOT EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = NEW.workspace_id AND c.deleted_at IS NULL
                 AND ((NEW.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = NEW.role_id)
                   OR (NEW.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'engine_bindings: container của consumer phải có trước (login chạy bên trong nó)'); END;

-- @ga:object trigger sessions_prompt_hash_i
CREATE TRIGGER sessions_prompt_hash_i BEFORE INSERT ON sessions
WHEN NEW.delivered_prompt_hash IS NOT NULL AND (NEW.compiled_prompt_id IS NULL OR NEW.delivered_prompt_hash IS NOT
     (SELECT content_hash FROM compiled_prompts WHERE id = NEW.compiled_prompt_id))
BEGIN SELECT RAISE(ABORT, 'adapter: prompt đã nạp khác bản compiled_prompt_id đã ghim'); END;

-- @ga:object trigger sessions_prompt_hash_u
CREATE TRIGGER sessions_prompt_hash_u BEFORE UPDATE OF delivered_prompt_hash, compiled_prompt_id ON sessions
WHEN NEW.delivered_prompt_hash IS NOT NULL AND NEW.compiled_prompt_id IS NOT NULL AND NEW.delivered_prompt_hash IS NOT
     (SELECT content_hash FROM compiled_prompts WHERE id = NEW.compiled_prompt_id)
BEGIN SELECT RAISE(ABORT, 'adapter: prompt đã nạp khác bản compiled_prompt_id đã ghim'); END;

-- @ga:object trigger compiled_prompt_segments_order
CREATE TRIGGER compiled_prompt_segments_order BEFORE INSERT ON compiled_prompt_segments
WHEN NEW.source_kind <> 'frame' AND EXISTS (
  SELECT 1 FROM compiled_prompt_segments s WHERE s.compiled_prompt_id = NEW.compiled_prompt_id AND s.source_kind <> 'frame'
    AND ((s.ordinal < NEW.ordinal AND (CASE WHEN s.source_kind = 'polaris' THEN 2 WHEN s.is_conditional = 1 THEN 1 ELSE 0 END)
                                    > (CASE WHEN NEW.source_kind = 'polaris' THEN 2 WHEN NEW.is_conditional = 1 THEN 1 ELSE 0 END))
      OR (s.ordinal > NEW.ordinal AND (CASE WHEN s.source_kind = 'polaris' THEN 2 WHEN s.is_conditional = 1 THEN 1 ELSE 0 END)
                                    < (CASE WHEN NEW.source_kind = 'polaris' THEN 2 WHEN NEW.is_conditional = 1 THEN 1 ELSE 0 END))))
BEGIN SELECT RAISE(ABORT, 'compiler: thứ tự khối phải là luôn → có điều kiện → Polaris (hậu tố động)'); END;

-- @ga:object trigger change_sets_polaris
CREATE TRIGGER change_sets_polaris BEFORE INSERT ON change_sets
WHEN (SELECT kind FROM actors WHERE id = NEW.proposed_by) = 'role' AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.change_set_id = NEW.id AND p.subject_kind = 'proposal'
    AND p.role_id = (SELECT role_id FROM actors WHERE id = NEW.proposed_by))
BEGIN SELECT RAISE(ABORT, 'Polaris: đề xuất do Role khởi xướng phải có polaris_checks'); END;

-- @ga:object trigger permission_requests_polaris
CREATE TRIGGER permission_requests_polaris BEFORE INSERT ON permission_requests
WHEN NOT EXISTS (SELECT 1 FROM polaris_checks p WHERE p.permission_request_id = NEW.id AND p.role_id = NEW.role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role xin quyền phải có polaris_checks'); END;

-- @ga:object trigger proactive_sends_polaris
CREATE TRIGGER proactive_sends_polaris BEFORE INSERT ON proactive_sends
WHEN NEW.status = 'reserved' AND NOT EXISTS (SELECT 1 FROM polaris_checks p WHERE p.proactive_send_id = NEW.id AND p.role_id = NEW.role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: tin chủ động phải có polaris_checks'); END;

-- @ga:object trigger tasks_accept_polaris_i
CREATE TRIGGER tasks_accept_polaris_i BEFORE INSERT ON tasks
WHEN NEW.status = 'running' AND NEW.assignee_role_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.task_id = NEW.id AND p.subject_kind = 'task_accept' AND p.role_id = NEW.assignee_role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role nhận việc phải có polaris_checks'); END;

-- @ga:object trigger tasks_accept_polaris_u
CREATE TRIGGER tasks_accept_polaris_u BEFORE UPDATE OF status ON tasks
WHEN NEW.status = 'running' AND OLD.status IS NOT 'running' AND NEW.assignee_role_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.task_id = NEW.id AND p.subject_kind = 'task_accept' AND p.role_id = NEW.assignee_role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role nhận việc phải có polaris_checks'); END;

-- @ga:object trigger tasks_failure_disclosure_i
CREATE TRIGGER tasks_failure_disclosure_i BEFORE INSERT ON tasks
WHEN NEW.failure_disclosure = 'self_reported' AND NOT EXISTS (
  SELECT 1 FROM audit_log a JOIN actors r ON r.id = a.actor_id
  WHERE a.id = NEW.failure_report_audit_id AND a.workspace_id = NEW.workspace_id AND a.entity_id = NEW.id
    AND a.action = 'task.report_failure' AND r.kind = 'role' AND r.role_id = NEW.assignee_role_id)
BEGIN SELECT RAISE(ABORT, 'tasks: self_reported phải có audit task.report_failure do CHÍNH Role được giao ghi (gateway report_task)'); END;

-- @ga:object trigger tasks_failure_disclosure_u
CREATE TRIGGER tasks_failure_disclosure_u BEFORE UPDATE OF failure_disclosure, failure_report_audit_id, failure_reported_at ON tasks
WHEN (OLD.failure_disclosure IS NOT NULL AND (NEW.failure_disclosure IS NOT OLD.failure_disclosure
       OR NEW.failure_report_audit_id IS NOT OLD.failure_report_audit_id OR NEW.failure_reported_at IS NOT OLD.failure_reported_at))
  OR (NEW.failure_disclosure = 'self_reported' AND NOT EXISTS (
       SELECT 1 FROM audit_log a JOIN actors r ON r.id = a.actor_id
       WHERE a.id = NEW.failure_report_audit_id AND a.workspace_id = NEW.workspace_id AND a.entity_id = NEW.id
         AND a.action = 'task.report_failure' AND r.kind = 'role' AND r.role_id = NEW.assignee_role_id))
BEGIN SELECT RAISE(ABORT, 'tasks: ai phát hiện thất bại ghi MỘT lần; self_reported chỉ từ audit report_task của chính Role'); END;

-- @ga:object trigger settings_penalty_i
CREATE TRIGGER settings_penalty_i BEFORE INSERT ON settings
WHEN NEW.key LIKE 'economy.penalty.%' AND NOT (NEW.key IN ('economy.penalty.self_reported_max_bp', 'economy.penalty.concealment_min_bp', 'economy.penalty.harness_bp', 'economy.penalty.dissatisfaction_presets_bp', 'economy.penalty.self_confessed_harness_as_self_reported') AND (NEW.deleted_at IS NOT NULL OR CASE WHEN NEW.key = 'economy.penalty.dissatisfaction_presets_bp' THEN json_type(NEW.value_json) = 'array' AND json_array_length(NEW.value_json) BETWEEN 1 AND 8 AND NOT EXISTS (SELECT 1 FROM json_each(NEW.value_json) j WHERE j.type <> 'integer' OR j.value NOT BETWEEN 1 AND 10000) WHEN NEW.key = 'economy.penalty.self_confessed_harness_as_self_reported' THEN json_type(NEW.value_json) IN ('true', 'false') ELSE json_type(NEW.value_json) = 'integer' END) AND (CASE WHEN NEW.key = 'economy.penalty.self_reported_max_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.self_reported_max_bp' THEN 1000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 1000) END) > 0 AND (CASE WHEN NEW.key = 'economy.penalty.self_reported_max_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.self_reported_max_bp' THEN 1000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 1000) END) < (CASE WHEN NEW.key = 'economy.penalty.concealment_min_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.concealment_min_bp' THEN 5000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 5000) END) AND (CASE WHEN NEW.key = 'economy.penalty.concealment_min_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.concealment_min_bp' THEN 5000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 5000) END) <= (CASE WHEN NEW.key = 'economy.penalty.harness_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.harness_bp' THEN 10000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 10000) END) AND (CASE WHEN NEW.key = 'economy.penalty.harness_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.harness_bp' THEN 10000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 10000) END) = 10000)
BEGIN SELECT RAISE(ABORT, 'settings: economy.penalty.* phải là số nguyên basis point, 0 < trần tự báo < sàn che giấu ≤ 10000, harness KHOÁ = 10000; gợi ý = mảng 1–8 số 1–10000; Q-R7b = true/false'); END;

-- @ga:object trigger settings_penalty_u
CREATE TRIGGER settings_penalty_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key LIKE 'economy.penalty.%' OR OLD.key LIKE 'economy.penalty.%') AND NOT (NEW.key IN ('economy.penalty.self_reported_max_bp', 'economy.penalty.concealment_min_bp', 'economy.penalty.harness_bp', 'economy.penalty.dissatisfaction_presets_bp', 'economy.penalty.self_confessed_harness_as_self_reported') AND (NEW.deleted_at IS NOT NULL OR CASE WHEN NEW.key = 'economy.penalty.dissatisfaction_presets_bp' THEN json_type(NEW.value_json) = 'array' AND json_array_length(NEW.value_json) BETWEEN 1 AND 8 AND NOT EXISTS (SELECT 1 FROM json_each(NEW.value_json) j WHERE j.type <> 'integer' OR j.value NOT BETWEEN 1 AND 10000) WHEN NEW.key = 'economy.penalty.self_confessed_harness_as_self_reported' THEN json_type(NEW.value_json) IN ('true', 'false') ELSE json_type(NEW.value_json) = 'integer' END) AND (CASE WHEN NEW.key = 'economy.penalty.self_reported_max_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.self_reported_max_bp' THEN 1000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 1000) END) > 0 AND (CASE WHEN NEW.key = 'economy.penalty.self_reported_max_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.self_reported_max_bp' THEN 1000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 1000) END) < (CASE WHEN NEW.key = 'economy.penalty.concealment_min_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.concealment_min_bp' THEN 5000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 5000) END) AND (CASE WHEN NEW.key = 'economy.penalty.concealment_min_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.concealment_min_bp' THEN 5000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 5000) END) <= (CASE WHEN NEW.key = 'economy.penalty.harness_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.harness_bp' THEN 10000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 10000) END) AND (CASE WHEN NEW.key = 'economy.penalty.harness_bp' AND NEW.deleted_at IS NULL THEN CAST(NEW.value_json AS INTEGER) WHEN NEW.key = 'economy.penalty.harness_bp' THEN 10000 ELSE COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL AND x.id IS NOT NEW.id), 10000) END) = 10000)
BEGIN SELECT RAISE(ABORT, 'settings: economy.penalty.* phải là số nguyên basis point, 0 < trần tự báo < sàn che giấu ≤ 10000, harness KHOÁ = 10000; gợi ý = mảng 1–8 số 1–10000; Q-R7b = true/false'); END;

-- @ga:object trigger settings_rules_guard_i
CREATE TRIGGER settings_rules_guard_i BEFORE INSERT ON settings
WHEN (NEW.key LIKE 'economy.%' OR NEW.key LIKE 'polaris.%') AND NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
  OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp — settings economy.*/polaris.* chỉ owner/admin ghi'); END;

-- @ga:object trigger settings_rules_guard_u
CREATE TRIGGER settings_rules_guard_u BEFORE UPDATE OF key, value_json, deleted_at ON settings
WHEN (NEW.key LIKE 'economy.%' OR NEW.key LIKE 'polaris.%' OR OLD.key LIKE 'economy.%' OR OLD.key LIKE 'polaris.%')
  AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp — settings economy.*/polaris.* chỉ owner/admin sửa (updated_by)'); END;

-- @ga:object trigger settings_overhead_estimate_i
CREATE TRIGGER settings_overhead_estimate_i BEFORE INSERT ON settings
WHEN NEW.key = 'budget.runtime_overhead_estimate_tokens' AND NOT (
  (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 2000))
  AND (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
       OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings: budget.runtime_overhead_estimate_tokens phải là số nguyên 1–2000, chỉ owner/admin ghi'); END;

-- @ga:object trigger settings_overhead_estimate_u
CREATE TRIGGER settings_overhead_estimate_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = 'budget.runtime_overhead_estimate_tokens' OR OLD.key = 'budget.runtime_overhead_estimate_tokens') AND NOT (
  NEW.key = 'budget.runtime_overhead_estimate_tokens'
  AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 2000))
  AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'settings: budget.runtime_overhead_estimate_tokens phải là số nguyên 1–2000, chỉ owner/admin sửa (updated_by)'); END;

-- @ga:object trigger change_sets_role_scope_i
CREATE TRIGGER change_sets_role_scope_i BEFORE INSERT ON change_sets
WHEN (SELECT kind FROM actors WHERE id = NEW.proposed_by) IS 'role' AND NEW.scope = 'workspace'
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp (Nội quy = change set scope workspace)'); END;

-- @ga:object trigger change_sets_role_scope_u
CREATE TRIGGER change_sets_role_scope_u BEFORE UPDATE OF proposed_by, scope ON change_sets
WHEN (SELECT kind FROM actors WHERE id = NEW.proposed_by) IS 'role' AND NEW.scope = 'workspace'
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp (Nội quy = change set scope workspace)'); END;

-- @ga:object trigger change_set_items_role_target_i
CREATE TRIGGER change_set_items_role_target_i BEFORE INSERT ON change_set_items
WHEN (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (
  (NEW.instruction_version_id IS NOT NULL AND (SELECT i.layer FROM instruction_versions v JOIN instructions i ON i.id = v.instruction_id
     WHERE v.id = NEW.instruction_version_id) NOT IN ('style', 'position'))
  OR (NEW.dna_field_version_id IS NOT NULL AND (SELECT d.field_group FROM dna_field_versions v JOIN dna_fields f ON f.id = v.dna_field_id
     JOIN dna_field_defs d ON d.id = f.def_id WHERE v.id = NEW.dna_field_version_id) NOT IN ('style')))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

-- @ga:object trigger change_set_items_role_target_u
CREATE TRIGGER change_set_items_role_target_u BEFORE UPDATE OF change_set_id, instruction_version_id, dna_field_version_id ON change_set_items
WHEN (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (
  (NEW.instruction_version_id IS NOT NULL AND (SELECT i.layer FROM instruction_versions v JOIN instructions i ON i.id = v.instruction_id
     WHERE v.id = NEW.instruction_version_id) NOT IN ('style', 'position'))
  OR (NEW.dna_field_version_id IS NOT NULL AND (SELECT d.field_group FROM dna_field_versions v JOIN dna_fields f ON f.id = v.dna_field_id
     JOIN dna_field_defs d ON d.id = f.def_id WHERE v.id = NEW.dna_field_version_id) NOT IN ('style')))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

-- @ga:object trigger instruction_versions_role_target_i
CREATE TRIGGER instruction_versions_role_target_i BEFORE INSERT ON instruction_versions
WHEN NEW.change_set_id IS NOT NULL AND (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (SELECT layer FROM instructions WHERE id = NEW.instruction_id) NOT IN ('style', 'position')
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

-- @ga:object trigger instruction_versions_role_target_u
CREATE TRIGGER instruction_versions_role_target_u BEFORE UPDATE OF change_set_id, instruction_id ON instruction_versions
WHEN NEW.change_set_id IS NOT NULL AND (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (SELECT layer FROM instructions WHERE id = NEW.instruction_id) NOT IN ('style', 'position')
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

-- @ga:object trigger dna_field_versions_role_target_i
CREATE TRIGGER dna_field_versions_role_target_i BEFORE INSERT ON dna_field_versions
WHEN NEW.change_set_id IS NOT NULL AND (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (SELECT d.field_group FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id WHERE f.id = NEW.dna_field_id) NOT IN ('style')
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

-- @ga:object trigger dna_field_versions_role_target_u
CREATE TRIGGER dna_field_versions_role_target_u BEFORE UPDATE OF change_set_id, dna_field_id ON dna_field_versions
WHEN NEW.change_set_id IS NOT NULL AND (SELECT a.kind FROM change_sets c JOIN actors a ON a.id = c.proposed_by WHERE c.id = NEW.change_set_id) IS 'role' AND (SELECT d.field_group FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id WHERE f.id = NEW.dna_field_id) NOT IN ('style')
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp'); END;

-- @ga:object trigger avatars_library_i
CREATE TRIGGER avatars_library_i BEFORE INSERT ON avatars
WHEN NEW.source = 'library' AND NOT EXISTS (
  SELECT 1 FROM skin_assets s WHERE s.id = NEW.skin_asset_id AND s.workspace_id = NEW.workspace_id AND s.status = 'active'
    AND s.deleted_at IS NULL AND s.pack_slug = NEW.skin_pack_slug AND s.asset_code = NEW.skin_asset_code
    AND s.license = NEW.skin_license AND s.sha256 = NEW.skin_sha256 AND s.attribution IS NEW.skin_attribution)
BEGIN SELECT RAISE(ABORT, 'avatars: ảnh thư viện phải trỏ tài sản đang active cùng workspace và chép đúng gói/mã/license/sha256/ghi công'); END;

-- @ga:object trigger skin_assets_in_use_d
CREATE TRIGGER skin_assets_in_use_d BEFORE DELETE ON skin_assets
WHEN EXISTS (SELECT 1 FROM roles r JOIN avatars a ON a.id = r.avatar_id WHERE a.skin_asset_id = OLD.id AND r.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'gỡ gói skin: còn Role đang dùng ảnh này — xem v_skin_pack_usage, đổi avatar trước'); END;

-- @ga:object trigger skin_assets_in_use_u
CREATE TRIGGER skin_assets_in_use_u BEFORE UPDATE OF status, deleted_at ON skin_assets
WHEN (NEW.status = 'withdrawn' OR NEW.deleted_at IS NOT NULL)
  AND EXISTS (SELECT 1 FROM roles r JOIN avatars a ON a.id = r.avatar_id WHERE a.skin_asset_id = NEW.id AND r.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'gỡ gói skin: còn Role đang dùng ảnh này — xem v_skin_pack_usage, đổi avatar trước'); END;

-- @ga:object trigger jobs_reflection_bi
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

-- @ga:object trigger jobs_reflection_ai
CREATE TRIGGER jobs_reflection_ai AFTER INSERT ON jobs
WHEN NEW.kind = 'wound_reflection'
BEGIN
  UPDATE role_wounds SET reflection_job_id = NEW.id
   WHERE id = json_extract(NEW.payload_json, '$.role_wound_id') AND reflection_job_id IS NOT NEW.id;
END;

-- @ga:object trigger sessions_polaris_reserve_i
CREATE TRIGGER sessions_polaris_reserve_i BEFORE INSERT ON sessions
WHEN NEW.polaris_tokens_rendered IS NOT NULL AND (NEW.compiled_prompt_id IS NULL OR NEW.polaris_tokens_rendered > COALESCE((
  SELECT s.token_count FROM compiled_prompt_segments s WHERE s.compiled_prompt_id = NEW.compiled_prompt_id AND s.source_kind = 'polaris'), 0))
BEGIN SELECT RAISE(ABORT, 'Polaris: khối động đã render vượt phần dự trữ (worst-case) đã tính trong ngân sách của bản ghim'); END;

-- @ga:object trigger sessions_polaris_reserve_u
CREATE TRIGGER sessions_polaris_reserve_u BEFORE UPDATE OF polaris_tokens_rendered, compiled_prompt_id ON sessions
WHEN NEW.polaris_tokens_rendered IS NOT NULL AND NEW.compiled_prompt_id IS NOT NULL AND NEW.polaris_tokens_rendered > COALESCE((
  SELECT s.token_count FROM compiled_prompt_segments s WHERE s.compiled_prompt_id = NEW.compiled_prompt_id AND s.source_kind = 'polaris'), 0)
BEGIN SELECT RAISE(ABORT, 'Polaris: khối động đã render vượt phần dự trữ (worst-case) đã tính trong ngân sách của bản ghim'); END;

-- @ga:object trigger compiled_prompt_segments_rules
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

-- @ga:object trigger sessions_consumer_ct_i
CREATE TRIGGER sessions_consumer_ct_i BEFORE INSERT ON sessions
WHEN NEW.engine_account_id IS NOT NULL AND NEW.container_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM engine_bindings b JOIN containers c ON c.id = NEW.container_id AND c.workspace_id = b.workspace_id
  WHERE b.engine_account_id = NEW.engine_account_id AND b.deleted_at IS NULL
    AND ((b.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = b.role_id) OR (b.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'Q-R1: phiên/probe phải chạy trong container của consumer có binding với tài khoản (baseline Role = container Role)'); END;

-- @ga:object trigger sessions_consumer_ct_u
CREATE TRIGGER sessions_consumer_ct_u BEFORE UPDATE OF engine_account_id, container_id ON sessions
WHEN NEW.engine_account_id IS NOT NULL AND NEW.container_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM engine_bindings b JOIN containers c ON c.id = NEW.container_id AND c.workspace_id = b.workspace_id
  WHERE b.engine_account_id = NEW.engine_account_id AND b.deleted_at IS NULL
    AND ((b.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = b.role_id) OR (b.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'Q-R1: phiên/probe phải chạy trong container của consumer có binding với tài khoản (baseline Role = container Role)'); END;

-- @ga:object trigger probe_runs_consumer_ct_i
CREATE TRIGGER probe_runs_consumer_ct_i BEFORE INSERT ON probe_runs
WHEN NEW.engine_account_id IS NOT NULL AND NEW.container_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM engine_bindings b JOIN containers c ON c.id = NEW.container_id AND c.workspace_id = b.workspace_id
  WHERE b.engine_account_id = NEW.engine_account_id AND b.deleted_at IS NULL
    AND ((b.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = b.role_id) OR (b.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'Q-R1: phiên/probe phải chạy trong container của consumer có binding với tài khoản (baseline Role = container Role)'); END;

-- @ga:object trigger probe_runs_consumer_ct_u
CREATE TRIGGER probe_runs_consumer_ct_u BEFORE UPDATE OF engine_account_id, container_id ON probe_runs
WHEN NEW.engine_account_id IS NOT NULL AND NEW.container_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM engine_bindings b JOIN containers c ON c.id = NEW.container_id AND c.workspace_id = b.workspace_id
  WHERE b.engine_account_id = NEW.engine_account_id AND b.deleted_at IS NULL
    AND ((b.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = b.role_id) OR (b.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'Q-R1: phiên/probe phải chạy trong container của consumer có binding với tài khoản (baseline Role = container Role)'); END;

-- @ga:object trigger engine_bindings_container_u
CREATE TRIGGER engine_bindings_container_u BEFORE UPDATE OF consumer_kind, role_id, workspace_id ON engine_bindings
WHEN NOT EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = NEW.workspace_id AND c.deleted_at IS NULL
                 AND ((NEW.consumer_kind = 'role' AND c.kind = 'role' AND c.role_id = NEW.role_id)
                   OR (NEW.consumer_kind = 'system' AND c.kind = 'system')))
BEGIN SELECT RAISE(ABORT, 'engine_bindings: container của consumer phải có trước (login chạy bên trong nó)'); END;

-- @ga:object trigger sessions_wounded_u
CREATE TRIGGER sessions_wounded_u BEFORE UPDATE OF role_id, agent_kind ON sessions
WHEN NEW.agent_kind = 'role' AND NEW.role_id IS NOT NULL AND (NEW.role_id IS NOT OLD.role_id OR NEW.agent_kind IS NOT OLD.agent_kind)
 AND EXISTS (SELECT 1 FROM role_wounds w WHERE w.role_id = NEW.role_id AND w.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Role đang Trọng thương: đang ngủ, không có phiên làm việc/heartbeat'); END;

-- @ga:object trigger change_sets_polaris_u
CREATE TRIGGER change_sets_polaris_u BEFORE UPDATE OF proposed_by ON change_sets
WHEN NEW.proposed_by IS NOT OLD.proposed_by AND (SELECT kind FROM actors WHERE id = NEW.proposed_by) = 'role' AND NOT EXISTS (
  SELECT 1 FROM polaris_checks p WHERE p.change_set_id = NEW.id AND p.subject_kind = 'proposal'
    AND p.role_id = (SELECT role_id FROM actors WHERE id = NEW.proposed_by))
BEGIN SELECT RAISE(ABORT, 'Polaris: đề xuất do Role khởi xướng phải có polaris_checks'); END;

-- @ga:object trigger permission_requests_polaris_u
CREATE TRIGGER permission_requests_polaris_u BEFORE UPDATE OF role_id ON permission_requests
WHEN NEW.role_id IS NOT OLD.role_id AND NOT EXISTS (SELECT 1 FROM polaris_checks p WHERE p.permission_request_id = NEW.id AND p.role_id = NEW.role_id)
BEGIN SELECT RAISE(ABORT, 'Polaris: Role xin quyền phải có polaris_checks'); END;

-- @ga:object trigger jobs_reflection_bu
CREATE TRIGGER jobs_reflection_bu BEFORE UPDATE OF kind, payload_json, dedupe_key, created_by ON jobs
WHEN (OLD.kind = 'wound_reflection' OR NEW.kind = 'wound_reflection')
 AND (NEW.kind IS NOT OLD.kind OR NEW.payload_json IS NOT OLD.payload_json OR NEW.dedupe_key IS NOT OLD.dedupe_key
      OR NEW.created_by IS NOT OLD.created_by)
BEGIN SELECT RAISE(ABORT, 'tự xét lỗi: kind/payload/dedupe_key/created_by của job ghi một lần — chạy lại = job mới'); END;

-- @ga:object trigger engine_bindings_one_per_engine_i
CREATE TRIGGER engine_bindings_one_per_engine_i BEFORE INSERT ON engine_bindings
WHEN NEW.deleted_at IS NULL AND EXISTS (SELECT 1 FROM engine_bindings ob JOIN engine_accounts oa ON oa.id = ob.engine_account_id WHERE ob.workspace_id = NEW.workspace_id AND ob.consumer_kind = NEW.consumer_kind AND ob.role_id IS NEW.role_id AND ob.deleted_at IS NULL AND ob.id <> NEW.id AND oa.engine_slug = (SELECT na.engine_slug FROM engine_accounts na WHERE na.id = NEW.engine_account_id))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8 §A: mỗi consumer (Role hoặc AI Hệ thống) một tài khoản cho mỗi loại CLI — đổi tài khoản = đăng nhập lại trên binding đang có (thủ công, kèm audit); không thêm tài khoản thứ hai cùng loại'); END;

-- @ga:object trigger engine_bindings_one_per_engine_u
CREATE TRIGGER engine_bindings_one_per_engine_u BEFORE UPDATE OF engine_account_id, consumer_kind, role_id, workspace_id, deleted_at ON engine_bindings
WHEN NEW.deleted_at IS NULL AND EXISTS (SELECT 1 FROM engine_bindings ob JOIN engine_accounts oa ON oa.id = ob.engine_account_id WHERE ob.workspace_id = NEW.workspace_id AND ob.consumer_kind = NEW.consumer_kind AND ob.role_id IS NEW.role_id AND ob.deleted_at IS NULL AND ob.id <> NEW.id AND oa.engine_slug = (SELECT na.engine_slug FROM engine_accounts na WHERE na.id = NEW.engine_account_id))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8 §A: mỗi consumer (Role hoặc AI Hệ thống) một tài khoản cho mỗi loại CLI — đổi tài khoản = đăng nhập lại trên binding đang có (thủ công, kèm audit); không thêm tài khoản thứ hai cùng loại'); END;

-- @ga:object trigger engine_accounts_one_per_engine_u
CREATE TRIGGER engine_accounts_one_per_engine_u BEFORE UPDATE OF engine_slug ON engine_accounts
WHEN NEW.engine_slug IS NOT OLD.engine_slug AND EXISTS (SELECT 1 FROM engine_bindings nb WHERE nb.engine_account_id = NEW.id
  AND nb.deleted_at IS NULL AND EXISTS (SELECT 1 FROM engine_bindings ob JOIN engine_accounts oa ON oa.id = ob.engine_account_id WHERE ob.workspace_id = nb.workspace_id AND ob.consumer_kind = nb.consumer_kind AND ob.role_id IS nb.role_id AND ob.deleted_at IS NULL AND ob.id <> nb.id AND oa.engine_slug = NEW.engine_slug))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8 §A: mỗi consumer (Role hoặc AI Hệ thống) một tài khoản cho mỗi loại CLI — đổi tài khoản = đăng nhập lại trên binding đang có (thủ công, kèm audit); không thêm tài khoản thứ hai cùng loại'); END;

-- @ga:object trigger engine_bindings_core_agent_i
CREATE TRIGGER engine_bindings_core_agent_i BEFORE INSERT ON engine_bindings
WHEN NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL AND NEW.is_enabled = 1 AND (SELECT engine_slug FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')
BEGIN SELECT RAISE(ABORT, 'INT-20: tài khoản của AI Hệ thống phải cùng loại Core agent (setting system.core_agent_engine, thiếu thì mặc định antigravity)'); END;

-- @ga:object trigger engine_bindings_core_agent_u
CREATE TRIGGER engine_bindings_core_agent_u BEFORE UPDATE OF consumer_kind, engine_account_id, workspace_id, deleted_at, is_enabled ON engine_bindings
WHEN NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL AND NEW.is_enabled = 1 AND (SELECT engine_slug FROM engine_accounts WHERE id = NEW.engine_account_id) IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')
BEGIN SELECT RAISE(ABORT, 'INT-20: tài khoản của AI Hệ thống phải cùng loại Core agent (setting system.core_agent_engine, thiếu thì mặc định antigravity)'); END;

-- @ga:object trigger engine_accounts_core_agent_u
CREATE TRIGGER engine_accounts_core_agent_u BEFORE UPDATE OF engine_slug, workspace_id ON engine_accounts
WHEN NEW.engine_slug IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM engine_bindings b WHERE b.engine_account_id = NEW.id
  AND b.consumer_kind = 'system' AND b.deleted_at IS NULL AND b.is_enabled = 1)
BEGIN SELECT RAISE(ABORT, 'INT-20: tài khoản của AI Hệ thống phải cùng loại Core agent (setting system.core_agent_engine, thiếu thì mặc định antigravity)'); END;

-- @ga:object trigger settings_core_agent_i
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

-- @ga:object trigger settings_core_agent_u
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

-- @ga:object trigger settings_core_agent_type_change_au
CREATE TRIGGER settings_core_agent_type_change_au AFTER UPDATE OF value_json ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$')
BEGIN UPDATE engine_bindings SET is_enabled = 0, updated_at = max(COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))))), updated_by = NEW.updated_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND consumer_kind = 'system' AND deleted_at IS NULL AND is_enabled = 1
    AND (SELECT ta.engine_slug FROM engine_accounts ta WHERE ta.id = engine_account_id) IS NOT json_extract(NEW.value_json, '$'); END;

-- @ga:object trigger settings_core_agent_type_change_ai
CREATE TRIGGER settings_core_agent_type_change_ai AFTER INSERT ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL
BEGIN UPDATE engine_bindings SET is_enabled = 0, updated_at = max(COALESCE(NEW.updated_at, NEW.created_at), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), COALESCE(NEW.updated_at, NEW.created_at))), updated_by = NEW.created_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND consumer_kind = 'system' AND deleted_at IS NULL AND is_enabled = 1
    AND (SELECT ta.engine_slug FROM engine_accounts ta WHERE ta.id = engine_account_id) IS NOT json_extract(NEW.value_json, '$'); END;

-- @ga:object trigger settings_core_agent_d
CREATE TRIGGER settings_core_agent_d BEFORE DELETE ON settings
WHEN OLD.key = 'system.core_agent_engine' AND OLD.deleted_at IS NULL AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A5, CONTRACT-r8b §A): system.core_agent_engine chỉ đọc kể từ lần kiểm đăng nhập đạt đầu tiên của tài khoản Core agent (workspaces.core_agent_locked_at) — ngoại lệ duy nhất (CONTRACT-r8c §A, Q-R8a): owner đổi sang loại khác khi Core agent đang sự cố (mode recovery, is_incident 1); không xoá / đổi khoá'); END;

-- @ga:object trigger settings_core_agent_bound_i
CREATE TRIGGER settings_core_agent_bound_i BEFORE INSERT ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND NOT ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = NEW.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = NEW.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
 AND EXISTS (SELECT 1 FROM engine_bindings sb JOIN engine_accounts sa ON sa.id = sb.engine_account_id WHERE sb.workspace_id = NEW.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL AND sa.engine_slug IS NOT json_extract(NEW.value_json, '$'))
BEGIN SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8b §A): chưa khoá loại Core agent nhưng đang gắn tài khoản Core agent — Chọn loại khác: gỡ tài khoản + binding Core agent trước, rồi mới đổi system.core_agent_engine'); END;

-- @ga:object trigger settings_core_agent_bound_u
CREATE TRIGGER settings_core_agent_bound_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = 'system.core_agent_engine' OR OLD.key = 'system.core_agent_engine')
 AND NOT ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL))) AND NOT ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = NEW.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = NEW.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
 AND (EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL) OR EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = NEW.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL))
 AND (NEW.key IS NOT OLD.key OR NEW.value_json IS NOT OLD.value_json OR NEW.deleted_at IS NOT OLD.deleted_at
      OR NEW.workspace_id IS NOT OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8b §A): chưa khoá loại Core agent nhưng đang gắn tài khoản Core agent — Chọn loại khác: gỡ tài khoản + binding Core agent trước, rồi mới đổi system.core_agent_engine'); END;

-- @ga:object trigger settings_core_agent_bound_d
CREATE TRIGGER settings_core_agent_bound_d BEFORE DELETE ON settings
WHEN OLD.key = 'system.core_agent_engine' AND OLD.deleted_at IS NULL AND NOT ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL))) AND EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8b §A): chưa khoá loại Core agent nhưng đang gắn tài khoản Core agent — Chọn loại khác: gỡ tài khoản + binding Core agent trước, rồi mới đổi system.core_agent_engine'); END;

-- @ga:object trigger probe_runs_consent_i
CREATE TRIGGER probe_runs_consent_i BEFORE INSERT ON probe_runs
WHEN NOT (SELECT (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = pa.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = pa.engine_slug WHERE cn.id = pa.consent_id AND cn.workspace_id = pa.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = pa.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS pa.account_hint))) FROM engine_accounts pa WHERE pa.id = NEW.engine_account_id)
BEGIN SELECT RAISE(ABORT, 'Clause 6 / OB-05: tài khoản chưa có đồng ý điều khoản hợp lệ (chưa đồng ý, đã rút hoặc lời cảnh báo đã đổi) — không đăng nhập / probe được'); END;

-- @ga:object trigger engines_core_capable_u
CREATE TRIGGER engines_core_capable_u BEFORE UPDATE OF core_capable, adapter_status, slug ON engines
WHEN OLD.core_capable = 1 AND OLD.adapter_status = 'ready'
 AND NOT (NEW.core_capable = 1 AND NEW.adapter_status = 'ready' AND NEW.slug IS OLD.slug)
 AND EXISTS (SELECT 1 FROM workspaces cw WHERE cw.kind = 'tenant' AND COALESCE((SELECT json_extract(cs.value_json, '$') FROM settings cs WHERE cs.workspace_id = cw.id AND cs.key = 'system.core_agent_engine' AND cs.deleted_at IS NULL), 'antigravity') = OLD.slug)
BEGIN SELECT RAISE(ABORT, 'INT-20 (CNS-092): engine đang là Core agent của workspace — không hạ core_capable / adapter_status, không đổi slug, không xoá; đổi loại Core agent = migration có chủ đích (ADR-O)'); END;

-- @ga:object trigger engines_core_capable_d
CREATE TRIGGER engines_core_capable_d BEFORE DELETE ON engines
WHEN EXISTS (SELECT 1 FROM workspaces cw WHERE cw.kind = 'tenant' AND COALESCE((SELECT json_extract(cs.value_json, '$') FROM settings cs WHERE cs.workspace_id = cw.id AND cs.key = 'system.core_agent_engine' AND cs.deleted_at IS NULL), 'antigravity') = OLD.slug)
BEGIN SELECT RAISE(ABORT, 'INT-20 (CNS-092): engine đang là Core agent của workspace — không hạ core_capable / adapter_status, không đổi slug, không xoá; đổi loại Core agent = migration có chủ đích (ADR-O)'); END;

-- @ga:object trigger containers_system_last_u
CREATE TRIGGER containers_system_last_u BEFORE UPDATE OF deleted_at, kind, role_id, desired_state, workspace_id ON containers
WHEN OLD.kind = 'system' AND OLD.deleted_at IS NULL AND OLD.desired_state <> 'absent'
 AND NOT (NEW.kind = 'system' AND NEW.deleted_at IS NULL AND NEW.desired_state <> 'absent' AND NEW.workspace_id IS OLD.workspace_id)
 AND EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM containers oc WHERE oc.workspace_id = OLD.workspace_id AND oc.id <> OLD.id AND oc.kind = 'system' AND oc.deleted_at IS NULL AND oc.desired_state <> 'absent')
BEGIN SELECT RAISE(ABORT, 'INT-20 (CNS-093): không xoá / đổi kind / đặt absent cho container AI Hệ thống cuối cùng khi workspace còn binding Hệ thống sống — dựng lại container = sửa tại chỗ (image, desired_state), không xoá hàng'); END;

-- @ga:object trigger containers_system_last_d
CREATE TRIGGER containers_system_last_d BEFORE DELETE ON containers
WHEN OLD.kind = 'system' AND OLD.deleted_at IS NULL AND OLD.desired_state <> 'absent'
 AND EXISTS (SELECT 1 FROM engine_bindings sb WHERE sb.workspace_id = OLD.workspace_id AND sb.consumer_kind = 'system' AND sb.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM containers oc WHERE oc.workspace_id = OLD.workspace_id AND oc.id <> OLD.id AND oc.kind = 'system' AND oc.deleted_at IS NULL AND oc.desired_state <> 'absent')
BEGIN SELECT RAISE(ABORT, 'INT-20 (CNS-093): không xoá / đổi kind / đặt absent cho container AI Hệ thống cuối cùng khi workspace còn binding Hệ thống sống — dựng lại container = sửa tại chỗ (image, desired_state), không xoá hàng'); END;

-- @ga:object trigger roles_core_agent_ready_i
CREATE TRIGGER roles_core_agent_ready_i BEFORE INSERT ON roles
WHEN NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint))))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A4, CONTRACT-r8 §C): mọi Role mới chỉ tạo được khi tài khoản Core agent sẵn sàng — binding Hệ thống sống + bật, tài khoản active cùng loại, lần kiểm đăng nhập (login_check) mới nhất trong container AI Hệ thống đạt, có đồng ý điều khoản, không hết quota, không có sự cố hãng (OB-04 ok); Core agent sự cố ⇒ chế độ khắc phục'); END;

-- @ga:object trigger sessions_core_agent_ready_i
CREATE TRIGGER sessions_core_agent_ready_i BEFORE INSERT ON sessions
WHEN NEW.agent_kind IN ('interviewer', 'trainer', 'consolidator', 'judge')
BEGIN
  SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8 §C): phiên AI Hệ thống (Interviewer / Trainer / Consolidator / Judge) chỉ mở trên tài khoản Core agent SẴN SÀNG của workspace — không fallback sang tài khoản / loại CLI khác; Core agent sự cố ⇒ AI Hệ thống tạm dừng, việc xếp hàng chờ')
   WHERE NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint))) AND ca.id IS NEW.engine_account_id);
  SELECT RAISE(ABORT, 'CONTRACT-r8d §A (CNS-117): tác tử hệ thống chưa có model hợp lệ cho loại Core agent hiện tại — selection_state phải là valid (sau khi đổi loại = stale: áp model mặc định của loại mới hoặc chọn lại ở A5 › AI Hệ thống) rồi mới mở phiên')
   WHERE NOT EXISTS (SELECT 1 FROM system_agents sv WHERE sv.workspace_id = NEW.workspace_id AND sv.system_key = NEW.agent_kind AND sv.deleted_at IS NULL AND sv.selection_state = 'valid');
END;

-- @ga:object trigger sessions_core_agent_ready_u
CREATE TRIGGER sessions_core_agent_ready_u BEFORE UPDATE OF agent_kind, engine_account_id ON sessions
WHEN NEW.agent_kind IN ('interviewer', 'trainer', 'consolidator', 'judge') AND (NEW.agent_kind IS NOT OLD.agent_kind OR NEW.engine_account_id IS NOT OLD.engine_account_id)
BEGIN
  SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8 §C): phiên AI Hệ thống (Interviewer / Trainer / Consolidator / Judge) chỉ mở trên tài khoản Core agent SẴN SÀNG của workspace — không fallback sang tài khoản / loại CLI khác; Core agent sự cố ⇒ AI Hệ thống tạm dừng, việc xếp hàng chờ')
   WHERE NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint))) AND ca.id IS NEW.engine_account_id);
  SELECT RAISE(ABORT, 'CONTRACT-r8d §A (CNS-117): tác tử hệ thống chưa có model hợp lệ cho loại Core agent hiện tại — selection_state phải là valid (sau khi đổi loại = stale: áp model mặc định của loại mới hoặc chọn lại ở A5 › AI Hệ thống) rồi mới mở phiên')
   WHERE NOT EXISTS (SELECT 1 FROM system_agents sv WHERE sv.workspace_id = NEW.workspace_id AND sv.system_key = NEW.agent_kind AND sv.deleted_at IS NULL AND sv.selection_state = 'valid');
END;

-- @ga:object trigger engine_bindings_core_agent_last_u
CREATE TRIGGER engine_bindings_core_agent_last_u BEFORE UPDATE OF deleted_at, is_enabled, consumer_kind, role_id, engine_account_id, workspace_id ON engine_bindings
WHEN OLD.consumer_kind = 'system' AND OLD.deleted_at IS NULL AND OLD.is_enabled = 1
 AND EXISTS (SELECT 1 FROM engine_accounts oa WHERE oa.id = OLD.engine_account_id AND oa.deleted_at IS NULL AND oa.status = 'active'
             AND oa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity'))
 AND NOT (NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL AND NEW.is_enabled = 1 AND NEW.workspace_id IS OLD.workspace_id
          AND EXISTS (SELECT 1 FROM engine_accounts na WHERE na.id = NEW.engine_account_id AND na.deleted_at IS NULL AND na.status = 'active'
                      AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')))
 AND NOT EXISTS (SELECT 1 FROM engine_bindings xb JOIN engine_accounts xa ON xa.id = xb.engine_account_id AND xa.workspace_id = xb.workspace_id WHERE xb.workspace_id = OLD.workspace_id AND xb.consumer_kind = 'system' AND xb.deleted_at IS NULL AND xb.is_enabled = 1 AND xa.deleted_at IS NULL AND xa.status = 'active' AND xa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND xb.id <> OLD.id) AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A4): không gỡ / tắt / lật / vô hiệu tài khoản Core agent cuối cùng — workspace luôn còn binding Core agent sống; đổi tài khoản = đăng nhập lại trên CÙNG binding (CONTRACT-r8 §A, A5 › AI Hệ thống › Đổi tài khoản); áp từ mốc khoá (CONTRACT-r8b §A)'); END;

-- @ga:object trigger engine_bindings_core_agent_last_d
CREATE TRIGGER engine_bindings_core_agent_last_d BEFORE DELETE ON engine_bindings
WHEN OLD.consumer_kind = 'system' AND OLD.deleted_at IS NULL AND OLD.is_enabled = 1
 AND EXISTS (SELECT 1 FROM engine_accounts oa WHERE oa.id = OLD.engine_account_id AND oa.deleted_at IS NULL AND oa.status = 'active'
             AND oa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity'))
 AND NOT EXISTS (SELECT 1 FROM engine_bindings xb JOIN engine_accounts xa ON xa.id = xb.engine_account_id AND xa.workspace_id = xb.workspace_id WHERE xb.workspace_id = OLD.workspace_id AND xb.consumer_kind = 'system' AND xb.deleted_at IS NULL AND xb.is_enabled = 1 AND xa.deleted_at IS NULL AND xa.status = 'active' AND xa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND xb.id <> OLD.id) AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A4): không gỡ / tắt / lật / vô hiệu tài khoản Core agent cuối cùng — workspace luôn còn binding Core agent sống; đổi tài khoản = đăng nhập lại trên CÙNG binding (CONTRACT-r8 §A, A5 › AI Hệ thống › Đổi tài khoản); áp từ mốc khoá (CONTRACT-r8b §A)'); END;

-- @ga:object trigger engine_accounts_core_agent_last_u
CREATE TRIGGER engine_accounts_core_agent_last_u BEFORE UPDATE OF status, deleted_at, workspace_id, engine_slug ON engine_accounts
WHEN OLD.deleted_at IS NULL AND OLD.status = 'active' AND OLD.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')
 AND EXISTS (SELECT 1 FROM engine_bindings ob WHERE ob.engine_account_id = OLD.id AND ob.workspace_id = OLD.workspace_id
             AND ob.consumer_kind = 'system' AND ob.deleted_at IS NULL AND ob.is_enabled = 1)
 AND NOT (NEW.deleted_at IS NULL AND NEW.status = 'active' AND NEW.workspace_id IS OLD.workspace_id AND NEW.engine_slug IS OLD.engine_slug)
 AND NOT EXISTS (SELECT 1 FROM engine_bindings xb JOIN engine_accounts xa ON xa.id = xb.engine_account_id AND xa.workspace_id = xb.workspace_id WHERE xb.workspace_id = OLD.workspace_id AND xb.consumer_kind = 'system' AND xb.deleted_at IS NULL AND xb.is_enabled = 1 AND xa.deleted_at IS NULL AND xa.status = 'active' AND xa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND xa.id <> OLD.id) AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = OLD.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = OLD.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A4): không gỡ / tắt / lật / vô hiệu tài khoản Core agent cuối cùng — workspace luôn còn binding Core agent sống; đổi tài khoản = đăng nhập lại trên CÙNG binding (CONTRACT-r8 §A, A5 › AI Hệ thống › Đổi tài khoản); áp từ mốc khoá (CONTRACT-r8b §A)'); END;

-- @ga:object trigger probe_runs_core_lock_ai
CREATE TRIGGER probe_runs_core_lock_ai AFTER INSERT ON probe_runs
WHEN NEW.trigger = 'login_check' AND NEW.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = NEW.container_id AND lc.workspace_id = NEW.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = NEW.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)
BEGIN
  UPDATE workspaces SET core_agent_locked_at = NEW.finished_at WHERE id = NEW.workspace_id AND core_agent_locked_at IS NULL;
  UPDATE workspaces SET core_agent_locked_at = (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = NEW.workspace_id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = NEW.workspace_id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = NEW.workspace_id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1)
   WHERE id = NEW.workspace_id AND core_agent_locked_at < (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = NEW.workspace_id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = NEW.workspace_id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = NEW.workspace_id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1);
END;

-- @ga:object trigger probe_runs_core_lock_au
CREATE TRIGGER probe_runs_core_lock_au AFTER UPDATE OF status, container_id ON probe_runs
WHEN NEW.trigger = 'login_check' AND NEW.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = NEW.container_id AND lc.workspace_id = NEW.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = NEW.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)
BEGIN
  UPDATE workspaces SET core_agent_locked_at = NEW.finished_at WHERE id = NEW.workspace_id AND core_agent_locked_at IS NULL;
  UPDATE workspaces SET core_agent_locked_at = (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = NEW.workspace_id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = NEW.workspace_id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = NEW.workspace_id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1)
   WHERE id = NEW.workspace_id AND core_agent_locked_at < (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = NEW.workspace_id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = NEW.workspace_id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = NEW.workspace_id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1);
END;

-- @ga:object trigger workspaces_core_lock_u
CREATE TRIGGER workspaces_core_lock_u BEFORE UPDATE OF core_agent_locked_at ON workspaces
WHEN OLD.core_agent_locked_at IS NOT NULL AND NEW.core_agent_locked_at IS NOT OLD.core_agent_locked_at
 AND NOT (NEW.core_agent_locked_at > OLD.core_agent_locked_at AND NEW.core_agent_locked_at IS (SELECT fp.finished_at FROM probe_runs fp JOIN containers fpc ON fpc.id = fp.container_id AND fpc.workspace_id = OLD.id AND fpc.kind = 'system' JOIN engine_bindings fpb ON fpb.engine_account_id = fp.engine_account_id AND fpb.workspace_id = OLD.id AND fpb.consumer_kind = 'system' AND fpb.deleted_at IS NULL AND fpb.is_enabled = 1 JOIN engine_accounts fpa ON fpa.id = fp.engine_account_id AND fpa.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') WHERE fp.workspace_id = OLD.id AND fp.trigger = 'login_check' AND fp.status = 'ok' ORDER BY fp.display_seq LIMIT 1))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A5): workspaces.core_agent_locked_at ghi một lần, không xoá/sửa — chỉ "khoá lại" sau khi owner đổi loại Core agent lúc sự cố (CONTRACT-r8c §A, Q-R8a): = lần kiểm đăng nhập đạt đầu tiên của tài khoản Core agent mới, muộn hơn mốc cũ'); END;

-- @ga:object trigger engine_accounts_consent_identity_ai
CREATE TRIGGER engine_accounts_consent_identity_ai AFTER INSERT ON engine_accounts
WHEN NEW.account_hint IS NOT NULL AND NEW.consent_id IS NOT NULL
BEGIN UPDATE consents SET account_hint = NEW.account_hint WHERE id = NEW.consent_id AND account_hint IS NULL; END;

-- @ga:object trigger engine_accounts_consent_identity_au
CREATE TRIGGER engine_accounts_consent_identity_au AFTER UPDATE OF account_hint, consent_id ON engine_accounts
WHEN NEW.account_hint IS NOT NULL AND NEW.consent_id IS NOT NULL
BEGIN UPDATE consents SET account_hint = NEW.account_hint WHERE id = NEW.consent_id AND account_hint IS NULL; END;

-- @ga:object trigger notifications_core_incident_i
CREATE TRIGGER notifications_core_incident_i BEFORE INSERT ON notifications
WHEN NEW.kind = 'core_agent_incident' AND NOT ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8b §B/§C: notifications core_agent_incident chỉ phát khi v_core_agent_status.is_incident = 1 — đang đăng nhập lại / đổi danh tính (chờ đồng ý lại) / chưa khoá loại không phải sự cố: không chuông, không Telegram'); END;

-- @ga:object trigger notifications_core_incident_u
CREATE TRIGGER notifications_core_incident_u BEFORE UPDATE OF kind, workspace_id ON notifications
WHEN NEW.kind = 'core_agent_incident' AND NOT ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8b §B/§C: notifications core_agent_incident chỉ phát khi v_core_agent_status.is_incident = 1 — đang đăng nhập lại / đổi danh tính (chờ đồng ý lại) / chưa khoá loại không phải sự cố: không chuông, không Telegram'); END;

-- @ga:object trigger events_failover_i
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

-- @ga:object trigger events_core_type_changed_i
CREATE TRIGGER events_core_type_changed_i BEFORE INSERT ON events
WHEN NEW.kind = 'core_agent.type_changed'
 AND (NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR json_extract(NEW.detail_json, '$.to') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity'))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8c §A: events core_agent.type_changed — actor phải là owner và "to" = loại Core agent hiện hành (ghi sau khi đổi ST-0017)'); END;

-- @ga:object trigger settings_core_agent_sa_stale_au
CREATE TRIGGER settings_core_agent_sa_stale_au AFTER UPDATE OF value_json ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$')
BEGIN UPDATE system_agents SET selection_state = 'stale', selection_checked_at = COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))),
  updated_at = max(COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))))), updated_by = NEW.updated_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND deleted_at IS NULL; END;

-- @ga:object trigger settings_core_agent_sa_stale_ai
CREATE TRIGGER settings_core_agent_sa_stale_ai AFTER INSERT ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT 'antigravity'
BEGIN UPDATE system_agents SET selection_state = 'stale', selection_checked_at = COALESCE(NEW.updated_at, NEW.created_at),
  updated_at = max(COALESCE(NEW.updated_at, NEW.created_at), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), COALESCE(NEW.updated_at, NEW.created_at))), updated_by = NEW.created_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND deleted_at IS NULL; END;

-- @ga:object trigger employee_cards_core_agent_ready_i
CREATE TRIGGER employee_cards_core_agent_ready_i BEFORE INSERT ON employee_cards
WHEN NEW.status IN ('issued', 'suspended') AND ((SELECT rw.core_agent_locked_at FROM workspaces rw WHERE rw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8d §C (CNS-120): Core agent đang ở chế độ khắc phục (mode recovery) — không cấp thẻ mới (thẻ vào issued / suspended từ trạng thái khác, hoặc INSERT issued / suspended); Tạm ngưng / Tiếp tục thẻ đang có (issued ↔ suspended) vẫn được'); END;

-- @ga:object trigger employee_cards_core_agent_ready_u
CREATE TRIGGER employee_cards_core_agent_ready_u BEFORE UPDATE OF status ON employee_cards
WHEN NEW.status IN ('issued', 'suspended') AND OLD.status NOT IN ('issued', 'suspended') AND ((SELECT rw.core_agent_locked_at FROM workspaces rw WHERE rw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND EXISTS (SELECT 1 FROM engine_installs er WHERE er.workspace_id = cb.workspace_id AND er.engine_slug = ca.engine_slug AND er.deleted_at IS NULL AND er.install_state = 'installed' AND er.tool_restriction_version = er.installed_version) AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8d §C (CNS-120): Core agent đang ở chế độ khắc phục (mode recovery) — không cấp thẻ mới (thẻ vào issued / suspended từ trạng thái khác, hoặc INSERT issued / suspended); Tạm ngưng / Tiếp tục thẻ đang có (issued ↔ suspended) vẫn được'); END;

-- @ga:object trigger telegram_allowlist_owner_u
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

-- @ga:object trigger telegram_allowlist_owner_d
CREATE TRIGGER telegram_allowlist_owner_d BEFORE DELETE ON telegram_allowlist
WHEN OLD.is_owner = 1 AND app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8e §A: không xoá cứng hàng chủ sở hữu của allowlist Telegram — chỉ purge Role (ngữ cảnh bảo trì app_maint())'); END;

-- @ga:object trigger telegram_bots_owner_u
CREATE TRIGGER telegram_bots_owner_u BEFORE UPDATE OF deleted_at ON telegram_bots
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'v2.2.13 (review bảo mật, HIGH): chỉ owner của workspace khôi phục được bot Telegram đã xoá mềm')
   WHERE NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner');
  SELECT RAISE(ABORT, 'CONTRACT-r8e §A: khôi phục bot Telegram đã xoá mềm phải có hàng chủ sở hữu active trước (bất biến: bot còn sống luôn có ≥ 1 hàng chủ sở hữu active)')
   WHERE NOT EXISTS (SELECT 1 FROM telegram_allowlist ra WHERE ra.bot_id = OLD.id AND ra.is_owner = 1 AND ra.status = 'active' AND ra.deleted_at IS NULL);
END;

-- @ga:object trigger telegram_allowlist_owner_new_i
CREATE TRIGGER telegram_allowlist_owner_new_i BEFORE INSERT ON telegram_allowlist
WHEN NEW.is_owner = 1 AND NEW.status = 'active' AND NEW.deleted_at IS NULL AND app_maint() = 0
 AND NOT (NEW.added_via = 'capture' AND (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
          OR (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
              AND NOT EXISTS (SELECT 1 FROM telegram_allowlist na WHERE na.bot_id = NEW.bot_id AND na.is_owner = 1 AND na.status = 'active' AND na.deleted_at IS NULL))))
BEGIN SELECT RAISE(ABORT, 'v2.2.13 (review bảo mật, HIGH): hàng allowlist chỉ thành chủ sở hữu active khi owner của workspace thêm qua capture (user ID đã xác minh), hoặc bot chưa có hàng chủ sở hữu active nào (bootstrap qua capture — v2.3.5: chỉ actor system của chính workspace) — admin, tác tử, nhập tay không tạo được chủ sở hữu'); END;

-- @ga:object trigger telegram_allowlist_owner_new_u
CREATE TRIGGER telegram_allowlist_owner_new_u BEFORE UPDATE OF is_owner, status, deleted_at, added_via, bot_id ON telegram_allowlist
WHEN NEW.is_owner = 1 AND NEW.status = 'active' AND NEW.deleted_at IS NULL AND NOT (OLD.is_owner = 1 AND OLD.status = 'active' AND OLD.deleted_at IS NULL) AND app_maint() = 0
 AND NOT (NEW.added_via = 'capture' AND (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
          OR (EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
              AND NOT EXISTS (SELECT 1 FROM telegram_allowlist na WHERE na.bot_id = NEW.bot_id AND na.id <> OLD.id AND na.is_owner = 1 AND na.status = 'active' AND na.deleted_at IS NULL))))
BEGIN SELECT RAISE(ABORT, 'v2.2.13 (review bảo mật, HIGH): hàng allowlist chỉ thành chủ sở hữu active khi owner của workspace thêm qua capture (user ID đã xác minh), hoặc bot chưa có hàng chủ sở hữu active nào (bootstrap qua capture — v2.3.5: chỉ actor system của chính workspace) — admin, tác tử, nhập tay không tạo được chủ sở hữu'); END;

-- @ga:object trigger engine_accounts_login_started_ai
CREATE TRIGGER engine_accounts_login_started_ai AFTER INSERT ON engine_accounts
WHEN NEW.login_status = 'in_progress' OR NEW.login_started_at IS NOT NULL
BEGIN UPDATE engine_accounts SET login_started_at = CASE WHEN NEW.login_status = 'in_progress' THEN strftime('%Y-%m-%dT%H:%M:%fZ', app_now()) END, updated_by = COALESCE(app_actor(), updated_by), updated_at = max(strftime('%Y-%m-%dT%H:%M:%fZ', app_now()), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), strftime('%Y-%m-%dT%H:%M:%fZ', app_now()))) WHERE id = NEW.id; END;

-- @ga:object trigger engine_accounts_login_started_au
CREATE TRIGGER engine_accounts_login_started_au AFTER UPDATE OF login_status ON engine_accounts
WHEN NEW.login_status = 'in_progress' OR OLD.login_status = 'in_progress'
BEGIN UPDATE engine_accounts SET login_started_at = CASE WHEN NEW.login_status = 'in_progress' THEN strftime('%Y-%m-%dT%H:%M:%fZ', app_now()) END, updated_by = COALESCE(app_actor(), updated_by), updated_at = max(strftime('%Y-%m-%dT%H:%M:%fZ', app_now()), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), strftime('%Y-%m-%dT%H:%M:%fZ', app_now()))) WHERE id = NEW.id; END;

-- @ga:object trigger settings_attachment_max_i
CREATE TRIGGER settings_attachment_max_i BEFORE INSERT ON settings
WHEN NEW.key = 'chat.attachment_max_bytes' AND NOT (
  (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 104857600))
  AND (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings: chat.attachment_max_bytes phải là số nguyên byte 1–104857600, chỉ owner/admin ghi'); END;

-- @ga:object trigger settings_attachment_max_u
CREATE TRIGGER settings_attachment_max_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = 'chat.attachment_max_bytes' OR OLD.key = 'chat.attachment_max_bytes') AND NOT (
  NEW.key = 'chat.attachment_max_bytes'
  AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 104857600))
  AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'settings: chat.attachment_max_bytes phải là số nguyên byte 1–104857600, chỉ owner/admin sửa (updated_by)'); END;

-- @ga:object trigger message_attachments_max_bytes_i
CREATE TRIGGER message_attachments_max_bytes_i BEFORE INSERT ON message_attachments
WHEN NEW.scan_status = 'clean' AND NEW.size_bytes > COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'chat.attachment_max_bytes' AND deleted_at IS NULL), 26214400)
BEGIN SELECT RAISE(ABORT, 'chat: tệp vượt trần chat.attachment_max_bytes (mặc định 25 MB) — tệp được nhận (clean) không vượt trần; vượt thì rejected + reject_reason "> 25 MB"'); END;

-- @ga:object trigger message_attachments_max_bytes_u
CREATE TRIGGER message_attachments_max_bytes_u BEFORE UPDATE OF scan_status, size_bytes, workspace_id ON message_attachments
WHEN NEW.scan_status = 'clean' AND NEW.size_bytes > COALESCE((SELECT CAST(value_json AS INTEGER) FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'chat.attachment_max_bytes' AND deleted_at IS NULL), 26214400)
BEGIN SELECT RAISE(ABORT, 'chat: tệp vượt trần chat.attachment_max_bytes (mặc định 25 MB) — tệp được nhận (clean) không vượt trần; vượt thì rejected + reject_reason "> 25 MB"'); END;

-- @ga:object trigger skin_assets_writer_i
CREATE TRIGGER skin_assets_writer_i BEFORE INSERT ON skin_assets
WHEN NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'Kho nhân vật (v2.3.0): chỉ owner/admin (hoặc actor system lúc cài gói khi tạo workspace) thêm nhân vật / cài gói skin'); END;

-- @ga:object trigger skin_assets_writer_u
CREATE TRIGGER skin_assets_writer_u BEFORE UPDATE ON skin_assets
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'Kho nhân vật (v2.3.0): chỉ owner/admin sửa danh mục nhân vật (bật / tắt, khôi phục, rút, đổi mã / tham số) — updated_by phải là owner/admin đang hoạt động của workspace'); END;

-- @ga:object trigger avatars_library_enabled_i
CREATE TRIGGER avatars_library_enabled_i BEFORE INSERT ON avatars
WHEN NEW.source = 'library' AND EXISTS (SELECT 1 FROM skin_assets s WHERE s.id = NEW.skin_asset_id AND s.is_enabled = 0)
BEGIN SELECT RAISE(ABORT, 'Kho nhân vật (v2.3.0): nhân vật đã tắt trong Kho — không gán mới được; Role đang dùng giữ nguyên ảnh'); END;

-- @ga:object trigger roles_avatar_i
CREATE TRIGGER roles_avatar_i BEFORE INSERT ON roles
WHEN NEW.avatar_id IS NOT NULL AND (SELECT oa.role_id FROM avatars oa WHERE oa.id = NEW.avatar_id) IS NOT NEW.id
BEGIN SELECT RAISE(ABORT, 'roles.avatar_id (v2.3.0): avatar hiện hành phải là bản ghi AV- của chính Role (gán = tạo AV- mới rồi trỏ; khôi phục = AV cũ của chính Role)'); END;

-- @ga:object trigger roles_avatar_u
CREATE TRIGGER roles_avatar_u BEFORE UPDATE OF avatar_id ON roles
WHEN NEW.avatar_id IS NOT NULL AND NEW.avatar_id IS NOT OLD.avatar_id
BEGIN
  SELECT RAISE(ABORT, 'roles.avatar_id (v2.3.0): avatar hiện hành phải là bản ghi AV- của chính Role (gán = tạo AV- mới rồi trỏ; khôi phục = AV cũ của chính Role)') WHERE NEW.avatar_id IS NOT NULL AND (SELECT oa.role_id FROM avatars oa WHERE oa.id = NEW.avatar_id) IS NOT NEW.id;
  SELECT RAISE(ABORT, 'Kho nhân vật (v2.3.0): không gán / khôi phục ảnh thư viện của nhân vật đã tắt trong Kho, đã rút hoặc đã gỡ gói — Role đang dùng giữ nguyên ảnh') WHERE NEW.avatar_id IS NOT NULL AND EXISTS (SELECT 1 FROM avatars la WHERE la.id = NEW.avatar_id AND la.source = 'library' AND NOT EXISTS (SELECT 1 FROM skin_assets ls WHERE ls.id = la.skin_asset_id AND ls.deleted_at IS NULL AND ls.status = 'active' AND ls.is_enabled = 1));
END;

-- @ga:object trigger settings_avatar_i
CREATE TRIGGER settings_avatar_i BEFORE INSERT ON settings
WHEN NEW.key IN ('avatar.transient_seconds', 'avatar.idle_after_minutes', 'ui.avatar_motion') AND NOT (COALESCE(CASE NEW.key WHEN 'avatar.transient_seconds' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 600) WHEN 'avatar.idle_after_minutes' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 1440) WHEN 'ui.avatar_motion' THEN (json_extract(NEW.value_json, '$') IN ('full', 'subtle', 'off')) END, 0) AND (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = app_actor() AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.0): avatar.transient_seconds = số nguyên giây 1–600 (mặc định 20) · avatar.idle_after_minutes = số nguyên phút 1–1440 (mặc định 10) · ui.avatar_motion = "full" | "subtle" | "off" (mặc định "full") — chỉ owner/admin ghi'); END;

-- @ga:object trigger settings_avatar_u
CREATE TRIGGER settings_avatar_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key IN ('avatar.transient_seconds', 'avatar.idle_after_minutes', 'ui.avatar_motion') OR OLD.key IN ('avatar.transient_seconds', 'avatar.idle_after_minutes', 'ui.avatar_motion')) AND NOT (NEW.key IS OLD.key AND COALESCE(CASE NEW.key WHEN 'avatar.transient_seconds' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 600) WHEN 'avatar.idle_after_minutes' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 1440) WHEN 'ui.avatar_motion' THEN (json_extract(NEW.value_json, '$') IN ('full', 'subtle', 'off')) END, 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.0): avatar.transient_seconds = số nguyên giây 1–600 (mặc định 20) · avatar.idle_after_minutes = số nguyên phút 1–1440 (mặc định 10) · ui.avatar_motion = "full" | "subtle" | "off" (mặc định "full") — chỉ owner/admin ghi'); END;

-- @ga:object trigger workspaces_restored_u
CREATE TRIGGER workspaces_restored_u BEFORE UPDATE OF restored_at ON workspaces
WHEN (OLD.restored_at IS NOT NULL AND (NEW.restored_at IS NULL OR NEW.restored_at < OLD.restored_at)) OR NEW.restored_at > strftime('%Y-%m-%dT%H:%M:%fZ', app_now())
BEGIN SELECT RAISE(ABORT, 'workspaces.restored_at (v2.3.2): mốc khôi phục chỉ tiến và không ở tương lai — không xoá, không lùi, không vượt app_now() (danh sách "cần đăng nhập lại sau khôi phục" v_relogin_required không bị ẩn, cũng không kẹt mãi)'); END;

-- @ga:object trigger workspaces_restored_i
CREATE TRIGGER workspaces_restored_i BEFORE INSERT ON workspaces
WHEN NEW.restored_at > strftime('%Y-%m-%dT%H:%M:%fZ', app_now())
BEGIN SELECT RAISE(ABORT, 'workspaces.restored_at (v2.3.2): mốc khôi phục chỉ tiến và không ở tương lai — không xoá, không lùi, không vượt app_now() (danh sách "cần đăng nhập lại sau khôi phục" v_relogin_required không bị ẩn, cũng không kẹt mãi)'); END;

-- @ga:object trigger settings_remote_anchor_i
CREATE TRIGGER settings_remote_anchor_i BEFORE INSERT ON settings
WHEN NEW.key = 'backup.remote_anchor'
BEGIN
  SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace được ghi / sửa / xoá mềm (người ghi = app_actor()); xoá cứng chỉ trong bảo trì') WHERE NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor = {"url":"https://<host[:cổng]>[/<path>]","secret_id":"<secret>"} dạng chuẩn, đúng 2 khoá — authority TRÙNG allowed_host của secret cùng workspace, còn sống, active; URL chỉ ASCII [A-Za-z0-9._~:/-] (không NUL, không escape \u) — neo audit ngoài máy chỉ qua HTTPS + token gắn host; đổi host = nhập token mới; SSH chưa hỗ trợ ở MVP') WHERE NOT EXISTS (SELECT 1 FROM secrets rs WHERE rs.id = json_extract(NEW.value_json, '$.secret_id') AND rs.workspace_id = NEW.workspace_id AND rs.deleted_at IS NULL AND rs.status = 'active' AND substr(json_extract(NEW.value_json, '$.url'), 1, 8) = 'https://' AND rs.allowed_host = substr(substr(json_extract(NEW.value_json, '$.url'), 9), 1, instr(substr(json_extract(NEW.value_json, '$.url'), 9) || '/', '/') - 1) AND length(CAST(json_extract(NEW.value_json, '$.url') AS BLOB)) = length(json_extract(NEW.value_json, '$.url')) AND json_extract(NEW.value_json, '$.url') NOT GLOB '*[^A-Za-z0-9._~:/-]*' AND NEW.value_json NOT GLOB '*\u*' AND NEW.value_json = json(NEW.value_json) AND (SELECT count(*) FROM json_each(NEW.value_json)) = 2);
END;

-- @ga:object trigger settings_remote_anchor_u
CREATE TRIGGER settings_remote_anchor_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN NEW.key = 'backup.remote_anchor' OR OLD.key = 'backup.remote_anchor'
BEGIN
  SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace được ghi / sửa / xoá mềm (người ghi = app_actor()); xoá cứng chỉ trong bảo trì') WHERE NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor = {"url":"https://<host[:cổng]>[/<path>]","secret_id":"<secret>"} dạng chuẩn, đúng 2 khoá — authority TRÙNG allowed_host của secret cùng workspace, còn sống, active; URL chỉ ASCII [A-Za-z0-9._~:/-] (không NUL, không escape \u) — neo audit ngoài máy chỉ qua HTTPS + token gắn host; đổi host = nhập token mới; SSH chưa hỗ trợ ở MVP') WHERE NOT (NEW.key IS OLD.key AND (NEW.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM secrets rs WHERE rs.id = json_extract(NEW.value_json, '$.secret_id') AND rs.workspace_id = NEW.workspace_id AND rs.deleted_at IS NULL AND rs.status = 'active' AND substr(json_extract(NEW.value_json, '$.url'), 1, 8) = 'https://' AND rs.allowed_host = substr(substr(json_extract(NEW.value_json, '$.url'), 9), 1, instr(substr(json_extract(NEW.value_json, '$.url'), 9) || '/', '/') - 1) AND length(CAST(json_extract(NEW.value_json, '$.url') AS BLOB)) = length(json_extract(NEW.value_json, '$.url')) AND json_extract(NEW.value_json, '$.url') NOT GLOB '*[^A-Za-z0-9._~:/-]*' AND NEW.value_json NOT GLOB '*\u*' AND NEW.value_json = json(NEW.value_json) AND (SELECT count(*) FROM json_each(NEW.value_json)) = 2)));
END;

-- @ga:object trigger settings_remote_anchor_d
CREATE TRIGGER settings_remote_anchor_d BEFORE DELETE ON settings
WHEN OLD.key = 'backup.remote_anchor' AND app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.3): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace được ghi / sửa / xoá mềm (người ghi = app_actor()); xoá cứng chỉ trong bảo trì'); END;

-- @ga:object trigger secrets_writer_i
CREATE TRIGGER secrets_writer_i BEFORE INSERT ON secrets
WHEN NOT (CASE WHEN NEW.kind = 'anchor_remote_token' THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
               WHEN NEW.kind = 'telegram_bot_token' THEN (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
               ELSE (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')) END)
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.3): chỉ owner / admin còn là thành viên hoặc actor system của workspace tạo / thay bí mật; kind anchor_remote_token (token gắn đích) CHỈ OWNER; telegram_bot_token chỉ owner hoặc actor system — người ghi = app_actor(); bảo trì (xoay KEK) miễn'); END;

-- @ga:object trigger secrets_writer_u
CREATE TRIGGER secrets_writer_u BEFORE UPDATE OF kind, label, ciphertext, nonce, wrapped_dek, dek_nonce, kek_id, alg, last4, fingerprint, status, rotated_from_id, allowed_host, workspace_id, deleted_at ON secrets
WHEN app_maint() = 0 AND NOT (CASE WHEN 'anchor_remote_token' IN (OLD.kind, NEW.kind) THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
                                   WHEN 'telegram_bot_token' IN (OLD.kind, NEW.kind) THEN (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
                                   ELSE (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')) END)
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.3): chỉ owner / admin còn là thành viên hoặc actor system của workspace tạo / thay bí mật; kind anchor_remote_token (token gắn đích) CHỈ OWNER; telegram_bot_token chỉ owner hoặc actor system — người ghi = app_actor(); bảo trì (xoay KEK) miễn'); END;

-- @ga:object trigger secrets_kind_u
CREATE TRIGGER secrets_kind_u BEFORE UPDATE OF kind ON secrets
WHEN app_maint() = 0 AND NEW.kind IS NOT OLD.kind
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.4): kind bất biến ngoài bảo trì — đổi loại bí mật = tạo secret mới (đổi kind từng là lối hạ cấp token chỉ owner sang nhánh admin)'); END;

-- @ga:object trigger secrets_allowed_host_u
CREATE TRIGGER secrets_allowed_host_u BEFORE UPDATE OF allowed_host ON secrets
WHEN NEW.allowed_host IS NOT OLD.allowed_host
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.2): allowed_host ghi một lần — đổi host đích = nhập token mới (secret mới)'); END;

-- @ga:object trigger engine_installs_writer_i
CREATE TRIGGER engine_installs_writer_i BEFORE INSERT ON engine_installs
WHEN NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_installs (v2.3.2): trạng thái cài CLI chỉ actor system của workspace (app theo ga-engine-install status) ghi — owner / admin / tác tử khác không ghi tay (v2.3.3: người ghi = app_actor())'); END;

-- @ga:object trigger engine_installs_writer_u
CREATE TRIGGER engine_installs_writer_u BEFORE UPDATE ON engine_installs
WHEN NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_installs (v2.3.2): trạng thái cài CLI chỉ actor system của workspace (app theo ga-engine-install status) ghi — owner / admin / tác tử khác không ghi tay (v2.3.3: người ghi = app_actor())'); END;

-- @ga:object trigger engine_accounts_writer_i
CREATE TRIGGER engine_accounts_writer_i BEFORE INSERT ON engine_accounts
BEGIN
  SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())') WHERE NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): trạng thái kiểm đăng nhập / quota / overhead / sự cố hãng chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định') WHERE NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND (COALESCE(NEW.account_hint, NEW.plan_label, NEW.plan_confidence, NEW.login_checked_at, NEW.cli_version_current, NEW.cli_version_latest, NEW.quota_remaining_pct, NEW.quota_reset_at, NEW.quota_scanned_at, NEW.outage_since, NEW.last_probe_run_id, NEW.runtime_overhead_tokens, NEW.overhead_bare_session_id, NEW.overhead_shell_session_id, NEW.overhead_measured_at) IS NOT NULL OR NEW.quota_state <> 'unknown' OR NEW.login_status NOT IN ('unknown', 'in_progress'));
END;

-- @ga:object trigger engine_accounts_writer_u
CREATE TRIGGER engine_accounts_writer_u BEFORE UPDATE OF engine_slug, label, auth_method, secret_id, auth_volume, cli_version_pinned, consent_id, status, deleted_at ON engine_accounts
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())'); END;

-- @ga:object trigger engine_accounts_sys_u
CREATE TRIGGER engine_accounts_sys_u BEFORE UPDATE OF account_hint, plan_label, plan_confidence, login_checked_at, cli_version_current, cli_version_latest, quota_remaining_pct, quota_reset_at, quota_scanned_at, outage_since, last_probe_run_id, runtime_overhead_tokens, overhead_bare_session_id, overhead_shell_session_id, overhead_measured_at, quota_state ON engine_accounts
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): trạng thái kiểm đăng nhập / quota / overhead / sự cố hãng chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định'); END;

-- @ga:object trigger engine_accounts_login_status_u
CREATE TRIGGER engine_accounts_login_status_u BEFORE UPDATE OF login_status ON engine_accounts
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND NOT (NEW.login_status = 'in_progress' AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
BEGIN SELECT RAISE(ABORT, 'engine_accounts (v2.3.3): login_status là kết quả kiểm đăng nhập — chỉ actor system ghi; owner / admin chỉ được đặt in_progress (bấm "Đổi tài khoản / Đăng nhập lại")'); END;

-- @ga:object trigger engine_bindings_writer_i
CREATE TRIGGER engine_bindings_writer_i BEFORE INSERT ON engine_bindings
BEGIN
  SELECT RAISE(ABORT, 'engine_bindings (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())') WHERE NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'engine_bindings (v2.3.3): kết quả kiểm model (selection_state / selection_checked_at) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định') WHERE NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND (NEW.selection_state <> 'unknown' OR NEW.selection_checked_at IS NOT NULL);
END;

-- @ga:object trigger engine_bindings_writer_u
CREATE TRIGGER engine_bindings_writer_u BEFORE UPDATE OF consumer_kind, role_id, engine_account_id, priority, model_key, effort, is_enabled, deleted_at ON engine_bindings
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'engine_bindings (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())'); END;

-- @ga:object trigger engine_bindings_sys_u
CREATE TRIGGER engine_bindings_sys_u BEFORE UPDATE OF selection_state, selection_checked_at ON engine_bindings
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_bindings (v2.3.3): kết quả kiểm model (selection_state / selection_checked_at) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định'); END;

-- @ga:object trigger telegram_bots_writer_i
CREATE TRIGGER telegram_bots_writer_i BEFORE INSERT ON telegram_bots
BEGIN
  SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): giữ / định tuyến credential — chỉ owner còn là thành viên (admin cũng không) hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())') WHERE NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): kết quả getMe / long-poll (bot_tg_id, getme_ok_at, poll_offset, last_update_at, error, status ≠ pending) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định') WHERE NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND (COALESCE(NEW.bot_tg_id, NEW.getme_ok_at, NEW.last_update_at, NEW.error) IS NOT NULL OR NEW.poll_offset <> 0 OR NEW.status <> 'pending');
END;

-- @ga:object trigger telegram_bots_writer_u
CREATE TRIGGER telegram_bots_writer_u BEFORE UPDATE OF role_id, bot_username, secret_id, token_last4, deleted_at ON telegram_bots
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): giữ / định tuyến credential — chỉ owner còn là thành viên (admin cũng không) hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())'); END;

-- @ga:object trigger telegram_bots_sys_u
CREATE TRIGGER telegram_bots_sys_u BEFORE UPDATE OF bot_tg_id, getme_ok_at, poll_offset, last_update_at, error ON telegram_bots
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): kết quả getMe / long-poll (bot_tg_id, getme_ok_at, poll_offset, last_update_at, error) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định'); END;

-- @ga:object trigger telegram_bots_status_u
CREATE TRIGGER telegram_bots_status_u BEFORE UPDATE OF status ON telegram_bots
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND NOT (NEW.status IN ('pending', 'paused', 'revoked') AND EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = app_actor() AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner'))
BEGIN SELECT RAISE(ABORT, 'telegram_bots (v2.3.3): status active / error là kết quả runtime (getMe, long-poll) — chỉ actor system ghi; owner chỉ đặt pending / paused / revoked'); END;

-- @ga:object trigger tools_writer_i
CREATE TRIGGER tools_writer_i BEFORE INSERT ON tools
BEGIN
  SELECT RAISE(ABORT, 'tools (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())') WHERE NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'tools (v2.3.3): nguồn gốc built-in và số token định nghĩa (is_builtin, builtin_key, definition_tokens, tokenizer) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định') WHERE NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system') AND (NEW.is_builtin <> 0 OR COALESCE(NEW.builtin_key, NEW.tokenizer) IS NOT NULL OR NEW.definition_tokens <> 0);
END;

-- @ga:object trigger tools_writer_u
CREATE TRIGGER tools_writer_u BEFORE UPDATE OF slug, name, kind, description, risk_level, default_mode, allowed_agents, config_json, secret_id, status, deleted_at ON tools
WHEN app_maint() = 0 AND NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = app_actor() AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'tools (v2.3.3): giữ / định tuyến credential — chỉ owner / admin còn là thành viên hoặc actor system được tạo / sửa cấu hình (người ghi = app_actor())'); END;

-- @ga:object trigger tools_sys_u
CREATE TRIGGER tools_sys_u BEFORE UPDATE OF is_builtin, builtin_key, definition_tokens, tokenizer ON tools
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = app_actor() AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'tools (v2.3.3): nguồn gốc built-in và số token định nghĩa (is_builtin, builtin_key, definition_tokens, tokenizer) chỉ actor system của workspace ghi (kết quả runtime / nguồn gốc hệ thống) — người khác tạo hàng thì để mặc định'); END;

-- @ga:object trigger change_sets_proposer_i
CREATE TRIGGER change_sets_proposer_i BEFORE INSERT ON change_sets
WHEN app_maint() = 0 AND NOT COALESCE(NEW.proposed_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'change_sets (v2.3.3): proposed_by phải = app_actor() — người đề xuất là người ghi change set (Role qua gateway, tác tử hệ thống, owner)'); END;

-- @ga:object trigger change_sets_proposer_u
CREATE TRIGGER change_sets_proposer_u BEFORE UPDATE OF proposed_by ON change_sets
WHEN app_maint() = 0 AND NEW.proposed_by IS NOT OLD.proposed_by AND NOT COALESCE(NEW.proposed_by = app_actor(), 0)
BEGIN SELECT RAISE(ABORT, 'change_sets (v2.3.3): proposed_by phải = app_actor() — người đề xuất là người ghi change set (Role qua gateway, tác tử hệ thống, owner)'); END;

-- @ga:object trigger workspaces_notnull_i
CREATE TRIGGER workspaces_notnull_i BEFORE INSERT ON workspaces
WHEN NEW.locale IS NULL OR NEW.timezone IS NULL OR NEW.currency_code IS NULL OR NEW.currency_symbol IS NULL OR NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): workspaces — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger workspaces_notnull_u
CREATE TRIGGER workspaces_notnull_u BEFORE UPDATE OF locale, timezone, currency_code, currency_symbol, status, created_at ON workspaces
WHEN NEW.locale IS NULL OR NEW.timezone IS NULL OR NEW.currency_code IS NULL OR NEW.currency_symbol IS NULL OR NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): workspaces — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger users_notnull_i
CREATE TRIGGER users_notnull_i BEFORE INSERT ON users
WHEN NEW.must_change_password IS NULL OR NEW.failed_login_count IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): users — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger users_notnull_u
CREATE TRIGGER users_notnull_u BEFORE UPDATE OF must_change_password, failed_login_count, created_at ON users
WHEN NEW.must_change_password IS NULL OR NEW.failed_login_count IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): users — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger workspace_members_notnull_i
CREATE TRIGGER workspace_members_notnull_i BEFORE INSERT ON workspace_members
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): workspace_members — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger workspace_members_notnull_u
CREATE TRIGGER workspace_members_notnull_u BEFORE UPDATE OF created_at ON workspace_members
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): workspace_members — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger auth_sessions_notnull_i
CREATE TRIGGER auth_sessions_notnull_i BEFORE INSERT ON auth_sessions
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): auth_sessions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger auth_sessions_notnull_u
CREATE TRIGGER auth_sessions_notnull_u BEFORE UPDATE OF created_at ON auth_sessions
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): auth_sessions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger actors_notnull_i
CREATE TRIGGER actors_notnull_i BEFORE INSERT ON actors
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): actors — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger actors_notnull_u
CREATE TRIGGER actors_notnull_u BEFORE UPDATE OF created_at ON actors
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): actors — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger id_counters_notnull_i
CREATE TRIGGER id_counters_notnull_i BEFORE INSERT ON id_counters
WHEN NEW.last_seq IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): id_counters — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger id_counters_notnull_u
CREATE TRIGGER id_counters_notnull_u BEFORE UPDATE OF last_seq ON id_counters
WHEN NEW.last_seq IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): id_counters — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger id_aliases_notnull_i
CREATE TRIGGER id_aliases_notnull_i BEFORE INSERT ON id_aliases
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): id_aliases — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger id_aliases_notnull_u
CREATE TRIGGER id_aliases_notnull_u BEFORE UPDATE OF created_at ON id_aliases
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): id_aliases — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger roles_notnull_i
CREATE TRIGGER roles_notnull_i BEFORE INSERT ON roles
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.lifecycle_status IS NULL OR NEW.runtime_state IS NULL OR NEW.condition IS NULL OR NEW.dna_schema_version IS NULL OR NEW.prompt_budget_tokens IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): roles — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger roles_notnull_u
CREATE TRIGGER roles_notnull_u BEFORE UPDATE OF created_at, version, lifecycle_status, runtime_state, condition, dna_schema_version, prompt_budget_tokens ON roles
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.lifecycle_status IS NULL OR NEW.runtime_state IS NULL OR NEW.condition IS NULL OR NEW.dna_schema_version IS NULL OR NEW.prompt_budget_tokens IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): roles — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger avatars_notnull_i
CREATE TRIGGER avatars_notnull_i BEFORE INSERT ON avatars
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): avatars — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger avatars_notnull_u
CREATE TRIGGER avatars_notnull_u BEFORE UPDATE OF created_at ON avatars
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): avatars — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger skin_assets_notnull_i
CREATE TRIGGER skin_assets_notnull_i BEFORE INSERT ON skin_assets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.asset_kind IS NULL OR NEW.status IS NULL OR NEW.is_enabled IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skin_assets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger skin_assets_notnull_u
CREATE TRIGGER skin_assets_notnull_u BEFORE UPDATE OF created_at, version, asset_kind, status, is_enabled ON skin_assets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.asset_kind IS NULL OR NEW.status IS NULL OR NEW.is_enabled IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skin_assets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger dna_field_defs_notnull_i
CREATE TRIGGER dna_field_defs_notnull_i BEFORE INSERT ON dna_field_defs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_list IS NULL OR NEW.is_identity_locked IS NULL OR NEW.is_core IS NULL OR NEW.is_required_for_birth IS NULL OR NEW.default_in_prompt IS NULL OR NEW.ordinal IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_field_defs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger dna_field_defs_notnull_u
CREATE TRIGGER dna_field_defs_notnull_u BEFORE UPDATE OF created_at, version, is_list, is_identity_locked, is_core, is_required_for_birth, default_in_prompt, ordinal ON dna_field_defs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_list IS NULL OR NEW.is_identity_locked IS NULL OR NEW.is_core IS NULL OR NEW.is_required_for_birth IS NULL OR NEW.default_in_prompt IS NULL OR NEW.ordinal IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_field_defs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger dna_fields_notnull_i
CREATE TRIGGER dna_fields_notnull_i BEFORE INSERT ON dna_fields
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.item_index IS NULL OR NEW.is_in_prompt IS NULL OR NEW.token_count IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_fields — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger dna_fields_notnull_u
CREATE TRIGGER dna_fields_notnull_u BEFORE UPDATE OF created_at, version, item_index, is_in_prompt, token_count, status ON dna_fields
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.item_index IS NULL OR NEW.is_in_prompt IS NULL OR NEW.token_count IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_fields — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger dna_field_versions_notnull_i
CREATE TRIGGER dna_field_versions_notnull_i BEFORE INSERT ON dna_field_versions
WHEN NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_field_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger dna_field_versions_notnull_u
CREATE TRIGGER dna_field_versions_notnull_u BEFORE UPDATE OF status, created_at ON dna_field_versions
WHEN NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): dna_field_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger revisions_notnull_i
CREATE TRIGGER revisions_notnull_i BEFORE INSERT ON revisions
WHEN NEW.created_at IS NULL OR NEW.is_core IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): revisions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger revisions_notnull_u
CREATE TRIGGER revisions_notnull_u BEFORE UPDATE OF created_at, is_core ON revisions
WHEN NEW.created_at IS NULL OR NEW.is_core IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): revisions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger change_sets_notnull_i
CREATE TRIGGER change_sets_notnull_i BEFORE INSERT ON change_sets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): change_sets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger change_sets_notnull_u
CREATE TRIGGER change_sets_notnull_u BEFORE UPDATE OF created_at, version, status ON change_sets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): change_sets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger change_set_items_notnull_i
CREATE TRIGGER change_set_items_notnull_i BEFORE INSERT ON change_set_items
WHEN NEW.status IS NULL OR NEW.token_delta IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): change_set_items — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger change_set_items_notnull_u
CREATE TRIGGER change_set_items_notnull_u BEFORE UPDATE OF status, token_delta, created_at ON change_set_items
WHEN NEW.status IS NULL OR NEW.token_delta IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): change_set_items — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger instructions_notnull_i
CREATE TRIGGER instructions_notnull_i BEFORE INSERT ON instructions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.condition_kind IS NULL OR NEW.is_enabled IS NULL OR NEW.is_core IS NULL OR NEW.token_count IS NULL OR NEW.status IS NULL OR NEW.lang IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): instructions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger instructions_notnull_u
CREATE TRIGGER instructions_notnull_u BEFORE UPDATE OF created_at, version, condition_kind, is_enabled, is_core, token_count, status, lang ON instructions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.condition_kind IS NULL OR NEW.is_enabled IS NULL OR NEW.is_core IS NULL OR NEW.token_count IS NULL OR NEW.status IS NULL OR NEW.lang IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): instructions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger instruction_versions_notnull_i
CREATE TRIGGER instruction_versions_notnull_i BEFORE INSERT ON instruction_versions
WHEN NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): instruction_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger instruction_versions_notnull_u
CREATE TRIGGER instruction_versions_notnull_u BEFORE UPDATE OF status, created_at ON instruction_versions
WHEN NEW.status IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): instruction_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger taxonomy_nodes_notnull_i
CREATE TRIGGER taxonomy_nodes_notnull_i BEFORE INSERT ON taxonomy_nodes
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.ordinal IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): taxonomy_nodes — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger taxonomy_nodes_notnull_u
CREATE TRIGGER taxonomy_nodes_notnull_u BEFORE UPDATE OF created_at, version, ordinal, status ON taxonomy_nodes
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.ordinal IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): taxonomy_nodes — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger skills_notnull_i
CREATE TRIGGER skills_notnull_i BEFORE INSERT ON skills
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skills — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger skills_notnull_u
CREATE TRIGGER skills_notnull_u BEFORE UPDATE OF created_at, version, status ON skills
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skills — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger skill_versions_notnull_i
CREATE TRIGGER skill_versions_notnull_i BEFORE INSERT ON skill_versions
WHEN NEW.status IS NULL OR NEW.file_count IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skill_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger skill_versions_notnull_u
CREATE TRIGGER skill_versions_notnull_u BEFORE UPDATE OF status, file_count, created_at ON skill_versions
WHEN NEW.status IS NULL OR NEW.file_count IS NULL OR NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skill_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger skill_prereqs_notnull_i
CREATE TRIGGER skill_prereqs_notnull_i BEFORE INSERT ON skill_prereqs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skill_prereqs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger skill_prereqs_notnull_u
CREATE TRIGGER skill_prereqs_notnull_u BEFORE UPDATE OF created_at, version, status ON skill_prereqs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): skill_prereqs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger role_skills_notnull_i
CREATE TRIGGER role_skills_notnull_i BEFORE INSERT ON role_skills
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.uses_7d IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): role_skills — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger role_skills_notnull_u
CREATE TRIGGER role_skills_notnull_u BEFORE UPDATE OF created_at, version, uses_7d ON role_skills
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.uses_7d IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): role_skills — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger blobs_notnull_i
CREATE TRIGGER blobs_notnull_i BEFORE INSERT ON blobs
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): blobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger blobs_notnull_u
CREATE TRIGGER blobs_notnull_u BEFORE UPDATE OF created_at ON blobs
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): blobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger knowledge_items_notnull_i
CREATE TRIGGER knowledge_items_notnull_i BEFORE INSERT ON knowledge_items
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.processing_state IS NULL OR NEW.progress_pct IS NULL OR NEW.chunk_count IS NULL OR NEW.token_count IS NULL OR NEW.sensitivity IS NULL OR NEW.recall_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): knowledge_items — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger knowledge_items_notnull_u
CREATE TRIGGER knowledge_items_notnull_u BEFORE UPDATE OF created_at, version, status, processing_state, progress_pct, chunk_count, token_count, sensitivity, recall_count ON knowledge_items
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.processing_state IS NULL OR NEW.progress_pct IS NULL OR NEW.chunk_count IS NULL OR NEW.token_count IS NULL OR NEW.sensitivity IS NULL OR NEW.recall_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): knowledge_items — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger memories_notnull_i
CREATE TRIGGER memories_notnull_i BEFORE INSERT ON memories
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.scope IS NULL OR NEW.status IS NULL OR NEW.is_pinned IS NULL OR NEW.sensitivity IS NULL OR NEW.lang IS NULL OR NEW.recall_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): memories — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger memories_notnull_u
CREATE TRIGGER memories_notnull_u BEFORE UPDATE OF created_at, version, scope, status, is_pinned, sensitivity, lang, recall_count ON memories
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.scope IS NULL OR NEW.status IS NULL OR NEW.is_pinned IS NULL OR NEW.sensitivity IS NULL OR NEW.lang IS NULL OR NEW.recall_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): memories — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger recall_hits_notnull_i
CREATE TRIGGER recall_hits_notnull_i BEFORE INSERT ON recall_hits
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): recall_hits — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger recall_hits_notnull_u
CREATE TRIGGER recall_hits_notnull_u BEFORE UPDATE OF created_at ON recall_hits
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): recall_hits — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger positions_notnull_i
CREATE TRIGGER positions_notnull_i BEFORE INSERT ON positions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.default_trust_tier IS NULL OR NEW.status IS NULL OR NEW.is_default IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): positions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger positions_notnull_u
CREATE TRIGGER positions_notnull_u BEFORE UPDATE OF created_at, version, default_trust_tier, status, is_default ON positions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.default_trust_tier IS NULL OR NEW.status IS NULL OR NEW.is_default IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): positions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger assignments_notnull_i
CREATE TRIGGER assignments_notnull_i BEFORE INSERT ON assignments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_primary IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): assignments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger assignments_notnull_u
CREATE TRIGGER assignments_notnull_u BEFORE UPDATE OF created_at, version, is_primary ON assignments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_primary IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): assignments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger trust_tier_changes_notnull_i
CREATE TRIGGER trust_tier_changes_notnull_i BEFORE INSERT ON trust_tier_changes
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): trust_tier_changes — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger trust_tier_changes_notnull_u
CREATE TRIGGER trust_tier_changes_notnull_u BEFORE UPDATE OF created_at ON trust_tier_changes
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): trust_tier_changes — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger tasks_notnull_i
CREATE TRIGGER tasks_notnull_i BEFORE INSERT ON tasks
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.priority IS NULL OR NEW.verification IS NULL OR NEW.tokens_total IS NULL OR NEW.cost_micro_usd IS NULL OR NEW.token_cost_minor IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tasks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger tasks_notnull_u
CREATE TRIGGER tasks_notnull_u BEFORE UPDATE OF created_at, version, status, priority, verification, tokens_total, cost_micro_usd, token_cost_minor ON tasks
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.priority IS NULL OR NEW.verification IS NULL OR NEW.tokens_total IS NULL OR NEW.cost_micro_usd IS NULL OR NEW.token_cost_minor IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tasks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger commitments_notnull_i
CREATE TRIGGER commitments_notnull_i BEFORE INSERT ON commitments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): commitments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger commitments_notnull_u
CREATE TRIGGER commitments_notnull_u BEFORE UPDATE OF created_at, version, status ON commitments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): commitments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger sessions_notnull_i
CREATE TRIGGER sessions_notnull_i BEFORE INSERT ON sessions
WHEN NEW.created_at IS NULL OR NEW.native_memory IS NULL OR NEW.status IS NULL OR NEW.failover_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): sessions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger sessions_notnull_u
CREATE TRIGGER sessions_notnull_u BEFORE UPDATE OF created_at, native_memory, status, failover_count ON sessions
WHEN NEW.created_at IS NULL OR NEW.native_memory IS NULL OR NEW.status IS NULL OR NEW.failover_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): sessions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger wallets_notnull_i
CREATE TRIGGER wallets_notnull_i BEFORE INSERT ON wallets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.currency_code IS NULL OR NEW.balance_minor IS NULL OR NEW.entry_count IS NULL OR NEW.allow_negative IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): wallets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger wallets_notnull_u
CREATE TRIGGER wallets_notnull_u BEFORE UPDATE OF created_at, version, currency_code, balance_minor, entry_count, allow_negative, status ON wallets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.currency_code IS NULL OR NEW.balance_minor IS NULL OR NEW.entry_count IS NULL OR NEW.allow_negative IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): wallets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger ledger_entries_notnull_i
CREATE TRIGGER ledger_entries_notnull_i BEFORE INSERT ON ledger_entries
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): ledger_entries — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger ledger_entries_notnull_u
CREATE TRIGGER ledger_entries_notnull_u BEFORE UPDATE OF created_at ON ledger_entries
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): ledger_entries — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger role_wounds_notnull_i
CREATE TRIGGER role_wounds_notnull_i BEFORE INSERT ON role_wounds
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): role_wounds — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger role_wounds_notnull_u
CREATE TRIGGER role_wounds_notnull_u BEFORE UPDATE OF created_at ON role_wounds
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): role_wounds — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger usage_daily_notnull_i
CREATE TRIGGER usage_daily_notnull_i BEFORE INSERT ON usage_daily
WHEN NEW.sessions_count IS NULL OR NEW.tokens_input IS NULL OR NEW.tokens_output IS NULL OR NEW.tokens_cache_read IS NULL OR NEW.tokens_cache_write IS NULL OR NEW.tokens_thinking IS NULL OR NEW.errors IS NULL OR NEW.failovers IS NULL OR NEW.proactive_sent IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): usage_daily — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger usage_daily_notnull_u
CREATE TRIGGER usage_daily_notnull_u BEFORE UPDATE OF sessions_count, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, tokens_thinking, errors, failovers, proactive_sent ON usage_daily
WHEN NEW.sessions_count IS NULL OR NEW.tokens_input IS NULL OR NEW.tokens_output IS NULL OR NEW.tokens_cache_read IS NULL OR NEW.tokens_cache_write IS NULL OR NEW.tokens_thinking IS NULL OR NEW.errors IS NULL OR NEW.failovers IS NULL OR NEW.proactive_sent IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): usage_daily — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger engines_notnull_i
CREATE TRIGGER engines_notnull_i BEFORE INSERT ON engines
WHEN NEW.workspace_id IS NULL OR NEW.requires_consent IS NULL OR NEW.supports_subscription IS NULL OR NEW.supports_api_key IS NULL OR NEW.core_capable IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engines — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger engines_notnull_u
CREATE TRIGGER engines_notnull_u BEFORE UPDATE OF workspace_id, requires_consent, supports_subscription, supports_api_key, core_capable ON engines
WHEN NEW.workspace_id IS NULL OR NEW.requires_consent IS NULL OR NEW.supports_subscription IS NULL OR NEW.supports_api_key IS NULL OR NEW.core_capable IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engines — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger engine_installs_notnull_i
CREATE TRIGGER engine_installs_notnull_i BEFORE INSERT ON engine_installs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.install_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_installs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger engine_installs_notnull_u
CREATE TRIGGER engine_installs_notnull_u BEFORE UPDATE OF created_at, version, install_state ON engine_installs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.install_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_installs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger engine_accounts_notnull_i
CREATE TRIGGER engine_accounts_notnull_i BEFORE INSERT ON engine_accounts
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.login_status IS NULL OR NEW.quota_state IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_accounts — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger engine_accounts_notnull_u
CREATE TRIGGER engine_accounts_notnull_u BEFORE UPDATE OF created_at, version, login_status, quota_state, status ON engine_accounts
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.login_status IS NULL OR NEW.quota_state IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_accounts — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger engine_bindings_notnull_i
CREATE TRIGGER engine_bindings_notnull_i BEFORE INSERT ON engine_bindings
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.consumer_kind IS NULL OR NEW.is_enabled IS NULL OR NEW.selection_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_bindings — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger engine_bindings_notnull_u
CREATE TRIGGER engine_bindings_notnull_u BEFORE UPDATE OF created_at, version, consumer_kind, is_enabled, selection_state ON engine_bindings
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.consumer_kind IS NULL OR NEW.is_enabled IS NULL OR NEW.selection_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): engine_bindings — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger system_agents_notnull_i
CREATE TRIGGER system_agents_notnull_i BEFORE INSERT ON system_agents
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.selection_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): system_agents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger system_agents_notnull_u
CREATE TRIGGER system_agents_notnull_u BEFORE UPDATE OF created_at, version, is_enabled, selection_state ON system_agents
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.selection_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): system_agents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger probe_runs_notnull_i
CREATE TRIGGER probe_runs_notnull_i BEFORE INSERT ON probe_runs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): probe_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger probe_runs_notnull_u
CREATE TRIGGER probe_runs_notnull_u BEFORE UPDATE OF created_at, status ON probe_runs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): probe_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger capabilities_notnull_i
CREATE TRIGGER capabilities_notnull_i BEFORE INSERT ON capabilities
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): capabilities — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger capabilities_notnull_u
CREATE TRIGGER capabilities_notnull_u BEFORE UPDATE OF created_at, version ON capabilities
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): capabilities — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger quota_snapshots_notnull_i
CREATE TRIGGER quota_snapshots_notnull_i BEFORE INSERT ON quota_snapshots
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): quota_snapshots — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger quota_snapshots_notnull_u
CREATE TRIGGER quota_snapshots_notnull_u BEFORE UPDATE OF created_at ON quota_snapshots
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): quota_snapshots — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger model_ranks_notnull_i
CREATE TRIGGER model_ranks_notnull_i BEFORE INSERT ON model_ranks
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): model_ranks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger model_ranks_notnull_u
CREATE TRIGGER model_ranks_notnull_u BEFORE UPDATE OF created_at, version ON model_ranks
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): model_ranks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger compiled_prompts_notnull_i
CREATE TRIGGER compiled_prompts_notnull_i BEFORE INSERT ON compiled_prompts
WHEN NEW.created_at IS NULL OR NEW.context_key IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): compiled_prompts — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger compiled_prompts_notnull_u
CREATE TRIGGER compiled_prompts_notnull_u BEFORE UPDATE OF created_at, context_key ON compiled_prompts
WHEN NEW.created_at IS NULL OR NEW.context_key IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): compiled_prompts — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger compiled_prompt_segments_notnull_i
CREATE TRIGGER compiled_prompt_segments_notnull_i BEFORE INSERT ON compiled_prompt_segments
WHEN NEW.is_conditional IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): compiled_prompt_segments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger compiled_prompt_segments_notnull_u
CREATE TRIGGER compiled_prompt_segments_notnull_u BEFORE UPDATE OF is_conditional ON compiled_prompt_segments
WHEN NEW.is_conditional IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): compiled_prompt_segments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger containers_notnull_i
CREATE TRIGGER containers_notnull_i BEFORE INSERT ON containers
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): containers — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger containers_notnull_u
CREATE TRIGGER containers_notnull_u BEFORE UPDATE OF created_at, version ON containers
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): containers — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger telegram_bots_notnull_i
CREATE TRIGGER telegram_bots_notnull_i BEFORE INSERT ON telegram_bots
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.poll_offset IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): telegram_bots — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger telegram_bots_notnull_u
CREATE TRIGGER telegram_bots_notnull_u BEFORE UPDATE OF created_at, version, status, poll_offset ON telegram_bots
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.poll_offset IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): telegram_bots — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger telegram_allowlist_notnull_i
CREATE TRIGGER telegram_allowlist_notnull_i BEFORE INSERT ON telegram_allowlist
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_owner IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): telegram_allowlist — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger telegram_allowlist_notnull_u
CREATE TRIGGER telegram_allowlist_notnull_u BEFORE UPDATE OF created_at, version, is_owner, status ON telegram_allowlist
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_owner IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): telegram_allowlist — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger proactive_policies_notnull_i
CREATE TRIGGER proactive_policies_notnull_i BEFORE INSERT ON proactive_policies
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.max_per_day IS NULL OR NEW.weekend_differs IS NULL OR NEW.break_quiet_level IS NULL OR NEW.channel IS NULL OR NEW.allow_commitment_reminder IS NULL OR NEW.allow_task_done IS NULL OR NEW.allow_opportunity IS NULL OR NEW.allow_incident IS NULL OR NEW.allow_heartbeat_digest IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_policies — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger proactive_policies_notnull_u
CREATE TRIGGER proactive_policies_notnull_u BEFORE UPDATE OF created_at, version, is_enabled, max_per_day, weekend_differs, break_quiet_level, channel, allow_commitment_reminder, allow_task_done, allow_opportunity, allow_incident, allow_heartbeat_digest ON proactive_policies
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.max_per_day IS NULL OR NEW.weekend_differs IS NULL OR NEW.break_quiet_level IS NULL OR NEW.channel IS NULL OR NEW.allow_commitment_reminder IS NULL OR NEW.allow_task_done IS NULL OR NEW.allow_opportunity IS NULL OR NEW.allow_incident IS NULL OR NEW.allow_heartbeat_digest IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_policies — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger proactive_jobs_notnull_i
CREATE TRIGGER proactive_jobs_notnull_i BEFORE INSERT ON proactive_jobs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.misfire_policy IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_jobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger proactive_jobs_notnull_u
CREATE TRIGGER proactive_jobs_notnull_u BEFORE UPDATE OF created_at, version, is_enabled, misfire_policy ON proactive_jobs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_enabled IS NULL OR NEW.misfire_policy IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_jobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger proactive_sends_notnull_i
CREATE TRIGGER proactive_sends_notnull_i BEFORE INSERT ON proactive_sends
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_sends — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger proactive_sends_notnull_u
CREATE TRIGGER proactive_sends_notnull_u BEFORE UPDATE OF created_at ON proactive_sends
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): proactive_sends — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger tools_notnull_i
CREATE TRIGGER tools_notnull_i BEFORE INSERT ON tools
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_builtin IS NULL OR NEW.definition_tokens IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tools — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger tools_notnull_u
CREATE TRIGGER tools_notnull_u BEFORE UPDATE OF created_at, version, is_builtin, definition_tokens, status ON tools
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.is_builtin IS NULL OR NEW.definition_tokens IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tools — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger tool_grants_notnull_i
CREATE TRIGGER tool_grants_notnull_i BEFORE INSERT ON tool_grants
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tool_grants — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger tool_grants_notnull_u
CREATE TRIGGER tool_grants_notnull_u BEFORE UPDATE OF created_at, version ON tool_grants
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): tool_grants — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger permission_requests_notnull_i
CREATE TRIGGER permission_requests_notnull_i BEFORE INSERT ON permission_requests
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): permission_requests — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger permission_requests_notnull_u
CREATE TRIGGER permission_requests_notnull_u BEFORE UPDATE OF created_at, version, status ON permission_requests
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): permission_requests — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger egress_rules_notnull_i
CREATE TRIGGER egress_rules_notnull_i BEFORE INSERT ON egress_rules
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.action IS NULL OR NEW.is_builtin IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): egress_rules — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger egress_rules_notnull_u
CREATE TRIGGER egress_rules_notnull_u BEFORE UPDATE OF created_at, version, action, is_builtin ON egress_rules
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.action IS NULL OR NEW.is_builtin IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): egress_rules — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger polaris_checks_notnull_i
CREATE TRIGGER polaris_checks_notnull_i BEFORE INSERT ON polaris_checks
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): polaris_checks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger polaris_checks_notnull_u
CREATE TRIGGER polaris_checks_notnull_u BEFORE UPDATE OF created_at ON polaris_checks
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): polaris_checks — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger employee_cards_notnull_i
CREATE TRIGGER employee_cards_notnull_i BEFORE INSERT ON employee_cards
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): employee_cards — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger employee_cards_notnull_u
CREATE TRIGGER employee_cards_notnull_u BEFORE UPDATE OF created_at, version, status ON employee_cards
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): employee_cards — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger trial_runs_notnull_i
CREATE TRIGGER trial_runs_notnull_i BEFORE INSERT ON trial_runs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.scenario_count IS NULL OR NEW.pass_threshold IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): trial_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger trial_runs_notnull_u
CREATE TRIGGER trial_runs_notnull_u BEFORE UPDATE OF created_at, status, scenario_count, pass_threshold ON trial_runs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.scenario_count IS NULL OR NEW.pass_threshold IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): trial_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger chat_threads_notnull_i
CREATE TRIGGER chat_threads_notnull_i BEFORE INSERT ON chat_threads
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.message_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): chat_threads — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger chat_threads_notnull_u
CREATE TRIGGER chat_threads_notnull_u BEFORE UPDATE OF created_at, version, status, message_count ON chat_threads
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL OR NEW.message_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): chat_threads — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger chat_messages_notnull_i
CREATE TRIGGER chat_messages_notnull_i BEFORE INSERT ON chat_messages
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.anchor_count IS NULL OR NEW.attachment_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): chat_messages — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger chat_messages_notnull_u
CREATE TRIGGER chat_messages_notnull_u BEFORE UPDATE OF created_at, status, anchor_count, attachment_count ON chat_messages
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.anchor_count IS NULL OR NEW.attachment_count IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): chat_messages — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger message_attachments_notnull_i
CREATE TRIGGER message_attachments_notnull_i BEFORE INSERT ON message_attachments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.scan_status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): message_attachments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger message_attachments_notnull_u
CREATE TRIGGER message_attachments_notnull_u BEFORE UPDATE OF created_at, version, scan_status ON message_attachments
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.scan_status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): message_attachments — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger message_anchors_notnull_i
CREATE TRIGGER message_anchors_notnull_i BEFORE INSERT ON message_anchors
WHEN NEW.created_at IS NULL OR NEW.resolved_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): message_anchors — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger message_anchors_notnull_u
CREATE TRIGGER message_anchors_notnull_u BEFORE UPDATE OF created_at, resolved_state ON message_anchors
WHEN NEW.created_at IS NULL OR NEW.resolved_state IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): message_anchors — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger ui_actions_notnull_i
CREATE TRIGGER ui_actions_notnull_i BEFORE INSERT ON ui_actions
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): ui_actions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger ui_actions_notnull_u
CREATE TRIGGER ui_actions_notnull_u BEFORE UPDATE OF created_at ON ui_actions
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): ui_actions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger audit_log_notnull_i
CREATE TRIGGER audit_log_notnull_i BEFORE INSERT ON audit_log
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): audit_log — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger audit_log_notnull_u
CREATE TRIGGER audit_log_notnull_u BEFORE UPDATE OF created_at ON audit_log
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): audit_log — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger events_notnull_i
CREATE TRIGGER events_notnull_i BEFORE INSERT ON events
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): events — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger events_notnull_u
CREATE TRIGGER events_notnull_u BEFORE UPDATE OF created_at ON events
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): events — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger notifications_notnull_i
CREATE TRIGGER notifications_notnull_i BEFORE INSERT ON notifications
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): notifications — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger notifications_notnull_u
CREATE TRIGGER notifications_notnull_u BEFORE UPDATE OF created_at, version ON notifications
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): notifications — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger jobs_notnull_i
CREATE TRIGGER jobs_notnull_i BEFORE INSERT ON jobs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.priority IS NULL OR NEW.attempts IS NULL OR NEW.max_attempts IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): jobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger jobs_notnull_u
CREATE TRIGGER jobs_notnull_u BEFORE UPDATE OF created_at, status, priority, attempts, max_attempts ON jobs
WHEN NEW.created_at IS NULL OR NEW.status IS NULL OR NEW.priority IS NULL OR NEW.attempts IS NULL OR NEW.max_attempts IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): jobs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger app_versions_notnull_i
CREATE TRIGGER app_versions_notnull_i BEFORE INSERT ON app_versions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): app_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger app_versions_notnull_u
CREATE TRIGGER app_versions_notnull_u BEFORE UPDATE OF created_at, version ON app_versions
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): app_versions — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger backups_notnull_i
CREATE TRIGGER backups_notnull_i BEFORE INSERT ON backups
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.has_db IS NULL OR NEW.has_brains IS NULL OR NEW.has_blobs IS NULL OR NEW.is_encrypted IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): backups — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger backups_notnull_u
CREATE TRIGGER backups_notnull_u BEFORE UPDATE OF created_at, version, has_db, has_brains, has_blobs, is_encrypted ON backups
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.has_db IS NULL OR NEW.has_brains IS NULL OR NEW.has_blobs IS NULL OR NEW.is_encrypted IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): backups — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger update_runs_notnull_i
CREATE TRIGGER update_runs_notnull_i BEFORE INSERT ON update_runs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): update_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger update_runs_notnull_u
CREATE TRIGGER update_runs_notnull_u BEFORE UPDATE OF created_at, version, status ON update_runs
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): update_runs — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger schema_migrations_notnull_i
CREATE TRIGGER schema_migrations_notnull_i BEFORE INSERT ON schema_migrations
WHEN NEW.is_expand_only IS NULL OR NEW.applied_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): schema_migrations — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger schema_migrations_notnull_u
CREATE TRIGGER schema_migrations_notnull_u BEFORE UPDATE OF is_expand_only, applied_at ON schema_migrations
WHEN NEW.is_expand_only IS NULL OR NEW.applied_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): schema_migrations — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger settings_notnull_i
CREATE TRIGGER settings_notnull_i BEFORE INSERT ON settings
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): settings — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger settings_notnull_u
CREATE TRIGGER settings_notnull_u BEFORE UPDATE OF created_at, version ON settings
WHEN NEW.created_at IS NULL OR NEW.version IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): settings — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger secrets_notnull_i
CREATE TRIGGER secrets_notnull_i BEFORE INSERT ON secrets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.alg IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): secrets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger secrets_notnull_u
CREATE TRIGGER secrets_notnull_u BEFORE UPDATE OF created_at, version, alg, status ON secrets
WHEN NEW.created_at IS NULL OR NEW.version IS NULL OR NEW.alg IS NULL OR NEW.status IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): secrets — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger consents_notnull_i
CREATE TRIGGER consents_notnull_i BEFORE INSERT ON consents
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): consents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger consents_notnull_u
CREATE TRIGGER consents_notnull_u BEFORE UPDATE OF created_at ON consents
WHEN NEW.created_at IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): consents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger search_documents_notnull_i
CREATE TRIGGER search_documents_notnull_i BEFORE INSERT ON search_documents
WHEN NEW.is_live IS NULL OR NEW.weight IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): search_documents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger search_documents_notnull_u
CREATE TRIGGER search_documents_notnull_u BEFORE UPDATE OF is_live, weight ON search_documents
WHEN NEW.is_live IS NULL OR NEW.weight IS NULL
BEGIN SELECT RAISE(ABORT, 'NOT NULL (v2.3.5, chống REPLACE): search_documents — cột NOT NULL có DEFAULT không nhận NULL (OR REPLACE thay NULL bằng DEFAULT sau khi guard đã đọc NULL)'); END;

-- @ga:object trigger workspaces_rowid_lock
CREATE TRIGGER workspaces_rowid_lock BEFORE UPDATE ON workspaces
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM workspaces x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): workspaces — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger users_rowid_lock
CREATE TRIGGER users_rowid_lock BEFORE UPDATE ON users
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM users x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): users — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger workspace_members_rowid_lock
CREATE TRIGGER workspace_members_rowid_lock BEFORE UPDATE ON workspace_members
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM workspace_members x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): workspace_members — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger auth_sessions_rowid_lock
CREATE TRIGGER auth_sessions_rowid_lock BEFORE UPDATE ON auth_sessions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM auth_sessions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): auth_sessions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger actors_rowid_lock
CREATE TRIGGER actors_rowid_lock BEFORE UPDATE ON actors
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM actors x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): actors — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger id_counters_rowid_lock
CREATE TRIGGER id_counters_rowid_lock BEFORE UPDATE ON id_counters
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM id_counters x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): id_counters — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger id_aliases_rowid_lock
CREATE TRIGGER id_aliases_rowid_lock BEFORE UPDATE ON id_aliases
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM id_aliases x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): id_aliases — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger roles_rowid_lock
CREATE TRIGGER roles_rowid_lock BEFORE UPDATE ON roles
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM roles x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): roles — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger avatars_rowid_lock
CREATE TRIGGER avatars_rowid_lock BEFORE UPDATE ON avatars
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM avatars x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): avatars — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger skin_assets_rowid_lock
CREATE TRIGGER skin_assets_rowid_lock BEFORE UPDATE ON skin_assets
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM skin_assets x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): skin_assets — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger dna_field_defs_rowid_lock
CREATE TRIGGER dna_field_defs_rowid_lock BEFORE UPDATE ON dna_field_defs
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): dna_field_defs — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger dna_fields_rowid_lock
CREATE TRIGGER dna_fields_rowid_lock BEFORE UPDATE ON dna_fields
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM dna_fields x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): dna_fields — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger dna_field_versions_rowid_lock
CREATE TRIGGER dna_field_versions_rowid_lock BEFORE UPDATE ON dna_field_versions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): dna_field_versions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger revisions_rowid_lock
CREATE TRIGGER revisions_rowid_lock BEFORE UPDATE ON revisions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM revisions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): revisions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger change_sets_rowid_lock
CREATE TRIGGER change_sets_rowid_lock BEFORE UPDATE ON change_sets
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM change_sets x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): change_sets — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger change_set_items_rowid_lock
CREATE TRIGGER change_set_items_rowid_lock BEFORE UPDATE ON change_set_items
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM change_set_items x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): change_set_items — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger instructions_rowid_lock
CREATE TRIGGER instructions_rowid_lock BEFORE UPDATE ON instructions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM instructions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): instructions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger instruction_versions_rowid_lock
CREATE TRIGGER instruction_versions_rowid_lock BEFORE UPDATE ON instruction_versions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM instruction_versions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): instruction_versions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger taxonomy_nodes_rowid_lock
CREATE TRIGGER taxonomy_nodes_rowid_lock BEFORE UPDATE ON taxonomy_nodes
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): taxonomy_nodes — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger skills_rowid_lock
CREATE TRIGGER skills_rowid_lock BEFORE UPDATE ON skills
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM skills x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): skills — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger skill_versions_rowid_lock
CREATE TRIGGER skill_versions_rowid_lock BEFORE UPDATE ON skill_versions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM skill_versions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): skill_versions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger skill_prereqs_rowid_lock
CREATE TRIGGER skill_prereqs_rowid_lock BEFORE UPDATE ON skill_prereqs
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): skill_prereqs — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger skill_engine_support_rowid_lock
CREATE TRIGGER skill_engine_support_rowid_lock BEFORE UPDATE ON skill_engine_support
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM skill_engine_support x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): skill_engine_support — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger skill_files_rowid_lock
CREATE TRIGGER skill_files_rowid_lock BEFORE UPDATE ON skill_files
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM skill_files x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): skill_files — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger role_skills_rowid_lock
CREATE TRIGGER role_skills_rowid_lock BEFORE UPDATE ON role_skills
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM role_skills x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): role_skills — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger blobs_rowid_lock
CREATE TRIGGER blobs_rowid_lock BEFORE UPDATE ON blobs
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM blobs x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): blobs — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger knowledge_items_rowid_lock
CREATE TRIGGER knowledge_items_rowid_lock BEFORE UPDATE ON knowledge_items
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM knowledge_items x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): knowledge_items — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger knowledge_chunks_rowid_lock
CREATE TRIGGER knowledge_chunks_rowid_lock BEFORE UPDATE ON knowledge_chunks
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): knowledge_chunks — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger memories_rowid_lock
CREATE TRIGGER memories_rowid_lock BEFORE UPDATE ON memories
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM memories x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): memories — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger recall_hits_rowid_lock
CREATE TRIGGER recall_hits_rowid_lock BEFORE UPDATE ON recall_hits
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM recall_hits x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): recall_hits — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger positions_rowid_lock
CREATE TRIGGER positions_rowid_lock BEFORE UPDATE ON positions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM positions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): positions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger assignments_rowid_lock
CREATE TRIGGER assignments_rowid_lock BEFORE UPDATE ON assignments
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM assignments x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): assignments — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger trust_tier_changes_rowid_lock
CREATE TRIGGER trust_tier_changes_rowid_lock BEFORE UPDATE ON trust_tier_changes
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): trust_tier_changes — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger tasks_rowid_lock
CREATE TRIGGER tasks_rowid_lock BEFORE UPDATE ON tasks
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM tasks x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): tasks — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger commitments_rowid_lock
CREATE TRIGGER commitments_rowid_lock BEFORE UPDATE ON commitments
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM commitments x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): commitments — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger sessions_rowid_lock
CREATE TRIGGER sessions_rowid_lock BEFORE UPDATE ON sessions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM sessions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): sessions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger wallets_rowid_lock
CREATE TRIGGER wallets_rowid_lock BEFORE UPDATE ON wallets
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM wallets x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): wallets — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger ledger_entries_rowid_lock
CREATE TRIGGER ledger_entries_rowid_lock BEFORE UPDATE ON ledger_entries
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM ledger_entries x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): ledger_entries — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger role_wounds_rowid_lock
CREATE TRIGGER role_wounds_rowid_lock BEFORE UPDATE ON role_wounds
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM role_wounds x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): role_wounds — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger usage_daily_rowid_lock
CREATE TRIGGER usage_daily_rowid_lock BEFORE UPDATE ON usage_daily
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM usage_daily x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): usage_daily — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger engines_rowid_lock
CREATE TRIGGER engines_rowid_lock BEFORE UPDATE ON engines
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM engines x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): engines — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger engine_installs_rowid_lock
CREATE TRIGGER engine_installs_rowid_lock BEFORE UPDATE ON engine_installs
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM engine_installs x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): engine_installs — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger engine_accounts_rowid_lock
CREATE TRIGGER engine_accounts_rowid_lock BEFORE UPDATE ON engine_accounts
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM engine_accounts x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): engine_accounts — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger engine_bindings_rowid_lock
CREATE TRIGGER engine_bindings_rowid_lock BEFORE UPDATE ON engine_bindings
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM engine_bindings x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): engine_bindings — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger system_agents_rowid_lock
CREATE TRIGGER system_agents_rowid_lock BEFORE UPDATE ON system_agents
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM system_agents x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): system_agents — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger probe_runs_rowid_lock
CREATE TRIGGER probe_runs_rowid_lock BEFORE UPDATE ON probe_runs
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM probe_runs x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): probe_runs — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger capabilities_rowid_lock
CREATE TRIGGER capabilities_rowid_lock BEFORE UPDATE ON capabilities
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM capabilities x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): capabilities — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger quota_snapshots_rowid_lock
CREATE TRIGGER quota_snapshots_rowid_lock BEFORE UPDATE ON quota_snapshots
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM quota_snapshots x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): quota_snapshots — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger model_ranks_rowid_lock
CREATE TRIGGER model_ranks_rowid_lock BEFORE UPDATE ON model_ranks
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM model_ranks x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): model_ranks — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger compiled_prompts_rowid_lock
CREATE TRIGGER compiled_prompts_rowid_lock BEFORE UPDATE ON compiled_prompts
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): compiled_prompts — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger compiled_prompt_segments_rowid_lock
CREATE TRIGGER compiled_prompt_segments_rowid_lock BEFORE UPDATE ON compiled_prompt_segments
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): compiled_prompt_segments — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger containers_rowid_lock
CREATE TRIGGER containers_rowid_lock BEFORE UPDATE ON containers
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM containers x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): containers — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger telegram_bots_rowid_lock
CREATE TRIGGER telegram_bots_rowid_lock BEFORE UPDATE ON telegram_bots
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM telegram_bots x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): telegram_bots — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger telegram_allowlist_rowid_lock
CREATE TRIGGER telegram_allowlist_rowid_lock BEFORE UPDATE ON telegram_allowlist
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): telegram_allowlist — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger proactive_policies_rowid_lock
CREATE TRIGGER proactive_policies_rowid_lock BEFORE UPDATE ON proactive_policies
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM proactive_policies x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): proactive_policies — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger proactive_jobs_rowid_lock
CREATE TRIGGER proactive_jobs_rowid_lock BEFORE UPDATE ON proactive_jobs
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): proactive_jobs — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger proactive_sends_rowid_lock
CREATE TRIGGER proactive_sends_rowid_lock BEFORE UPDATE ON proactive_sends
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM proactive_sends x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): proactive_sends — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger tools_rowid_lock
CREATE TRIGGER tools_rowid_lock BEFORE UPDATE ON tools
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM tools x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): tools — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger tool_grants_rowid_lock
CREATE TRIGGER tool_grants_rowid_lock BEFORE UPDATE ON tool_grants
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM tool_grants x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): tool_grants — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger permission_requests_rowid_lock
CREATE TRIGGER permission_requests_rowid_lock BEFORE UPDATE ON permission_requests
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM permission_requests x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): permission_requests — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger egress_rules_rowid_lock
CREATE TRIGGER egress_rules_rowid_lock BEFORE UPDATE ON egress_rules
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM egress_rules x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): egress_rules — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger polaris_checks_rowid_lock
CREATE TRIGGER polaris_checks_rowid_lock BEFORE UPDATE ON polaris_checks
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM polaris_checks x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): polaris_checks — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger employee_cards_rowid_lock
CREATE TRIGGER employee_cards_rowid_lock BEFORE UPDATE ON employee_cards
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM employee_cards x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): employee_cards — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger trial_runs_rowid_lock
CREATE TRIGGER trial_runs_rowid_lock BEFORE UPDATE ON trial_runs
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM trial_runs x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): trial_runs — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger chat_threads_rowid_lock
CREATE TRIGGER chat_threads_rowid_lock BEFORE UPDATE ON chat_threads
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM chat_threads x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): chat_threads — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger chat_messages_rowid_lock
CREATE TRIGGER chat_messages_rowid_lock BEFORE UPDATE ON chat_messages
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM chat_messages x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): chat_messages — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger message_attachments_rowid_lock
CREATE TRIGGER message_attachments_rowid_lock BEFORE UPDATE ON message_attachments
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM message_attachments x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): message_attachments — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger message_anchors_rowid_lock
CREATE TRIGGER message_anchors_rowid_lock BEFORE UPDATE ON message_anchors
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM message_anchors x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): message_anchors — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger ui_actions_rowid_lock
CREATE TRIGGER ui_actions_rowid_lock BEFORE UPDATE ON ui_actions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM ui_actions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): ui_actions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger audit_log_rowid_lock
CREATE TRIGGER audit_log_rowid_lock BEFORE UPDATE ON audit_log
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM audit_log x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): audit_log — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger events_rowid_lock
CREATE TRIGGER events_rowid_lock BEFORE UPDATE ON events
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM events x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): events — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger notifications_rowid_lock
CREATE TRIGGER notifications_rowid_lock BEFORE UPDATE ON notifications
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM notifications x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): notifications — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger jobs_rowid_lock
CREATE TRIGGER jobs_rowid_lock BEFORE UPDATE ON jobs
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM jobs x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): jobs — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger app_versions_rowid_lock
CREATE TRIGGER app_versions_rowid_lock BEFORE UPDATE ON app_versions
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM app_versions x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): app_versions — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger backups_rowid_lock
CREATE TRIGGER backups_rowid_lock BEFORE UPDATE ON backups
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM backups x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): backups — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger update_runs_rowid_lock
CREATE TRIGGER update_runs_rowid_lock BEFORE UPDATE ON update_runs
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM update_runs x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): update_runs — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger schema_migrations_rowid_lock
CREATE TRIGGER schema_migrations_rowid_lock BEFORE UPDATE ON schema_migrations
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM schema_migrations x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): schema_migrations — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger settings_rowid_lock
CREATE TRIGGER settings_rowid_lock BEFORE UPDATE ON settings
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM settings x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): settings — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger secrets_rowid_lock
CREATE TRIGGER secrets_rowid_lock BEFORE UPDATE ON secrets
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM secrets x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): secrets — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger consents_rowid_lock
CREATE TRIGGER consents_rowid_lock BEFORE UPDATE ON consents
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM consents x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): consents — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;

-- @ga:object trigger search_documents_rowid_lock
CREATE TRIGGER search_documents_rowid_lock BEFORE UPDATE ON search_documents
WHEN NEW.rowid IS NOT OLD.rowid AND (app_maint() = 0 OR EXISTS (SELECT 1 FROM search_documents x WHERE x.rowid = NEW.rowid))
BEGIN SELECT RAISE(ABORT, 'rowid (v2.3.5): search_documents — rowid (kể cả bí danh _rowid_ / oid / cột INTEGER PRIMARY KEY) bất biến ngoài bảo trì; trong bảo trì không đổi sang rowid của hàng đang có (REPLACE xoá hàng đó)'); END;
