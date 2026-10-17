#!/usr/bin/env bash
# pnpm sec:scan — gitleaks (image chính chủ, ghim phiên bản).
#   pnpm sec:scan                 quét TOÀN BỘ lịch sử git (CI)
#   pnpm sec:scan -- --staged     quét nội dung ĐÃ STAGE (cổng commit — chạy trước `git commit`, xem README)
# Phát hiện đã rà tay nằm ở .gitleaksignore (fingerprint chính xác commit:tệp:luật:dòng).
#
# Chạy được trong git worktree: tệp `.git` của worktree trỏ (đường TUYỆT ĐỐI) tới gitdir chung ⇒ mount cả thư mục repo lẫn
# git common dir vào ĐÚNG đường tuyệt đối gốc trong container (không đổi tên thành /repo), rồi quét $ROOT.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# ghim digest (index đa kiến trúc) — tag chỉ để đọc; đổi phiên bản = cập nhật cả hai
IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"

mode=history
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift ;;
    --staged) mode=staged; shift ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "✗ Tham số lạ: $1" >&2; exit 2 ;;
  esac
done

COMMON="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)"
COMMON="$(cd "$COMMON" && pwd -P)"
mounts=(-v "$ROOT:$ROOT:ro")
case "$COMMON/" in
  "$ROOT"/*) ;; # checkout chính: .git nằm trong ROOT, đã mount
  *) mounts+=(-v "$COMMON:$COMMON:ro") ;;
esac

args=(git --redact --no-banner -v)
if [ "$mode" = staged ]; then
  if git -C "$ROOT" diff --cached --quiet; then
    echo "✓ sec:scan --staged: không có gì đã stage"
    exit 0
  fi
  args+=(--staged)
fi
docker run --rm "${mounts[@]}" "$IMAGE" "${args[@]}" "$ROOT"
