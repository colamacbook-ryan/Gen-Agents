// Fixture cho test M2 (@ga/db/fixture): DataStore SQLite THẬT trên tệp tạm (mọi trigger / guard của DB), dựng bằng chính
// các repo + seed tham chiếu thật — không SQL tay:
//   bản cài (seed global) → owner (US-0001) → tenant (seed perWorkspace + owner) → Core agent SẴN SÀNG (consent nếu loại
//   Core agent đòi, container AI Hệ thống, tài khoản subscription, binding Hệ thống, CLI đã cài + kiểm giới hạn công cụ,
//   kiểm đăng nhập đạt trong container AI Hệ thống, model tác tử hệ thống hợp lệ) → tuỳ chọn N Role nháp.
// Loại Core agent đọc từ setting đã seed (system.core_agent_engine) — fixture không viết tên CLI / model cụ thể (STD-10).
// Khoá audit sinh ngẫu nhiên mỗi lần (không có khoá trong repo). Đồng hồ: ManualClock (đặt / cộng tường minh).
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Clock, SeedReference } from '@ga/contracts';
import { type AuditKeyring, masterKeyring } from '../../audit-writer/index.ts';
import { type AppConnection, openReader, openWriter } from '../../connection.ts';
import { type IdGenerator, sequentialIds, ulidGenerator } from '../../ids/index.ts';
import { migrate, SQLITE_MIGRATIONS_DIR } from '../../runner/index.ts';
import { verifySeedReference } from '../../seed/reference.ts';
import { createSqliteStore } from '../sqlite/store.ts';
import type { DataStore } from '../store.ts';
import type { EngineAccountRow, RoleRow } from '../types.ts';

