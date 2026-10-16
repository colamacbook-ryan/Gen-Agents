// GA-EGRESS-TEST-HOOKS — CHỈ CÓ TRONG IMAGE TEST. Image phát hành (Dockerfile.app của L-OPS) PHẢI loại tệp này; khi thiếu,
// ga-egress coi như không có "chế độ học" và không có allowPrivate (fail-closed). `pnpm images:assert-no-testkit` nên tìm
// chuỗi GA-EGRESS-TEST-HOOKS trong image phát hành (đề xuất cho L-OPS / INT).
// - GA_EGRESS_LEARN=1: yêu cầu ngoài allowlist vẫn được cho đi và ghi sự kiện `learn` (để học domain một CLI cần) — CNS-162.
// - GA_EGRESS_TEST_ALLOW_PRIVATE=1: luật có allowPrivate được hiệu lực (máy chủ giả trong mạng Docker có IP nội mạng).

export function testHooks(env: NodeJS.ProcessEnv): { learnMode: boolean; allowPrivateHonored: boolean } {
  return {
    learnMode: env.GA_EGRESS_LEARN === '1',
    allowPrivateHonored: env.GA_EGRESS_TEST_ALLOW_PRIVATE === '1',
  };
}
