# @ga/engines — giả định chưa kiểm với CLI thật

Mỗi mục có một ID. Code ghi ID ở đúng chỗ dùng giả định (`src/adapters/<…>/errors.ts`, `index.ts`, `parser.ts`).
Spike 1c ở M6 (buổi test chung, BUILD-PLAN §C.7) đánh dấu từng mục **đúng / sai**; sai thì sửa adapter + CLI giả
(`testing/fakes/ASSUMPTIONS.md` của L-FAKE dùng cùng ID cho phần CLI giả bắt chước).

Nhãn bằng chứng (khớp trường `evidence` của luật lỗi):
- **observed**: đã thấy output thật (Spike 1b, `01-projects/gen-agents/spikes/spike1b-antigravity/`) hoặc đã GET kiểm.
- **partial**: một phần đã thấy, phần còn lại suy ra.
- **assumed**: chưa kiểm — suy từ tài liệu hãng / giao thức HTTP / chuỗi lỗi quen thuộc.

Test `test/errors.test.ts` đỏ nếu một luật lỗi `partial` / `assumed` không có ID ở đây.

## Claude Code (slug `claude-code`) — kiểm thật ở M6

| ID | Giả định | Bằng chứng | Kiểm thế nào ở M6 |
|---|---|---|---|
| CC-A01 | `claude auth login` chạy với HOME=/auth/<en> ghi credential vào `.claude/.credentials.json`; allowlist `/auth` chỉ cần tệp này (không giữ `.claude.json`) | suy ra; IT với CLI giả ở M1 | đăng nhập thật trong container, liệt kê tên tệp trong /auth/<en> |
| CC-A02 | Trạng thái native: `.claude/projects/<cwd>/<phiên>.jsonl`, `.claude/history.jsonl`, `.claude.json` (danh sách có thể thiếu; khớp testing/fakes `CL-NATIVE-1`); lượt dùng thêm `--no-session-persistence` | tài liệu hãng | chạy một lượt, liệt kê HOME tmpfs trước khi xoá |
| CC-T01 | Bộ parse cờ nhận `--cờ=giá-trị`; `-p` là cờ boolean, prompt là toán hạng cuối; cờ nhiều giá trị (`--mcp-config`, `--allowedTools`) đặt trước cờ boolean nên không nuốt prompt | help 2.1.299 (dạng commander) | một lượt thật với prompt bắt đầu bằng `-` |
| CC-T02 | Giới hạn công cụ (sandbox-parity): `--permission-mode=dontAsk` + `--allowedTools=mcp__ga` + `--strict-mcp-config` ⇒ chỉ công cụ của gateway chạy được, công cụ khác tự bị từ chối (INT-07). turnPlan chỉ dựng plan khi ba cờ có trong bảng năng lực đã quét (thiếu ⇒ `engine_unrestricted`) | help 2.1.299 có ba cờ; ngữ nghĩa chưa kiểm | lượt thử gọi Bash / WebFetch / Read ⇒ phải bị từ chối |
| CC-T03 | `-p` chạy được khi HOME chỉ có `.claude/.credentials.json` (không có `.claude.json`) | suy ra | lượt thật sau auth-gc |
| CC-I02 | Env `DISABLE_AUTOUPDATER=1` chặn tự cập nhật vào volume chỉ đọc; `selfUpdate` = unknown | tài liệu hãng | chạy CLI trên mount chỉ đọc, xem log |
| CC-L01 | `claude auth status` khi chưa đăng nhập in JSON `{"loggedIn":false}` (mã thoát chưa biết) | Spike 1b chỉ thấy trạng thái đã đăng nhập | chạy trên HOME trống |
| CC-L02 | `auth status` có trường `email` ⇒ account_hint (đã che) | chưa thấy (Spike 1b chỉ trích 3 trường) | đọc output thật |
| CC-L03 | `auth status` không kiểm token với server; token hết hạn chỉ lộ ra ở lượt (login_expired) | suy ra | thu hồi token rồi chạy cả hai |
| CC-STREAM-01 | Gọi công cụ xuất hiện dạng `stream_event` / `content_block_start` với `content_block.type = tool_use` | dạng khối text đã thấy (Spike 1b); khối tool_use theo cùng giao thức | lượt thật có gọi MCP |
| CC-STREAM-02 | Kết quả công cụ là dòng `user` với `tool_result` (`tool_use_id`) | giao thức Messages API | như trên |
| CC-Q01 | `/usage` không có cửa sổ quota gói ⇒ `quota_window` unknown. `rate_limit_event` của lượt có `unifiedWindows.five_hour.utilization` + `resetsAt` (đã thấy) nhưng contracts chưa có sự kiện quota | Spike 1b | — (đề xuất contracts) |
| CC-E02 | `rate_limit_event.status = rejected` ⇒ hết quota, `resetsAt` (giây Unix) = giờ reset | `status = allowed` đã thấy | chạm giới hạn thật hoặc đọc log hãng |
| CC-E03 | HTTP 429 / `assistant.error = rate_limit` / thông điệp lỗi "usage limit reached" ⇒ hết quota. Chữ chỉ được dò khi `result.is_error = true` (thông điệp lỗi + stderr, không bao giờ câu trả lời); **giờ reset không lấy từ chữ** | chuỗi quen thuộc của CLI | như trên |
| CC-E04 | `assistant.error = billing_error` / "credit balance is too low" ⇒ hết quota | suy ra | tài khoản API hết credit |
| CC-E05 | HTTP 403 / "account / organization has been disabled" ⇒ bị khoá | suy ra | không tái hiện được an toàn — giữ giả định |
| CC-E06 | "OAuth token has expired" / "token has been revoked" ⇒ hết hạn đăng nhập | chuỗi quen thuộc | thu hồi token |
| CC-E07 | "Not logged in" / "Invalid API key · Please run /login" ⇒ cần đăng nhập | chuỗi quen thuộc | HOME trống / key sai |
| CC-E08 | HTTP 401 / `assistant.error = authentication_failed` ⇒ hết hạn đăng nhập | suy ra | thu hồi token |
| CC-E09 | HTTP 5xx / 529 / `server_error` / lỗi mạng (ECONNREFUSED…) ⇒ sự cố hãng | suy ra | chặn egress ⇒ phải ra outage |
| CC-E11 | Còn lại ⇒ transient (không đoán là sự cố hãng) | quyết định thiết kế | — |

