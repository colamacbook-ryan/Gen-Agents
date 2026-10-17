// Mọi handler của lane L-SYS (một dòng spread ở src/http/handlers.ts). EXT-01…04 của L-SEC mount ở đây theo phân công M2.
import type { Handler } from '../http/define-handler.ts';
import { recoveryHandlers } from '../recovery/handlers.ts';
import { sseHandlers } from '../sse/handlers.ts';
import { authHandlers } from './auth-handlers.ts';
import { onboardingHandlers } from './handlers.ts';

export const sysHandlers: readonly Handler[] = [
  ...authHandlers,
  ...onboardingHandlers,
  ...recoveryHandlers,
  ...sseHandlers,
];
