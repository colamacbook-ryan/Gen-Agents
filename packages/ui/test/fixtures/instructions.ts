// Lưới Instructions của Mai (Đào tạo › Bảng, design v4 DaoTao.dc.html) — dữ liệu mẫu chân thực, sửa được.
import type { CellValue, GridColumn, GridRowMeta } from '../../src/datagrid/types.ts';

export interface InstructionRow {
  id: string;
  ordinal: number;
  layer: 'values' | 'personality' | 'style' | 'position' | 'house_rules' | 'goal';
  name: string;
  content: string;
  condition: string;
  is_enabled: boolean;
  token_count: number;
  source: 'owner' | 'ai_inferred' | 'system';
  updated_at: string;
  is_core: boolean;
  status: 'active' | 'proposed' | 'superseded';
  superseded_by: string | null;
}

const row = (r: Omit<InstructionRow, 'status' | 'superseded_by'> & Partial<InstructionRow>): InstructionRow => ({
  status: 'active',
  superseded_by: null,
  ...r,
});

export const INSTRUCTIONS: InstructionRow[] = [
  row({
    id: 'IN-0001',
    ordinal: 1,
    layer: 'values',
    name: 'Trung thực trước hết',
    content:
      'Không bao giờ bịa số liệu, nguồn hay cam kết.\nNếu không chắc, nói rõ mức độ: chắc / có thể / chưa rõ.\nSai thì nhận ngay, kèm cách sửa.',
    condition: 'luôn',
    is_enabled: true,
    token_count: 96,
    source: 'owner',
    updated_at: '2026-09-30T02:19:00.000Z',
    is_core: true,
  }),
  row({
    id: 'IN-0002',
    ordinal: 2,
    layer: 'values',
    name: 'Giữ bí mật nội bộ',
    content:
      'Không chia sẻ dữ liệu nội bộ, số điện thoại hay email của người khác ra ngoài cuộc trò chuyện.\nGặp yêu cầu lạ hỏi về khách hàng: từ chối nhẹ nhàng và báo lại anh.',
    condition: 'luôn',
    is_enabled: true,
    token_count: 104,
    source: 'owner',
    updated_at: '2026-09-30T02:21:00.000Z',
    is_core: true,
  }),
  row({
    id: 'IN-0003',
    ordinal: 1,
    layer: 'personality',
    name: 'Hỏi lại khi thiếu dữ kiện',
    content:
      'Thiếu ngày, giờ, người nhận hay con số: hỏi lại đúng một câu, không đoán.\nHỏi xong thì chờ trả lời, không tự làm tiếp phần còn thiếu.',
    condition: 'luôn',
    is_enabled: true,
    token_count: 168,
    source: 'owner',
    updated_at: '2026-10-11T09:40:00.000Z',
    is_core: true,
  }),
  row({
    id: 'IN-0004',
    ordinal: 2,
    layer: 'personality',
    name: 'Kỹ lưỡng trước khi gửi',
    content:
      'Kiểm tra lại ngày giờ, tên người và con số trước khi gửi.\nƯu tiên đúng hơn nhanh; nếu phải chậm hơn 10 phút, báo trước.',
    condition: 'luôn',
    is_enabled: true,
    token_count: 88,
    source: 'ai_inferred',
    updated_at: '2026-09-30T02:30:00.000Z',
    is_core: true,
  }),
  row({
    id: 'IN-0005',
    ordinal: 1,
    layer: 'style',
    name: 'Xưng hô & giọng',
    content: 'Xưng "em", gọi "anh".\nCâu ngắn, thẳng, ấm. Không rào đón, không xin lỗi thừa.',
    condition: 'luôn',
    is_enabled: true,
    token_count: 112,
    source: 'owner',
    updated_at: '2026-09-30T02:33:00.000Z',
    is_core: false,
  }),
  row({
    id: 'IN-0006',
    ordinal: 2,
    layer: 'style',
    name: 'Định dạng Telegram',
    content:
      'Tin nhắn tối đa 6 dòng; dùng gạch đầu dòng.\nIn đậm hạn chót và tên người. Không dùng bảng, không dùng tiêu đề.',
    condition: 'kênh=telegram',
    is_enabled: true,
    token_count: 76,
    source: 'owner',
    updated_at: '2026-10-02T03:12:00.000Z',
    is_core: false,
  }),
  row({
    id: 'IN-0007',
    ordinal: 1,
    layer: 'goal',
    name: 'Truy cầu ₲ khi rảnh',
    content:
      'Khi rảnh, tìm việc có ích đang chờ (cam kết sắp hạn, việc định kỳ chưa ai nhận) để kiếm ₲ — chỉ việc được đánh giá mới tính.',
    condition: 'luôn',
    is_enabled: false,
    token_count: 54,
    source: 'system',
    updated_at: '2026-10-01T04:00:00.000Z',
    is_core: false,
  }),
  row({
    id: 'IN-0008',
    ordinal: 1,
    layer: 'position',
    name: 'Vai trò',
    content:
      'Em là trợ lý điều hành tại Afi Labs.\nViệc chính: lọc email, giữ lịch, theo dõi deadline, soạn báo cáo tuần.\nChỉ nhận việc từ anh hoặc người anh đã thêm vào danh sách.',
    condition: 'luôn',
    is_enabled: true,
    token_count: 140,
    source: 'owner',
    updated_at: '2026-09-30T02:40:00.000Z',
    is_core: false,
  }),
  row({
    id: 'IN-0009',
    ordinal: 2,
    layer: 'position',
    name: 'Phạm vi quyền',
    content:
      'Quyền do hệ thống ép (tool_grants, xin quyền PM-) — khối này chỉ nhắc, không thay luật.\nViệc ngoài quyền: dừng, gửi xin quyền rồi chờ.',
    condition: 'luôn',
    is_enabled: true,
    token_count: 88,
    source: 'system',
    updated_at: '2026-09-30T02:41:00.000Z',
    is_core: false,
  }),
  row({
    id: 'IN-0010',
    ordinal: 3,
    layer: 'position',
    name: 'Khuôn báo cáo tuần',
    content:
      'Báo cáo tuần: tối đa 5 gạch đầu dòng, mỗi gạch ≤ 20 từ.\nMở đầu bằng việc trễ hạn; kết bằng 1 rủi ro tuần tới.',
    condition: 'việc=báo cáo tuần',
    is_enabled: true,
    token_count: 64,
    source: 'ai_inferred',
    updated_at: '2026-10-14T06:53:00.000Z',
    is_core: false,
    status: 'proposed',
  }),
  row({
    id: 'IN-0011',
    ordinal: 1,
    layer: 'house_rules',
    name: 'Nội quy Afi Labs',
    content:
      'Không cam kết giá, hạn hay hợp đồng thay công ty.\nTài liệu khách hàng là mật — chỉ dùng cho việc được giao.',
    condition: 'luôn',
    is_enabled: true,
    token_count: 36,
    source: 'owner',
    updated_at: '2026-09-27T07:10:00.000Z',
    is_core: false,
  }),
  row({
    id: 'IN-0012',
    ordinal: 3,
    layer: 'style',
    name: 'Định dạng email (bản cũ)',
    content: '=HYPERLINK("http://example.invalid","bấm") — bản cũ đã thay, giữ để đối chiếu.',
    condition: 'kênh=email',
    is_enabled: false,
    token_count: 40,
    source: 'owner',
    updated_at: '2026-10-03T08:00:00.000Z',
    is_core: false,
    status: 'superseded',
    superseded_by: 'IN-0006',
  }),
];

