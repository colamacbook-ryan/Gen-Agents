# @ga/chibi — engine chibi vẽ bằng code (SVG + CSS)

Port TypeScript ESM của spike 4 v3 (BUILD-PLAN §D.5). Không framework, chỉ dùng API trình duyệt chuẩn. Nhân vật là **bộ tham số JSON có schema**; mọi hành vi nằm trong **khung xương chung** và gắn theo **bộ phận** (không gắn theo tên nhân vật; không có `over` riêng).

## Dùng nhanh

```ts
import { loadSkinPack, mount, svg, validate, register, evaluateIdentity, viewOfElement } from '@ga/chibi';

// 1. nạp gói skin (manifest + 10 tệp skins/tam-quoc-chibi/1.0.0/characters/<asset_code>.json) hoặc params_json từ DB
loadSkinPack(manifest, (file) => characters[file]);   // kiểm schema cả gói, không đăng ký nếu có một nhân vật sai
register(JSON.parse(row.params_json));                // một nhân vật; ném ChibiSpecError(issues[{path,message}])

// 2. vẽ
const h = mount(el, 'tq046', 'wait', { size: 160, motion: 'full' }); // → { svg, setState, setMotion, destroy }
h.setState('reward');                                 // gom theo lô, chuyển tiếp mượt 260 ms
html = svg('tq046', 'normal', { size: 64 });          // chuỗi SVG tự chứa (SSR / React dangerouslySetInnerHTML qua wrapper của ui)

// 3. cổng nhận diện khai báo
evaluateIdentity('tq046', viewOfElement(h.svg));      // { must:[{p,label,ok}], extra:[…], pass }
```

`validate(spec)` / `parse(jsonText)` trả `{ok, value | errors}` không ném. `Chibi.schema` là schema zod (`ChibiParamsV1`); `toJsonSchema()` xuất JSON Schema.

## Nhân vật = tham số (skin_assets.params_json)

`schema: 1` (= `params_schema_version`), `id` (= `asset_code`, vd `tq046`), thông tin hiển thị (`name`, `han`, `role`, `faction`, `kind`, `gender`), `own`, `crop`, `anim`, `p` (ngoại hình), `identity` (hồ sơ nhận diện khai báo). Schema `strict`: khoá lạ bị từ chối, `over` bị từ chối kèm lý do. Mọi giá trị đi vào markup là enum đóng, màu `#RRGGBB`, số có cận hoặc `Seconds` — không có chuỗi tự do nào được ghép vào SVG (chống chèn SVG / CSS khi `params_json` đến từ DB hay AI sinh); `name` / `label` được thoát khi vào `aria-label`; `roleColor` chỉ nhận `#RRGGBB`.

Thêm bộ phận mới (mũ, đạo cụ…) = thêm tên vào `src/params.ts` + bản vẽ vào `src/parts/` (thiếu / thừa khoá là lỗi biên dịch) + (nếu có hành vi) một mục `TRAITS` + token trong `src/tokens.ts`; **không** thêm vào dữ liệu nhân vật.

Gói skin: `skins/tam-quoc-chibi/1.0.0/` (10 nhân vật: tq046 tq044 tq080 tq043 tq045 tq047 tq010 tq141 tq031 tqx001). Sửa `characters/*.json` rồi chạy `pnpm --filter @ga/chibi skin:seal` để sinh lại `manifest.json` (sha256 JCS mỗi nhân vật, ánh xạ `char_kind` / `gender` sang enum DB) và mục `ASSET_MANIFEST.json`.

## Cổng nhận diện khai báo

Mỗi `identity.must[]` / `extra[]` là một `Check` (dữ liệu): `{part, attr?}`, `{fill|trim|band: <part>, is: <nhóm màu>}`, `{param, is}`, `{phase:{state,where}}`, `{token:{state,has}}`, `{noEmote:[…]}`, `{all|any|not}`. Một bộ đánh giá chung (`src/identity.ts`) chạy trên chuỗi SVG (Node, không cần DOM) hoặc DOM thật; hai đường cho cùng kết quả (test kiểm). 55 hàm closure của spike → 55 phép kiểm khai báo; đối chiếu với closure gốc trên 711 biến thể tham số (3.906 phép kiểm): 0 lệch.

