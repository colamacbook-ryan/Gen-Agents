// Đồng hồ tiến độ `pnpm api:coverage` (owner xem): số route đã có handler production / 201 theo lane + route đã mount mà
// CHƯA có seeder chống IDOR cho một trường Ref (meta-test sẽ đỏ ở các route này).
import { LANES, type Lane, ROUTES, type Route } from '@ga/contracts';
import { refFieldsOf } from './sample.ts';
import { missingSeederPrefixes } from './seeders.ts';

export interface LaneCoverage {
  lane: Lane;
  implemented: number;
  total: number;
}

export interface MissingSeeder {
  routeId: string;
  field: string;
  prefixes: readonly string[];
}

export interface CoverageReport {
  implemented: number;
  total: number;
  lanes: LaneCoverage[];
  missingSeeders: MissingSeeder[];
}

export function coverageReport(mounted: readonly Pick<Route, 'id'>[]): CoverageReport {
  const ids = new Set(mounted.map((r) => r.id));
  const lanes = LANES.map((lane) => {
    const all = ROUTES.filter((r) => r.lane === lane);
    return { lane, total: all.length, implemented: all.filter((r) => ids.has(r.id)).length };
  });
  const missingSeeders: MissingSeeder[] = [];
  for (const r of ROUTES) {
    if (!ids.has(r.id)) continue;
    for (const f of refFieldsOf(r)) {
      const miss = missingSeederPrefixes(f.prefixes);
      if (miss.length > 0) missingSeeders.push({ routeId: r.id, field: f.path, prefixes: miss });
    }
  }
  return {
    implemented: ROUTES.filter((r) => ids.has(r.id)).length,
    total: ROUTES.length,
    lanes,
    missingSeeders,
  };
}

export function formatCoverage(rep: CoverageReport): string {
  const lines = [`api:coverage — handler production: ${rep.implemented}/${rep.total}`];
  for (const l of rep.lanes) lines.push(`  ${l.lane.padEnd(7)} ${String(l.implemented).padStart(3)}/${l.total}`);
  if (rep.missingSeeders.length === 0) lines.push('seeder chống IDOR: đủ cho mọi route đã mount');
  else {
    lines.push(`route đã mount nhưng THIẾU seeder chống IDOR (${rep.missingSeeders.length}):`);
    for (const m of rep.missingSeeders)
      lines.push(`  ${m.routeId} ${m.field} — thiếu seeder: ${m.prefixes.join(', ')}`);
  }
  return lines.join('\n');
}
