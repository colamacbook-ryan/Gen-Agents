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
| `pnpm lint` | Biome + luật riêng của repo (`scripts/lint-rules.mjs`: cấm `OR REPLACE`, tên CLI/model ngoài adapter, tên owner, env `*SESSION*`/`*_OAUTH_TOKEN`, `console.log` ở apps, dockerode ngoài supervisor, I/O trong transaction, ghi DB ngoài `conn.write(actor, fn)`, regex nguy cơ ReDoS, component trùng tên, ranh giới import, ký tự vô hình / bidi / fullwidth, …; danh sách: `node scripts/lint-rules.mjs --list`) |
| `pnpm lint:rules --selftest` | mỗi luật phải bắt đúng tệp mồi của nó |
| `pnpm typecheck` | kiểm `tsconfig.json` gốc tham chiếu đủ mọi project workspace (`packages/*`, `apps/*`, `testing/…`) rồi `tsc -b`; lệch thì chạy `pnpm tsconfig:refs` |
| `pnpm test:it:runtime` | IT runtime của supervisor (Docker thật; không có package `@ga/supervisor` ⇒ đỏ, không im lặng) |
| `pnpm test` | Vitest: contracts, hợp đồng kết nối DB, runner migration, parity, selftest lint / license |
| `pnpm db:test` | `db:sync --check` (SQL = đầu ra generator, manifest khớp) + `db:gen --check` + bộ test Python của DB (`db/spec`) + parity runner TS ≡ Python |
| `pnpm db:mutation -- --all` | DROP từng trigger → bộ test phải đỏ qua dòng FAIL; có lượt đối chứng (`--sample N`, `--changed`, `--only <trigger>`, `--baseline`) |
| `pnpm db:sync` | (nguồn = repo từ DB v2.3.4) sinh lại `db/spec/schema_v2_2.sql` từ generator, chạy test Python, ghi manifest `SYNC.json`; `--check` cho CI |
| `pnpm db:gen` | sinh migration (baseline + `R__triggers` + `R__views`) và kiểu Kysely từ DB spec; `--check` cho CI |
| `pnpm license:check` | cổng license (đọc từ tệp LICENSE) + asset; `-- --write` sinh lại `THIRD-PARTY.md`; `--selftest` |
| `pnpm sec:scan` | gitleaks quét lịch sử git (CI); `-- --staged` quét nội dung đã stage (cổng commit) |
| `pnpm dev:dockerd` · `pnpm docker:netcheck` | khởi `dockerd` trên máy cloud nếu chưa chạy · kiểm mạng `internal` + container hai mạng |

## Cổng commit

Mọi commit chỉ tạo khi các lệnh kiểm đạt (không ghi "OK" khi chưa chạy):

```bash
scripts/gate-commit.sh -F <tệp thông điệp> <tệp>...   # = git add đúng các tệp đó → lint → typecheck → test → sec:scan --staged → commit
```

Index có tệp đã stage ngoài danh sách (checkout dùng chung) ⇒ script dừng; cổng đỏ ⇒ không commit.
Kiểm test có bắt được lỗi không: `scripts/mutate.sh --replace <tệp> <cũ> <mới> [--cmd "<lệnh test>"]` (hoặc `--patch`) —
chạy trong `git worktree` tạm, không đụng worktree đang làm việc; thoát 0 = bị bắt, 3 = sống.

Fixture ca dương của bộ lọc credential phải dựng lúc chạy (vd ghép chuỗi / hàm sinh), không để chuỗi giống credential
nguyên văn trong mã nguồn; `sec:scan -- --staged` bắt trước khi vào lịch sử.

## Cấu trúc (M0)

```
packages/contracts/   hợp đồng giữa module (zod + TS) — đóng băng ở M0, đổi qua PR "contract"
packages/db/          migrations/sqlite (sinh từ db/spec), runner, connection.ts (hợp đồng kết nối ⑥-05), generated/ (kiểu Kysely)
db/spec/              NGUỒN DUY NHẤT của schema + test DB (generator, SQL, view, test, mutate.py, CHANGELOG.md; SYNC.json = manifest)
scripts/              lint-rules, license-gate, db-sync, db-test, dev-dockerd, docker-netcheck, sec-scan
deploy/compose/       khung compose (mạng) + compose kiểm mạng
```

## License

© 2026 Afi Labs — **All rights reserved.** Repo công khai để xem, không cấp quyền sử dụng. Xem [LICENSE](LICENSE).
Thành phần bên thứ ba: [THIRD-PARTY.md](THIRD-PARTY.md) · asset: [ASSET_MANIFEST.json](ASSET_MANIFEST.json).
