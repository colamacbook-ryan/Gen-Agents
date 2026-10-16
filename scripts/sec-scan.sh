#!/usr/bin/env bash
# pnpm sec:scan — gitleaks (image chính chủ, ghim phiên bản) quét toàn bộ lịch sử git của repo.
# Phát hiện đã rà tay nằm ở .gitleaksignore (fingerprint chính xác commit:tệp:luật:dòng).
#
# Chạy được trong git worktree: tệp `.git` của worktree trỏ (đường TUYỆT ĐỐI) tới gitdir chung ⇒ mount cả thư mục repo lẫn
# git common dir vào ĐÚNG đường tuyệt đối gốc trong container (không đổi tên thành /repo), rồi quét $ROOT.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1"
COMMON="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)"
COMMON="$(cd "$COMMON" && pwd -P)"
mounts=(-v "$ROOT:$ROOT:ro")
case "$COMMON/" in
  "$ROOT"/*) ;; # checkout chính: .git nằm trong ROOT, đã mount
  *) mounts+=(-v "$COMMON:$COMMON:ro") ;;
esac
docker run --rm "${mounts[@]}" "$IMAGE" git --redact --no-banner -v "$ROOT"
