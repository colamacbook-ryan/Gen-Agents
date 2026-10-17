// Lỗi của supervisor: mã ổn định (trả cho ga-app), thông điệp ngắn KHÔNG chứa payload / vé / env.

export type SupervisorErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'not_managed'
  | 'name_conflict'
  | 'policy_violation'
  | 'container_not_running'
  | 'busy'
  | 'docker_error'
  | 'internal';

const HTTP_STATUS: Record<SupervisorErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  not_managed: 403,
  name_conflict: 409,
  policy_violation: 403,
  container_not_running: 409,
  busy: 409,
  docker_error: 502,
  internal: 500,
};

export class SupervisorError extends Error {
  readonly code: SupervisorErrorCode;
  readonly rules: readonly string[];
  constructor(code: SupervisorErrorCode, message: string, rules: readonly string[] = []) {
    super(message);
    this.name = 'SupervisorError';
    this.code = code;
    this.rules = rules;
  }
  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}
