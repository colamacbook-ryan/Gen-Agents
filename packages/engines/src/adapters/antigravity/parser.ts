import type { TokenUsage, TurnStreamEvent } from '@ga/contracts';
import { count, type JsonObject, MAX_LINE_BYTES, obj, parseJsonObject, str } from '../../text.ts';
import type { TurnLineParser, TurnPhase } from '../../types.ts';

// Parser output của Antigravity CLI (`agy -p … --output-format stream-json`).
// ĐÃ THẤY (Spike 1b, agy 1.3.5, `--output-format json`): MỘT dòng {conversation_id, status, response, error,
// duration_seconds, num_turns, usage:{input_tokens, output_tokens, thinking_tokens, cache_read_tokens, total_tokens}} với
// status "ERROR"; status "SUCCESS" thấy ở lệnh `/usage`. Lượt chat thành công: CHƯA THẤY.
// stream-json: CHƯA THẤY — dùng schema thống nhất với CLI giả (testing/fakes ASSUMPTIONS AG-STREAM-1 = AGY-STREAM-01 ở đây):
//   {type:"init", conversation_id, model} · {type:"tool_call", id, name} · {type:"tool_result", id, name, is_error, text}
//   · {type:"delta", text} · {type:"result", …như dạng json ở trên}. Lỗi: dòng {type:"result", status:"ERROR", …}.
// Dòng không có `type` mà có `status` = output `json` (dạng đã thấy) — vẫn đọc được. Dòng lạ bị bỏ, không đoán.
// Không có giá USD, không có cache-write. Spike 1c đo schema thật rồi sửa adapter + CLI giả cùng lúc.

function usageOf(u: JsonObject): TokenUsage {
  return {
    input: count(u.input_tokens),
    output: count(u.output_tokens),
    cacheRead: count(u.cache_read_tokens),
    cacheWrite: null,
    thinking: count(u.thinking_tokens),
    costMicroUsd: null,
  };
}

/** Kết quả cuối (dòng `result` của stream-json, hoặc object duy nhất của json). `withText`: phát văn bản trả lời. */
function resultEvents(line: JsonObject, withText: boolean): TurnStreamEvent[] {
  const status = str(line.status);
  const out: TurnStreamEvent[] = [];
  if (withText && status === 'SUCCESS') {
    const text = str(line.response);
    if (text !== null && text !== '') out.push({ type: 'delta', text });
  }
  const u = obj(line.usage);
  if (u !== null) out.push({ type: 'usage', usage: usageOf(u) });
  if (status === 'ERROR') {
    out.push({ type: 'error', code: 'agy_status_error', message: (str(line.error) ?? '').slice(0, 500) });
  }
  return out;
}

function parse(raw: string, sawDelta: boolean): TurnStreamEvent[] | null {
  const line = parseJsonObject(raw);
  if (line === null) return null;
  // Lệnh slash (`/usage`) trả {command:{…}} — không phải lượt chat.
  if (line.command !== undefined) return [];
  switch (line.type) {
    case 'init': {
      const model = str(line.model);
      return model !== null && model !== '' ? [{ type: 'model', model }] : [];
    }
    case 'delta': {
      const text = str(line.text);
      return text !== null && text !== '' ? [{ type: 'delta', text }] : [];
    }
    case 'tool_call':
    case 'tool_result': {
      const name = str(line.name);
      if (name === null || name === '') return [];
      return [{ type: 'tool', stage: line.type === 'tool_call' ? 'call' : 'result', name, callId: str(line.id) }];
    }
    case 'result':
      // Văn bản đã đến qua `delta`; chỉ phát lại `response` khi stream không có delta nào (an toàn khi schema thật khác).
      return resultEvents(line, !sawDelta);
    case undefined:
      // Output `json` (một object, không có `type`).
      return str(line.status) === null ? [] : resultEvents(line, true);
    default:
      return [];
  }
}

/** Không trạng thái: dòng `result` của stream-json không phát lại văn bản (đã có ở `delta`). */
export function parseLineAll(line: string): TurnStreamEvent[] {
  return parse(line, true) ?? [];
}

/**
 * Parser có trạng thái. Pha (G-13, CNS-168): 'planning' tới `tool_call` đầu tiên, sau đó 'acting' — theo schema giả định
 * AGY-STREAM-01 (chưa đo được với CLI thật; Spike 1c). Nhãn chưa chắc: không có tín hiệu.
 */
export function createParser(): TurnLineParser {
  const stats = { lines: 0, droppedOversize: 0, unparsable: 0 };
  let phase: TurnPhase = 'planning';
  let sawDelta = false;
  return {
    stats,
    get phase() {
      return phase;
    },
    push(line: string): TurnStreamEvent[] {
      stats.lines++;
      if (line.length > MAX_LINE_BYTES) {
        stats.droppedOversize++;
        return [];
      }
      const events = parse(line, sawDelta);
      if (events === null) {
        if (line.trim() !== '') stats.unparsable++;
        return [];
      }
      for (const e of events) {
        if (e.type === 'delta') sawDelta = true;
        if (e.type === 'tool' && e.stage === 'call') phase = 'acting';
      }
      return events;
    },
  };
}
