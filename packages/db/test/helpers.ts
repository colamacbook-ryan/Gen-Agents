import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '@ga/contracts';
import type { AppConnection } from '../src/connection.ts';

/** Đồng hồ giả: đặt / cộng giờ tường minh. Tạo mới ở mỗi test (không có trạng thái toàn cục — STD-11). */
export class FakeClock implements Clock {
  private t: number;
  constructor(iso: string) {
    this.t = Date.parse(iso);
  }
  now(): Date {
    return new Date(this.t);
  }
  set(iso: string): void {
    this.t = Date.parse(iso);
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const SYS_WS = '00000000000000000000000000';
export const SYS_ACTOR = '0000000000000000000000SYS1';
export const TENANT_WS = '01JWS00000000000000000AFQ0';
export const TENANT_ACTOR = '01JWS00000000000000000ACT0';

/** Workspace hệ thống + một tenant + actor hệ thống mỗi bên (tối thiểu để ghi các bảng có created_by). */
export function seedMinimal(conn: AppConnection): void {
  // DB v2.3.5: workspaces / actors có cổng người ghi — workspace + actor system đầu tiên chỉ tạo được trong conn.bootstrap
  // của CHÍNH workspace đó (app_bootstrap() = id workspace, app_actor() = actor system tự đăng ký)
  for (const [ws, actor, kind, slug, name, code] of [
    [SYS_WS, SYS_ACTOR, 'system', 'system', 'System', 'SYS0'],
    [TENANT_WS, TENANT_ACTOR, 'tenant', 'afi', 'Afi', '7K2Q'],
  ] as const) {
    conn.bootstrap({ workspaceId: ws, systemActorId: actor }, (w) => {
      w.run('INSERT INTO workspaces (id, kind, slug, name, short_code) VALUES (?, ?, ?, ?, ?)', [
        ws,
        kind,
        slug,
        name,
        code,
      ]);
      w.run(
        "INSERT INTO actors (id, workspace_id, kind, system_key, label) VALUES (?, ?, 'system', 'system', 'System')",
        [actor, ws],
      );
    });
  }
}

export function count(conn: AppConnection, sql: string, ...params: unknown[]): number {
  const row = conn.db.prepare(sql).get(...params) as Record<string, number>;
  return Object.values(row)[0] as number;
}
