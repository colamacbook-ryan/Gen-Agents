# testing/fakes — ASSUMPTIONS (giả định chưa kiểm với CLI / dịch vụ thật)

> **CHỈ DÙNG TRONG TEST / IMAGE `*-test`. KHÔNG BAO GIỜ VÀO IMAGE PHÁT HÀNH** (BUILD-PLAN §C.3, §A.2-5).
> Mọi tệp `.ts` và `bin/*` trong thư mục này mang marker `GA-FAKES-TEST-ONLY` (test `marker-and-data.test.ts` ép).
> Mục nào chưa kiểm thật = **chưa kiểm, Spike 1c (M6)**. Spike 1c ghi đúng/sai từng ID; sai thì sửa adapter + CLI giả cùng lúc (BUILD-PLAN §C.7).

## 0. Cách dùng nhanh

| Việc | Lệnh |
|---|---|
| CLI giả cho `PATH` (dev / driver `local`) | `PATH=testing/fakes/bin:$PATH agy --version` · `claude --version` |
| Máy chủ giả độc lập | `node testing/fakes/serve.ts <vendor\|telegram\|update-feed\|engine-source> [--host H] [--port N] [--scenario S] [--pubkey-out F] [--fakes-root D]` |
| Tạo trạng thái "đã đăng nhập" không qua PTY | `GA_FAKE_AUTH_DIR=/auth/en-0001 node testing/fakes/seed-auth.ts <agy\|claude> [account]` |
| Test | `pnpm --filter @ga/fakes test` (cần `testing/fakes` có trong `pnpm-workspace.yaml`) |

### Gọi kiểu `ga-runner` (env do adapter dựng, KHÔNG có `GA_FAKE_*`)

Runner tự dựng argv + env từ adapter (bundle chỉ mang ý định) nên env của exec có thể không chứa biến nào của fake, kể cả `PATH`.
CLI giả chạy được khi gọi đúng kiểu đó (test `runner-style.test.ts`: argv adapter, env chỉ có `HOME`, cwd = thư mục lượt, binary là launcher
cài dưới `<engines>/<slug>/<version>/bin/`, credential nối bằng symlink từ `/auth/<en>`):

- **Cấu hình qua tệp**: mọi biến `GA_FAKE_*` (và `HTTP(S)_PROXY` / `NO_PROXY`) có thể nằm trong tệp JSON phẳng `{"GA_FAKE_SCENARIO":"outage", …}`, tìm theo thứ tự `$GA_FAKE_CONFIG_FILE` → `/etc/ga-fakes/config.json` → `<gốc fakes>/config.json` (vd `/opt/ga-fakes/config.json`). Tệp chỉ là mặc định (env thật thắng), đọc lại MỖI lần chạy ⇒ harness đổi kịch bản giữa các lượt bằng một lần ghi tệp qua `docker exec`. Khoá lạ / giá trị không phải chuỗi / JSON hỏng ⇒ CLI thoát 70.
- **Launcher không phụ thuộc `PATH`**: thử `node` trên PATH rồi `/usr/local/bin`, `/usr/bin`, `/opt/node22/bin` (hoặc `nodeBin` do harness chỉ định khi dựng engine-source); không thấy ⇒ exit 127 + thông báo. Launcher đặt `GA_FAKE_LAUNCHER` = đường của chính nó.
- **Vé lượt**: cấu hình MCP không nêu `Authorization` ⇒ lấy vé ở `/run/ga/<lượt>/ticket` khi `HOME=/run/ga/<lượt>/home` (bố cục của `TURN_EXEC` trong contracts), hoặc `GA_FAKE_TICKET_FILE`.
- **MCP của agy**: ngoài `agy mcp add`, đọc thêm tệp `GA_FAKE_MCP_CONFIG` (`{mcpServers:{…}}`) cho trường hợp runner ghi cấu hình ở chỗ adapter chọn (AG-MCP-1).

### Biến kịch bản (CLI giả; đọc ở MỖI lần chạy)

