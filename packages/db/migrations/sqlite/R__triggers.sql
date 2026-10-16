-- repeatable: triggers
-- GENERATED bởi `pnpm db:gen` từ db/spec/schema_v2_2.sql @ Second-Brain 70903fd (DATABASE v2.3.2) — KHÔNG SỬA TAY.
-- Thứ tự tạo = thứ tự chạy ngược (SQLite chạy trigger tạo sau trước): giữ nguyên thứ tự này.
-- 415 trigger. Runner DROP mọi trigger rồi tạo lại sau mỗi lượt migration (DATABASE §10.1).

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
  OR ((NEW.kind = 'system') AND EXISTS (SELECT 1 FROM workspaces x WHERE x.kind = NEW.kind AND (x.kind = 'system'))))
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
  OR (EXISTS (SELECT 1 FROM users x WHERE x.email = NEW.email)))
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
  (EXISTS (SELECT 1 FROM workspace_members x WHERE x.workspace_id = NEW.workspace_id AND x.user_id = NEW.user_id)))
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
  OR (EXISTS (SELECT 1 FROM auth_sessions x WHERE x.token_hash = NEW.token_hash)))
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
  OR (EXISTS (SELECT 1 FROM actors x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key)))
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
  OR (EXISTS (SELECT 1 FROM id_aliases x WHERE x.workspace_id = NEW.workspace_id AND x.source_code = NEW.source_code AND x.old_display_id = NEW.old_display_id)))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM roles x WHERE x.workspace_id = NEW.workspace_id AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM avatars x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skin_assets x WHERE x.workspace_id = NEW.workspace_id AND x.pack_slug = NEW.pack_slug AND x.asset_code = NEW.asset_code AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM dna_field_defs x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key)))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM dna_fields x WHERE x.role_id = NEW.role_id AND x.def_id = NEW.def_id AND x.item_index = NEW.item_index AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM dna_field_versions x WHERE x.dna_field_id = NEW.dna_field_id AND x.version = NEW.version)))
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
  OR ((NEW.scope = 'workspace') AND EXISTS (SELECT 1 FROM revisions x WHERE x.workspace_id = NEW.workspace_id AND x.seq = NEW.seq AND (x.scope = 'workspace'))))
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
  OR (EXISTS (SELECT 1 FROM change_sets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  (EXISTS (SELECT 1 FROM change_set_items x WHERE x.id = NEW.id)))
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
  OR (EXISTS (SELECT 1 FROM instructions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM instruction_versions x WHERE x.instruction_id = NEW.instruction_id AND x.version = NEW.version)))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM taxonomy_nodes x WHERE x.workspace_id = NEW.workspace_id AND x.domain = NEW.domain AND COALESCE(x.parent_id, '') = COALESCE(NEW.parent_id, '') AND x.name_norm = NEW.name_norm AND (x.deleted_at IS NULL))))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skills x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM skill_versions x WHERE x.skill_id = NEW.skill_id AND x.version = NEW.version)))
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
  OR ((NEW.kind = 'upgrade' AND NEW.status <> 'obsolete' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM skill_prereqs x WHERE x.skill_id = NEW.skill_id AND (x.kind = 'upgrade' AND x.status <> 'obsolete' AND x.deleted_at IS NULL))))
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
  (EXISTS (SELECT 1 FROM skill_engine_support x WHERE x.skill_version_id = NEW.skill_version_id AND x.engine_slug = NEW.engine_slug)))
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
  OR (EXISTS (SELECT 1 FROM skill_files x WHERE x.skill_version_id = NEW.skill_version_id AND x.path = NEW.path)))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM role_skills x WHERE x.role_id = NEW.role_id AND x.skill_id = NEW.skill_id AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM blobs x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256)))
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
  OR ((NEW.scope = 'workspace' AND NEW.deleted_at IS NULL AND NEW.status <> 'superseded') AND EXISTS (SELECT 1 FROM knowledge_items x WHERE x.workspace_id = NEW.workspace_id AND x.sha256 = NEW.sha256 AND (x.scope = 'workspace' AND x.deleted_at IS NULL AND x.status <> 'superseded'))))
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
  OR (EXISTS (SELECT 1 FROM knowledge_chunks x WHERE x.knowledge_item_id = NEW.knowledge_item_id AND x.ordinal = NEW.ordinal)))
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
  OR (EXISTS (SELECT 1 FROM memories x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  (EXISTS (SELECT 1 FROM recall_hits x WHERE x.id = NEW.id)))
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
  OR ((NEW.is_default = 1 AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM positions x WHERE x.workspace_id = NEW.workspace_id AND (x.is_default = 1 AND x.deleted_at IS NULL))))
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
  OR ((NEW.status = 'active' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM assignments x WHERE x.role_id = NEW.role_id AND (x.status = 'active' AND x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM trust_tier_changes x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM tasks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM commitments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM sessions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR ((NEW.owner_kind IN ('treasury', 'sink')) AND EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = NEW.workspace_id AND x.owner_kind = NEW.owner_kind AND (x.owner_kind IN ('treasury', 'sink')))))
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
  OR (EXISTS (SELECT 1 FROM ledger_entries x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR ((NEW.ended_at IS NULL) AND EXISTS (SELECT 1 FROM role_wounds x WHERE x.role_id = NEW.role_id AND (x.ended_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM usage_daily x WHERE x.workspace_id = NEW.workspace_id AND x.day_local = NEW.day_local AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.engine_account_id, '') = COALESCE(NEW.engine_account_id, '') AND x.agent_kind = NEW.agent_kind)))
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
  (EXISTS (SELECT 1 FROM engines x WHERE x.slug = NEW.slug)))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_installs x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND (x.deleted_at IS NULL))))
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
  OR ((NEW.auth_volume IS NOT NULL) AND EXISTS (SELECT 1 FROM engine_accounts x WHERE x.auth_volume = NEW.auth_volume AND (x.auth_volume IS NOT NULL))))
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
  OR ((NEW.consumer_kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM engine_bindings x WHERE x.workspace_id = NEW.workspace_id AND x.priority = NEW.priority AND (x.consumer_kind = 'system' AND x.deleted_at IS NULL))))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM system_agents x WHERE x.workspace_id = NEW.workspace_id AND x.system_key = NEW.system_key AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM probe_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM capabilities x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  (EXISTS (SELECT 1 FROM quota_snapshots x WHERE x.id = NEW.id)))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM model_ranks x WHERE x.workspace_id = NEW.workspace_id AND x.engine_slug = NEW.engine_slug AND x.model_key = NEW.model_key AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM compiled_prompts x WHERE x.revision_id = NEW.revision_id AND COALESCE(x.position_revision_id, '') = COALESCE(NEW.position_revision_id, '') AND COALESCE(x.rules_revision_id, '') = COALESCE(NEW.rules_revision_id, '') AND COALESCE(x.engine_slug, '') = COALESCE(NEW.engine_slug, '') AND x.context_key = NEW.context_key AND COALESCE(x.polaris_params_hash, '') = COALESCE(NEW.polaris_params_hash, ''))))
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
  OR (EXISTS (SELECT 1 FROM compiled_prompt_segments x WHERE x.compiled_prompt_id = NEW.compiled_prompt_id AND x.ordinal = NEW.ordinal)))
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
  OR ((NEW.kind = 'system' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM containers x WHERE x.workspace_id = NEW.workspace_id AND (x.kind = 'system' AND x.deleted_at IS NULL))))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_bots x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL))))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM telegram_allowlist x WHERE x.bot_id = NEW.bot_id AND x.tg_user_id = NEW.tg_user_id AND (x.deleted_at IS NULL))))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM proactive_policies x WHERE x.role_id = NEW.role_id AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM proactive_jobs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM proactive_sends x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tools x WHERE x.workspace_id = NEW.workspace_id AND x.slug = NEW.slug AND (x.deleted_at IS NULL))))
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
  OR ((NEW.role_id IS NOT NULL AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM tool_grants x WHERE x.tool_id = NEW.tool_id AND x.role_id = NEW.role_id AND (x.role_id IS NOT NULL AND x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM permission_requests x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM egress_rules x WHERE x.workspace_id = NEW.workspace_id AND x.domain_pattern = NEW.domain_pattern AND x.applies_to = NEW.applies_to AND COALESCE(x.role_id, '') = COALESCE(NEW.role_id, '') AND COALESCE(x.position_id, '') = COALESCE(NEW.position_id, '') AND COALESCE(x.tool_id, '') = COALESCE(NEW.tool_id, '') AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM polaris_checks x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR ((NEW.status IN ('issued', 'suspended') AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM employee_cards x WHERE x.role_id = NEW.role_id AND (x.status IN ('issued', 'suspended') AND x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM trial_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR ((NEW.kind = 'telegram' AND NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM chat_threads x WHERE x.telegram_bot_id = NEW.telegram_bot_id AND x.tg_chat_id = NEW.tg_chat_id AND (x.kind = 'telegram' AND x.deleted_at IS NULL))))
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
  OR ((NEW.external_id IS NOT NULL) AND EXISTS (SELECT 1 FROM chat_messages x WHERE x.thread_id = NEW.thread_id AND x.external_id = NEW.external_id AND (x.external_id IS NOT NULL))))
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
  OR (EXISTS (SELECT 1 FROM message_attachments x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM message_anchors x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM ui_actions x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM audit_log x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM events x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR ((NEW.resolved_at IS NULL AND NEW.dedupe_key IS NOT NULL) AND EXISTS (SELECT 1 FROM notifications x WHERE x.user_id = NEW.user_id AND x.dedupe_key = NEW.dedupe_key AND (x.resolved_at IS NULL AND x.dedupe_key IS NOT NULL))))
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
  OR ((NEW.status = 'current') AND EXISTS (SELECT 1 FROM app_versions x WHERE x.status = NEW.status AND (x.status = 'current'))))
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
  OR (EXISTS (SELECT 1 FROM backups x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM update_runs x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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

-- @ga:object trigger schema_migrations_no_replace_u
CREATE TRIGGER schema_migrations_no_replace_u BEFORE UPDATE OF version ON schema_migrations
WHEN (
  (EXISTS (SELECT 1 FROM schema_migrations x WHERE x.version = NEW.version AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): schema_migrations — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

-- @ga:object trigger settings_no_replace_i
CREATE TRIGGER settings_no_replace_i BEFORE INSERT ON settings
WHEN (
  (EXISTS (SELECT 1 FROM settings x WHERE x.id = NEW.id))
  OR (EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq))
  OR ((NEW.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM settings x WHERE x.workspace_id = NEW.workspace_id AND x.key = NEW.key AND (x.deleted_at IS NULL))))
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
  OR (EXISTS (SELECT 1 FROM secrets x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
  OR (EXISTS (SELECT 1 FROM consents x WHERE x.workspace_id = NEW.workspace_id AND x.display_seq = NEW.display_seq)))
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
CREATE TRIGGER search_documents_no_replace_u BEFORE UPDATE OF id, entity_type, entity_id, chunk_id ON search_documents
WHEN (
  (EXISTS (SELECT 1 FROM search_documents x WHERE x.id = NEW.id AND x.rowid <> OLD.rowid))
  OR (EXISTS (SELECT 1 FROM search_documents x WHERE x.entity_type = NEW.entity_type AND x.entity_id = NEW.entity_id AND COALESCE(x.chunk_id, '') = COALESCE(NEW.chunk_id, '') AND x.rowid <> OLD.rowid)))
BEGIN SELECT RAISE(ABORT, 'UNIQUE (chống REPLACE, v2.2.13): search_documents — ghi trùng khoá unique với một hàng đang có; cấm OR REPLACE / REPLACE INTO / UPDATE OR REPLACE (REPLACE xoá hàng mà không qua guard) — mọi kết nối bật PRAGMA recursive_triggers = ON (§2.2)'); END;

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
  -- v2.2.1 (CNS-043, Q-R7b [CHỐT — Ryan duyệt 2026-10-15]): việc đã tự báo, hoặc bằng chứng là chính bản tự báo ⇒ MỌI phạt là self_reported (trần, không về 0);
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
   WHERE (SELECT role_id FROM actors WHERE id = NEW.recorded_by) IN
         (SELECT role_id FROM wallets WHERE id IN (NEW.debit_wallet_id, NEW.credit_wallet_id) AND role_id IS NOT NULL);
  SELECT RAISE(ABORT, 'ledger: MVP chỉ owner/admin (thành viên đang hoạt động của workspace) ghi ví — Role không ghi ví; actor system chỉ ghi vốn kích hoạt')
   WHERE NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.recorded_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
     AND NOT (NEW.entry_type = 'activation_grant' AND EXISTS (SELECT 1 FROM actors sx WHERE sx.id = NEW.recorded_by
              AND sx.workspace_id = NEW.workspace_id AND sx.kind = 'system' AND sx.system_key = 'system'));
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
         entry_count = entry_count + 1, last_entry_at = NEW.created_at WHERE id = NEW.debit_wallet_id;
  UPDATE wallets SET balance_minor = NEW.credit_balance_after, last_entry_id = NEW.id,
         entry_count = entry_count + 1, last_entry_at = NEW.created_at WHERE id = NEW.credit_wallet_id;
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
           (SELECT a.id FROM actors a WHERE a.workspace_id = NEW.workspace_id AND a.kind = 'system' AND a.system_key = 'system'),
           w.role_id, w.id, NEW.id, NEW.created_at, 'R' || substr(NEW.id, 2),
           CASE WHEN (SELECT m.user_id FROM workspace_members m WHERE m.workspace_id = NEW.workspace_id AND m.access_level = 'owner' AND m.removed_at IS NULL ORDER BY m.created_at, m.user_id LIMIT 1) IS NOT NULL THEN 'N' || substr(NEW.id, 2) END,
           CASE WHEN (SELECT m.user_id FROM workspace_members m WHERE m.workspace_id = NEW.workspace_id AND m.access_level = 'owner' AND m.removed_at IS NULL ORDER BY m.created_at, m.user_id LIMIT 1) IS NOT NULL THEN NEW.created_at END
    FROM wallets w JOIN id_counters c ON c.workspace_id = NEW.workspace_id AND c.prefix = 'RW'
    WHERE w.id = NEW.debit_wallet_id AND NEW.debit_balance_after = 0 AND app_maint() = 0 AND EXISTS (SELECT 1 FROM wallets w WHERE w.id = NEW.debit_wallet_id AND w.owner_kind = 'role' AND w.role_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM role_wounds r JOIN wallets w ON w.role_id = r.role_id WHERE w.id = NEW.debit_wallet_id AND r.ended_at IS NULL);
  UPDATE tasks SET status = 'blocked', status_detail = 'nghỉ dưỡng thương — owner giao lại được',
         paused_by_wound_id = (SELECT r.id FROM role_wounds r WHERE r.cause_entry_id = NEW.id)
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
  UPDATE roles SET condition = 'wounded' WHERE id IN (SELECT role_id FROM role_wounds WHERE cause_entry_id = NEW.id);
  UPDATE role_wounds SET ended_at = NEW.created_at, revive_entry_id = NEW.id
    WHERE ended_at IS NULL AND NEW.credit_balance_after > 0
      AND role_id IS (SELECT role_id FROM wallets WHERE id = NEW.credit_wallet_id AND owner_kind = 'role');
  UPDATE tasks SET status = 'queued', status_detail = NULL, paused_by_wound_id = NULL
    WHERE status = 'blocked' AND paused_by_wound_id IN (SELECT r.id FROM role_wounds r WHERE r.revive_entry_id = NEW.id)
      AND assignee_role_id IS (SELECT role_id FROM wallets WHERE id = NEW.credit_wallet_id);
  UPDATE roles SET condition = 'normal'
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
WHEN NEW.confirmed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.confirmed_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'dna_fields: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI'); END;

-- @ga:object trigger dna_fields_confirm_u
CREATE TRIGGER dna_fields_confirm_u BEFORE UPDATE OF confirmed_by, workspace_id ON dna_fields
WHEN NEW.confirmed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.confirmed_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'dna_fields: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI'); END;

-- @ga:object trigger trust_tier_changes_bi
CREATE TRIGGER trust_tier_changes_bi BEFORE INSERT ON trust_tier_changes
WHEN NEW.to_tier > COALESCE((SELECT max_trust_tier FROM positions WHERE id = NEW.position_id), 4)
  OR NEW.from_tier IS NOT (SELECT CASE WHEN NEW.kind = 'initial' THEN NULL ELSE trust_tier END FROM assignments WHERE id = NEW.assignment_id)
BEGIN SELECT RAISE(ABORT, 'trust tier: vượt trần vị trí hoặc from_tier lệch'); END;

-- @ga:object trigger trust_tier_changes_ai
CREATE TRIGGER trust_tier_changes_ai AFTER INSERT ON trust_tier_changes BEGIN
  UPDATE assignments SET trust_tier = NEW.to_tier WHERE id = NEW.assignment_id;
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
WHEN NEW.confirmed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.confirmed_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI'); END;

-- @ga:object trigger taxonomy_nodes_confirm_u
CREATE TRIGGER taxonomy_nodes_confirm_u BEFORE UPDATE OF confirmed_by, workspace_id ON taxonomy_nodes
WHEN NEW.confirmed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.confirmed_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'taxonomy_nodes: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI'); END;

-- @ga:object trigger skill_prereqs_confirm_i
CREATE TRIGGER skill_prereqs_confirm_i BEFORE INSERT ON skill_prereqs
WHEN NEW.confirmed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.confirmed_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI'); END;

-- @ga:object trigger skill_prereqs_confirm_u
CREATE TRIGGER skill_prereqs_confirm_u BEFORE UPDATE OF confirmed_by, workspace_id ON skill_prereqs
WHEN NEW.confirmed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.confirmed_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'skill_prereqs: chỉ owner/admin (actor user, thành viên đang hoạt động của workspace) duyệt được đề xuất của AI'); END;

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
WHEN (NEW.key LIKE 'economy.%' OR NEW.key LIKE 'polaris.%') AND NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.created_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
  OR EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.created_by AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp — settings economy.*/polaris.* chỉ owner/admin ghi'); END;

-- @ga:object trigger settings_rules_guard_u
CREATE TRIGGER settings_rules_guard_u BEFORE UPDATE OF key, value_json, deleted_at ON settings
WHEN (NEW.key LIKE 'economy.%' OR NEW.key LIKE 'polaris.%' OR OLD.key LIKE 'economy.%' OR OLD.key LIKE 'polaris.%')
  AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.updated_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
BEGIN SELECT RAISE(ABORT, 'CNS-033/049: Role chỉ đề xuất kỹ năng, tri thức, trí nhớ, quy trình vị trí, phong cách giao tiếp — settings economy.*/polaris.* chỉ owner/admin sửa (updated_by)'); END;

-- @ga:object trigger settings_overhead_estimate_i
CREATE TRIGGER settings_overhead_estimate_i BEFORE INSERT ON settings
WHEN NEW.key = 'budget.runtime_overhead_estimate_tokens' AND NOT (
  (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 2000))
  AND (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.created_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
       OR EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.created_by AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings: budget.runtime_overhead_estimate_tokens phải là số nguyên 1–2000, chỉ owner/admin ghi'); END;

-- @ga:object trigger settings_overhead_estimate_u
CREATE TRIGGER settings_overhead_estimate_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = 'budget.runtime_overhead_estimate_tokens' OR OLD.key = 'budget.runtime_overhead_estimate_tokens') AND NOT (
  NEW.key = 'budget.runtime_overhead_estimate_tokens'
  AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 2000))
  AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.updated_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
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
   WHERE (SELECT count(*) FROM jobs j WHERE j.workspace_id = NEW.workspace_id AND j.kind = 'wound_reflection' AND json_extract(j.payload_json, '$.role_wound_id') = json_extract(NEW.payload_json, '$.role_wound_id')) > 0 AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.created_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'));
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
   WHERE NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.created_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.created_by AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'));
  SELECT RAISE(ABORT, 'INT-20 (A5, CONTRACT-r8b §A): system.core_agent_engine chỉ đọc kể từ lần kiểm đăng nhập đạt đầu tiên của tài khoản Core agent (workspaces.core_agent_locked_at) — ngoại lệ duy nhất (CONTRACT-r8c §A, Q-R8a): owner đổi sang loại khác khi Core agent đang sự cố (mode recovery, is_incident 1); không xoá / đổi khoá')
   WHERE NEW.deleted_at IS NULL AND ((SELECT wl.core_agent_locked_at FROM workspaces wl WHERE wl.id = NEW.workspace_id) IS NOT NULL OR EXISTS (SELECT 1 FROM probe_runs lk WHERE lk.workspace_id = NEW.workspace_id AND lk.trigger = 'login_check' AND lk.status = 'ok' AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL))) AND json_extract(NEW.value_json, '$') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity')
     AND NOT (NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0))))))));
  SELECT RAISE(ABORT, 'CONTRACT-r8c §A (Q-R8a): đổi loại Core agent khi sự cố — chỉ owner (không gồm admin / tác tử / Role); hệ thống không tự đổi')
   WHERE (NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))) AND NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.created_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner');
  SELECT RAISE(ABORT, 'CONTRACT-r8c §A (Q-R8a): loại đích đòi đồng ý điều khoản (Clause 6) — tick đồng ý MỚI trước khi đổi (CN- mới: chưa gắn danh tính, chưa tài khoản nào dùng); CONTRACT-r8d §B: trừ khi đổi về tài khoản AI Hệ thống cũ của loại đích mà đồng ý của chính nó còn hợp lệ')
   WHERE (NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))) AND NOT (COALESCE((SELECT fe.requires_consent FROM engines fe WHERE fe.slug = json_extract(NEW.value_json, '$')), 1) = 0 OR EXISTS (SELECT 1 FROM consents fc JOIN engines fce ON fce.slug = json_extract(NEW.value_json, '$') WHERE fc.workspace_id = NEW.workspace_id AND fc.consent_kind = 'engine_tos_risk' AND fc.subject = json_extract(NEW.value_json, '$') AND fc.revoked_at IS NULL AND fc.notice_version = fce.tos_notice_version AND fc.account_hint IS NULL AND NOT EXISTS (SELECT 1 FROM engine_accounts fa WHERE fa.consent_id = fc.id)))
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
     AND NOT (NEW.key = 'system.core_agent_engine' AND OLD.key = 'system.core_agent_engine' AND NEW.workspace_id IS OLD.workspace_id AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = OLD.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = OLD.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = OLD.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = OLD.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = OLD.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = OLD.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = OLD.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = OLD.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0))))))));
  SELECT RAISE(ABORT, 'settings: system.core_agent_engine phải là slug (chuỗi JSON) của một engine core_capable = 1, adapter_status = ready trong danh mục engines (CNS-092, CONTRACT-r8 §C: antigravity — mặc định —, claude-code; openclaw core_capable nhưng coming_soon ở MVP)')
   WHERE NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND NOT (json_type(NEW.value_json) = 'text' AND EXISTS (SELECT 1 FROM engines e WHERE e.slug = json_extract(NEW.value_json, '$') AND e.core_capable = 1 AND e.adapter_status = 'ready'));
  SELECT RAISE(ABORT, 'settings: system.core_agent_engine chỉ owner/admin sửa (updated_by)')
   WHERE NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.updated_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'));
  SELECT RAISE(ABORT, 'CONTRACT-r8c §A (Q-R8a): đổi loại Core agent khi sự cố — chỉ owner (không gồm admin / tác tử / Role); hệ thống không tự đổi')
   WHERE (NEW.key = 'system.core_agent_engine' AND OLD.key = 'system.core_agent_engine' AND NEW.workspace_id IS OLD.workspace_id AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = OLD.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = OLD.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = OLD.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = OLD.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = OLD.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = OLD.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = OLD.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = OLD.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))) AND NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.updated_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner');
  SELECT RAISE(ABORT, 'CONTRACT-r8c §A (Q-R8a): loại đích đòi đồng ý điều khoản (Clause 6) — tick đồng ý MỚI trước khi đổi (CN- mới: chưa gắn danh tính, chưa tài khoản nào dùng); CONTRACT-r8d §B: trừ khi đổi về tài khoản AI Hệ thống cũ của loại đích mà đồng ý của chính nó còn hợp lệ')
   WHERE (NEW.key = 'system.core_agent_engine' AND OLD.key = 'system.core_agent_engine' AND NEW.workspace_id IS OLD.workspace_id AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$') AND ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = OLD.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = OLD.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = OLD.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = OLD.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = OLD.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = OLD.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = OLD.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = OLD.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = OLD.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))) AND NOT (COALESCE((SELECT fe.requires_consent FROM engines fe WHERE fe.slug = json_extract(NEW.value_json, '$')), 1) = 0 OR EXISTS (SELECT 1 FROM consents fc JOIN engines fce ON fce.slug = json_extract(NEW.value_json, '$') WHERE fc.workspace_id = NEW.workspace_id AND fc.consent_kind = 'engine_tos_risk' AND fc.subject = json_extract(NEW.value_json, '$') AND fc.revoked_at IS NULL AND fc.notice_version = fce.tos_notice_version AND fc.account_hint IS NULL AND NOT EXISTS (SELECT 1 FROM engine_accounts fa WHERE fa.consent_id = fc.id)))
     AND NOT EXISTS (SELECT 1 FROM engine_bindings rb JOIN engine_accounts ra ON ra.id = rb.engine_account_id AND ra.workspace_id = rb.workspace_id WHERE rb.workspace_id = NEW.workspace_id AND rb.consumer_kind = 'system' AND rb.deleted_at IS NULL AND ra.deleted_at IS NULL AND ra.engine_slug = json_extract(NEW.value_json, '$') AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ra.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ra.engine_slug WHERE cn.id = ra.consent_id AND cn.workspace_id = ra.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ra.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ra.account_hint))));
