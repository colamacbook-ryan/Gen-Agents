// GENERATED bởi `pnpm db:gen` từ db/spec/schema_v2_2.sql (nguồn = repo, DB v2.3.5) — KHÔNG SỬA TAY.
export const SYNC = {
  rev: "repo",
  databaseVersion: "2.3.5",
  /** Hàm SQL mà schema gọi — mọi kết nối phải đăng ký đủ (hợp đồng ⑥-05). */
  appFunctions: ["app_actor","app_local_time","app_maint","app_now"] as readonly string[],
  counts: { tables: 81, virtualTables: 1, indexes: 284, triggers: 748, views: 31 },
} as const;
