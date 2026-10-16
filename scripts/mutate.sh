#!/usr/bin/env bash
# Đột biến AN TOÀN cho lane (kiểm test có bắt được lỗi không) — KHÔNG BAO GIỜ đụng worktree đang làm việc:
#   scripts/mutate.sh [--base <rev>] [--cmd "<lệnh test>"] --patch <tệp.patch>
#   scripts/mutate.sh [--base <rev>] [--cmd "<lệnh test>"] --replace <tệp> <chuỗi cũ> <chuỗi mới>
# Tạo `git worktree` TẠM tách rời từ <rev> (mặc định HEAD — thay đổi chưa commit KHÔNG đi theo), áp đột biến (patch, hoặc
# thay ĐÚNG MỘT lần xuất hiện của chuỗi cũ), `pnpm install --frozen-lockfile --offline`, chạy lệnh (mặc định `pnpm test`),
# rồi xoá worktree tạm (kể cả khi lỗi / Ctrl-C). Thư mục tạm: $GA_MUTATE_DIR (mặc định ${TMPDIR:-/tmp}).
# Thoát: 0 = đột biến BỊ BẮT (lệnh đỏ) · 3 = đột biến SỐNG (lệnh vẫn xanh) · 2 = lỗi dùng / dựng (không kết luận được).
set -euo pipefail

base=HEAD cmd="pnpm test" mode="" patch="" file="" old="" new=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base="${2:?}"; shift 2 ;;
    --cmd) cmd="${2:?}"; shift 2 ;;
    --patch) mode=patch; patch="${2:?}"; shift 2 ;;
    --replace) mode=replace; file="${2:?}"; old="${3:?}"; new="${4?}"; shift 4 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "✗ tham số lạ: $1" >&2; exit 2 ;;
  esac
done
[ -n "$mode" ] || { echo "✗ cần --patch hoặc --replace" >&2; exit 2; }
if [ "$mode" = patch ]; then patch="$(cd "$(dirname "$patch")" && pwd)/$(basename "$patch")"; fi

ROOT="$(git rev-parse --show-toplevel)"
rev="$(git -C "$ROOT" rev-parse --verify "${base}^{commit}")"
TMP="$(mktemp -d "${GA_MUTATE_DIR:-${TMPDIR:-/tmp}}/ga-mutate.XXXXXX")"
WT="$TMP/wt"
cleanup() {
  git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  git -C "$ROOT" worktree prune >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

git -C "$ROOT" worktree add --quiet --detach "$WT" "$rev"
cd "$WT"
if [ "$mode" = patch ]; then
  git apply --whitespace=nowarn "$patch" || { echo "✗ patch không áp được lên ${rev:0:7}" >&2; exit 2; }
else
  [ -f "$file" ] || { echo "✗ không có tệp $file ở ${rev:0:7}" >&2; exit 2; }
  GA_OLD="$old" GA_NEW="$new" node -e '
    const fs = require("node:fs");
    const [f] = process.argv.slice(1);
    const s = fs.readFileSync(f, "utf8");
    const i = s.indexOf(process.env.GA_OLD);
    if (i < 0) { console.error("✗ không thấy chuỗi cũ trong " + f); process.exit(2); }
    fs.writeFileSync(f, s.slice(0, i) + process.env.GA_NEW + s.slice(i + process.env.GA_OLD.length));
  ' "$file" || exit 2
fi
if git diff --quiet; then echo "✗ đột biến không đổi gì" >&2; exit 2; fi
echo "◐ đột biến trên ${rev:0:7}:"
git --no-pager diff --stat | sed 's/^/    /'
pnpm install --frozen-lockfile --offline --silent >/dev/null 2>&1 || { echo "✗ pnpm install --offline thất bại" >&2; exit 2; }
echo "◐ chạy: $cmd"
if bash -c "$cmd" >"$TMP/out.log" 2>&1; then
  echo "✗ đột biến SỐNG — lệnh vẫn xanh (test chưa bắt lỗi này)"
  tail -5 "$TMP/out.log" | sed 's/^/    /'
  exit 3
fi
echo "✓ đột biến bị bắt — lệnh đỏ"
grep -E "FAIL|×|✗" "$TMP/out.log" | head -5 | sed 's/^/    /' || true
exit 0
