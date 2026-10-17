// SYS-63…69 — Kho nhân vật + lịch sử / khôi phục avatar của Role.
import { boundedNfkc } from '@ga/contracts';
import type { AvatarRow, CharacterLibraryView, ReadTx } from '@ga/db/repos';
import { defineHandler, type Handler } from '../http/define-handler.ts';
import { ApiError, notFound } from '../http/errors.ts';
import { chooseAvatar, resolveAvatarChoice } from './avatar-choice.ts';
import { asBool, asNum, asStr, idOf } from './shared.ts';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Chuỗi hiển thị trong seed ("Thục", "Afi Labs — …") ⇒ khoá ổn định `[a-z][a-z0-9_]*` (hợp đồng đòi KeyStr; chữ hiển thị do i18n). */
export function keyify(value: string | null, fallback: string): string {
  const bounded = value === null ? null : boundedNfkc(value, 256);
  if (bounded === null) return fallback;
  // đầu vào đã qua boundedNfkc ≤ 256 ký tự ⇒ NFD chỉ nở vài lần (tách dấu), có trần
  // lint-allow no-raw-normalize: tách dấu tiếng Việt trên chuỗi đã bị chặn kích thước
  const decomposed = bounded.normalize('NFD');
  const k = decomposed
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return /^[a-z]/.test(k) ? k : fallback;
}

function characterRow(v: CharacterLibraryView) {
  const id = asStr(v.skin_asset_id);
  const displayId = asStr(v.display_id);
  if (id === null || displayId === null) throw new ApiError('internal');
  return {
    id,
    displayId,
    assetCode: asStr(v.asset_code) ?? '',
    nameVi: asStr(v.name_vi) ?? '',
    nameZh: asStr(v.name_zh) ?? '',
    faction: keyify(asStr(v.faction), 'none'),
    charKind: keyify(asStr(v.char_kind), 'none'),
    gender: keyify(asStr(v.gender), 'none'),
    packSlug: asStr(v.pack_slug) ?? '',
    packVersion: asStr(v.pack_version) ?? '',
    source: keyify(asStr(v.source), 'unknown'),
    license: asStr(v.license) ?? '',
    attribution: asStr(v.attribution),
    isEnabled: asNum(v.is_enabled) === 1,
    isSelectable: asBool(v.is_selectable),
    rolesUsing: asNum(v.roles_using),
  };
}

function libraryRow(tx: ReadTx, skinId: string): CharacterLibraryView {
  const row = tx.avatar.library().find((v) => asStr(v.skin_asset_id) === skinId);
  if (row === undefined) throw notFound();
  return row;
}

/** Tham số ChibiParamsV1: JSON do seed / L-CHIBI giữ; hỏng ⇒ {} (không làm sập màn). */
function parseParams(s: string | null): Json {
  if (s === null) return {};
  try {
    return JSON.parse(s) as Json;
  } catch {
    return {};
  }
}

function identityPart(params: Json, key: string): Json {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return {};
  const identity = params.identity;
  if (identity === null || typeof identity !== 'object' || Array.isArray(identity)) return {};
  return identity[key] ?? {};
}

/** Avatar → Role sở hữu. Repo chưa có `avatar.get(id)` ⇒ dò lịch sử từng Role (ít Role / workspace; xem báo cáo). */
function findAvatar(tx: ReadTx, avatarId: string): AvatarRow | null {
  for (const r of tx.roles.list({ includeDeleted: true })) {
    const hit = tx.avatar.history(r.id).find((a) => a.id === avatarId);
    if (hit !== undefined) return hit;
  }
  return null;
}

export const characterHandlers: readonly Handler[] = [
  defineHandler('SYS-63', ({ query }, ctx) =>
    ctx.read((tx) =>
      tx.avatar
        .library()
        .map(characterRow)
        .filter((c) => query.enabled === undefined || c.isEnabled === query.enabled),
    ),
  ),

  defineHandler('SYS-64', ({ params }, ctx) => {
    const ref = ctx.ref('SN', params.characterRef);
    return ctx.read((tx) => {
      const v = libraryRow(tx, ref.id);
      const params_ = parseParams(asStr(v.params_json));
      const using = tx.avatar
        .states()
        .filter((s) => asStr(s.skin_asset_id) === ref.id)
        .flatMap((s) => {
          const id = asStr(s.role_id);
          const display = asStr(s.role_display_id);
          return id === null || display === null ? [] : [{ id, displayId: display }];
        });
      return {
        ...characterRow(v),
        params: params_,
        paramsSchemaVersion: asNum(v.params_schema_version),
        identity: {
          traits: identityPart(params_, 'traits'),
          colors: identityPart(params_, 'colors'),
          props: identityPart(params_, 'props'),
          refs: identityPart(params_, 'refs'),
        },
        roles: using.slice(0, 500),
      };
    });
  }),

  defineHandler('SYS-65', ({ params, body }, ctx) => {
    const character = ctx.ref('SN', params.characterRef);
    const role = ctx.ref('RL', body.roleRef);
    return ctx.write((tx) => {
      // DB kiểm nhân vật còn bật (`db.character_library`) và Role thuộc workspace
      const { avatar } = tx.avatar.assignLibrary(role.id, character.id);
      return { avatar: idOf(avatar) };
    });
  }),

  defineHandler('SYS-66', ({ params, body }, ctx) => {
    const ref = ctx.ref('SN', params.characterRef);
    return ctx.write((tx) => {
      tx.avatar.setSkinEnabled(ref.id, body.enabled);
      return { isEnabled: body.enabled, rolesUsing: asNum(libraryRow(tx, ref.id).roles_using) };
    });
  }),

  defineHandler('SYS-67', ({ params }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    return ctx.read((tx) => {
      const role = tx.roles.get(ref.id);
      if (role === null || role.deleted_at !== null) throw notFound();
      return tx.avatar.history(role.id).map((a) => {
        const skin = a.skin_asset_id === null ? null : tx.avatar.skinAsset(a.skin_asset_id);
        return {
          id: a.id,
          displayId: a.display_id,
          source: a.source,
          skinAsset: skin === null ? null : idOf(skin),
          isCurrent: role.avatar_id === a.id,
          createdAt: a.created_at,
        };
      });
    });
  }),

  defineHandler('SYS-68', ({ params, body }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    const choice = resolveAvatarChoice(ctx, body);
    return ctx.write((tx) => {
      const role = tx.roles.get(ref.id);
      if (role === null || role.deleted_at !== null) throw notFound();
      return { avatar: idOf(chooseAvatar(tx, role.id, choice)) };
    });
  }),

  defineHandler('SYS-69', ({ params }, ctx) => {
    const ref = ctx.ref('AV', params.avatarRef);
    return ctx.write((tx) => {
      const avatar = findAvatar(tx, ref.id);
      if (avatar === null) throw notFound();
      const role = tx.roles.get(avatar.role_id);
      if (role === null || role.deleted_at !== null) throw notFound();
      // khôi phục chỉ AV của CHÍNH Role (repo + trigger roles_avatar_u kiểm lại)
      tx.avatar.restore(role.id, avatar.id);
      return { avatar: idOf(avatar) };
    });
  }),
];