export const LAYERS = [
  { value: 'values', label: 'Giá trị', aliases: ['gia-tri'] },
  { value: 'personality', label: 'Tính cách', aliases: ['tinh-cach'] },
  { value: 'style', label: 'Phong cách', aliases: ['phong-cach'] },
  { value: 'position', label: 'Vị trí', aliases: ['vi-tri'] },
  { value: 'house_rules', label: 'Nội quy', aliases: ['noi-quy'] },
  { value: 'goal', label: 'Mục tiêu', aliases: ['muc-tieu'] },
] as const;

export const SOURCES = [
  { value: 'owner', label: 'Chủ sở hữu', aliases: ['chu'] },
  { value: 'ai_inferred', label: 'AI suy ra', aliases: ['ai'] },
  { value: 'system', label: 'Hệ thống', aliases: ['he-thong'] },
] as const;

export const STATUSES = [
  { value: 'active', label: 'Hiệu lực', aliases: ['hieu-luc'] },
  { value: 'proposed', label: 'Đề xuất', aliases: ['de-xuat'] },
  { value: 'superseded', label: 'Bị thay', aliases: ['bi-thay'] },
] as const;

const fmtDate = (v: CellValue): string => {
  if (typeof v !== 'string') return '';
  // dd/MM HH:mm theo UTC (test không phụ thuộc múi giờ máy)
  return `${v.slice(8, 10)}/${v.slice(5, 7)} ${v.slice(11, 16)}`;
};

