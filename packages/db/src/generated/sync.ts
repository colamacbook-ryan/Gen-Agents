// GENERATED bởi `pnpm db:gen` từ db/spec/schema_v2_2.sql @ Second-Brain 70903fd (DATABASE v2.3.2) — KHÔNG SỬA TAY.
export const SYNC = {
  rev: "70903fdd54cb8f2adf231d9222e5436090c06f07",
  databaseVersion: "2.3.2",
  /** Hàm SQL mà schema gọi — mọi kết nối phải đăng ký đủ (hợp đồng ⑥-05). */
  appFunctions: ["app_local_time","app_maint","app_now"] as readonly string[],
  counts: { tables: 81, virtualTables: 1, indexes: 284, triggers: 415, views: 31 },
} as const;