/** Đồng hồ test: không trôi theo giờ thật; đặt / cộng tường minh. */
export class ManualClock implements Clock {
  private t: number;
  constructor(iso = '2026-10-17T08:00:00.000Z') {
    this.t = Date.parse(iso);
    if (!Number.isFinite(this.t)) throw new RangeError(`ManualClock: thời điểm lạ ${iso}`);
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

/** Seed tham chiếu của repo (db/spec/seed_reference.json), đã kiểm schema + sha256. */
export function referenceSeed(): SeedReference {
  const file = fileURLToPath(new URL('../../../../../db/spec/seed_reference.json', import.meta.url));
  return verifySeedReference(JSON.parse(readFileSync(file, 'utf8')));
}

export interface FixtureOptions {
  clock?: ManualClock;
  /** Mặc định sequentialIds('FXT') — id tất định theo thứ tự tạo. */
  newId?: IdGenerator;
  /** Mặc định true: Core agent sẵn sàng (cần để tạo Role, mở phiên AI Hệ thống). */
  coreAgentReady?: boolean;
  /** Tạo sẵn N Role nháp (cần Core agent sẵn sàng). */
  roles?: number;
}

export interface Fixture {
  store: DataStore;
  clock: ManualClock;
  writer: AppConnection;
  reader: AppConnection;
  auditKeys: AuditKeyring;
  seed: SeedReference;
  workspaceId: string;
  ownerUserId: string;
  ownerActorId: string;
  systemActorId: string;
  /** Loại Core agent (slug engine) đọc từ setting đã seed. */
  coreEngine: string;
  coreAccount: EngineAccountRow | null;
  systemContainerId: string | null;
  roles: RoleRow[];
  close(): void;
}

interface Template {
  path: string;
  clockIso: string;
  auditKeys: AuditKeyring;
  meta: Pick<
    Fixture,
    | 'workspaceId'
    | 'ownerUserId'
    | 'ownerActorId'
    | 'systemActorId'
    | 'coreEngine'
    | 'coreAccount'
    | 'systemContainerId'
    | 'roles'
  >;
}

const templates = new Map<string, Template>();
const templateDirs: string[] = [];
let exitHook = false;

/**
 * Dựng fixture trên tệp SQLite tạm (WAL). Nhớ gọi close() (afterEach) — xoá thư mục tạm.
 * Không truyền clock / newId ⇒ dùng bản mẫu dựng MỘT lần mỗi tiến trình rồi chép tệp (nhanh); id tạo sau đó là ULID
 * ngẫu nhiên theo đồng hồ. Truyền clock / newId ⇒ dựng từ đầu (tất định hoàn toàn).
 */
export function createFixture(opts: FixtureOptions = {}): Fixture {
  if (opts.clock !== undefined || opts.newId !== undefined) return buildFixture(opts);
  const key = `${opts.coreAgentReady !== false}:${opts.roles ?? 0}`;
  let t = templates.get(key);
  if (t === undefined) {
    const built = buildFixture(opts);
    built.writer.db.pragma('wal_checkpoint(TRUNCATE)');
    const dir = mkdtempSync(join(tmpdir(), 'ga-fixture-tpl-'));
    const path = join(dir, 'template.sqlite');
    built.writer.db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
    t = {
      path,
      clockIso: built.clock.now().toISOString(),
      auditKeys: built.auditKeys,
      meta: {
        workspaceId: built.workspaceId,
        ownerUserId: built.ownerUserId,
        ownerActorId: built.ownerActorId,
        systemActorId: built.systemActorId,
        coreEngine: built.coreEngine,
        coreAccount: built.coreAccount,
        systemContainerId: built.systemContainerId,
        roles: built.roles,
      },
    };
    built.close();
    templates.set(key, t);
    templateDirs.push(dir);
    if (!exitHook) {
      exitHook = true;
      process.once('exit', () => {
        for (const d of templateDirs) rmSync(d, { recursive: true, force: true });
      });
    }
  }
  const clock = new ManualClock(t.clockIso);
  const dir = mkdtempSync(join(tmpdir(), 'ga-fixture-'));
  const path = join(dir, 'gen.sqlite');
  copyFileSync(t.path, path);
  const writer = openWriter(path, { clock });
  const reader = openReader(path, { clock });
  const store = createSqliteStore({ writer, reader, auditKeys: t.auditKeys, newId: ulidGenerator(clock) });
  return {
    ...t.meta,
    roles: [...t.meta.roles],
    store,
    clock,
    writer,
    reader,
    auditKeys: t.auditKeys,
    seed: referenceSeed(),
    close: () => {
      reader.close();
      writer.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function buildFixture(opts: FixtureOptions): Fixture {
  const clock = opts.clock ?? new ManualClock();
  const dir = mkdtempSync(join(tmpdir(), 'ga-fixture-'));
  const path = join(dir, 'gen.sqlite');
  const writer = openWriter(path, { clock });
  let reader: AppConnection | null = null;
  try {
    migrate(writer, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
    reader = openReader(path, { clock });
    const auditKeys = masterKeyring({ k1: randomBytes(32) }, 'k1');
    const store = createSqliteStore({ writer, reader, auditKeys, newId: opts.newId ?? sequentialIds('FXT') });
    const seed = referenceSeed();
    store.installGlobal(seed);
    const owner = store.createUser({
      username: 'owner',
      displayName: 'Chủ workspace',
      passwordHash: 'argon2id$fixture',
      mustChangePassword: false,
    });
    const tenant = store.createTenant(
      { slug: 'afi', name: 'Afi Labs', shortCode: '7K2Q', ownerUserId: owner.id },
      seed,
    );
    const ws = tenant.workspace.id;
    const coreEngine = store.read(ws, (tx) => tx.settings.get('system.core_agent_engine'));
    if (typeof coreEngine !== 'string') throw new Error('fixture: seed thiếu system.core_agent_engine');
    const fx: Fixture = {
      store,
      clock,
      writer,
      reader,
      auditKeys,
      seed,
      workspaceId: ws,
      ownerUserId: owner.id,
      ownerActorId: tenant.ownerActorId,
      systemActorId: tenant.systemActorId,
      coreEngine,
      coreAccount: null,
      systemContainerId: null,
      roles: [],
      close: () => {
        reader?.close();
        writer.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
    if (opts.coreAgentReady !== false) makeCoreAgentReady(fx);
    for (let i = 0; i < (opts.roles ?? 0); i++) {
      fx.roles.push(
        store.write(fx.ownerActorId, (tx) => tx.roles.create({ name: `Role ${i + 1}`, color: 'jade' }), {
          channel: 'web',
        }),
      );
    }
    return fx;
  } catch (e) {
    reader?.close();
    writer.close();
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

/** Onboarding bước 2–4 (G2): Core agent sẵn sàng. Owner thao tác phần cấu hình; actor system ghi kết quả runtime. */
export function makeCoreAgentReady(fx: Fixture): void {
  const { store, coreEngine } = fx;
  const owner = fx.ownerActorId;
  const setup = store.write(
    owner,
    (tx) => {
      const engine = tx.engines.engine(coreEngine);
      if (engine === null) throw new Error(`fixture: danh mục không có engine ${coreEngine}`);
      const consent =
        engine.requires_consent === 1
          ? tx.engines.grantConsent({
              userId: fx.ownerUserId,
              consentKind: 'engine_tos_risk',
              subject: engine.slug,
              noticeVersion: engine.tos_notice_version,
              noticeHash: 'sha256:fixture-notice',
            })
          : null;
      const container = tx.engines.ensureContainer({
        kind: 'system',
        containerName: `ga-sys-${tx.workspace.get().short_code.toLowerCase()}`,
        desiredState: 'sleeping',
      });
      const account = tx.engines.createAccount({
        engineSlug: engine.slug,
        label: 'Core agent',
        authMethod: 'subscription',
        authVolume: 'ga-auth-fixture-0001',
        consentId: consent?.id ?? null,
      });
      tx.engines.createBinding({ consumerKind: 'system', engineAccountId: account.id, priority: 1 });
      return { account, container };
    },
    { channel: 'web' },
  );
  const sys = fx.systemActorId;
  fx.coreAccount = store.write(sys, (tx) => {
    tx.engines.setInstallState(coreEngine, {
      installState: 'installed',
      installedVersion: '1.0.0-fixture',
      toolRestrictionVersion: '1.0.0-fixture',
    });
    const probe = tx.engines.startProbe({
      engineAccountId: setup.account.id,
      trigger: 'login_check',
      authMode: 'oauth',
      containerId: setup.container.id,
    });
    tx.engines.finishProbe(probe.id, { status: 'ok' });
    for (const a of tx.engines.systemAgents()) {
      tx.engines.recordSystemAgentSelection(a.system_key, 'valid');
    }
    return tx.engines.recordLoginResult(setup.account.id, {
      loginStatus: 'logged_in',
      accountHint: 'o***@example.test',
    });
  });
  fx.systemContainerId = setup.container.id;
}