## Antigravity (slug `antigravity`) — Spike 1c (M6)

| ID | Giả định | Bằng chứng | Kiểm thế nào ở Spike 1c |
|---|---|---|---|
| AGY-H01 | CLI tôn trọng HOME: cấu hình / trạng thái ở `$HOME/.gemini/antigravity-cli/` | **observed** (Spike 1b: HOME giả) | — |
| AGY-A01 | Tên tệp credential sau OAuth chưa biết ⇒ `authAllowlist = 'unknown'` (auth-gc không xoá, native_memory = unknown, báo owner) | Spike 1b chưa đăng nhập | đăng nhập thật, liệt kê tên tệp |
| AGY-STREAM-01 | Lượt dùng `--output-format stream-json`, schema **thống nhất với CLI giả** (testing/fakes `AG-STREAM-1`): `{type:"init",conversation_id,model}` · `{type:"tool_call",id,name}` · `{type:"tool_result",id,name,is_error,text}` · `{type:"delta",text}` · `{type:"result",…dạng json}`. Pha planning → acting ở `tool_call` đầu tiên. Dòng `result` chỉ phát lại `response` khi không có `delta` nào | **bịa theo cấu trúc hợp lý** (chưa thấy stream-json thật) | một lượt thật `stream-json` |
| AGY-STREAM-02 | Output `json` (một object, không `type`): `{status:"SUCCESS", response, usage{…}}` cùng dạng với lỗi đã thấy (testing/fakes `AG-JSON-1`) — parser vẫn đọc | dạng lỗi + `status:"SUCCESS"` của `/usage` đã thấy | một lượt thật `--output-format json` |
| AGY-MCP-01 | Cấu hình MCP đọc từ `$HOME/.gemini/antigravity-cli/mcp_servers.json`, dạng phẳng `{"<tên>":{"type":"stdio","command","args","env"}}` như `agy mcp add` ghi (thống nhất testing/fakes `AG-MCP-1`), kể cả ở chế độ `-p` | chưa kiểm (Spike 1b chỉ thấy `agy mcp add/list`) | `agy mcp add` rồi xem tệp nó ghi; lượt `-p` gọi tool |
| AGY-T01 | `GEMINI.md` trong cwd (tmpfs của lượt) được nạp ở chế độ `-p` | tài liệu đi kèm (rules.md) | lượt thật có chỉ dẫn |
| AGY-T02 | `--print-timeout <N>s` (dạng Go duration) — chạm trần thì in JSON lỗi rồi thoát | help ("default 0s") | lượt dài |
| AGY-T03 | **Giới hạn công cụ (sandbox-parity, review bảo mật 2026-10-16):** agy 1.3.5 KHÔNG có cờ giới hạn công cụ (help chỉ có `--mode`, `--sandbox`, `--dangerously-skip-permissions`). Adapter khai cơ chế GIẢ ĐỊNH `--allowed-tools mcp__ga` (CLI giả khai để IT chạy được). turnPlan chỉ dựng plan khi cờ này có trong bảng năng lực đã quét ⇒ **agy thật (1.3.5 / 1.4.0) bị từ chối `engine_unrestricted`, không chạy lượt** tới khi Spike 1c tìm được cơ chế thật (cờ, settings, hay policy) và sửa adapter + CLI giả. CLI giả khai cờ này (một dòng FAKE-ONLY chèn vào help thật) và chỉ gọi công cụ có tên `mcp__<máy chủ>__<tool>` đúng tiền tố ⇒ plan thật (không bỏ cờ) chạy được trong IT | chưa kiểm, Spike 1c (M6) | tìm cơ chế chặn shell / tệp ở chế độ `-p`; lượt thử gọi terminal phải bị từ chối |
| AGY-T04 | Chế độ API key cần `settings.json` `{"modelProvider":"gemini"}` + env `GEMINI_API_KEY` | **partial** (Spike 1b: `models` + `-p` với key giả ⇒ API_KEY_INVALID) | key thật |
| AGY-L01 | Sau đăng nhập, `agy models` thoát 0 + có dòng TSV ⇒ đã đăng nhập; CLI có in danh tính không: chưa biết ⇒ account_hint null | chưa đăng nhập: exit 1 "Please sign in" (observed) | đăng nhập thật |
| AGY-MODELS-01 | Danh sách model khi OAuth là quyền thật hay catalog: chưa biết ⇒ giữ `static_catalog` | chế độ API key = catalog tĩnh (observed) | so hai tài khoản khác gói |
| AGY-USAGE-01 | Schema `groups[]` của `-p /usage` chưa biết ⇒ `quota_window` unknown, output thô vào blob | chế độ API key: `groups: []` | tài khoản OAuth thật |
| AGY-I01 | CLI tự cập nhật nền (`selfUpdate = enabled`); chạy trên mount chỉ đọc có lỗi không | observed bộ cập nhật nền; mount chỉ đọc chưa kiểm | mount chỉ đọc |
| AGY-E01 | exit 0 + `status:"SUCCESS"` ⇒ ok | partial (xem AGY-STREAM-01) | lượt thật |
| AGY-E04 | `AGY_ERROR.error_code = 401` / `UNAUTHENTICATED` ⇒ hết hạn đăng nhập | dạng `AGY_ERROR` đã thấy (key sai: 400) | thu hồi quyền ứng dụng |
| AGY-E05 | 403 / `PERMISSION_DENIED` ⇒ bị khoá (PS §8.4: báo cáo bị cấm 403) | suy ra | không tái hiện được an toàn |
| AGY-E06 | 429 / `RESOURCE_EXHAUSTED` / "quota exceeded" ⇒ hết quota; giờ reset: không đoán (null) | suy ra | chạm quota |
| AGY-E07 | 5xx / `UNAVAILABLE` / `INTERNAL` ⇒ sự cố hãng | suy ra | chặn egress |
| AGY-E12 | Mất mạng tới hãng (`code_kind = network` / "no such host" / "connection refused") ⇒ sự cố hãng (PS §8.4: outage = lỗi mạng hoặc 5xx) — testing/fakes `AG-ERR-NET` | suy ra | chặn egress |
| AGY-E09 | `retryable = true` / `DEADLINE_EXCEEDED` ⇒ transient | suy ra | — |
| AGY-E11 | Còn lại ⇒ transient (không đoán là sự cố hãng) | quyết định thiết kế | — |

