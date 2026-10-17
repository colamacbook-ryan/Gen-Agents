// zod 4 dò `new Function('')` khi dựng schema; dưới CSP không có 'unsafe-eval' lần dò đó bị báo là securitypolicyviolation (script-src)
// dù lỗi được bắt. Ứng dụng chủ phải đặt jitless TRƯỚC khi nạp mọi module dựng schema (@ga/contracts, @ga/chibi): nạp tệp này đầu tiên.
import { z } from '/zod/index.js';

z.config({ jitless: true });
