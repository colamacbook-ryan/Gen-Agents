// Họ avatar + Kho nhân vật trên SQLite: avatars append-only, roles.avatar_id trỏ AV- của chính Role (DB ép), ảnh thư viện
// chép gói / mã / license / sha256 / ghi công từ skin_assets (DB kiểm khớp + nhân vật còn bật).
import type { AvatarRepo } from '../avatar.ts';
import { invalidInput } from '../errors.ts';
import type { AvatarRow, CharacterLibraryView, RoleAvatarStateView, RoleRow, SkinAssetRow } from '../types.ts';
import { audited, type Ctx, getRow, insertRow, mustGetRow, selectAll, updateRow, Where } from './ctx.ts';

export function avatarRepo(ctx: Ctx): AvatarRepo {
  const assign = (roleId: string, values: Record<string, unknown>) => {
    const before = mustGetRow<RoleRow>(ctx, 'roles', roleId);
    const avatar = insertRow<AvatarRow>(ctx, 'avatars', { role_id: roleId, ...values });
    const role = updateRow<RoleRow>(ctx, 'roles', roleId, { avatar_id: avatar.id });
    audited(ctx, {
      action: 'avatar.assign',
      table: 'roles',
      row: role,
      before,
      roleId,
      detail: { avatar: avatar.display_id },
    });
    return { avatar, role };
  };
  return {
    current: (roleId) => {
      const role = getRow<RoleRow>(ctx, 'roles', roleId);
      return role?.avatar_id ? getRow<AvatarRow>(ctx, 'avatars', role.avatar_id) : null;
    },
    history: (roleId) => selectAll<AvatarRow>(ctx, 'avatars', new Where(ctx).eq('role_id', roleId)),
    state: (roleId) =>
      ctx.r.get<RoleAvatarStateView>('SELECT * FROM v_role_avatar_state WHERE workspace_id = ? AND role_id = ?', [
        ctx.ws,
        roleId,
      ]) ?? null,
    states: () => ctx.r.all<RoleAvatarStateView>('SELECT * FROM v_role_avatar_state WHERE workspace_id = ?', [ctx.ws]),
    library: () =>
      ctx.r.all<CharacterLibraryView>('SELECT * FROM v_character_library WHERE workspace_id = ? ORDER BY display_seq', [
        ctx.ws,
      ]),
    skinAsset: (id) => getRow<SkinAssetRow>(ctx, 'skin_assets', id),
    assignLibrary: (roleId, skinAssetId) => {
      const s = mustGetRow<SkinAssetRow>(ctx, 'skin_assets', skinAssetId);
      return assign(roleId, {
        source: 'library',
        skin_asset_id: s.id,
        skin_pack_slug: s.pack_slug,
        skin_asset_code: s.asset_code,
        skin_license: s.license,
        skin_attribution: s.attribution,
        skin_sha256: s.sha256,
      });
    },
    assignUpload: (roleId, i) => {
      if (!Number.isSafeInteger(i.sizeBytes) || i.sizeBytes <= 0) throw invalidInput('sizeBytes > 0');
      return assign(roleId, {
        source: 'upload',
        blob_id: i.blobId,
        mime: i.mime,
        size_bytes: i.sizeBytes,
        width: i.width,
        height: i.height,
        crop_x: i.crop?.x ?? null,
        crop_y: i.crop?.y ?? null,
        crop_zoom: i.crop?.zoom ?? null,
      });
    },
    assignMonogram: (roleId) => assign(roleId, { source: 'monogram' }),
    restore: (roleId, avatarId) => {
      const before = mustGetRow<RoleRow>(ctx, 'roles', roleId);
      const role = updateRow<RoleRow>(ctx, 'roles', roleId, { avatar_id: avatarId });
      return audited(ctx, { action: 'avatar.restore', table: 'roles', row: role, before, roleId });
    },
    setSkinEnabled: (id, enabled) => {
      const before = mustGetRow<SkinAssetRow>(ctx, 'skin_assets', id);
      const row = updateRow<SkinAssetRow>(ctx, 'skin_assets', id, { is_enabled: enabled ? 1 : 0 });
      return audited(ctx, { action: 'skin_asset.enable', table: 'skin_assets', row, before });
    },
  };
}
