# THIRD-PARTY — thành phần bên thứ ba

> SINH TỰ ĐỘNG bởi `pnpm license:check -- --write` (scripts/license-gate.mjs). Không sửa tay — CI đỏ nếu lệch.
> License đọc từ chính tệp LICENSE của từng gói (STD-04 §6). Chính sách: `scripts/license-policy.json`.

## Đi vào sản phẩm (28 gói, gồm phụ thuộc gián tiếp)

| Gói | Phiên bản | License | Nhận ra từ tệp LICENSE | Ghi chú |
|---|---|---|---|---|
| @babel/runtime | 7.29.10 | MIT | MIT |  |
| @tanstack/history | 1.162.5 | MIT | MIT |  |
| @tanstack/query-core | 5.104.3 | MIT | MIT |  |
| @tanstack/react-query | 5.104.3 | MIT | MIT |  |
| @tanstack/react-router | 1.170.45 | MIT | MIT |  |
| @tanstack/react-store | 0.11.2 | MIT | MIT |  |
| @tanstack/router-core | 1.171.38 | MIT | MIT |  |
| @tanstack/store | 0.11.2 | MIT | MIT |  |
| @types/react | 19.3.0 | MIT | MIT |  |
| better-sqlite3 | 13.0.3 | MIT | MIT |  |
| cookie-es | 3.1.1 | MIT | MIT |  |
| csstype | 3.2.3 | MIT | MIT |  |
| html-parse-stringify | 4.0.1 | MIT | MIT |  |
| i18next | 26.4.7 | MIT | MIT |  |
| isbot | 5.2.2 | Unlicense | Unlicense |  |
| kysely | 0.29.6 | MIT | MIT |  |
| lucide-react | 1.58.0 | ISC | MIT, ISC | tệp license còn nhắc: MIT (gói nhúng — xem tệp) |
| node-addon-api | 8.9.2 | MIT | MIT |  |
| react | 19.3.1 | MIT | MIT |  |
| react-dom | 19.3.1 | MIT | MIT |  |
| react-i18next | 17.0.20 | MIT | MIT |  |
| scheduler | 0.28.0 | MIT | MIT |  |
| seroval | 1.6.9 | MIT | MIT |  |
| seroval-plugins | 1.6.9 | MIT | MIT |  |
| typescript | 5.9.3 | Apache-2.0 | Apache-2.0 |  |
| use-sync-external-store | 1.7.0 | MIT | MIT |  |
| zod | 4.6.7 | MIT | MIT |  |
| zustand | 5.0.15 | MIT | MIT |  |

Ghi chú thành phần nhúng: `better-sqlite3` kèm SQLite (public domain — sqlite.org/copyright.html) trong bản build N-API.

## Chỉ dùng lúc dev / build / test — không đóng gói vào sản phẩm (78 gói)

