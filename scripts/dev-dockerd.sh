#!/usr/bin/env bash
# Khởi dockerd trong máy dev / máy cloud nếu chưa chạy, rồi chờ `docker info` trả lời.
# Dùng: bash scripts/dev-dockerd.sh            (idempotent: dockerd đã chạy thì thoát 0 ngay)
# Biến môi trường:
#   GA_DOCKERD_LOG      nơi ghi log dockerd (mặc định: ${TMPDIR:-/tmp}/ga-dockerd.log)
#   GA_DOCKERD_TIMEOUT  số giây chờ tối đa (mặc định 60)
# dockerd kế thừa HTTPS_PROXY / NO_PROXY của shell hiện tại, nên pull image đi qua proxy của máy (nếu có).
set -euo pipefail

timeout_s="${GA_DOCKERD_TIMEOUT:-60}"
log="${GA_DOCKERD_LOG:-${TMPDIR:-/tmp}/ga-dockerd.log}"

say() { printf '%s\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  say "✗ Không thấy lệnh docker. Cài Docker Engine trước (https://docs.docker.com/engine/install/)."
  exit 1
fi

if docker info >/dev/null 2>&1; then
  say "✓ dockerd đã chạy ($(docker info --format '{{.ServerVersion}}'))"
  exit 0
fi

if ! command -v dockerd >/dev/null 2>&1; then
  say "✗ Docker CLI có nhưng không thấy dockerd, và không kết nối được daemon."
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  say "✗ dockerd chưa chạy và script cần quyền root để khởi nó. Chạy lại bằng: sudo -E bash scripts/dev-dockerd.sh"
  exit 1
fi

say "◐ Khởi dockerd (log: $log)"
# nohup + setsid: dockerd sống tiếp sau khi shell gọi script thoát.
nohup setsid dockerd >"$log" 2>&1 </dev/null &
pid=$!

waited=0
until docker info >/dev/null 2>&1; do
  if ! kill -0 "$pid" 2>/dev/null; then
    say "✗ dockerd thoát sớm. 20 dòng log cuối:"
    tail -n 20 "$log" || true
    exit 1
  fi
  if [ "$waited" -ge "$timeout_s" ]; then
    say "✗ Chờ dockerd quá ${timeout_s}s. 20 dòng log cuối:"
    tail -n 20 "$log" || true
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done

say "✓ dockerd sẵn sàng sau ${waited}s ($(docker info --format '{{.ServerVersion}}'), pid $pid)"
