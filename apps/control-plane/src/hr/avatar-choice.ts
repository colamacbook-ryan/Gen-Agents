// Chọn ảnh đại diện (SYS-31 `avatar`, SYS-68): Ref của body ĐI QUA ctx.ref trước khi ghi (rào IDOR).
//   - library  → Ref<SN> phải thuộc workspace; DB kiểm nhân vật còn bật (`db.character_library`).
//   - monogram → không cần gì thêm.
//   - upload   → Ref<AT> qua ctx.ref (không lộ tenant khác) rồi TỪ CHỐI: repo chưa có đọc `message_attachments` / `blobs`
//                (trạng thái quét `clean`, mime theo nội dung, kích thước ảnh) ⇒ không kiểm được ⇒ fail-closed
//                `upload.not_clean` (reason=unverified). Mở khi L-DB có repo đính kèm + L-SYS có đường upload SYS-21.
//   - generated → chưa chốt cách sinh (đặc tả PS §4.7) ⇒ 400.
import type { AvatarChoice } from '@ga/contracts';
import type { AvatarRow, WriteTx } from '@ga/db/repos';
import type { z } from 'zod';
import type { HandlerContext } from '../context/context.ts';
import { ApiError } from '../http/errors.ts';

export type AvatarChoiceInput = z.output<typeof AvatarChoice>;
export type ResolvedAvatarChoice = { source: 'library'; skinAssetId: string } | { source: 'monogram' };

export function resolveAvatarChoice(ctx: HandlerContext, choice: AvatarChoiceInput): ResolvedAvatarChoice {
  switch (choice.source) {
    case 'library':
      return { source: 'library', skinAssetId: ctx.ref('SN', choice.skinAssetRef).id };
    case 'monogram':
      return { source: 'monogram' };
    case 'upload':
      ctx.ref('AT', choice.attachmentRef);
      throw new ApiError('upload.not_clean', { reason: 'unverified' });
    case 'generated':
      throw new ApiError('validation.failed', { field: 'avatar', reason: 'generated_unsupported' });
  }
}

export function chooseAvatar(tx: WriteTx, roleId: string, choice: ResolvedAvatarChoice): AvatarRow {
  return choice.source === 'library'
    ? tx.avatar.assignLibrary(roleId, choice.skinAssetId).avatar
    : tx.avatar.assignMonogram(roleId).avatar;
}