END;

-- @ga:object trigger settings_core_agent_type_change_au
CREATE TRIGGER settings_core_agent_type_change_au AFTER UPDATE OF value_json ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$')
BEGIN UPDATE engine_bindings SET is_enabled = 0, updated_at = COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))), updated_by = NEW.updated_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND consumer_kind = 'system' AND deleted_at IS NULL AND is_enabled = 1
    AND (SELECT ta.engine_slug FROM engine_accounts ta WHERE ta.id = engine_account_id) IS NOT json_extract(NEW.value_json, '$'); END;

-- @ga:object trigger settings_core_agent_type_change_ai
CREATE TRIGGER settings_core_agent_type_change_ai AFTER INSERT ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL
BEGIN UPDATE engine_bindings SET is_enabled = 0, updated_at = COALESCE(NEW.updated_at, NEW.created_at), updated_by = NEW.created_by, version = version + 1
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
WHEN NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint))))
BEGIN SELECT RAISE(ABORT, 'INT-20 (A4, CONTRACT-r8 §C): mọi Role mới chỉ tạo được khi tài khoản Core agent sẵn sàng — binding Hệ thống sống + bật, tài khoản active cùng loại, lần kiểm đăng nhập (login_check) mới nhất trong container AI Hệ thống đạt, có đồng ý điều khoản, không hết quota, không có sự cố hãng (OB-04 ok); Core agent sự cố ⇒ chế độ khắc phục'); END;