| Gói | Phiên bản | License | Nhận ra từ tệp LICENSE | Ghi chú |
|---|---|---|---|---|
| @axe-core/playwright | 4.14.0 | MPL-2.0 | MPL-2.0 |  |
| @babel/code-frame | 7.29.7 | MIT | MIT |  |
| @babel/helper-validator-identifier | 7.29.7 | MIT | MIT |  |
| @biomejs/biome | 2.5.15 | MIT | Apache-2.0, MIT | tệp license còn nhắc: Apache-2.0 (gói nhúng — xem tệp) |
| @biomejs/cli-linux-x64 | 2.5.15 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| @biomejs/cli-linux-x64-musl | 2.5.15 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | MIT |  |
| @oxc-project/types | 0.154.0 | MIT | MIT |  |
| @rolldown/binding-linux-x64-gnu | 1.2.14 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| @rolldown/binding-linux-x64-musl | 1.2.14 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| @rolldown/pluginutils | 1.0.1 | MIT | MIT |  |
| @standard-schema/spec | 1.1.0 | MIT | MIT |  |
| @testing-library/dom | 10.4.2 | MIT | MIT |  |
| @testing-library/react | 16.3.3 | MIT | MIT |  |
| @testing-library/user-event | 14.6.8 | MIT | MIT |  |
| @types/aria-query | 5.0.4 | MIT | MIT |  |
| @types/better-sqlite3 | 9.6.0 | MIT | MIT |  |
| @types/chai | 5.2.3 | MIT | MIT |  |
| @types/deep-eql | 4.0.2 | MIT | MIT |  |
| @types/estree | 1.0.9 | MIT | MIT |  |
| @types/node | 22.20.5 | MIT | MIT |  |
| @types/react-dom | 19.3.0 | MIT | MIT |  |
| @types/whatwg-mimetype | 3.0.2 | MIT | MIT |  |
| @types/ws | 8.18.2 | MIT | MIT |  |
| @vitest/expect | 4.1.12 | MIT | MIT |  |
| @vitest/mocker | 4.1.12 | MIT | MIT |  |
| @vitest/pretty-format | 4.1.12 | MIT | MIT |  |
| @vitest/runner | 4.1.12 | MIT | MIT |  |
| @vitest/snapshot | 4.1.12 | MIT | MIT |  |
| @vitest/spy | 4.1.12 | MIT | MIT |  |
| @vitest/utils | 4.1.12 | MIT | MIT |  |
| ansi-regex | 5.0.1 | MIT | MIT |  |
| ansi-styles | 5.2.0 | MIT | MIT |  |
| aria-query | 5.3.0 | Apache-2.0 | Apache-2.0 |  |
| assertion-error | 2.0.1 | MIT | MIT |  |
| axe-core | 4.14.0 | MPL-2.0 | MPL-2.0, MIT, ISC | tệp license còn nhắc: MIT, ISC (gói nhúng — xem tệp) |
| buffer-image-size | 0.6.4 | MIT | MIT |  |
| chai | 6.3.0 | MIT | MIT |  |
| convert-source-map | 2.0.0 | MIT | MIT |  |
| dequal | 2.0.3 | MIT | MIT |  |
| detect-libc | 2.1.2 | Apache-2.0 | Apache-2.0 |  |
| dom-accessibility-api | 0.5.16 | MIT | MIT |  |
| entities | 7.0.1 | BSD-2-Clause | BSD-2-Clause |  |
| es-module-lexer | 2.3.2 | MIT | MIT |  |
| estree-walker | 3.0.3 | MIT | MIT |  |
| expect-type | 1.4.0 | Apache-2.0 | Apache-2.0 |  |
| fdir | 6.5.0 | MIT | MIT |  |
| happy-dom | 21.0.3 | MIT | MIT |  |
| js-tokens | 4.0.0 | MIT | MIT |  |
| lightningcss | 1.33.0 | MPL-2.0 | MPL-2.0 |  |
| lightningcss-linux-x64-gnu | 1.33.0 | MPL-2.0 | MPL-2.0 |  |
| lightningcss-linux-x64-musl | 1.33.0 | MPL-2.0 | MPL-2.0 |  |
| lz-string | 1.5.0 | MIT | MIT |  |
| magic-string | 0.30.21 | MIT | MIT |  |
| nanoid | 3.3.20 | MIT | MIT |  |
| obug | 2.2.1 | MIT | MIT |  |
| pathe | 2.0.3 | MIT | MIT |  |
| picocolors | 1.1.1 | ISC | ISC |  |
| picomatch | 4.0.7 | MIT | MIT |  |
| playwright-core | 1.56.1 | Apache-2.0 | Apache-2.0 |  |
| postcss | 8.5.30 | MIT | MIT |  |
| pretty-format | 27.5.1 | MIT | MIT |  |
| react-is | 17.0.2 | MIT | MIT |  |
| rolldown | 1.2.14 | MIT | MIT |  |
| siginfo | 2.0.0 | ISC | ISC |  |
| source-map-js | 1.2.2 | BSD-3-Clause | BSD-3-Clause |  |
| stackback | 0.0.2 | MIT | — | không kèm tệp LICENSE (chỉ dùng lúc dev) |
| std-env | 4.3.0 | MIT | MIT |  |
| tinybench | 2.9.0 | MIT | MIT |  |
| tinyexec | 1.3.1 | MIT | MIT |  |
| tinyglobby | 0.2.17 | MIT | MIT |  |
| tinyrainbow | 3.2.0 | MIT | MIT |  |
| undici-types | 6.21.0 | MIT | MIT |  |
| vite | 8.3.4 | MIT | Apache-2.0, MIT, ISC, BSD-2-Clause | tệp license còn nhắc: Apache-2.0, ISC, BSD-2-Clause (gói nhúng — xem tệp) |
| vitest | 4.1.12 | MIT | MIT, BSD-3-Clause | tệp license còn nhắc: BSD-3-Clause (gói nhúng — xem tệp) |
| whatwg-mimetype | 3.0.0 | MIT | MIT |  |
| why-is-node-running | 2.3.0 | MIT | MIT |  |
| ws | 8.22.0 | MIT | MIT |  |

## Image upstream chạy như chương trình riêng (aggregate, không liên kết)

Chưa dùng ở M0. Khi compose thêm `caddy:2`, `tecnativa/docker-socket-proxy` (M1/M2): ghi vào đây + danh sách rà pháp lý trước khi bán.
