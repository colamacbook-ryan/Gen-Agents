// PHẢI là import ĐẦU TIÊN của main.tsx.
// zod 4 dò `new Function('')` lúc dựng schema (JIT); dưới CSP không có 'unsafe-eval' lần dò đó bị báo vi phạm script-src dù lỗi được
// bắt. `jitless` tắt đường JIT. @ga/contracts dựng schema ngay lúc nạp module, nên cấu hình này phải chạy trước nó
// (xem packages/chibi/README.md "CSP chặt"). Module ES nạp theo thứ tự import ⇒ tệp này đứng đầu là đủ.
import { z } from 'zod';

z.config({ jitless: true });
