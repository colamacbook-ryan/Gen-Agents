// GENERATED bởi `pnpm db:gen` từ db/spec/schema_v2_2.sql @ Second-Brain f54d06a (DATABASE v2.3.0) — KHÔNG SỬA TAY.
// Bảng: Generated<T> khi cột có DEFAULT hoặc là INTEGER PRIMARY KEY; union từ CHECK (col IN (…)).
// View: chỉ đọc (ColumnType<T, never, never>); cột biểu thức không có kiểu khai báo ⇒ SqlValue.
import type { ColumnType, Generated } from 'kysely';

export type SqlValue = string | number | bigint | Buffer | null;

export interface Actors {
  id: string;
  workspace_id: string;
  kind: 'user' | 'role' | 'system';
  user_id: string | null;
  role_id: string | null;
  system_key: 'system' | 'interviewer' | 'trainer' | 'consolidator' | 'judge' | 'scheduler' | 'gateway' | 'updater' | 'telegram' | 'assistant' | null;
  label: string;
  created_at: Generated<string>;
  purged_at: string | null;
}

export interface AppVersions {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  semver: string;
  channel: 'stable' | 'beta';
  released_at: string | null;
  changelog_md: string | null;
  image_digest: string | null;
  schema_version: number;
  source: 'github_releases' | 'registry' | 'manual';
  status: 'available' | 'downloading' | 'installed' | 'current' | 'failed' | 'yanked';
  discovered_at: string | null;
}

export interface Assignments {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  role_id: string;
  position_id: string;
  status: 'active' | 'ended';
  started_at: string;
  ended_at: string | null;
  end_reason: 'reassigned' | 'handover' | 'revoked' | 'archived' | 'purged' | null;
  handover_note: string | null;
  trust_tier: number;
  is_primary: Generated<0 | 1>;
}

export interface AuditLog {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  actor_id: string;
  actor_label: string;
  actor_kind: 'user' | 'role' | 'system';
  action: string;
  result: 'ok' | 'denied' | 'error';
  role_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_display_id: string | null;
  before_json: string | null;
  after_json: string | null;
  detail_json: string | null;
  reason: string | null;
  tool: string | null;
  session_id: string | null;
  task_id: string | null;
  channel: 'web' | 'api' | 'telegram' | 'scheduler' | 'gateway' | 'cli' | 'system';
  request_id: string;
  ip_hash: string | null;
  tokens_total: number | null;
  cost_micro_usd: number | null;
  hash_key_id: string;
  prev_hash: string | null;
  row_hash: string;
}

export interface AuthSessions {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Generated<string>;
  expires_at: string;
  last_seen_at: string | null;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
}

export interface Avatars {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  role_id: string;
  source: 'upload' | 'generated' | 'monogram' | 'library';
  blob_id: string | null;
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  crop_x: number | null;
  crop_y: number | null;
  crop_zoom: number | null;
  skin_asset_id: string | null;
  skin_pack_slug: string | null;
  skin_asset_code: string | null;
  skin_license: string | null;
  skin_attribution: string | null;
  skin_sha256: string | null;
}

export interface Backups {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  kind: 'scheduled' | 'pre_update' | 'manual';
  status: 'running' | 'ok' | 'failed' | 'verified' | 'expired' | 'deleted';
  target_uri: string;
  size_bytes: number | null;
  app_version: string | null;
  schema_version: number | null;
  compat_floor: string | null;
  has_db: Generated<0 | 1>;
  has_brains: Generated<0 | 1>;
  has_blobs: Generated<0 | 1>;
  manifest_sha256: string | null;
  is_encrypted: Generated<0 | 1>;
  key_id: string | null;
  started_at: string;
  finished_at: string | null;
  verified_at: string | null;
  expires_at: string | null;
}

export interface Blobs {
  id: string;
  workspace_id: string;
  created_at: Generated<string>;
  created_by: string;
  sha256: string;
  size_bytes: number;
  mime: string | null;
  storage_path: string;
  gc_after: string | null;
}

export interface Capabilities {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  engine_account_id: string;
  kind: 'version' | 'flag' | 'subcommand' | 'model' | 'effort' | 'mode' | 'output_format' | 'quota_window' | 'login_method' | 'instruction_file' | 'hook' | 'mcp' | 'tool' | 'feature' | 'native_memory';
  item_key: string;
  value_state: 'known' | 'unknown';
  value_text: string | null;
  value_json: string | null;
  unknown_reason: string | null;
  source: string;
  confidence: 'direct' | 'indirect' | 'static_catalog';
  auth_mode: 'oauth' | 'api_key' | 'adc' | 'none' | 'unknown';
  cli_version: string | null;
  ordinal: number | null;
  first_seen_at: string;
  last_seen_at: string;
  last_probe_run_id: string;
  missing_since: string | null;
}

export interface ChangeSetItems {
  id: string;
  workspace_id: string;
  change_set_id: string;
  op: 'create' | 'update' | 'delete';
  status: Generated<'pending' | 'accepted' | 'rejected'>;
  dna_field_version_id: string | null;
  instruction_version_id: string | null;
  skill_version_id: string | null;
  role_skill_id: string | null;
  knowledge_item_id: string | null;
  memory_id: string | null;
  taxonomy_node_id: string | null;
  skill_prereq_id: string | null;
  reason: string | null;
  token_delta: Generated<number>;
  created_at: Generated<string>;
}

export interface ChangeSets {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  scope: 'role' | 'position' | 'library' | 'workspace';
  role_id: string | null;
  position_id: string | null;
  proposed_by: string;
  source_thread_id: string | null;
  source_message_id: string | null;
  source_session_id: string | null;
  title: string;
  status: Generated<'open' | 'applied' | 'partially_applied' | 'rejected' | 'expired'>;
  decided_at: string | null;
  decided_by: string | null;
  revision_id: string | null;
}

export interface ChatMessages {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  thread_id: string;
  author_kind: 'owner' | 'user' | 'role' | 'interviewer' | 'trainer' | 'assistant' | 'system' | 'external';
  author_actor_id: string | null;
  channel: 'web' | 'telegram' | 'system';
  content: string;
  status: Generated<'streaming' | 'final' | 'failed' | 'redacted'>;
  context_tokens: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  session_id: string | null;
  reply_to_id: string | null;
  external_id: string | null;
  anchor_count: Generated<number>;
  attachment_count: Generated<number>;
  lang: string | null;
  redacted_at: string | null;
  redacted_by: string | null;
  redact_reason: string | null;
  certainty: 'sure' | 'unsure' | null;
}

export interface ChatThreads {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  kind: 'interview' | 'training' | 'assistant' | 'telegram' | 'workspace' | 'tree';
  role_id: string | null;
  agent: 'interviewer' | 'trainer' | 'assistant' | 'role';
  telegram_bot_id: string | null;
  tg_chat_id: number | null;
  title: string | null;
  status: Generated<'open' | 'paused' | 'closed' | 'archived'>;
  screen_route: string | null;
  state_json: string | null;
  last_message_at: string | null;
  message_count: Generated<number>;
}

export interface Commitments {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  position_id: string;
  promised_by_role_id: string | null;
  counterparty_kind: 'owner' | 'user' | 'external' | 'role';
  counterparty_label: string | null;
  statement: string;
  due_at: string;
  status: Generated<'open' | 'kept' | 'missed' | 'cancelled' | 'renegotiated'>;
  kept_at: string | null;
  missed_at: string | null;
  source: 'conversation' | 'owner' | 'skill' | 'email';
  source_message_id: string | null;
  source_session_id: string | null;
  reward_minor: number | null;
  progress_pct: number | null;
}

export interface CompiledPromptSegments {
  id: string;
  workspace_id: string;
  compiled_prompt_id: string;
  ordinal: number;
  layer: 'values' | 'house_rules' | 'persona' | 'style' | 'drive' | 'position' | 'skills' | 'polaris' | 'frame';
  source_kind: 'dna_field' | 'instruction' | 'skill_index' | 'polaris_rules' | 'polaris' | 'frame';
  is_conditional: Generated<0 | 1>;
  dna_field_version_id: string | null;
  instruction_version_id: string | null;
  skill_version_id: string | null;
  source_display: string;
  text: string;
  token_count: number;
  params_json: string | null;
}

export interface CompiledPrompts {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  role_id: string;
  revision_id: string;
  position_revision_id: string | null;
  rules_revision_id: string | null;
  engine_slug: string | null;
  context_key: Generated<string>;
  compiler_version: string;
  tokenizer: string;
  total_tokens: number;
  frame_tokens: number;
  budget_tokens: number;
  status: 'ok' | 'over_budget' | 'failed';
  content: string;
  content_hash: string;
  stable_prefix_hash: string;
  polaris_params_hash: string | null;
}

export interface Consents {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  user_id: string;
  consent_kind: 'engine_tos_risk' | 'role_as_model_api';
  subject: string;
  notice_version: string;
  notice_hash: string;
  lang: string | null;
  accepted_at: string;
  revoked_at: string | null;
  account_hint: string | null;
}

