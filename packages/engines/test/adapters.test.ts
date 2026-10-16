import {
  CapabilityEntry,
  type EngineAdapter,
  InstallSpec,
  LoginCheckResult,
  type ProbePlan,
  TurnClassification,
  TurnStreamEvent,
} from '@ga/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  adapterFor,
  type EngineAdapterExt,
  interpretLoginCheck,
  runCapabilityScan,
  runLoginCheck,
} from '../src/index.ts';
import { ADAPTERS, cases, execResult, fixture, probeInput, probeOutcome, text } from './helpers.ts';

// Ca theo từng adapter, dữ liệu ở test/fixtures/<slug>/cases.json (output thật Spike 1b + ca giả định có đánh dấu).

describe('registry', () => {
  it('mỗi adapter dựng sẵn tra được bằng slug; slug lạ ⇒ null (loại coming_soon chưa có adapter)', () => {
    expect(ADAPTERS.length).toBe(2);
    for (const a of ADAPTERS) expect(adapterFor(a.slug)).toBe(a);
    expect(adapterFor('no-such-engine')).toBeNull();
    expect(new Set(ADAPTERS.map((a) => a.slug)).size).toBe(ADAPTERS.length);
  });
  it('khớp interface đóng băng của contracts; không có hàm resume (CNS-132)', () => {
    expectTypeOf<EngineAdapterExt>().toExtend<EngineAdapter>();
    for (const a of ADAPTERS) {
      expect(Object.keys(a).filter((k) => /resume/i.test(k))).toEqual([]);
      expect(a.nativeMemoryPolicy).toBe('tmpfs-per-turn');
    }
  });
});

