// GENERATED bởi `pnpm db:gen` từ db/spec/schema_v2_2.sql @ Second-Brain f54d06a (DATABASE v2.3.0) — KHÔNG SỬA TAY.
export const SYNC = {
  rev: "f54d06a46c8adb547f181bb5891a2625eb7cc7e1",
  databaseVersion: "2.3.0",
  /** Hàm SQL mà schema gọi — mọi kết nối phải đăng ký đủ (hợp đồng ⑥-05). */
  appFunctions: ["app_local_time","app_maint","app_now"] as readonly string[],
  counts: { tables: 80, virtualTables: 1, indexes: 283, triggers: 402, views: 29 },
} as const;