export interface Containers {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  kind: 'role' | 'system';
  role_id: string | null;
  container_name: string;
  image_ref: string | null;
  image_digest: string | null;
  cli_bundle: string | null;
  desired_state: 'absent' | 'sleeping' | 'running' | 'stopped';
  observed_state: 'absent' | 'creating' | 'created' | 'running' | 'exited' | 'paused' | 'error' | 'unknown';
  state_detail: string | null;
  health: 'ok' | 'degraded' | 'fail' | 'unknown' | null;
  health_checked_at: string | null;
  cpu_limit: number | null;
  mem_limit_mb: number | null;
  session_timeout_s: number | null;
  last_started_at: string | null;
  last_stopped_at: string | null;
  cold_start_ms_p50: number | null;
}

export interface DnaFieldDefs {
  id: string;
  workspace_id: string;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  key: string;
  is_list: Generated<0 | 1>;
  field_group: 'identity' | 'persona' | 'values' | 'style' | 'routine' | 'drive' | 'senses' | 'growth';
  tier: 1 | 2;
  value_type: 'text' | 'enum' | 'scale' | 'bool' | 'date' | 'number';
  enum_options_json: string | null;
  scale_min: number | null;
  scale_max: number | null;
  scale_step: number | null;
  prose_template: string | null;
  label_key: string;
  is_identity_locked: Generated<0 | 1>;
  is_core: Generated<0 | 1>;
  is_required_for_birth: Generated<0 | 1>;
  default_in_prompt: Generated<0 | 1>;
  prompt_layer: 'values' | 'persona' | 'style' | 'drive';
  schema_version: string;
  ordinal: Generated<number>;
  deprecated_at: string | null;
}

export interface DnaFieldVersions {
  id: string;
  workspace_id: string;
  dna_field_id: string;
  version: number | null;
  base_version: number | null;
  status: Generated<'proposed' | 'accepted' | 'rejected'>;
  note: string | null;
  revision_id: string | null;
  change_set_id: string | null;
  created_at: Generated<string>;
  created_by: string;
  decided_at: string | null;
  decided_by: string | null;
  data: string;
  token_count: number;
}

export interface DnaFields {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  role_id: string;
  def_id: string;
  item_index: Generated<number>;
  value_json: string;
  value_num: number | null;
  prose: string | null;
  is_in_prompt: Generated<0 | 1>;
  token_count: Generated<number>;
  tokenizer: string;
  source: 'owner' | 'ai_inferred' | 'system';
  confirmed_at: string | null;
  confirmed_by: string | null;
  status: Generated<'active' | 'proposed'>;
  source_message_id: string | null;
  covered_by_instruction_id: string | null;
}

export interface EgressRules {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  domain_pattern: string;
  port: number | null;
  applies_to: 'all_roles' | 'role' | 'position' | 'tool';
  role_id: string | null;
  position_id: string | null;
  tool_id: string | null;
  action: Generated<'allow' | 'deny'>;
  is_builtin: Generated<0 | 1>;
  note: string | null;
}

export interface EmployeeCards {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  role_id: string;
  revision_id: string;
  compiled_prompt_id: string | null;
  position_id: string;
  status: Generated<'draft' | 'issued' | 'suspended' | 'revoked' | 'superseded'>;
  issued_at: string | null;
  issued_by: string | null;
  suspended_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  dna_signature: string | null;
  prompt_tokens: number | null;
  issue_audit_id: string | null;
  issue_audit_display_id: string | null;
  superseded_by_id: string | null;
  checks_json: string;
  checks_evaluated_at: string | null;
}

export interface EngineAccounts {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  engine_slug: string;
  label: string;
  auth_method: 'subscription' | 'api_key' | 'adc';
  secret_id: string | null;
  auth_volume: string | null;
  account_hint: string | null;
  plan_label: string | null;
  plan_confidence: 'direct' | 'indirect' | 'unknown' | null;
  login_status: Generated<'logged_in' | 'expired' | 'suspended' | 'error' | 'unknown' | 'in_progress'>;
  login_checked_at: string | null;
  login_started_at: string | null;
  cli_version_current: string | null;
  cli_version_pinned: string | null;
  cli_version_latest: string | null;
  quota_state: Generated<'ok' | 'low' | 'exhausted' | 'unknown'>;
  quota_remaining_pct: number | null;
  quota_reset_at: string | null;
  quota_scanned_at: string | null;
  outage_since: string | null;
  last_probe_run_id: string | null;
  runtime_overhead_tokens: number | null;
  overhead_bare_session_id: string | null;
  overhead_shell_session_id: string | null;
  overhead_measured_at: string | null;
  consent_id: string | null;
  status: Generated<'active' | 'disabled' | 'revoked'>;
}

export interface EngineBindings {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  consumer_kind: Generated<'role' | 'system'>;
  role_id: string | null;
  engine_account_id: string;
  priority: number;
  model_key: string | null;
  effort: string | null;
  is_enabled: Generated<0 | 1>;
  selection_state: Generated<'valid' | 'unavailable' | 'unknown'>;
  selection_checked_at: string | null;
}

export interface Engines {
  slug: string;
  workspace_id: Generated<string>;
  name: string;
  vendor: string;
  cli_binary: string;
  adapter_status: 'ready' | 'beta' | 'coming_soon' | 'deprecated';
  adapter_version: string | null;
  priority_order: number;
  tos_risk: 'ok' | 'grey' | 'high' | 'provider_dependent';
  tos_notice_key: string;
  tos_notice_version: string;
  requires_consent: Generated<0 | 1>;
  supports_subscription: Generated<0 | 1>;
  supports_api_key: Generated<0 | 1>;
  core_capable: Generated<0 | 1>;
}

export interface Events {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  kind: string;
  severity: 'ok' | 'info' | 'warn' | 'danger';
  role_id: string | null;
  subject: string;
  result_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_display_id: string | null;
  audit_id: string | null;
  detail_json: string | null;
  failover_reason: 'login_expired' | 'outage' | 'quota_exhausted' | 'account_suspended' | null;
}

export interface IdAliases {
  id: string;
  workspace_id: string;
  created_at: Generated<string>;
  created_by: string;
  entity_type: string;
  entity_id: string;
  old_display_id: string;
  source_code: string;
  new_display_id: string;
  import_revision_id: string | null;
}

export interface IdCounters {
  workspace_id: string;
  prefix: string;
  last_seq: Generated<number>;
}

export interface InstructionVersions {
  id: string;
  workspace_id: string;
  instruction_id: string;
  version: number | null;
  base_version: number | null;
  status: Generated<'proposed' | 'accepted' | 'rejected'>;
  note: string | null;
  revision_id: string | null;
  change_set_id: string | null;
  created_at: Generated<string>;
  created_by: string;
  decided_at: string | null;
  decided_by: string | null;
  data: string;
  token_count: number;
}

export interface Instructions {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  role_id: string | null;
  position_id: string | null;
  layer: 'values' | 'house_rules' | 'persona' | 'style' | 'drive' | 'position';
  ordinal: number;
  name: string;
  content: string;
  condition_kind: Generated<'always' | 'channel' | 'task_tag' | 'state' | 'trigger'>;
  condition_value: string | null;
  engine_scope: string | null;
  is_enabled: Generated<0 | 1>;
  is_core: Generated<0 | 1>;
  token_count: Generated<number>;
  tokenizer: string;
  source: 'owner' | 'ai_inferred' | 'system';
  status: Generated<'active' | 'proposed'>;
  lang: Generated<string>;
  content_hash: string;
}

export interface Jobs {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  kind: 'brain_sync' | 'brain_purge' | 'brain_export' | 'compile_prompt' | 'rollup_usage' | 'probe' | 'runtime_baseline' | 'consolidation' | 'wound_reflection' | 'trial_run' | 'index_knowledge' | 'search_reindex' | 'reminder' | 'proactive_tick' | 'egress_compile' | 'purge' | 'backup' | 'blob_gc' | 'update_check' | 'integrity_check' | 'audit_anchor' | 'skill_usage_rollup';
  status: Generated<'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled'>;
  priority: Generated<number>;
  run_after: string;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  lease_owner: string | null;
  lease_until: string | null;
  dedupe_key: string | null;
  payload_json: string;
  result_json: string | null;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string | null;
}

export interface KnowledgeChunks {
  id: string;
  workspace_id: string;
  knowledge_item_id: string;
  ordinal: number;
  content: string;
  token_count: number;
  page_from: number | null;
  page_to: number | null;
  heading_path: string | null;
  char_start: number | null;
  char_end: number | null;
  content_hash: string | null;
}

