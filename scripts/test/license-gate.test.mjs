// Cổng license (STD-04 §6): selftest với gói mồi GPL / khai sai / thiếu tệp + asset mồi; bộ nhận diện văn bản.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyLicenseText, spdxAlternatives } from '../license-gate.mjs';

const script = fileURLToPath(new URL('../license-gate.mjs', import.meta.url));

describe('license-gate', () => {
  it('--selftest: mồi GPL / AGPL / khai sai / thiếu tệp / MPL vào sản phẩm / asset sai ⇒ đỏ; đối chứng ⇒ xanh', () => {
    const out = execFileSync(process.execPath, [script, '--selftest'], { encoding: 'utf8' });
    expect(out).toContain('✓ gpl-bait@1.0.0: ĐỎ');
    expect(out).toContain('✓ mislabeled-bait@1.0.0: ĐỎ');
    expect(out).toContain('mọi mồi đỏ, mọi đối chứng xanh');
  });

  it('nhận diện văn bản: MPL nhắc tên GNU không bị coi là GPL; tệp gộp nhiều license trả đủ', () => {
    const mpl =
      'Mozilla Public License Version 2.0 … "Secondary License" means either the GNU General Public License, Version 2.0, the GNU Lesser General Public License, Version 2.1, the GNU Affero General Public License, Version 3.0';
    expect(classifyLicenseText(mpl)).toEqual(['MPL-2.0']);
    expect(classifyLicenseText('GNU AFFERO GENERAL PUBLIC LICENSE Version 3')).toEqual(['AGPL-3.0']);
    const bundle =
      'Permission is hereby granted, free of charge, to any person obtaining a copy … Apache License, Version 2.0 …';
    expect(classifyLicenseText(bundle).sort()).toEqual(['Apache-2.0', 'MIT']);
    expect(classifyLicenseText('All rights reserved')).toEqual([]);
  });

  it('biểu thức SPDX', () => {
    expect(spdxAlternatives('(MIT OR Apache-2.0)')).toEqual([['MIT'], ['Apache-2.0']]);
    expect(spdxAlternatives('MIT AND CC0-1.0')).toEqual([['MIT', 'CC0-1.0']]);
    expect(spdxAlternatives(undefined)).toEqual([]);
  });
});