-- @ga:object trigger sessions_core_agent_ready_i
CREATE TRIGGER sessions_core_agent_ready_i BEFORE INSERT ON sessions
WHEN NEW.agent_kind IN ('interviewer', 'trainer', 'consolidator', 'judge')
BEGIN
  SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8 §C): phiên AI Hệ thống (Interviewer / Trainer / Consolidator / Judge) chỉ mở trên tài khoản Core agent SẴN SÀNG của workspace — không fallback sang tài khoản / loại CLI khác; Core agent sự cố ⇒ AI Hệ thống tạm dừng, việc xếp hàng chờ')
   WHERE NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint))) AND ca.id IS NEW.engine_account_id);
  SELECT RAISE(ABORT, 'CONTRACT-r8d §A (CNS-117): tác tử hệ thống chưa có model hợp lệ cho loại Core agent hiện tại — selection_state phải là valid (sau khi đổi loại = stale: áp model mặc định của loại mới hoặc chọn lại ở A5 › AI Hệ thống) rồi mới mở phiên')
   WHERE NOT EXISTS (SELECT 1 FROM system_agents sv WHERE sv.workspace_id = NEW.workspace_id AND sv.system_key = NEW.agent_kind AND sv.deleted_at IS NULL AND sv.selection_state = 'valid');
