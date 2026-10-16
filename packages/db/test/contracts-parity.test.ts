// Hợp đồng @ga/contracts phải khớp DB đã vendor: prefix display_id, enum phiên / tool UI / capability / container,
// 16 trạng thái avatar, và ánh xạ lỗi RAISE → mã i18n (G-03). Lệch ⇒ đỏ ngay khi `pnpm db:sync` đổi DB.
import {
  AGENT_KINDS,
  AUTH_METHODS,
  AVATAR_STATES,
  CAPABILITY_AUTH_MODES,
  CAPABILITY_CONFIDENCE,
  DesiredState,
  ENTITY_TYPES,
  mapDbError,
  NATIVE_MEMORY_STATES,
  ObservedState,
  SESSION_PHASES,
  SESSION_STATUSES,
  SESSION_TRIGGERS,
  ToolArgs,
  UI_TOOLS,
  UpdaterStatus,
} from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AppConnection, openScratch } from '../src/connection.ts';
import { DB_ENUMS } from '../src/generated/enums.ts';
import { TABLES } from '../src/generated/schema.ts';
import { migrate, SQLITE_MIGRATIONS_DIR } from '../src/runner/index.ts';
import { FakeClock } from './helpers.ts';

let conn: AppConnection;
beforeAll(() => {
  conn = openScratch({ clock: new FakeClock('2026-10-14T08:00:00.000Z') });
  migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
});
afterAll(() => conn.close());

const sorted = (xs: readonly (string | number)[]) => [...xs].map(String).sort();

describe('contracts ↔ DB', () => {
  it('ENTITY_TYPES phủ đúng mọi bảng có display_id (và chỉ những bảng đó)', () => {
    const withDisplay = (TABLES as readonly string[]).filter(
      (t) =>
        (
          conn.db
            .prepare("SELECT count(*) AS n FROM pragma_table_info(?) WHERE name IN ('display_id', 'display_seq')")
            .get(t) as {
            n: number;
          }
        ).n === 2,
    );
    expect(sorted(Object.values(ENTITY_TYPES))).toEqual(sorted(withDisplay));
  });

  it('enum phiên khớp CHECK của bảng sessions', () => {
    expect(sorted(AGENT_KINDS)).toEqual(sorted(DB_ENUMS['sessions.agent_kind']));
    expect(sorted(SESSION_TRIGGERS)).toEqual(sorted(DB_ENUMS['sessions.trigger']));
    expect(sorted(SESSION_STATUSES)).toEqual(sorted(DB_ENUMS['sessions.status']));
    expect(sorted(NATIVE_MEMORY_STATES)).toEqual(sorted(DB_ENUMS['sessions.native_memory']));
    expect(sorted(SESSION_PHASES)).toEqual(sorted(DB_ENUMS['sessions.phase']));
  });

  it('tool UI = ui_actions.action; capability; auth_method; container; updater; remember.kind', () => {
    expect(sorted(UI_TOOLS)).toEqual(sorted(DB_ENUMS['ui_actions.action']));
    expect(sorted(CAPABILITY_CONFIDENCE)).toEqual(sorted(DB_ENUMS['capabilities.confidence']));
    expect(sorted(CAPABILITY_AUTH_MODES)).toEqual(sorted(DB_ENUMS['capabilities.auth_mode']));
    expect(sorted(AUTH_METHODS)).toEqual(sorted(DB_ENUMS['engine_accounts.auth_method']));
    expect(sorted(DesiredState.options)).toEqual(sorted(DB_ENUMS['containers.desired_state']));
    expect(sorted(ObservedState.options)).toEqual(sorted(DB_ENUMS['containers.observed_state']));
    const run = UpdaterStatus.shape.run.unwrap().shape;
    expect(sorted(run.status.options)).toEqual(sorted(DB_ENUMS['update_runs.status']));
    expect(sorted(run.trigger.options)).toEqual(sorted(DB_ENUMS['update_runs.trigger']));
    expect(sorted(ToolArgs.remember.shape.kind.options)).toEqual(sorted(DB_ENUMS['memories.kind']));
  });

  it('16 trạng thái avatar = các khoá của v_role_avatar_state', () => {
    const sql = (
      conn.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'view' AND name = 'v_role_avatar_state'").get() as {
        sql: string;
      }
    ).sql;
    const labelCase = sql.slice(sql.indexOf('CASE p.state'), sql.indexOf('AS state_label'));
    const keys = [...labelCase.matchAll(/WHEN '([a-z0-9_]+)' THEN/g)].map((m) => m[1] as string);
    expect(keys).toHaveLength(16);
    expect(sorted(AVATAR_STATES)).toEqual(sorted(keys));
  });

  it('mọi thông điệp RAISE của trigger đều ánh xạ được; họ chính không rơi về mặc định', () => {
    const sqls = (
      conn.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger'").all() as Array<{ sql: string }>
    ).map((r) => r.sql);
    const msgs = new Set<string>();
    for (const s of sqls) {
      for (const m of s.matchAll(/RAISE\(ABORT, '((?:[^']|'')*)'\)/g)) msgs.add((m[1] as string).replaceAll("''", "'"));
    }
    expect(msgs.size).toBeGreaterThan(200);
    const byCode = new Map<string, number>();
    for (const m of msgs) byCode.set(mapDbError(m), (byCode.get(mapDbError(m)) ?? 0) + 1);
    for (const m of msgs) {
      if (m.startsWith('UNIQUE (chống REPLACE')) expect(mapDbError(m)).toBe('db.replace_forbidden');
      if (m.startsWith('append-only')) expect(mapDbError(m)).toBe('db.append_only');
      if (m.startsWith('immutable identity')) expect(mapDbError(m)).toBe('db.immutable_identity');
    }
    // ghi lại độ phủ để lane DB / L-DB thấy (G-03): phần còn lại về db.rule_violation cho tới khi DB có mã ổn định
    expect(byCode.get('db.replace_forbidden')).toBeGreaterThan(50);
  });
});