export interface KnowledgeItems {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  scope: 'personal' | 'position' | 'workspace';
  role_id: string | null;
  position_id: string | null;
  title: string;
  file_name: string;
  mime: string;
  file_type: string;
  size_bytes: number;
  blob_id: string;
  sha256: string;
  status: Generated<'active' | 'proposed' | 'superseded' | 'obsolete'>;
  processing_state: Generated<'uploaded' | 'extracting' | 'summarizing' | 'indexing' | 'ready' | 'failed'>;
  progress_pct: Generated<number>;
  summary: string | null;
  chunk_count: Generated<number>;
  token_count: Generated<number>;
  duplicate_of_id: string | null;
  duplicate_similarity: number | null;
  superseded_by_id: string | null;
  source: 'owner' | 'ai_inferred' | 'system';
  source_attachment_id: string | null;
  change_set_id: string | null;
  sensitivity: Generated<'normal' | 'personal' | 'confidential'>;
  lang: string | null;
  recall_count: Generated<number>;
  last_recalled_at: string | null;
  error: string | null;
  category_id: string | null;
}

export interface LedgerEntries {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  entry_type: 'activation_grant' | 'grant' | 'reward' | 'honesty_reward' | 'penalty' | 'token_cost' | 'adjustment' | 'reversal' | 'transfer' | 'opening';
  debit_wallet_id: string;
  credit_wallet_id: string;
  amount_minor: number;
  debit_balance_after: number;
  credit_balance_after: number;
  role_id: string | null;
  reason: string;
  task_id: string | null;
  session_id: string | null;
  commitment_id: string | null;
  skill_id: string | null;
  card_id: string | null;
  penalty_class: 'self_reported' | 'dissatisfaction' | 'concealment' | 'harness_violation' | null;
  penalty_rate_bp: number | null;
  basis_balance_minor: number | null;
  evidence_audit_id: string | null;
  evidence_audit_display_id: string | null;
  evidence_hash: string | null;
  reverses_entry_id: string | null;
  recorded_by: string;
  approved_by: string | null;
  idempotency_key: string | null;
}

export interface Memories {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  scope: Generated<'personal' | 'position'>;
  role_id: string | null;
  position_id: string | null;
  kind: 'fact' | 'lesson' | 'person' | 'commitment' | 'procedure';
  content: string;
  confidence: number;
  source_type: 'conversation' | 'owner' | 'consolidation' | 'training' | 'system' | 'reflection';
  source_session_id: string | null;
  source_message_id: string | null;
  status: Generated<'active' | 'proposed' | 'superseded' | 'obsolete'>;
  superseded_by_id: string | null;
  status_reason: string | null;
  commitment_id: string | null;
  is_pinned: Generated<0 | 1>;
  sensitivity: Generated<'normal' | 'personal' | 'confidential'>;
  token_count: number;
  lang: Generated<string>;
  change_set_id: string | null;
  recall_count: Generated<number>;
  last_recalled_at: string | null;
  role_wound_id: string | null;
  evidence_task_id: string | null;
  evidence_ledger_entry_id: string | null;
}

export interface MessageAnchors {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  message_id: string;
  kind: 'pin' | 'reference' | 'annotate' | 'proposal' | 'quote';
  anchor: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_display_id: string | null;
  column_name: string | null;
  column_letter: string | null;
  region_json: string | null;
  snapshot_value: string | null;
  snapshot_hash: string | null;
  entity_version: number | null;
  ordinal: number | null;
  note: string | null;
  resolved_state: Generated<'ok' | 'changed' | 'gone' | 'unknown'>;
  resolved_at: string | null;
}

export interface MessageAttachments {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  message_id: string | null;
  blob_id: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  scan_status: Generated<'pending' | 'clean' | 'rejected' | 'error'>;
  reject_reason: string | null;
  thumbnail_blob_id: string | null;
  uploaded_by: string;
}

export interface ModelRanks {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  engine_slug: string;
  model_key: string;
  rank: number;
  source: 'owner' | 'heuristic' | 'probe';
  basis: string | null;
  ranked_at: string;
  ranked_by: string | null;
}

export interface Notifications {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  user_id: string;
  kind: 'failover' | 'quota_low' | 'update_available' | 'role_error' | 'field_pending' | 'permission_request' | 'memory_proposal' | 'telegram_rejected' | 'brain_drift' | 'backup_failed' | 'pii_in_history' | 'integrity' | 'role_wounded' | 'lessons_proposed' | 'native_memory' | 'core_agent_incident';
  severity: 'ok' | 'info' | 'warn' | 'danger';
  title: string;
  body: string | null;
  target_entity_type: string | null;
  target_id: string | null;
  target_display_id: string | null;
  event_id: string | null;
  dedupe_key: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  resolved_at: string | null;
}

export interface PermissionRequests {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  role_id: string;
  tool_id: string | null;
  requested_tool_slug: string;
  requested_scope: string | null;
  reason: string;
  task_id: string | null;
  session_id: string | null;
  status: Generated<'pending' | 'approved' | 'denied' | 'expired' | 'cancelled'>;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  grant_id: string | null;
}

export interface PolarisChecks {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  role_id: string;
  subject_kind: 'proposal' | 'permission_request' | 'proactive' | 'task_accept';
  change_set_id: string | null;
  permission_request_id: string | null;
  proactive_send_id: string | null;
  task_id: string | null;
  expected_gain_minor: number;
  rules_applied: string;
  rationale: string | null;
  balance_minor_at: number | null;
  rank_at: number | null;
  session_id: string | null;
  audit_id: string | null;
  audit_display_id: string | null;
}

export interface Positions {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  title: string;
  title_template: string | null;
  description: string | null;
  kpis_md: string | null;
  reports_to_position_id: string | null;
  max_trust_tier: number | null;
  default_trust_tier: Generated<number>;
  daily_token_quota: number | null;
  session_token_quota: number | null;
  session_timeout_s: number | null;
  reward_cap_minor: number | null;
  status: Generated<'open' | 'filled' | 'archived'>;
  is_default: Generated<0 | 1>;
  current_revision_id: string | null;
  brain_head_sha: string | null;
}

export interface ProactiveJobs {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  position_id: string;
  name: string;
  cron_expr: string;
  timezone: string;
  action_kind: 'heartbeat_check' | 'digest' | 'run_skill' | 'report' | 'custom_prompt';
  skill_id: string | null;
  prompt: string | null;
  trigger_kind: 'commitment_reminder' | 'task_done' | 'opportunity' | 'incident' | 'heartbeat_digest';
  is_enabled: Generated<0 | 1>;
  misfire_policy: Generated<'skip' | 'run_once'>;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: 'ok' | 'skipped' | 'failed' | null;
}

export interface ProactivePolicies {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  role_id: string;
  is_enabled: Generated<0 | 1>;
  max_per_day: Generated<number>;
  quiet_start_min: number;
  quiet_end_min: number;
  weekend_differs: Generated<0 | 1>;
  weekend_quiet_start_min: number | null;
  weekend_quiet_end_min: number | null;
  timezone: string;
  break_quiet_level: Generated<'never' | 'urgent_only' | 'high_and_above'>;
  channel: Generated<'telegram' | 'email' | 'workspace_chat'>;
  allow_commitment_reminder: Generated<0 | 1>;
  allow_task_done: Generated<0 | 1>;
  allow_opportunity: Generated<0 | 1>;
  allow_incident: Generated<0 | 1>;
  allow_heartbeat_digest: Generated<0 | 1>;
}

export interface ProactiveSends {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  role_id: string;
  policy_id: string | null;
  trigger_kind: 'commitment_reminder' | 'task_done' | 'opportunity' | 'incident' | 'heartbeat_digest';
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  day_local: string;
  channel: 'telegram' | 'email' | 'workspace_chat';
  status: 'reserved' | 'sent' | 'failed' | 'expired' | 'suppressed_quiet' | 'suppressed_cap' | 'suppressed_disabled' | 'suppressed_wounded' | 'test';
  idempotency_key: string | null;
  reserved_until: string | null;
  message_id: string | null;
  task_id: string | null;
  commitment_id: string | null;
  proactive_job_id: string | null;
  sent_at: string | null;
  error: string | null;
  reason: string | null;
}

export interface ProbeRuns {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  engine_account_id: string;
  engine_slug: string;
  container_id: string | null;
  trigger: 'install' | 'startup' | 'schedule' | 'manual' | 'cli_update' | 'error_recovery' | 'login_check';
  cli_version: string | null;
  auth_mode: 'oauth' | 'api_key' | 'adc' | 'none' | 'unknown';
  status: Generated<'running' | 'ok' | 'partial' | 'failed'>;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  summary_json: string | null;
  raw_blob_id: string | null;
  error: string | null;
}

export interface QuotaSnapshots {
  id: string;
  workspace_id: string;
  created_at: Generated<string>;
  created_by: string;
  engine_account_id: string;
  probe_run_id: string | null;
  observed_at: string;
  window_key: string;
  window_seconds: number | null;
  state: 'ok' | 'low' | 'exhausted' | 'unknown';
  remaining_pct: number | null;
  used: number | null;
  limit_value: number | null;
  reset_at: string | null;
  source: 'usage_command' | 'error_signal' | 'session_usage' | 'manual';
  confidence: 'direct' | 'indirect' | 'static_catalog';
  raw_json: string | null;
}

export interface RecallHits {
  id: string;
  workspace_id: string;
  created_at: Generated<string>;
  created_by: string;
  call_id: string;
  session_id: string | null;
  role_id: string;
  memory_id: string | null;
  knowledge_chunk_id: string | null;
  knowledge_item_id: string | null;
  rank: number;
  score: number | null;
  query_hash: string | null;
}

