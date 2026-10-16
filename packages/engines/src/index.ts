// @ga/engines — adapter CLI dạng hàm thuần + probe + chính sách fallback (BUILD-PLAN §B.5, §B.7, §D.1, §D.2).
// Ngoài thư mục src/adapters, mã nguồn không nhắc tên CLI / model (lint `no-model-cli-names`); tra adapter bằng slug từ DB.

export { AdapterError } from './adapters/errors-common.ts';
export { adapterFor, BUILTIN_ADAPTERS } from './adapters/index.ts';
export {
  ANY_ITEM,
  CAPABILITY_KINDS,
  type CapabilityKind,
  capKey,
  parseCapabilityKey,
  UNKNOWN_REQUIRES_LOGIN,
} from './capabilities.ts';
export {
  API_KEY_VALUE_RE,
  assertEnvTable,
  assertPlanEnv,
  assertSecretEnvValue,
  type EnvSpec,
  EnvTableError,
  isForbiddenAdapterEnvName,
} from './env.ts';
export {
  type AccountLoginStatus,
  type AccountQuotaState,
  decideFailover,
  FAILOVER_REASONS,
  type FailoverCandidate,
  type FailoverConsumer,
  type FailoverDecision,
  type FailoverInput,
  type FailoverReason,
  failoverReasonFor,
  isRunnable,
  pickStartBinding,
} from './failover.ts';
export {
  type CapabilityScanOutcome,
  interpretLoginCheck,
  type LoginProbeOutcome,
  measuredPromptTokens,
  type PlanExecutor,
  type ProbeLoginStatus,
  runCapabilityScan,
  runLoginCheck,
} from './probe.ts';
export { MAX_LINE_BYTES, maskAccountHint } from './text.ts';
export {
  ArgvBuilder,
  DEFAULT_TURN_TIMEOUT_MS,
  engineBinaryPath,
  GATEWAY_MCP_SERVER,
  MAX_PROMPT_ARG_BYTES,
  MAX_SYSTEM_PROMPT_BYTES,
  mcpBridgeCommand,
  type PlanKit,
  planKit,
  TurnPlanError,
} from './turn-common.ts';
export type {
  DetailedClassification,
  EngineAdapterExt,
  ErrorRuleInfo,
  Evidence,
  InstallPlatform,
  InstallRecipe,
  OutputSignals,
  TurnLineParser,
  TurnPhase,
  TurnPlanInputExt,
} from './types.ts';
