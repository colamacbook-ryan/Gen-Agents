#!/usr/bin/env bash
# pnpm db:test — cổng DB (BUILD-PLAN §C.4, §E.1):
#   1. db/spec khớp SYNC.json (sha256) và migration + kiểu sinh khớp db/spec (`db:gen --check`);
#   2. bộ test Python của DB chạy NGUYÊN VĂN trên bản đã vendor: phải in `TỔNG: N / N PASS` với N = số ghi trong SYNC.json;
#      (bộ test không tự thoát mã lỗi khi có FAIL, nên script này đọc dòng TỔNG);
#   3. parity: DB dựng bằng runner TS ≡ DB do Python dựng (bảng, index, trigger, view).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

bash scripts/db-sync.sh --check
node packages/db/scripts/gen.ts --check

expected="$(python3 -I -c 'import json; print(json.load(open("db/spec/SYNC.json"))["python_tests"]["total"])')"
set +e
out="$(python3 -B -I db/spec/tests_v2_2.py)"
status=$?
set -e
printf '%s\n' "$out"
if [ "$status" -ne 0 ]; then
  echo "✗ bộ test Python thoát mã $status"
  exit 1
fi
total_line="$(printf '%s\n' "$out" | grep -E '^TỔNG: [0-9]+ / [0-9]+ PASS' | tail -n 1 || true)"
if [ -z "$total_line" ]; then
  echo "✗ bộ test Python không in dòng TỔNG"
  exit 1
fi
passed="$(printf '%s' "$total_line" | sed -E 's/^TỔNG: ([0-9]+) \/ ([0-9]+) PASS.*/\1/')"
total="$(printf '%s' "$total_line" | sed -E 's/^TỔNG: ([0-9]+) \/ ([0-9]+) PASS.*/\2/')"
if [ "$passed" != "$total" ]; then
  echo "✗ $((total - passed)) ca DB đỏ"
  exit 1
fi
if [ "$total" != "$expected" ]; then
  echo "✗ số ca DB = $total, SYNC.json ghi $expected (bộ test bị bớt / thêm ngoài db:sync?)"
  exit 1
fi

node packages/db/scripts/parity.ts
