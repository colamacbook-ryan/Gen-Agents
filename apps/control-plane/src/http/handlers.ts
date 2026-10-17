// Danh sách handler PRODUCTION (server.ts mount; `pnpm api:coverage` đếm). Mỗi lane M2 thêm ĐÚNG MỘT dòng import + spread
// mảng `handlers` của thư mục mình (vd `src/onboarding/handlers.ts`) — không định nghĩa handler ở đây. Handler demo / test
// KHÔNG BAO GIỜ vào danh sách này.
import { handlers as hrHandlers } from '../hr/handlers.ts';
import type { Handler } from './define-handler.ts';

export const PRODUCTION_HANDLERS: readonly Handler[] = Object.freeze([
  // ...sysHandlers,   (L-SYS)
  ...hrHandlers,
  // ...gwHandlers,    (L-GW)
  // ...workHandlers,  (L-WORK)
  // ...opsHandlers,   (L-OPS)
]);
