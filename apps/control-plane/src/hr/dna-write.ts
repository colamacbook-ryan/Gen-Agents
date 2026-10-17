// Ghi DNA / Instruction QUA change set (một cửa duy nhất chạm prompt): propose → apply trong cùng giao dịch.
// Luật quyền (INTENT) ép Ở ĐÂY theo trạng thái đã lưu, trước khi gọi apply — DB chỉ đòi owner / admin.
import type { DnaFieldDefRow, DnaFieldRow, WriteTx } from '@ga/db/repos';
import { ApiError } from '../http/errors.ts';
import { estimateTokens, TOKENIZER_LABEL } from './shared.ts';

const DNA_TEXT_MAX = 20_000;

export interface ValidDnaValue {
  valueJson: string;
  valueNum: number | null;
}

/** Kiểm giá trị theo định nghĩa trường (value_type, enum, thang). Sai ⇒ 400 `validation.failed` (field=value). */
export function validateDnaValue(def: DnaFieldDefRow, value: unknown): ValidDnaValue {
  const bad = (reason: string): never => {
    throw new ApiError('validation.failed', { field: 'value', reason });
  };
  switch (def.value_type) {
    case 'text': {
      if (typeof value !== 'string') return bad('expected_text');
      if (value.length > DNA_TEXT_MAX) return bad('too_long');
      return { valueJson: JSON.stringify(value), valueNum: null };
    }
    case 'enum': {
      if (typeof value !== 'string' || value.length === 0 || value.length > 200) return bad('expected_enum');
      if (def.enum_options_json !== null) {
        const options: unknown = JSON.parse(def.enum_options_json);
        if (!Array.isArray(options) || !options.includes(value)) return bad('not_in_options');
      }
      return { valueJson: JSON.stringify(value), valueNum: null };
    }
    case 'scale':
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return bad('expected_number');
      if (def.scale_min !== null && value < def.scale_min) return bad('below_min');
      if (def.scale_max !== null && value > def.scale_max) return bad('above_max');
      if (def.value_type === 'scale' && def.scale_step !== null && def.scale_step > 0 && def.scale_min !== null) {
        const steps = (value - def.scale_min) / def.scale_step;
        if (Math.abs(steps - Math.round(steps)) > 1e-9) return bad('off_step');
      }
      return { valueJson: JSON.stringify(value), valueNum: value };
    }
    case 'bool': {
      if (typeof value !== 'boolean') return bad('expected_bool');
      return { valueJson: JSON.stringify(value), valueNum: null };
    }
    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        return bad('expected_date');
      }
      return { valueJson: JSON.stringify(value), valueNum: null };
    }
    default:
      return bad('unknown_type');
  }
}

/** Số token ước lượng của một giá trị DNA (chuỗi JSON). */
export const dnaTokens = (valueJson: string): number => estimateTokens(valueJson);

export function defByKey(tx: WriteTx, key: string): DnaFieldDefRow {
  const def = tx.dna.defs().find((d) => d.key === key);
  if (def === undefined) throw new ApiError('internal');
  return def;
}

/** Tạo một trường DNA (nguồn owner) rồi áp ngay — chỉ cho trường KHÔNG lõi (dùng ở khởi tạo Role). */
export function applyDnaCreate(tx: WriteTx, roleId: string, key: string, value: unknown, title: string): void {
  const def = defByKey(tx, key);
  if (def.is_core === 1) throw new ApiError('internal');
  const v = validateDnaValue(def, value);
  const { changeSet } = tx.changeSets.propose({
    scope: 'role',
    roleId,
    title,
    items: [
      {
        target: 'dna',
        op: 'create',
        defId: def.id,
        valueJson: v.valueJson,
        valueNum: v.valueNum,
        tokenCount: dnaTokens(v.valueJson),
        tokenizer: TOKENIZER_LABEL,
        source: 'owner',
      },
    ],
  });
  tx.changeSets.apply(changeSet.id);
}

export type DnaField = DnaFieldRow;
