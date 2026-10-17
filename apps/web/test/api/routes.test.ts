import * as contracts from '@ga/contracts';
import { ROUTES } from '@ga/contracts';
import { describe, expect, it } from 'vitest';

// Kiểu route của client suy ra từ TÊN export (`OPS-33` ↔ `OPS_33`, xem src/api/routes.ts): test này giữ cho ánh xạ đó đúng ở runtime.
describe('ánh xạ id route ↔ export của @ga/contracts', () => {
  it('mọi route trong ROUTES có export tên <LANE>_<NN> trỏ đúng route đó', () => {
    const exported = contracts as unknown as Record<string, { id?: string } | undefined>;
    const bad: string[] = [];
    for (const r of ROUTES) {
      if (exported[r.id.replace('-', '_')]?.id !== r.id) bad.push(r.id);
    }
    expect(bad).toEqual([]);
  });

  it('id có dạng LANE-NN (hai chữ số) — nếu hợp đồng đổi dạng id, kiểu RouteId của web phải đổi theo', () => {
    for (const r of ROUTES) expect(r.id, r.id).toMatch(/^(SYS|GW|WRK|OPS|EXT)-\d{2}$/);
  });
});
