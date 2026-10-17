// biome-ignore-all assist/source/organizeImports: thứ tự import là hợp đồng — ./bootstrap/zod.ts PHẢI chạy trước mọi module dựng schema zod (CSP chặt, xem bootstrap/zod.ts)
import './bootstrap/zod.ts';
import '@ga/ui/styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { createHttpAuthClient } from './auth/http-client.ts';

const container = document.getElementById('root');
if (!container) throw new Error('thiếu phần tử #root trong index.html');

createRoot(container).render(
  <StrictMode>
    <App deps={{ auth: createHttpAuthClient() }} />
  </StrictMode>,
);