END;

-- @ga:object trigger sessions_core_agent_ready_u
CREATE TRIGGER sessions_core_agent_ready_u BEFORE UPDATE OF agent_kind, engine_account_id ON sessions
WHEN NEW.agent_kind IN ('interviewer', 'trainer', 'consolidator', 'judge') AND (NEW.agent_kind IS NOT OLD.agent_kind OR NEW.engine_account_id IS NOT OLD.engine_account_id)
BEGIN
  SELECT RAISE(ABORT, 'INT-20 (CONTRACT-r8 §C): phiên AI Hệ thống (Interviewer / Trainer / Consolidator / Judge) chỉ mở trên tài khoản Core agent SẴN SÀNG của workspace — không fallback sang tài khoản / loại CLI khác; Core agent sự cố ⇒ AI Hệ thống tạm dừng, việc xếp hàng chờ')
   WHERE NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint))) AND ca.id IS NEW.engine_account_id);
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
WHEN NEW.kind = 'core_agent_incident' AND NOT ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8b §B/§C: notifications core_agent_incident chỉ phát khi v_core_agent_status.is_incident = 1 — đang đăng nhập lại / đổi danh tính (chờ đồng ý lại) / chưa khoá loại không phải sự cố: không chuông, không Telegram'); END;

-- @ga:object trigger notifications_core_incident_u
CREATE TRIGGER notifications_core_incident_u BEFORE UPDATE OF kind, workspace_id ON notifications
WHEN NEW.kind = 'core_agent_incident' AND NOT ((SELECT iw.core_agent_locked_at FROM workspaces iw WHERE iw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))) AND NOT EXISTS (SELECT 1 FROM engine_bindings nb JOIN engine_accounts na ON na.id = nb.engine_account_id AND na.workspace_id = nb.workspace_id WHERE nb.workspace_id = NEW.workspace_id AND nb.consumer_kind = 'system' AND nb.deleted_at IS NULL AND na.deleted_at IS NULL AND na.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND EXISTS (SELECT 1 FROM containers nc WHERE nc.workspace_id = NEW.workspace_id AND nc.kind = 'system' AND nc.deleted_at IS NULL AND nc.desired_state <> 'absent') AND (EXISTS (SELECT 1 FROM engine_installs eg WHERE eg.workspace_id = NEW.workspace_id AND eg.engine_slug = na.engine_slug AND eg.deleted_at IS NULL AND eg.install_state = 'installing') OR (EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = NEW.workspace_id AND ei.engine_slug = na.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 1 AND EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND cn.account_hint IS NOT NULL AND cn.account_hint IS NOT na.account_hint)) OR ((COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = na.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = na.engine_slug WHERE cn.id = na.consent_id AND cn.workspace_id = na.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = na.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS na.account_hint))) AND nb.is_enabled = 1 AND na.status = 'active' AND na.login_status = 'in_progress' AND NOT (NOT EXISTS (SELECT 1 FROM probe_runs tq JOIN containers tqc ON tqc.id = tq.container_id AND tqc.workspace_id = NEW.workspace_id AND tqc.kind = 'system' WHERE tq.engine_account_id = na.id AND tq.trigger = 'login_check' AND tq.status = 'ok') AND EXISTS (SELECT 1 FROM probe_runs tf JOIN containers tfc ON tfc.id = tf.container_id AND tfc.workspace_id = NEW.workspace_id AND tfc.kind = 'system' AND tfc.deleted_at IS NULL WHERE tf.engine_account_id = na.id AND tf.trigger = 'login_check' AND tf.status <> 'running')) AND NOT (na.login_status = 'in_progress' AND COALESCE(na.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0)))))))
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
 AND (NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.created_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR json_extract(NEW.detail_json, '$.to') IS NOT COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity'))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8c §A: events core_agent.type_changed — actor phải là owner và "to" = loại Core agent hiện hành (ghi sau khi đổi ST-0017)'); END;