export interface Revisions {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  scope: 'role' | 'position' | 'workspace';
  role_id: string | null;
  position_id: string | null;
  seq: number;
  major: number;
  minor: number;
  kind: 'birth' | 'edit' | 'core_edit' | 'training' | 'restore' | 'import' | 'system';
  is_core: Generated<0 | 1>;
  note: string | null;
  change_set_id: string | null;
  restored_from_id: string | null;
  snapshot_json: string;
  snapshot_hash: string;
  prompt_tokens: number;
  git_commit_sha: string | null;
}

export interface RoleSkills {
  id: string;
  workspace_id: string;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  role_id: string;
  skill_id: string;
  skill_version_id: string;
  status: 'proposed' | 'learned' | 'disabled' | 'removed';
  proficiency: number | null;
  source: 'owner' | 'ai_inferred' | 'system';
  change_set_id: string | null;
  learned_at: string | null;
  uses_7d: Generated<number>;
  last_used_at: string | null;
}

export interface RoleWounds {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  role_id: string;
  wallet_id: string;
  cause_entry_id: string;
  started_at: string;
  ended_at: string | null;
  revive_entry_id: string | null;
  owner_notified_at: string | null;
  notification_id: string | null;
  reflection_job_id: string;
  reflection_session_id: string | null;
  reflection_done_at: string | null;
  lessons_proposed: number | null;
}

export interface Roles {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  name: string;
  name_norm: string;
  color: 'saffron' | 'coral' | 'rose' | 'orchid' | 'iris' | 'azure' | 'teal' | 'jade' | 'moss' | 'olive' | 'clay' | 'slate';
  description: string | null;
  avatar_id: string | null;
  lifecycle_status: Generated<'draft' | 'born' | 'training' | 'candidate' | 'carded' | 'suspended' | 'archived'>;
  runtime_state: Generated<'none' | 'sleeping' | 'starting' | 'running' | 'error' | 'stopped'>;
  runtime_detail: string | null;
  runtime_state_at: string | null;
  condition: Generated<'normal' | 'wounded'>;
  born_at: string | null;
  registry_no: string | null;
  birth_revision_id: string | null;
  current_revision_id: string | null;
  dna_schema_version: Generated<string>;
  prompt_budget_tokens: Generated<number>;
  brain_head_sha: string | null;
  last_active_at: string | null;
}

export interface SchemaMigrations {
  version: Generated<number>;
  name: string;
  kind: 'standard' | 'rebuild' | 'data';
  checksum: string;
  dialect: 'sqlite' | 'postgres';
  compat_min_app_version: string;
  is_expand_only: Generated<0 | 1>;
  applied_at: Generated<string>;
  app_version: string;
  duration_ms: number | null;
  row_counts_json: string | null;
}

export interface SearchDocuments {
  id: Generated<number>;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  chunk_id: string | null;
  display_id: string | null;
  role_id: string | null;
  position_id: string | null;
  scope: string | null;
  status: string | null;
  is_live: Generated<0 | 1>;
  title: string | null;
  excerpt: string | null;
  title_norm: string | null;
  body_norm: string | null;
  lang: string | null;
  weight: Generated<number>;
  source_updated_at: string | null;
}

export interface SearchFts {
  title_norm: SqlValue | null;
  body_norm: SqlValue | null;
}

export interface Secrets {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  kind: 'engine_api_key' | 'telegram_bot_token' | 'backup_target' | 'integration_token' | 'mfa_totp';
  label: string;
  ciphertext: Buffer;
  nonce: Buffer;
  wrapped_dek: Buffer;
  dek_nonce: Buffer;
  kek_id: string;
  alg: Generated<string>;
  last4: string | null;
  fingerprint: string;
  status: Generated<'active' | 'rotated' | 'revoked'>;
  rotated_from_id: string | null;
  last_used_at: string | null;
}

export interface Sessions {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  agent_kind: 'role' | 'interviewer' | 'trainer' | 'consolidator' | 'judge' | 'system';
  role_id: string | null;
  position_id: string | null;
  task_id: string | null;
  thread_id: string | null;
  trigger: 'telegram' | 'heartbeat' | 'proactive' | 'task' | 'chat' | 'trial' | 'interview' | 'training' | 'consolidation' | 'probe' | 'baseline' | 'reflection';
  engine_account_id: string | null;
  engine_slug: string | null;
  model_key: string | null;
  effort: string | null;
  cli_version: string | null;
  compiled_prompt_id: string | null;
  cli_session_ref: string | null;
  container_id: string | null;
  delivered_prompt_hash: string | null;
  polaris_json: string | null;
  polaris_render_hash: string | null;
  polaris_tokens_rendered: number | null;
  native_memory: Generated<'off' | 'imported' | 'discarded' | 'unknown'>;
  title: string | null;
  status: Generated<'running' | 'ok' | 'error' | 'timeout' | 'cancelled' | 'auth_required' | 'quota_exhausted'>;
  error_code: string | null;
  exit_code: number | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  cold_start_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_cache_read: number | null;
  tokens_cache_write: number | null;
  tokens_thinking: number | null;
  cost_micro_usd: number | null;
  failover_count: Generated<number>;
  result_json: string | null;
  phase: 'planning' | 'acting' | null;
  phase_at: string | null;
}

export interface Settings {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  key: string;
  value_json: string;
  note: string | null;
}

export interface SkillEngineSupport {
  workspace_id: string;
  skill_version_id: string;
  engine_slug: string;
}

export interface SkillFiles {
  id: string;
  workspace_id: string;
  skill_version_id: string;
  path: string;
  blob_id: string;
  size_bytes: number;
  sha256: string;
}

export interface SkillPrereqs {
  id: string;
  workspace_id: string;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  skill_id: string;
  requires_skill_id: string;
  kind: 'upgrade' | 'requires';
  status: Generated<'active' | 'proposed' | 'obsolete'>;
  source: 'owner' | 'ai_inferred' | 'system';
  change_set_id: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  note: string | null;
}