| Biến | Ý nghĩa |
|---|---|
| `GA_FAKE_SCENARIO` | tên kịch bản, hoặc JSON `{"name":…, "resetAt":…, "status":503, "delayMs":…, "script":{…}, "exitAfterLogin":true}` |
| `GA_FAKE_SCENARIO_FILE` | đường tới tệp JSON cùng dạng; **thắng** `GA_FAKE_SCENARIO`; đọc lại mỗi lượt (đổi kịch bản không cần dựng lại container) |
| `GA_FAKE_VENDOR_URL` | có ⇒ CLI gọi `fake-vendor` (qua `HTTP_PROXY` nếu đặt ⇒ đi qua `ga-egress`); không có ⇒ CLI tự đóng vai hãng bằng đúng `vendorReply` |
| `GA_FAKE_VENDOR_TIMEOUT_MS` | CLI bỏ chờ vendor sau chừng này ms, coi như mất mạng (mặc định 120000) |
| `GA_FAKE_LOGIN_TIMEOUT_MS` | thời hạn chờ dán mã (agy mặc định 60000 như Spike 1b; claude 300000 — giả định CL-LOGIN-1) |
| `GA_FAKE_AUTH_DIR` | đặt RIÊNG tệp credential vào thư mục này (mô phỏng "nối bằng biến môi trường tới /auth/<en>", BUILD-PLAN §B.5 bước 4) |
| `GA_FAKE_CANARY` | cố định canary thay vì `GA-CANARY-<uuid>` ngẫu nhiên |
| `GA_FAKE_ROTATE_CREDS=1` | sau lượt thành công ghi lại credential bằng rename nguyên tử (token mới, cùng canary) ⇒ thay symlink — thử rủi ro "token mới rơi vào tmpfs" |
| `GA_FAKE_PRINT_IDENTITY=1` | CLI in danh tính (mặc định KHÔNG in, đúng Spike 1b) — cần cho ca `identity_changed` |
| `GA_FAKE_ECHO_TOOL_ARGS=1` | (claude) in args tool THẬT vào stream-json (mặc định in `"$AUTH"` nguyên văn) — để thử bộ lọc stdout của runner |
| `GA_FAKE_MCP_SERVER` | chọn máy chủ MCP theo tên khi cấu hình có nhiều |
| `GA_FAKE_HELP_STREAM=stderr` | (agy) in help ra stderr (stream thật chưa biết: AG-HELP-1) |
| `GA_FAKE_SELF_UPDATE=warn\|fail` | (agy) thử ghi `.fake-self-update` CẠNH launcher đã cài (`<engines>/agy/<ver>/bin/`; không có launcher thì cạnh mã); mount chỉ đọc ⇒ cảnh báo / thoát 1 (AG-UPDATE-1). Chạy bằng root thì chmod không chặn được — dùng mount `:ro` thật |
| `GA_FAKE_CONFIG_FILE` · `GA_FAKE_MCP_CONFIG` · `GA_FAKE_TICKET_FILE` | xem mục "Gọi kiểu `ga-runner`" |
| `GA_FAKE_VERSION`, `GA_FAKE_NOW` | ép version in ra / đồng hồ của fake (ISO) |

Kịch bản: `ok` · `quota_exhausted` (+`resetAt`) · `account_suspended` · `login_expired` · `outage` (+`status` 5xx) · `hang` · `malformed_json` · `slow` (+`delayMs`) · `version_drift` · `identity_changed` · `network_down` (mất mạng) · `login_abandoned` (đăng nhập bỏ dở: không bao giờ nhận mã).
Kịch bản agentic: `script: {reply, calls:[{tool, args}]}`; chuỗi `"$AUTH"` trong `args` = nội dung mọi tệp credential (ca injection CNS-133).

## 1. Những gì LÀ dữ liệu thật (Spike 1b, không phải giả định)