## 16 trạng thái + nhãn từ i18n

Khoá lấy từ `@ga/contracts` (`AVATAR_STATES`, thứ tự ưu tiên của `v_role_avatar_state`). **Engine không chứa nhãn hay mô tả** (CNS-165): giao diện lấy chữ từ i18n theo `stateI18nKeys(state)` → `avatar.state.<khoá>.name` (tên hiển thị, PS §4.7) và `avatar.state.<khoá>.when` (mô tả; `failover` nói "loại CLI dự phòng", không nói "tài khoản" — INT-05). Fixture kiểm: `test/fixtures/avatar-states.vi.json` (chép PS §4.7); nguồn thật là `packages/i18n`.

## Chuyển động

- Chỉ animate `transform` / `opacity` / `rotate` / `scale` / `stroke-dashoffset`; không còn `@property` hay animate biến tuỳ ý. Tay animate `rotate` + `scale` trực tiếp (`src/arm-anim.ts`); đạo cụ cầm tay, cọ, tay áo nước quay ngược bằng keyframes riêng sinh từ cùng dữ liệu.
- `motion` (setting `ui.avatar_motion`): `full` mặc định; `subtle` = chỉ thở + chớp mắt, pose tĩnh của trạng thái + một huy hiệu; `off` = 0 animation, pose tĩnh + huy hiệu. `prefers-reduced-motion: reduce` của hệ điều hành luôn ép `off` (cả bằng CSS thuần, không cần JS). `off` hiển thị pose tĩnh **của trạng thái hiện hành** (muốn pose bình thường thì truyền `normal`).
- Cỡ < 120 px chỉ giữ thân + đầu + một huy hiệu; node ngoài màn hình tạm dừng và hoãn `setState` (IntersectionObserver); `setBudget(n)` giới hạn số nhân vật cỡ lớn vẽ đủ chi tiết (mặc định 8).

## Kiểm thử

```
pnpm --filter @ga/chibi test          # schema, cổng nhận diện, 16 × 10 trạng thái, quy tắc CSS, gói skin, Chromium thật
pnpm --filter @ga/chibi typecheck
pnpm --filter @ga/chibi skin:seal
node packages/chibi/scripts/bench.ts --secs=10 --rounds=3   # fps
```

Test trình duyệt dùng `playwright-core` + Chromium có sẵn ở `PLAYWRIGHT_BROWSERS_PATH` (không tải trình duyệt), máy chủ tĩnh tự dựng bỏ kiểu `.ts` bằng Node (không bundler). Không có Chromium thì nhóm này **SKIP hiển thị rõ**; `CHIBI_REQUIRE_BROWSER=1` biến thiếu Chromium thành lỗi (CI của lane component đặt biến này); `CHIBI_BROWSER=skip` tắt hẳn.

## Đối chiếu với spike v3

| Hạng mục | Kết quả |
|---|---|
| `svg()` 10 tướng × 16 trạng thái (+3 biến thể idle) × 3 cỡ, `fixedPhase` | 541/541 chuỗi giống hệt (ở cam kết port, trước khi sửa điểm yếu) |
| `resolve()` 180 tổ hợp | 180/180 giống hệt |
| Ảnh khung đóng băng 540 (10 × 18 × 3 mốc chu kỳ, 160 px, Chromium) | port thuần: 540/540 giống hệt từng điểm ảnh; sau khi sửa điểm yếu: 12/16 trạng thái + idle `nap` vẫn 0,000 % lệch; chỉ `wait`, `reward`, `think`, `unsure` (đạo cụ không cắt mặt), `idle drunk`, `idle game` (hồ lô / máy game cầm thật) đổi, ≤ 4,8 % điểm ảnh lệch > 24/255 ở khung lệch nhiều nhất |
| Đạo cụ giao vùng mắt–mũi (70 cặp nhân vật × trạng thái, 20 mốc chu kỳ, phần chính ≥ 38 đơn vị) | spike 24,5 % khung → 7,1 % khung (còn lại là trò chủ ý: Gia Cát che mặt bằng quạt, múa kiếm, chỉ tay…) |

