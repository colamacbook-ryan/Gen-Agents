// JSON chuẩn hoá (RFC 8785 JCS cho dữ liệu của gói: khoá sắp xếp, không khoảng trắng, số theo cách ghi của ECMAScript).
// skin_assets.sha256 của hàng chibi = sha256 của chuỗi này (importer tính; DB không có hàm băm).
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('canonicalJson: số không hữu hạn');
    const s = JSON.stringify(v);
    if (s === undefined) throw new Error('canonicalJson: giá trị không biểu diễn được trong JSON');
    return s;
  }
  if (Array.isArray(v)) return `[${v.map((x) => canonicalJson(x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}
