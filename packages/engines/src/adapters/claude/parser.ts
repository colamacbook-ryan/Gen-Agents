import { QUOTA_WINDOWS, type QuotaWindow, type TokenUsage, type TurnStreamEvent } from '@ga/contracts';
import { count, epochSecondsToDb, type JsonObject, MAX_LINE_BYTES, obj, parseJsonObject, str } from '../../text.ts';
import type { TurnLineParser, TurnPhase } from '../../types.ts';

// Parser stream-json của Claude Code (`-p --output-format stream-json --verbose --include-partial-messages`).
// Dạng dòng ĐÃ THẤY ở Spike 1b (help-dumps/claude-stream-init.txt, claude 2.1.299): system/init (model), stream_event
// (message_start, content_block_start/delta/stop, message_delta, message_stop), assistant, rate_limit_event, result.
// Dòng `user` chứa tool_result: chưa thấy trong dump (lượt đó không gọi công cụ) — dạng theo Messages API, chưa kiểm (CC-STREAM-02).
// Một dòng có thể sinh nhiều sự kiện (vd nhiều tool_result) ⇒ parseLineAll; parseStreamLine (contracts) lấy sự kiện đầu.

const MAX_TOOL_NAMES = 1000;

function usageOf(result: JsonObject): TokenUsage | null {
  const u = obj(result.usage);
  if (u === null) return null;
  const details = obj(u.output_tokens_details);
  const cost = result.total_cost_usd;
  return {
    input: count(u.input_tokens),
    output: count(u.output_tokens),
    cacheRead: count(u.cache_read_input_tokens),
    cacheWrite: count(u.cache_creation_input_tokens),
    thinking: details === null ? null : count(details.thinking_tokens),
    costMicroUsd: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 1_000_000) : null,
  };
}

/** Sự kiện con của một tin nhắn subagent (parent_tool_use_id khác null) không phải câu trả lời chính ⇒ bỏ. */
function isSubagent(line: JsonObject): boolean {
  return line.parent_tool_use_id !== undefined && line.parent_tool_use_id !== null;
}

function streamEvent(line: JsonObject): TurnStreamEvent[] {
  if (isSubagent(line)) return [];
  const ev = obj(line.event);
  if (ev === null) return [];
  const t = str(ev.type);
  if (t === 'content_block_delta') {
    const d = obj(ev.delta);
    if (d !== null && d.type === 'text_delta') {
      const text = str(d.text);
      return text !== null && text !== '' ? [{ type: 'delta', text }] : [];
    }
    return [];
  }
  if (t === 'content_block_start') {
    const b = obj(ev.content_block);
    if (b !== null && (b.type === 'tool_use' || b.type === 'server_tool_use' || b.type === 'mcp_tool_use')) {
      const name = str(b.name);
      if (name === null || name === '') return [];
      return [{ type: 'tool', stage: 'call', name, callId: str(b.id) }];
    }
  }
  return [];
}

function toolUseEvent(b: JsonObject | null): TurnStreamEvent | null {
  if (b === null || (b.type !== 'tool_use' && b.type !== 'server_tool_use' && b.type !== 'mcp_tool_use')) return null;
  const name = str(b.name);
  return name === null || name === '' ? null : { type: 'tool', stage: 'call', name, callId: str(b.id) };
}

function assistantToolCalls(line: JsonObject): TurnStreamEvent[] {
  if (isSubagent(line)) return [];
  const content = obj(line.message)?.content;
  if (!Array.isArray(content)) return [];
  return content.map((b) => toolUseEvent(obj(b))).filter((e): e is TurnStreamEvent => e !== null);
}

/** Gọi công cụ lần đầu thấy (theo callId) ⇒ giữ và nhớ tên; đã thấy ⇒ bỏ (khử trùng stream_event ↔ assistant). */
function firstSeenCall(e: TurnStreamEvent, names: Map<string, string>): boolean {
  if (e.type !== 'tool' || e.stage !== 'call' || e.callId === null) return true;
  if (names.has(e.callId)) return false;
  if (names.size < MAX_TOOL_NAMES) names.set(e.callId, e.name);
  return true;
}

function toolResults(line: JsonObject, names: Map<string, string> | null): TurnStreamEvent[] {
  if (isSubagent(line)) return [];
  const msg = obj(line.message);
  const content = msg === null ? null : msg.content;
  if (!Array.isArray(content)) return [];
  const out: TurnStreamEvent[] = [];
  for (const block of content) {
    const b = obj(block);
    if (b === null || b.type !== 'tool_result') continue;
    const callId = str(b.tool_use_id);
    const name = (callId !== null && names?.get(callId)) || 'unknown';
    out.push({ type: 'tool', stage: 'result', name, callId });
  }
  return out;
}

