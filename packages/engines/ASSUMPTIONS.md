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
| CC-T02 | `--permission-mode=dontAsk` + `--allowedTools=mcp__ga` ⇒ chỉ công cụ của gateway chạy được, công cụ khác tự bị từ chối (INT-07) | help 2.1.299 có hai cờ; ngữ nghĩa chưa kiểm | lượt thử gọi Bash / WebFetch ⇒ phải bị từ chối |
| CC-T03 | `-p` chạy được khi HOME chỉ có `.claude/.credentials.json` (không có `.claude.json`) | suy ra | lượt thật sau auth-gc |
| CC-I02 | Env `DISABLE_AUTOUPDATER=1` chặn tự cập nhật vào volume chỉ đọc; `selfUpdate` = unknown | tài liệu hãng | chạy CLI trên mount chỉ đọc, xem log |
| CC-L01 | `claude auth status` khi chưa đăng nhập in JSON `{"loggedIn":false}` (mã thoát chưa biết) | Spike 1b chỉ thấy trạng thái đã đăng nhập | chạy trên HOME trống |
| CC-L02 | `auth status` có trường `email` ⇒ account_hint (đã che) | chưa thấy (Spike 1b chỉ trích 3 trường) | đọc output thật |
| CC-L03 | `auth status` không kiểm token với server; token hết hạn chỉ lộ ra ở lượt (login_expired) | suy ra | thu hồi token rồi chạy cả hai |
| CC-STREAM-01 | Gọi công cụ xuất hiện dạng `stream_event` / `content_block_start` với `content_block.type = tool_use` | dạng khối text đã thấy (Spike 1b); khối tool_use theo cùng giao thức | lượt thật có gọi MCP |
| CC-STREAM-02 | Kết quả công cụ là dòng `user` với `tool_result` (`tool_use_id`) | giao thức Messages API | như trên |
| CC-Q01 | `/usage` không có cửa sổ quota gói ⇒ `quota_window` unknown. `rate_limit_event` của lượt có `unifiedWindows.five_hour.utilization` + `resetsAt` (đã thấy) nhưng contracts chưa có sự kiện quota | Spike 1b | — (đề xuất contracts) |
| CC-E02 | `rate_limit_event.status = rejected` ⇒ hết quota, `resetsAt` (giây Unix) = giờ reset | `status = allowed` đã thấy | chạm giới hạn thật hoặc đọc log hãng |
| CC-E03 | HTTP 429 / "usage limit reached[\|<giây>]" / `assistant.error = rate_limit` ⇒ hết quota | chuỗi quen thuộc của CLI | như trên |
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
| AGY-T03 | Không có cờ giới hạn công cụ dựng sẵn; không dùng `--sandbox` (có thể cần namespace trong container cap_drop ALL) ⇒ công cụ dựng sẵn chưa bị chặn, chỉ còn cô lập container + egress | help 1.3.5 | lượt thử gọi terminal |
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

## Chung (không riêng hãng)

| ID | Giả định | Ai cần làm |
|---|---|---|
| GEN-01 | argv[0] = `/opt/engines/<slug>/current/<binary>`; `current` là liên kết tới thư mục phiên bản đang dùng | L-RT (`ga-engine-install`) |
| GEN-02 | Cấu hình MCP trỏ `ga-runner mcp-bridge --url <gateway> --ticket-file <tệp>`: cầu stdio ⇄ Streamable HTTP đọc vé từ tệp tmpfs (CLI không thấy vé trong cấu hình) | L-RT |
| GEN-03 | ga-runner đặt cwd = thư mục tmpfs của lượt / lần kiểm và HOME = `home/` trong đó (contracts: plan không đặt HOME) | L-RT |
| GEN-04 | Với allowlist `unknown`, runner không biết tệp nào để nối từ /auth vào HOME tmpfs — cần chính sách riêng (vd nối cả cây cấp 1) và native_memory = unknown | Gen / L-RT |
