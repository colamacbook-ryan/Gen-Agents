#!/usr/bin/env bash
# DB spec — NGUỒN = REPO (DB v2.3.4, STD-05 1.2.0 "chế độ gọn"): db/spec/ là nguồn DUY NHẤT của schema + test DB.
# Không còn vendor từ Second-Brain (cơ chế cũ: `--rev <sha>` chép theo commit SB — đã gỡ). SYNC.json nay là MANIFEST sinh từ chính db/spec:
# sha256 từng file, số đối tượng, hàm app_* mà schema gọi, tổng test Python — để db:gen / db:test / CI đọc một chỗ.
#
#   pnpm db:sync              sinh lại schema_v2_2.sql từ schema_v2_2.py + seed_reference.json từ gen_seed.py (rev = HEAD; nội dung không đổi ⇒
#                             giữ tệp cũ), chạy bộ test Python, ghi db/spec/SYNC.json
#   pnpm db:sync -- --check   (CI) schema_v2_2.sql + seed_reference.json TRÙNG BYTE đầu ra bộ sinh + sha256 file khớp SYNC.json
#                             (sửa spec mà quên chạy db:sync, hoặc sửa tay schema_v2_2.sql ⇒ đỏ)
#
# Sau khi sync: `pnpm db:gen` (migration + kiểu) rồi `pnpm db:test`. Phiên bản DB = mục đầu của db/spec/CHANGELOG.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC="$ROOT/db/spec"
FILES=(schema_v2_2.py schema_v2_2.sql views_v2_2.sql tests_v2_2.py gen_seed.py seed_reference.json)

check=0
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift ;;
    --check) check=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "✗ Tham số lạ: $1 (v2.3.4: không còn --rev / --sb — nguồn = repo)" >&2; exit 2 ;;
  esac
done

# generator phải tái tạo đúng schema_v2_2.sql (chạy trên bản sao để --check không ghi gì vào repo)
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp "$SPEC/schema_v2_2.py" "$SPEC/views_v2_2.sql" "$tmp/"
python3 -I "$tmp/schema_v2_2.py" >/dev/null

if [ "$check" -eq 1 ]; then
  python3 -B -I "$SPEC/gen_seed.py" --check
  python3 -I - "$SPEC" "$tmp/schema_v2_2.sql" <<'PY'
import hashlib, json, os, sys
spec, regen = sys.argv[1], sys.argv[2]
bad = []
if open(regen, 'rb').read() != open(os.path.join(spec, 'schema_v2_2.sql'), 'rb').read():
    bad.append('schema_v2_2.sql khác đầu ra của schema_v2_2.py (sửa generator rồi chạy `pnpm db:sync`, không sửa tay .sql)')
sync = json.load(open(os.path.join(spec, 'SYNC.json'), encoding='utf-8'))
for name, meta in sorted(sync['files'].items()):
    path = os.path.join(spec, name)
    if not os.path.exists(path):
        bad.append(f'{name}: thiếu file'); continue
    got = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    if got != meta['sha256']:
        bad.append(f'{name}: sha256 {got[:12]}… ≠ SYNC.json {meta["sha256"][:12]}… — chạy `pnpm db:sync` sau khi sửa db/spec')
if bad:
    print('✗ db:sync --check:')
    for b in bad: print('  - ' + b)
    sys.exit(1)
print(f"✓ db/spec (nguồn = repo): schema_v2_2.sql = đầu ra generator; {len(sync['files'])} file khớp SYNC.json; DATABASE v{sync['database_version']}")
PY
  exit $?
fi

cp "$tmp/schema_v2_2.sql" "$SPEC/schema_v2_2.sql"
echo "  ✓ schema_v2_2.sql sinh lại từ schema_v2_2.py"
version="$(sed -n 's/^## v\([0-9]*\.[0-9]*\.[0-9]*\).*/\1/p' "$SPEC/CHANGELOG.md" | head -n 1)"
python3 -B -I "$SPEC/gen_seed.py" --rev "$(git -C "$ROOT" rev-parse HEAD)" --version "$version"
python3 -I - "$SPEC" "${FILES[@]}" <<'PY'
import datetime, hashlib, json, os, re, sqlite3, subprocess, sys
spec, files = sys.argv[1], sys.argv[2:]
log = open(os.path.join(spec, 'CHANGELOG.md'), encoding='utf-8').read()
m = re.search(r'^## v(\d+\.\d+\.\d+)\b', log, re.M)
if not m:
    sys.exit('✗ Không đọc được phiên bản (mục "## vX.Y.Z" đầu tiên) trong db/spec/CHANGELOG.md')
version = m.group(1)
sql = open(os.path.join(spec, 'schema_v2_2.sql'), encoding='utf-8').read()
db = sqlite3.connect(':memory:')
db.executescript(sql)
q = lambda s: db.execute(s).fetchone()[0]
tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
# hàm app_* mà schema gọi = mọi tên app_xxx( trừ tên bảng (REFERENCES app_versions(...))
app_fns = sorted(set(re.findall(r'(?<![\w.])(app_[a-z_]+)\s*\(', sql)) - tables)
counts = dict(
    tables=q("SELECT count(*) FROM pragma_table_list WHERE schema='main' AND type='table' AND name NOT LIKE 'sqlite_%'"),
    virtual_tables=q("SELECT count(*) FROM pragma_table_list WHERE schema='main' AND type='virtual'"),
    indexes=q("SELECT count(*) FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"),
    triggers=q("SELECT count(*) FROM sqlite_master WHERE type='trigger'"),
    views=q("SELECT count(*) FROM sqlite_master WHERE type='view'"))
print("◐ Chạy bộ test Python của DB (ghi tổng vào SYNC.json)…", flush=True)
out = subprocess.run([sys.executable, '-B', '-I', os.path.join(spec, 'tests_v2_2.py')], capture_output=True, text=True).stdout
tm = re.findall(r'^TỔNG: (\d+) / (\d+) PASS — SQLite (\S+)', out, re.M)
if not tm:
    sys.exit('✗ Bộ test Python không in dòng TỔNG — không ghi SYNC.json')
passed, total, sqlite_ver = int(tm[-1][0]), int(tm[-1][1]), tm[-1][2]
if passed != total:
    sys.exit(f'✗ {total - passed} test Python đỏ — sửa trước khi ghi SYNC.json')
sync = dict(
    source='repo', rev='repo', source_dir='db/spec', database_version=version,
    files={f: dict(sha256=hashlib.sha256(open(os.path.join(spec, f), 'rb').read()).hexdigest()) for f in files},
    app_functions=app_fns, counts=counts,
    python_tests=dict(passed=passed, total=total, sqlite=sqlite_ver),
    synced_at=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
with open(os.path.join(spec, 'SYNC.json'), 'w', encoding='utf-8') as fh:
    json.dump(sync, fh, ensure_ascii=False, indent=2); fh.write('\n')
print(f"✓ SYNC.json (manifest, nguồn = repo): DATABASE v{version}, hàm {app_fns}, {counts}, test Python {passed}/{total} (SQLite {sqlite_ver})")
PY
echo "→ Bước tiếp: pnpm db:gen && pnpm db:test"
