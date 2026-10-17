import type { DesiredContainer as DesiredSchema, ObservedState as ObservedSchema } from '@ga/contracts';
import type { z } from 'zod';

// Kiểu suy từ schema zod của contracts (contracts chỉ xuất schema cho hai mục này).
export type ObservedState = z.infer<typeof ObservedSchema>;
export type DesiredContainer = z.infer<typeof DesiredSchema>;
