# -*- coding: utf-8 -*-
"""Mutation runner cho DB spec đã vendor (BUILD-PLAN §C.4, STD-11 "Mutation test"). Viết mới ở M0 — KHÔNG vendor từ SB.

Mỗi đột biến = DROP đúng MỘT trigger rồi chạy NGUYÊN VĂN bộ test Python của DB (tests_v2_2.py). Trigger có test bắt được
thì bộ test phải đỏ. Luật chống "đỏ giả" của STD-11:
  - LƯỢT ĐỐI CHỨNG không đột biến chạy trước và phải xanh (= tổng ghi trong SYNC.json); đỏ ⇒ dừng, không đọc kết quả;
  - mỗi lượt là MỘT TIẾN TRÌNH MỚI trên MỘT BẢN SAO MỚI của db/spec ⇒ đồng hồ giả (_CLOCK, _FAKE_NOW), RESULTS, cache schema
    và mọi biến toàn cục của bộ test được reset từ đầu, không cộng dồn qua các lượt;
  - kiểm trước khi chạy rằng đột biến đã áp đúng: DB dựng từ SQL đột biến có đúng (tổng − 1) trigger và thiếu đúng trigger đó;
  - in số trigger đã drop;
  - CHỈ tính "đỏ thật" khi bộ test chạy hết, in dòng TỔNG và có dòng FAIL của assert. Lượt vỡ vì exception (Traceback,
    IntegrityError, OperationalError…) hoặc quá giờ là "NGHI ĐỎ GIẢ": không tính là đã bắt, liệt kê để đọc và sửa
    (STD-11 1.11.0, L-20261016-31).

Dùng:
  python3 -B -I db/spec/mutate.py --sample 20 [--seed 20261016]   20 trigger chọn ngẫu nhiên tất định
  python3 -B -I db/spec/mutate.py --all                            mọi trigger (402 × ~25 s ≈ 45 phút với 4 tiến trình)
  python3 -B -I db/spec/mutate.py --changed [--base origin/main] [--max 60]   trigger có SQL khác bản ở <base>
  python3 -B -I db/spec/mutate.py --only telegram_allowlist_owner_d --only blobs_no_delete
Tuỳ chọn: --jobs N (mặc định min(4, số CPU)), --timeout giây mỗi lượt (600), --keep (giữ thư mục tạm),
  --baseline <json>: trigger sống ĐÃ BIẾT (đo bằng --all) chỉ báo "sống (đã biết)", không làm đỏ — chặn kiểu bánh cóc:
  trigger sống MỚI vẫn đỏ; trigger đã biết mà nay đỏ được báo để gỡ khỏi baseline. --write-baseline <json>: ghi danh sách sống.
Thoát 0 khi đối chứng xanh, không có đột biến sống (ngoài baseline) và không có lượt nghi đỏ giả; 1 khi có;
2 khi đối chứng đỏ / lỗi hạ tầng.
"""
import argparse, concurrent.futures, json, os, random, re, shutil, sqlite3, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = ['schema_v2_2.py', 'schema_v2_2.sql', 'views_v2_2.sql', 'tests_v2_2.py', 'gen_seed.py', 'seed_reference.json']   # v2.3.4: + seed tham chiếu (SEED-ref)
TOTAL_RE = re.compile(r'^TỔNG: (\d+) / (\d+) PASS', re.M)
FAIL_RE = re.compile(r'^FAIL (\S+)', re.M)


def triggers_of(sql):
    db = sqlite3.connect(':memory:')
    for fn, n in (('app_maint', 0), ('app_now', 0), ('app_local_time', 2)):
        db.create_function(fn, n, lambda *a: None)
    db.executescript(sql)
    return db.execute("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY rowid").fetchall()


def expected_total():
    try:
        with open(os.path.join(HERE, 'SYNC.json'), encoding='utf-8') as fh:
            return json.load(fh)['python_tests']['total']
    except (OSError, KeyError, ValueError):
        return None


def prepare(workdir, name, base_sql, drop=None):
    d = os.path.join(workdir, name)
    os.makedirs(d)
    for f in FILES:
        shutil.copyfile(os.path.join(HERE, f), os.path.join(d, f))
    if drop is not None:
        sql = base_sql + '\n-- mutate.py: đột biến\nDROP TRIGGER "%s";\n' % drop.replace('"', '""')
        with open(os.path.join(d, 'schema_v2_2.sql'), 'w', encoding='utf-8') as fh:
            fh.write(sql)
    return d