## Chống "classification injection" (review bảo mật 2026-10-16)

Cả hai bảng lỗi: ưu tiên trường có cấu trúc (mã thoát, `is_error`, `subtype`, `api_error_status`, `assistant.error`,
`rate_limit_event`; agy: `status` của dòng result, `AGY_ERROR.error_code / status / code_kind / retryable`). Chỉ dò chữ khi ở
trạng thái lỗi và chỉ trên thông điệp lỗi + stderr — không dò nội dung trả lời (delta, assistant, result thành công,
tool_result). `resetAt` chỉ từ `rate_limit_event` status `rejected` (claude); agy luôn null. Test âm: câu trả lời chứa
"rate limit exceeded, resets at 2099…" ⇒ ok, `resetAt` null.

## Đối chiếu với CLI giả chung (testing/fakes/ASSUMPTIONS.md, L-FAKE)

| Adapter | CLI giả | Trạng thái thống nhất |
|---|---|---|
| AGY-STREAM-01 | AG-STREAM-1 | **thống nhất** — adapter dùng đúng schema của CLI giả (test/fakes.test.ts chạy kịch bản `ok` qua parser) |
| AGY-STREAM-02 | AG-JSON-1 | thống nhất |
| AGY-MCP-01 | AG-MCP-1 | **thống nhất** (Gen duyệt 2026-10-16): cùng tệp `$HOME/.gemini/antigravity-cli/mcp_servers.json` dạng phẳng; máy chủ `stdio` = cầu `ga-runner mcp-bridge` (GEN-02). CLI giả spawn lệnh khai và nói MCP qua stdio; test dùng cầu giả `testing/fakes/bridge-bin/ga-runner` |
| CC-T01…T03, CC-A01/A02 | CL-NATIVE-1 | thống nhất (`.claude/.credentials.json`, `projects/…`, `history.jsonl`) |
| (cấu hình MCP claude) | CL-MCP-1 | **thống nhất**: `--mcp-config` = `{mcpServers:{ga:{type:"stdio",command:"ga-runner",args:["mcp-bridge",…]}}}`; CLI giả spawn cầu (giả) qua stdio; dạng `http` + `ticketFile` của CLI giả vẫn còn cho test cũ |
| AGY-T03 | AG-TOOLS-1 | **thống nhất**: CLI giả khai `--allowed-tools` trong help (dòng FAKE-ONLY) và thực thi tiền tố; test không bỏ cờ nữa |
| CC-STREAM-01/02 | CL-STREAM-2 | parser có trạng thái lấy gọi công cụ từ cả `stream_event` lẫn `assistant`, khử trùng theo id (CLI giả chỉ báo trong `assistant`) |
| CC-L01 | CL-AUTH-STATUS-1 | thống nhất (JSON, exit 1 khi chưa đăng nhập; parser đọc JSON in đẹp) |
| CC-L02 | CL-AUTH-STATUS-1 (`email`) | thống nhất (che khi có) |
| AGY-L01 / AG-IDENT-1 | `Signed in as <email>` ở stderr | adapter **không** đọc dòng này (dạng in thật chưa biết) ⇒ account_hint null |
| CC-E02/E03 | CL-QUOTA-1, CL-ERR-QUOTA | thống nhất: giờ reset chỉ từ `rate_limit_event` rejected; chữ "resets HH:MM" không đọc |
| AGY-E06 | AG-ERR-QUOTA | adapter không đọc "(quota resets at …)" trong `short_error` ⇒ resetAt null (không tin chữ) |
| AGY-E12 | AG-ERR-NET | thống nhất ⇒ outage |

