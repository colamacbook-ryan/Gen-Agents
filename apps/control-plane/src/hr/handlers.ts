// Handler L-HR (SYS-30…79, nhân sự). Route CHƯA có repo hỗ trợ không được định nghĩa ở đây ⇒ 404 (xem báo cáo lane).
import type { Handler } from '../http/define-handler.ts';
import { characterHandlers } from './characters.ts';
import { dnaHandlers } from './dna.ts';
import { instructionHandlers } from './instructions.ts';
import { positionHandlers } from './positions.ts';
import { roleHandlers } from './roles.ts';

export const handlers: readonly Handler[] = [
  ...roleHandlers,
  ...dnaHandlers,
  ...positionHandlers,
  ...instructionHandlers,
  ...characterHandlers,
];
