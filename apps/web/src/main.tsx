// biome-ignore-all assist/source/organizeImports: thứ tự import là hợp đồng — ./bootstrap/zod.ts PHẢI chạy trước mọi module dựng schema zod (CSP chặt, xem bootstrap/zod.ts)
import './bootstrap/zod.ts';
import '@ga/ui/styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApiClient } from './api/client.ts';
import { createCsrfStore } from './api/csrf.ts';
import { App } from './app.tsx';
import { createContractAuthClient } from './auth/contract-client.ts';
import { createHttpAuthClient } from './auth/http-client.ts';

// Backend giả CHỈ vào gói khi build đặt VITE_GA_FAKE=1 (dev: `VITE_GA_FAKE=1 pnpm dev`). Ở bản phát hành biểu thức này là hằng `false`
// nên import động bị loại khỏi gói (cùng kỹ thuật với /__ui-kit); test/fake-release.test.ts quét gói build để giữ điều đó.
const fakeLoader = import.meta.env.VITE_GA_FAKE === '1' ? () => import('./api/fake/index.ts') : null;

const container = document.getElementById('root');
if (!container) throw new Error('thiếu phần tử #root trong index.html');

const fake = fakeLoader ? (await fakeLoader()).createFakeBackend() : null;
if (fake) {
  // tay cầm cho Chromium test / người dựng màn (đổi chế độ recovery, 401, rớt mạng, phát SSE…); chỉ có ở bản dùng backend giả
  (globalThis as { __gaFake?: unknown }).__gaFake = fake.control;
}
const csrf = createCsrfStore();
const api = createApiClient({ csrf, fetchImpl: fake?.fetch });
const useContractAuth = fake !== null || import.meta.env.VITE_GA_AUTH === 'contract';
const auth = useContractAuth ? createContractAuthClient(api) : createHttpAuthClient({ csrf });

createRoot(container).render(
  <StrictMode>
    <App deps={{ auth, api }} />
  </StrictMode>,
);
