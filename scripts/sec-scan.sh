#!/usr/bin/env bash
# pnpm sec:scan — gitleaks (image chính chủ, ghim phiên bản) quét toàn bộ lịch sử git của repo.
# Phát hiện đã rà tay nằm ở .gitleaksignore (fingerprint chính xác commit:tệp:luật:dòng).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1"
docker run --rm -v "$ROOT:/repo:ro" "$IMAGE" git --redact --no-banner -v /repo