- `agy --version` = `1.3.5`; `claude --version` = `2.1.299 (Claude Code)`.
- `--help` của cả hai và `help <sub>` / `<sub> --help` của agy: byte-for-byte từ `help-dumps/` (sha256 ghim trong test).
- `agy models` chưa đăng nhập: exit 1, "Please sign in to view available models. Launch the CLI without arguments to sign in."; có đăng nhập / API key: 11 id (TSV).
- agy chưa đăng nhập + `-p`: in URL OAuth + "Waiting for authentication (timeout 60s)... Or, paste the authorization code here and press Enter:", **chờ tới 60 s kể cả khi stdin EOF**, hết hạn: `Error: authentication timed out.` + `error: authentication failed or timed out`, exit 1, stdout 1 dòng JSON `status:ERROR`. Bị SIGTERM: `Error: authentication interrupted.`.
- agy exit code: 0 ok · 1 auth · 2 dùng sai cờ · 3 lỗi model/agent kèm `AGY_ERROR: {short_error,status,error_code,code_kind,retryable,error_id}` trên stderr; lỗi API key sai (`API_KEY_INVALID`, HTTP 400) nguyên văn.
- agy `mcp list` rỗng: `No MCP servers configured.`; `plugin list --json`: `[]`; `agent`: rỗng; `remote-control status`: 3 dòng lỗi systemd bus.
- claude `-p "/model"` và `-p "/usage"`: văn bản kết quả nguyên văn; `claude auth status` có trường `loggedIn`, `authMethod`, `apiProvider` (**không** có trường danh tính — G-23).
- claude stream-json lượt thường: các sự kiện `system/init`, `stream_event`, `assistant`, `rate_limit_event`, `result` (shape trích từ dump; ID, đường dẫn, danh sách tool/plugin của máy nguồn **không** chép).

## 2. Giả định (mỗi mục một ID — sai/đúng ghi ở Spike 1c)

### 2.1 agy (`AG-*`)

