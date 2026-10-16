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
export const TENANT_WS = '01JWS00000000000000000AFI0';
export const TENANT_ACTOR = '01JWS00000000000000000ACT0';

/** Workspace hệ thống + một tenant + actor hệ thống mỗi bên (tối thiểu để ghi các bảng có created_by). */
export function seedMinimal(conn: AppConnection): void {
  const db = conn.db;
  db.prepare(
    "INSERT INTO workspaces (id, kind, slug, name, short_code) VALUES (?, 'system', 'system', 'System', 'SYS0')",
  ).run(SYS_WS);
  db.prepare(
    "INSERT INTO workspaces (id, kind, slug, name, short_code) VALUES (?, 'tenant', 'afi', 'Afi', '7K2Q')",
  ).run(TENANT_WS);
  const actor = db.prepare(
    "INSERT INTO actors (id, workspace_id, kind, system_key, label) VALUES (?, ?, 'system', 'system', 'System')",
  );
  actor.run(SYS_ACTOR, SYS_WS);
  actor.run(TENANT_ACTOR, TENANT_WS);
}

export function count(conn: AppConnection, sql: string, ...params: unknown[]): number {
  const row = conn.db.prepare(sql).get(...params) as Record<string, number>;
  return Object.values(row)[0] as number;
}
