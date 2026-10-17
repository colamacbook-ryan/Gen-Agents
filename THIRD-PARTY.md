# THIRD-PARTY — thành phần bên thứ ba

> SINH TỰ ĐỘNG bởi `pnpm license:check -- --write` (scripts/license-gate.mjs). Không sửa tay — CI đỏ nếu lệch.
> License đọc từ chính tệp LICENSE của từng gói (STD-04 §6). Chính sách: `scripts/license-policy.json`.

## Đi vào sản phẩm (5 gói, gồm phụ thuộc gián tiếp)

| Gói | Phiên bản | License | Nhận ra từ tệp LICENSE | Ghi chú |
|---|---|---|---|---|
| better-sqlite3 | 13.0.3 | MIT | MIT |  |
| hash-wasm | 4.12.0 | MIT | MIT |  |
| kysely | 0.29.6 | MIT | MIT |  |
| node-addon-api | 8.9.2 | MIT | MIT |  |
| zod | 4.6.7 | MIT | MIT |  |

Ghi chú thành phần nhúng: `better-sqlite3` kèm SQLite (public domain — sqlite.org/copyright.html) trong bản build N-API.

## Chỉ dùng lúc dev / build / test — không đóng gói vào sản phẩm (53 gói)

| Gói | Phiên bản | License | Nhận ra từ tệp LICENSE | Ghi chú |
|---|---|---|---|---|
| @biomejs/biome | 2.5.15 | MIT | Apache-2.0, MIT | tệp license còn nhắc: Apache-2.0 (gói nhúng — xem tệp) |
| @biomejs/cli-linux-x64 | 2.5.15 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| @biomejs/cli-linux-x64-musl | 2.5.15 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | MIT |  |
| @oxc-project/types | 0.154.0 | MIT | MIT |  |
| @rolldown/binding-linux-x64-gnu | 1.2.14 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| @rolldown/binding-linux-x64-musl | 1.2.14 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| @rolldown/pluginutils | 1.0.1 | MIT | MIT |  |
| @standard-schema/spec | 1.1.0 | MIT | MIT |  |
| @types/better-sqlite3 | 9.6.0 | MIT | MIT |  |
| @types/chai | 5.2.3 | MIT | MIT |  |
| @types/deep-eql | 4.0.2 | MIT | MIT |  |
| @types/estree | 1.0.9 | MIT | MIT |  |
| @types/node | 22.20.5 | MIT | MIT |  |
| @vitest/expect | 4.1.12 | MIT | MIT |  |
| @vitest/mocker | 4.1.12 | MIT | MIT |  |
| @vitest/pretty-format | 4.1.12 | MIT | MIT |  |
| @vitest/runner | 4.1.12 | MIT | MIT |  |
| @vitest/snapshot | 4.1.12 | MIT | MIT |  |
| @vitest/spy | 4.1.12 | MIT | MIT |  |
| @vitest/utils | 4.1.12 | MIT | MIT |  |
| assertion-error | 2.0.1 | MIT | MIT |  |
| chai | 6.3.0 | MIT | MIT |  |
| convert-source-map | 2.0.0 | MIT | MIT |  |
| detect-libc | 2.1.2 | Apache-2.0 | Apache-2.0 |  |
| es-module-lexer | 2.3.2 | MIT | MIT |  |
| estree-walker | 3.0.3 | MIT | MIT |  |
| expect-type | 1.4.0 | Apache-2.0 | Apache-2.0 |  |
| fdir | 6.5.0 | MIT | MIT |  |
| lightningcss | 1.33.0 | MPL-2.0 | MPL-2.0 |  |
| lightningcss-linux-x64-gnu | 1.33.0 | MPL-2.0 | MPL-2.0 |  |
| lightningcss-linux-x64-musl | 1.33.0 | MPL-2.0 | MPL-2.0 |  |
| magic-string | 0.30.21 | MIT | MIT |  |
| nanoid | 3.3.20 | MIT | MIT |  |
| obug | 2.2.1 | MIT | MIT |  |
| pathe | 2.0.3 | MIT | MIT |  |
| picocolors | 1.1.1 | ISC | ISC |  |
| picomatch | 4.0.7 | MIT | MIT |  |
| postcss | 8.5.30 | MIT | MIT |  |
| rolldown | 1.2.14 | MIT | MIT |  |
| siginfo | 2.0.0 | ISC | ISC |  |
| source-map-js | 1.2.2 | BSD-3-Clause | BSD-3-Clause |  |
| stackback | 0.0.2 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| std-env | 4.3.0 | MIT | MIT |  |
| tinybench | 2.9.0 | MIT | MIT |  |
| tinyexec | 1.3.1 | MIT | MIT |  |
| tinyglobby | 0.2.17 | MIT | MIT |  |
| tinyrainbow | 3.2.0 | MIT | MIT |  |
| typescript | 5.9.3 | Apache-2.0 | Apache-2.0 |  |
| undici-types | 6.21.0 | MIT | MIT |  |
| vite | 8.3.4 | MIT | Apache-2.0, MIT, ISC, BSD-2-Clause | tệp license còn nhắc: Apache-2.0, ISC, BSD-2-Clause (gói nhúng — xem tệp) |
| vitest | 4.1.12 | MIT | MIT, BSD-3-Clause | tệp license còn nhắc: BSD-3-Clause (gói nhúng — xem tệp) |
| why-is-node-running | 2.3.0 | MIT | MIT |  |

## Image upstream chạy như chương trình riêng (aggregate, không liên kết)

Chưa dùng ở M0. Khi compose thêm `caddy:2`, `tecnativa/docker-socket-proxy` (M1/M2): ghi vào đây + danh sách rà pháp lý trước khi bán.
