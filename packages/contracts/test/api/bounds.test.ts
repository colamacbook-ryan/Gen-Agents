import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { collectNodes, regexBoundsLength, schemaViolations, stringHasCeiling } from '../../src/api/introspect.ts';
import * as contracts from '../../src/index.ts';
import {
  BOUNDS,
  BoundedJson,
  DbTimestamp,
  EngineInstallStatus,
  JSON_LIMITS,
  PROMPT_FILE_MAX_CHARS,
  RUNNER_CLI_LINE_MAX_CHARS,
  runnerBundleSchemas,
  TOOL_PAYLOAD_LIMITS,
  ToolArgs,
  TurnClassification,
  UpdaterStatus,
} from '../../src/index.ts';

// Bảo mật hợp đồng (fix M0, DoS ở biên parse): TOÀN BỘ schema contracts — kể cả M0 đóng băng — có trần cho mọi chuỗi, mảng và
// JSON tự do. Quét bằng introspect trên MỌI export (và object chứa schema), KHÔNG có danh sách miễn trừ.

const isSchema = (v: unknown): v is z.ZodType => typeof v === 'object' && v !== null && '_zod' in v;

/** Mọi schema gốc xuất ra từ contracts (đi vào object chứa schema như `ToolArgs`, `SETTINGS[k].schema`, `RunnerBundles`). */
function allSchemas(): Array<[string, z.ZodType]> {
  const out: Array<[string, z.ZodType]> = [];
  const seen = new Set<unknown>();
  const visit = (name: string, v: unknown, depth: number): void => {
    if (isSchema(v)) {
      if (!seen.has(v)) {
        seen.add(v);
        out.push([name, v]);
      }
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v) && depth < 3) {
      for (const [k, x] of Object.entries(v)) visit(`${name}.${k}`, x, depth + 1);
    }
  };
  for (const [k, v] of Object.entries(contracts)) visit(k, v, 0);
  // bundle dựng theo registry slug (runnerBundleSchemas) — cùng hình dạng nhưng instance riêng
  visit('runnerBundleSchemas', runnerBundleSchemas(['engine-a', 'engine-b']), 0);
  return out;
}

describe('0 chuỗi / mảng / JSON không trần trong toàn bộ contracts (không ngoại lệ)', () => {
  const schemas = allSchemas();

  it('quét đủ lớn: hàng trăm schema gốc từ mọi module (M0 + api)', () => {
    expect(schemas.length).toBeGreaterThan(250);
    // tra theo ĐỊNH DANH (alias xuất có thể trùng instance nên tên đầu tiên tới được có thể khác)
    const instances = new Set(schemas.map(([, s]) => s));
    const must: Record<string, z.ZodType> = {
      SseEvent: contracts.SseEvent,
      EnginePlan: contracts.EnginePlan,
      ExecFrame: contracts.ExecFrame,
      RunnerReport: contracts.RunnerReport,
      SupervisorStatus: contracts.SupervisorStatus,
      SeedReference: contracts.SeedReference,
      PinPayload: contracts.PinPayload,
      ToolResult: contracts.ToolResult,
      TurnEvent: contracts.TurnEvent,
      TurnResult: contracts.TurnResult,
      UpdaterStatus: contracts.UpdaterStatus,
      CapabilityEntry: contracts.CapabilityEntry,
      'SETTINGS.system.core_agent_engine': contracts.SETTINGS['system.core_agent_engine'].schema,
    };
    for (const [name, schema] of Object.entries(must))
      expect(instances.has(schema), `không quét tới ${name}`).toBe(true);
    // schema nằm trong object chứa schema (ToolArgs.*) cũng được quét (tra theo định danh: alias xuất có thể trùng instance)
    for (const tool of Object.keys(ToolArgs) as Array<keyof typeof ToolArgs>) {
      expect(instances.has(ToolArgs[tool]), `không quét tới ToolArgs.${tool}`).toBe(true);
    }
  });

  it('không có chuỗi / mảng không trần, không z.json() / lazy, không any / unknown (object M0 nới lỏng nằm ngoài phạm vi: xem ghi chú)', () => {
    const bad: string[] = [];
    for (const [name, schema] of schemas) {
      for (const v of schemaViolations(schema, name)) {
        // M0 dùng z.object (strip) ở vài nơi cố ý để BỎ khoá thừa theo thiết kế (UpdaterCommand): chỉ loại đúng luật "strict".
        if (v.endsWith('object không strict')) continue;
        bad.push(v);
      }
    }
    expect(bad).toEqual([]);
  });

  it('M0: object không strict còn lại đúng danh sách cố ý (UpdaterCommand bỏ tham số thừa theo thiết kế G-25)', () => {
    const loose: string[] = [];
    for (const [name, schema] of schemas) {
      for (const v of schemaViolations(schema, name))
        if (v.endsWith('object không strict')) loose.push(v.split(':')[0] as string);
    }
    expect([...new Set(loose)].sort()).toEqual(['UpdaterCommand']);
  });

  it('bộ quét thật sự bắt: schema M0 cũ (không trần, z.json) bị đánh dấu', () => {
    expect(schemaViolations(z.strictObject({ version: z.string(), at: z.string().nullable() })).length).toBe(2);
    expect(schemaViolations(z.strictObject({ newValue: z.json() })).length).toBeGreaterThan(0);
    expect(schemaViolations(z.strictObject({ items: z.array(z.string().max(5)) })).length).toBe(1);
    expect(schemaViolations(z.strictObject({ id: z.string().regex(/^[a-z]+$/) })).length).toBe(1);
    expect(schemaViolations(z.strictObject({ id: z.string().regex(/^[a-z]{1,10}$/) }))).toEqual([]);
  });
});

