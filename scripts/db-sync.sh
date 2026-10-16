#!/usr/bin/env bash
# Vendor DB spec từ Second-Brain THEO MỘT COMMIT (không bao giờ đọc working tree) — BUILD-PLAN §D.4, §C.4.
#
#   pnpm db:sync -- --rev <sha> [--sb <thư mục Second-Brain>]   chép file + ghi db/spec/SYNC.json
#   pnpm db:sync -- --check                                      kiểm sha256 file đã vendor khớp SYNC.json (CI dùng)
#   pnpm db:sync -- --check --verify-source [--sb <dir>]         + so từng file với `git show <rev>:<file>` của SB
#
# Sau khi sync: chạy `pnpm db:gen` (sinh lại migration + kiểu) rồi `pnpm db:test`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC="$ROOT/db/spec"
SRC_DIR="01-projects/gen-agents/spec/db-v2.2"
DB_MD="01-projects/gen-agents/spec/DATABASE.md"
FILES=(schema_v2_2.py schema_v2_2.sql views_v2_2.sql tests_v2_2.py)

rev="" sb="${GA_SB_DIR:-}" check=0 verify_source=0
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift ;;
    --rev) rev="${2:?--rev cần một commit}"; shift 2 ;;
    --sb) sb="${2:?--sb cần một thư mục}"; shift 2 ;;
    --check) check=1; shift ;;
    --verify-source) verify_source=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "✗ Tham số lạ: $1" >&2; exit 2 ;;
  esac
done

find_sb() {
  if [ -n "$sb" ]; then return 0; fi
  for d in "$ROOT/../Second-Brain" "$HOME/Second-Brain" /home/user/Second-Brain; do
    if [ -d "$d/.git" ]; then sb="$(cd "$d" && pwd)"; return 0; fi
  done
  echo "✗ Không tìm thấy checkout Second-Brain. Đặt GA_SB_DIR hoặc truyền --sb <dir>." >&2
  exit 2
}

if [ "$check" -eq 1 ]; then
  [ "$verify_source" -eq 1 ] && find_sb
  python3 -I - "$SPEC" "$verify_source" "$sb" <<'PY'
import hashlib, json, os, subprocess, sys
spec, verify, sb = sys.argv[1], sys.argv[2] == '1', sys.argv[3]
sync = json.load(open(os.path.join(spec, 'SYNC.json'), encoding='utf-8'))
bad = []
for name, meta in sorted(sync['files'].items()):
    path = os.path.join(spec, name)
    if not os.path.exists(path):
        bad.append(f'{name}: thiếu file'); continue
    got = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    if got != meta['sha256']:
        bad.append(f'{name}: sha256 {got[:12]}… ≠ SYNC.json {meta["sha256"][:12]}…')
    if verify:
        src = subprocess.run(['git', '-C', sb, 'show', f"{sync['rev']}:{meta['source']}"], capture_output=True, check=True).stdout
        if hashlib.sha256(src).hexdigest() != got:
            bad.append(f'{name}: khác bản ở Second-Brain {sync["rev"][:7]}:{meta["source"]}')
if bad:
    print('✗ db:sync --check: db/spec lệch SYNC.json (sửa tay file vendor là sai — chạy lại `pnpm db:sync -- --rev <sha>`):')
    for b in bad: print('  - ' + b)
    sys.exit(1)
src = ' + nguồn Second-Brain' if verify else ''
print(f"✓ db/spec khớp SYNC.json{src}: {len(sync['files'])} file, rev {sync['rev'][:7]}, DATABASE v{sync['database_version']}")
PY
  exit $?
fi

[ -n "$rev" ] || { echo "✗ Thiếu --rev <commit Second-Brain>" >&2; exit 2; }
find_sb
full="$(git -C "$sb" rev-parse --verify "${rev}^{commit}")"
echo "◐ Vendor DB spec từ $sb @ ${full:0:7} (git show, không đọc working tree)"
mkdir -p "$SPEC"
for f in "${FILES[@]}"; do
  git -C "$sb" show "$full:$SRC_DIR/$f" >"$SPEC/$f.tmp"
  mv "$SPEC/$f.tmp" "$SPEC/$f"
  echo "  ✓ $f"
done

python3 -I - "$SPEC" "$full" "$SRC_DIR" "$DB_MD" <(git -C "$sb" show "$full:$DB_MD") "${FILES[@]}" <<'PY'
import datetime, hashlib, json, os, re, sqlite3, subprocess, sys
spec, rev, src_dir, db_md, md_path = sys.argv[1:6]
files = sys.argv[6:]
md = open(md_path, 'rb').read()
m = re.search(rb'^# .*?\bv(\d+\.\d+\.\d+)', md, re.M)
if not m:
    sys.exit('✗ Không đọc được version trong tiêu đề DATABASE.md')
version = m.group(1).decode()
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
print(f"◐ Chạy bộ test Python của DB trên bản vừa vendor (ghi tổng vào SYNC.json)…", flush=True)
out = subprocess.run([sys.executable, '-B', '-I', os.path.join(spec, 'tests_v2_2.py')], capture_output=True, text=True).stdout
tm = re.findall(r'^TỔNG: (\d+) / (\d+) PASS — SQLite (\S+)', out, re.M)
if not tm:
    sys.exit('✗ Bộ test Python không in dòng TỔNG — không ghi SYNC.json')
passed, total, sqlite_ver = int(tm[-1][0]), int(tm[-1][1]), tm[-1][2]
sync = dict(
    source_repo='colamacbook-ryan/Second-Brain', rev=rev, source_dir=src_dir, database_version=version,
    database_md=dict(path=db_md, sha256=hashlib.sha256(md).hexdigest()),
    files={f: dict(source=f'{src_dir}/{f}', sha256=hashlib.sha256(open(os.path.join(spec, f), 'rb').read()).hexdigest()) for f in files},
    app_functions=app_fns, counts=counts,
    python_tests=dict(passed=passed, total=total, sqlite=sqlite_ver),
    synced_at=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
with open(os.path.join(spec, 'SYNC.json'), 'w', encoding='utf-8') as fh:
    json.dump(sync, fh, ensure_ascii=False, indent=2); fh.write('\n')
print(f"✓ SYNC.json: rev {rev[:7]}, DATABASE v{version}, hàm {app_fns}, {counts}, test Python {passed}/{total} (SQLite {sqlite_ver})")
if passed != total:
    sys.exit(f'✗ Bản vendor có {total - passed} test Python đỏ — kiểm lại commit nguồn')
PY
echo "→ Bước tiếp: pnpm db:gen && pnpm db:test"