## Chung (không riêng hãng)

| ID | Giả định | Ai cần làm |
|---|---|---|
| GEN-01 | argv[0] = `/opt/engines/<slug>/current/<binary>`; `current` là liên kết tới thư mục phiên bản đang dùng | L-RT (`ga-engine-install`) |
| GEN-02 | **Gen duyệt 2026-10-16.** Cấu hình MCP trỏ `ga-runner mcp-bridge --url <gateway> --ticket-file <tệp>`: cầu stdio ⇄ Streamable HTTP đọc vé từ tệp tmpfs (vé không nằm trong cấu hình, argv hay env của CLI). Cầu giả tối thiểu cho test: `testing/fakes/mcp-bridge.ts` | L-RT viết cầu thật |
| GEN-03 | ga-runner đặt cwd = thư mục tmpfs của lượt / lần kiểm và HOME = `home/` trong đó (contracts: plan không đặt HOME) | L-RT |
| GEN-04 | **Gen duyệt 2026-10-16, fail-closed:** allowlist `unknown` ⇒ runner KHÔNG nối credential từ /auth vào HOME tmpfs; kiểm đăng nhập luôn báo `unknown` (`interpretLoginCheck`), native_memory = unknown, báo owner. Hệ quả: tài khoản agy không bao giờ "đã đăng nhập" tới Spike 1c | L-RT, L-GW |
| GEN-05 | Prompt đi qua argv, trần 120 KiB (MVP, Gen duyệt). **Chuyển sang stdin** khi Spike 1c xác nhận CLI đọc prompt từ stdin ở chế độ `-p` (claude: `-p` đọc stdin) — `TurnPlanInput.promptFile` đã có sẵn | L-ENG, L-RT |
| GEN-06 | Timeout lượt: `DEFAULT_TURN_TIMEOUT_MS` (10 phút) chỉ là MẶC ĐỊNH khi không truyền; giá trị thật lấy từ setting của control plane → `TurnBundle.timeoutMs` → runner truyền vào `turnPlan({ …, timeoutMs })` (không hardcode) | L-GW, L-RT |