| ID | Giả định | Vì sao phải kiểm / ảnh hưởng |
|---|---|---|
| AG-HELP-1 | `--help` / `help <sub>` in ra **stdout**. Go `flag` mặc định in usage ra stderr; Spike không ghi stream. | Adapter phải đọc cả stdout + stderr như `probe.py` (`h or e`). `GA_FAKE_HELP_STREAM=stderr` để thử. |
| AG-JSON-1 | `-p --output-format json` thành công: `{conversation_id, status:"SUCCESS", response, error:"", duration_seconds, num_turns, usage{input_tokens,output_tokens,thinking_tokens,cache_read_tokens,total_tokens}}` (dạng của lỗi đã thấy; `"SUCCESS"` thấy ở `/usage` chế độ API key). | Schema thành công chưa thấy (chưa đăng nhập). `parseStreamLine` / `classify` của L-ENG phụ thuộc. |
| AG-STREAM-1 | `-p --output-format stream-json` thành công = NDJSON: `{type:"init",conversation_id,model}` · `{type:"tool_call",id,name}` · `{type:"tool_result",id,name,is_error,text}` · `{type:"delta",text}` · `{type:"result",…như AG-JSON-1}`. Lỗi: dòng `{type:"result",status:"ERROR",…}`. | **Bịa theo cấu trúc hợp lý**; L-ENG cần thống nhất khi viết `parseStreamLine`. Spike 1c đo schema thật rồi sửa cả hai. |
| AG-USAGE-1 | `-p "/usage" --output-format json` sau OAuth: `command.data.groups:[{id,label,remaining_fraction,reset_time}]`; hết quota ⇒ `remaining_fraction:0` + `reset_time`. Chế độ API key: `groups:[]` (đã thấy). | Payload `groups[]` thật chưa biết (BUILD-PLAN §C.2). |
| AG-AUTH-1 | Tệp credential OAuth = `<HOME>/.gemini/antigravity-cli/oauth_creds.json`, JSON `{access_token:"ya29.…", refresh_token:"1//0…", id_token:<JWT>, …}` + canary. | Tên / vị trí tệp thật chưa thấy (chưa đăng nhập). Quyết định `authAllowlist` của agy (đang `'unknown'`). |
| AG-AUTH-2 | `GA_FAKE_AUTH_DIR` (chỉ có ở fake) chuyển riêng tệp credential. CLI thật có biến tương đương hay không: chưa biết. | Lựa chọn "symlink hay biến môi trường" (§B.5 bước 4) chỉ chốt được ở M6 với CLI thật. |
| AG-NATIVE-1 | Trạng thái native mỗi lượt: `<state>/conversations/<conv>.json` (có prompt + reply) và `<state>/log/agy.log`, cùng thư mục `~/.gemini/antigravity-cli/` (thư mục có thật; Spike thấy `log/`, `cache/`, `conversation_summaries.db`, `installation_id`). | Vị trí và định dạng thật của transcript agy: chưa kiểm. Chỉ để IT thấy "có tệp native sau lượt". |
| AG-AFTER-OAUTH-1 | Sau OAuth (chạy `agy` không cờ) agy **tiếp tục chạy như agent tương tác có công cụ** tới khi stdin đóng / bị kill; prompt `> `, đọc từng dòng. Kịch bản `exitAfterLogin` cho biến thể thoát ngay. | BUILD-PLAN §A.2-3 / CNS-134 nêu như một rủi ro; hành vi thật chưa kiểm (Spike 1c, tiêu chí "sau OAuth agy làm gì"). |
| AG-ERR-QUOTA | Hết quota = HTTP 429 `RESOURCE_EXHAUSTED` ⇒ exit 3, `AGY_ERROR{error_code:429,code_kind:"http",retryable:false}`; `short_error` có `(quota resets at <ISO>)` nếu có giờ reset. | Bảng mã lỗi → lý do là giả định tới Spike 1c (`errors.ts` của adapter). |
| AG-ERR-SUSPENDED | Tài khoản bị khoá = 403 `PERMISSION_DENIED` ("This account has been suspended"), exit 3. | như trên |
| AG-ERR-EXPIRED | Đăng nhập hết hạn (đã từng đăng nhập) = 401 `UNAUTHENTICATED`, exit 3 — **không** quay lại luồng OAuth. Thật có thể in lại URL OAuth rồi exit 1 (giống chưa đăng nhập). | Phân biệt `AUTH_REQUIRED` / `login_expired` của adapter. |
| AG-ERR-OUTAGE | Sự cố hãng = 5xx (mặc định 503 `UNAVAILABLE`), `retryable:true`, exit 3. | như trên |
| AG-ERR-NET | Mất mạng: exit 3, `code_kind:"network"`, `error_code:0`, `retryable:true`, `short_error` có `dial tcp: lookup … no such host`. | chưa kiểm |
| AG-ERR-DECODE | Phản hồi hỏng: exit 3, `code_kind:"decode"`, `status:"INTERNAL"`. | chưa kiểm |
| AG-TIMEOUT-1 | `--print-timeout 30s` (Go duration) hết hạn: exit 3, `code_kind:"timeout"`, `status:"DEADLINE_EXCEEDED"`. Thật: chưa biết. | `--print-timeout` mặc định không giới hạn (đã thấy) ⇒ adapter luôn đặt tường minh. |
| AG-MCP-1 | `agy mcp add` ghi `<state>/mcp_servers.json`; lượt `-p` đọc file này (+ `GA_FAKE_MCP_CONFIG` nếu có). Dòng `mcp list` khi có máy chủ: `name⇥type⇥url`. Thật: vị trí cấu hình MCP ở chế độ `-p` và khi đổi HOME chưa kiểm. | BUILD-PLAN §B.5: "vị trí config / credential khi đổi HOME và MCP ở chế độ -p: chưa kiểm". |
| AG-IDENT-1 | Danh tính (khi `GA_FAKE_PRINT_IDENTITY=1`) in ở stderr của `agy models`: `Signed in as <email>`. Thật: agy có in danh tính không — Spike 1c tiêu chí 5. | Luật "đổi danh tính" (G-23) chỉ chạy được nếu CLI in danh tính. |
| AG-UPDATE-1 | `agy update` in `Already up to date (1.3.5).`; bản giả không tự cập nhật. Thật có self-updater nền (Spike 1b). `GA_FAKE_SELF_UPDATE` chỉ thử ghi cạnh tệp thực thi. | CNS-137: mount chỉ đọc có chặn / gây lỗi không — chưa kiểm. |
| AG-MODELS-1 | `agy models` sau OAuth in cùng 11 id của catalog chế độ API key. Thật: danh sách theo quyền của tài khoản. | Spike 1b ghi rõ catalog tĩnh ≠ entitlement. |
| AG-SLASH-1 | Chỉ lệnh slash `/usage` được giả lập; `/model`, `/compact`… coi như prompt thường. | — |
| AG-CLI-1 | Cờ lạ ⇒ `flag provided but not defined: <cờ>` + help, exit 2 (quy ước Go); `--print` + `--prompt-interactive` ⇒ exit 2 (changelog 1.3.4); lệnh con chưa giả lập ⇒ exit 2. | Chỉ exit 2 là dữ liệu thật (Spike); văn bản là quy ước. |

### 2.2 claude (`CL-*`)

