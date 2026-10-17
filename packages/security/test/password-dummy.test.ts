// Review MEDIUM (2026-10-16): verifyAgainstDummy từng giữ promise bị reject ⇒ một lần băm dummy lỗi làm mọi lần đăng nhập
// user lạ thất bại ngay không băm (thời gian lệch user thật ⇒ lộ user). Tệp riêng ⇒ trạng thái module sạch (dummy chưa tính).
import { describe, expect, it } from 'vitest';
import { hashPassword, PasswordHasherBusyError, passwordHasherRuns, verifyAgainstDummy } from '../src/index.ts';

describe('dummy hash không bị "kẹt" sau một lần lỗi', () => {
  it('băm dummy lỗi một lần (hàng đợi đầy) ⇒ lần sau vẫn băm lại và kiểm đúng; sau đó mỗi lần đúng một lần kiểm', async () => {
    // lấp đầy hàng đợi worker (16 lượt) ⇒ lần băm dummy đầu tiên bị từ chối PasswordHasherBusyError
    const fill = Array.from({ length: 16 }, (_, i) => hashPassword(`lấp hàng đợi ${i}`));
    await expect(verifyAgainstDummy('user-lạ')).rejects.toBeInstanceOf(PasswordHasherBusyError);
    await Promise.all(fill);

    // lần sau: dummy được tính lại (1 lần băm) + kiểm (1 lần) — không thất bại tức thì
    const before = passwordHasherRuns();
    expect(await verifyAgainstDummy('user-lạ')).toBe(false);
    expect(passwordHasherRuns() - before).toBe(2);

    // từ đây đường user lạ tốn đúng một lần kiểm
    for (let i = 0; i < 2; i++) {
      const b = passwordHasherRuns();
      expect(await verifyAgainstDummy(`user-lạ-${i}`)).toBe(false);
      expect(passwordHasherRuns() - b).toBe(1);
    }
  }, 60_000);
});