export interface SkillVersions {
  id: string;
  workspace_id: string;
  skill_id: string;
  version: number | null;
  base_version: number | null;
  status: Generated<'proposed' | 'accepted' | 'rejected'>;
  description: string;
  content_md: string;
  index_tokens: number;
  load_tokens: number;
  file_count: Generated<number>;
  content_hash: string;
  tokenizer: string;
  note: string | null;
  change_set_id: string | null;
  created_at: Generated<string>;
  created_by: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface Skills {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  slug: string;
  status: Generated<'active' | 'proposed' | 'obsolete'>;
  origin: 'owner' | 'trainer' | 'imported' | 'builtin';
  current_version_id: string | null;
  category_id: string | null;
  tier_label: string | null;
}

export interface SkinAssets {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  pack_slug: string;
  pack_version: string;
  asset_code: string;
  asset_kind: Generated<'portrait' | 'chibi'>;
  name_vi: string;
  name_zh: string | null;
  faction: string | null;
  file_path: string | null;
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | null;
  sha256: string;
  source: string;
  source_url: string | null;
  license: string;
  license_url: string | null;
  attribution: string | null;
  status: Generated<'active' | 'withdrawn'>;
  params_json: string | null;
  params_schema_version: number | null;
  char_kind: 'civil' | 'martial' | 'strategist' | 'lord' | 'soldier' | null;
  gender: 'male' | 'female' | null;
  is_enabled: Generated<0 | 1>;
}

export interface SystemAgents {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  system_key: 'interviewer' | 'trainer' | 'consolidator' | 'judge';
  model_key: string | null;
  effort: string | null;
  is_enabled: Generated<0 | 1>;
  selection_state: Generated<'valid' | 'unavailable' | 'unknown' | 'stale'>;
  selection_checked_at: string | null;
}

export interface Tasks {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  position_id: string | null;
  assignee_role_id: string | null;
  requested_by: string;
  source: 'telegram' | 'web' | 'schedule' | 'proactive' | 'system' | 'training';
  title: string;
  description: string | null;
  status: Generated<'todo' | 'queued' | 'running' | 'waiting_approval' | 'waiting_permission' | 'blocked' | 'done' | 'failed' | 'cancelled'>;
  status_detail: string | null;
  priority: Generated<'low' | 'normal' | 'high' | 'urgent'>;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  result_summary: string | null;
  verification: Generated<'unverified' | 'verified' | 'disputed' | 'rejected'>;
  verified_by: string | null;
  verified_at: string | null;
  commitment_id: string | null;
  parent_task_id: string | null;
  proactive_job_id: string | null;
  thread_id: string | null;
  tokens_total: Generated<number>;
  cost_micro_usd: Generated<number>;
  token_cost_minor: Generated<number>;
  failure_disclosure: 'self_reported' | 'owner_found' | 'system_found' | null;
  failure_report_audit_id: string | null;
  failure_reported_at: string | null;
  paused_by_wound_id: string | null;
  source_message_id: string | null;
}

export interface TaxonomyNodes {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  domain: 'skill' | 'knowledge';
  level: 'group' | 'branch' | 'category';
  parent_id: string | null;
  name: string;
  name_norm: string;
  slug: string;
  description: string | null;
  ordinal: Generated<number>;
  status: Generated<'active' | 'proposed' | 'obsolete'>;
  source: 'owner' | 'ai_inferred' | 'system';
  change_set_id: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
}

export interface TelegramAllowlist {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  bot_id: string;
  tg_user_id: number;
  display_name: string;
  is_owner: Generated<0 | 1>;
  added_via: 'capture' | 'manual' | 'default_setting';
  status: Generated<'active' | 'removed'>;
}

export interface TelegramBots {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  role_id: string;
  bot_username: string;
  bot_tg_id: number | null;
  secret_id: string;
  token_last4: string | null;
  status: Generated<'pending' | 'active' | 'paused' | 'revoked' | 'error'>;
  getme_ok_at: string | null;
  poll_offset: Generated<number>;
  last_update_at: string | null;
  error: string | null;
}

export interface ToolGrants {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  tool_id: string;
  role_id: string | null;
  position_id: string | null;
  mode: 'allow' | 'ask' | 'deny';
  expires_at: string | null;
  source_request_id: string | null;
  note: string | null;
}

export interface Tools {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  slug: string;
  name: string;
  kind: 'gateway_builtin' | 'mcp_server' | 'integration';
  description: string | null;
  risk_level: 'low' | 'medium' | 'high';
  default_mode: 'allow' | 'ask' | 'deny';
  allowed_agents: 'role' | 'system' | 'both';
  config_json: string | null;
  secret_id: string | null;
  is_builtin: Generated<0 | 1>;
  builtin_key: string | null;
  definition_tokens: Generated<number>;
  tokenizer: string | null;
  status: Generated<'active' | 'disabled'>;
}

export interface TrialRuns {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  role_id: string;
  revision_id: string;
  compiled_prompt_id: string | null;
  engine_account_id: string | null;
  status: Generated<'pending' | 'running' | 'passed' | 'failed' | 'skipped'>;
  scenario_count: Generated<number>;
  pass_count: number | null;
  score: number | null;
  pass_threshold: Generated<number>;
  judge_kind: 'llm_judge' | 'owner';
  judge_session_id: string | null;
  result_json: string | null;
  skip_reason: string | null;
  decided_at: string | null;
  decided_by: string | null;
}

export interface TrustTierChanges {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  assignment_id: string;
  role_id: string;
  position_id: string;
  from_tier: number | null;
  to_tier: number;
  kind: 'initial' | 'promotion' | 'demotion' | 'penalty' | 'manual';
  reason: string;
  ledger_entry_id: string | null;
  evidence_audit_id: string | null;
  evidence_audit_display_id: string | null;
  decided_by: string;
}

export interface UiActions {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  message_id: string;
  session_id: string | null;
  action: 'highlight' | 'navigate' | 'annotate' | 'tour' | 'propose_edit';
  anchor: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_display_id: string | null;
  step: number | null;
  payload_json: string | null;
  change_set_id: string | null;
  change_set_display_id: string | null;
  outcome: 'ok' | 'target_gone' | 'failed';
  screen_route: string | null;
}

export interface UpdateRuns {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  from_version: string | null;
  to_version: string;
  trigger: 'auto' | 'manual' | 'rollback';
  initiated_by: string;
  status: Generated<'running' | 'succeeded' | 'rolled_back' | 'failed'>;
  steps_json: string | null;
  backup_id: string | null;
  schema_from: number | null;
  schema_to: number | null;
  compat_floor_before: string | null;
  compat_floor_after: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

export interface UsageDaily {
  id: string;
  workspace_id: string;
  day_local: string;
  role_id: string | null;
  engine_account_id: string | null;
  agent_kind: 'role' | 'interviewer' | 'trainer' | 'consolidator' | 'judge' | 'system';
  sessions_count: Generated<number>;
  tokens_input: Generated<number>;
  tokens_output: Generated<number>;
  tokens_cache_read: Generated<number>;
  tokens_cache_write: Generated<number>;
  tokens_thinking: Generated<number>;
  cost_micro_usd: number | null;
  errors: Generated<number>;
  failovers: Generated<number>;
  proactive_sent: Generated<number>;
  computed_at: string;
}

export interface Users {
  id: string;
  display_id: string;
  display_seq: number;
  username: string;
  email: string | null;
  display_name: string;
  password_hash: string;
  must_change_password: Generated<0 | 1>;
  password_changed_at: string | null;
  failed_login_count: Generated<number>;
  locked_until: string | null;
  last_login_at: string | null;
  locale: string | null;
  timezone: string | null;
  theme: 'dark' | 'light' | 'system' | null;
  avatar_blob_id: string | null;
  created_at: Generated<string>;
  updated_at: string | null;
  disabled_at: string | null;
}

export interface Wallets {
  id: string;
  workspace_id: string;
  display_id: string;
  display_seq: number;
  created_at: Generated<string>;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  version: Generated<number>;
  owner_kind: 'role' | 'treasury' | 'sink' | 'escrow';
  role_id: string | null;
  currency_code: Generated<string>;
  balance_minor: Generated<number>;
  entry_count: Generated<number>;
  last_entry_id: string | null;
  last_entry_at: string | null;
  allow_negative: Generated<0 | 1>;
  status: Generated<'active' | 'frozen' | 'closed'>;
}

export interface WorkspaceMembers {
  workspace_id: string;
  user_id: string;
  access_level: 'owner' | 'admin' | 'operator' | 'viewer';
  created_at: Generated<string>;
  removed_at: string | null;
}

export interface Workspaces {
  id: string;
  kind: 'system' | 'tenant';
  slug: string;
  name: string;
  owner_user_id: string | null;
  short_code: string;
  locale: Generated<string>;
  timezone: Generated<string>;
  currency_code: Generated<string>;
  currency_symbol: Generated<string>;
  status: Generated<'active' | 'suspended' | 'archived'>;
  created_at: Generated<string>;
  updated_at: string | null;
  archived_at: string | null;
  core_agent_locked_at: string | null;
}

/** view (chỉ đọc) */
export interface VAccountConsent {
  workspace_id: ColumnType<string | null, never, never>;
  engine_account_id: ColumnType<string | null, never, never>;
  account_display_id: ColumnType<string | null, never, never>;
  engine_slug: ColumnType<string | null, never, never>;
  account_hint: ColumnType<string | null, never, never>;
  consent_id: ColumnType<string | null, never, never>;
  consent_display_id: ColumnType<string | null, never, never>;
  consent_account_hint: ColumnType<string | null, never, never>;
  consent_accepted_at: ColumnType<string | null, never, never>;
  consent_state: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VAttention {
  workspace_id: ColumnType<string | null, never, never>;
  level: ColumnType<SqlValue | null, never, never>;
  target: ColumnType<Buffer | null, never, never>;
  what: ColumnType<Buffer | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
}

/** view (chỉ đọc) */
export interface VCardChecks {
  workspace_id: ColumnType<string | null, never, never>;
  card_id: ColumnType<string | null, never, never>;
  card_display_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  card_status: ColumnType<string | null, never, never>;
  check_code: ColumnType<SqlValue | null, never, never>;
  check_key: ColumnType<SqlValue | null, never, never>;
  check_status: ColumnType<SqlValue | null, never, never>;
  is_required: ColumnType<SqlValue | null, never, never>;
  evidence_display: ColumnType<SqlValue | null, never, never>;
  detail: ColumnType<SqlValue | null, never, never>;
  checked_at: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VCharacterLibrary {
  workspace_id: ColumnType<string | null, never, never>;
  skin_asset_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  display_seq: ColumnType<number | null, never, never>;
  asset_code: ColumnType<string | null, never, never>;
  name_vi: ColumnType<string | null, never, never>;
  name_zh: ColumnType<string | null, never, never>;
  faction: ColumnType<string | null, never, never>;
  char_kind: ColumnType<string | null, never, never>;
  gender: ColumnType<string | null, never, never>;
  pack_slug: ColumnType<string | null, never, never>;
  pack_version: ColumnType<string | null, never, never>;
  asset_kind: ColumnType<string | null, never, never>;
  source: ColumnType<string | null, never, never>;
  source_url: ColumnType<string | null, never, never>;
  license: ColumnType<string | null, never, never>;
  license_url: ColumnType<string | null, never, never>;
  attribution: ColumnType<string | null, never, never>;
  sha256: ColumnType<string | null, never, never>;
  params_schema_version: ColumnType<number | null, never, never>;
  params_json: ColumnType<string | null, never, never>;
  file_path: ColumnType<string | null, never, never>;
  mime: ColumnType<string | null, never, never>;
  status: ColumnType<string | null, never, never>;
  is_enabled: ColumnType<number | null, never, never>;
  is_selectable: ColumnType<SqlValue | null, never, never>;
  roles_using: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VContainerMounts {
  workspace_id: ColumnType<string | null, never, never>;
  container_id: ColumnType<string | null, never, never>;
  container_display_id: ColumnType<string | null, never, never>;
  kind: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  volume_kind: ColumnType<SqlValue | null, never, never>;
  volume_name: ColumnType<string | null, never, never>;
  mount_path: ColumnType<SqlValue | null, never, never>;
  mode: ColumnType<SqlValue | null, never, never>;
  engine_account_id: ColumnType<string | null, never, never>;
}

/** view (chỉ đọc) */
export interface VCoreAgentAccounts {
  workspace_id: ColumnType<string | null, never, never>;
  engine_binding_id: ColumnType<string | null, never, never>;
  binding_display_id: ColumnType<string | null, never, never>;
  priority: ColumnType<number | null, never, never>;
  is_enabled: ColumnType<number | null, never, never>;
  engine_account_id: ColumnType<string | null, never, never>;
  account_display_id: ColumnType<string | null, never, never>;
  label: ColumnType<string | null, never, never>;
  engine_slug: ColumnType<string | null, never, never>;
  auth_method: ColumnType<string | null, never, never>;
  account_status: ColumnType<string | null, never, never>;
  login_status: ColumnType<string | null, never, never>;
  login_checked_at: ColumnType<string | null, never, never>;
  login_started_at: ColumnType<string | null, never, never>;
  quota_state: ColumnType<string | null, never, never>;
  outage_since: ColumnType<string | null, never, never>;
  core_slug: ColumnType<SqlValue | null, never, never>;
  consent_ok: ColumnType<SqlValue | null, never, never>;
  consent_state: ColumnType<SqlValue | null, never, never>;
  last_login_check_id: ColumnType<string | null, never, never>;
  last_login_check_display_id: ColumnType<string | null, never, never>;
  last_login_check_status: ColumnType<string | null, never, never>;
  last_login_check_at: ColumnType<string | null, never, never>;
  is_ready: ColumnType<SqlValue | null, never, never>;
  not_ready_reason: ColumnType<SqlValue | null, never, never>;
  is_primary: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VCoreAgentOptions {
  slug: ColumnType<string | null, never, never>;
  name: ColumnType<string | null, never, never>;
  vendor: ColumnType<string | null, never, never>;
  cli_binary: ColumnType<string | null, never, never>;
  adapter_status: ColumnType<string | null, never, never>;
  priority_order: ColumnType<number | null, never, never>;
  requires_consent: ColumnType<number | null, never, never>;
  selectable: ColumnType<SqlValue | null, never, never>;
  is_default: ColumnType<SqlValue | null, never, never>;
  badge: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VCoreAgentStatus {
  workspace_id: ColumnType<string | null, never, never>;
  core_slug: ColumnType<SqlValue | null, never, never>;
  core_name: ColumnType<SqlValue | null, never, never>;
  core_agent_locked_at: ColumnType<string | null, never, never>;
  engine_account_id: ColumnType<string | null, never, never>;
  account_display_id: ColumnType<string | null, never, never>;
  account_label: ColumnType<string | null, never, never>;
  binding_display_id: ColumnType<string | null, never, never>;
  is_ready: ColumnType<SqlValue | null, never, never>;
  mode: ColumnType<SqlValue | null, never, never>;
  blocks_admin: ColumnType<SqlValue | null, never, never>;
  reason: ColumnType<SqlValue | null, never, never>;
  reason_text: ColumnType<SqlValue | null, never, never>;
  sub_reason: ColumnType<SqlValue | null, never, never>;
  incident_reason: ColumnType<SqlValue | null, never, never>;
  is_incident: ColumnType<SqlValue | null, never, never>;
  auto_recheck: ColumnType<SqlValue | null, never, never>;
  fix_target: ColumnType<SqlValue | null, never, never>;
  owner_action: ColumnType<SqlValue | null, never, never>;
  overlay_text: ColumnType<SqlValue | null, never, never>;
  fix_hint: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VDnaSheet {
  workspace_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  dna_field_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  field_group: ColumnType<string | null, never, never>;
  key: ColumnType<string | null, never, never>;
  item_index: ColumnType<number | null, never, never>;
  value_json: ColumnType<string | null, never, never>;
  value_num: ColumnType<number | null, never, never>;
  prose: ColumnType<string | null, never, never>;
  value_type: ColumnType<string | null, never, never>;
  source: ColumnType<string | null, never, never>;
  confirmed_at: ColumnType<string | null, never, never>;
  tier: ColumnType<number | null, never, never>;
  is_core: ColumnType<number | null, never, never>;
  prompt_layer: ColumnType<string | null, never, never>;
  is_in_prompt: ColumnType<number | null, never, never>;
  covered_by_instruction_id: ColumnType<string | null, never, never>;
  token_count: ColumnType<number | null, never, never>;
  version: ColumnType<number | null, never, never>;
  status: ColumnType<string | null, never, never>;
}

/** view (chỉ đọc) */
export interface VEmployeeCards {
  workspace_id: ColumnType<string | null, never, never>;
  card_id: ColumnType<string | null, never, never>;
  card_display_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  role_display_id: ColumnType<string | null, never, never>;
  name: ColumnType<string | null, never, never>;
  status: ColumnType<string | null, never, never>;
  issued_at: ColumnType<string | null, never, never>;
  issue_audit_display_id: ColumnType<string | null, never, never>;
  dna_signature: ColumnType<string | null, never, never>;
  prompt_tokens: ColumnType<number | null, never, never>;
  card_major: ColumnType<number | null, never, never>;
  card_minor: ColumnType<number | null, never, never>;
  current_major: ColumnType<number | null, never, never>;
  current_minor: ColumnType<number | null, never, never>;
  superseded_by_display_id: ColumnType<string | null, never, never>;
  core_drift: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VEngineAccounts {
  workspace_id: ColumnType<string | null, never, never>;
  engine_account_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  engine_slug: ColumnType<string | null, never, never>;
  label: ColumnType<string | null, never, never>;
  auth_method: ColumnType<string | null, never, never>;
  login_status: ColumnType<string | null, never, never>;
  quota_state: ColumnType<string | null, never, never>;
  quota_remaining_pct: ColumnType<number | null, never, never>;
  quota_reset_at: ColumnType<string | null, never, never>;
  cli_version_current: ColumnType<string | null, never, never>;
  consumer_kind: ColumnType<string | null, never, never>;
  consumer_role_id: ColumnType<string | null, never, never>;
  consumer_display_id: ColumnType<string | null, never, never>;
  consumer_label: ColumnType<SqlValue | null, never, never>;
  priority: ColumnType<number | null, never, never>;
  runtime_overhead_tokens: ColumnType<number | null, never, never>;
  caps_unknown: ColumnType<SqlValue | null, never, never>;
  is_core_agent: ColumnType<SqlValue | null, never, never>;
  consent_state: ColumnType<SqlValue | null, never, never>;
  consent_display_id: ColumnType<string | null, never, never>;
}

/** view (chỉ đọc) */
export interface VIntegrity {
  check_key: ColumnType<SqlValue | null, never, never>;
  workspace_id: ColumnType<string | null, never, never>;
  value: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VIntegrityTenant {
  fk: ColumnType<SqlValue | null, never, never>;
  workspace_id: ColumnType<string | null, never, never>;
  n: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VLeaderboard {
  workspace_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  wallet_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  name: ColumnType<string | null, never, never>;
  condition: ColumnType<string | null, never, never>;
  balance_minor: ColumnType<number | null, never, never>;
  rank: ColumnType<SqlValue | null, never, never>;
  total_roles: ColumnType<SqlValue | null, never, never>;
  gap_to_next_minor: ColumnType<SqlValue | null, never, never>;
  delta_7d_minor: ColumnType<SqlValue | null, never, never>;
  earned_7d_minor: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VLedgerByRole {
  workspace_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  entry_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  display_seq: ColumnType<number | null, never, never>;
  created_at: ColumnType<string | null, never, never>;
  entry_type: ColumnType<string | null, never, never>;
  penalty_class: ColumnType<string | null, never, never>;
  reason: ColumnType<string | null, never, never>;
  delta_minor: ColumnType<number | null, never, never>;
  balance_after: ColumnType<number | null, never, never>;
  recorded_by: ColumnType<string | null, never, never>;
  evidence_audit_display_id: ColumnType<string | null, never, never>;
  task_id: ColumnType<string | null, never, never>;
}

/** view (chỉ đọc) */
export interface VMemoryChain {
  start_id: ColumnType<string | null, never, never>;
  id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  depth: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VPenaltyPresets {
  workspace_id: ColumnType<string | null, never, never>;
  penalty_class: ColumnType<SqlValue | null, never, never>;
  ordinal: ColumnType<SqlValue | null, never, never>;
  rule: ColumnType<SqlValue | null, never, never>;
  bound_bp: ColumnType<SqlValue | null, never, never>;
  presets_bp_json: ColumnType<SqlValue | null, never, never>;
  never_to_zero: ColumnType<SqlValue | null, never, never>;
  label: ColumnType<SqlValue | null, never, never>;
  note: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VQuotaWindows {
  workspace_id: ColumnType<string | null, never, never>;
  engine_account_id: ColumnType<string | null, never, never>;
  account_display_id: ColumnType<string | null, never, never>;
  consumer_kind: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  priority: ColumnType<number | null, never, never>;
  window_key: ColumnType<string | null, never, never>;
  window_seconds: ColumnType<number | null, never, never>;
  state: ColumnType<string | null, never, never>;
  remaining_pct: ColumnType<number | null, never, never>;
  reset_at: ColumnType<string | null, never, never>;
  observed_at: ColumnType<string | null, never, never>;
  source: ColumnType<string | null, never, never>;
  confidence: ColumnType<string | null, never, never>;
  window_rank: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VRoleAvatarState {
  workspace_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  role_display_id: ColumnType<string | null, never, never>;
  role_name: ColumnType<string | null, never, never>;
  state_rank: ColumnType<SqlValue | null, never, never>;
  state: ColumnType<SqlValue | null, never, never>;
  state_label: ColumnType<SqlValue | null, never, never>;
  source_table: ColumnType<SqlValue | null, never, never>;
  source_id: ColumnType<Buffer | null, never, never>;
  source_display_id: ColumnType<Buffer | null, never, never>;
  since_at: ColumnType<Buffer | null, never, never>;
  expires_at: ColumnType<Buffer | null, never, never>;
  state_note: ColumnType<SqlValue | null, never, never>;
  transient_seconds: ColumnType<SqlValue | null, never, never>;
  idle_after_minutes: ColumnType<SqlValue | null, never, never>;
  evaluated_at: ColumnType<SqlValue | null, never, never>;
  avatar_id: ColumnType<string | null, never, never>;
  avatar_source: ColumnType<string | null, never, never>;
  skin_asset_id: ColumnType<string | null, never, never>;
  asset_code: ColumnType<string | null, never, never>;
  asset_kind: ColumnType<string | null, never, never>;
  character_disabled: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VRolePolaris {
  workspace_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  name: ColumnType<string | null, never, never>;
  goal_value_json: ColumnType<string | null, never, never>;
  balance_minor: ColumnType<number | null, never, never>;
  rank: ColumnType<SqlValue | null, never, never>;
  total_roles: ColumnType<SqlValue | null, never, never>;
  gap_to_next_minor: ColumnType<SqlValue | null, never, never>;
  delta_7d_minor: ColumnType<SqlValue | null, never, never>;
  earned_7d_minor: ColumnType<SqlValue | null, never, never>;
  last_penalty_entry_id: ColumnType<string | null, never, never>;
  last_penalty_display_id: ColumnType<string | null, never, never>;
  last_penalty_minor: ColumnType<number | null, never, never>;
  last_penalty_class: ColumnType<string | null, never, never>;
  last_penalty_lesson_display_id: ColumnType<string | null, never, never>;
  condition: ColumnType<string | null, never, never>;
  open_wound_display_id: ColumnType<string | null, never, never>;
  open_opportunities: ColumnType<SqlValue | null, never, never>;
  polaris_checks_7d: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VRolePromptBudget {
  workspace_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  engine_slug: ColumnType<string | null, never, never>;
  engine_account_id: ColumnType<string | null, never, never>;
  dna_tokens: ColumnType<SqlValue | null, never, never>;
  instruction_tokens: ColumnType<SqlValue | null, never, never>;
  house_rules_tokens: ColumnType<SqlValue | null, never, never>;
  position_tokens: ColumnType<SqlValue | null, never, never>;
  skill_index_tokens: ColumnType<SqlValue | null, never, never>;
  frame_tokens: ColumnType<SqlValue | null, never, never>;
  polaris_tokens: ColumnType<SqlValue | null, never, never>;
  polaris_rules_tokens: ColumnType<number | null, never, never>;
  polaris_suffix_reserve_tokens: ColumnType<number | null, never, never>;
  baseline_overhead_tokens: ColumnType<SqlValue | null, never, never>;
  overhead_estimate_basis: ColumnType<SqlValue | null, never, never>;
  overhead_source: ColumnType<SqlValue | null, never, never>;
  compiled_status: ColumnType<string | null, never, never>;
  tool_definition_tokens: ColumnType<SqlValue | null, never, never>;
  conditional_worst_extra: ColumnType<SqlValue | null, never, never>;
  pending_delta: ColumnType<SqlValue | null, never, never>;
  budget: ColumnType<number | null, never, never>;
  compiled_tokens: ColumnType<SqlValue | null, never, never>;
  runtime_overhead_tokens: ColumnType<SqlValue | null, never, never>;
  total_default: ColumnType<SqlValue | null, never, never>;
  total_worst: ColumnType<SqlValue | null, never, never>;
  headroom: ColumnType<SqlValue | null, never, never>;
  budget_state: ColumnType<SqlValue | null, never, never>;
  overhead_label: ColumnType<SqlValue | null, never, never>;
  polaris_block_tokens: ColumnType<SqlValue | null, never, never>;
  polaris_warning: ColumnType<SqlValue | null, never, never>;
  sign_ok: ColumnType<SqlValue | null, never, never>;
  card_ok: ColumnType<SqlValue | null, never, never>;
  gate_ok: ColumnType<SqlValue | null, never, never>;
  sign_block_reason: ColumnType<SqlValue | null, never, never>;
  card_block_reason: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VRoleSkillTree {
  workspace_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  skill_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  category_id: ColumnType<string | null, never, never>;
  node_state: ColumnType<SqlValue | null, never, never>;
  proficiency: ColumnType<number | null, never, never>;
}

/** view (chỉ đọc) */
export interface VRoleWounds {
  workspace_id: ColumnType<string | null, never, never>;
  role_wound_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  role_display_id: ColumnType<string | null, never, never>;
  name: ColumnType<string | null, never, never>;
  started_at: ColumnType<string | null, never, never>;
  ended_at: ColumnType<string | null, never, never>;
  is_open: ColumnType<SqlValue | null, never, never>;
  cause_display_id: ColumnType<string | null, never, never>;
  cause_penalty_class: ColumnType<string | null, never, never>;
  cause_amount_minor: ColumnType<number | null, never, never>;
  reflection_job_display_id: ColumnType<string | null, never, never>;
  reflection_status: ColumnType<string | null, never, never>;
  reflection_runs: ColumnType<SqlValue | null, never, never>;
  can_rerun_reflection: ColumnType<SqlValue | null, never, never>;
  reflection_session_display_id: ColumnType<string | null, never, never>;
  reflection_done_at: ColumnType<string | null, never, never>;
  lessons_proposed: ColumnType<number | null, never, never>;
  lessons_pending: ColumnType<SqlValue | null, never, never>;
  tasks_paused: ColumnType<SqlValue | null, never, never>;
  commitments_due: ColumnType<SqlValue | null, never, never>;
  revive_suggest_minor: ColumnType<SqlValue | null, never, never>;
  notification_display_id: ColumnType<string | null, never, never>;
  inbound_messages: ColumnType<SqlValue | null, never, never>;
  inbound_pending: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VRoles {
  workspace_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  display_seq: ColumnType<number | null, never, never>;
  name: ColumnType<string | null, never, never>;
  color: ColumnType<string | null, never, never>;
  avatar_id: ColumnType<string | null, never, never>;
  lifecycle_status: ColumnType<string | null, never, never>;
  runtime_state: ColumnType<string | null, never, never>;
  runtime_detail: ColumnType<string | null, never, never>;
  condition: ColumnType<string | null, never, never>;
  engine_slug: ColumnType<string | null, never, never>;
  model_key: ColumnType<string | null, never, never>;
  position_title: ColumnType<string | null, never, never>;
  balance_minor: ColumnType<number | null, never, never>;
  coin_rank: ColumnType<SqlValue | null, never, never>;
  total_roles: ColumnType<SqlValue | null, never, never>;
  tokens_today: ColumnType<SqlValue | null, never, never>;
  skills_count: ColumnType<SqlValue | null, never, never>;
  memories_count: ColumnType<SqlValue | null, never, never>;
  prompt_tokens: ColumnType<SqlValue | null, never, never>;
  prompt_tokens_worst: ColumnType<SqlValue | null, never, never>;
  prompt_budget: ColumnType<number | null, never, never>;
  budget_state: ColumnType<SqlValue | null, never, never>;
  last_active_at: ColumnType<string | null, never, never>;
}

/** view (chỉ đọc) */
export interface VSetupChecklist {
  workspace_id: ColumnType<string | null, never, never>;
  check_code: ColumnType<SqlValue | null, never, never>;
  check_key: ColumnType<SqlValue | null, never, never>;
  source_table: ColumnType<SqlValue | null, never, never>;
  check_status: ColumnType<SqlValue | null, never, never>;
  check_detail: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VSkinPackUsage {
  workspace_id: ColumnType<string | null, never, never>;
  pack_slug: ColumnType<SqlValue | null, never, never>;
  asset_code: ColumnType<SqlValue | null, never, never>;
  skin_asset_id: ColumnType<string | null, never, never>;
  skin_asset_display_id: ColumnType<string | null, never, never>;
  license: ColumnType<string | null, never, never>;
  attribution: ColumnType<string | null, never, never>;
  avatar_id: ColumnType<string | null, never, never>;
  avatar_display_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  role_display_id: ColumnType<string | null, never, never>;
  name: ColumnType<string | null, never, never>;
  is_current: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VSystemAgents {
  workspace_id: ColumnType<string | null, never, never>;
  system_agent_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  system_key: ColumnType<string | null, never, never>;
  model_key: ColumnType<string | null, never, never>;
  effort: ColumnType<string | null, never, never>;
  is_enabled: ColumnType<number | null, never, never>;
  selection_state: ColumnType<string | null, never, never>;
  engine_binding_id: ColumnType<string | null, never, never>;
  binding_display_id: ColumnType<string | null, never, never>;
  engine_account_id: ColumnType<string | null, never, never>;
  account_display_id: ColumnType<string | null, never, never>;
  account_label: ColumnType<string | null, never, never>;
  account_priority: ColumnType<number | null, never, never>;
  account_is_ready: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VTreeNodes {
  workspace_id: ColumnType<string | null, never, never>;
  domain: ColumnType<SqlValue | null, never, never>;
  entity_type: ColumnType<SqlValue | null, never, never>;
  node_id: ColumnType<string | null, never, never>;
  display_id: ColumnType<string | null, never, never>;
  name: ColumnType<string | null, never, never>;
  status: ColumnType<string | null, never, never>;
  category_id: ColumnType<string | null, never, never>;
  category_display_id: ColumnType<string | null, never, never>;
  category_name: ColumnType<string | null, never, never>;
  branch_display_id: ColumnType<string | null, never, never>;
  branch_name: ColumnType<string | null, never, never>;
  group_display_id: ColumnType<string | null, never, never>;
  group_name: ColumnType<string | null, never, never>;
  tier: ColumnType<SqlValue | null, never, never>;
  tier_label: ColumnType<string | null, never, never>;
  prereq_count: ColumnType<SqlValue | null, never, never>;
  anchor: ColumnType<SqlValue | null, never, never>;
}

/** view (chỉ đọc) */
export interface VWoundMessages {
  workspace_id: ColumnType<string | null, never, never>;
  role_wound_id: ColumnType<string | null, never, never>;
  wound_display_id: ColumnType<string | null, never, never>;
  role_id: ColumnType<string | null, never, never>;
  role_display_id: ColumnType<string | null, never, never>;
  name: ColumnType<string | null, never, never>;
  wound_open: ColumnType<SqlValue | null, never, never>;
  message_id: ColumnType<string | null, never, never>;
  message_display_id: ColumnType<string | null, never, never>;
  created_at: ColumnType<string | null, never, never>;
  author_kind: ColumnType<string | null, never, never>;
  channel: ColumnType<string | null, never, never>;
  thread_id: ColumnType<string | null, never, never>;
  thread_display_id: ColumnType<string | null, never, never>;
  thread_kind: ColumnType<string | null, never, never>;
  reassigned_task_display_id: ColumnType<string | null, never, never>;
  is_pending: ColumnType<SqlValue | null, never, never>;
}

export interface DB {
  actors: Actors;
  app_versions: AppVersions;
  assignments: Assignments;
  audit_log: AuditLog;
  auth_sessions: AuthSessions;
  avatars: Avatars;
  backups: Backups;
  blobs: Blobs;
  capabilities: Capabilities;
  change_set_items: ChangeSetItems;
  change_sets: ChangeSets;
  chat_messages: ChatMessages;
  chat_threads: ChatThreads;
  commitments: Commitments;
  compiled_prompt_segments: CompiledPromptSegments;
  compiled_prompts: CompiledPrompts;
  consents: Consents;
  containers: Containers;
  dna_field_defs: DnaFieldDefs;
  dna_field_versions: DnaFieldVersions;
  dna_fields: DnaFields;
  egress_rules: EgressRules;
  employee_cards: EmployeeCards;
  engine_accounts: EngineAccounts;
  engine_bindings: EngineBindings;
  engines: Engines;
  events: Events;
  id_aliases: IdAliases;
  id_counters: IdCounters;
  instruction_versions: InstructionVersions;
  instructions: Instructions;
  jobs: Jobs;
  knowledge_chunks: KnowledgeChunks;
  knowledge_items: KnowledgeItems;
  ledger_entries: LedgerEntries;
  memories: Memories;
  message_anchors: MessageAnchors;
  message_attachments: MessageAttachments;
  model_ranks: ModelRanks;
  notifications: Notifications;
  permission_requests: PermissionRequests;
  polaris_checks: PolarisChecks;
  positions: Positions;
  proactive_jobs: ProactiveJobs;
  proactive_policies: ProactivePolicies;
  proactive_sends: ProactiveSends;
  probe_runs: ProbeRuns;
  quota_snapshots: QuotaSnapshots;
  recall_hits: RecallHits;
  revisions: Revisions;
  role_skills: RoleSkills;
  role_wounds: RoleWounds;
  roles: Roles;
  schema_migrations: SchemaMigrations;
  search_documents: SearchDocuments;
  search_fts: SearchFts;
  secrets: Secrets;
  sessions: Sessions;
  settings: Settings;
  skill_engine_support: SkillEngineSupport;
  skill_files: SkillFiles;
  skill_prereqs: SkillPrereqs;
  skill_versions: SkillVersions;
  skills: Skills;
  skin_assets: SkinAssets;
  system_agents: SystemAgents;
  tasks: Tasks;
  taxonomy_nodes: TaxonomyNodes;
  telegram_allowlist: TelegramAllowlist;
  telegram_bots: TelegramBots;
  tool_grants: ToolGrants;
  tools: Tools;
  trial_runs: TrialRuns;
  trust_tier_changes: TrustTierChanges;
  ui_actions: UiActions;
  update_runs: UpdateRuns;
  usage_daily: UsageDaily;
  users: Users;
  wallets: Wallets;
  workspace_members: WorkspaceMembers;
  workspaces: Workspaces;
  v_account_consent: VAccountConsent;
  v_attention: VAttention;
  v_card_checks: VCardChecks;
  v_character_library: VCharacterLibrary;
  v_container_mounts: VContainerMounts;
  v_core_agent_accounts: VCoreAgentAccounts;
  v_core_agent_options: VCoreAgentOptions;
  v_core_agent_status: VCoreAgentStatus;
  v_dna_sheet: VDnaSheet;
  v_employee_cards: VEmployeeCards;
  v_engine_accounts: VEngineAccounts;
  v_integrity: VIntegrity;
  v_integrity_tenant: VIntegrityTenant;
  v_leaderboard: VLeaderboard;
  v_ledger_by_role: VLedgerByRole;
  v_memory_chain: VMemoryChain;
  v_penalty_presets: VPenaltyPresets;
  v_quota_windows: VQuotaWindows;
  v_role_avatar_state: VRoleAvatarState;
  v_role_polaris: VRolePolaris;
  v_role_prompt_budget: VRolePromptBudget;
  v_role_skill_tree: VRoleSkillTree;
  v_role_wounds: VRoleWounds;
  v_roles: VRoles;
  v_setup_checklist: VSetupChecklist;
  v_skin_pack_usage: VSkinPackUsage;
  v_system_agents: VSystemAgents;
  v_tree_nodes: VTreeNodes;
  v_wound_messages: VWoundMessages;
}

export const TABLES = ["actors","app_versions","assignments","audit_log","auth_sessions","avatars","backups","blobs","capabilities","change_set_items","change_sets","chat_messages","chat_threads","commitments","compiled_prompt_segments","compiled_prompts","consents","containers","dna_field_defs","dna_field_versions","dna_fields","egress_rules","employee_cards","engine_accounts","engine_bindings","engines","events","id_aliases","id_counters","instruction_versions","instructions","jobs","knowledge_chunks","knowledge_items","ledger_entries","memories","message_anchors","message_attachments","model_ranks","notifications","permission_requests","polaris_checks","positions","proactive_jobs","proactive_policies","proactive_sends","probe_runs","quota_snapshots","recall_hits","revisions","role_skills","role_wounds","roles","schema_migrations","search_documents","search_fts","secrets","sessions","settings","skill_engine_support","skill_files","skill_prereqs","skill_versions","skills","skin_assets","system_agents","tasks","taxonomy_nodes","telegram_allowlist","telegram_bots","tool_grants","tools","trial_runs","trust_tier_changes","ui_actions","update_runs","usage_daily","users","wallets","workspace_members","workspaces"] as const;
export const VIEWS = ["v_account_consent","v_attention","v_card_checks","v_character_library","v_container_mounts","v_core_agent_accounts","v_core_agent_options","v_core_agent_status","v_dna_sheet","v_employee_cards","v_engine_accounts","v_integrity","v_integrity_tenant","v_leaderboard","v_ledger_by_role","v_memory_chain","v_penalty_presets","v_quota_windows","v_role_avatar_state","v_role_polaris","v_role_prompt_budget","v_role_skill_tree","v_role_wounds","v_roles","v_setup_checklist","v_skin_pack_usage","v_system_agents","v_tree_nodes","v_wound_messages"] as const;