| ID | Giả định | Vì sao phải kiểm |
|---|---|---|
| CL-NATIVE-1 | Thư mục cấu hình = `$CLAUDE_CONFIG_DIR` hoặc `$HOME/.claude`; credential `.credentials.json` (`{claudeAiOauth:{accessToken:"sk-ant-oat01-…",refreshToken:"sk-ant-ort01-…",…}}` + canary); mỗi lượt ghi `projects/<cwd, ký tự ngoài [A-Za-z0-9] thành '-'>/<session>.jsonl` và `history.jsonl` (có prompt). `--no-session-persistence` ⇒ không ghi. | **Không có trong dump** (từ hiểu biết về CLI). Quyết định `authAllowlist` / `nativeStatePaths` của adapter claude — đúng ở IT với CLI giả, kiểm thật ở M6 (BUILD-PLAN §E.2). |
| CL-AUTH-STATUS-1 | `claude auth status`: JSON in đẹp (2 dấu cách), **exit 1 khi chưa đăng nhập**; `GA_FAKE_PRINT_IDENTITY=1` thêm trường `email` (tên trường chưa kiểm). | Spike chỉ thấy dạng đã đăng nhập (`loggedIn:true`). |
| CL-LOGIN-1 | `claude auth login`: in `If the browser didn't open, visit:\n<URL>\nPaste code here if prompted > `, chờ mã ≤ 300 s, ghi credential, in `Login successful.`, **thoát** (khác agy). Hết hạn: `Login timed out`, exit 1. URL dùng host `.invalid`. | Lời nhắc / thời hạn / việc có thoát sau login trong container: chưa kiểm. |
| CL-ERR-1 | Lỗi API ⇒ sự kiện `result` có `is_error:true`, `subtype:"success"`, `num_turns:0`, exit 1; định dạng text in thông điệp ra **stdout**. | Dump chỉ có `result` thành công. |
| CL-ERR-2 | Chưa đăng nhập + `-p` ⇒ `Not logged in · Please run /login`, exit 1. | chưa kiểm |
| CL-ERR-QUOTA | `You've hit your limit · resets HH:MM (UTC)` (hoặc không giờ). | Văn bản thật theo phiên bản; adapter KHÔNG nên dựa vào chữ — ưu tiên CL-QUOTA-1. |
| CL-ERR-SUSP | `API Error: 403 {"type":"error","error":{"type":"permission_error","message":"Your account has been suspended"}}`. | chưa kiểm |
| CL-ERR-EXPIRED | `Please run /login · API Error: 401 {…"authentication_error"… "OAuth token has expired…"}`. | chưa kiểm |
| CL-ERR-OUTAGE | `API Error: 503 {…"api_error"…}` (hoặc 5xx tuỳ `status`). | chưa kiểm |
| CL-ERR-NET | `API Error: Unable to connect to API (ENOTFOUND)`. | chưa kiểm |
| CL-QUOTA-1 | stream-json khi hết quota có `rate_limit_event` với `status:"rejected"`, `resetsAt` (epoch s) hoặc `null`, `rateLimitType:"five_hour"`. Dump chỉ có `status:"allowed"` + `unifiedWindows`. | Nguồn giờ reset có cấu trúc cho `resetAt` của `TurnClassification`. |
| CL-STREAM-1 | `-p --output-format stream-json` **bắt buộc `--verbose`**, thiếu ⇒ `Error: When using --print, --output-format=stream-json requires --verbose`, exit 1. | Từ kinh nghiệm, không có trong dump. |
| CL-STREAM-2 | Sự kiện gọi tool: `assistant` chứa `tool_use` (name `mcp__<server>__<tool>`) rồi `user` chứa `tool_result`; thứ tự `system → (assistant tool_use, user tool_result)* → [stream_event*] → assistant → rate_limit_event → result`. `--include-partial-messages` thêm `stream_event`. Dump chỉ có lượt văn bản. | Pha `think`/`run` của avatar suy từ sự kiện tool đầu tiên (§B.5 bước 6). |
| CL-MCP-1 | `--mcp-config` nhận đường tệp hoặc JSON `{mcpServers:{<tên>:{type:"http",url,headers?}}}`; `headers` hỗ trợ `${VAR}`; mở rộng **chỉ có ở fake** `ticketFile` (đọc tệp ⇒ `Authorization: Bearer …`). Không nêu `Authorization` ⇒ vé mặc định lấy theo bố cục lượt của contracts (xem "Gọi kiểu `ga-runner`"). Cách adapter đưa vé lượt vào cấu hình (§B.5 bước 4) do L-ENG / L-GW chốt, fake sẽ đổi theo. | Cấu hình MCP thật + việc đọc vé từ tệp: chưa kiểm. |
| CL-ENV-AUTH-1 | `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` có trong env ⇒ coi như đã đăng nhập (`authMethod` `api_key` / `oauth_token`). | Xác thực bằng env có phải bị cấm trong sản phẩm (CNS-142) — chỉ là bề mặt CLI. |
| CL-MODEL-1 | `-p "/model"` với `--model X` in `Current model: \`X\``. | chưa kiểm |
| CL-CLI-1 | Cờ lạ ⇒ `error: unknown option '<cờ>'`, exit 1 (kiểu commander); cờ và số tham số suy từ chính `help.txt`. Không có `-p` ⇒ exit 2 ("chỉ hỗ trợ -p"): chế độ tương tác chưa giả lập. `claude mcp list` ⇒ `No MCP servers configured. Use \`claude mcp add\` to add a server.` | — |

