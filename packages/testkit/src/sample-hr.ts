// Bổ sung mẫu request cho route L-HR có ràng buộc chéo trường mà hợp đồng không khai (handler đòi "ít nhất một trường",
// "scope ↔ layer ↔ ref khớp nhau"): mẫu tối thiểu của hợp đồng (body rỗng) không thoả, nên bổ sung phần còn thiếu.
import type { RefPrefixes, SampleRequest } from './sample.ts';

type Patch = (s: SampleRequest, refFor: ((prefixes: RefPrefixes) => string | undefined) | undefined) => void;
type Obj = Record<string, unknown>;

export const HR_ROUTE_PATCHES: Readonly<Record<string, Patch>> = {
  // SYS-38: phải đổi ít nhất một thứ
  'SYS-38': (s) => {
    const body = (s.body ?? {}) as Obj;
    if (body.value === undefined && body.inPrompt === undefined) body.inPrompt = true;
    s.body = body;
  },
  // SYS-47: scope ↔ layer ↔ ref nhất quán; lớp không lõi (lõi / Nội quy chỉ owner và đòi lý do)
  'SYS-47': (s, refFor) => {
    const body = (s.body ?? {}) as Obj;
    if (body.positionRef !== undefined) {
      body.scope = 'position';
      body.layer = 'position';
      delete body.roleRef;
    } else {
      body.scope = 'role';
      body.layer = 'style';
      body.roleRef ??= refFor?.(['RL']) ?? 'RL-0001';
    }
    s.body = body;
  },
  // SYS-48: phải đổi ít nhất một thứ
  'SYS-48': (s) => {
    const body = (s.body ?? {}) as Obj;
    if (Object.keys(body).filter((k) => k !== 'reason').length === 0) body.enabled = true;
    s.body = body;
  },
};