-- @ga:object trigger settings_core_agent_sa_stale_au
CREATE TRIGGER settings_core_agent_sa_stale_au AFTER UPDATE OF value_json ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT json_extract(OLD.value_json, '$')
BEGIN UPDATE system_agents SET selection_state = 'stale', selection_checked_at = COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))),
  updated_at = COALESCE(NEW.updated_at, (strftime('%Y-%m-%dT%H:%M:%fZ','now'))), updated_by = NEW.updated_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND deleted_at IS NULL; END;

-- @ga:object trigger settings_core_agent_sa_stale_ai
CREATE TRIGGER settings_core_agent_sa_stale_ai AFTER INSERT ON settings
WHEN NEW.key = 'system.core_agent_engine' AND NEW.deleted_at IS NULL AND json_extract(NEW.value_json, '$') IS NOT 'antigravity'
BEGIN UPDATE system_agents SET selection_state = 'stale', selection_checked_at = COALESCE(NEW.updated_at, NEW.created_at),
  updated_at = COALESCE(NEW.updated_at, NEW.created_at), updated_by = NEW.created_by, version = version + 1
  WHERE workspace_id = NEW.workspace_id AND deleted_at IS NULL; END;

-- @ga:object trigger employee_cards_core_agent_ready_i
CREATE TRIGGER employee_cards_core_agent_ready_i BEFORE INSERT ON employee_cards
WHEN NEW.status IN ('issued', 'suspended') AND ((SELECT rw.core_agent_locked_at FROM workspaces rw WHERE rw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))))
BEGIN SELECT RAISE(ABORT, 'CONTRACT-r8d §C (CNS-120): Core agent đang ở chế độ khắc phục (mode recovery) — không cấp thẻ mới (thẻ vào issued / suspended từ trạng thái khác, hoặc INSERT issued / suspended); Tạm ngưng / Tiếp tục thẻ đang có (issued ↔ suspended) vẫn được'); END;

