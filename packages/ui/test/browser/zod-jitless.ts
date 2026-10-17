// zod 4 dò `new Function('')` khi dựng schema object; dưới CSP không có 'unsafe-eval' lần dò đó bị báo securitypolicyviolation
// (script-src) dù lỗi được bắt. Ứng dụng chủ (apps/web) phải đặt jitless TRƯỚC khi nạp mọi module dựng schema (@ga/contracts,
// @ga/ui) — trang thử nạp tệp này đầu tiên (giống @ga/chibi test/browser/harness-zod.js).
import { z } from 'zod';

z.config({ jitless: true });
