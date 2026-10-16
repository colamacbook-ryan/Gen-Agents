#!/usr/bin/env bash
# Cổng commit của lane (README "Cổng commit"):
#   scripts/gate-commit.sh (-m "<thông điệp>" | -F <tệp thông điệp>) [--] <tệp>...
# `git add` đúng các tệp được nêu, chạy cổng (lint → typecheck → test → sec:scan --staged) rồi mới commit.
#   - Index đang có tệp đã stage NGOÀI danh sách (checkout dùng chung) ⇒ dừng, không chạy cổng, không commit (thoát 2).
#   - Cổng đỏ ⇒ KHÔNG commit, tệp vẫn ở trạng thái đã stage (thoát 1).
# Không push (người gọi tự push sau khi xem SHA).
set -euo pipefail

msg=()
files=()
while [ $# -gt 0 ]; do
  case "$1" in
    -m) msg+=(-m "${2:?-m cần thông điệp}"); shift 2 ;;
    -F) msg+=(-F "${2:?-F cần tệp}"); shift 2 ;;
    --) shift; files+=("$@"); break ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    -*) echo "✗ tham số lạ: $1" >&2; exit 2 ;;
    *) files+=("$1"); shift ;;
  esac
done
[ ${#msg[@]} -gt 0 ] || { echo "✗ thiếu -m / -F" >&2; exit 2; }
[ ${#files[@]} -gt 0 ] || { echo "✗ thiếu danh sách tệp" >&2; exit 2; }

# tệp -F tương đối theo thư mục của người gọi ⇒ đổi sang tuyệt đối trước khi cd
for i in "${!msg[@]}"; do
  if [ "${msg[$i]}" = "-F" ]; then msg[$((i + 1))]="$(cd "$(dirname "${msg[$((i + 1))]}")" && pwd)/$(basename "${msg[$((i + 1))]}")"; fi
done
abs=()
for f in "${files[@]}"; do abs+=("$(cd "$(dirname "$f")" 2>/dev/null && pwd || echo "$PWD/$(dirname "$f")")/$(basename "$f")"); done

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
rel=()
for a in "${abs[@]}"; do rel+=("${a#"$ROOT"/}"); done

in_list() {
  local p="$1" f
  for f in "${rel[@]}"; do
    [ "$p" = "$f" ] && return 0
    case "$p" in "${f%/}"/*) return 0 ;; esac
  done
  return 1
}

extra=()
while IFS= read -r p; do [ -z "$p" ] || in_list "$p" || extra+=("$p"); done < <(git diff --cached --name-only)
if [ ${#extra[@]} -gt 0 ]; then
  echo "✗ index đã có tệp stage ngoài danh sách (không phải của lần commit này) — dừng:" >&2
  printf '    %s\n' "${extra[@]}" >&2
  exit 2
fi

for f in "${rel[@]}"; do git add -A -- "$f"; done
if git diff --cached --quiet; then
  echo "✗ không có thay đổi nào để commit" >&2
  exit 2
fi
echo "◐ cổng: lint → typecheck → test → sec:scan --staged ($(git diff --cached --name-only | wc -l | tr -d ' ') tệp)"
if pnpm lint && pnpm typecheck && pnpm test && pnpm sec:scan -- --staged; then
  git commit -q "${msg[@]}"
  echo "✓ $(git log --oneline -1)"
else
  echo "✗ cổng đỏ — KHÔNG commit (tệp vẫn ở trạng thái đã stage)" >&2
  exit 1
fi