-- @ga:object trigger employee_cards_core_agent_ready_u
CREATE TRIGGER employee_cards_core_agent_ready_u BEFORE UPDATE OF status ON employee_cards
WHEN NEW.status IN ('issued', 'suspended') AND OLD.status NOT IN ('issued', 'suspended') AND ((SELECT rw.core_agent_locked_at FROM workspaces rw WHERE rw.id = NEW.workspace_id) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engine_bindings cb JOIN engine_accounts ca ON ca.id = cb.engine_account_id AND ca.workspace_id = cb.workspace_id WHERE cb.workspace_id = NEW.workspace_id AND cb.consumer_kind = 'system' AND cb.deleted_at IS NULL AND cb.is_enabled = 1 AND ca.deleted_at IS NULL AND ca.status = 'active' AND ca.engine_slug = COALESCE((SELECT json_extract(value_json, '$') FROM settings WHERE workspace_id = NEW.workspace_id AND key = 'system.core_agent_engine' AND deleted_at IS NULL), 'antigravity') AND ca.login_status = 'logged_in' AND ca.quota_state <> 'exhausted' AND ca.outage_since IS NULL AND EXISTS (SELECT 1 FROM engine_installs ei WHERE ei.workspace_id = cb.workspace_id AND ei.engine_slug = ca.engine_slug AND ei.deleted_at IS NULL AND ei.install_state = 'installed') AND (SELECT lp.status FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = cb.workspace_id AND lc.kind = 'system' AND lc.deleted_at IS NULL WHERE lp.engine_account_id = ca.id AND lp.trigger = 'login_check' AND lp.status <> 'running' ORDER BY lp.display_seq DESC LIMIT 1) IS 'ok' AND (COALESCE((SELECT ce.requires_consent FROM engines ce WHERE ce.slug = ca.engine_slug), 1) = 0 OR EXISTS (SELECT 1 FROM consents cn JOIN engines cne ON cne.slug = ca.engine_slug WHERE cn.id = ca.consent_id AND cn.workspace_id = ca.workspace_id AND cn.consent_kind = 'engine_tos_risk' AND cn.subject = ca.engine_slug AND cn.revoked_at IS NULL AND cn.notice_version = cne.tos_notice_version AND (cn.account_hint IS NULL OR cn.account_hint IS ca.account_hint)))))
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
   WHERE NOT EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.updated_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner');
  SELECT RAISE(ABORT, 'CONTRACT-r8e §A: khôi phục bot Telegram đã xoá mềm phải có hàng chủ sở hữu active trước (bất biến: bot còn sống luôn có ≥ 1 hàng chủ sở hữu active)')
   WHERE NOT EXISTS (SELECT 1 FROM telegram_allowlist ra WHERE ra.bot_id = OLD.id AND ra.is_owner = 1 AND ra.status = 'active' AND ra.deleted_at IS NULL);
END;

