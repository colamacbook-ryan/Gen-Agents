import { closeSync, constants, createReadStream, fsyncSync, openSync, writeSync } from 'node:fs';
import { createGunzip } from 'node:zlib';

// Trích MỘT tệp thường (`member`) từ gói .tar.gz, chạy luồng (không giải nén cả gói vào RAM). Chỉ thư viện chuẩn.
// Hỗ trợ ustar (name + prefix), GNU long name ('L'), PAX ('x' với path=). Không theo symlink / hardlink trong gói: member
// phải là tệp thường ('0' hoặc NUL). Ghi ra `destPath` (O_EXCL | O_NOFOLLOW).

const BLOCK = 512;

function cstr(buf: Buffer, start: number, len: number): string {
  const end = buf.indexOf(0, start);
  return buf.toString('utf8', start, end >= 0 && end < start + len ? end : start + len);
}

function octal(buf: Buffer, start: number, len: number): number {
  const s = cstr(buf, start, len).trim();
  if (!/^[0-7]{1,12}$/.test(s)) throw new Error('tar: kích thước sai dạng');
  return Number.parseInt(s, 8);
}

function normalize(name: string): string {
  return name.replace(/^\.\//, '');
}

function parsePaxPath(data: Buffer): string | null {
  let off = 0;
  while (off < data.length) {
    const sp = data.indexOf(0x20, off);
    if (sp < 0) break;
    const len = Number(data.toString('ascii', off, sp));
    if (!Number.isInteger(len) || len <= 0 || off + len > data.length) break;
    const rec = data.toString('utf8', sp + 1, off + len - 1);
    if (rec.startsWith('path=')) return rec.slice(5);
    off += len;
  }
  return null;
}

export async function extractMember(
  archivePath: string,
  member: string,
  destPath: string,
  maxBytes: number,
): Promise<number> {
  const want = normalize(member);
  const fd = openSync(
    destPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let found = false;
  let written = 0;
  try {
    let pending: Buffer = Buffer.alloc(0);
    // trạng thái: chờ header | đọc thân (bỏ qua hoặc ghi) | đọc dữ liệu meta (long name / pax)
    let mode: 'header' | 'body' = 'header';
    let bodyLeft = 0;
    let padLeft = 0;
    let writing = false;
    let metaKind: 'L' | 'x' | null = null;
    let meta: Buffer[] = [];
    let nextName: string | null = null;
    let zeroBlocks = 0;
    const gunzip = createReadStream(archivePath).pipe(createGunzip());
    for await (const chunk of gunzip as AsyncIterable<Buffer>) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let off = 0;
      for (;;) {
        if (mode === 'header') {
          if (pending.length - off < BLOCK) break;
          const h = pending.subarray(off, off + BLOCK);
          off += BLOCK;
          if (h.every((b) => b === 0)) {
            if (++zeroBlocks >= 2) break;
            continue;
          }
          zeroBlocks = 0;
          const type = String.fromCharCode(h[156] ?? 0);
          const size = octal(h, 124, 12);
          const prefix = h.toString('ascii', 257, 262) === 'ustar' ? cstr(h, 345, 155) : '';
          const rawName = nextName ?? (prefix ? `${prefix}/${cstr(h, 0, 100)}` : cstr(h, 0, 100));
          nextName = null;
          bodyLeft = size;
          padLeft = (BLOCK - (size % BLOCK)) % BLOCK;
          metaKind = type === 'L' || type === 'x' ? type : null;
          meta = [];
          writing = !found && metaKind === null && (type === '0' || type === '\0') && normalize(rawName) === want;
          if (writing) {
            if (size > maxBytes) throw new Error('tar: member vượt trần kích thước');
            found = true;
          }
          mode = 'body';
          continue;
        }
        // body
        if (bodyLeft > 0) {
          const take = Math.min(bodyLeft, pending.length - off);
          if (take === 0) break;
          const part = pending.subarray(off, off + take);
          if (writing) {
            let w = 0;
            while (w < part.length) w += writeSync(fd, part, w, part.length - w);
            written += part.length;
          } else if (metaKind) {
            if (meta.reduce((n, b) => n + b.length, 0) + part.length > 64 * 1024) throw new Error('tar: meta quá lớn');
            meta.push(Buffer.from(part));
          }
          bodyLeft -= take;
          off += take;
          continue;
        }
        if (padLeft > 0) {
          const take = Math.min(padLeft, pending.length - off);
          if (take === 0) break;
          padLeft -= take;
          off += take;
          if (padLeft > 0) continue;
        }
        if (metaKind) {
          const data = Buffer.concat(meta);
          nextName = metaKind === 'L' ? cstr(data, 0, data.length) : parsePaxPath(data);
        }
        writing = false;
        metaKind = null;
        mode = 'header';
      }
      pending = pending.subarray(off);
      if (zeroBlocks >= 2) break;
    }
    if (!found) throw new Error('tar: không thấy tệp cần trích trong gói');
    fsyncSync(fd);
    return written;
  } finally {
    closeSync(fd);
  }
}
