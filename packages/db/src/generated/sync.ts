// GENERATED bởi `pnpm db:gen` từ db/spec/schema_v2_2.sql @ Second-Brain 359e59b (DATABASE v2.3.1) — KHÔNG SỬA TAY.
export const SYNC = {
  rev: "359e59bb1fe8d895318e44c1c7e8d501345aad0e",
  databaseVersion: "2.3.1",
  /** Hàm SQL mà schema gọi — mọi kết nối phải đăng ký đủ (hợp đồng ⑥-05). */
  appFunctions: ["app_local_time","app_maint","app_now"] as readonly string[],
  counts: { tables: 81, virtualTables: 1, indexes: 284, triggers: 408, views: 31 },
} as const;