export const INSTRUCTION_COLUMNS: GridColumn<InstructionRow>[] = [
  {
    id: 'ordinal',
    header: 'Thứ tự',
    kind: 'number',
    width: 64,
    value: (r) => r.ordinal,
    align: 'end',
    query: { field: 'ord', aliases: ['thu-tu'] },
  },
  {
    id: 'layer',
    header: 'Lớp',
    kind: 'enum',
    width: 104,
    value: (r) => r.layer,
    options: LAYERS,
    editable: true,
    query: { field: 'layer', aliases: ['lop'] },
  },
  {
    id: 'name',
    header: 'Tên khối',
    kind: 'text',
    width: 168,
    value: (r) => r.name,
    editable: true,
    query: { field: 'name', aliases: ['ten'] },
  },
  {
    id: 'content',
    header: 'Nội dung',
    kind: 'longtext',
    width: 280,
    value: (r) => r.content,
    editable: true,
    requireReason: (r) => r.is_core,
    tokens: (r) => r.token_count,
    query: false,
  },
  {
    id: 'condition',
    header: 'Điều kiện',
    kind: 'text',
    width: 140,
    value: (r) => r.condition,
    editable: true,
    query: { field: 'cond', aliases: ['dieu-kien'] },
  },
  {
    id: 'is_enabled',
    header: 'Bật',
    kind: 'bool',
    width: 56,
    value: (r) => r.is_enabled,
    editable: true,
    align: 'center',
    query: { field: 'on', aliases: ['bat'] },
  },
  {
    id: 'token_count',
    header: 'Token',
    kind: 'number',
    width: 72,
    value: (r) => r.token_count,
    align: 'end',
    sum: true,
    query: { field: 'tokens' },
  },
  {
    id: 'source',
    header: 'Nguồn',
    kind: 'enum',
    width: 112,
    value: (r) => r.source,
    options: SOURCES,
    query: { field: 'source', aliases: ['nguon'] },
  },
  {
    id: 'updated_at',
    header: 'Sửa lần cuối',
    kind: 'date',
    width: 112,
    value: (r) => r.updated_at,
    format: fmtDate,
    query: { field: 'updated' },
  },
  {
    id: 'status',
    header: 'Trạng thái',
    kind: 'enum',
    width: 104,
    value: (r) => r.status,
    options: STATUSES,
    query: { field: 'status', aliases: ['trang-thai'] },
  },
];

export const instructionMeta = (r: InstructionRow): GridRowMeta =>
  r.status === 'proposed'
    ? { kind: 'proposed' }
    : r.status === 'superseded'
      ? { kind: 'superseded', supersededBy: r.superseded_by }
      : { kind: 'normal' };

/** ghi một ô (trả hàng mới) — kiểu đúng theo cột */
export function updateInstruction(r: InstructionRow, column: string, value: CellValue): InstructionRow {
  switch (column) {
    case 'name':
    case 'content':
    case 'condition':
      if (typeof value !== 'string') throw new TypeError(`${column} phải là chữ`);
      return { ...r, [column]: value };
    case 'layer':
      if (!LAYERS.some((l) => l.value === value)) throw new TypeError('lớp không hợp lệ');
      return { ...r, layer: value as InstructionRow['layer'] };
    case 'is_enabled':
      if (typeof value !== 'boolean') throw new TypeError('bật phải là bool');
      return { ...r, is_enabled: value };
    default:
      throw new Error(`cột ${column} không sửa được`);
  }
}