-- @ga:object trigger telegram_allowlist_owner_new_i
CREATE TRIGGER telegram_allowlist_owner_new_i BEFORE INSERT ON telegram_allowlist
WHEN NEW.is_owner = 1 AND NEW.status = 'active' AND NEW.deleted_at IS NULL AND app_maint() = 0
 AND NOT (NEW.added_via = 'capture' AND (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.created_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
          OR NOT EXISTS (SELECT 1 FROM telegram_allowlist na WHERE na.bot_id = NEW.bot_id AND na.is_owner = 1 AND na.status = 'active' AND na.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'v2.2.13 (review bảo mật, HIGH): hàng allowlist chỉ thành chủ sở hữu active khi owner của workspace thêm qua capture (user ID đã xác minh), hoặc bot chưa có hàng chủ sở hữu active nào (bootstrap qua capture) — admin, tác tử, nhập tay không tạo được chủ sở hữu'); END;

-- @ga:object trigger telegram_allowlist_owner_new_u
CREATE TRIGGER telegram_allowlist_owner_new_u BEFORE UPDATE OF is_owner, status, deleted_at, added_via, bot_id ON telegram_allowlist
WHEN NEW.is_owner = 1 AND NEW.status = 'active' AND NEW.deleted_at IS NULL AND NOT (OLD.is_owner = 1 AND OLD.status = 'active' AND OLD.deleted_at IS NULL) AND app_maint() = 0
 AND NOT (NEW.added_via = 'capture' AND (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.updated_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
          OR NOT EXISTS (SELECT 1 FROM telegram_allowlist na WHERE na.bot_id = NEW.bot_id AND na.id <> OLD.id AND na.is_owner = 1 AND na.status = 'active' AND na.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT, 'v2.2.13 (review bảo mật, HIGH): hàng allowlist chỉ thành chủ sở hữu active khi owner của workspace thêm qua capture (user ID đã xác minh), hoặc bot chưa có hàng chủ sở hữu active nào (bootstrap qua capture) — admin, tác tử, nhập tay không tạo được chủ sở hữu'); END;

-- @ga:object trigger engine_accounts_login_started_ai
CREATE TRIGGER engine_accounts_login_started_ai AFTER INSERT ON engine_accounts
WHEN NEW.login_status = 'in_progress' OR NEW.login_started_at IS NOT NULL
BEGIN UPDATE engine_accounts SET login_started_at = CASE WHEN NEW.login_status = 'in_progress' THEN strftime('%Y-%m-%dT%H:%M:%fZ', app_now()) END WHERE id = NEW.id; END;

-- @ga:object trigger engine_accounts_login_started_au
CREATE TRIGGER engine_accounts_login_started_au AFTER UPDATE OF login_status ON engine_accounts
WHEN NEW.login_status = 'in_progress' OR OLD.login_status = 'in_progress'
BEGIN UPDATE engine_accounts SET login_started_at = CASE WHEN NEW.login_status = 'in_progress' THEN strftime('%Y-%m-%dT%H:%M:%fZ', app_now()) END WHERE id = NEW.id; END;

-- @ga:object trigger settings_attachment_max_i
CREATE TRIGGER settings_attachment_max_i BEFORE INSERT ON settings
WHEN NEW.key = 'chat.attachment_max_bytes' AND NOT (
  (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 104857600))
  AND (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.created_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.created_by AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings: chat.attachment_max_bytes phải là số nguyên byte 1–104857600, chỉ owner/admin ghi'); END;

-- @ga:object trigger settings_attachment_max_u
CREATE TRIGGER settings_attachment_max_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key = 'chat.attachment_max_bytes' OR OLD.key = 'chat.attachment_max_bytes') AND NOT (
  NEW.key = 'chat.attachment_max_bytes'
  AND (NEW.deleted_at IS NOT NULL OR (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 104857600))
  AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.updated_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
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
WHEN NOT (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.created_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.created_by AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system'))
BEGIN SELECT RAISE(ABORT, 'Kho nhân vật (v2.3.0): chỉ owner/admin (hoặc actor system lúc cài gói khi tạo workspace) thêm nhân vật / cài gói skin'); END;

-- @ga:object trigger skin_assets_writer_u
CREATE TRIGGER skin_assets_writer_u BEFORE UPDATE ON skin_assets
WHEN app_maint() = 0 AND NOT EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.updated_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin'))
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
WHEN NEW.key IN ('avatar.transient_seconds', 'avatar.idle_after_minutes', 'ui.avatar_motion') AND NOT (COALESCE(CASE NEW.key WHEN 'avatar.transient_seconds' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 600) WHEN 'avatar.idle_after_minutes' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 1440) WHEN 'ui.avatar_motion' THEN (json_extract(NEW.value_json, '$') IN ('full', 'subtle', 'off')) END, 0) AND (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.created_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors x WHERE x.id = NEW.created_by AND x.workspace_id = NEW.workspace_id AND x.kind = 'system' AND x.system_key = 'system')))
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.0): avatar.transient_seconds = số nguyên giây 1–600 (mặc định 20) · avatar.idle_after_minutes = số nguyên phút 1–1440 (mặc định 10) · ui.avatar_motion = "full" | "subtle" | "off" (mặc định "full") — chỉ owner/admin ghi'); END;

-- @ga:object trigger settings_avatar_u
CREATE TRIGGER settings_avatar_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN (NEW.key IN ('avatar.transient_seconds', 'avatar.idle_after_minutes', 'ui.avatar_motion') OR OLD.key IN ('avatar.transient_seconds', 'avatar.idle_after_minutes', 'ui.avatar_motion')) AND NOT (NEW.key IS OLD.key AND COALESCE(CASE NEW.key WHEN 'avatar.transient_seconds' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 600) WHEN 'avatar.idle_after_minutes' THEN (json_type(NEW.value_json) = 'integer' AND CAST(NEW.value_json AS INTEGER) BETWEEN 1 AND 1440) WHEN 'ui.avatar_motion' THEN (json_extract(NEW.value_json, '$') IN ('full', 'subtle', 'off')) END, 0) AND EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.updated_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')))
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
  SELECT RAISE(ABORT, 'settings (v2.3.2): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace được ghi / sửa / xoá mềm (created_by / updated_by); xoá cứng chỉ trong bảo trì') WHERE NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.created_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = NEW.created_by AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'settings (v2.3.2): backup.remote_anchor = {"url": "https://<host>/<path>", "secret_id": secret cùng workspace, còn sống, active, allowed_host = <host>} — neo audit ngoài máy chỉ qua HTTPS + token gắn host; đổi host = nhập token mới; SSH chưa hỗ trợ ở MVP') WHERE NOT EXISTS (SELECT 1 FROM secrets rs WHERE rs.id = json_extract(NEW.value_json, '$.secret_id') AND rs.workspace_id = NEW.workspace_id AND rs.deleted_at IS NULL AND rs.status = 'active' AND substr(json_extract(NEW.value_json, '$.url'), 1, 8) = 'https://' AND rs.allowed_host = substr(substr(json_extract(NEW.value_json, '$.url'), 9), 1, instr(substr(json_extract(NEW.value_json, '$.url'), 9), '/') - 1));
END;

-- @ga:object trigger settings_remote_anchor_u
CREATE TRIGGER settings_remote_anchor_u BEFORE UPDATE OF key, value_json, deleted_at, workspace_id ON settings
WHEN NEW.key = 'backup.remote_anchor' OR OLD.key = 'backup.remote_anchor'
BEGIN
  SELECT RAISE(ABORT, 'settings (v2.3.2): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace được ghi / sửa / xoá mềm (created_by / updated_by); xoá cứng chỉ trong bảo trì') WHERE NOT (EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.updated_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner') OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = NEW.updated_by AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system'));
  SELECT RAISE(ABORT, 'settings (v2.3.2): backup.remote_anchor = {"url": "https://<host>/<path>", "secret_id": secret cùng workspace, còn sống, active, allowed_host = <host>} — neo audit ngoài máy chỉ qua HTTPS + token gắn host; đổi host = nhập token mới; SSH chưa hỗ trợ ở MVP') WHERE NOT (NEW.key IS OLD.key AND (NEW.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM secrets rs WHERE rs.id = json_extract(NEW.value_json, '$.secret_id') AND rs.workspace_id = NEW.workspace_id AND rs.deleted_at IS NULL AND rs.status = 'active' AND substr(json_extract(NEW.value_json, '$.url'), 1, 8) = 'https://' AND rs.allowed_host = substr(substr(json_extract(NEW.value_json, '$.url'), 9), 1, instr(substr(json_extract(NEW.value_json, '$.url'), 9), '/') - 1))));
