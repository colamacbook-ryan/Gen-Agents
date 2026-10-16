// Actor = người, Role hoặc tiến trình hệ thống ghi vào DB (DATABASE §2.3: mọi *_by → actors.id).
// Mọi ghi DB đi qua `conn.write(actorId, fn)` (hợp đồng kết nối ⑥-05); job / tiến trình dùng actor system của workspace.

/** = CHECK actors.system_key (test @ga/db đối chiếu với DB). */
export const ACTOR_SYSTEM_KEYS = [
  'system',
  'interviewer',
  'trainer',
  'consolidator',
  'judge',
  'scheduler',
  'gateway',
  'updater',
  'telegram',
  'assistant',
] as const;
export type ActorSystemKey = (typeof ACTOR_SYSTEM_KEYS)[number];

export const ACTOR_KINDS = ['user', 'role', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];