### 2.3 fake-vendor (`VN-*`)

| ID | Giả định |
|---|---|
| VN-1 | Giao thức `POST /v1/turn`, `POST /v1/whoami` là **của fake** (CLI giả gọi); CLI thật gọi API thật. Fidelity nằm ở việc CLI giả biến phản hồi thành đầu ra giống CLI thật (các ID AG-ERR-* / CL-ERR-*). |
| VN-2 | `version_drift` = CLI báo version khác bản đã kiểm (agy `1.4.0`, claude `2.2.0 (Claude Code)`) + header `x-fake-latest-cli-version`; thật: drift do tự cập nhật nền (Spike 1b rủi ro 3). |
| VN-3 | `hang` không bao giờ trả lời (CLI treo tới khi bị kill; agy dừng nhờ `--print-timeout`). `slow` mặc định 3000 ms. |
| VN-4 | Header `x-fake-scenario` CLI gửi vendor chỉ mang phần vendor cần (bỏ `script`, `exitAfterLogin`) và luôn ASCII; vendor đọc `x-fake-account` (nhãn tài khoản trong credential) để chọn kịch bản riêng của tài khoản. |

### 2.4 update-feed (`UF-*`)

| ID | Nội dung |
|---|---|
| UF-1 | Chữ ký minisign (`ED` = Ed25519 trên BLAKE2b-512) sinh bằng `node:crypto`, **đã kiểm với binary `minisign` 0.11 thật** (`minisign -V` ⇒ "Signature and comment signature verified"; sai 1 byte ⇒ từ chối). Test đối chiếu chạy khi có `minisign` trên PATH hoặc `MINISIGN_BIN`; không có thì bỏ qua (bộ kiểm độc lập trong test luôn chạy). |
| UF-2 | Định dạng `feed.json` và `manifest.json` (schema 1: `version, channel, publishedAt, images, compose{sha256,changed}, envAdd, migrations, minFrom`) là **của fake**; L-OPS chốt định dạng thật ở M2 và đổi fake theo (BUILD-PLAN §C.3, "tương thích định dạng kiểm ở M2"). `feed.json` không ký; chữ ký nằm ở từng manifest. |
| UF-3 | Khoá test sinh lúc chạy, không lưu ở đâu. Updater-test học khoá qua `GET /minisign.pub` hoặc `serve.ts update-feed --pubkey-out <tệp>`; `gen-agents-updater-test` quyết định nạp khoá này qua cơ chế override chỉ có ở image test. |
| UF-4 | `0.1.2-bad` ký ĐÚNG; "healthcheck trượt" là do image trong `registry:2` (cùng tag), feed không mô tả. Bản `downgrade` ký đúng ⇒ việc từ chối là của updater (so version), không phải chữ ký. |

### 2.5 engine-source (`ES-*`)

