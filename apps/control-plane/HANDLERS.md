# Viết handler cho M2 (L-SYS, L-HR, L-GW, L-WORK, L-OPS)

Đọc thêm BẮT BUỘC: [`HANDLER-OBLIGATIONS.md`](./HANDLER-OBLIGATIONS.md) — mục nào khung đã tự ép (✓), mục nào lane phải tự làm (✗).

## 1. Handler = một route của registry
- Tệp `src/<thư-mục-của-lane>/handlers.ts` xuất `export const handlers: readonly Handler[] = [...]`.
- Thêm ĐÚNG MỘT dòng `...handlers` của lane vào `src/http/handlers.ts` (`PRODUCTION_HANDLERS`). Route chưa có handler ⇒ 404.
- `defineHandler('SYS-34', (input, ctx) => …)`: kiểu `input.params/query/body/headers` và kiểu trả về suy từ hợp đồng; id lạ
  ⇒ lỗi biên dịch. Input ĐÃ validate strict. Output được kiểm `responseSchemaOf` trước khi gửi: thừa / sai trường ⇒ 500.
- Không tự kiểm phiên / CSRF / quyền `route.auth` / `ownerWhen` / O4 / trần thân / idempotency — chuỗi `src/http/pipeline.ts`
  làm cho MỌI route, theo thứ tự cố định. Handler chỉ lo nghiệp vụ.
- `noContent()` ⇒ trả `undefined`; `sse` / `csv` / `binary` ⇒ trả `{ raw, filename? }` (không có schema ⇒ tự chịu nội dung).

## 2. `ctx` — mọi quyền lực đi qua đây
| | |
|---|---|
| `ctx.actor` | `{ id, userId, workspaceId, accessLevel, authLevel }` — từ PHIÊN, không bao giờ từ request |
| `ctx.ref('RL', ref)` | ULID / display_id ⇒ `{ id, displayId }` CHỈ trong workspace của actor; không thấy ⇒ 404 |
| `ctx.read(tx => …)` / `ctx.write(tx => …, { reason })` | DataStore, workspace + `app_actor()` = của phiên; đồng bộ, không await / mạng bên trong |
| `ctx.events.publish(ev, { recipientUserId? })` | bus SSE, workspace = của phiên (truyền `workspaceId` ⇒ lỗi) |
| `throw new ApiError('gate.card_blocked', { reason })` | lỗi có chủ đích; `DbRuleError` của repo tự đổi mã; lỗi lạ ⇒ 500 không lộ gì |

## 3. Ví dụ (≈ 20 dòng)
```ts
// src/onboarding/handlers.ts
import { defineHandler, type Handler } from '../http/define-handler.ts';
export const handlers: readonly Handler[] = [
  defineHandler('SYS-34', ({ params, body }, ctx) => {
    const src = ctx.ref('RL', params.roleRef);                    // 404 nếu khác workspace
    const role = ctx.write((tx) => tx.roles.create({ name: body.name, color: tx.roles.get(src.id)?.color ?? 'jade' }));
    return { role: { id: role.id, displayId: role.display_id } };  // kiểm schema trước khi gửi
  }),
];

// test/onboarding/clone.test.ts
import { makeTestApp, tk } from '../http/harness.ts';
const t = makeTestApp({ handlers });
const mine = tk.CROSS_TENANT_SEEDERS.RL!({ world: t.world, tenant: t.world.tenants.A, seeded: new Map() });
it('admin clone được Role của mình', async () => {
  const res = await t.as('A.admin').call('SYS-34', { params: { roleRef: mine.displayId }, body: { name: 'Mai 2' } });
  expect(res.status).toBe(200);
});
```
`as('A.owner' | 'A.admin' | 'A.operator' | 'A.viewer' | 'B.*' | 'anon')` tự gắn cookie + CSRF + Origin + Idempotency-Key;
mọi response JSON qua `findCredentialLike`. `t.recovery.setRecovery('outage')` để thử O4; `t.calls.get(id)` = số lần chạy.
`@ga/testkit` chỉ import ĐỘNG ngoài `testing/**` — dùng `tk` từ `test/http/harness.ts`. Phiên giả cho `runTurn`:
`new tk.FakeSessionsService().script({ reject: 'recovery_mode' })`.

## 4. Meta-test chạy miễn phí trên route của bạn
`test/meta/security.test.ts` tự lấy `PRODUCTION_HANDLERS`: 401 / 403 (viewer, admin ở O, operator, ownerWhen) / CSRF / mọi
lý do O4 / 400 khoá lạ / 413 / CHÉO TENANT cho mọi trường Ref ở params + query + body / header bảo mật / đường đi hợp lệ.
- Route có Ref prefix mới ⇒ thêm seeder vào `packages/testkit/src/seeders.ts` (`CROSS_TENANT_SEEDERS`), dựng hàng THẬT qua
  repo. Thiếu ⇒ đỏ "chưa chứng minh chống IDOR cho <prefix>".
- Đối chứng: cùng request với ref của chính tenant A phải KHÔNG ra 404 / 400 / 500 — seeder phải tạo hàng dùng được.
- "Đường đi hợp lệ": owner + mẫu request từ hợp đồng ⇒ handler chạy và < 500 (handler không được 500 với input hợp lệ).

## 5. Lệnh
`pnpm --filter @ga/control-plane test` · `pnpm api:coverage` (handler / 201 theo lane + route thiếu seeder) ·
`node apps/control-plane/test/meta/mutants.mjs` (đột biến trên worktree tạm).
