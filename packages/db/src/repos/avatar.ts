// Họ avatar + Kho nhân vật (DATABASE §5.2, v2.3.0 CONTRACT-r9). avatars append-only: gán = tạo AV- mới rồi trỏ
// roles.avatar_id; khôi phục = trỏ lại AV cũ của CHÍNH Role. Trạng thái hiển thị (16 trạng thái) đọc từ v_role_avatar_state.
import type { AvatarRow, CharacterLibraryView, RoleAvatarStateView, RoleRow, SkinAssetRow } from './types.ts';

export interface AvatarReads {
  current(roleId: string): AvatarRow | null;
  history(roleId: string): AvatarRow[];
  /** Một hàng mỗi Role: state + state_rank + nguồn (DB v2.3.0). */
  state(roleId: string): RoleAvatarStateView | null;
  states(): RoleAvatarStateView[];
  library(): CharacterLibraryView[];
  skinAsset(skinAssetId: string): SkinAssetRow | null;
}

export interface AvatarRepo extends AvatarReads {
  /** Ảnh thư viện: chép gói / mã / license / sha256 / ghi công từ skin_assets (DB kiểm khớp). */
  assignLibrary(roleId: string, skinAssetId: string): { avatar: AvatarRow; role: RoleRow };
  assignUpload(
    roleId: string,
    input: {
      blobId: string;
      mime: NonNullable<AvatarRow['mime']>;
      sizeBytes: number;
      width: number;
      height: number;
      crop?: { x: number; y: number; zoom: number } | null;
    },
  ): { avatar: AvatarRow; role: RoleRow };
  assignMonogram(roleId: string): { avatar: AvatarRow; role: RoleRow };
  /** Trỏ lại một AV cũ của chính Role. */
  restore(roleId: string, avatarId: string): RoleRow;
  /** Bật / tắt nhân vật trong Kho (owner / admin). */
  setSkinEnabled(skinAssetId: string, enabled: boolean): SkinAssetRow;
}
