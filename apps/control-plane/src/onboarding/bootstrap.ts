// Khởi động bản cài (G1 → G2): seed global → owner `admin` (mật khẩu lần đầu, bắt đổi — L-SEC) → workspace tenant + membership
// owner. Owner CẦN membership ngay từ lúc đăng nhập lần đầu: edge suy workspace / quyền từ membership (http/session.ts) và
// EXT-03 trả `workspace`; onboarding bước 1 (SYS-02) chỉ đổi tên / ngôn ngữ / múi giờ của workspace đã có.
//   - Idempotent: chạy lại sau khi hỏng giữa chừng ⇒ làm nốt phần thiếu (user có mà chưa có tenant ⇒ tạo tenant;
//     tenant có ⇒ `ensureWorkspaceSeed`). Không bao giờ tạo user / tenant thứ hai.
//   - Tên workspace tạm `Workspace` + mã ngắn ngẫu nhiên (owner đổi tên ở SYS-02).
import { randomInt } from 'node:crypto';
import type { SeedReference } from '@ga/contracts';
import type { DataStore } from '@ga/db/repos';

export interface BootstrapAuth {
  bootstrapOwner(opts: { displayName: string }): Promise<{ created: boolean }>;
}

export interface BootstrapDeps {
  store: DataStore;
  auth: BootstrapAuth;
  /** Tìm owner vừa tạo (L-SEC `SqliteAuthStore.findUserByUsername`). */
  findUserId(username: string): string | null;
  ownerUsername: string;
  seed: SeedReference;
}

export interface BootstrapResult {
  ownerCreated: boolean;
  tenantCreated: boolean;
  workspaceId: string;
}

const SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function randomShortCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
  return s;
}

export async function bootstrapInstall(deps: BootstrapDeps): Promise<BootstrapResult> {
  deps.store.installGlobal(deps.seed);
  const { created } = await deps.auth.bootstrapOwner({ displayName: 'Owner' });
  const tenants = deps.store.tenants();
  if (tenants.length > 1) throw new Error('bootstrap: có nhiều hơn một workspace tenant — bản self-host chỉ một');
  const existing = tenants[0];
  if (existing !== undefined) {
    deps.store.ensureWorkspaceSeed(existing.id, deps.seed);
    return { ownerCreated: created, tenantCreated: false, workspaceId: existing.id };
  }
  const ownerUserId = deps.findUserId(deps.ownerUsername);
  if (ownerUserId === null) throw new Error('bootstrap: không thấy user owner sau bootstrapOwner');
  const t = deps.store.createTenant(
    { slug: 'workspace', name: 'Workspace', shortCode: randomShortCode(), ownerUserId },
    deps.seed,
  );
  return { ownerCreated: created, tenantCreated: true, workspaceId: t.workspace.id };
}