function resultEvents(line: JsonObject): TurnStreamEvent[] {
  const out: TurnStreamEvent[] = [];
  const usage = usageOf(line);
  if (usage !== null) out.push({ type: 'usage', usage });
  if (line.is_error === true) {
    const status = line.api_error_status;
    const code = typeof status === 'number' ? `api_error_${status}` : `result_${str(line.subtype) ?? 'error'}`;
    out.push({ type: 'error', code, message: (str(line.result) ?? '').slice(0, 500) });
  }
  return out;
}

/**
 * `rate_limit_event` ⇒ sự kiện quota có cấu trúc (contracts QuotaSignal). ĐÃ THẤY (Spike 1b): {status:'allowed', resetsAt:<giây>,
 * rateLimitType:'five_hour', unifiedWindows:{five_hour:{utilization:0.24, resetsAt}}}. 'allowed_warning' / 'rejected' và
 * utilization là PHÂN SỐ 0..1: chưa kiểm (CC-Q02, M6). Loại cửa sổ lạ ⇒ 'other' (không bịa ánh xạ).
 */
function rateLimit(line: JsonObject): TurnStreamEvent[] {
  const info = obj(line.rate_limit_info);
  if (info === null) return [];
  const raw = str(info.status);
  const status =
    raw === 'allowed' ? 'allowed' : raw === 'allowed_warning' ? 'warning' : raw === 'rejected' ? 'rejected' : null;
  if (status === null) return [];
  const type = str(info.rateLimitType);
  const window: QuotaWindow =
    type !== null && type !== 'other' && (QUOTA_WINDOWS as readonly string[]).includes(type)
      ? (type as QuotaWindow)
      : 'other';
  const windows = obj(info.unifiedWindows);
  const u = type !== null && windows !== null ? obj(windows[type])?.utilization : undefined;
  const utilizationPct = typeof u === 'number' && u >= 0 && u <= 1 ? Math.round(u * 10_000) / 100 : null;
  return [{ type: 'quota', quota: { window, status, resetAt: epochSecondsToDb(info.resetsAt), utilizationPct } }];
}

function parse(raw: string, names: Map<string, string> | null): TurnStreamEvent[] | null {
  const line = parseJsonObject(raw);
  if (line === null) return null;
  switch (line.type) {
    case 'system': {
      if (line.subtype !== 'init') return [];
      const model = str(line.model);
      return model !== null && model !== '' ? [{ type: 'model', model }] : [];
    }
    case 'stream_event': {
      const events = streamEvent(line);
      return names === null ? events : events.filter((e) => firstSeenCall(e, names));
    }
    case 'assistant':
      // Không trạng thái: bỏ (nội dung đã có qua stream_event). Có trạng thái: lấy gọi công cụ chưa thấy qua stream_event
      // (CLI giả CL-STREAM-2 chỉ báo tool_use trong `assistant`; CLI thật thường báo cả hai — khử trùng theo id).
      return names === null ? [] : assistantToolCalls(line).filter((e) => firstSeenCall(e, names));
    case 'user':
      return toolResults(line, names);
    case 'result':
      return resultEvents(line);
    case 'rate_limit_event':
      return rateLimit(line);
    default:
      // Dòng lạ ⇒ bỏ. Văn bản trong `assistant` lặp lại delta của stream_event (partial) ⇒ không phát lại.
      return [];
  }
}

export function parseLineAll(line: string): TurnStreamEvent[] {
  return parse(line, null) ?? [];
}

/**
 * Parser có trạng thái cho một lượt. Pha (CNS-168, G-13): 'planning' từ đầu lượt tới sự kiện công cụ đầu tiên
 * (content_block_start tool_use — dạng đã thấy ở Spike 1b cho khối text; khối tool_use theo cùng giao thức, CC-STREAM-01),
 * sau đó 'acting'. Nhãn "chưa chắc": stream không có tín hiệu ⇒ chưa đo được (outputSignals.certainty).
 */
export function createParser(): TurnLineParser {
  const names = new Map<string, string>();
  const stats = { lines: 0, droppedOversize: 0, unparsable: 0 };
  let phase: TurnPhase = 'planning';
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
      const events = parse(line, names);
      if (events === null) {
        if (line.trim() !== '') stats.unparsable++;
        return [];
      }
      if (phase === 'planning' && events.some((e) => e.type === 'tool' && e.stage === 'call')) phase = 'acting';
      return events;
    },
  };
}
