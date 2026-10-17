#!/usr/bin/env bash
# pnpm docker:netcheck — kiểm Docker của máy hiện tại có đủ hình dạng mạng sản phẩm (BUILD-PLAN §B.1, §E.1):
#   1. tạo được network `internal: true`;   2. một container ở HAI network;
#   3. container chỉ ở mạng internal gọi được container kia qua mạng internal;
#   4. container chỉ ở mạng internal KHÔNG có route ra ngoài và không gọi được IP ngoài.
# Tự dọn container + network của chính nó khi xong.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/deploy/compose/compose.netcheck.yml")
cleanup() { "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { echo "✗ $*"; exit 1; }

"${COMPOSE[@]}" up -d --quiet-pull >/dev/null
app="$("${COMPOSE[@]}" ps -q app-probe)"
role="$("${COMPOSE[@]}" ps -q role-probe)"

internal="$(docker network inspect ga-netcheck_roles --format '{{.Internal}}')"
[ "$internal" = "true" ] || fail "network roles không phải internal (Internal=$internal)"
echo "✓ network ga-netcheck_roles: internal=true"

nets="$(docker inspect -f '{{len .NetworkSettings.Networks}}' "$app")"
[ "$nets" = "2" ] || fail "app-probe ở $nets network, cần 2"
echo "✓ app-probe ở 2 network: $(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$app")"

for _ in $(seq 1 20); do
  if docker exec "$role" wget -q -T 2 -O - http://app-probe:7410/ 2>/dev/null | grep -q ok; then reached=1; break; fi
  sleep 0.5
done
[ "${reached:-0}" = "1" ] || fail "role-probe không gọi được app-probe:7410 qua mạng roles"
echo "✓ role-probe → app-probe:7410 qua mạng internal: được"

if docker exec "$role" ip route | grep -q '^default'; then fail "role-probe có default route (mạng internal phải không ra ngoài)"; fi
if docker exec "$role" wget -q -T 3 -O /dev/null http://1.1.1.1/ 2>/dev/null; then fail "role-probe gọi được IP ngoài"; fi
echo "✓ role-probe: không có default route, không gọi được IP ngoài (1.1.1.1)"

docker exec "$app" ip route | grep -q '^default' || fail "app-probe thiếu default route qua mạng core"
echo "✓ app-probe có default route qua mạng core"
echo "✓ docker:netcheck: Docker $(docker info --format '{{.ServerVersion}}') đủ mạng internal + container hai mạng"