| ID | Nội dung |
|---|---|
| ES-1 | Dấu hiệu "domain bị chặn" = HTTP 403 + header `x-ga-egress: blocked`; `unsupported_arch` = manifest 404 (nền tảng ngoài `linux_amd64`/`linux_arm64` hoặc kịch bản ép); `network` = ngắt kết nối giữa lúc tải (Content-Length chưa đủ) hoặc ngay ở manifest; `checksum_mismatch` = byte khác sha512 trong manifest. **Cần chốt với `ga-engine-install` + `ga-egress` của L-RT** (chuỗi dấu hiệu thật do ga-egress trả). |
| ES-2 | Manifest `{version,url,sha512}` theo script cài chính thức của agy (Spike 1b install-notes, đã thấy); nguồn / manifest của Claude Code **chưa kiểm** — fake dùng cùng dạng cho cả hai. |
| ES-3 | Artefact là launcher shell 0755 (thử `node` rồi `exec node <fakesRoot>/<entry> "$@"`, không phụ thuộc `PATH`) đệm tới `sizeBytes` (mặc định 512 KiB để có thanh %), không phải binary thật. `fakesRoot` mặc định `/opt/ga-fakes` (nơi image test chép `testing/fakes`). |
| ES-4 | `engine-source/client.ts` là máy khách THAM CHIẾU (manifest → tải có % → sha512 → cài `<dest>/<slug>/<version>/bin/<bin>`); `ga-engine-install` của L-RT tự cài đặt, không bắt buộc dùng lại. |

### 2.6 fake-telegram (`TG-*`)

| ID | Nội dung |
|---|---|
| TG-1 | Hành vi theo tài liệu Bot API công khai: `getMe`, `getUpdates` (offset xác nhận, long-poll tối đa 50 s, **409** khi hai poll đồng thời), `sendMessage`, `editMessageText` (400 "message is not modified" / "message to edit not found"), `sendChatAction`, `setMyCommands`, `deleteWebhook` (grammY gọi khi `bot.start()`). Chưa có: 429 `retry_after`, 403 "bot was blocked", upload tệp (multipart), webhook, nhóm / kênh. |
| TG-2 | `/_test/sent` không bao giờ chứa token (chỉ `botId`); `payload` chứa nguyên tham số gọi API ⇒ **canary quét outbox này** (BUILD-PLAN §C.6). |

## 3. Nguồn dữ liệu chép từ Spike 1b + rà PII

- Nguồn: `01-projects/gen-agents/spikes/spike1b-antigravity/help-dumps/` (Second-Brain). Văn bản `--help` là của hãng (Google: agy 1.3.5; Anthropic: Claude Code 2.1.299), chép để kiểm thử tương thích, **không** sửa.
- Chép: `agy-help*.txt`, `agy-run-mcp_add_--help.txt`, `agy-run-mcp_list_--help.txt`, `agy-run-remote-control_start_--help.txt`, `agy-version.txt`, `claude-help.txt`, `claude-version.txt`; `models.tsv` = `agy-models-fakekey.txt` bỏ dòng "Fetching…"; `changelog.txt` = 8 dòng đầu (mục 1.3.5) của `agy-run-changelog.txt`.
- **Không** chép: `claude-stream-init.txt` (mang session id, `cwd`, đường dẫn scratchpad và danh sách plugin / tool của máy nguồn), `claude-p-*.txt` (session id), `agy-*.err` / `.out` có URL OAuth thật (client id + `code_challenge` + `state`), `agy-run-changelog.txt` đầy đủ (150 KB, không cần).
- URL OAuth của agy giả sinh mới mỗi lần với `client_id=GA-FAKE-CLIENT.invalid`; URL claude giả dùng host `auth.fake-claude.invalid`.
- Rà PII: test `marker-and-data.test.ts` quét mọi tệp `dumps/` tìm email, đường dẫn home, `/tmp/claude`, UUID, tên owner / tổ chức, token hình dạng thật — 0 khớp; có ca âm cho chính bộ quét.
- Mọi email trong fake đều `*@example.invalid`.

## 4. Ranh giới bảo mật của fake

- Canary `GA-CANARY-<uuid>` chỉ nằm trong tệp credential. `fake-vendor` không ghi prompt (chỉ độ dài); `fake-telegram` không ghi token; stdout của CLI giả không in args tool mặc định.
- `GA_FAKE_ECHO_TOOL_ARGS=1`, `GA_FAKE_ROTATE_CREDS=1`, `GA_FAKE_SELF_UPDATE` là công tắc **cố ý gây hại** để thử hệ thống thật; chỉ bật trong ca test tương ứng.
- Mọi máy chủ giả: thân request tối đa 1 MiB (phản hồi nhận từ ngoài tối đa 4 MiB), kịch bản / tham số được kiểm kiểu + biên, lỗi cấu hình ⇒ 400 hoặc exit ≠ 0 (không bỏ qua im lặng).
