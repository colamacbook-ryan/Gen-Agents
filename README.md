# Gen-Agents

> 🚧 Đang xây dựng — bước ⑥ (code MVP), milestone **M0: nền móng + hợp đồng**. Kế hoạch: `01-projects/gen-agents/spec/BUILD-PLAN.md` (Second-Brain).

Self-host-app: đội "nhân viên AI" (Role) chạy trên CLI AI của chính chủ sở hữu, mỗi Role một container, quản trị bằng Web GUI.

## Chạy local (3 lệnh)

Cần Node 22 (≥ 22.18: chạy thẳng script `.ts` bằng type stripping) và Python 3 (bộ test DB).

```bash
corepack enable
pnpm install
pnpm test
```

## Lệnh chuẩn

| Lệnh | Làm gì |
|---|---|
| `pnpm lint` | Biome + luật riêng của repo (`scripts/lint-rules.mjs`: cấm `OR REPLACE`, tên CLI/model ngoài adapter, tên owner, env `*SESSION*`/`*_OAUTH_TOKEN`, `console.log` ở apps, dockerode ngoài supervisor, I/O trong transaction, ghi DB ngoài `conn.write(actor, fn)`, regex nguy cơ ReDoS, component trùng tên, ranh giới import) |
| `pnpm lint:rules --selftest` | mỗi luật phải bắt đúng tệp mồi của nó |
| `pnpm typecheck` | `tsc -b` (TS project references) |
| `pnpm test` | Vitest: contracts, hợp đồng kết nối DB, runner migration, parity, selftest lint / license |
| `pnpm db:test` | 94 ca Python của DB chạy nguyên văn trên bản vendor + parity runner TS ≡ Python |
| `pnpm db:mutation --sample 20` | DROP từng trigger → bộ test phải đỏ; có lượt đối chứng (`--all`, `--changed`, `--only <trigger>`) |
| `pnpm db:sync -- --rev <sha>` | vendor DB spec từ Second-Brain theo commit (không đọc working tree); `--check` kiểm sha |
| `pnpm db:gen` | sinh migration (baseline + `R__triggers` + `R__views`) và kiểu Kysely từ DB spec; `--check` cho CI |
| `pnpm license:check` | cổng license (đọc từ tệp LICENSE) + asset; `-- --write` sinh lại `THIRD-PARTY.md`; `--selftest` |
| `pnpm sec:scan` | gitleaks quét lịch sử git |
| `pnpm dev:dockerd` · `pnpm docker:netcheck` | khởi `dockerd` trên máy cloud nếu chưa chạy · kiểm mạng `internal` + container hai mạng |

## Cấu trúc (M0)

```
packages/contracts/   hợp đồng giữa module (zod + TS) — đóng băng ở M0, đổi qua PR "contract"
packages/db/          migrations/sqlite (sinh từ db/spec), runner, connection.ts (hợp đồng kết nối ⑥-05), generated/ (kiểu Kysely)
db/spec/              DB spec vendor từ Second-Brain theo commit (SYNC.json) + mutate.py
scripts/              lint-rules, license-gate, db-sync, db-test, dev-dockerd, docker-netcheck, sec-scan
deploy/compose/       khung compose (mạng) + compose kiểm mạng
```

## License

© 2026 Afi Labs — **All rights reserved.** Repo công khai để xem, không cấp quyền sử dụng. Xem [LICENSE](LICENSE).
Thành phần bên thứ ba: [THIRD-PARTY.md](THIRD-PARTY.md) · asset: [ASSET_MANIFEST.json](ASSET_MANIFEST.json).
