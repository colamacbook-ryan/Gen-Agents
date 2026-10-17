# @ga/i18n — một nguồn chữ giao diện

Chữ hiển thị chỉ có **một nguồn: i18n** (FRONTEND-SPEC §1.8, CNS-179). API và view DB trả **khoá** (`i18nKey`, `reason`, `state`…) + tham số; giao diện dịch. Chữ trong view DB (`state_label`, `reason_text`, `overlay_text`…) chỉ để báo cáo / audit và để test đối chiếu (`copy:check` của L-COPY).

```ts
import { createI18n } from '@ga/i18n';
import { I18nProvider, useT, useI18n } from '@ga/i18n/react';

const i18n = createI18n({ locale: 'vi', onMissingKey: (k) => console.error(k) });
i18n.t('nav.group.people');                  // khoá có kiểu: sai khoá = lỗi biên dịch
i18n.t('card.label', { name: 'Mai' });       // nội suy {tham_số}
i18n.tr(apiError.i18nKey, params);           // khoá từ API: lạ ⇒ onMissingKey + câu dự phòng, không in khoá thô
```

- `vi.json` là bản gốc, theo namespace (L-COPY chép chuỗi nguyên văn từ FS / PS vào đây; INT gộp theo namespace). `en.json` chỉ cần là tập con (khoá thiếu rơi về vi) nhưng tham số `{x}` phải khớp.
- Tên khoá: chữ, số, gạch dưới (khoá lý do / trạng thái của DB là snake_case: `login_expired`).
- Không viết tên owner cụ thể (dùng `{owner_name}`), không lộ mã nội bộ (`CNS-…`, `Q-R8a`, `[CHỐT …]`), không cú pháp lồng `$t(…)`, không từ cấm quanh Trọng thương — `checkMessages` (src/check.ts) kiểm, test của gói chạy nó trên `vi.json` / `en.json`.
- `format.ts`: số / giờ theo ngôn ngữ và **múi giờ workspace** (không hardcode).
- Chuỗi phải ở dạng NFC (có test).