Ngưỡng so ảnh: điểm ảnh coi là lệch khi chênh > 24/255 ở bất kỳ kênh nào; trạng thái không đổi phải đạt 0 %.

## Hiệu năng (Chromium headless, rAF; spike ↔ mới đo xen kẽ trong cùng một tiến trình trình duyệt)

Máy đo: 4 lõi CPU **dùng chung với các lane khác, tải trung bình 7–12** lúc đo (spike ghi 56 fps cho 30 × 64 px lúc máy yên; không tái lập được ở đây). Mỗi ô: trung vị (khoảng min–max các lượt). `style recalc` = ms tính lại style mỗi giây (CDP `RecalcStyleDuration`), bền với tranh chấp CPU hơn fps.

| Bố cục | Bản | fps | khung > 33 ms (mỗi 10 s) | style recalc (ms/s) | luồng chính bận (ms/s) | animation |
|---|---|---|---|---|---|---|
| 30 × 64 px, 10 lượt × 6 s, đổi thứ tự xen kẽ | spike v3 | 38,7 (26,4–43,5) | 113 | 94,6 | 824 | 114 |
| | **@ga/chibi** | **35,9 (23,7–46,7)** | 109 | **82,1** | **789** | 114 |
| 10 × 160 px, 5 lượt × 10 s | spike v3 | 22,5 (18,2–36,2) | 194 | 382 | 815 | 136 |
| | **@ga/chibi** | **28,7 (22,0–54,6)** | 189 | **119** | **746** | 145 |

Đọc kết quả: fps chồng lấn hoàn toàn giữa hai bản ở cả hai bố cục (nhiễu ±20 % do tải máy) — **không tệ hơn spike v3** nhưng cũng không chứng minh được nhanh hơn ở 30 × 64 px (ở đó tay bị tắt animation theo cỡ nên không có gì để lời). Số bền là **style recalc ở cỡ lớn giảm ~69 %** (382 → 119 ms/s): hệ quả của bỏ `@property inherits:true` của góc tay (animate `rotate`/`scale` trực tiếp, không còn vô hiệu hoá style của cả cây con tay mỗi khung). Số animation cỡ lớn tăng 136 → 145 do đạo cụ cầm tay quay ngược bằng keyframes riêng.

Tái lập: `node packages/chibi/scripts/bench.ts --secs=10 --rounds=5` (chỉ đo bản mới; trang đo `test/browser/bench.html`).

Headless raster bằng CPU (không GPU): số tuyệt đối chỉ để so sánh giữa hai bản, không phải số của máy thật. Chưa đo trên máy có GPU. Không nên hứa 60 fps cho 30 chibi cỡ lớn cùng lúc.

## Giới hạn (nói thẳng)

- `ui.avatar_motion = off` hiển thị pose tĩnh của trạng thái, không phải pose `normal` (PS §4.7 viết "pose bình thường"; cần xác nhận).
- Nhân vật khoá tay (Triệu Vân, `lockR`) cầm hồ lô / máy game ở chỗ tay đang giữ em bé; hồ lô không lên tới miệng.
- Tua / cán đạo cụ (phần "đuôi") vẫn có thể chạm vùng cằm khi chúng chúc xuống từ bàn tay ở ngang cằm; phần chính (lông quạt, lưỡi kiếm, mặt quạt) không cắt vùng mắt–mũi ở các trạng thái chắp tay / nghĩ / xoa tay.
- `transform-origin: 0 0` của SVG tính theo gốc `viewBox`: với avatar tròn có `crop` lệch gốc, tâm quay của tay / thân lệch vài đơn vị so với bản không cắt (kế thừa từ spike, chưa sửa).
- CSP: engine chèn một thẻ `<style id="chb-css">` và markup dùng thuộc tính `style="…"` nội tuyến ⇒ cần `style-src 'unsafe-inline'` (BUILD-PLAN §D.5: CSP cho phép style tiêm). Không có script nội tuyến, không URL ngoài, không `<image>`.
- Chỉ kiểm trên Chromium (Playwright 1.56). Chưa kiểm Firefox / Safari: tay dùng thuộc tính `rotate` / `scale` riêng lẻ trên phần tử SVG, cần xác minh ở hai trình duyệt đó.