for (const adapter of ADAPTERS) {
  const slug = adapter.slug;
  const c = cases(slug);

  describe(`adapter ${slug}`, () => {
    it('khai allowlist /auth, trạng thái native, tín hiệu output đúng như đã ghi (allowlist có thể unknown tới Spike 1c)', () => {
      expect(adapter.authAllowlist).toEqual(c.adapter.authAllowlist);
      expect(adapter.nativeStatePaths).toEqual(c.adapter.nativeStatePaths);
      expect(adapter.outputSignals).toEqual(c.adapter.outputSignals);
      if (adapter.authAllowlist !== 'unknown') {
        for (const p of adapter.authAllowlist) {
          expect(p.startsWith('/') || p.split('/').includes('..'), p).toBe(false);
          // Không giữ trạng thái native trong /auth ("Brain bóng", CNS-132).
          for (const n of adapter.nativeStatePaths === 'unknown' ? [] : adapter.nativeStatePaths) {
            expect(p === n || p.startsWith(`${n}/`), `${p} ⊄ ${n}`).toBe(false);
          }
        }
      }
    });

    it('installSpec: nguồn chính chủ https, có checksum, domain egress gồm host của nguồn; công thức cài theo arch', () => {
      const spec = InstallSpec.parse(adapter.installSpec);
      expect(spec.origin.startsWith('https://')).toBe(true);
      expect(spec.checksum.algorithm).toBe(c.adapter.checksumAlgorithm);
      expect(spec.checksum.from).toBe('manifest');
      expect(spec.selfUpdate).toBe(c.adapter.selfUpdate);
      expect(spec.egressDomains).toContain(new URL(spec.origin).host);
      const r = adapter.install;
      const archs = new Set(r.platforms.filter((p) => p.libc === 'glibc').map((p) => p.arch));
      expect([...archs].sort()).toEqual(['arm64', 'x64']);
      const urls =
        r.manifest.kind === 'per-platform'
          ? [r.manifest.urlTemplate]
          : [r.manifest.latestUrl, r.manifest.urlTemplate, r.manifest.binaryUrlTemplate];
      for (const u of urls) {
        expect(u.startsWith('https://'), u).toBe(true);
        expect(spec.egressDomains, u).toContain(new URL(u.replaceAll(/[{}]/g, '')).host);
      }
      expect(r.manifest.kind === 'per-platform' ? r.manifest.urlTemplate : r.manifest.binaryUrlTemplate).toContain(
        '{platform}',
      );
      expect(adapter.binaryPath).toBe(`/opt/engines/${slug}/current/${r.binaryName}`);
    });

    it('loginArgv: argv[0] là binary dưới /opt/engines/<slug>/, đúng lệnh đăng nhập, không shell; API key ⇒ lỗi', () => {
      const argv = adapter.loginArgv({ authMethod: 'subscription' });
      expect(argv[0]).toBe(adapter.binaryPath);
      expect(argv.slice(1)).toEqual(c.adapter.loginArgvSubscriptionTail);
      expect(() => adapter.loginArgv({ authMethod: 'api_key' })).toThrow(/PTY/);
      expect(() => adapter.loginArgv({ authMethod: 'adc' })).toThrow(/PTY/);
    });

    describe('parser output', () => {
      for (const s of c.stream) {
        it(s.name, () => {
          const line = s.lineFile !== undefined ? fixture(slug, s.lineFile).trim() : (s.line ?? '');
          const events = adapter.parseStreamLineAll(line);
          expect(events).toEqual(s.expected);
          for (const e of events) TurnStreamEvent.parse(e);
          expect(adapter.parseStreamLine(line)).toEqual(s.expected[0] ?? null);
        });
      }
      for (const f of c.streamFiles ?? []) {
        it(f.name, () => {
          const parser = adapter.createLineParser();
          const events = fixture(slug, f.file)
            .split('\n')
            .flatMap((l) => parser.push(l));
          expect(events).toEqual(f.expected);
          expect(parser.stats.droppedOversize).toBe(0);
        });
      }
      it('parser có trạng thái: pha planning → acting ở công cụ đầu tiên (hoặc "chưa đo được" = null); nhớ tên công cụ', () => {
        const parser = adapter.createLineParser();
        if (c.adapter.phaseAfterToolCall === null) {
          expect(parser.phase).toBeNull();
          return;
        }
        expect(parser.phase).toBe('planning');
        const call = c.stream.find((s) => s.expected[0]?.type === 'tool' && s.expected[0].stage === 'call');
        const result = c.stream.find((s) => s.expected[0]?.type === 'tool' && s.expected[0].stage === 'result');
        expect(call && result).toBeTruthy();
        const callEvent = parser.push(call?.line ?? '')[0];
        expect(parser.phase).toBe(c.adapter.phaseAfterToolCall);
        const resultEvent = parser.push(result?.line ?? '')[0];
        expect(resultEvent).toMatchObject({ stage: 'result', name: callEvent?.type === 'tool' ? callEvent.name : '' });
      });
      it('dòng delta HỢP LỆ nhưng vượt trần 1 MiB ⇒ bỏ (không JSON.parse), cả parser không trạng thái', () => {
        const d = c.stream.find((s) => s.line !== undefined && s.expected[0]?.type === 'delta');
        const first = d?.expected[0];
        expect(first?.type).toBe('delta');
        const small = first?.type === 'delta' ? first.text : '';
        const big = (d?.line ?? '').replace(JSON.stringify(small).slice(1, -1), 'a'.repeat(1024 * 1024));
        expect(big.length).toBeGreaterThan(1024 * 1024);
        expect(adapter.parseStreamLineAll(big)).toEqual([]);
        expect(adapter.parseStreamLineAll(d?.line ?? '')).toEqual(d?.expected);
      });
      it('dòng quá trần bị bỏ không parse, có đếm (không nuốt lỗi im lặng)', () => {
        const parser = adapter.createLineParser();
        const big = `{"x":"${'a'.repeat(1024 * 1024)}"}`;
        expect(parser.push(big)).toEqual([]);
        expect(parser.stats.droppedOversize).toBe(1);
        expect(parser.push('not json')).toEqual([]);
        expect(parser.stats.unparsable).toBe(1);
      });
    });

    describe('phân loại kết quả lượt (errors.ts)', () => {
      for (const k of c.classify) {
        it(`${k.name} ⇒ ${k.expected.outcome} (${k.expected.ruleId})`, () => {
          const stdout = text(slug, k.stdout, k.stdoutFile);
          const stderr = text(slug, k.stderr, k.stderrFile);
          const d = adapter.classifyDetailed(k.exit, stdout, stderr);
          expect(d.ruleId).toBe(k.expected.ruleId);
          expect(d.classification.outcome).toBe(k.expected.outcome);
          expect(d.classification.resetAt).toBe(k.expected.resetAt);
          TurnClassification.parse(d.classification);
          expect(adapter.classify(k.exit, stdout, stderr)).toEqual(d.classification);
          if (k.expected.outcome !== 'ok') expect(d.classification.detail).toContain(k.expected.ruleId);
        });
      }
    });

    describe('kiểm đăng nhập (plan chạy qua ga-runner, HOME tmpfs)', () => {
      for (const l of c.login) {
        it(`${l.name} ⇒ ${l.expected.status}`, async () => {
          const input = { authMethod: l.authMethod, ...probeInput() };
          const { plan, parse } = adapter.loginCheck(input);
          expect(plan.kind).toBe('cli');
          if (plan.kind === 'cli') expect(plan.argv[0]).toBe(adapter.binaryPath);
          const result = parse(probeOutcome(slug, l.outcome));
          LoginCheckResult.parse(result);
          expect(result.status).toBe(l.expected.status);
          expect(result.accountHint).toBe(l.expected.accountHint);
          const probe = await runLoginCheck(adapter, input, async () => probeOutcome(slug, l.outcome));
          expect({ loginStatus: probe.loginStatus, probeStatus: probe.probeStatus }).toEqual(l.probe);
          // Phía control plane: đọc RunnerReport không cần dựng plan — cùng kết quả.
          expect(adapter.parseLoginCheck(l.authMethod, probeOutcome(slug, l.outcome))).toEqual(result);
          expect(interpretLoginCheck(adapter, l.authMethod, probeOutcome(slug, l.outcome))).toEqual(probe);
        });
      }
      it('bộ thực thi ném lỗi ⇒ trạng thái lỗi, có ghi lý do (không nuốt)', async () => {
        const probe = await runLoginCheck(adapter, { authMethod: 'subscription', ...probeInput() }, async () => {
          throw new Error('container biến mất');
        });
        expect(probe.loginStatus).toBe('error');
        expect(probe.probeStatus).toBe('failed');
        expect(probe.error).toContain('container biến mất');
      });
      it('kết quả http (không phải của adapter CLI) ⇒ chưa xác định, không đoán', () => {
        const { parse } = adapter.loginCheck({ authMethod: 'subscription', ...probeInput() });
        expect(parse({ kind: 'http', status: 200, body: '{}', timedOut: false, durationMs: 1 }).status).toBe('unknown');
      });
    });

    describe('quét khả năng (registry STD-10)', () => {
      for (const cap of c.capabilities) {
        it(cap.name, async () => {
          const input = { authMode: cap.authMode, ...probeInput() };
          const plans = adapter.capabilityScan(input);
          expect(plans.length).toBe(cap.outcomes.length);
          for (const p of plans) if (p.kind === 'cli') expect(p.argv[0]).toBe(adapter.binaryPath);
          let i = 0;
          const seen: ProbePlan[] = [];
          const scan = await runCapabilityScan(adapter, input, async (plan) => {
            seen.push(plan);
            const spec = cap.outcomes[i++];
            if (spec === undefined) throw new Error('thừa plan');
            return probeOutcome(slug, spec);
          });
          expect(seen).toEqual(plans);
          const byKey = new Map(scan.entries.map((e) => [e.key, e]));
          for (const e of scan.entries) CapabilityEntry.parse(e);
          expect(byKey.size).toBe(scan.entries.length);
          for (const [key, value] of Object.entries(cap.values)) {
            const e = byKey.get(key);
            expect(e?.valueState, key).toBe('known');
            if (e?.valueState === 'known') expect(e.value, key).toEqual(value);
          }
          for (const key of cap.known) expect(byKey.get(key)?.valueState, key).toBe('known');
          for (const key of cap.absent ?? []) expect(byKey.has(key), key).toBe(false);
          for (const [key, reason] of Object.entries(cap.unknown)) {
            const e = byKey.get(key);
            expect(e?.valueState, key).toBe('unknown');
            if (e?.valueState === 'unknown') expect(e.unknownReason, key).toBe(reason);
          }
          for (const [key, conf] of Object.entries(cap.confidence ?? {})) {
            const e = byKey.get(key);
            expect(e?.valueState === 'known' ? e.confidence : null, key).toBe(conf);
          }
          // Giá trị phụ thuộc đăng nhập mang authMode thật của lần quét; giá trị từ --help / --version thì 'none'.
          for (const e of scan.entries) {
            const kind = e.key.split(':')[0];
            if (kind === 'model' || kind === 'quota_window') expect(e.authMode, e.key).toBe(cap.authMode);
            if (kind === 'version' || kind === 'flag') expect(e.authMode, e.key).toBe('none');
          }
          expect({
            compatibility: scan.compatibility,
            missingTurnFlags: scan.missingTurnFlags,
            probeStatus: scan.probeStatus,
          }).toEqual(cap.scan);
        });
      }
      it('chưa đăng nhập thì không chạy lệnh cần đăng nhập có thể treo (-p /usage có CLI treo ở bước xác thực)', () => {
        const none = adapter.capabilityScan({ authMode: 'none', ...probeInput() });
        const oauth = adapter.capabilityScan({ authMode: 'oauth', ...probeInput() });
        expect(none.length).toBeLessThan(oauth.length);
        for (const p of none) {
          if (p.kind === 'cli') expect(p.argv.some((a) => a === '/usage' || a === '/model')).toBe(false);
        }
      });
      it('mọi lệnh quét lỗi ⇒ toàn unknown có lý do, không giá trị mặc định', () => {
        const entries = adapter.parseCapabilitiesFor(
          [execResult(slug, { exitCode: null, timedOut: true }), execResult(slug, { exitCode: 127 })].map((r) => ({
            kind: 'cli' as const,
            ...r,
          })),
          { authMode: 'oauth' },
        );
        expect(entries.length).toBeGreaterThan(0);
        for (const e of entries) {
          expect(e.valueState, e.key).toBe('unknown');
          if (e.valueState === 'unknown') expect(e.unknownReason.startsWith('unknown'), e.key).toBe(true);
        }
      });
    });
  });
}
