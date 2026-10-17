import { readFileSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';

// Allowlist domain của ga-egress (BUILD-PLAN §A.1 Egress, §B.3 "Container → Internet chỉ qua ga-egress"). Mặc định TỪ CHỐI.
// Luật: { host: "api.vendor.example" } khớp đúng host; { host: ".vendor.example" } khớp mọi host CON (không gồm chính nó).
// ports: mặc định [443]. IP literal chỉ đi được khi có luật trùng đúng IP đó. Sau khi khớp luật, địa chỉ phân giải ra phải là
// địa chỉ công cộng (chặn nội mạng: ga-app, docker, metadata cloud…) — trừ khi luật bật allowPrivate (chỉ hiệu lực ở image test).

export interface EgressRule {
  host: string;
  ports: number[];
  allowPrivate: boolean;
}

export interface RuleSet {
  rules: EgressRule[];
}

const HOST_RE = /^\.?[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)*$/;

export class RulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesError';
  }
}

export function normalizeHost(h: string): string | null {
  let s = h.trim().toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  if (s.endsWith('.')) s = s.slice(0, -1);
  if (s.length === 0 || s.length > 253) return null;
  if (isIP(s)) return s;
  return HOST_RE.test(s) && !s.startsWith('.') ? s : null;
}

export function parseRules(raw: string): RuleSet {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new RulesError('tệp luật không phải JSON');
  }
  if (typeof v !== 'object' || v === null || !Array.isArray((v as { rules?: unknown }).rules)) {
    throw new RulesError('tệp luật phải có dạng { rules: [...] }');
  }
  const out: EgressRule[] = [];
  for (const r of (v as { rules: unknown[] }).rules) {
    if (typeof r !== 'object' || r === null) throw new RulesError('luật sai dạng');
    const o = r as Record<string, unknown>;
    for (const k of Object.keys(o))
      if (!['host', 'ports', 'allowPrivate'].includes(k)) throw new RulesError(`khoá lạ: ${k}`);
    if (typeof o.host !== 'string') throw new RulesError('host phải là chuỗi');
    const host = o.host.trim().toLowerCase();
    const ok = isIP(host) !== 0 || (HOST_RE.test(host) && host.split('.').filter(Boolean).length >= 2);
    if (!ok) throw new RulesError(`host không hợp lệ: ${host.slice(0, 80)}`);
    const ports = o.ports === undefined ? [443] : o.ports;
    if (!Array.isArray(ports) || ports.length === 0 || !ports.every((p) => Number.isInteger(p) && p > 0 && p < 65536)) {
      throw new RulesError('ports phải là mảng số cổng');
    }
    out.push({ host, ports: ports as number[], allowPrivate: o.allowPrivate === true });
  }
  return { rules: out };
}

export function loadRulesFile(path: string): RuleSet {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new RulesError('không đọc được tệp luật');
  }
  return parseRules(raw);
}

/** Luật khớp (host đã chuẩn hoá, cổng) hoặc null. */
export function matchRule(set: RuleSet, host: string, port: number): EgressRule | null {
  for (const r of set.rules) {
    if (!r.ports.includes(port)) continue;
    if (r.host.startsWith('.')) {
      if (host.endsWith(r.host) && host.length > r.host.length && isIP(host) === 0) return r;
    } else if (r.host === host) {
      return r;
    }
  }
  return null;
}

const PRIVATE = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
] as const) {
  PRIVATE.addSubnet(net, bits, 'ipv6');
}

/** Địa chỉ nội mạng / đặc biệt (kể cả IPv4 ánh xạ trong IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return PRIVATE.check(ip, 'ipv4');
  if (fam === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/.exec(lower);
    if (mapped) return PRIVATE.check(mapped[1] as string, 'ipv4');
    return PRIVATE.check(lower, 'ipv6');
  }
  return true;
}
