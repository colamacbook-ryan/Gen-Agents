import { createEgressProxy, type EgressLogger } from './proxy.ts';
import { loadRulesFile, type RuleSet, RulesError } from './rules.ts';

// Điểm vào ga-egress (image gen-agents, entrypoint `egress`; IT chạy thẳng bằng node).
//   GA_EGRESS_LISTEN       mặc định 0.0.0.0:3128
//   GA_EGRESS_RULES_FILE   tệp JSON { rules: [{ host, ports?, allowPrivate? }] } — đọc lại khi nhận SIGHUP
// Không có tệp luật hợp lệ ⇒ không khởi động (fail-closed). Hook test nạp động; thiếu module ⇒ tắt.

const log: EgressLogger = {
  log(level, event, fields) {
    process.stderr.write(
      `${JSON.stringify({ ts: new Date().toISOString(), level, svc: 'egress', event, ...fields })}\n`,
    );
  },
};

async function loadHooks(): Promise<{ learnMode: boolean; allowPrivateHonored: boolean }> {
  const specifier = './test-hooks.ts';
  try {
    const m = (await import(specifier)) as {
      testHooks(env: NodeJS.ProcessEnv): { learnMode: boolean; allowPrivateHonored: boolean };
    };
    return m.testHooks(process.env);
  } catch {
    return { learnMode: false, allowPrivateHonored: false };
  }
}

export async function startEgress(env: NodeJS.ProcessEnv): Promise<void> {
  const [host, portStr] = (env.GA_EGRESS_LISTEN ?? '0.0.0.0:3128').split(':');
  const port = Number(portStr);
  const file = env.GA_EGRESS_RULES_FILE;
  if (!host || !Number.isInteger(port) || !file) throw new RulesError('thiếu GA_EGRESS_LISTEN / GA_EGRESS_RULES_FILE');
  let rules: RuleSet = loadRulesFile(file);
  process.on('SIGHUP', () => {
    try {
      rules = loadRulesFile(file);
      log.log('info', 'rules_reloaded', { count: rules.rules.length });
    } catch (e) {
      log.log('error', 'rules_reload_failed', { message: (e as Error).message });
    }
  });
  const hooks = await loadHooks();
  if (hooks.learnMode || hooks.allowPrivateHonored) log.log('warn', 'test_hooks_active', { ...hooks });
  const server = createEgressProxy({ getRules: () => rules, ...hooks, log });
  server.listen(port, host, () => log.log('info', 'listening', { port, rules: rules.rules.length }));
}