def run_suite(d, timeout):
    t0 = time.time()
    try:
        p = subprocess.run([sys.executable, '-B', '-I', 'tests_v2_2.py'], cwd=d, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return dict(kind='timeout', secs=time.time() - t0, fails=[], passed=None, total=None, code=None)
    m = TOTAL_RE.findall(p.stdout)
    fails = FAIL_RE.findall(p.stdout)
    if not m or p.returncode != 0:
        tail = (p.stderr or p.stdout).strip().splitlines()[-1:] or ['']
        return dict(kind='crash', secs=time.time() - t0, fails=fails, passed=None, total=None, code=p.returncode, tail=tail[0][:160])
    passed, total = int(m[-1][0]), int(m[-1][1])
    # đỏ thật = có dòng FAIL của assert; TỔNG < tổng mà không có dòng FAIL nào ⇒ không giải thích được ⇒ nghi đỏ giả
    kind = 'green' if passed == total else ('red' if fails else 'crash')
    return dict(kind=kind, secs=time.time() - t0, fails=fails, passed=passed, total=total, code=p.returncode,
                tail='' if kind != 'crash' else 'TỔNG < tổng nhưng không có dòng FAIL')


def select(args, trig):
    names = [n for n, _ in trig]
    if args.only:
        missing = [n for n in args.only if n not in names]
        if missing:
            sys.exit('✗ không có trigger: %s' % ', '.join(missing))
        return list(args.only), 'chỉ định'
    if args.all:
        return names, 'toàn bộ'
    if args.changed:
        try:
            base_sql = subprocess.run(['git', 'show', '%s:db/spec/schema_v2_2.sql' % args.base], cwd=HERE, capture_output=True,
                                      text=True, check=True).stdout
            old = dict(triggers_of(base_sql))
            changed = [n for n, s in trig if old.get(n) != s]
            how = 'đổi so với %s' % args.base
        except (subprocess.CalledProcessError, sqlite3.Error, OSError):
            changed, how = names, '%s không có schema (hoặc không đọc được) ⇒ coi mọi trigger là mới' % args.base
        if args.max and len(changed) > args.max:
            changed = sorted(random.Random(args.seed).sample(changed, args.max), key=names.index)
            how += '; chọn %d (--max, seed %d)' % (args.max, args.seed)
        return changed, how
    n = min(args.sample, len(names))
    return sorted(random.Random(args.seed).sample(names, n), key=names.index), 'mẫu %d, seed %d' % (n, args.seed)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--sample', type=int, default=20)
    g.add_argument('--all', action='store_true')
    g.add_argument('--changed', action='store_true')
    g.add_argument('--only', action='append')
    ap.add_argument('--base', default='origin/main')
    ap.add_argument('--max', type=int, default=0)
    ap.add_argument('--seed', type=int, default=20261016)
    ap.add_argument('--jobs', type=int, default=min(4, os.cpu_count() or 1))
    ap.add_argument('--timeout', type=int, default=600)
    ap.add_argument('--keep', action='store_true')
    ap.add_argument('--baseline')
    ap.add_argument('--write-baseline')
    args = ap.parse_args([a for a in sys.argv[1:] if a != '--'])

    with open(os.path.join(HERE, 'schema_v2_2.sql'), encoding='utf-8') as fh:
        base_sql = fh.read()
    trig = triggers_of(base_sql)
    chosen, how = select(args, trig)
    print('◐ %d trigger trong schema; đột biến: %d (%s); %d tiến trình' % (len(trig), len(chosen), how, args.jobs), flush=True)
    if not chosen:
        print('✓ MUTATION: không có trigger nào cần thử')
        return 0

    # kiểm đột biến áp đúng TRƯỚC khi chạy (không phát hiện ⇒ "đỏ" có thể là giả)
    base_names = {n for n, _ in trig}
    for name in chosen:
        after = {n for n, _ in triggers_of(base_sql + '\nDROP TRIGGER "%s";\n' % name.replace('"', '""'))}
        if len(after) != len(trig) - 1 or name in after or after != base_names - {name}:
            print('✗ đột biến %s không áp đúng (còn %d trigger)' % (name, len(after)))
            return 2

    workdir = tempfile.mkdtemp(prefix='ga-mutate-')
    try:
        want = expected_total()
        ctl = run_suite(prepare(workdir, 'control', base_sql), args.timeout)
        ok_ctl = ctl['kind'] == 'green' and (want is None or ctl['total'] == want)
        print('%s đối chứng (không đột biến): %s%s, %.0f s' % (
            '✓' if ok_ctl else '✗', '%s/%s PASS' % (ctl['passed'], ctl['total']) if ctl['total'] else ctl['kind'],
            '' if want is None else ' (SYNC.json: %d)' % want, ctl['secs']), flush=True)
        if not ok_ctl:
            print('✗ đối chứng đỏ ⇒ không đọc được kết quả mutation')
            return 2

        def one(i_name):
            i, name = i_name
            return name, run_suite(prepare(workdir, 'm%03d' % i, base_sql, drop=name), args.timeout)

        results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as ex:
            for name, r in ex.map(one, enumerate(chosen)):
                results[name] = r
                if r['kind'] == 'red':
                    print('  ĐỎ   %-48s %d FAIL: %s (%.0f s)' % (name, len(r['fails']), ', '.join(r['fails'][:3]), r['secs']), flush=True)
                elif r['kind'] == 'green':
                    print('  SỐNG %-48s bộ test vẫn %d/%d — thiếu ca âm cho trigger này' % (name, r['passed'], r['total']), flush=True)
                else:
                    print('  NGHI %-48s đỏ giả? %s%s (%.0f s) — đọc và sửa test / đột biến' % (
                        name, r['kind'], (' — ' + r.get('tail', '')) if r.get('tail') else '', r['secs']), flush=True)
        red = [n for n, r in results.items() if r['kind'] == 'red']
        crash = [n for n, r in results.items() if r['kind'] in ('crash', 'timeout')]
        alive = [n for n, r in results.items() if r['kind'] == 'green']
        known = set()
        if args.baseline:
            with open(args.baseline, encoding='utf-8') as fh:
                known = set(json.load(fh)['surviving'])
        new_alive = [n for n in alive if n not in known]
        healed = sorted(n for n in known if n in results and results[n]['kind'] != 'green')
        if args.write_baseline:
            with open(args.write_baseline, 'w', encoding='utf-8') as fh:
                json.dump(dict(comment='Trigger SỐNG khi DROP (bộ test DB không bắt) — đo bằng mutate.py; lane DB thêm ca âm rồi gỡ khỏi đây.',
                               rev=json.load(open(os.path.join(HERE, 'SYNC.json'), encoding='utf-8'))['rev'],
                               measured=len(chosen), surviving=sorted(alive)), fh, ensure_ascii=False, indent=2)
                fh.write('\n')
            print('✓ ghi %s: %d trigger sống / %d đã thử' % (args.write_baseline, len(alive), len(chosen)))
        print('%s MUTATION: %d/%d đỏ thật (qua dòng FAIL), nghi đỏ giả %d (exception / quá giờ — không tính), sống %d — '
              'đối chứng %d/%d xanh — đã drop %d trigger (mỗi lượt đúng 1, đã kiểm áp đúng; mỗi lượt tiến trình + bản sao '
              'mới ⇒ đồng hồ giả / biến toàn cục reset)' % (
                  '✓' if not alive and not crash else '✗', len(red), len(chosen), len(crash), len(alive),
                  ctl['passed'], ctl['total'], len(chosen)))
        if alive:
            print('  trigger sống: ' + ', '.join(alive))
        if crash:
            print('  nghi đỏ giả: ' + ', '.join(crash))
        if args.baseline:
            print('%s so với baseline (%d đã biết): sống MỚI %d%s; đã biết nay đỏ %d%s' % (
                '✓' if not new_alive else '✗', len(known), len(new_alive), (' — ' + ', '.join(new_alive)) if new_alive else '',
                len(healed), (' — gỡ khỏi baseline: ' + ', '.join(healed)) if healed else ''))
            return 0 if not new_alive and not crash else 1
        return 0 if not alive and not crash else 1
    finally:
        if args.keep:
            print('(giữ thư mục tạm: %s)' % workdir)
        else:
            shutil.rmtree(workdir, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