END;

-- @ga:object trigger settings_remote_anchor_d
CREATE TRIGGER settings_remote_anchor_d BEFORE DELETE ON settings
WHEN OLD.key = 'backup.remote_anchor' AND app_maint() = 0
BEGIN SELECT RAISE(ABORT, 'settings (v2.3.2): backup.remote_anchor định tuyến credential — chỉ OWNER còn là thành viên (admin cũng không) hoặc actor system của workspace được ghi / sửa / xoá mềm (created_by / updated_by); xoá cứng chỉ trong bảo trì'); END;

-- @ga:object trigger secrets_writer_i
CREATE TRIGGER secrets_writer_i BEFORE INSERT ON secrets
WHEN NOT (CASE WHEN NEW.kind = 'anchor_remote_token' THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.created_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
               ELSE (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.created_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = NEW.created_by AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')) END)
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.2): chỉ owner / admin còn là thành viên hoặc actor system của workspace tạo / thay bí mật; kind anchor_remote_token (token gắn đích) CHỈ OWNER — created_by / updated_by; bảo trì (xoay KEK) miễn'); END;

-- @ga:object trigger secrets_writer_u
CREATE TRIGGER secrets_writer_u BEFORE UPDATE OF kind, label, ciphertext, nonce, wrapped_dek, dek_nonce, kek_id, alg, last4, fingerprint, status, rotated_from_id, allowed_host, workspace_id, deleted_at ON secrets
WHEN app_maint() = 0 AND NOT (CASE WHEN NEW.kind = 'anchor_remote_token' THEN EXISTS (SELECT 1 FROM actors ow JOIN workspace_members om ON om.workspace_id = ow.workspace_id AND om.user_id = ow.user_id WHERE ow.id = NEW.updated_by AND ow.workspace_id = NEW.workspace_id AND ow.kind = 'user' AND om.removed_at IS NULL AND om.access_level = 'owner')
                                   ELSE (EXISTS (SELECT 1 FROM actors sa JOIN workspace_members sm ON sm.workspace_id = sa.workspace_id AND sm.user_id = sa.user_id WHERE sa.id = NEW.updated_by AND sa.workspace_id = NEW.workspace_id AND sa.kind = 'user' AND sm.removed_at IS NULL AND sm.access_level IN ('owner', 'admin')) OR EXISTS (SELECT 1 FROM actors sy WHERE sy.id = NEW.updated_by AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')) END)
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.2): chỉ owner / admin còn là thành viên hoặc actor system của workspace tạo / thay bí mật; kind anchor_remote_token (token gắn đích) CHỈ OWNER — created_by / updated_by; bảo trì (xoay KEK) miễn'); END;

-- @ga:object trigger secrets_allowed_host_u
CREATE TRIGGER secrets_allowed_host_u BEFORE UPDATE OF allowed_host ON secrets
WHEN NEW.allowed_host IS NOT OLD.allowed_host
BEGIN SELECT RAISE(ABORT, 'secrets (v2.3.2): allowed_host ghi một lần — đổi host đích = nhập token mới (secret mới)'); END;

-- @ga:object trigger engine_installs_writer_i
CREATE TRIGGER engine_installs_writer_i BEFORE INSERT ON engine_installs
WHEN NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = NEW.created_by AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_installs (v2.3.2): trạng thái cài CLI chỉ actor system của workspace (app theo ga-engine-install status) ghi — owner / admin / tác tử khác không ghi tay (created_by / updated_by)'); END;

-- @ga:object trigger engine_installs_writer_u
CREATE TRIGGER engine_installs_writer_u BEFORE UPDATE ON engine_installs
WHEN NOT EXISTS (SELECT 1 FROM actors sy WHERE sy.id = NEW.updated_by AND sy.workspace_id = NEW.workspace_id AND sy.system_key = 'system')
BEGIN SELECT RAISE(ABORT, 'engine_installs (v2.3.2): trạng thái cài CLI chỉ actor system của workspace (app theo ga-engine-install status) ghi — owner / admin / tác tử khác không ghi tay (created_by / updated_by)'); END;
