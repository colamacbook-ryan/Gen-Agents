// Họ Telegram: bot (TG-), allowlist (AL-), outbox gửi đi (DATABASE §5.13, §5.14). Token bot nằm ở `secrets` (L-SEC niêm
// phong) — repo chỉ giữ secret_id + 4 ký tự cuối. Cổng người ghi do DB ép: bot / token CHỈ owner hoặc actor system;
// kết quả getMe / long-poll CHỈ actor system; hàng chủ sở hữu allowlist chỉ tạo qua capture và không mất (bất biến đếm).
//
// Outbox: DB v2.3.4 KHÔNG có bảng outbox cho tin trả lời Telegram (chat_messages.external_id bất biến sau INSERT,
// jobs.kind không có 'telegram_send'). MVP dùng `proactive_sends` (reserved → sent / failed / expired) cho tin chủ động +
// tin hệ thống; tin trả lời ghi chat_messages SAU khi gửi xong (externalId lúc INSERT). Đề xuất lane DB: jobs.kind
// 'telegram_send' hoặc bảng outbox riêng (xem báo cáo L-DB).
import type {
  Page,
  PageRequest,
  PolarisCheckInput,
  ProactivePolicyRow,
  ProactiveSendRow,
  TelegramAllowlistRow,
  TelegramBotRow,
  TelegramBotStatus,
} from './types.ts';

export interface TelegramReads {
  bot(botId: string): TelegramBotRow | null;
  botForRole(roleId: string): TelegramBotRow | null;
  bots(filter?: { status?: readonly TelegramBotStatus[] }): TelegramBotRow[];
  allowlist(botId: string): TelegramAllowlistRow[];
  /** Hàng active (chưa xoá mềm) của user trong allowlist bot; null = người ngoài (không lưu nội dung tin). */
  allowed(botId: string, tgUserId: number): TelegramAllowlistRow | null;
  owners(botId: string): TelegramAllowlistRow[];
  send(sendId: string): ProactiveSendRow | null;
  sends(filter?: {
    roleId?: string;
    status?: readonly ProactiveSendRow['status'][];
    page?: PageRequest;
  }): Page<ProactiveSendRow>;
  /** Hợp đồng giờ làm A3.P (PP-) sống của Role — null = chưa có (DB: trần tin / ngày = 0). */
  proactivePolicy(roleId: string): ProactivePolicyRow | null;
  /** Số tin chủ động đã gửi / giữ chỗ trong ngày địa phương (trần A3.P). */
  sentCount(roleId: string, dayLocal: string): number;
}

export interface ProactivePolicyInput {
  isEnabled?: boolean;
  maxPerDay?: number;
  /** Phút trong ngày 0–1439 (bắt buộc khi tạo). */
  quietStartMin?: number;
  quietEndMin?: number;
  /** IANA (bắt buộc khi tạo). */
  timezone?: string;
  weekend?: { quietStartMin: number; quietEndMin: number } | null;
  breakQuietLevel?: ProactivePolicyRow['break_quiet_level'];
  channel?: ProactivePolicyRow['channel'];
  allow?: Partial<Record<'commitmentReminder' | 'taskDone' | 'opportunity' | 'incident' | 'heartbeatDigest', boolean>>;
}

export interface TelegramRepo extends TelegramReads {
  /** Owner tạo bot ở 'pending' (DB ép), token đã nằm ở secrets kind 'telegram_bot_token'. */
  createBot(input: {
    roleId: string;
    botUsername: string;
    secretId: string;
    tokenLast4?: string | null;
  }): TelegramBotRow;
  /** Owner: pending / paused / revoked. active / error chỉ actor system (recordGetMe / recordPollError). */
  setBotStatus(botId: string, status: Extract<TelegramBotStatus, 'pending' | 'paused' | 'revoked'>): TelegramBotRow;
  /** Kết quả getMe — CHỈ actor system: ok ⇒ active + bot_tg_id + getme_ok_at; lỗi ⇒ error. */
  recordGetMe(botId: string, input: { ok: true; botTgId: number } | { ok: false; error: string }): TelegramBotRow;
  /** Xác nhận update_id đã xử lý (poll_offset chỉ tiến) — CHỈ actor system; cột vận hành, không tăng version. */
  advanceOffset(botId: string, offset: number): TelegramBotRow;
  recordPollError(botId: string, error: string): TelegramBotRow;
  softDeleteBot(botId: string): void;
  /** Khôi phục bot đã xoá mềm — chỉ owner, và phải còn hàng chủ sở hữu active (DB ép). */
  restoreBot(botId: string): TelegramBotRow;

  /** Capture user ID đã xác minh thành chủ sở hữu (is_owner 1, added_via 'capture'). */
  captureOwner(botId: string, input: { tgUserId: number; displayName: string }): TelegramAllowlistRow;
  addAllowed(
    botId: string,
    input: { tgUserId: number; displayName: string; addedVia: Exclude<TelegramAllowlistRow['added_via'], 'capture'> },
  ): TelegramAllowlistRow;
  /** active → removed. Hàng chủ sở hữu cuối cùng không gỡ được ('telegram.owner_invariant'). */
  removeAllowed(entryId: string): TelegramAllowlistRow;

  /** Tạo / sửa hợp đồng giờ làm của Role (owner / admin). Trường không truyền giữ nguyên (mặc định DB khi tạo). */
  setProactivePolicy(roleId: string, input: ProactivePolicyInput): ProactivePolicyRow;

  /**
   * Outbox (proactive_sends, PN-): giữ chỗ trước khi gửi; idempotencyKey trùng ⇒ 'unique.duplicate'; vượt trần /
   * ngày của policyId ⇒ 'proactive.daily_cap' (không có policy ⇒ trần 0).
   */
  reserveSend(input: {
    roleId: string;
    triggerKind: ProactiveSendRow['trigger_kind'];
    urgency: ProactiveSendRow['urgency'];
    channel: ProactiveSendRow['channel'];
    dayLocal: string;
    reservedUntil: string;
    idempotencyKey?: string | null;
    policyId?: string | null;
    taskId?: string | null;
    commitmentId?: string | null;
    proactiveJobId?: string | null;
    /** Đối chiếu Polaris của tin chủ động (DB đòi với trạng thái 'reserved'). */
    polaris: PolarisCheckInput;
  }): ProactiveSendRow;
  /** Bỏ qua có lý do (giờ im lặng, vượt trần, tắt, Trọng thương…) — ghi thẳng trạng thái suppressed_*. */
  recordSuppressed(input: {
    roleId: string;
    triggerKind: ProactiveSendRow['trigger_kind'];
    urgency: ProactiveSendRow['urgency'];
    channel: ProactiveSendRow['channel'];
    dayLocal: string;
    status: Extract<
      ProactiveSendRow['status'],
      'suppressed_quiet' | 'suppressed_cap' | 'suppressed_disabled' | 'suppressed_wounded'
    >;
    reason?: string | null;
    policyId?: string | null;
  }): ProactiveSendRow;
  markSent(sendId: string, input?: { messageId?: string | null }): ProactiveSendRow;
  markFailed(sendId: string, error: string): ProactiveSendRow;
  /** Giữ chỗ quá hạn (reserved_until < now) ⇒ expired. Trả số hàng. */
  expireReservations(): number;
}