describe('regex neo có biên cũng là trần (regexBoundsLength)', () => {
  it('chấp nhận regex chặn dài; từ chối lượng từ không biên, thiếu neo, thoát cuối', () => {
    expect(regexBoundsLength(/^EN-\d{4,12}$/)).toBe(true);
    expect(regexBoundsLength(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)).toBe(true);
    expect(regexBoundsLength(/^[+*]{1,3}$/)).toBe(true);
    expect(regexBoundsLength(/^a+$/)).toBe(false);
    expect(regexBoundsLength(/^a*$/)).toBe(false);
    expect(regexBoundsLength(/^x{4,}$/)).toBe(false);
    expect(regexBoundsLength(/^x{1,100000}$/)).toBe(false);
    expect(regexBoundsLength(/abc/)).toBe(false);
    expect(regexBoundsLength(/^abc/)).toBe(false);
    expect(regexBoundsLength(/^\\+$/)).toBe(false);
    expect(stringHasCeiling(z.string().regex(/^[a-z]{1,8}$/))).toBe(true);
    expect(stringHasCeiling(z.string().regex(/^[a-z]+$/))).toBe(false);
  });
});

describe('trần M0 đã siết (fix contracts)', () => {
  it('9 chỗ coordinator nêu: version, installedAt, currentVersion, availableVersion, checkedAt, run.startedAt, run.error, resetAt, newValue', () => {
    const long = 'v'.repeat(BOUNDS.version + 1);
    expect(EngineInstallStatus.safeParse({ state: 'installing', progressPct: null, version: long }).success).toBe(
      false,
    );
    expect(
      EngineInstallStatus.safeParse({ state: 'installed', version: '1.0.0', installedAt: '2026-10-17T00:00:00.000Z' })
        .success,
    ).toBe(true);
    expect(
      EngineInstallStatus.safeParse({ state: 'installed', version: '1.0.0', installedAt: 'hôm qua' }).success,
    ).toBe(false);
    expect(
      EngineInstallStatus.safeParse({ state: 'installed', version: long, installedAt: '2026-10-17T00:00:00.000Z' })
        .success,
    ).toBe(false);
    const upd = {
      currentVersion: '1.0.0',
      availableVersion: null,
      checkedAt: null,
      autoUpdate: true,
      run: null,
      rollbackAvailable: false,
    };
    expect(UpdaterStatus.safeParse(upd).success).toBe(true);
    expect(UpdaterStatus.safeParse({ ...upd, currentVersion: long }).success).toBe(false);
    expect(UpdaterStatus.safeParse({ ...upd, availableVersion: long }).success).toBe(false);
    expect(UpdaterStatus.safeParse({ ...upd, checkedAt: 'x' }).success).toBe(false);
    const run = {
      trigger: 'auto',
      status: 'running',
      step: 'download',
      startedAt: '2026-10-17T00:00:00.000Z',
      error: null,
    };
    expect(UpdaterStatus.safeParse({ ...upd, run }).success).toBe(true);
    expect(UpdaterStatus.safeParse({ ...upd, run: { ...run, startedAt: 'x' } }).success).toBe(false);
    expect(UpdaterStatus.safeParse({ ...upd, run: { ...run, error: 'e'.repeat(BOUNDS.message + 1) } }).success).toBe(
      false,
    );
    const cls = { outcome: 'quota_exhausted', resetAt: null, detail: null };
    expect(TurnClassification.safeParse(cls).success).toBe(true);
    expect(TurnClassification.safeParse({ ...cls, resetAt: '2026-10-17T05:00:00.000Z' }).success).toBe(true);
    expect(TurnClassification.safeParse({ ...cls, resetAt: 'sau 5 giờ' }).success).toBe(false);
    const edit = { anchor: 'role:RL-0001', newValue: 'x'.repeat(JSON_LIMITS.string + 1) };
    expect(ToolArgs.propose_edit.safeParse(edit).success).toBe(false);
    expect(ToolArgs.propose_edit.safeParse({ ...edit, newValue: 'ok' }).success).toBe(true);
  });

  it('các trường json khác của M0 cũng bị chặn: set_field.value, propose_change.items, ToolResult.data, CapabilityEntry.value', () => {
    const big = 'x'.repeat(JSON_LIMITS.string + 1);
    expect(ToolArgs.set_field.safeParse({ field: 'dna.x', itemIndex: 0, value: big }).success).toBe(false);
    expect(ToolArgs.propose_change.safeParse({ title: 't', items: [big] }).success).toBe(false);
    expect(ToolArgs.propose_change.safeParse({ title: 't', items: Array(BOUNDS.smallList + 1).fill(1) }).success).toBe(
      false,
    );
    expect(contracts.ToolResult.safeParse({ status: 'ok', data: big }).success).toBe(false);
    expect(
      contracts.CapabilityEntry.safeParse({
        key: 'model:a',
        valueState: 'known',
        value: big,
        source: 's',
        confidence: 'direct',
        authMode: 'oauth',
      }).success,
    ).toBe(false);
    let deep: unknown = 1;
    for (let i = 0; i <= JSON_LIMITS.depth; i++) deep = [deep];
    expect(BoundedJson.safeParse(deep).success).toBe(false);
  });

  it('hằng chung khớp hằng M0 sẵn có (một nguồn): blobText = PROMPT_FILE_MAX_CHARS, streamText = RUNNER_CLI_LINE_MAX_CHARS, json.string = TOOL_PAYLOAD_LIMITS', () => {
    expect(BOUNDS.blobText).toBe(PROMPT_FILE_MAX_CHARS);
    expect(BOUNDS.streamText).toBe(RUNNER_CLI_LINE_MAX_CHARS);
    expect(JSON_LIMITS.string).toBe(TOOL_PAYLOAD_LIMITS.maxStringChars);
    expect(contracts.API_LIMITS.jsonString).toBe(JSON_LIMITS.string);
    expect(contracts.Ts).toBe(DbTimestamp);
    expect(DbTimestamp.safeParse('2026-10-17T01:02:03.004Z').success).toBe(true);
    expect(DbTimestamp.safeParse('2026-10-17').success).toBe(false);
  });

  it('khung exec / plan / seed / sự kiện: trần mới chặn dữ liệu quá cỡ', () => {
    const blob = 'b'.repeat(BOUNDS.blobText + 1);
    expect(
      contracts.ExecResult.safeParse({
        exitCode: 0,
        signal: null,
        stdout: blob,
        stderr: '',
        timedOut: false,
        durationMs: 1,
      }).success,
    ).toBe(false);
    expect(
      contracts.ExecFrame.safeParse({ type: 'stdout', data: 'x'.repeat(contracts.RUNNER_STDOUT_LINE_MAX_CHARS + 1) })
        .success,
    ).toBe(false);
    expect(contracts.ExecFrame.safeParse({ type: 'stdout', data: 'ok' }).success).toBe(true);
    expect(
      contracts.ExecFrame.safeParse({
        type: 'exit',
        exitCode: 0,
        signal: 'S'.repeat(BOUNDS.signal + 1),
        timedOut: false,
        durationMs: 0,
      }).success,
    ).toBe(false);
    expect(
      contracts.EnvMap.safeParse(
        Object.fromEntries(Array.from({ length: contracts.MAX_ENGINE_ENV_VARS + 1 }, (_, i) => [`VAR_${i}`, 'x'])),
      ).success,
    ).toBe(false);
    expect(contracts.EnvMap.safeParse({ VAR_A: 'x'.repeat(contracts.MAX_ENGINE_ENV_VALUE + 1) }).success).toBe(false);
    expect(contracts.EnvMap.safeParse({ VAR_A: 'x' }).success).toBe(true);
    expect(
      contracts.SupervisorStatus.safeParse({
        version: 'v'.repeat(65),
        dockerReachable: true,
        templates: [],
        containers: [],
      }).success,
    ).toBe(false);
    expect(
      contracts.PinPayload.safeParse({
        text: 't'.repeat(BOUNDS.chatText + 1),
        screen: { route: '/a', role: null, tab: null, filters: null },
        anchors: [],
        attachments: [],
      }).success,
    ).toBe(false);
    expect(
      contracts.SseEvent.safeParse({
        id: '1',
        workspaceId: '01JABCDEFGHJKMNPQRSTVWXYZ0',
        at: 'bây giờ',
        type: 'resync',
      }).success,
    ).toBe(false);
  });

  it('duyệt cây: không còn lazy (z.json) ở bất kỳ schema nào của contracts', () => {
    for (const [name, schema] of allSchemas()) {
      const lazies = collectNodes(schema, name).filter((n) => n.type === 'lazy');
      expect(
        lazies.map((n) => n.path),
        name,
      ).toEqual([]);
    }
  });
});
