// Công thức cài từ nguồn chính chủ — CÙNG HÌNH DẠNG với `InstallRecipe` của @ga/engines (L-ENG, EngineAdapterExt.install).
// Lặp kiểu ở đây vì @ga/engines chưa vào nhánh L-RT; khi L-ENG merge thì thay bằng `import type { InstallRecipe } from
// '@ga/engines'` (test kiểu sẽ bắt lệch). Dữ liệu thuần: không I/O.

export interface InstallPlatform {
  readonly arch: 'x64' | 'arm64';
  readonly libc: 'glibc' | 'musl';
  /** Khoá nền tảng của hãng (tên trong manifest / URL). */
  readonly key: string;
}

export interface InstallRecipe {
  readonly binaryName: string;
  readonly platforms: readonly InstallPlatform[];
  readonly manifest:
    | {
        readonly kind: 'per-platform';
        readonly urlTemplate: string;
        readonly fields: { readonly version: string; readonly url: string; readonly checksum: string };
      }
    | {
        readonly kind: 'versioned';
        readonly latestUrl: string;
        readonly urlTemplate: string;
        readonly checksumPath: readonly string[];
        readonly binaryUrlTemplate: string;
      };
  readonly payload: { readonly kind: 'raw' } | { readonly kind: 'tar.gz'; readonly member: string };
  readonly verifiedAt: string;
}
