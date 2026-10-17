// Registry màn hình: mỗi lane M4 thêm `src/routes/<thư mục>/screens.tsx` xuất `screens: Record<khoá, Component>` (khoá = "<nhóm>/<tab>",
// hoặc "<nhóm>" cho trang đơn — xem nav.ts). Registry gom bằng glob nên lane không phải sửa router.tsx (không đụng nhau khi merge).
// Khoá chưa có màn ⇒ hiện PlaceholderScreen.
import type { ReactNode } from 'react';
import { ALL_SCREEN_KEYS } from './nav.ts';

/** Màn = component hàm không prop (router dựng nó, màn tự lấy dữ liệu bằng hook). */
export type ScreenComponent = () => ReactNode;

type ScreenModule = { screens?: Record<string, ScreenComponent> };

const modules = import.meta.glob<ScreenModule>('./routes/*/screens.{ts,tsx}', { eager: true });

export function collectScreens(mods: Record<string, ScreenModule> = modules): Map<string, ScreenComponent> {
  const map = new Map<string, ScreenComponent>();
  for (const [file, mod] of Object.entries(mods)) {
    for (const [key, component] of Object.entries(mod.screens ?? {})) {
      if (!ALL_SCREEN_KEYS.includes(key)) throw new Error(`${file}: khoá màn "${key}" không có trong nav.ts`);
      if (map.has(key)) throw new Error(`${file}: khoá màn "${key}" bị khai báo hai lần`);
      map.set(key, component);
    }
  }
  return map;
}

export const SCREENS: ReadonlyMap<string, ScreenComponent> = collectScreens();
