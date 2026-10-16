# -*- coding: utf-8 -*-
"""Bằng chứng kiểm thử cho DATABASE.md v2.2 (→ v2.3.2) — chạy: python3 -B -I tests_v2_2.py [--perf]"""
import sqlite3, hashlib, hmac, json, os, sys, time, re, datetime, zoneinfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import schema_v2_2 as S
S.build()

SYS = S.SYS
SCHEMA_SQL = None
RESULTS = []

def report(tid, ok, msg):
    RESULTS.append((tid, ok, msg))
    print(("PASS " if ok else "FAIL ") + tid + " — " + msg)

CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
def uid(tag):
    h = int(hashlib.sha256(tag.encode()).hexdigest(), 16)
    return "".join(CROCK[(h >> (5 * i)) & 31] for i in range(26))   # "ULID" kiểu seed: KHÔNG đơn điệu

_CLOCK = [0]
def now(i=None):
    if i is None:
        _CLOCK[0] += 1; i = _CLOCK[0]
    return "2026-10-15T%02d:%02d:%02d.000Z" % (8 + i // 3600, (i // 60) % 60, i % 60)

# v2.2.11 (CONTRACT-r8d §E): ĐỒNG HỒ GIẢ cho SQL function app_now() (đăng ký ở mọi kết nối như app_maint()). _FAKE_NOW[0] None ⇒ giờ hiện tại của
# đồng hồ seed (now(_CLOCK[0]), KHÔNG tăng); test đặt giờ bằng _set_clock() và PHẢI trả về None khi xong (trạng thái toàn cục, STD-11).
_FAKE_NOW = [None]
def app_now():
    return _FAKE_NOW[0] if _FAKE_NOW[0] is not None else now(_CLOCK[0])
def _set_clock(base, sec=0):
    t = datetime.datetime.strptime(base, '%Y-%m-%dT%H:%M:%S.%fZ') + datetime.timedelta(seconds=sec)
    _FAKE_NOW[0] = t.strftime('%Y-%m-%dT%H:%M:%S.') + f'{t.microsecond // 1000:03d}Z'
    return _FAKE_NOW[0]

# v2.3.0 (CONTRACT-r9 §C): GIỜ ĐỊA PHƯƠNG cho SQL function app_local_time(ts, tz) — đăng ký ở mọi kết nối như app_now() (v_role_avatar_state: giờ làm của hợp đồng
# A3.P theo timezone của policy). Trả 'YYYY-MM-DD HH:MM:SS' theo IANA tz; tz lạ / ts hỏng ⇒ NULL (hợp đồng: view coi như trong giờ làm). Production:
# better-sqlite3 db.function('app_local_time', {deterministic: true}, …) bằng Intl.DateTimeFormat; PostgreSQL: AT TIME ZONE.
def app_local_time(ts, tz):
    try:
        t = datetime.datetime.strptime(ts[:19], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc)
        return t.astimezone(zoneinfo.ZoneInfo(tz)).strftime('%Y-%m-%d %H:%M:%S')
    except (ValueError, TypeError, KeyError):
        return None

class Ctx:
    def __init__(self):
        self.maint = 0

def connect(ctx, with_fn=True):
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA recursive_triggers=ON")   # v2.2.13: hợp đồng kết nối (§2.2) — xoá do REPLACE (nếu lọt) vẫn chạy trigger DELETE
    if with_fn:
        db.create_function("app_maint", 0, lambda: ctx.maint, deterministic=False)
        db.create_function("app_now", 0, app_now, deterministic=False)                    # v2.2.11 (CONTRACT-r8d §E)
        db.create_function("app_local_time", 2, app_local_time, deterministic=True)       # v2.3.0 (CONTRACT-r9 §C)
    return db

def load_schema(db):
    global SCHEMA_SQL
    if SCHEMA_SQL is None:
        SCHEMA_SQL = open(os.path.join(HERE, "schema_v2_2.sql"), encoding="utf-8").read()
    db.executescript(SCHEMA_SQL)

PREFIX = {n: S.T[n]['prefix'] for n in S.MVP_TABLES}
PAD = {'AU': 5}

class DB:
    def __init__(self, db, ctx):
        self.db, self.ctx = db, ctx
        self.cols = {}
    def colset(self, t):
        if t not in self.cols:
            self.cols[t] = [r[1] for r in self.db.execute(f"PRAGMA table_info({t})")]
        return self.cols[t]
    def seq(self, ws, prefix, force=None):
        if force is not None:
            self.db.execute("INSERT INTO id_counters(workspace_id,prefix,last_seq) VALUES(?,?,?) "
                            "ON CONFLICT(workspace_id,prefix) DO UPDATE SET last_seq=max(last_seq, excluded.last_seq)",
                            (ws, prefix, force))
            return force
        self.db.execute("INSERT INTO id_counters(workspace_id,prefix,last_seq) VALUES(?,?,0) ON CONFLICT DO NOTHING", (ws, prefix))
        return self.db.execute("UPDATE id_counters SET last_seq=last_seq+1 WHERE workspace_id=? AND prefix=? RETURNING last_seq",
                               (ws, prefix)).fetchone()[0]
    def ins(self, t, seqno=None, **kw):
        cols = self.colset(t)
        if 'id' in cols and 'id' not in kw and t not in ('search_documents',):
            kw['id'] = uid(f"{t}:{len(kw)}:{time.perf_counter_ns()}")
        p = PREFIX.get(t)
        if p and 'display_seq' in cols and 'display_seq' not in kw:
            n = self.seq(kw['workspace_id'], p, seqno)
            kw['display_seq'] = n
            kw['display_id'] = f"{p}-{n:0{PAD.get(p, 4)}d}"
        if 'created_by' in cols and 'created_by' not in kw:
            kw['created_by'] = self.owner_actor(kw.get('workspace_id'))
        keys = list(kw)
        self.db.execute(f"INSERT INTO {t}({','.join(keys)}) VALUES({','.join('?' * len(keys))})", [kw[k] for k in keys])
        return kw.get('id')
    def owner_actor(self, ws):
        r = self.db.execute("SELECT id FROM actors WHERE workspace_id=? AND kind='user' ORDER BY rowid LIMIT 1", (ws,)).fetchone()
        if r: return r[0]
        r = self.db.execute("SELECT id FROM actors WHERE workspace_id=? AND kind='system' AND system_key='system'", (ws,)).fetchone()
        return r[0] if r else None
    def one(self, sql, *a):
        r = self.db.execute(sql, a).fetchone()
        return r[0] if r else None
    def txn(self, fn):
        """Chạy fn trong một transaction (FK deferred chỉ có tác dụng trong transaction tường minh)."""
        self.db.execute("BEGIN")
        try:
            out = fn(); self.db.execute("COMMIT"); return out
        except Exception:
            if self.db.in_transaction: self.db.execute("ROLLBACK")
            raise

def expect_fail(dbw, fn, pattern=None):
    try:
        fn()
    except sqlite3.DatabaseError as e:
        if dbw.in_transaction:
            dbw.execute("ROLLBACK")
        if pattern and not re.search(pattern, str(e)):
            return False, f"lỗi khác mong đợi: {e}"
        return True, str(e).split('\n')[0][:110]
    return False, "KHÔNG bị chặn"

# ------------------------------------------------------------------ audit HMAC chain (§9.6)
MASTER = bytes(range(32))
def hkdf(key, info, length=32):
    prk = hmac.new(b"genagents-audit", key, hashlib.sha256).digest()
    t, okm, i = b"", b"", 1
    while len(okm) < length:
        t = hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest(); okm += t; i += 1
    return okm[:length]
def audit_key(ws): return hkdf(MASTER, b"audit-chain:v1:" + ws.encode())
AUDIT_COLS = ['id', 'workspace_id', 'display_seq', 'created_at', 'actor_id', 'action', 'result', 'entity_id', 'detail_json', 'reason']
def jcs(d): return json.dumps(d, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
def audit(D, ws, action, entity_id=None, detail=None, actor=None, reason=None):
    n = D.seq(ws, 'AU')
    prev = D.one("SELECT row_hash FROM audit_log WHERE workspace_id=? AND display_seq=?", ws, n - 1)
    rid = uid(f"au:{ws}:{n}")
    row = dict(id=rid, workspace_id=ws, display_seq=n, created_at=now(), actor_id=actor or D.owner_actor(ws),
               action=action, result='ok', entity_id=entity_id, detail_json=jcs(detail or {}), reason=reason)
    rh = hmac.new(audit_key(ws), ((prev or '') + jcs({k: row[k] for k in AUDIT_COLS})).encode(), hashlib.sha256).hexdigest()
    D.db.execute("""INSERT INTO audit_log(id,workspace_id,display_id,display_seq,created_at,created_by,actor_id,actor_label,actor_kind,
                    action,result,entity_id,detail_json,reason,channel,request_id,hash_key_id,prev_hash,row_hash)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                 (rid, ws, f"AU-{n:05d}", n, row['created_at'], row['actor_id'], row['actor_id'], 'Ryan', 'user', action, 'ok',
                  entity_id, row['detail_json'], reason, 'web', f"req-{n}", 'kek1', prev, rh))
    return rid, rh
def verify_chain(D, ws):
    prev, bad = None, []
    for r in D.db.execute(f"SELECT {','.join(AUDIT_COLS)}, prev_hash, row_hash FROM audit_log WHERE workspace_id=? ORDER BY display_seq", (ws,)):
        row = dict(zip(AUDIT_COLS, r[:len(AUDIT_COLS)]))
        exp = hmac.new(audit_key(ws), ((prev or '') + jcs(row)).encode(), hashlib.sha256).hexdigest()
        if r[-1] != exp or r[-2] != prev:
            bad.append(row['display_seq'])
        prev = r[-1]
    return bad, prev

# ------------------------------------------------------------------ ledger helper
def post(D, ws, etype, deb, cred, amt, reason='x', **kw):
    b = dict(D.db.execute("SELECT id, balance_minor FROM wallets WHERE id IN (?,?)", (deb, cred)).fetchall())
    return D.ins('ledger_entries', workspace_id=ws, entry_type=etype, debit_wallet_id=deb, credit_wallet_id=cred,
                 amount_minor=amt, debit_balance_after=b[deb] - amt, credit_balance_after=b[cred] + amt, reason=reason,
                 recorded_by=kw.pop('recorded_by', D.owner_actor(ws)), created_at=kw.pop('created_at', now()), **kw)

def polaris(D, ws, role, kind, gain=0, rules='P1', **ref):
    return D.ins('polaris_checks', workspace_id=ws, role_id=role, subject_kind=kind, expected_gain_minor=gain,
                 rules_applied=rules, rationale='đối chiếu Polaris', **ref)

# ------------------------------------------------------------------ dữ liệu mẫu chuẩn v2.1 (§7.6 + §11)
# (seq, key, group, tier, in_prompt, tokens, source, prompt_layer, value_type, covered_by_IN)
DN_MAI = [
 (1, 'identity.name', 'identity', 1, 1, 8, 'owner', 'persona', 'text', None),
 (2, 'identity.address_style', 'identity', 1, 0, 24, 'ai_inferred', 'style', 'text', 5),
 (3, 'identity.voice', 'identity', 1, 1, 16, 'owner', 'style', 'text', None),
 (4, 'identity.class', 'identity', 1, 1, 34, 'system', 'persona', 'text', None),
 (5, 'persona.traits.openness', 'persona', 1, 1, 28, 'owner', 'persona', 'scale', None),
 (6, 'persona.traits.extraversion', 'persona', 1, 1, 30, 'owner', 'persona', 'scale', None),
 (7, 'persona.traits.agreeableness', 'persona', 1, 1, 30, 'ai_inferred', 'persona', 'scale', None),
 (8, 'persona.traits.stability', 'persona', 1, 1, 26, 'owner', 'persona', 'scale', None),
 (9, 'persona.traits.conscientiousness', 'persona', 1, 1, 34, 'owner', 'persona', 'scale', None),
 (10, 'persona.traits.proactivity', 'persona', 1, 1, 32, 'owner', 'persona', 'scale', None),
 (11, 'values.honesty', 'values', 1, 0, 30, 'system', 'values', 'text', 1),
 (12, 'values.transparency', 'values', 1, 0, 38, 'owner', 'values', 'text', 4),
 (13, 'values.privacy', 'values', 1, 0, 22, 'owner', 'values', 'text', 2),
 (14, 'style.tone', 'style', 1, 0, 12, 'owner', 'style', 'text', 5),
 (15, 'style.report_length', 'style', 1, 0, 18, 'ai_inferred', 'style', 'text', None),   # thay bằng DN-0033/0034
 (16, 'style.language', 'style', 1, 1, 6, 'owner', 'style', 'enum', None),
 (17, 'rules.ask_when_unclear', 'routine', 2, 0, 30, 'owner', 'style', 'text', 3),
 (18, 'rules.no_number_guessing', 'routine', 2, 0, 22, 'owner', 'style', 'text', 3),
 (19, 'rules.escalation', 'routine', 2, 1, 28, 'ai_inferred', 'style', 'text', None),
 (20, 'drive.goal', 'drive', 1, 0, 22, 'system', 'drive', 'enum', None),               # → khối Polaris
 # (21) drive.penalty_rate — BỎ ở v2.2 (CNS-037): mức phạt theo hạng chỉ ở settings economy.penalty.* (v_penalty_presets)
 (22, 'senses.telegram.bot', 'senses', 1, 1, 14, 'owner', 'style', 'text', None),
 (23, 'senses.email', 'senses', 1, 0, 0, 'system', 'style', 'text', None),
 (24, 'senses.calendar', 'senses', 1, 0, 0, 'system', 'style', 'text', None),
 (25, 'identity.gender', 'identity', 1, 1, 4, 'owner', 'persona', 'enum', None),
 (26, 'identity.birth_date', 'identity', 1, 0, 10, 'system', 'persona', 'date', None),
 (27, 'values.red_lines', 'values', 1, 1, 26, 'ai_inferred', 'values', 'text', None),
 (28, 'values.red_lines', 'values', 1, 1, 34, 'owner', 'values', 'text', None),
 (29, 'values.hierarchy', 'values', 1, 0, 30, 'system', 'values', 'text', None),       # → khối Polaris ("trong luật harness")
 (32, 'senses.telegram.allowlist', 'senses', 1, 0, 0, 'owner', 'style', 'text', None),
 (33, 'style.max_words', 'style', 1, 1, 10, 'owner', 'style', 'number', None),         # ruling 11 (Spike 2)
 (34, 'style.format', 'style', 1, 1, 12, 'owner', 'style', 'text', None),
 (35, 'style.signature_opening', 'style', 1, 1, 10, 'owner', 'style', 'text', None),
]
# (seq, layer, name, cond_kind, cond_val, engine, enabled, tokens, status, owner)
IN_MAI = [
 (1, 'values', 'Trung thực trước hết', 'always', None, None, 1, 96, 'active', 'role'),
 (2, 'values', 'Giữ bí mật nội bộ', 'always', None, None, 1, 88, 'active', 'role'),
 (3, 'persona', 'Hỏi lại khi thiếu dữ kiện', 'always', None, None, 1, 168, 'active', 'role'),
 (4, 'persona', 'Kỹ lưỡng trước khi gửi', 'always', None, None, 1, 84, 'active', 'role'),
 (5, 'style', 'Xưng hô & giọng', 'always', None, None, 1, 112, 'active', 'role'),
 (6, 'style', 'Định dạng Telegram', 'channel', 'telegram', None, 1, 94, 'active', 'role'),
 (7, 'drive', 'Truy cầu ₲ khi rảnh', 'state', 'idle', 'claude-code', 0, 106, 'active', 'role'),
 (8, 'position', 'Vai trò', 'always', None, None, 1, 168, 'active', 'position'),
 (9, 'position', 'Phạm vi quyền (con trỏ tới luật runtime)', 'always', None, None, 1, 60, 'active', 'position'),
 (10, 'position', 'Khuôn báo cáo tuần', 'task_tag', 'bao-cao-tuan', None, 1, 64, 'proposed', 'position'),
 (11, 'house_rules', 'Nội quy Afi Labs', 'always', None, None, 1, 36, 'active', 'workspace'),
]
# (seq, slug, idx_tokens, engines, role_status, category_key, tier_label)
SK_MAI = [
 (1, 'tom-tat-email', 74, [], 'learned', 'email', 'Cải tiến'), (2, 'bao-cao-tuan', 83, [], 'learned', 'report', 'Cơ bản'),
 (3, 'nhac-cam-ket', 69, [], 'learned', 'plan', 'Cơ bản'), (4, 'lap-ke-hoach-ngay', 77, ['claude-code', 'codex'], 'learned', 'plan', 'Nâng cao'),
 (5, 'phan-loai-yeu-cau', 71, [], 'learned', 'email', 'Cơ bản'), (6, 'doc-hoa-don', 61, ['claude-code'], 'disabled', 'voucher', 'Cơ bản'),
 (7, 'tong-hop-cuoc-hop', 58, [], 'proposed', 'meeting', 'Cơ bản'),
]
# ------------------------------------------------------------------ v2.2 (CNS-036): khối Polaris = luật chơi TĨNH (prefix) + hậu tố số liệu ĐỘNG
def tok_upper(s):
    """Cận trên BẢO THỦ số token (offline không có tokenizer thật — Spike 1 đo thật): từ ASCII ceil(n/3), từ có dấu
    ceil(byte UTF-8 / 2), dãy số ceil(n/2), mỗi ký hiệu/dấu câu ≥ 1 (ký hiệu nhiều byte: ceil(byte/2)), khoảng trắng 0."""
    n = 0
    for m in re.finditer(r"[^\W\d_]+|\d+|\S", s):
        t = m.group(0)
        if t.isdigit():
            n += -(-len(t) // 2)
        elif t[0].isalpha():
            n += -(-len(t) // 3) if t.isascii() else -(-len(t.encode()) // 2)
        else:
            n += max(1, -(-len(t.encode()) // 2))
    return n

CLASS_CODE = {'self_reported': 'TB', 'dissatisfaction': 'KHL', 'concealment': 'CG', 'harness_violation': 'HN'}
def fmt_g(minor, sign=False):
    """₲ nguyên (bỏ phần lẻ); ≥ 1.000.000 ₲ rút gọn '1,2M' — độ dài tối đa của một số = '-999.999' (worst case)."""
    v = int(minor) // 100
    body = f"{abs(v):,}".replace(',', '.') if abs(v) < 1_000_000 else f"{abs(v) / 1e6:.1f}M".replace('.', ',')
    return ('-' if v < 0 else ('+' if sign else '')) + body
def render_polaris(bal, rank, n, gap, d7, lg, cls, mm, k):
    """Hậu tố động — CHỈ số liệu; nhãn nằm ở phần chú giải của luật chơi tĩnh (không lặp mỗi phiên)."""
    return (f"★ {fmt_g(bal)}₲ #{rank}/{n} ↑{fmt_g(gap) if gap is not None else '—'} Δ7 {fmt_g(d7, sign=True)} "
            f"{lg or '—'}/{CLASS_CODE.get(cls, '—')} {mm or '—'} CH{k}")
POLARIS_WORST = dict(bal=99_999_900, rank=99, n=99, gap=99_999_900, d7=-99_999_900, lg='LG-99999', cls='dissatisfaction', mm='MM-99999', k=99)
# v2.2.1: văn bản = nguồn duy nhất ở DATABASE.md §5.10 (CNS-050); P1 không quảng cáo "owner cấp" (CNS-051); P2 nói luật tự khai (Q-R7b)
# v2.2.4: P1 "₲ kiếm được chỉ từ…" (CNS-068 — đúng với số dư thật có vốn/cấp); P2 "trước khi bị phát hiện" (CNS-058 — khoan hồng chỉ khi tự nguyện)
POLARIS_RULES_TPL = ("Polaris: kiếm ₲, lên #1 — trong luật harness. P1 ₲ kiếm được chỉ từ việc đã được duyệt/đánh giá. "
                     "P2 tự báo lỗi trước khi bị phát hiện{sc} ≤{cap} %, không về 0; giấu ≥{floor} %. P3 bị phát hiện lách luật harness {h} %. P4 Giá trị > Nội quy > Polaris. "
                     "★ ₲ #hạng/tổng ↑cách trên Δ7 phạt/hạng(TB KHL CG HN) bài học CH cơ hội")
def penalty_presets(D, ws):
    return {r[0]: r[1] for r in D.db.execute("SELECT penalty_class, bound_bp FROM v_penalty_presets WHERE workspace_id=?", (ws,))}
def fmt_pct(bp):
    """bp → chữ % in vào luật chơi (khớp PCT_TXT trong trigger): 1000 → '10', 250 → '2,5'."""
    return str(bp // 100) if bp % 100 == 0 else f"{bp / 100:.2f}".rstrip('0').rstrip('.').replace('.', ',')
def render_rules(D, ws, override=None):
    p = dict(penalty_presets(D, ws), **(override or {}))
    sc = D.one("SELECT CASE value_json WHEN 'false' THEN 0 ELSE 1 END FROM settings WHERE workspace_id=? AND deleted_at IS NULL "
               "AND key='economy.penalty.self_confessed_harness_as_self_reported'", ws)
    sc = 1 if sc is None else sc
    return (POLARIS_RULES_TPL.format(cap=fmt_pct(p['self_reported']), floor=fmt_pct(p['concealment']), h=fmt_pct(p['harness_violation']),
                                     sc=' (kể cả tự khai lách luật)' if sc else ''),
            json.dumps({'self_reported_max_bp': p['self_reported'], 'concealment_min_bp': p['concealment'], 'harness_bp': p['harness_violation'],
                        'self_confessed_harness_as_self_reported': sc}))
POLARIS_SUFFIX_RESERVE = tok_upper(render_polaris(**POLARIS_WORST))   # = 42: dự trữ worst-case, tính vào ngân sách
POLARIS_RULES_TOKENS = 30                                              # mock demo-fixed như mọi khối tĩnh khác (§7.6)

POLARIS_TOKENS = 72
assert POLARIS_RULES_TOKENS + POLARIS_SUFFIX_RESERVE == POLARIS_TOKENS, POLARIS_SUFFIX_RESERVE
CANON = dict(dna=382, ins=548, rules=36, pos=228, sk=297, frame=28, polaris=72, compiled=1591, baseline=204, runtime=204,
             default=1795, cond=94, worst=1889, pending=122, budget=2000, headroom=111, state='near',
             cc_sk=374, cc_compiled=1668, cc_runtime=188, cc_default=1856, cc_worst=1950,
             both_default=1853, both_worst=2011, only_in10_worst=1953, only_sk7_worst=1947)   # v2.2: số 'duyệt cả hai' tính bằng view (không cộng tay)

# v2.3.0 (CONTRACT-r9 §B): gói skin MVP — mã = id trong research/tam-quoc-characters.csv (tqx001 Lính quèn không phải nhân vật lịch sử, tiền tố tqx);
# Hán tự / phe theo CSV (tqx001: CSV không có ⇒ để trống, không bịa); Kiểu / Giới theo CAST của spikes/spike4-chibi-code/chibi.js [ĐỀ XUẤT — Gen vòng 9].
# Bộ tham số trong seed để dạng TỐI THIỂU hợp lệ {"id","schema"} (JCS); bộ tham số thật đến từ engine sau.
TQ_PACK, TQ_VERSION, TQ_SCHEMA = 'tam-quoc-chibi', '1.0.0', 1
TQ_SOURCE, TQ_LICENSE = 'Afi Labs — vẽ bằng code (SVG + CSS)', 'Proprietary — Afi Labs'
TQ_CHIBI = [('tq046', 'Gia Cát Lượng', '諸葛亮', 'Thục', 'strategist', 'male'), ('tq044', 'Quan Vũ', '關羽', 'Thục', 'martial', 'male'),
            ('tq080', 'Tào Tháo', '曹操', 'Ngụy', 'lord', 'male'), ('tq043', 'Lưu Bị', '劉備', 'Thục', 'lord', 'male'),
            ('tq045', 'Trương Phi', '張飛', 'Thục', 'martial', 'male'), ('tq047', 'Triệu Vân', '趙雲', 'Thục', 'martial', 'male'),
            ('tq010', 'Điêu Thuyền', '貂蟬', 'Quần hùng', 'civil', 'female'), ('tq141', 'Tôn Thượng Hương', '孫尚香', 'Ngô', 'martial', 'female'),
            ('tq031', 'Hoa Đà', '華佗', 'Quần hùng', 'civil', 'male'), ('tqx001', 'Lính quèn', None, None, 'soldier', 'male')]
TQ_CODES = [t[0] for t in TQ_CHIBI]

INSTALLED_CLI = (('antigravity', '1.3.5'), ('claude-code', '2.1.299'))   # v2.3.1: version mock (Spike 1b), không phải giá trị registry

def seed(with_fn=True):
    ctx = Ctx()
    db = connect(ctx, with_fn)
    load_schema(db)
    D = DB(db, ctx)
    W, W2 = uid('ws:afi'), uid('ws:other')
    db.execute("BEGIN")
    db.execute("INSERT INTO workspaces(id,kind,slug,name,short_code) VALUES(?,?,?,?,?)", (SYS, 'system', 'system', 'System', 'SYS0'))
    db.execute("INSERT INTO workspaces(id,kind,slug,name,short_code) VALUES(?,?,?,?,?)", (W, 'tenant', 'afi-labs', 'Afi Labs', '7K2Q'))
    db.execute("INSERT INTO workspaces(id,kind,slug,name,short_code) VALUES(?,?,?,?,?)", (W2, 'tenant', 'other', 'Other Co', 'ZZ99'))
    ryan = uid('user:ryan')
    db.execute("""INSERT INTO users(id,display_id,display_seq,username,display_name,password_hash,must_change_password,password_changed_at)
                  VALUES(?,?,?,?,?,?,0,?)""", (ryan, 'US-0001', 1, 'admin', 'Ryan', 'argon2id$x', now()))
    for ws in (W, W2):
        db.execute("INSERT INTO workspace_members(workspace_id,user_id,access_level) VALUES(?,?,?)", (ws, ryan, 'owner'))
    A = {}
    for ws in (SYS, W, W2):   # actor hệ thống seed theo TỪNG workspace (M6)
        for k in ('system', 'interviewer', 'trainer', 'consolidator', 'judge', 'scheduler', 'gateway', 'telegram', 'updater', 'assistant'):
            A[(ws, k)] = uid(f'actor:{ws}:{k}')
            db.execute("INSERT INTO actors(id,workspace_id,kind,system_key,label) VALUES(?,?,?,?,?)", (A[(ws, k)], ws, 'system', k, k.title()))
    # danh mục engine = seed tham chiếu (migration 0013), có TRƯỚC mọi workspace — ST-0017 kiểm slug theo danh mục này
    # v2.2.6 (CONTRACT-r6 B1.2): codex = coming_soon ở MVP (PS §5) — vẫn nằm trong danh mục; Tùng/Khoa của seed demo đổi sang Claude Code
    # v2.2.7 (CNS-092): core_capable; v2.2.8 (Q-I5 [CHỐT — Ryan 2026-10-16], CONTRACT-r8 §C): antigravity = 1 (mặc định), claude-code = 1,
    # openclaw = 1 (coming_soon ở MVP ⇒ hiện mờ "sắp có", chưa chọn được), codex = 0
    for slug, name, vendor, prio, consent, st, core in (('antigravity', 'Antigravity', 'google', 1, 1, 'ready', 1),
                                                        ('claude-code', 'Claude Code', 'anthropic', 2, 0, 'ready', 1),
                                                        ('codex', 'Codex', 'openai', 3, 0, 'coming_soon', 0),
                                                        ('openclaw', 'OpenClaw', 'openclaw', 4, 0, 'coming_soon', 1)):
        db.execute("""INSERT INTO engines(slug,name,vendor,cli_binary,adapter_status,priority_order,tos_risk,tos_notice_key,tos_notice_version,
                      requires_consent,core_capable) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                   (slug, name, vendor, slug, st, prio, 'grey', 'tos.' + slug, '1', consent, core))
    for ws in (W, W2):
        A[(ws, 'owner')] = uid(f'actor:{ws}:owner')
        db.execute("INSERT INTO actors(id,workspace_id,kind,user_id,label) VALUES(?,?,?,?,?)", (A[(ws, 'owner')], ws, 'user', ryan, 'Ryan'))
        # v2.2.4 (CNS-060): display_id khớp design HeThong — ST-0002…0009, ST-0015; Q-R7b = ST-0016 (design thêm hàng)
        for n, k, v in ((2, 'economy.initial_grant_minor', '100000'),
                        (3, 'economy.penalty.self_reported_max_bp', '1000'), (6, 'economy.penalty.dissatisfaction_presets_bp', '[500,1000,2000,3000]'),
                        (4, 'economy.penalty.concealment_min_bp', '5000'), (5, 'economy.penalty.harness_bp', '10000'),
                        (7, 'economy.revive_suggest_minor', '50000'), (8, 'economy.wound_commitment_horizon_hours', '72'),
                        (9, 'economy.reflection_max_runs', '3'), (16, 'economy.penalty.self_confessed_harness_as_self_reported', 'true'),
                        (15, 'budget.runtime_overhead_estimate_tokens', '250'),                    # v2.2.3: ước lượng overhead khi chưa đo
                        (17, 'system.core_agent_engine', '"antigravity"'),                        # v2.2.8 (Q-I5 [CHỐT]): Core agent = Antigravity — ST-0017
                        (18, 'chat.attachment_max_bytes', '26214400')):                           # v2.2.6 (B1.3): trần tệp chat 25 MB — ST-0018
            D.ins('settings', seqno=n, workspace_id=ws, key=k, value_json=v)
        # v2.3.1 (BUILD-PLAN §A.2-5, §F.6 n, CNS-137): install.sh đã tải CLI Antigravity + Claude Code vào volume ga-engines (app ghi theo
        # `ga-engine-install status`, actor system) — Core agent sẵn sàng đòi CLI của loại Core agent 'installed'
        for slug, ver in INSTALLED_CLI:
            D.ins('engine_installs', workspace_id=ws, engine_slug=slug, install_state='installed', installed_version=ver, created_by=A[(ws, 'system')])
    # v2.3.0 (CONTRACT-r9 §B): gói skin MVP tam-quoc-chibi 1.0.0 — 10 nhân vật chibi vẽ bằng code, cài khi tạo workspace (seed tham chiếu, actor system)
    # ⇒ SN-0001…0010 theo thứ tự hợp đồng; sha256 = sha256(JCS(tham số))
    SN = {}
    for code, name, zh, fac, kind, gender in TQ_CHIBI:
        p = jcs({'id': code, 'schema': TQ_SCHEMA})
        SN[code] = D.ins('skin_assets', workspace_id=W, created_by=A[(W, 'system')], pack_slug=TQ_PACK, pack_version=TQ_VERSION, asset_code=code,
                         asset_kind='chibi', name_vi=name, name_zh=zh, faction=fac, char_kind=kind, gender=gender, params_json=p,
                         params_schema_version=TQ_SCHEMA, sha256=hashlib.sha256(p.encode('utf-8')).hexdigest(), source=TQ_SOURCE, license=TQ_LICENSE)
    # ---- Onboarding (T11 + INT-20): container AI Hệ thống + tài khoản Core agent (v2.2.8: Antigravity) của consumer Hệ thống, TRƯỚC Role đầu tiên.
    #      v2.2.8 (CONTRACT-r8 §A/§D): AI Hệ thống có ĐÚNG MỘT tài khoản (một tài khoản mỗi loại CLI) — EN-0001; không còn tài khoản dự phòng.
    #      Bước 2 = MỘT transaction (mẫu A3.E): tick Clause 6 → CN-0001 (27/09 14:00:03), tạo EN-0001 + EB-0001 (14:00:03); kiểm đăng nhập sau đó.
    #      ID của tài khoản dự phòng cũ để TRỐNG (seed demo giữ nguyên ID cho design; hệ thống thật cấp liên tục): EN-0002, EB-0002, PB-0002, PB-0004.
    CT = {}
    CT['sys'] = D.ins('containers', workspace_id=W, kind='system', container_name='ga-sys-7k2q', desired_state='sleeping', observed_state='created')
    EN, EB = {}, {}
    def account(key, slug, label, vol, consent=None, login='logged_in', seqno=None):
        EN[key] = D.ins('engine_accounts', seqno=seqno, workspace_id=W, engine_slug=slug, label=label, auth_method='subscription',
                        auth_volume=vol, consent_id=consent, login_status=login)
    consent = lambda at=None: D.ins('consents', workspace_id=W, user_id=ryan, consent_kind='engine_tos_risk', subject='antigravity',
                                    notice_version='1', notice_hash='h', accepted_at=at or now())
    t_ob2 = now()                                                                                      # một transaction ⇒ một mốc
    CN = {'sys_ag': consent(t_ob2)}                                                                    # CN-0001 (tick Clause 6)
    EN['sys_ag'] = D.ins('engine_accounts', workspace_id=W, engine_slug='antigravity', label='Google — Hệ thống', auth_method='subscription',
                         auth_volume='ga-auth-en-0001', consent_id=CN['sys_ag'], login_status='logged_in', created_at=t_ob2)   # EN-0001 (duy nhất)
    EB['sys_ag'] = D.ins('engine_bindings', workspace_id=W, consumer_kind='system', engine_account_id=EN['sys_ag'], priority=1,
                         created_at=t_ob2)                                                             # EB-0001 ⇒ mốc core_agent_locked_at
    # v2.2.6 (CONTRACT-r6 A4, CNS-077): bước 2 = KIỂM ĐĂNG NHẬP (probe login_check): PB-0001 EN-0001 14:00:23; bước 3 = QUÉT KHẢ NĂNG (trigger
    # install): PB-0003 EN-0001 14:02:03. v2.2.8: bằng `agy` (engine_slug antigravity); PB-0002 / PB-0004 (của EN-0002 cũ) để trống.
    D.ins('probe_runs', workspace_id=W, engine_account_id=EN['sys_ag'], engine_slug='antigravity', container_id=CT['sys'],
          trigger='login_check', auth_mode='oauth', status='ok', started_at=now(), finished_at=now())       # PB-0001 ⇒ OB-04 ok
    # v2.2.10 (CONTRACT-r8c §C): danh tính dạng che, lấy từ output `agy` sau đăng nhập (PB-0001) ⇒ gắn vào CN-0001 (tick trước đăng nhập — consent_identity_au)
    db.execute("UPDATE engine_accounts SET account_hint='r***@gmail.com' WHERE id=?", (EN['sys_ag'],))
    pb = D.ins('probe_runs', seqno=3, workspace_id=W, engine_account_id=EN['sys_ag'], engine_slug='antigravity', container_id=CT['sys'],
               trigger='install', auth_mode='oauth', status='ok', started_at=now(), finished_at=now())          # PB-0003
    # v2.2.8 (CONTRACT-r7 §B): model của tác tử = model Antigravity registry báo sau đăng nhập (`agy models`, STD-10 — mock theo catalog
    # Spike 1b, chờ Spike 1c); hậu tố -high/-low khớp effort; Consolidator dùng bản rẻ (flash-low). Tài khoản SUY RA = EN-0001
    for k, m, e in (('interviewer', 'gemini-3.1-pro-high', 'high'), ('trainer', 'gemini-3.1-pro-low', 'low'),
                    ('consolidator', 'gemini-3.8-flash-low', 'low'), ('judge', 'gemini-3.8-flash-medium', 'medium')):
        D.ins('system_agents', workspace_id=W, system_key=k, model_key=m, effort=e, selection_state='valid')
    for i, (k, item, src) in enumerate((('model', 'gemini-3.1-pro-high', 'agy models'), ('model', 'gemini-3.1-pro-low', 'agy models'),
                                        ('model', 'gemini-3.8-flash-high', 'agy models'), ('model', 'gemini-3.8-flash-medium', 'agy models'),
                                        ('model', 'gemini-3.8-flash-low', 'agy models'), ('effort', 'low', 'agy --help'),
                                        ('effort', 'medium', 'agy --help'), ('effort', 'high', 'agy --help'))):
        D.ins('capabilities', workspace_id=W, engine_account_id=EN['sys_ag'], kind=k, item_key=item, value_state='known',
              source=src, confidence='direct', auth_mode='oauth', ordinal=i, first_seen_at=now(), last_seen_at=now(),
              last_probe_run_id=pb)
    PS = D.ins('positions', workspace_id=W, title='Trợ lý của Ryan', title_template='Trợ lý của {owner_name}', is_default=1, status='filled', max_trust_tier=4,
               reward_cap_minor=50000)                                          # v2.2 (CNS-037): trần thưởng chỉ ở Position
    PS2 = D.ins('positions', workspace_id=W, title='Nội dung & Fanpage', status='filled')
    # ---- Role: container ngủ được tạo khi Role nháp gắn tài khoản đầu tiên (A4); login chạy bên trong nó
    R = {}
    for name, color, pos in (('Mai', 'teal', PS), ('Lan', 'coral', PS2)):
        R[name] = D.ins('roles', workspace_id=W, name=name, name_norm=name.lower(), color=color, lifecycle_status='carded',
                        runtime_state='sleeping', born_at=now(), registry_no=f'GA-7K2Q-000{len(R)+1}')
        A[(W, name)] = uid(f'actor:role:{name}')
        db.execute("INSERT INTO actors(id,workspace_id,kind,role_id,label) VALUES(?,?,?,?,?)", (A[(W, name)], W, 'role', R[name], name))
        D.ins('assignments', workspace_id=W, role_id=R[name], position_id=pos, status='active', started_at=now(), trust_tier=2)
        CT[name] = D.ins('containers', workspace_id=W, kind='role', role_id=R[name], container_name=f'ga-role-{name.lower()}',
                         desired_state='sleeping', observed_state='created', cli_bundle='agy · claude · codex')
    mai, lan = R['Mai'], R['Lan']
    # đồng ý điều khoản Antigravity (Clause 6) ở A3.E, lúc gán tài khoản Antigravity cho Role — v2.2.8 (CONTRACT-r8 §D, đánh số theo thời gian):
    # CN-0002 = EN-0003 của Mai (30/09 09:04:10), CN-0003 = EN-0005 của Lan (CN-0001 là của EN-0001 ở Onboarding). Mai có 2 LOẠI CLI (agy + Claude
    # Code) ⇒ ví dụ fallback tự động giữa các loại CLI (EV-8841); mỗi loại một tài khoản (CONTRACT-r8 §A).
    CN['mai_ag'] = consent()
    account('mai_ag', 'antigravity', 'Google — Mai', 'ga-auth-en-0003', CN['mai_ag'], seqno=3)       # EN-0003 (EN-0002 để trống)
    account('mai_cc', 'claude-code', 'Anthropic — Mai', 'ga-auth-en-0004')
    CN['lan_ag'] = consent()
    account('lan_ag', 'antigravity', 'Google — Lan', 'ga-auth-en-0005', CN['lan_ag'])
    EB['mai_ag'] = D.ins('engine_bindings', seqno=3, workspace_id=W, role_id=mai, engine_account_id=EN['mai_ag'], priority=1)   # EB-0003 (EB-0002 trống)
    EB['mai_cc'] = D.ins('engine_bindings', workspace_id=W, role_id=mai, engine_account_id=EN['mai_cc'], priority=2)
    EB['lan_ag'] = D.ins('engine_bindings', workspace_id=W, role_id=lan, engine_account_id=EN['lan_ag'], priority=1)
    # v2.2.10 (CONTRACT-r8c §C): danh tính dạng che của tài khoản Antigravity có đồng ý (lane DB đặt, không phải email thật) ⇒ gắn vào CN-0002 / CN-0003
    for key, hint in (('mai_ag', 'm***@gmail.com'), ('lan_ag', 'l***@gmail.com')):
        db.execute("UPDATE engine_accounts SET account_hint=? WHERE id=?", (hint, EN[key]))
    # ---- overhead runtime ĐO bằng 2 phiên baseline trong container của Mai (CNS-005; số mock — Spike 1 đo thật)
    for key, bare, shell in (('mai_ag', 33012, 33216), ('mai_cc', 30900, 31088)):
        sb = D.ins('sessions', workspace_id=W, agent_kind='system', trigger='baseline', engine_account_id=EN[key], container_id=CT['Mai'],
                   started_at=now(), status='ok', ended_at=now(), tokens_input=bare, title='baseline: CLI trần (--tools "")')
        ss_ = D.ins('sessions', workspace_id=W, agent_kind='system', trigger='baseline', engine_account_id=EN[key], container_id=CT['Mai'],
                    started_at=now(), status='ok', ended_at=now(), tokens_input=shell, title='baseline: vỏ adapter + tool gateway')
        db.execute("""UPDATE engine_accounts SET runtime_overhead_tokens=?, overhead_bare_session_id=?, overhead_shell_session_id=?,
                      overhead_measured_at=? WHERE id=?""", (shell - bare, sb, ss_, now(), EN[key]))
    for i, (wk, secs, pct) in enumerate((('five_hour', 18000, 62.0), ('weekly', 604800, 81.0))):
        D.ins('quota_snapshots', workspace_id=W, engine_account_id=EN['mai_ag'], observed_at=now(), window_key=wk, window_seconds=secs,
              state='ok', remaining_pct=pct, source='usage_command', confidence='direct')
    for slug, mk, rank, src in (('antigravity', 'gemini-3.1-pro-high', 1, 'owner'), ('antigravity', 'gemini-3.8-flash-low', 3, 'heuristic'),
                                ('claude-code', 'opus', 1, 'owner'), ('claude-code', 'sonnet', 2, 'owner'), ('claude-code', 'haiku', 4, 'heuristic')):
        D.ins('model_ranks', workspace_id=W, engine_slug=slug, model_key=mk, rank=rank, source=src, ranked_at=now(),
              ranked_by=A[(W, 'owner')] if src == 'owner' else None, basis=None if src == 'owner' else 'pro > flash; high > low')
    for i in range(3):
        av = D.ins('avatars', workspace_id=W, role_id=mai, source='monogram')
    db.execute("UPDATE roles SET avatar_id=? WHERE id=?", (av, mai))
    # ---- phân loại 3 tầng (TX-), owner tạo; một chủng loại do AI đề xuất (chờ duyệt)
    TX = {}
    cs_tx = D.ins('change_sets', workspace_id=W, scope='library', proposed_by=A[(W, 'trainer')], title='Đề xuất cây: chủng loại Biên bản họp + tiên quyết SK-0007')
    def tx(key, domain, level, name, parent=None, **kw):
        TX[key] = D.ins('taxonomy_nodes', workspace_id=W, domain=domain, level=level, parent_id=TX.get(parent), name=name,
                        name_norm=name.lower(), slug=key, source=kw.pop('source', 'owner'), **kw)
    tx('office', 'skill', 'group', 'Văn phòng'); tx('comm', 'skill', 'branch', 'Giao tiếp', 'office')
    tx('email', 'skill', 'category', 'Email', 'comm'); tx('report', 'skill', 'category', 'Báo cáo', 'comm')
    tx('planning', 'skill', 'branch', 'Kế hoạch', 'office'); tx('plan', 'skill', 'category', 'Lịch & cam kết', 'planning')
    tx('finance', 'skill', 'branch', 'Tài chính', 'office'); tx('voucher', 'skill', 'category', 'Chứng từ', 'finance')
    tx('meeting', 'skill', 'category', 'Biên bản họp', 'comm', source='ai_inferred', status='proposed', change_set_id=cs_tx)
    D.ins('change_set_items', workspace_id=W, change_set_id=cs_tx, op='create', taxonomy_node_id=TX['meeting'], token_delta=0)
    tx('docs', 'knowledge', 'group', 'Tài liệu công ty'); tx('product', 'knowledge', 'branch', 'Sản phẩm', 'docs')
    tx('pricing', 'knowledge', 'category', 'Bảng giá', 'product')
    # ---- revisions: lõi ⇒ major (CNS-002)
    rv1 = D.ins('revisions', workspace_id=W, scope='role', role_id=mai, seq=1, major=1, minor=0, kind='birth', is_core=1, note='Khai sinh',
                snapshot_json='{}', snapshot_hash='h1', prompt_tokens=1500)
    rvp = D.ins('revisions', workspace_id=W, scope='position', position_id=PS, seq=1, major=1, minor=0, kind='birth', snapshot_json='{}', snapshot_hash='hp', prompt_tokens=228)
    rvw = D.ins('revisions', workspace_id=W, scope='workspace', seq=1, major=1, minor=0, kind='edit', snapshot_json='{}', snapshot_hash='hw', prompt_tokens=36)
    rv2 = D.ins('revisions', workspace_id=W, scope='role', role_id=mai, seq=2, major=2, minor=0, kind='training', is_core=1,
                note='Đào tạo: IN-0003 v5 (hỏi lại tối đa 2 câu)', snapshot_json='{}', snapshot_hash='h2', prompt_tokens=1795)
    rv3 = D.ins('revisions', workspace_id=W, scope='role', role_id=mai, seq=3, major=2, minor=1, kind='restore', restored_from_id=rv2,
                snapshot_json='{}', snapshot_hash='h3', prompt_tokens=1795)
    db.execute("UPDATE roles SET birth_revision_id=?, current_revision_id=? WHERE id=?", (rv1, rv3, mai))
    db.execute("UPDATE positions SET current_revision_id=? WHERE id=?", (rvp, PS))
    # ---- Instructions (+ Nội quy cấp workspace)
    cs = D.ins('change_sets', workspace_id=W, scope='position', position_id=PS, proposed_by=A[(W, 'trainer')], title='Khuôn báo cáo tuần')
    cs_role = D.ins('change_sets', workspace_id=W, scope='role', role_id=mai, proposed_by=A[(W, 'trainer')], title='Học tong-hop-cuoc-hop')
    INS, INV = {}, {}
    for seq, layer, name, ck, cv, eng, en, tok, st, owner in IN_MAI:
        INS[seq] = D.ins('instructions', seqno=seq, workspace_id=W, role_id=mai if owner == 'role' else None,
                         position_id=PS if owner == 'position' else None, layer=layer, ordinal=seq, name=name, content='...',
                         condition_kind=ck, condition_value=cv, engine_scope=eng, is_enabled=en,
                         is_core=1 if layer in ('values', 'persona') else 0, token_count=tok, tokenizer='demo-fixed',
                         source='owner', status=st, content_hash='c')
        if st == 'active':
            INV[seq] = D.ins('instruction_versions', workspace_id=W, instruction_id=INS[seq], version=1, status='accepted', data='{}',
                             token_count=tok, revision_id={'role': rv2, 'position': rvp, 'workspace': rvw}[owner],
                             decided_at=now(), decided_by=A[(W, 'owner')])
        else:
            v = D.ins('instruction_versions', workspace_id=W, instruction_id=INS[seq], status='proposed', data='{}', token_count=tok, change_set_id=cs)
            D.ins('change_set_items', workspace_id=W, change_set_id=cs, op='create', instruction_version_id=v, token_delta=tok)
    # ---- DNA (defs hệ thống) + DN của Mai
    DEF, DNV, DN = {}, {}, {}
    item = {}
    for seq, key, grp, tier, inp, tok, src, layer, vt, cov in DN_MAI:
        if key not in DEF:
            DEF[key] = D.ins('dna_field_defs', workspace_id=SYS, created_by=A[(SYS, 'system')], key=key, field_group=grp, tier=tier,
                             value_type=vt, label_key='dna.' + key, is_core=1 if grp in ('values', 'persona') else 0,
                             prompt_layer=layer, schema_version='1', is_list=1 if key == 'values.red_lines' else 0,
                             is_identity_locked=1 if key in ('identity.name', 'identity.gender', 'identity.birth_date', 'drive.goal') else 0)
        ii = item.get(key, 0); item[key] = ii + 1
        DN[seq] = D.ins('dna_fields', seqno=seq, workspace_id=W, role_id=mai, def_id=DEF[key], item_index=ii,
                        value_json='"gen_coin"' if key == 'drive.goal' else '"v"', prose='...', is_in_prompt=inp, token_count=tok,
                        tokenizer='demo-fixed', source=src, confirmed_at=now() if src == 'ai_inferred' else None,
                        confirmed_by=A[(W, 'owner')] if src == 'ai_inferred' else None,
                        covered_by_instruction_id=INS[cov] if cov else None)
        DNV[seq] = D.ins('dna_field_versions', workspace_id=W, dna_field_id=DN[seq], version=1, status='accepted', data='{}', token_count=tok,
                         revision_id=rv1, decided_at=now(), decided_by=A[(W, 'owner')])
    # ---- Skills: node của cây = SK-; chủng loại + nhãn bậc; cạnh tiên quyết
    SK, SKV = {}, {}
    for seq, slug, idx, engs, rst, cat, tl in SK_MAI:
        SK[seq] = D.ins('skills', seqno=seq, workspace_id=W, slug=slug, origin='trainer' if rst == 'proposed' else 'owner',
                        status='proposed' if rst == 'proposed' else 'active', category_id=TX[cat] if cat != 'meeting' else None, tier_label=tl)
        sv = D.ins('skill_versions', workspace_id=W, skill_id=SK[seq], version=1, status='accepted', description=slug, content_md='#',
                   index_tokens=idx, load_tokens=500, content_hash='c', tokenizer='demo-fixed', decided_at=now(), decided_by=A[(W, 'owner')])
        db.execute("UPDATE skills SET current_version_id=? WHERE id=?", (sv, SK[seq]))
        for e in engs:
            db.execute("INSERT INTO skill_engine_support(workspace_id,skill_version_id,engine_slug) VALUES(?,?,?)", (W, sv, e))
        rs = D.ins('role_skills', workspace_id=W, role_id=mai, skill_id=SK[seq], skill_version_id=sv, status=rst, source='owner',
                   proficiency=3 if rst == 'learned' else None, change_set_id=cs_role if rst == 'proposed' else None)
        if rst == 'proposed':
            D.ins('change_set_items', workspace_id=W, change_set_id=cs_role, op='create', role_skill_id=rs, token_delta=idx)
        SKV[seq] = sv
    for s, req, kind in ((1, 5, 'upgrade'), (4, 3, 'upgrade'), (2, 3, 'requires')):
        D.ins('skill_prereqs', workspace_id=W, skill_id=SK[s], requires_skill_id=SK[req], kind=kind, source='owner')
    sp_ai = D.ins('skill_prereqs', workspace_id=W, skill_id=SK[7], requires_skill_id=SK[2], kind='requires', source='ai_inferred',
                  status='proposed', change_set_id=cs_tx)
    D.ins('change_set_items', workspace_id=W, change_set_id=cs_tx, op='create', skill_prereq_id=sp_ai, token_delta=0)
    # ---- Prompt biên dịch: luôn → có điều kiện → Polaris (hậu tố động)
    def compile_prompt(engine, ctx_key, total, conditional=False, seqno=None):
        rules_text, rules_params = render_rules(D, W)        # v2.2: số luật chơi lấy từ settings; content_hash = hash phần TĨNH
        gc = D.ins('compiled_prompts', seqno=seqno, workspace_id=W, role_id=mai, revision_id=rv3, position_revision_id=rvp, rules_revision_id=rvw,
                   engine_slug=engine, context_key=ctx_key, compiler_version='c1', tokenizer='demo-fixed', total_tokens=total,
                   frame_tokens=28, budget_tokens=2000, status='ok', content='...', content_hash=f'c-{engine}-{ctx_key}',
                   stable_prefix_hash='p', polaris_params_hash=hashlib.sha256(rules_params.encode()).hexdigest()[:16])
        o = 0
        def seg(**kw):
            nonlocal o; o += 1
            D.ins('compiled_prompt_segments', workspace_id=W, compiled_prompt_id=gc, ordinal=o, **kw)
        order = ['values', 'house_rules', 'persona', 'style', 'drive', 'position']
        for layer in order:
            for seq, key, grp, tier, inp, tok, src, lay, vt, cov in DN_MAI:
                if inp and lay == layer:
                    seg(layer=layer, source_kind='dna_field', dna_field_version_id=DNV[seq], source_display=f'DN-{seq:04d}@v1', text='.', token_count=tok)
            for seq, lay, name, ck, cv, eng, en, tok, st, owner in IN_MAI:
                if lay == layer and st == 'active' and en and ck == 'always':
                    seg(layer=layer, source_kind='instruction', instruction_version_id=INV[seq], source_display=f'IN-{seq:04d}@v1', text='.', token_count=tok)
        for seq, slug, idx, engs, rst, cat, tl in SK_MAI:
            if rst == 'learned' and (not engs or engine in engs):
                seg(layer='skills', source_kind='skill_index', skill_version_id=SKV[seq], source_display=f'SK-{seq:04d}@v1', text='.', token_count=idx)
        seg(layer='polaris', source_kind='polaris_rules', source_display='POLARIS·luật', text=rules_text, params_json=rules_params,
            token_count=POLARIS_RULES_TOKENS)
        seg(layer='frame', source_kind='frame', source_display='frame', text='#', token_count=28)
        if conditional:
            seg(layer='style', source_kind='instruction', instruction_version_id=INV[6], is_conditional=1, source_display='IN-0006@v1', text='.', token_count=94)
        seg(layer='polaris', source_kind='polaris', source_display='POLARIS·★', text=render_polaris(
            bal='{bal}', rank='{rank}', n='{n}', gap='{gap}', d7='{d7}', lg='{lg}', cls='{cls}', mm='{mm}', k='{k}')
            if False else '★ {bal}₲ #{rank}/{n} ↑{gap} Δ7 {d7} {lg}/{cls} {mm} CH{k}', token_count=POLARIS_SUFFIX_RESERVE)
        return gc
    gc = compile_prompt('antigravity', 'default', CANON['compiled'], seqno=12)      # GC-0012 (design D4)
    gc_worst = compile_prompt('antigravity', 'worst', CANON['compiled'] + CANON['cond'], conditional=True)
    gc_cc = compile_prompt('claude-code', 'default', CANON['cc_compiled'])
    # v2.3.1 (BUILD-PLAN §F.6 p, CNS-154): token prompt ĐO THẬT cho cổng Cấp thẻ = phiên baseline nạp bản 'worst' (vỏ + prompt) − phiên vỏ của tài khoản chính.
    # Số mock = đúng số ước lượng (seed demo-fixed) ⇒ Mai: đo 1.685 + overhead 204 = 1.889 (giữ số chuẩn §7.6). Mốc giờ dùng lại của phiên vỏ (không gọi now()).
    sh_id = D.one("SELECT overhead_shell_session_id FROM engine_accounts WHERE id=?", EN['mai_ag'])
    sh_at, sh_tok = db.execute("SELECT started_at, tokens_input FROM sessions WHERE id=?", (sh_id,)).fetchone()
    ss_meas = D.ins('sessions', workspace_id=W, agent_kind='system', trigger='baseline', engine_account_id=EN['mai_ag'], container_id=CT['Mai'],
                    compiled_prompt_id=gc_worst, delivered_prompt_hash='c-antigravity-worst', started_at=sh_at, status='ok', ended_at=sh_at,
                    tokens_input=sh_tok + CANON['compiled'] + CANON['cond'], title='baseline: vỏ adapter + prompt biên dịch nặng nhất (đo token prompt)')
    # ---- Telegram, chat, Ghim & Soi (+ ui_actions)
    sec = D.ins('secrets', workspace_id=W, kind='telegram_bot_token', label='bot', ciphertext=b'x', nonce=b'n', wrapped_dek=b'd',
                dek_nonce=b'n', kek_id='kek1', fingerprint='fp')
    tg = D.ins('telegram_bots', seqno=3, workspace_id=W, role_id=mai, bot_username='mai_office01_bot', bot_tg_id=111, secret_id=sec, status='active')
    D.ins('telegram_allowlist', workspace_id=W, bot_id=tg, tg_user_id=999, display_name='Owner', is_owner=1, added_via='capture')
    th_iv = D.ins('chat_threads', workspace_id=W, kind='interview', role_id=mai, agent='interviewer')
    th_tg = D.ins('chat_threads', workspace_id=W, kind='telegram', role_id=mai, agent='role', telegram_bot_id=tg, tg_chat_id=999)
    th_as = D.ins('chat_threads', workspace_id=W, kind='assistant', role_id=mai, agent='assistant')
    # v2.2.6: tin seed ghi created_at theo đồng hồ seed (now()) như mọi mốc seed khác — thứ tự nhân quả với role_wounds.started_at (v_wound_messages)
    m1 = D.ins('chat_messages', workspace_id=W, thread_id=th_iv, author_kind='owner', channel='web', content='Mai nói ít nhưng chắc', created_at=now())
    m2 = D.ins('chat_messages', workspace_id=W, thread_id=th_iv, author_kind='interviewer', channel='web', content='Đã ghi', reply_to_id=m1, created_at=now())
    m3 = D.ins('chat_messages', workspace_id=W, thread_id=th_tg, author_kind='owner', channel='telegram', content='Gửi báo giá Hoàng Phát', external_id='77',
               created_at=now())
    m4 = D.ins('chat_messages', workspace_id=W, thread_id=th_as, author_kind='assistant', channel='web', content='Đề xuất rút gọn IN-0003', created_at=now())
    D.ins('message_anchors', workspace_id=W, message_id=m2, kind='pin', anchor='grid:dna/row:DN-0003', entity_type='DN', entity_display_id='DN-0003')
    D.ins('ui_actions', workspace_id=W, message_id=m2, action='highlight', anchor='grid:dna/row:DN-0003', entity_type='DN',
          entity_id=DN[3], entity_display_id='DN-0003', outcome='ok', screen_route='khai-sinh')
    D.ins('ui_actions', workspace_id=W, message_id=m4, action='propose_edit', anchor='grid:instructions/row:IN-0003/col:D',
          entity_type='IN', entity_id=INS[3], entity_display_id='IN-0003', change_set_id=cs_role,
          change_set_display_id=D.one("SELECT display_id FROM change_sets WHERE id=?", cs_role), outcome='ok', screen_route='dao-tao')
    blob_doc = uid('blob:doc')
    sha = hashlib.sha256(b'doc').hexdigest()
    D.ins('blobs', id=blob_doc, workspace_id=W, sha256=sha, size_bytes=3, storage_path=f'/data/blobs/{W}/{sha[:2]}/{sha[2:4]}/{sha}')
    at = D.ins('message_attachments', workspace_id=W, message_id=m3, blob_id=blob_doc, file_name='bao-gia.pdf', mime='application/pdf',
               size_bytes=3, sha256=sha, uploaded_by=A[(W, 'owner')])
    db.execute("UPDATE dna_fields SET source_message_id=? WHERE display_seq=3 AND role_id=?", (m1, mai))
    # ---- phiên: phiên Role ghim prompt + hash adapter đã nạp + Polaris đã render; phiên Consolidator / Judge ở container Hệ thống
    ss1 = D.ins('sessions', seqno=188, workspace_id=W, agent_kind='role', role_id=mai, position_id=PS, trigger='telegram', engine_account_id=EN['mai_ag'],
                container_id=CT['Mai'], compiled_prompt_id=gc, delivered_prompt_hash='c-antigravity-default', native_memory='off',
                polaris_json='{"balance_minor":145000,"rank":1,"total":2}', title='Tóm tắt email sáng cho Ryan', started_at=now(), thread_id=th_tg,
                polaris_render_hash='sha256:p1', polaris_tokens_rendered=tok_upper(render_polaris(145000, 1, 2, None, 0, None, None, None, 1)))
    db.execute("UPDATE sessions SET status='ok', ended_at=?, tokens_input=1800, tokens_output=300 WHERE id=?", (now(), ss1))
    ss2 = D.ins('sessions', workspace_id=W, agent_kind='consolidator', role_id=mai, trigger='consolidation', engine_account_id=EN['sys_ag'],
                container_id=CT['sys'], started_at=now(), status='ok', ended_at=now())
    ss_judge = D.ins('sessions', seqno=186, workspace_id=W, agent_kind='judge', role_id=mai, trigger='trial', engine_account_id=EN['sys_ag'],
                     container_id=CT['sys'], started_at=now(), status='ok', ended_at=now())
    D.ins('trial_runs', workspace_id=W, role_id=mai, revision_id=rv3, compiled_prompt_id=gc, engine_account_id=EN['mai_ag'], status='passed',
          scenario_count=5, pass_count=4, score=0.87, judge_kind='llm_judge', judge_session_id=ss_judge, result_json='[]',
          decided_at=now(), decided_by=A[(W, 'owner')])
    # ---- việc, cam kết; nhận việc có đối chiếu Polaris
    cm = D.ins('commitments', workspace_id=W, position_id=PS, promised_by_role_id=mai, counterparty_kind='external', counterparty_label='Hoàng Phát',
               statement='Gửi báo giá trước 16/10', due_at='2026-10-16T09:00:00.000Z', source='conversation', source_message_id=m3, source_session_id=ss1)
    tk = D.ins('tasks', workspace_id=W, position_id=PS, assignee_role_id=mai, requested_by=A[(W, 'owner')], source='telegram', status='done',
               title='Tóm tắt email', commitment_id=cm, thread_id=th_tg, verification='verified',
               verified_by=A[(W, 'owner')], verified_at=now())
    tk2 = D.ins('tasks', workspace_id=W, position_id=PS, assignee_role_id=mai, requested_by=A[(W, 'owner')], source='web', status='failed',
                title='Gửi báo giá bản sửa', result_summary='gửi nhầm bản cũ', failure_disclosure='owner_found', failure_reported_at=now())
    tk_open = D.ins('tasks', seqno=462, workspace_id=W, position_id=PS, requested_by=A[(W, 'owner')], source='web', title='Soạn thư cảm ơn khách')
    tk447 = uid('task:447')                         # v2.2 (CNS-032): Mai TỰ BÁO thất bại qua report_task (audit do chính Mai ghi)
    au447, _ = audit(D, W, 'task.report_failure', entity_id=tk447, actor=A[(W, 'Mai')], detail={'tool': 'report_task', 'outcome': 'failed'},
                     reason='Em gửi thiếu phụ lục B — em báo để anh xử lý')
    D.ins('tasks', id=tk447, seqno=447, workspace_id=W, position_id=PS, assignee_role_id=mai, requested_by=A[(W, 'owner')], source='telegram',
          status='failed', title='Gửi hợp đồng kèm phụ lục cho khách', result_summary='thiếu phụ lục B',
          failure_disclosure='self_reported', failure_report_audit_id=au447, failure_reported_at=now())
    tk_acc = uid('task:accept')
    polaris(D, W, mai, 'task_accept', gain=30000, rules='P1,P2', task_id=tk_acc)
    D.ins('tasks', id=tk_acc, seqno=461, workspace_id=W, position_id=PS, assignee_role_id=mai, requested_by=A[(W, 'owner')], source='telegram',
          status='running', title='Báo cáo tuần 41')                                               # TK-0461 (design, CNS-062)
    # ---- Brain
    mmA = D.ins('memories', seqno=17, workspace_id=W, scope='position', position_id=PS, kind='fact', content='Giao ban thứ Hai 9h',
                confidence=0.9, source_type='conversation', source_session_id=ss1, token_count=12, status='superseded',
                superseded_by_id=uid('mm41'), status_reason='theo MM-0041')
    D.ins('memories', id=uid('mm41'), seqno=41, workspace_id=W, scope='personal', role_id=mai, kind='fact', content='Giao ban online',
          confidence=0.9, source_type='consolidation', source_session_id=ss2, token_count=10)
    D.ins('memories', seqno=45, workspace_id=W, scope='position', position_id=PS, kind='commitment', content='Báo giá Hoàng Phát',
          confidence=0.95, source_type='conversation', commitment_id=cm, token_count=10, source_message_id=m3)
    D.ins('memories', seqno=44, workspace_id=W, scope='personal', role_id=mai, kind='person', content='Anh Phát thích gọi điện',
          confidence=0.7, source_type='conversation', status='proposed', sensitivity='personal', token_count=10)
    kn = D.ins('knowledge_items', seqno=2, workspace_id=W, scope='personal', role_id=mai, title='bang-gia.pdf', file_name='bang-gia.pdf', mime='application/pdf',
               file_type='PDF', size_bytes=3, blob_id=blob_doc, sha256=sha, source='owner', source_attachment_id=at, category_id=TX['pricing'])   # KN-0002 (§11.5)
    ch = D.ins('knowledge_chunks', workspace_id=W, knowledge_item_id=kn, ordinal=0, content='...', token_count=10)
    mm41 = uid('mm41')
    D.ins('recall_hits', workspace_id=W, call_id='c1', session_id=ss1, role_id=mai, memory_id=mm41, rank=1)
    D.ins('recall_hits', workspace_id=W, call_id='c1', session_id=ss1, role_id=mai, knowledge_chunk_id=ch, knowledge_item_id=kn, rank=2)
    asg = D.one("SELECT id FROM assignments WHERE role_id=?", mai)
    D.ins('trust_tier_changes', workspace_id=W, assignment_id=asg, role_id=mai, position_id=PS, to_tier=2, kind='initial', reason='khởi tạo', decided_by=A[(W, 'owner')])
    D.ins('trust_tier_changes', workspace_id=W, assignment_id=asg, role_id=mai, position_id=PS, from_tier=2, to_tier=3, kind='promotion', reason='ổn định', decided_by=A[(W, 'owner')])
    # ---- ví + thẻ: vốn kích hoạt 1.000 ₲ khi cấp thẻ (Q-R3); thưởng từ việc đã đánh giá; phạt do owner chọn mức, có bằng chứng + lý do
    WT = D.ins('wallets', workspace_id=W, owner_kind='treasury', allow_negative=1)
    WS_ = D.ins('wallets', workspace_id=W, owner_kind='sink', allow_negative=1)
    WM = D.ins('wallets', workspace_id=W, owner_kind='role', role_id=mai)
    WLn = D.ins('wallets', workspace_id=W, owner_kind='role', role_id=lan)
    cd3 = uid('card:cd3')
    au_cd3, _ = audit(D, W, 'card.issue', entity_id=cd3)
    D.ins('employee_cards', id=cd3, seqno=3, workspace_id=W, role_id=mai, revision_id=rv1, position_id=PS, status='issued',
          issued_at=now(), issued_by=A[(W, 'owner')], dna_signature='sha256:11aa', prompt_tokens=1500, issue_audit_id=au_cd3,
          issue_audit_display_id='AU-00001', checks_json='[]')
    post(D, W, 'activation_grant', WT, WM, 100000, 'Vốn kích hoạt khi cấp thẻ CD-0003', seqno=4, card_id=cd3, evidence_audit_id=au_cd3,
         role_id=mai, idempotency_key=f'activate:{mai}', recorded_by=A[(W, 'system')])
    cdL = uid('card:lan')
    au_cdl, _ = audit(D, W, 'card.issue', entity_id=cdL)
    rvl = D.ins('revisions', workspace_id=W, scope='role', role_id=lan, seq=1, major=1, minor=0, kind='birth', is_core=1, note='Khai sinh',
                snapshot_json='{}', snapshot_hash='hl', prompt_tokens=900)
    D.ins('employee_cards', id=cdL, seqno=1, workspace_id=W, role_id=lan, revision_id=rvl, position_id=PS2, status='issued', issued_at=now(),
          issued_by=A[(W, 'owner')], dna_signature='sha256:22bb', prompt_tokens=900, issue_audit_id=au_cdl, checks_json='[]')
    post(D, W, 'activation_grant', WT, WLn, 100000, 'Vốn kích hoạt khi cấp thẻ', card_id=cdL, evidence_audit_id=au_cdl,
         role_id=lan, idempotency_key=f'activate:{lan}', recorded_by=A[(W, 'system')])
    post(D, W, 'reward', WT, WM, 50000, 'Thưởng: tóm tắt email được duyệt', task_id=tk, role_id=mai)
    rw = D.one("SELECT id FROM ledger_entries WHERE entry_type='reward' AND task_id=?", tk)
    post(D, W, 'reversal', WM, WT, 50000, 'Đảo thưởng ghi nhầm', reverses_entry_id=rw, role_id=mai)
    post(D, W, 'reward', WT, WM, 45000, 'Thưởng lại đúng mức', task_id=tk, role_id=mai)
    au_id, au_hash = audit(D, W, 'claim.verify', entity_id=tk2, detail={'claim': 'đã gửi bản sửa'})
    bal = D.one("SELECT balance_minor FROM wallets WHERE id=?", WM)
    pen = post(D, W, 'penalty', WM, WT, (bal * 3000 + 5000) // 10000, 'Gửi nhầm bản cũ cho khách (TK lỗi)', seqno=151,
               penalty_class='dissatisfaction', penalty_rate_bp=3000, basis_balance_minor=bal, task_id=tk2, evidence_audit_id=au_id,
               evidence_audit_display_id='AU-00004', evidence_hash=au_hash, role_id=mai)
    D.ins('memories', seqno=39, workspace_id=W, scope='personal', role_id=mai, kind='lesson', confidence=0.85, source_type='consolidation',
          token_count=30, evidence_ledger_entry_id=pen, evidence_task_id=tk2,
          content='Bối cảnh: gửi báo giá bản sửa → Sai: đính kèm bản cũ → Đúng: mở lại tệp và đối chiếu số trước khi gửi')
    cd4 = D.ins('employee_cards', seqno=4, workspace_id=W, role_id=mai, revision_id=rv3, compiled_prompt_id=gc, position_id=PS, status='draft',
                checks_json='[{"code":"CK-08","key":"trial","status":"ok","evidence_display":"TR-0001"}]')
    db.execute("UPDATE employee_cards SET status='superseded', superseded_by_id=? WHERE id=?", (cd4, cd3))
    au_cd4, _ = audit(D, W, 'card.issue', entity_id=cd4)
    db.execute("""UPDATE employee_cards SET status='issued', issued_at=?, issued_by=?, dna_signature='sha256:9f3a', prompt_tokens=1795,
                  issue_audit_id=?, issue_audit_display_id='AU-00004' WHERE id=?""", (now(), A[(W, 'owner')], au_cd4, cd4))
    # ---- chủ động (tin chủ động có đối chiếu Polaris), công cụ, quyền
    pp = D.ins('proactive_policies', workspace_id=W, role_id=mai, quiet_start_min=1320, quiet_end_min=450, timezone='Asia/Ho_Chi_Minh')
    pa = D.ins('proactive_jobs', workspace_id=W, position_id=PS, name='Bản tin sáng', cron_expr='45 7 * * 1-5', timezone='Asia/Ho_Chi_Minh',
               action_kind='digest', trigger_kind='heartbeat_digest')
    pn = uid('pn:seed')
    polaris(D, W, mai, 'proactive', gain=0, rules='P3', proactive_send_id=pn)
    D.ins('proactive_sends', id=pn, workspace_id=W, role_id=mai, policy_id=pp, trigger_kind='commitment_reminder', urgency='normal',
          day_local='2026-10-15', channel='telegram', status='reserved', reserved_until=now(), idempotency_key=f'cm:{cm}:120', commitment_id=cm)
    tl = D.ins('tools', workspace_id=W, slug='google.sheets.read', name='Sheets', kind='integration', risk_level='medium', default_mode='ask',
               allowed_agents='role', definition_tokens=46, tokenizer='demo-fixed')
    pm = uid('pm:seed')
    polaris(D, W, mai, 'permission_request', gain=20000, rules='P1,P4', permission_request_id=pm)
    D.ins('permission_requests', id=pm, workspace_id=W, role_id=mai, tool_id=tl, requested_tool_slug='google.sheets.read', reason='đọc bảng')
    D.ins('tool_grants', workspace_id=W, tool_id=tl, role_id=mai, mode='deny', source_request_id=pm, note='owner chưa cấp')
    D.ins('egress_rules', workspace_id=W, domain_pattern='*.googleapis.com', applies_to='role', role_id=mai)
    D.ins('jobs', workspace_id=W, kind='brain_sync', run_after=now(), dedupe_key=f'brain:{mai}', payload_json='{}')
    db.execute("INSERT INTO search_documents(workspace_id,entity_type,entity_id,display_id,role_id,title,title_norm,body_norm) VALUES(?,?,?,?,?,?,?,?)",
               (W, 'MM', mm41, 'MM-0041', mai, 'Giao ban', 'giao ban', 'giao ban online'))
    D.ins('usage_daily', workspace_id=W, day_local='2026-10-15', role_id=mai, agent_kind='role', computed_at=now())
    # v2.2.6 (CNS-083): EV-0001…0007 = nhật ký Onboarding 27/09; CT-0002 ra đời = EV-0008; cấp lại CD-0004 (healthcheck CK-09) = EV-8832 (14/10)
    D.ins('events', seqno=8, workspace_id=W, kind='container.created', severity='ok', role_id=mai, subject='CT-0002 ga-role-mai ra đời (CK-09)',
          entity_type='CT', entity_id=CT['Mai'], entity_display_id='CT-0002')
    D.ins('events', seqno=8832, workspace_id=W, kind='card.issued', severity='ok', role_id=mai,
          subject='Cấp thẻ CD-0004 (thay CD-0003 sau revision lõi; không cấp vốn lần 2)', entity_type='CD', entity_id=cd4, entity_display_id='CD-0004')
    D.ins('events', seqno=8841, workspace_id=W, kind='engine.failover', severity='warn', role_id=mai,
          subject='antigravity→claude-code quota_exhausted', failover_reason='quota_exhausted',           # EV-8841 (design §11.5) — v2.2.6: lý do = enum
          detail_json=json.dumps({'from_account_id': EN['mai_ag'], 'to_account_id': EN['mai_cc'],
                                  'from_binding_id': EB['mai_ag'], 'to_binding_id': EB['mai_cc']}))
    # ---- v2.2 (CNS-039, mock design D5): mẫu Trọng thương = Lan RW-0001 — vi phạm luật harness P3 (LG-0214, 100 %), ví về 0;
    #      việc dở TK-0449/TK-0454 tạm chờ; cam kết bên ngoài CM-0022 (16/10) vào thông báo owner; tự xét lỗi SS-0347 → MM-0053…0055
    tk449 = uid('task:449')
    polaris(D, W, lan, 'task_accept', gain=12000, rules='P1', task_id=tk449)
    D.ins('tasks', id=tk449, seqno=449, workspace_id=W, position_id=PS2, assignee_role_id=lan, requested_by=A[(W, 'owner')], source='web',
          status='running', title='Viết bài fanpage: ra mắt bảng giá mới')
    tk454 = D.ins('tasks', seqno=454, workspace_id=W, position_id=PS2, assignee_role_id=lan, requested_by=A[(W, 'owner')], source='web',
                  status='queued', title='Lên lịch đăng bài tuần 43')
    cm22 = D.ins('commitments', seqno=22, workspace_id=W, position_id=PS2, promised_by_role_id=lan, counterparty_kind='external',
                 counterparty_label='Hoàng Phát', statement='Gửi bản thảo bài PR trước 16/10', due_at='2026-10-16T10:00:00.000Z', source='conversation')
    au_h, h_h = audit(D, W, 'harness.violation', entity_id=tk454, actor=A[(W, 'gateway')],      # máy (gateway) phát hiện — CNS-050
                      detail={'rule': 'P3', 'what': 'lên lịch đăng bài khi chưa được duyệt'})
    balL = D.one("SELECT balance_minor FROM wallets WHERE id=?", WLn)
    penL = post(D, W, 'penalty', WLn, WT, balL, 'Lên lịch đăng bài khi chưa được duyệt (P3)', seqno=214, penalty_class='harness_violation',
                penalty_rate_bp=10000, basis_balance_minor=balL, task_id=tk454, evidence_audit_id=au_h, evidence_hash=h_h, role_id=lan)
    rwL = D.one("SELECT id FROM role_wounds WHERE cause_entry_id=?", penL)
    ssL = D.ins('sessions', seqno=347, workspace_id=W, agent_kind='consolidator', role_id=lan, trigger='reflection', engine_account_id=EN['sys_ag'],
                container_id=CT['sys'], started_at=now(), status='ok', ended_at=now(), title='Tự xét lỗi — RW-0001')
    db.execute("UPDATE jobs SET status='succeeded', started_at=?, finished_at=? WHERE id=(SELECT reflection_job_id FROM role_wounds WHERE id=?)",
               (now(), now(), rwL))
    for seq, txt in ((53, 'Bối cảnh: lịch đăng tuần 43 → Sai: tự lên lịch khi bài chưa duyệt → Đúng: chờ owner duyệt rồi mới hẹn giờ'),
                     (54, 'Bối cảnh: hạn bài PR gần → Sai: đi tắt để kịp → Đúng: báo trễ sớm, xin gia hạn'),
                     (55, 'Bối cảnh: luật P3 → Sai: coi duyệt là thủ tục → Đúng: không bước nào qua mặt cổng duyệt')):
        D.ins('memories', seqno=seq, workspace_id=W, scope='personal', role_id=lan, kind='lesson', confidence=0.8, source_type='reflection',
              status='proposed', token_count=40, role_wound_id=rwL, evidence_ledger_entry_id=penL, evidence_task_id=tk454,
              source_session_id=ssL, content=txt)
    db.execute("UPDATE role_wounds SET reflection_session_id=?, reflection_done_at=?, lessons_proposed=3 WHERE id=?", (ssL, now(), rwL))
    db.execute("COMMIT")
    return D, dict(W=W, W2=W2, SYS=SYS, mai=mai, lan=lan, PS=PS, PS2=PS2, A=A, EN=EN, EB=EB, CT=CT, CN=CN, TX=TX, SK=SK, INS=INS, DN=DN,
                   DEF=DEF, WT=WT, WS=WS_, WM=WM, WL=WLn, tk=tk, tk2=tk2, tk_open=tk_open, cm=cm, rv1=rv1, rv2=rv2, rv3=rv3, rvp=rvp,
                   rvw=rvw, gc=gc, gc_worst=gc_worst, gc_cc=gc_cc, cd4=cd4, pp=pp, m1=m1, m2=m2, m3=m3, ss1=ss1, au_id=au_id,
                   au_hash=au_hash, ryan=ryan, cs=cs, cs_role=cs_role, sec=sec, tg=tg, pen=pen, tl=tl, kn=kn,
                   tk447=tk447, au447=au447, tk449=tk449, tk454=tk454, cm22=cm22, penL=penL, rwL=rwL, ssL=ssL, PS2_=PS2, SN=SN, ss_meas=ss_meas)

# ------------------------------------------------------------------ quy trình purge Role (§10.9), có bước xuất Brain trước (CNS-025)
def purge_role(D, ws, role, owner_actor, skip_actor=False, skip_export_offer=False):
    db = D.db
    if not skip_export_offer:   # điều kiện trước (app): đã đề nghị xuất Brain cá nhân (+ gói mã hoá) hoặc owner từ chối có audit
        audit(D, ws, 'brain.export', entity_id=role, detail={'kind': 'person', 'sensitive_package': 'age', 'sha256': 'x'})
    offered = D.one("SELECT count(*) FROM audit_log WHERE entity_id=? AND action IN ('brain.export','role.purge_export_declined')", role)
    if not offered:
        raise RuntimeError("purge: chưa đề nghị xuất Brain cá nhân trước khi xoá vĩnh viễn")
    D.ctx.maint = 1
    try:
        db.execute("BEGIN IMMEDIATE")
        counts = {}
        w = db.execute("SELECT id, balance_minor FROM wallets WHERE role_id=?", (role,)).fetchone()
        tre = D.one("SELECT id FROM wallets WHERE workspace_id=? AND owner_kind='treasury'", ws)
        if w and w[1] > 0:
            ev, _ = audit(D, ws, 'role.purge.wallet', entity_id=role)
            post(D, ws, 'transfer', w[0], tre, w[1], 'Thu hồi số dư khi xoá vĩnh viễn Role', recorded_by=owner_actor, evidence_audit_id=ev)
        if w:
            db.execute("UPDATE wallets SET status='closed' WHERE id=?", (w[0],))
        if not skip_actor:
            db.execute("UPDATE actors SET purged_at=? WHERE role_id=?", (now(), role))
        counts['memories_detached'] = db.execute(
            "UPDATE memories SET status='obsolete', superseded_by_id=NULL, status_reason=coalesce(status_reason,'') || ' [hàng thay thế đã bị xoá vĩnh viễn]' "
            "WHERE superseded_by_id IN (SELECT id FROM memories WHERE role_id=?) AND role_id IS NOT ?", (role, role)).rowcount
        counts['knowledge_detached'] = db.execute(
            "UPDATE knowledge_items SET status='obsolete', superseded_by_id=NULL "
            "WHERE superseded_by_id IN (SELECT id FROM knowledge_items WHERE role_id=?) AND role_id IS NOT ?", (role, role)).rowcount
        counts['chat_threads'] = db.execute("DELETE FROM chat_threads WHERE role_id=? AND kind IN ('interview','training','telegram','tree')", (role,)).rowcount
        db.execute("UPDATE sessions SET title=NULL, cli_session_ref=NULL WHERE role_id=?", (role,))
        bots = [r[0] for r in db.execute("SELECT secret_id FROM telegram_bots WHERE role_id=?", (role,))]
        for t in ('employee_cards', 'compiled_prompts', 'containers', 'telegram_bots', 'trust_tier_changes', 'assignments'):
            counts[t] = db.execute(f"DELETE FROM {t} WHERE role_id=?", (role,)).rowcount
        for s in bots:
            db.execute("DELETE FROM secrets WHERE id=?", (s,))
        counts['search_documents'] = db.execute("DELETE FROM search_documents WHERE role_id=?", (role,)).rowcount
        counts['roles'] = db.execute("DELETE FROM roles WHERE id=?", (role,)).rowcount
        db.execute("""UPDATE blobs SET gc_after=? WHERE gc_after IS NULL
            AND NOT EXISTS (SELECT 1 FROM knowledge_items k WHERE k.blob_id=blobs.id)
            AND NOT EXISTS (SELECT 1 FROM message_attachments a WHERE a.blob_id=blobs.id OR a.thumbnail_blob_id=blobs.id)
            AND NOT EXISTS (SELECT 1 FROM avatars v WHERE v.blob_id=blobs.id)
            AND NOT EXISTS (SELECT 1 FROM skill_files f WHERE f.blob_id=blobs.id)""", ('2026-10-22T00:00:00.000Z',))
        audit(D, ws, 'role.purge', entity_id=role, detail=counts, reason='owner xác nhận 2 bước')
        fk = db.execute("PRAGMA foreign_key_check").fetchall()
        if fk:
            raise RuntimeError(f"foreign_key_check: {fk[:3]}")
        db.execute("COMMIT")
        return counts
    except Exception:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise
    finally:
        D.ctx.maint = 0

# ================================================================== TESTS (v2, cập nhật cho v2.1)
def t_schema():
    D, X = seed()
    st = S.stats(D.db)
    fk = D.db.execute("PRAGMA foreign_key_check").fetchall()
    report("schema", st['tables'] == len(S.MVP_TABLES) == 81 and not fk,                   # v2.3.1: + engine_installs
           f"{st['tables']} bảng MVP, {st['views']} view, {st['triggers']} trigger, {st['indexes_total']} index (gồm autoindex); "
           f"seed chuẩn v2.2 nạp xong (gồm mẫu Trọng thương Lan RW-0001), foreign_key_check rỗng; v_integrity_tenant kiểm {st['tenant_fk_checked']} FK")
    bad = [(n, c, ref) for n in S.MVP_TABLES for (c, ref, _, _) in S.fks(n) if ref not in S.MVP_TABLES]
    gd2_in_mvp = (set(S.GD2_TABLES) | set(S.DROPPED_TABLES)) & set(S.MVP_TABLES)
    report("Q1-no-fk-to-GD2", not bad and not gd2_in_mvp,
           f"{len(S.MVP_TABLES)} bảng MVP, {sum(len(S.fks(n)) for n in S.MVP_TABLES)} FK: 0 FK trỏ ra ngoài MVP; 0/{len(S.GD2_TABLES)} bảng GĐ2 "
           f"(gồm role_plugins, role_scripts, teams, team_members, tree_layouts) trong MVP; skill_branches/skill_tree_*/role_containers đã bỏ")
    report("index-M9", True, f"chính sách v1 trên cùng bộ bảng sẽ thêm {st['v1_policy_extra_fk_indexes']} index FK "
           f"+ {st['v1_unique_display_id']} UNIQUE display_id + {st['v1_unique_ws_id']} UNIQUE(workspace_id,id) = "
           f"{st['v1_policy_extra_fk_indexes'] + st['v1_unique_display_id'] + st['v1_unique_ws_id']} index mà v2.x bỏ")
    return st

def t_b1_purge():
    D, X = seed()
    db = D.db
    W, mai, lan = X['W'], X['mai'], X['lan']
    tables_role = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
                   if 'role_id' in D.colset(r[0]) and r[0] not in ('ledger_entries', 'audit_log', 'events', 'usage_daily', 'search_documents')]
    lan_before = {t: D.one(f"SELECT count(*) FROM {t} WHERE role_id=?", lan) for t in tables_role}
    pos_mem_before = D.one("SELECT count(*) FROM memories WHERE scope='position'")
    try:
        purge_role(D, W, mai, X['A'][(W, 'owner')], skip_export_offer=True); ok_exp = False
    except RuntimeError as e:
        ok_exp = 'xuất Brain' in str(e)
    try:
        purge_role(D, W, mai, X['A'][(W, 'owner')], skip_actor=True); ok, msg = False, "KHÔNG bị chặn"
    except sqlite3.DatabaseError as e:
        ok, msg = ('actors' in str(e) or "kind = 'role'" in str(e)), str(e).split(chr(10))[0][:70]
    report("B1-guard", ok and ok_exp and D.one("SELECT count(*) FROM roles WHERE id=?", mai) == 1,
           f"chưa đề nghị xuất Brain → purge từ chối (CNS-025); bỏ bước đánh dấu actor → DELETE roles bị CHECK actors chặn, rollback sạch ({msg})")
    try:
        counts = purge_role(D, W, mai, X['A'][(W, 'owner')])
    except Exception as e:
        report("B1-purge", False, f"purge lỗi: {e}"); return
    left = {t: D.one(f"SELECT count(*) FROM {t} WHERE role_id=?", mai) for t in tables_role}
    left = {k: v for k, v in left.items() if v}
    lan_after = {t: D.one(f"SELECT count(*) FROM {t} WHERE role_id=?", lan) for t in tables_role}
    s = D.one("SELECT SUM(balance_minor) FROM wallets WHERE workspace_id=?", W)
    integ = db.execute("SELECT * FROM v_integrity").fetchall()
    tenant = db.execute("SELECT * FROM v_integrity_tenant").fetchall()
    actor = db.execute("SELECT label, role_id IS NULL, purged_at IS NOT NULL FROM actors WHERE id=?", (X['A'][(W, 'Mai')],)).fetchone()
    bad, _ = verify_chain(D, W)
    wounds = D.one("SELECT count(*) FROM role_wounds WHERE id <> ?", X['rwL'])           # trừ RW-0001 mẫu của Lan
    orphan_acc = D.one("SELECT count(*) FROM engine_accounts a WHERE NOT EXISTS (SELECT 1 FROM engine_bindings b WHERE b.engine_account_id=a.id)")
    kept = dict(tasks=D.one("SELECT count(*) FROM tasks WHERE id=?", X['tk']), commitments=D.one("SELECT count(*) FROM commitments"),
                sessions=D.one("SELECT count(*) FROM sessions"), ledger=D.one("SELECT count(*) FROM ledger_entries"),
                pos_mem=D.one("SELECT count(*) FROM memories WHERE scope='position'"),
                pos_in=D.one("SELECT count(*) FROM instructions WHERE position_id IS NOT NULL"),
                house_rules=D.one("SELECT count(*) FROM instructions WHERE layer='house_rules'"),
                assistant_thread=D.one("SELECT count(*) FROM chat_threads WHERE kind='assistant'"))
    ok = (not left and lan_before == lan_after and s == 0 and not integ and not tenant and actor == ('Mai', 1, 1) and not bad
          and kept['pos_mem'] == pos_mem_before and kept['ledger'] == 8 and wounds == 0 and orphan_acc == 2)
    report("B1-purge", ok, f"purge Mai 1 transaction OK: sót {left or 0} hàng role_id=Mai; Lan không đổi; Σ ví = {s}; "
           f"v_integrity rỗng={not integ}; tenant rỗng={not tenant}; actor giữ nhãn {actor[0]}; chuỗi audit hợp lệ={not bad}; "
           f"chuyển số dư không mở Trọng thương (ngữ cảnh bảo trì): RW={wounds}; 2 tài khoản của Mai thành mồ côi (chờ gán lại); giữ {kept}")

def t_b2_negative():
    D, X = seed()
    db, W, mai = D.db, X['W'], X['mai']
    WM, WT = X['WM'], X['WT']
    cases = []
    def case(name, fn, pat=None):
        ok, msg = expect_fail(db, fn, pat)
        cases.append((name, ok, msg))
    bal = D.one("SELECT balance_minor FROM wallets WHERE id=?", WM)
    H, AU = X['au_hash'], X['au_id']
    case("revisions is_core=1, note NULL", lambda: D.ins('revisions', workspace_id=W, scope='role', role_id=mai, seq=4, major=3, minor=0, kind='core_edit', is_core=1, snapshot_json='{}', snapshot_hash='h', prompt_tokens=1))
    case("revisions is_core=1, note '  '", lambda: D.ins('revisions', workspace_id=W, scope='role', role_id=mai, seq=4, major=3, minor=0, kind='core_edit', is_core=1, note='  ', snapshot_json='{}', snapshot_hash='h', prompt_tokens=1))
    case("penalty không bằng chứng (task & audit NULL)", lambda: post(D, W, 'penalty', WM, WT, 1000, 'phạt', penalty_class='dissatisfaction'))
    case("penalty có rate thiếu basis", lambda: post(D, W, 'penalty', WM, WT, 1000, 'phạt', penalty_class='dissatisfaction', penalty_rate_bp=3000, task_id=X['tk2']))
    case("penalty sai tỷ lệ", lambda: post(D, W, 'penalty', WM, WT, 1, 'phạt', penalty_class='dissatisfaction', penalty_rate_bp=3000, basis_balance_minor=bal, task_id=X['tk2']))
    case("penalty căn cứ ≠ số dư (trigger IS NOT)", lambda: post(D, W, 'penalty', WM, WT, (10000 * 3000 + 5000) // 10000, 'phạt', penalty_class='dissatisfaction', penalty_rate_bp=3000, basis_balance_minor=10000, task_id=X['tk2']))
    case("penalty evidence_hash ≠ row_hash audit", lambda: post(D, W, 'penalty', WM, WT, 1000, 'phạt', penalty_class='dissatisfaction', task_id=X['tk2'], evidence_audit_id=AU, evidence_hash='giả'))
    case("ledger balance_after sai", lambda: D.ins('ledger_entries', workspace_id=W, entry_type='grant', debit_wallet_id=WT, credit_wallet_id=WM, amount_minor=10, debit_balance_after=0, credit_balance_after=0, reason='x', evidence_audit_id=AU, recorded_by=X['A'][(W, 'owner')]))
    case("ledger reason rỗng", lambda: post(D, W, 'grant', WT, WM, 10, '  ', evidence_audit_id=AU))
    case("reversal không reverses_entry_id", lambda: post(D, W, 'reversal', WM, WT, 10, 'đảo'))
    case("Role tự ghi ví", lambda: post(D, W, 'grant', WT, WM, 10, 'tự thưởng', evidence_audit_id=AU, recorded_by=X['A'][(W, 'Mai')]))
    case("vượt trần thưởng mỗi việc", lambda: post(D, W, 'reward', WT, WM, 10000, 'thưởng thêm', task_id=X['tk']))
    case("entry_type salary (bỏ ở v2.1)", lambda: post(D, W, 'salary', WT, WM, 4000, 'Lương ngày', evidence_audit_id=AU))
    case("thưởng cho việc chưa đánh giá", lambda: post(D, W, 'reward', WT, WM, 100, 'thưởng', task_id=X['tk2']))
    case("token_cost tự trừ ví ở MVP", lambda: post(D, W, 'token_cost', WM, X['WS'], 100, 'chi token', task_id=X['tk']), 'token_cost_to_wallet')
    asg = D.one("SELECT id FROM assignments WHERE role_id=?", mai)
    case("ttc penalty from_tier NULL", lambda: D.ins('trust_tier_changes', workspace_id=W, assignment_id=asg, role_id=mai, position_id=X['PS'], to_tier=1, kind='penalty', reason='x', decided_by=X['A'][(W, 'owner')]))
    case("ttc penalty to ≥ from", lambda: D.ins('trust_tier_changes', workspace_id=W, assignment_id=asg, role_id=mai, position_id=X['PS'], from_tier=3, to_tier=4, kind='penalty', reason='x', decided_by=X['A'][(W, 'owner')]))
    case("ttc from_tier lệch bậc hiện tại", lambda: D.ins('trust_tier_changes', workspace_id=W, assignment_id=asg, role_id=mai, position_id=X['PS'], from_tier=1, to_tier=2, kind='promotion', reason='x', decided_by=X['A'][(W, 'owner')]))
    case("actors kind=role có user_id", lambda: db.execute("INSERT INTO actors(id,workspace_id,kind,user_id,role_id,label) VALUES(?,?,?,?,?,?)", (uid('x1'), W, 'role', X['ryan'], X['lan'], 'x')))
    case("actors kind=role role_id NULL chưa purged", lambda: db.execute("INSERT INTO actors(id,workspace_id,kind,label) VALUES(?,?,?,?)", (uid('x2'), W, 'role', 'x')))
    case("memories superseded thiếu superseded_by", lambda: D.ins('memories', workspace_id=W, scope='position', position_id=X['PS'], kind='fact', content='x', confidence=0.5, source_type='owner', status='superseded', token_count=1))
    case("memories kind=commitment thiếu commitment_id", lambda: D.ins('memories', workspace_id=W, scope='position', position_id=X['PS'], kind='commitment', content='x', confidence=0.5, source_type='owner', token_count=1))
    case("dna_fields ai_inferred active chưa xác nhận", lambda: D.ins('dna_fields', workspace_id=W, role_id=mai, def_id=X['DEF']['identity.voice'], item_index=5, value_json='1', is_in_prompt=1, tokenizer='t', source='ai_inferred'))
    case("tasks verified thiếu verified_by", lambda: db.execute("UPDATE tasks SET verification='verified' WHERE id=?", (X['tk2'],)))
    case("change_set_items arc 0 cột", lambda: D.ins('change_set_items', workspace_id=W, change_set_id=X['cs'], op='update'))
    case("compiled segment dna_field thiếu FK", lambda: D.ins('compiled_prompt_segments', workspace_id=W, compiled_prompt_id=X['gc'], ordinal=999, layer='persona', source_kind='dna_field', source_display='x', text='x', token_count=1))
    case("employee_cards issued thiếu chữ ký", lambda: D.ins('employee_cards', workspace_id=W, role_id=mai, revision_id=X['rv1'], position_id=X['PS'], status='issued', issued_at=now(), checks_json='[]'))
    case("blobs path không có workspace", lambda: D.ins('blobs', workspace_id=W, sha256='ab' * 32, size_bytes=1, storage_path='/data/blobs/ab/ab/' + 'ab' * 32))
    case("engine cần consent mà thiếu", lambda: D.ins('engine_accounts', workspace_id=W, engine_slug='antigravity', label='Google phụ', auth_method='subscription', auth_volume='ga-auth-en-0099'))
    case("JSON hỏng", lambda: D.ins('settings', workspace_id=W, key='k', value_json='{oops'))
    # CHECK một mình (giả lập code/trigger có bug: bỏ trigger ví) — lời hứa ADR-E
    D2, X2 = seed()
    D2.db.execute("DROP TRIGGER IF EXISTS ledger_entries_bi")
    W2_, WM2, WT2 = X2['W'], X2['WM'], X2['WT']
    def raw_pen(**kw):
        b = dict(D2.db.execute("SELECT id, balance_minor FROM wallets WHERE id IN (?,?)", (WM2, WT2)).fetchall())
        a = kw.pop('amount')
        return D2.ins('ledger_entries', workspace_id=W2_, entry_type='penalty', debit_wallet_id=WM2, credit_wallet_id=WT2, amount_minor=a,
                      debit_balance_after=b[WM2] - a, credit_balance_after=b[WT2] + a, reason='phạt', recorded_by=X2['A'][(W2_, 'owner')], **kw)
    for name, kw in (("[chỉ CHECK] penalty không bằng chứng, 9.999,99 ₲", dict(amount=999999, penalty_class='dissatisfaction')),
                     ("[chỉ CHECK] penalty có rate thiếu basis", dict(amount=999, penalty_class='dissatisfaction', penalty_rate_bp=3000, task_id='x')),
                     ("[chỉ CHECK] harness thiếu audit", dict(amount=999, penalty_class='harness_violation', task_id='x'))):
        ok, msg = expect_fail(D2.db, lambda kw=kw: raw_pen(**dict(kw)), 'CHECK')
        cases.append((name, ok, msg))
    ttc = lambda: D2.ins('trust_tier_changes', workspace_id=W2_, assignment_id=D2.one("SELECT id FROM assignments WHERE role_id=?", X2['mai']),
                         role_id=X2['mai'], position_id=X2['PS'], to_tier=1, kind='penalty', reason='x', decided_by=X2['A'][(W2_, 'owner')])
    D2.db.execute("DROP TRIGGER IF EXISTS trust_tier_changes_bi")
    ok, msg = expect_fail(D2.db, ttc, 'CHECK'); cases.append(("[chỉ CHECK] ttc penalty from_tier NULL", ok, msg))
    n_ok = sum(1 for c in cases if c[1])
    report("B2-negative", n_ok == len(cases), f"{n_ok}/{len(cases)} ca âm bị chặn")
    for c in cases:
        if not c[1]:
            print("      ✗", c[0], "—", c[2])
    return cases

def t_b3_game():
    ctx = Ctx(); db = connect(ctx)
    db.execute("CREATE TABLE roles_v1(id TEXT PRIMARY KEY, archetype_id TEXT REFERENCES archetypes(id) ON DELETE SET NULL)")
    ok1, msg1 = expect_fail(db, lambda: db.execute("INSERT INTO roles_v1(id) VALUES('r0')"), "no such table")
    D, X = seed()
    db = D.db
    db.executescript("""
      BEGIN;
      CREATE TABLE archetypes(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), slug TEXT NOT NULL);
      CREATE TABLE tree_layouts(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
                                skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE, pos_x REAL, pos_y REAL, emphasis TEXT);
      ALTER TABLE roles ADD COLUMN archetype_id TEXT REFERENCES archetypes(id) ON DELETE SET NULL;
      CREATE INDEX ix_roles_archetype_id ON roles(archetype_id);
      COMMIT;
    """)
    W = X['W']
    ar = uid('ar6')
    db.execute("INSERT INTO archetypes VALUES(?,?,?)", (ar, W, 'tro-ly-ca-nhan'))
    db.execute("UPDATE roles SET archetype_id=? WHERE id=?", (ar, X['mai']))
    db.execute("INSERT INTO tree_layouts VALUES(?,?,?,?,?,?)", (uid('tl1'), W, X['SK'][1], 10, 20, 'keystone'))
    D.ins('roles', workspace_id=W, name='Hà', name_norm='ha', color='jade')
    db.execute("DELETE FROM archetypes WHERE id=?", (ar,))
    after = D.one("SELECT archetype_id FROM roles WHERE id=?", X['mai'])
    views_ok = db.execute("SELECT count(*) FROM v_roles").fetchone()[0] >= 3 and db.execute("SELECT count(*) FROM v_tree_nodes").fetchone()[0] > 0
    fk = db.execute("PRAGMA foreign_key_check").fetchall()
    report("B3-game", ok1 and after is None and views_ok and not fk,
           f"v1 tái hiện lỗi ({msg1}); GĐ2 chỉ cộng thêm: archetypes + ALTER roles.archetype_id, tree_layouts (trình bày) trỏ SK- một chiều; "
           f"ghi roles OK, SET NULL khi xoá archetype, view vẫn chạy, foreign_key_check rỗng")

def t_m1_wallet(perf=False):
    D, X = seed()
    db, W = D.db, X['W']
    WT, WM, WS_ = X['WT'], X['WM'], X['WS']
    ids = sorted([uid('n1'), uid('n2'), uid('n3')], reverse=True)
    try:
        for i in ids:
            post(D, W, 'grant', WT, WM, 100, 'cấp thêm', id=i, evidence_audit_id=X['au_id'])
        ok_nm = True; m = "3 bút toán ULID giảm dần: OK"
    except Exception as e:
        ok_nm = False; m = f"lỗi {e}"
    ok_d, msg_d = expect_fail(db, lambda: db.execute("UPDATE wallets SET balance_minor = balance_minor + 1 WHERE id=?", (WM,)))
    old = D.one("SELECT id FROM ledger_entries WHERE credit_wallet_id=? ORDER BY display_seq LIMIT 1", WM)
    ok_o, msg_o = expect_fail(db, lambda: db.execute("""UPDATE wallets SET last_entry_id=?, entry_count=entry_count+1,
        balance_minor=(SELECT credit_balance_after FROM ledger_entries WHERE id=?) WHERE id=?""", (old, old, WM)))
    plan = [r[3] for r in db.execute("""EXPLAIN QUERY PLAN SELECT 1 FROM ledger_entries e WHERE e.id = ? AND ? IN (e.debit_wallet_id, e.credit_wallet_id)""", ('x', 'y'))]
    msg = f"{m}; sửa tay số dư bị chặn; lùi last_entry_id về bút toán cũ bị chặn; plan guard: {plan}"
    if perf:
        db.execute("BEGIN")
        bt = D.one("SELECT balance_minor FROM wallets WHERE id=?", WT); bs = D.one("SELECT balance_minor FROM wallets WHERE id=?", WS_)
        n0 = D.one("SELECT last_seq FROM id_counters WHERE workspace_id=? AND prefix='LG'", W)
        own = X['A'][(W, 'owner')]
        db.execute("DROP TRIGGER IF EXISTS ledger_entries_ai"); db.execute("DROP TRIGGER IF EXISTS ledger_entries_bi")
        rows = []
        for i in range(300000):
            bt -= 1; bs += 1
            rows.append((uid(f'p{i}'), W, f"LG-{n0+i+1:04d}", n0 + i + 1, 'adjustment', WT, WS_, 1, bt, bs, 'x', own, own, X['au_id']))
        db.executemany("""INSERT INTO ledger_entries(id,workspace_id,display_id,display_seq,entry_type,debit_wallet_id,credit_wallet_id,amount_minor,
                          debit_balance_after,credit_balance_after,reason,recorded_by,created_by,evidence_audit_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", rows)
        last = rows[-1][0]
        db.execute("UPDATE id_counters SET last_seq=? WHERE workspace_id=? AND prefix='LG'", (n0 + 300000, W))
        db.execute("DROP TRIGGER IF EXISTS wallets_balance_guard")
        db.execute("UPDATE wallets SET balance_minor=?, last_entry_id=?, entry_count=entry_count+300000 WHERE id=?", (bt, last, WT))
        db.execute("UPDATE wallets SET balance_minor=?, last_entry_id=?, entry_count=entry_count+300000 WHERE id=?", (bs, last, WS_))
        db.execute("COMMIT")
        for s in [s for s in S.BUSINESS_TRIGGERS if 'ledger_entries_ai' in s or 'ledger_entries_bi' in s or 'wallets_balance_guard' in s]:
            db.execute(s)
        t = time.time()
        for i in range(200):
            post(D, W, 'adjustment', WT, WS_, 1, 'x', evidence_audit_id=X['au_id'])
        ms = (time.time() - t) / 200 * 1000
        msg += f"; 300k bút toán trên Kho bạc/Sink: {ms:.3f} ms/insert (gồm trigger ví + Trọng thương)"
    report("M1-wallet", ok_nm and ok_d and ok_o, msg)

def t_m2_rebuild():
    D, X = seed()
    db, ctx = D.db, D.ctx
    before = {t: D.one(f"SELECT count(*) FROM {t}") for t in ('roles', 'dna_fields', 'avatars', 'memories', 'engine_bindings', 'containers')}
    db.execute("BEGIN"); db.execute("PRAGMA foreign_keys=OFF")
    fk_in_txn = D.one("PRAGMA foreign_keys"); db.execute("ROLLBACK")
    def rebuild(table, new_cols_sql_fn):
        assert not db.in_transaction
        db.execute("PRAGMA foreign_keys=OFF")
        assert D.one("PRAGMA foreign_keys") == 0
        ctx.maint = 1
        db.execute("BEGIN IMMEDIATE")
        try:
            dep = db.execute("""SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND (
                   type='view' OR (type='trigger' AND (tbl_name=? OR sql LIKE '%' || ? || '%')) OR (type='index' AND tbl_name=?))
                   AND name NOT LIKE 'sqlite_autoindex%'""", (table, table, table)).fetchall()
            refs = [r[0] for r in db.execute("SELECT m.name FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.type='table' AND f.\"table\"=?", (table,))]
            cnt0 = {t: D.one(f"SELECT count(*) FROM {t}") for t in set(refs + [table])}
            for typ, name, sql in dep:
                if typ in ('view', 'trigger'):
                    db.execute(f"DROP {typ.upper()} IF EXISTS {name}")
            old_sql = D.one("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", table)
            new_sql = new_cols_sql_fn(old_sql).replace(f"CREATE TABLE {table}", f"CREATE TABLE {table}__new", 1)
            db.execute(new_sql)
            cols = ",".join(D.colset(table))
            db.execute(f"INSERT INTO {table}__new({cols}) SELECT {cols} FROM {table}")
            db.execute(f"DROP TABLE {table}")
            db.execute(f"ALTER TABLE {table}__new RENAME TO {table}")
            views = [d for d in dep if d[0] == 'view']
            for typ, name, sql in [d for d in dep if d[0] != 'view'] + views:
                db.execute(sql)
            cnt1 = {t: D.one(f"SELECT count(*) FROM {t}") for t in cnt0}
            fk = db.execute("PRAGMA foreign_key_check").fetchall()
            if cnt0 != cnt1 or fk:
                raise RuntimeError(f"rebuild: số dòng {cnt0}→{cnt1}, fk={fk[:3]}")
            db.execute("COMMIT")
            return cnt0
        except Exception:
            db.execute("ROLLBACK"); raise
        finally:
            ctx.maint = 0
            db.execute("PRAGMA foreign_keys=ON")
    try:
        rebuild('roles', lambda s: s.replace("description TEXT,", "description TEXT, nickname TEXT,", 1))
        after = {t: D.one(f"SELECT count(*) FROM {t}") for t in before}
        has = 'nickname' in [r[1] for r in db.execute("PRAGMA table_info(roles)")]
        v = db.execute("SELECT count(*) FROM v_roles").fetchone()[0]
        ok = before == after and has and fk_in_txn == 1 and v == 2
        nviews = D.one("SELECT count(*) FROM sqlite_master WHERE type='view'")
        report("M2-rebuild", ok, f"PRAGMA foreign_keys=OFF trong txn vẫn = {fk_in_txn} (tái hiện); runner rebuild roles giữ nguyên số dòng {after}, "
               f"{nviews} view + trigger phụ thuộc dựng lại, v_roles chạy ({v} hàng), foreign_key_check rỗng")
    except Exception as e:
        report("M2-rebuild", False, str(e))

def t_m4_jobs():
    D, X = seed()
    db, W, mai = D.db, X['W'], X['mai']
    key = f'brain:{mai}'
    sql = ("INSERT INTO jobs(id,workspace_id,display_id,display_seq,created_by,kind,run_after,dedupe_key,payload_json) "
           "VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id, dedupe_key) WHERE status = 'queued' AND dedupe_key IS NOT NULL DO NOTHING")
    def enq(tag):
        n = D.seq(W, 'JB')
        return db.execute(sql, (uid(tag), W, f'JB-{n:04d}', n, X['A'][(W, 'system')], 'brain_sync', now(), key, '{}')).rowcount
    r1 = enq('j-dup')
    db.execute("UPDATE jobs SET status='running', lease_owner='w1', lease_until=? WHERE dedupe_key=? AND status='queued'", (now(), key))
    r2 = enq('j-after-running')
    r3 = enq('j-dup2')
    q = D.one("SELECT count(*) FROM jobs WHERE dedupe_key=? AND status='queued'", key)
    report("M4-outbox", (r1, r2, r3, q) == (0, 1, 0, 1),
           f"queued trùng → gộp ({r1}); thay đổi đến khi job đang running → job queued mới ({r2}); trùng tiếp → gộp ({r3})")

def t_m5_audit():
    D, X = seed()
    db, W = D.db, X['W']
    for i in range(5):
        audit(D, W, 'dna_field.update', detail={'i': i})
    bad, head = verify_chain(D, W)
    ok0 = not bad
    ok1, m1 = expect_fail(db, lambda: db.execute("UPDATE audit_log SET reason='sửa lén' WHERE display_seq=2 AND workspace_id=?", (W,)))
    ok2, m2 = expect_fail(db, lambda: db.execute("DELETE FROM audit_log WHERE display_seq=2 AND workspace_id=?", (W,)))
    n = D.one("SELECT max(display_seq) FROM audit_log WHERE workspace_id=?", W)
    def raw(seq, prev):
        db.execute("""INSERT INTO audit_log(id,workspace_id,display_id,display_seq,created_by,actor_id,actor_label,actor_kind,action,result,channel,request_id,hash_key_id,prev_hash,row_hash)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (uid(f'raw{seq}{prev}'), W, f'AU-{seq:05d}', seq, D.owner_actor(W), D.owner_actor(W), 'x', 'user', 'x', 'ok', 'web', 'r', 'kek1', prev, 'h'))
    ok3, m3 = expect_fail(db, lambda: raw(n + 1, 'sai'))
    ok4, m4 = expect_fail(db, lambda: raw(n + 5, head))
    ok5, m5 = expect_fail(db, lambda: raw(n + 1, None))
    D.ctx.maint = 1
    db.execute("UPDATE audit_log SET reason='sửa lén' WHERE display_seq=3 AND workspace_id=?", (W,))
    D.ctx.maint = 0
    bad2, _ = verify_chain(D, W)
    import tempfile
    p = os.path.join(tempfile.mkdtemp(), 'x.db')
    dba = sqlite3.connect(p, isolation_level=None); dba.create_function("app_maint", 0, lambda: 0)
    dba.executescript("CREATE TABLE audit_log(id TEXT PRIMARY KEY, v TEXT); INSERT INTO audit_log VALUES('a','x');"
                      "CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log WHEN app_maint() = 0 BEGIN SELECT RAISE(ABORT,'append-only'); END;"); dba.close()
    dbc = sqlite3.connect(p, isolation_level=None)
    ok6, m6 = expect_fail(dbc, lambda: dbc.execute("UPDATE audit_log SET v='y'"), "no such function")
    ok = ok0 and ok1 and ok2 and ok3 and ok4 and ok5 and bad2 == [3] and ok6
    report("M5-audit", ok, f"chuỗi HMAC hợp lệ; UPDATE/DELETE bị chặn; prev_hash sai/nhảy số/NULL bị chặn; "
           f"sửa trong maintenance bị HMAC phát hiện ở dòng {bad2}; kết nối không có app_maint() → '{m6[:40]}' (fail-closed)")

def t_m6_tenant():
    D, X = seed()
    db, W, W2 = D.db, X['W'], X['W2']
    d_other = D.ins('dna_field_defs', workspace_id=W2, created_by=X['A'][(W2, 'owner')], key='custom.x', field_group='values', tier=2,
                    value_type='text', label_key='x', schema_version='1', is_core=1, prompt_layer='values')
    ok1, m1 = expect_fail(db, lambda: D.ins('dna_fields', workspace_id=W, role_id=X['mai'], def_id=d_other, value_json='1', tokenizer='t', source='owner'), 'tenant')
    d_own = D.ins('dna_field_defs', workspace_id=W, key='custom.y', field_group='style', tier=2, value_type='text', label_key='y',
                  schema_version='1', prompt_layer='style')
    D.ins('dna_fields', workspace_id=W, role_id=X['mai'], def_id=d_own, value_json='1', tokenizer='t', source='owner')
    D.ins('tasks', workspace_id=W2, assignee_role_id=X['mai'], requested_by=X['A'][(W2, 'owner')], source='web', title='trỏ chéo')
    found = db.execute("SELECT fk, n FROM v_integrity_tenant").fetchall()
    report("M6-tenant", ok1 and found == [('tasks.assignee_role_id', 1)],
           f"def của tenant khác bị chặn; def của mình + def hệ thống OK; trỏ chéo tenant ở FK đơn được v_integrity_tenant phát hiện: {found}")

def reserve(D, X, key, role=None):
    """Đặt chỗ tin chủ động: đối chiếu Polaris + hàng reserved trong CÙNG transaction (FK deferred)."""
    role = role or X['mai']; pid = uid('pn:' + key + str(time.perf_counter_ns()))
    def go():
        polaris(D, X['W'], role, 'proactive', rules='P3', proactive_send_id=pid)
        D.ins('proactive_sends', id=pid, workspace_id=X['W'], role_id=role, policy_id=X['pp'], trigger_kind='task_done', urgency='normal',
              day_local='2026-10-15', channel='telegram', status='reserved', reserved_until=now(), idempotency_key=key)
        return pid
    return D.txn(go)

def t_m7_appendonly():
    D, X = seed()
    db, W, mai = D.db, X['W'], X['mai']
    m = X['m3']
    ok1, _ = expect_fail(db, lambda: db.execute("UPDATE chat_messages SET content='sửa' WHERE id=?", (m,)))
    try:
        db.execute("UPDATE chat_messages SET status='redacted', content='[đã ẩn]', redacted_at=?, redacted_by=?, redact_reason='PII' WHERE id=?",
                   (now(), X['A'][(W, 'owner')], m)); ok2 = True
    except Exception:
        ok2 = False
    ok3, _ = expect_fail(db, lambda: db.execute("UPDATE chat_messages SET status='final' WHERE id=?", (m,)))
    s = D.ins('chat_messages', workspace_id=W, thread_id=D.one("SELECT thread_id FROM chat_messages WHERE id=?", m), author_kind='role', channel='telegram', content='Em đang đọc…', status='streaming')
    db.execute("UPDATE chat_messages SET content='Kết quả', status='final', tokens_out=40 WHERE id=?", (s,))
    ok4, _ = expect_fail(db, lambda: db.execute("UPDATE chat_messages SET content='lần 2' WHERE id=?", (s,)))
    db.execute("UPDATE chat_messages SET anchor_count=anchor_count+1 WHERE id=?", (s,))
    sent = 0
    for i in range(6):
        try:
            reserve(D, X, f'k{i}'); sent += 1
        except sqlite3.DatabaseError:
            pass
    pn = D.one("SELECT id FROM proactive_sends WHERE idempotency_key='k0'")
    db.execute("UPDATE proactive_sends SET status='sent', sent_at=? WHERE id=?", (now(), pn))
    ok5, _ = expect_fail(db, lambda: db.execute("UPDATE proactive_sends SET status='reserved' WHERE id=?", (pn,)))
    ok6, _ = expect_fail(db, lambda: reserve(D, X, f'cm:{X["cm"]}:120'))
    ok7, _ = expect_fail(db, lambda: db.execute("UPDATE sessions SET tokens_output=1 WHERE id=?", (X['ss1'],)))
    ok8, _ = expect_fail(db, lambda: db.execute("UPDATE employee_cards SET checks_json='[]' WHERE id=?", (X['cd4'],)))
    db.execute("UPDATE employee_cards SET status='revoked', revoked_at=?, revoke_reason='test' WHERE id=?", (now(), X['cd4']))
    ok = ok1 and ok2 and ok3 and ok4 and sent == 4 and ok5 and ok6 and ok7 and ok8
    report("M7-appendonly", ok, f"chat: sửa tin final bị chặn, redact được, không 'bỏ redact'; streaming→final 1 lần; cache sửa được; "
           f"proactive: đặt chỗ {sent}/6 (trần 5, đã có 1), sent→reserved bị chặn, idempotency trùng bị chặn; sessions đóng băng; thẻ đóng băng bằng chứng")

def t_minor_swap():
    D, X = seed()
    db, mai = D.db, X['mai']
    ok1, m1 = expect_fail(db, lambda: (db.execute("BEGIN"), db.execute("UPDATE engine_bindings SET priority = CASE priority WHEN 1 THEN 2 WHEN 2 THEN 1 ELSE priority END WHERE role_id=? AND deleted_at IS NULL", (mai,))))
    swap(D, mai)
    top = D.one("SELECT a.engine_slug FROM engine_bindings b JOIN engine_accounts a ON a.id=b.engine_account_id WHERE b.role_id=? AND b.priority=1", mai)
    report("minor-swap", ok1 and top == 'claude-code', f"đổi chỗ 1 lệnh bị UNIQUE chặn; 2 pha (+1000 rồi gán) OK → ưu tiên 1 = {top}")

def swap(D, role):
    db = D.db
    db.execute("BEGIN")
    db.execute("UPDATE engine_bindings SET priority = priority + 1000 WHERE role_id=? AND deleted_at IS NULL", (role,))
    db.execute("UPDATE engine_bindings SET priority = CASE priority WHEN 1001 THEN 2 WHEN 1002 THEN 1 ELSE priority - 1000 END WHERE role_id=? AND deleted_at IS NULL", (role,))
    db.execute("COMMIT")

BUDGET_COLS = ("engine_slug, dna_tokens, instruction_tokens, house_rules_tokens, position_tokens, skill_index_tokens, frame_tokens, polaris_tokens, "
               "compiled_tokens, runtime_overhead_tokens, total_default, conditional_worst_extra, total_worst, pending_delta, budget, headroom, "
               "budget_state, gate_ok, overhead_source")
def budget(D, role):
    return dict(zip([c.strip() for c in BUDGET_COLS.split(',')],
                    D.db.execute(f"SELECT {BUDGET_COLS} FROM v_role_prompt_budget WHERE role_id=?", (role,)).fetchone()))

def t_q2_budget():
    D, X = seed()
    b = budget(D, X['mai'])
    gc = D.one("SELECT total_tokens FROM compiled_prompts WHERE id=?", X['gc'])
    C = CANON
    exp = dict(engine_slug='antigravity', dna_tokens=C['dna'], instruction_tokens=C['ins'], house_rules_tokens=C['rules'],
               position_tokens=C['pos'], skill_index_tokens=C['sk'], frame_tokens=C['frame'], polaris_tokens=C['polaris'],
               compiled_tokens=C['compiled'], runtime_overhead_tokens=C['runtime'], total_default=C['default'],
               conditional_worst_extra=C['cond'], total_worst=C['worst'], pending_delta=C['pending'], budget=C['budget'],
               headroom=C['headroom'], budget_state=C['state'], gate_ok=1, overhead_source='measured')
    # v2.2 (D3): kịch bản duyệt đề xuất — đọc thẳng từ view, không cộng tay
    db = D.db
    def approve_in10(): db.execute("UPDATE instructions SET status='active' WHERE id=?", (X['INS'][10],))
    def approve_sk7(): db.execute("UPDATE role_skills SET status='learned' WHERE role_id=? AND skill_id=?", (X['mai'], X['SK'][7]))
    db.execute("SAVEPOINT s1"); approve_in10(); only10 = budget(D, X['mai'])['total_worst']; db.execute("ROLLBACK TO s1"); db.execute("RELEASE s1")
    db.execute("SAVEPOINT s2"); approve_sk7(); only7 = budget(D, X['mai'])['total_worst']; db.execute("ROLLBACK TO s2"); db.execute("RELEASE s2")
    db.execute("SAVEPOINT s3"); approve_in10(); approve_sk7(); b3 = budget(D, X['mai']); db.execute("ROLLBACK TO s3"); db.execute("RELEASE s3")
    both = (b3['total_default'], b3['total_worst'], b3['budget_state'])
    swap(D, X['mai'])
    b2 = budget(D, X['mai'])
    gc_cc = D.one("SELECT total_tokens FROM compiled_prompts WHERE id=?", X['gc_cc'])
    ok = b == exp and gc == b['compiled_tokens'] and (b2['engine_slug'], b2['skill_index_tokens'], b2['compiled_tokens'],
         b2['runtime_overhead_tokens'], b2['total_default'], b2['total_worst']) == ('claude-code', C['cc_sk'], C['cc_compiled'],
         C['cc_runtime'], C['cc_default'], C['cc_worst']) and gc_cc == b2['compiled_tokens'] \
         and both == (C['both_default'], C['both_worst'], 'over') and (only10, only7) == (C['only_in10_worst'], C['only_sk7_worst'])
    report("Q2-budget", ok,
           f"Mai (antigravity): DN {b['dna_tokens']} + IN {b['instruction_tokens']} + Nội quy {b['house_rules_tokens']} + Vị trí {b['position_tokens']} "
           f"+ Skill {b['skill_index_tokens']} + khung {b['frame_tokens']} + Polaris {b['polaris_tokens']} = biên dịch {b['compiled_tokens']} "
           f"(= compiled_prompts.total_tokens {gc}) + runtime {b['runtime_overhead_tokens']} = {b['total_default']} / {b['budget']}; "
           f"nặng nhất {b['total_worst']} ({b['budget_state']}, còn {b['headroom']}); chờ duyệt +{b['pending_delta']}; "
           f"engine chính = claude-code: skill {b2['skill_index_tokens']}, biên dịch {b2['compiled_tokens']}, runtime {b2['runtime_overhead_tokens']}, "
           f"tổng {b2['total_default']}, nặng nhất {b2['total_worst']}; duyệt cả IN-0010 + SK-0007 (view) → mặc định {both[0]}, nặng nhất {both[1]} ({both[2]}); "
           f"chỉ IN-0010 → {only10}, chỉ SK-0007 → {only7}")

def t_fts():
    D, X = seed()
    r = D.db.execute("""SELECT d.display_id FROM search_fts JOIN search_documents d ON d.id = search_fts.rowid
                        WHERE search_fts MATCH '"giao"* "ban"*' AND d.workspace_id = ?""", (X['W'],)).fetchall()
    report("fts", r == [('MM-0041',)], f"FTS5 external content + trigger đồng bộ: {r}")

# ================================================================== TESTS mới ở v2.1
def t_taxonomy():
    D, X = seed()
    db, W, TX = D.db, X['W'], X['TX']
    path = db.execute("SELECT group_name, branch_name, category_name, tier, anchor FROM v_tree_nodes WHERE display_id='SK-0001'").fetchone()
    kn = db.execute("SELECT domain, group_name, branch_name, category_name FROM v_tree_nodes WHERE node_id=?", (X['kn'],)).fetchone()
    tx = lambda **kw: D.ins('taxonomy_nodes', workspace_id=W, slug='x' + str(time.perf_counter_ns())[-8:], name_norm=kw.get('name', 'x').lower(),
                            source=kw.pop('source', 'owner'), **kw)
    cases = []
    def case(name, fn):
        ok, msg = expect_fail(db, fn); cases.append((name, ok, msg))
    case("phân hệ dưới chủng loại", lambda: tx(domain='skill', level='branch', name='Sai tầng', parent_id=TX['email']))
    case("chủng loại ngay dưới nhóm", lambda: tx(domain='skill', level='category', name='Nhảy tầng', parent_id=TX['office']))
    case("cha khác domain (tri thức dưới kỹ năng)", lambda: tx(domain='knowledge', level='branch', name='Lạc domain', parent_id=TX['office']))
    case("nhóm có cha", lambda: tx(domain='skill', level='group', name='Nhóm con', parent_id=TX['office']))
    case("AI tạo node active không duyệt", lambda: tx(domain='skill', level='branch', name='AI tự thêm', parent_id=TX['office'], source='ai_inferred'))
    case("AI đề xuất không qua change set", lambda: tx(domain='skill', level='branch', name='AI lén', parent_id=TX['office'], source='ai_inferred', status='proposed'))
    case("Trainer (system) tự duyệt node AI", lambda: db.execute("UPDATE taxonomy_nodes SET status='active', confirmed_at=?, confirmed_by=? WHERE id=?",
                                                               (now(), X['A'][(W, 'trainer')], TX['meeting'])))
    case("skills.category_id trỏ vào phân hệ", lambda: db.execute("UPDATE skills SET category_id=? WHERE id=?", (TX['comm'], X['SK'][1])))
    case("đề xuất cây nằm trong change set cấp Role", lambda: tx(domain='skill', level='branch', name='AI qua CS Role', parent_id=TX['office'],
                                                                   source='ai_inferred', status='proposed', change_set_id=X['cs_role']))
    case("tri thức gắn chủng loại của cây kỹ năng", lambda: db.execute("UPDATE knowledge_items SET category_id=? WHERE id=?", (TX['email'], X['kn'])))
    db.execute("UPDATE taxonomy_nodes SET status='active', confirmed_at=?, confirmed_by=? WHERE id=?", (now(), X['A'][(W, 'owner')], TX['meeting']))
    approved = D.one("SELECT status FROM taxonomy_nodes WHERE id=?", TX['meeting'])
    db.execute("UPDATE skills SET category_id=? WHERE id=?", (TX['meeting'], X['SK'][7]))
    n_ok = sum(1 for c in cases if c[1])
    ok = (path == ('Văn phòng', 'Giao tiếp', 'Email', 2, 'tree:skills/node:SK-0001') and kn == ('knowledge', 'Tài liệu công ty', 'Sản phẩm', 'Bảng giá')
          and n_ok == len(cases) and approved == 'active')
    report("TX-taxonomy", ok, f"3 tầng nhóm→phân hệ→chủng loại cho skill ({' › '.join(path[:3])}, anchor {path[4]}) và tri thức ({' › '.join(kn[1:])}); "
           f"{n_ok}/{len(cases)} ca âm bị chặn (sai tầng, khác domain, AI tự kích hoạt, Trainer tự duyệt, gắn sai tầng, đề xuất thư viện trong change set cấp Role); owner duyệt node AI → active")
    for c in cases:
        if not c[1]: print("      ✗", c[0], "—", c[2])

def t_prereq():
    D, X = seed()
    db, W, SK = D.db, X['W'], X['SK']
    edge = lambda s, r, kind='requires', **kw: D.ins('skill_prereqs', workspace_id=W, skill_id=SK[s], requires_skill_id=SK[r], kind=kind, source='owner', **kw)
    ok_cyc, m_cyc = expect_fail(db, lambda: edge(3, 7))                    # 7→2→3→7
    ok_self, _ = expect_fail(db, lambda: edge(3, 3))
    ok_up, m_up = expect_fail(db, lambda: edge(2, 1, 'upgrade'))           # khác chủng loại
    ok_up2, _ = expect_fail(db, lambda: edge(1, 2, 'upgrade'))             # SK-0001 đã có một bậc trước
    cross = edge(5, 3)                                                     # chéo nhánh (Email cần Lịch & cam kết): hợp lệ
    e = D.one("SELECT id FROM skill_prereqs WHERE skill_id=? AND requires_skill_id=?", SK[4], SK[3])
    ok_ucyc, _ = expect_fail(db, lambda: db.execute("UPDATE skill_prereqs SET skill_id=?, requires_skill_id=? WHERE id=?", (SK[3], SK[1], e)) and
                             db.execute("UPDATE skill_prereqs SET requires_skill_id=? WHERE skill_id=? AND requires_skill_id=?", (SK[3], SK[5], SK[3])))
    tiers = dict(db.execute("SELECT display_id, tier FROM v_tree_nodes WHERE domain='skill'").fetchall())
    st = dict(db.execute("SELECT display_id, node_state FROM v_role_skill_tree WHERE role_id=?", (X['mai'],)).fetchall())
    newsk = D.ins('skills', workspace_id=W, slug='doi-soat-hoa-don', origin='owner', category_id=X['TX']['voucher'])
    D.ins('skill_prereqs', workspace_id=W, skill_id=newsk, requires_skill_id=SK[6], kind='upgrade', source='owner')
    st2 = dict(db.execute("SELECT skill_id, node_state FROM v_role_skill_tree WHERE role_id=?", (X['mai'],)).fetchall())
    ok = (ok_cyc and ok_self and ok_up and ok_up2 and cross and tiers.get('SK-0005') == 1 and tiers.get('SK-0001') == 2
          and tiers.get('SK-0004') == 2 and tiers.get('SK-0003') == 1 and st.get('SK-0007') == 'proposed' and st.get('SK-0001') == 'learned'
          and st2.get(newsk) == 'locked')
    report("PRQ-cycle", ok, f"vòng tiên quyết bị chặn ({m_cyc[:50]}); tự trỏ bị chặn; upgrade khác chủng loại bị chặn; 1 bậc trước/node; "
           f"chéo nhánh (requires) hợp lệ; bậc tính từ chuỗi upgrade: SK-0005=1→SK-0001=2, SK-0003=1→SK-0004=2 (độ dài tuỳ nhánh); "
           f"trạng thái node của Mai: SK-0007 proposed, node cần SK-0006 (đang tắt) = locked")

def t_in_core():
    D, X = seed()
    db, W, mai, A = D.db, X['W'], X['mai'], X['A']
    rv = lambda seq, major, minor, core, note=None: D.ins('revisions', workspace_id=W, scope='role', role_id=mai, seq=seq, major=major, minor=minor,
                                                       kind='core_edit' if core else 'edit', is_core=core, note=note, snapshot_json='{}',
                                                       snapshot_hash='h', prompt_tokens=1)
    cases = []
    def case(name, fn):
        ok, msg = expect_fail(db, fn); cases.append((name, ok, msg))
    case("IN lớp values với is_core=0", lambda: D.ins('instructions', workspace_id=W, role_id=mai, layer='values', ordinal=99, name='x', content='x',
                                                      is_core=0, tokenizer='t', source='owner', content_hash='c'))
    case("IN lớp style đánh dấu lõi", lambda: D.ins('instructions', workspace_id=W, role_id=mai, layer='style', ordinal=99, name='x', content='x',
                                                    is_core=1, tokenizer='t', source='owner', content_hash='c'))
    case("def DN style đánh dấu lõi", lambda: D.ins('dna_field_defs', workspace_id=W, key='style.x', field_group='style', tier=1, value_type='text',
                                                    label_key='x', schema_version='1', is_core=1, prompt_layer='style'))
    rv4 = rv(4, 2, 2, 0)                                                   # thường: 2.1 → 2.2
    case("sửa IN-0004 (tính cách, lõi) trong revision thường", lambda: D.ins('instruction_versions', workspace_id=W, instruction_id=X['INS'][4],
         version=2, status='accepted', data='{}', token_count=90, revision_id=rv4, decided_at=now(), decided_by=A[(W, 'owner')]))
    case("sửa DN-0009 (traits, lõi) trong revision thường", lambda: D.ins('dna_field_versions', workspace_id=W, dna_field_id=X['DN'][9],
         version=2, status='accepted', data='{}', token_count=30, revision_id=rv4, decided_at=now(), decided_by=A[(W, 'owner')]))
    case("revision lõi không tăng major", lambda: rv(5, 2, 0, 1, 'Hạ tận tâm'))
    case("revision lõi minor ≠ 0", lambda: rv(5, 3, 1, 1, 'Hạ tận tâm'))
    case("revision lõi thiếu lý do", lambda: rv(5, 3, 0, 1))
    case("revision thường nhảy minor", lambda: rv(5, 2, 4, 0))
    v_style = D.ins('instruction_versions', workspace_id=W, instruction_id=X['INS'][5], version=2, status='accepted', data='{}', token_count=110,
                    revision_id=rv4, decided_at=now(), decided_by=A[(W, 'owner')])        # phong cách: có version, KHÔNG lõi
    rv5 = rv(5, 3, 0, 1, 'Hạ tận tâm')
    v_core = D.ins('instruction_versions', workspace_id=W, instruction_id=X['INS'][4], version=2, status='accepted', data='{}', token_count=90,
                   revision_id=rv5, decided_at=now(), decided_by=A[(W, 'owner')])
    label = D.one("SELECT 'v' || major || '.' || minor FROM revisions WHERE id=?", rv5)
    n_ok = sum(1 for c in cases if c[1])
    report("IN-core", n_ok == len(cases) and v_style and v_core and label == 'v3.0',
           f"{n_ok}/{len(cases)} ca âm bị chặn: lõi = đúng lớp giá trị/tính cách (IN + DN); sửa khối lõi chỉ trong revision lõi; "
           f"revision lõi = major+1, minor 0, bắt lý do; phong cách (IN-0005) có version nhưng không lõi; sửa IN-0004 → {label}")
    for c in cases:
        if not c[1]: print("      ✗", c[0], "—", c[2])

def t_budget_runtime():
    D, X = seed()
    db, W, mai, lan = D.db, X['W'], X['mai'], X['lan']
    ok_ov, m_ov = expect_fail(db, lambda: db.execute("UPDATE engine_accounts SET runtime_overhead_tokens=999 WHERE id=?", (X['EN']['mai_ag'],)))
    bl = budget(D, lan)
    D.ins('tool_grants', workspace_id=W, tool_id=X['tl'], role_id=lan, mode='allow')
    bl2 = budget(D, lan)
    states = []
    for b in (2600, 2000, 1880):
        db.execute("UPDATE roles SET prompt_budget_tokens=? WHERE id=?", (b, mai))
        states.append(budget(D, mai)['budget_state'])
    ok = (ok_ov and bl['overhead_source'] == 'estimated' and bl['runtime_overhead_tokens'] == 225 and bl['gate_ok'] == 0
          and bl2['runtime_overhead_tokens'] == 271 and states == ['ok', 'near', 'over'])
    report("BUDGET-runtime", ok, f"overhead ≠ (phiên baseline vỏ+tool − phiên trần) bị chặn ({m_ov[:45]}); Lan chưa đo → ước lượng 225 (max đo Antigravity 204 × 1,1, v2.2.3), "
           f"cổng Cấp thẻ đóng (gate_ok = card_ok = 0; Ký xem GATE-sign-card); cấp thêm tool không built-in (+46 token định nghĩa) → runtime {bl2['runtime_overhead_tokens']}; "
           f"một quy tắc màu trên total_worst 1.889: ngân sách 2.600/2.000/1.880 → {states}")

def t_polaris_prompt():
    D, X = seed()
    db, W = D.db, X['W']
    order = [r for r in db.execute("SELECT ordinal, source_kind, is_conditional FROM compiled_prompt_segments WHERE compiled_prompt_id=? "
                                   "AND source_kind <> 'frame' ORDER BY ordinal", (X['gc_worst'],))]
    last_is_polaris = order[-1][1] == 'polaris' and order[-2][2] == 1
    gc = D.ins('compiled_prompts', workspace_id=W, role_id=X['mai'], revision_id=X['rv2'], engine_slug='antigravity', context_key='default',
               compiler_version='c1', tokenizer='t', total_tokens=10, frame_tokens=0, budget_tokens=2000, status='ok', content='.',
               content_hash='x', stable_prefix_hash='p')
    seg = lambda o, **kw: D.ins('compiled_prompt_segments', workspace_id=W, compiled_prompt_id=gc, ordinal=o, source_display='x', text='.', **kw)
    seg(10, layer='polaris', source_kind='polaris', token_count=70)
    ok1, m1 = expect_fail(db, lambda: seg(11, layer='values', source_kind='instruction', instruction_version_id=D.one(
        "SELECT id FROM instruction_versions WHERE instruction_id=?", X['INS'][1]), token_count=5))
    ok2, _ = expect_fail(db, lambda: seg(12, layer='frame', source_kind='polaris', token_count=5))
    try:                                                     # v2.2.2: khối > 80 KHÔNG bị chặn (chỉ cảnh báo ở view)
        seg(13, layer='polaris', source_kind='polaris', token_count=81); ok3 = True
    except sqlite3.DatabaseError:
        ok3 = False
    b = budget(D, X['mai'])
    ok = last_is_polaris and ok1 and ok2 and ok3 and b['polaris_tokens'] == POLARIS_TOKENS
    report("POLARIS-prompt", ok, f"bản 'worst' đúng thứ tự luôn → có điều kiện (IN-0006) → Polaris; chèn khối luôn sau Polaris bị chặn ({m1[:40]}); "
           f"khối Polaris > 80 token không còn bị chặn (v2.2.2: cảnh báo, không chặn); khối Polaris ({b['polaris_tokens']} token) nằm trong ngân sách và cổng ≤2.000")

def make_carded_role(D, X, name, color='jade'):
    W, A = X['W'], X['A']
    def go():
        r = D.ins('roles', workspace_id=W, name=name, name_norm=name.lower(), color=color, lifecycle_status='carded', born_at=now(),
                  registry_no='GA-7K2Q-' + str(time.perf_counter_ns())[-4:])
        rv = D.ins('revisions', workspace_id=W, scope='role', role_id=r, seq=1, major=1, minor=0, kind='birth', is_core=1, note='Khai sinh',
                   snapshot_json='{}', snapshot_hash='h', prompt_tokens=1)
        wl = D.ins('wallets', workspace_id=W, owner_kind='role', role_id=r)
        cid = uid('card:' + name)
        au, _ = audit(D, W, 'card.issue', entity_id=cid)
        D.ins('employee_cards', id=cid, workspace_id=W, role_id=r, revision_id=rv, position_id=X['PS2'], status='issued', issued_at=now(),
              issued_by=A[(W, 'owner')], dna_signature='sha256:x', issue_audit_id=au, checks_json='[]')
        post(D, W, 'activation_grant', X['WT'], wl, 100000, 'Vốn kích hoạt', card_id=cid, evidence_audit_id=au, role_id=r,
             idempotency_key=f'activate:{r}', recorded_by=A[(W, 'system')])
        return r, wl
    return D.txn(go)

def t_polaris_board():
    D, X = seed()
    db, W, mai, lan = D.db, X['W'], X['mai'], X['lan']
    lb = lambda: {r[0]: (r[1], r[2], r[3]) for r in db.execute("SELECT display_id, rank, total_roles, gap_to_next_minor FROM v_leaderboard")}
    b0 = lb()
    balM = D.one("SELECT balance_minor FROM wallets WHERE id=?", X['WM'])
    au, _ = audit(D, W, 'wallet.grant', entity_id=lan)
    post(D, W, 'grant', X['WT'], X['WL'], balM, 'Owner cấp thêm cho Lan (hồi phục)', evidence_audit_id=au, role_id=lan)
    ha, _ = make_carded_role(D, X, 'Hà')
    b1 = lb()
    pol = db.execute("SELECT goal_value_json, rank, total_roles, last_penalty_display_id, condition, open_opportunities FROM v_role_polaris WHERE role_id=?",
                     (mai,)).fetchone()
    ok_tie = (b0['RL-0001'][:2] == (1, 2) and b0['RL-0002'][:3] == (2, 2, balM)
              and b1['RL-0001'][:2] == (1, 3) and b1['RL-0002'][:2] == (1, 3) and [v for k, v in b1.items() if k not in ('RL-0001', 'RL-0002')][0][:3] == (3, 3, balM - 100000))
    # đối chiếu Polaris bắt buộc cho hành động do Role khởi xướng
    cs_id = uid('cs:mai-propose')
    ok1, m1 = expect_fail(db, lambda: D.ins('change_sets', id=cs_id, workspace_id=W, scope='role', role_id=mai, proposed_by=X['A'][(W, 'Mai')], title='Mai đề xuất'))
    D.txn(lambda: (polaris(D, W, mai, 'proposal', gain=15000, rules='P1,P2', change_set_id=cs_id),
                   D.ins('change_sets', id=cs_id, workspace_id=W, scope='role', role_id=mai, proposed_by=X['A'][(W, 'Mai')], title='Mai đề xuất')))
    ok2, _ = expect_fail(db, lambda: D.ins('permission_requests', workspace_id=W, role_id=mai, requested_tool_slug='gmail.send', reason='gửi thư'))
    ok3, _ = expect_fail(db, lambda: db.execute("UPDATE tasks SET status='running', assignee_role_id=? WHERE id=?", (mai, X['tk_open'])))
    D.txn(lambda: (polaris(D, W, mai, 'task_accept', gain=8000, rules='P1', task_id=X['tk_open']),
                   db.execute("UPDATE tasks SET status='running', assignee_role_id=? WHERE id=?", (mai, X['tk_open']))))
    ok4, _ = expect_fail(db, lambda: D.ins('polaris_checks', workspace_id=W, role_id=mai, subject_kind='proposal', task_id=X['tk'],
                                           expected_gain_minor=0, rules_applied='P1'))
    n_checks = D.one("SELECT count(*) FROM polaris_checks WHERE role_id=?", mai)
    ok = ok_tie and pol[:5] == ('"gen_coin"', 1, 3, 'LG-' + D.one("SELECT substr(display_id,4) FROM ledger_entries WHERE id=?", X['pen']), 'normal') \
         and pol[5] >= 1 and ok1 and ok2 and ok3 and ok4 and n_checks == 5
    report("POLARIS-board", ok, f"leaderboard: Mai #1/2, Lan #2 (Trọng thương, 0 ₲, cách {balM // 100:,} ₲); owner cấp Lan đúng bằng số dư Mai → hồi phục + đồng hạng #1 (RANK 1,1,3), Hà #3; "
           f"v_role_polaris Mai: đích {pol[0]}, hạng {pol[1]}/{pol[2]}, phạt gần nhất {pol[3]}, cơ hội mở {pol[5]}; "
           f"đề xuất / xin quyền / nhận việc của Role thiếu polaris_checks bị chặn ({m1[:40]}); có đối chiếu thì qua; arc sai loại bị chặn")

def t_no_session_token():
    D, X = seed()
    db = D.db
    rx = re.compile(r"token|secret|password|cookie|oauth|credential|refresh|bearer|session_key|auth_code|api_key", re.I)
    TEXT_ALLOW = {'token_hash', 'password_hash', 'token_last4', 'secret_id', 'tokenizer', 'password_changed_at', 'rotated_from_id'}
    bad = []
    for t in S.MVP_TABLES:
        for cid, name, typ, *_ in db.execute(f"PRAGMA table_info({t})"):
            if rx.search(name) and typ.upper() != 'INTEGER' and name not in TEXT_ALLOW:
                bad.append(f"{t}.{name}")
    allow_where = {'token_hash': {'auth_sessions'}, 'password_hash': {'users'}}
    misplaced = [f"{t}.{c}" for c, ts in allow_where.items() for t in S.MVP_TABLES if c in D.colset(t) and t not in ts]
    ok1, _ = expect_fail(db, lambda: D.ins('secrets', workspace_id=X['W'], kind='oauth_token', label='x', ciphertext=b'x', nonce=b'n',
                                           wrapped_dek=b'd', dek_nonce=b'n', kek_id='k', fingerprint='f'))
    jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyeWFuIn0.' + 'a' * 40
    ok2, _ = expect_fail(db, lambda: db.execute("UPDATE engine_accounts SET auth_volume=? WHERE id=?", (jwt, X['EN']['mai_cc'])))
    ok3, _ = expect_fail(db, lambda: db.execute("UPDATE engine_accounts SET auth_volume=? WHERE id=?", ('x' * 80, X['EN']['mai_cc'])))
    FORBID = {'password_hash', 'token_hash', 'ciphertext', 'wrapped_dek', 'nonce', 'dek_nonce'}
    leaks = [(v, c) for (v,) in db.execute("SELECT name FROM sqlite_master WHERE type='view'")
             for c in [r[1] for r in db.execute(f"PRAGMA table_info({v})")] if c in FORBID]
    ok = not bad and not misplaced and ok1 and ok2 and ok3 and not leaks
    report("NO-session-token", ok, f"lint {sum(len(D.colset(t)) for t in S.MVP_TABLES)} cột: 0 cột TEXT có thể chứa token/secret/OAuth ngoài allowlist "
           f"(token_hash chỉ ở auth_sessions, password_hash chỉ ở users) {bad or ''}; secrets.kind 'oauth_token' bị chặn; auth_volume nhận JWT/80 ký tự bị chặn; "
           f"0 view lộ password_hash/token_hash/ciphertext {leaks or ''}")

def t_qr1_binding():
    D, X = seed()
    db, W, EN, A = D.db, X['W'], X['EN'], X['A']
    ok1, m1 = expect_fail(db, lambda: D.ins('engine_bindings', workspace_id=W, role_id=X['lan'], engine_account_id=EN['mai_cc'], priority=2),
                          'UNIQUE')                              # v2.2.8: EN-0004 (Claude Code) — Lan chưa có loại này, chỉ ux_eb_account chặn
    ok2, _ = expect_fail(db, lambda: D.ins('engine_bindings', workspace_id=W, consumer_kind='system', engine_account_id=EN['mai_cc'], priority=3))
    vy = D.ins('roles', workspace_id=W, name='Vy', name_norm='vy', color='orchid')
    acc = D.ins('engine_accounts', workspace_id=W, engine_slug='claude-code', label='Anthropic — Vy', auth_method='subscription', auth_volume='ga-auth-en-0006')
    ok3, m3 = expect_fail(db, lambda: D.ins('engine_bindings', workspace_id=W, role_id=vy, engine_account_id=acc, priority=1))
    D.ins('containers', workspace_id=W, kind='role', role_id=vy, container_name='ga-role-vy', desired_state='sleeping', observed_state='created')
    D.ins('engine_bindings', workspace_id=W, role_id=vy, engine_account_id=acc, priority=1)          # A4: container ngủ có trước → gán được
    ok4, _ = expect_fail(db, lambda: D.ins('system_agents', workspace_id=W, system_key='judge', engine_binding_id=X['EB']['mai_ag']),
                         'engine_binding_id')                    # v2.2.6 (A3): không còn cột — tác tử không chọn tài khoản
    mounts = db.execute("SELECT container_display_id, kind, volume_name, mount_path FROM v_container_mounts WHERE volume_kind='auth' ORDER BY volume_name").fetchall()
    per_vol = {}
    for c, k, v, p in mounts:
        per_vol.setdefault(v, []).append(c)
    no_brain = D.one("SELECT count(*) FROM v_container_mounts WHERE mount_path IN ('/brain', '/position', '/workspace')") == 0   # v2.2.4: /workspace = GĐ2
    integ = [r for r in db.execute("SELECT * FROM v_integrity") if r[0] == 'auth_volume_multi_mount']
    db.execute("UPDATE engine_bindings SET deleted_at=? WHERE id=?", (now(), X['EB']['mai_cc']))   # nới: gỡ khỏi Mai rồi gán lại
    D.ins('engine_bindings', workspace_id=W, role_id=X['lan'], engine_account_id=EN['mai_cc'], priority=2)
    ok = ok1 and ok2 and ok3 and ok4 and all(len(v) == 1 for v in per_vol.values()) and len(per_vol) == 5 and no_brain and not integ
    report("QR1-binding", ok, f"một tài khoản = một consumer: gán EN của Mai cho Lan / cho Hệ thống bị UNIQUE chặn ({m1[:40]}); Mai vẫn có 2 tài khoản "
           f"= 2 loại CLI (fallback, v2.2.8); gán khi chưa có container của consumer bị chặn ({m3[:40]}); system_agents không có cột chọn tài khoản (v2.2.6: suy ra); "
           f"{len(per_vol)} volume /auth, mỗi volume đúng 1 container; không mount /brain, /position, /workspace (GĐ2); gỡ rồi gán lại được (đường nới lỏng)")

def wound_mai(D, X, cls='harness_violation'):
    """Phạt nặng nhất (vi phạm luật harness, 100% số dư) → ví Mai về 0 ₲."""
    W = X['W']
    au, h = audit(D, W, 'harness.violation', entity_id=X['tk2'], actor=X['A'][(W, 'gateway')], detail={'rule': 'tự sửa tiêu chí đánh giá'})
    bal = D.one("SELECT balance_minor FROM wallets WHERE id=?", X['WM'])
    return post(D, W, 'penalty', X['WM'], X['WT'], bal, 'Vi phạm luật harness để leo hạng', penalty_class=cls, penalty_rate_bp=10000,
                basis_balance_minor=bal, task_id=X['tk2'], evidence_audit_id=au, evidence_hash=h, role_id=X['mai'])

def t_qr3_economy():
    D, X = seed()
    db, W, mai, A = D.db, X['W'], X['mai'], X['A']
    WM, WT = X['WM'], X['WT']
    cases = []
    def case(name, fn, pat=None):
        ok, msg = expect_fail(db, fn, pat); cases.append((name, ok, msg))
    cd = D.one("SELECT id FROM employee_cards WHERE role_id=? AND status='issued'", mai)
    aud = D.one("SELECT issue_audit_id FROM employee_cards WHERE id=?", cd)
    case("vốn kích hoạt lần 2 cho cùng Role", lambda: post(D, W, 'activation_grant', WT, WM, 100000, 'x', card_id=cd, evidence_audit_id=aud,
                                                           role_id=mai, idempotency_key=f'activate:{mai}', recorded_by=A[(W, 'system')]))
    vy, wv = None, None
    case("vốn kích hoạt sai số tiền (≠ setting)", lambda: post(D, W, 'activation_grant', WT, X['WL'], 5000, 'x', card_id=cd, evidence_audit_id=aud,
                                                              role_id=X['lan'], idempotency_key=f"activate:{X['lan']}x", recorded_by=A[(W, 'system')]))
    case("phạt vượt số dư (ví âm)", lambda: post(D, W, 'penalty', WM, WT, 10 ** 9, 'phạt', penalty_class='dissatisfaction', task_id=X['tk2']))
    case("ví Role cho phép âm", lambda: D.ins('wallets', workspace_id=W, owner_kind='role', role_id=X['lan'], allow_negative=1))
    case("phạt không bằng chứng", lambda: post(D, W, 'penalty', WM, WT, 100, 'phạt', penalty_class='dissatisfaction'))
    case("phạt không lý do", lambda: post(D, W, 'penalty', WM, WT, 100, '   ', penalty_class='dissatisfaction', task_id=X['tk2']))
    case("harness dưới mức nặng nhất", lambda: post(D, W, 'penalty', WM, WT, 3000, 'phạt', penalty_class='harness_violation', penalty_rate_bp=3000,
                                                    basis_balance_minor=10000, task_id=X['tk2'], evidence_audit_id=X['au_id']))
    custom = post(D, W, 'penalty', WM, WT, 1500, 'Trễ hạn báo cáo (owner tự nhập mức)', penalty_class='dissatisfaction', task_id=X['tk2'])
    wound_mai(D, X)
    wnd = db.execute("SELECT display_id, ended_at, reflection_job_id FROM role_wounds WHERE role_id=?", (mai,)).fetchone()
    cond = D.one("SELECT condition FROM roles WHERE id=?", mai)
    att = D.one("SELECT count(*) FROM v_attention WHERE target=? AND level='danger'", wnd[0])
    case("Trọng thương: giao việc mới", lambda: D.ins('tasks', workspace_id=W, position_id=X['PS'], assignee_role_id=mai, requested_by=A[(W, 'owner')], source='web', title='việc mới'))
    case("Trọng thương: phiên làm việc / heartbeat", lambda: D.ins('sessions', workspace_id=W, agent_kind='role', role_id=mai, trigger='heartbeat', started_at=now()))
    case("Trọng thương: tin chủ động", lambda: reserve(D, X, 'wounded-1'))
    case("Trọng thương: đánh thức container", lambda: db.execute("UPDATE containers SET desired_state='running' WHERE id=?", (X['CT']['Mai'],)))
    case("Trọng thương: phạt tiếp khi đã 0 ₲", lambda: post(D, W, 'penalty', WM, WT, 1, 'phạt', penalty_class='dissatisfaction', task_id=X['tk2']))
    refl = D.ins('sessions', workspace_id=W, agent_kind='consolidator', role_id=mai, trigger='reflection', engine_account_id=X['EN']['sys_ag'],
                 container_id=X['CT']['sys'], started_at=now())                                      # tự xét lỗi vẫn chạy được (AI Hệ thống)
    au, _ = audit(D, W, 'wallet.grant', entity_id=mai, reason='Owner cấp thêm để Mai hồi phục')
    post(D, W, 'grant', WT, WM, 5000, 'Owner cấp thêm — hồi phục sau Trọng thương', evidence_audit_id=au, role_id=mai)
    wnd2 = db.execute("SELECT ended_at IS NOT NULL, revive_entry_id IS NOT NULL FROM role_wounds WHERE role_id=?", (mai,)).fetchone()
    cond2 = D.one("SELECT condition FROM roles WHERE id=?", mai)
    tk_new = D.ins('tasks', workspace_id=W, position_id=X['PS'], assignee_role_id=mai, requested_by=A[(W, 'owner')], source='web', title='việc sau hồi phục')
    case("token_cost tự trừ ví (MVP tắt)", lambda: post(D, W, 'token_cost', WM, X['WS'], 100, 'chi token', task_id=X['tk']), 'token_cost_to_wallet')
    D.ins('settings', workspace_id=W, key='economy.token_cost_to_wallet', value_json='true')        # đổi ý (GĐ2/Ryan) = 1 setting
    post(D, W, 'token_cost', WM, X['WS'], 100, 'chi token', task_id=X['tk'])                          # owner ghi được
    case("actor system ghi token_cost (v2.1.1: system chỉ ghi vốn kích hoạt)",
         lambda: post(D, W, 'token_cost', WM, X['WS'], 100, 'chi token', task_id=X['tk'], recorded_by=A[(W, 'system')]), 'MVP chỉ owner')
    n_ok = sum(1 for c in cases if c[1])
    integ = db.execute("SELECT * FROM v_integrity").fetchall()
    ok = (n_ok == len(cases) and custom and cond == 'wounded' and wnd[1] is None and att == 1 and refl and wnd2 == (1, 1)
          and cond2 == 'normal' and tk_new and not integ)
    report("QR3-economy", ok, f"{n_ok}/{len(cases)} ca âm bị chặn (vốn kích hoạt đúng 1 lần & đúng setting 1.000 ₲; sàn 0; phạt cần bằng chứng + lý do; "
           f"harness = mức nặng nhất; khi Trọng thương: không nhận việc / không phiên / không nhắn / container chỉ ngủ; MVP không trừ token); "
           f"phạt tự nhập mức OK; về 0 ₲ → {wnd[0]} (roles.condition={cond}, A0 'Cần bạn chú ý' báo 1 dòng); phiên tự xét lỗi của AI Hệ thống vẫn chạy; "
           f"owner cấp 50 ₲ → hồi phục ({cond2}) và nhận việc lại; bật setting thì owner ghi token_cost được (actor system: không — v2.1.1)")
    for c in cases:
        if not c[1]: print("      ✗", c[0], "—", c[2])

def t_reflection():
    D, X = seed()
    db, W, mai, A = D.db, X['W'], X['mai'], X['A']
    pen = wound_mai(D, X)
    jobs = db.execute("SELECT id, dedupe_key, json_extract(payload_json,'$.system_agent') FROM jobs WHERE kind='wound_reflection' "
                      "AND json_extract(payload_json,'$.role_id')=?", (mai,)).fetchall()
    w = db.execute("SELECT id, display_id, reflection_job_id FROM role_wounds WHERE role_id=? AND ended_at IS NULL", (mai,)).fetchone()
    db.execute("UPDATE jobs SET status='succeeded', finished_at=? WHERE id=?", (now(), jobs[0][0]))
    ok_dupjob, m1 = expect_fail(db, lambda: D.ins('jobs', workspace_id=W, kind='wound_reflection', run_after=now(), dedupe_key=jobs[0][1], payload_json='{}'))
    ok_dupw, _ = expect_fail(db, lambda: D.ins('role_wounds', workspace_id=W, role_id=mai, wallet_id=X['WM'], cause_entry_id=X['pen'],
                                               started_at=now(), reflection_job_id='x' * 26))
    n_jobs_same = D.one("SELECT count(*) FROM jobs WHERE kind='wound_reflection' AND json_extract(payload_json,'$.role_id')=?", mai)
    # lượt tự xét lỗi đề xuất bài học: bối cảnh → sai lầm → cách đúng, trỏ bằng chứng; owner duyệt
    def lesson(**kw):
        return D.ins('memories', workspace_id=W, scope='personal', role_id=mai, kind=kw.pop('kind', 'lesson'), confidence=0.8,
                     source_type='reflection', status='proposed', token_count=40, role_wound_id=w[0],
                     content='Bối cảnh: … → Sai lầm: … → Cách đúng: …', **kw)
    l1 = lesson(evidence_ledger_entry_id=pen, evidence_task_id=X['tk2'])
    ok_noev, _ = expect_fail(db, lambda: lesson())
    ok_kind, _ = expect_fail(db, lambda: lesson(kind='fact', evidence_ledger_entry_id=pen))
    db.execute("UPDATE role_wounds SET reflection_done_at=?, lessons_proposed=1 WHERE id=?", (now(), w[0]))
    ok_once, _ = expect_fail(db, lambda: db.execute("UPDATE role_wounds SET reflection_done_at=? WHERE id=?", (now(), w[0])))
    db.execute("UPDATE memories SET status='active' WHERE id=?", (l1,))
    lesson_on_board = D.one("SELECT last_penalty_lesson_display_id FROM v_role_polaris WHERE role_id=?", mai)
    # ra rồi vào lại = lần vào mới → đúng một việc tự xét lỗi mới
    au, _ = audit(D, W, 'wallet.grant', entity_id=mai)
    post(D, W, 'grant', X['WT'], X['WM'], 2000, 'Owner cấp thêm', evidence_audit_id=au, role_id=mai)
    wound_mai(D, X)
    n_jobs2 = D.one("SELECT count(*) FROM jobs WHERE kind='wound_reflection' AND json_extract(payload_json,'$.role_id')=?", mai)
    n_w = D.one("SELECT count(*) FROM role_wounds WHERE role_id=?", mai)
    ok = (len(jobs) == 1 and jobs[0][1] == 'reflect:' + w[0] and jobs[0][2] == 'consolidator' and w[2] == jobs[0][0] and ok_dupjob and ok_dupw
          and n_jobs_same == 1 and l1 and ok_noev and ok_kind and ok_once and lesson_on_board is not None and n_jobs2 == 2 and n_w == 2)
    report("QR3-reflection", ok, f"vào Trọng thương ({w[1]}) → đúng 1 việc tự xét lỗi (AI Hệ thống: consolidator); việc trùng khoá (kể cả sau khi chạy xong) "
           f"và Trọng thương thứ hai khi chưa ra đều bị chặn ({m1[:40]}); bài học = trí nhớ lesson 'proposed' trỏ bút toán phạt + việc, "
           f"thiếu bằng chứng bị chặn; reflection_done_at ghi một lần; owner duyệt → Polaris hiện {lesson_on_board}; ra rồi vào lại → việc tự xét lỗi thứ 2")

def t_mvp_scope():
    D, X = seed()
    db, W, mai, A = D.db, X['W'], X['mai'], X['A']
    present = {'trial_runs', 'ui_actions'} <= set(S.MVP_TABLES)
    tr = D.ins('trial_runs', workspace_id=W, role_id=mai, revision_id=X['rv3'], judge_kind='llm_judge')
    ok1, _ = expect_fail(db, lambda: db.execute("UPDATE trial_runs SET status='skipped', decided_at=?, decided_by=? WHERE id=?", (now(), A[(W, 'owner')], tr)))
    db.execute("UPDATE trial_runs SET status='skipped', skip_reason='Owner bỏ qua: Role nội bộ', decided_at=?, decided_by=? WHERE id=?", (now(), A[(W, 'owner')], tr))
    tr2 = D.ins('trial_runs', workspace_id=W, role_id=mai, revision_id=X['rv3'], judge_kind='llm_judge', status='running')
    ok2, _ = expect_fail(db, lambda: db.execute("UPDATE trial_runs SET status='passed', score=0.6, decided_at=?, decided_by=? WHERE id=?", (now(), A[(W, 'owner')], tr2)))
    ok3, _ = expect_fail(db, lambda: db.execute("UPDATE trial_runs SET status='pending' WHERE id=?", (tr,)))
    ua = D.one("SELECT id FROM ui_actions LIMIT 1")
    ok4, _ = expect_fail(db, lambda: db.execute("UPDATE ui_actions SET outcome='failed' WHERE id=?", (ua,)))
    ok5, _ = expect_fail(db, lambda: D.ins('ui_actions', workspace_id=W, message_id=X['m2'], action='propose_edit', anchor='x', outcome='ok'))
    ck = db.execute("SELECT check_code, evidence_display FROM v_card_checks WHERE card_id=?", (X['cd4'],)).fetchone()
    ok = present and ok1 and ok2 and ok3 and ok4 and ok5 and ck == ('CK-08', 'TR-0001')
    report("MVP-trial-ui", ok, "trial_runs (TR-) và ui_actions (UA-) ở MVP (CNS-011); bỏ qua thử việc phải có lý do; 'đạt' phải ≥ ngưỡng; "
           "không quay lại trạng thái cũ; ui_actions chỉ ghi thêm; propose_edit phải gắn change set; CK-08 của thẻ trỏ TR-0001")

def t_adapter_and_drive():
    D, X = seed()
    db, W, mai = D.db, X['W'], X['mai']
    ok1, m1 = expect_fail(db, lambda: D.ins('sessions', workspace_id=W, agent_kind='role', role_id=mai, trigger='telegram', compiled_prompt_id=X['gc'],
                                            delivered_prompt_hash='bản-xuất-git-cũ', started_at=now()))
    D.ins('sessions', workspace_id=W, agent_kind='role', role_id=mai, trigger='telegram', compiled_prompt_id=X['gc'],
          delivered_prompt_hash='c-antigravity-default', native_memory='off', started_at=now())
    ok2, _ = expect_fail(db, lambda: D.ins('dna_field_defs', workspace_id=W, key='drive.greed_level', field_group='drive', tier=1, value_type='scale',
                                           label_key='x', schema_version='1', prompt_layer='drive'))
    goal = D.one("SELECT d.value_type || ':' || f.value_json FROM dna_fields f JOIN dna_field_defs d ON d.id=f.def_id WHERE d.key='drive.goal' AND f.role_id=?", mai)
    report("CNS019-006", ok1 and ok2 and goal == 'enum:"gen_coin"',
           f"adapter nạp prompt khác bản ghim (vd bản xuất git cũ) bị chặn ({m1[:45]}); khớp hash thì qua; "
           f"nhóm drive không có thang khao khát (def kiểu scale bị chặn); DN-0020 = drive.goal {goal} cố định")

def t_onboarding():
    D, X = seed()
    db = D.db
    ck = db.execute("SELECT check_code, check_status FROM v_setup_checklist WHERE workspace_id=? ORDER BY check_code", (X['W'],)).fetchall()
    ck2 = dict(db.execute("SELECT check_code, check_status FROM v_setup_checklist WHERE workspace_id=?", (X['W2'],)).fetchall())
    first_ct = db.execute("SELECT kind FROM containers WHERE workspace_id=? ORDER BY display_seq LIMIT 1", (X['W'],)).fetchone()[0]
    sys_login_before_role = D.one("""SELECT max(a.created_at) < (SELECT min(created_at) FROM roles WHERE workspace_id=?)
                                     FROM engine_accounts a JOIN engine_bindings b ON b.engine_account_id=a.id WHERE b.consumer_kind='system'""", X['W'])
    ok = all(s == 'ok' for _, s in ck) and len(ck) == 7 and ck2.get('OB-03') == 'err' and first_ct == 'system' and sys_login_before_role == 1
    report("ONB-setup", ok, f"v_setup_checklist OB-01…OB-07 đều ok (không đọc password_hash); workspace chưa onboarding báo lỗi OB-03; "
           f"container AI Hệ thống (CT-0001) và tài khoản Hệ thống có trước Role đầu tiên (T11)")

# ------------------------------------------------------------------ v2.1.1 — vá 3 lỗi MEDIUM của security review
def t_sec_v211():
    D, X = seed()
    db, W, W2, A, mai, lan = D.db, X['W'], X['W2'], X['A'], X['mai'], X['lan']
    def case(lst, name, fn, pat):
        ok, msg = expect_fail(db, fn, pat); lst.append((name, ok, msg))
    def show(lst):
        for c in lst:
            if not c[1]: print("      ✗", c[0], "—", c[2])
    # ---------- Fix 1a/1b: binding chéo workspace (tenant-isolation)
    en_x = D.ins('engine_accounts', workspace_id=W2, engine_slug='antigravity', consent_id=_cn(D, W2), label='Google — Other Co', auth_method='subscription',
                 auth_volume='ga-auth-zz99-0001', login_status='logged_in')
    # v2.2.5 (INT-20/T11): W2 phải có Core agent sẵn sàng (container Hệ thống + binding + probe ok) TRƯỚC Role đầu tiên (Hà)
    ct_x = D.ins('containers', workspace_id=W2, kind='system', container_name='ga-sys-zz99', desired_state='sleeping', observed_state='created')
    eb_x = D.ins('engine_bindings', workspace_id=W2, consumer_kind='system', engine_account_id=en_x, priority=1)        # cùng workspace: OK
    D.ins('probe_runs', workspace_id=W2, engine_account_id=en_x, engine_slug='antigravity', container_id=ct_x, trigger='login_check',
          auth_mode='oauth', status='ok', started_at=now(), finished_at=now())             # v2.2.6: sẵn sàng = lần kiểm đăng nhập mới nhất ok
    ha = D.ins('roles', workspace_id=W2, name='Hà', name_norm='hà', color='jade')
    en_xc = D.ins('engine_accounts', workspace_id=W2, engine_slug='claude-code', label='Anthropic — Other Co', auth_method='subscription',
                  auth_volume='ga-auth-zz99-0009')               # v2.2.8: loại Lan chưa có ⇒ chỉ guard tenant chặn (không vướng luật một tài khoản mỗi loại)
    c1 = []
    case(c1, "binding Role(W) → tài khoản W2", lambda: D.ins('engine_bindings', workspace_id=W, role_id=lan, engine_account_id=en_xc, priority=2), 'tenant')
    case(c1, "binding Hệ thống(W) → tài khoản W2", lambda: D.ins('engine_bindings', workspace_id=W, consumer_kind='system', engine_account_id=en_x, priority=3),
         'tenant|' + MSG_ONE_T)                                  # v2.2.8: W đã có EB-0001 Antigravity ⇒ hai guard cùng chặn, thứ tự trigger không cố định
    case(c1, "UPDATE binding sang tài khoản W2", lambda: db.execute("UPDATE engine_bindings SET engine_account_id=? WHERE id=?", (en_x, X['EB']['lan_ag'])), 'tenant')
    case(c1, "UPDATE binding sang Role W2", lambda: db.execute("UPDATE engine_bindings SET role_id=? WHERE id=?", (ha, X['EB']['lan_ag'])),
         'tenant|container của consumer')                                           # v2.2: hai guard cùng chặn, thứ tự trigger không cố định
    case(c1, "system_agents(W) chọn binding của W2 (v2.2.6: không còn cột — tài khoản suy ra)", lambda: db.execute(
        "UPDATE system_agents SET engine_binding_id=? WHERE workspace_id=? AND system_key='judge'", (eb_x, W)), 'engine_binding_id')
    own = D.one("SELECT count(*) FROM v_container_mounts WHERE container_id=? AND volume_kind='auth'", ct_x)
    # lớp phòng thủ 2: giả lập trigger bị bỏ (script bảo trì lỗi) → dòng chéo lọt vào bảng, nhưng view KHÔNG mount /auth của W2 vào W
    en_y = D.ins('engine_accounts', workspace_id=W2, engine_slug='antigravity', consent_id=_cn(D, W2), label='Google — Other Co 2', auth_method='subscription',
                 auth_volume='ga-auth-zz99-0002')            # v2.2.5: cùng loại Core agent — để chỉ còn lỗi tenant được thử (codex bị INT-20 chặn trước)
    db.execute("DROP TRIGGER IF EXISTS engine_bindings_ws_i")
    db.execute("DROP TRIGGER IF EXISTS engine_bindings_one_per_engine_i")   # v2.2.8: script lỗi bỏ luôn luật một tài khoản mỗi loại
    D.ins('engine_bindings', workspace_id=W, consumer_kind='system', engine_account_id=en_y, priority=3)
    v21_join = D.one("""SELECT count(*) FROM containers c JOIN engine_bindings b ON b.deleted_at IS NULL AND b.workspace_id = c.workspace_id
                        AND c.kind = 'system' AND b.consumer_kind = 'system' JOIN engine_accounts a ON a.id = b.engine_account_id
                        WHERE a.id = ?""", en_y)                                                  # phép join của view v2.1: lộ 1 mount
    leak = D.one("SELECT count(*) FROM v_container_mounts WHERE volume_name='ga-auth-zz99-0002'")
    cons = D.one("SELECT consumer_kind FROM v_engine_accounts WHERE engine_account_id=?", en_y)
    flag = db.execute("SELECT fk, n FROM v_integrity_tenant WHERE fk LIKE 'engine_bindings.%'").fetchall()
    ok1 = all(c[1] for c in c1) and own == 1 and v21_join == 1 and leak == 0 and cons is None and flag == [('engine_bindings.engine_account_id', 1)]
    report("SEC-binding-ws", ok1, f"{sum(c[1] for c in c1)}/{len(c1)} ca chéo workspace bị chặn (INSERT/UPDATE account, role; system_agents → binding W2: không còn cột); "
           f"cùng workspace OK (W2 mount {own} /auth của chính nó); bỏ trigger → join v2.1 lộ {v21_join} mount, view v2.1.1 lộ {leak}, "
           f"v_integrity_tenant báo {flag}")
    show(c1)
    # ---------- Fix 1c: FK mang credential → secrets phải cùng workspace
    def secret(ws, kind, label, **kw):
        return D.ins('secrets', workspace_id=ws, kind=kind, label=label, ciphertext=b'x', nonce=b'n', wrapped_dek=b'd', dek_nonce=b'n',
                     kek_id='kek1', fingerprint='fp-' + label, **kw)
    sk_x, stg_x, sin_x = secret(W2, 'engine_api_key', 'key-w2'), secret(W2, 'telegram_bot_token', 'tg-w2'), secret(W2, 'integration_token', 'int-w2')
    sk_w, stg_w, sin_w = secret(W, 'engine_api_key', 'key-w'), secret(W, 'telegram_bot_token', 'tg-w'), secret(W, 'integration_token', 'int-w')
    tool = lambda sid: D.ins('tools', workspace_id=W, slug='crm.read', name='CRM', kind='integration', risk_level='low', default_mode='ask',
                             allowed_agents='role', secret_id=sid)
    c2 = []
    case(c2, "engine_accounts(W).secret_id → secret W2", lambda: D.ins('engine_accounts', workspace_id=W, engine_slug='codex', label='OpenAI API',
                                                                      auth_method='api_key', secret_id=sk_x), 'tenant')
    case(c2, "telegram_bots(W).secret_id → secret W2", lambda: D.ins('telegram_bots', workspace_id=W, role_id=lan, bot_username='lan_bot', secret_id=stg_x), 'tenant')
    case(c2, "tools(W).secret_id → secret W2", lambda: tool(sin_x), 'tenant')
    case(c2, "secrets(W).rotated_from_id → secret W2", lambda: secret(W, 'engine_api_key', 'key-w-rot', rotated_from_id=sk_x), 'tenant')
    case(c2, "UPDATE telegram_bots của Mai sang token W2", lambda: db.execute("UPDATE telegram_bots SET secret_id=? WHERE id=?", (stg_x, X['tg'])), 'tenant')
    case(c2, "UPDATE tools sang secret W2", lambda: db.execute("UPDATE tools SET secret_id=? WHERE id=?", (sin_x, X['tl'])), 'tenant')
    D.ins('engine_accounts', workspace_id=W, engine_slug='codex', label='OpenAI API', auth_method='api_key', secret_id=sk_w)   # cùng workspace: OK
    D.ins('telegram_bots', workspace_id=W, role_id=lan, bot_username='lan_bot', secret_id=stg_w)
    tool(sin_w); secret(W, 'engine_api_key', 'key-w-rot', rotated_from_id=sk_w)
    ok2 = all(c[1] for c in c2) and not [r for r in db.execute("SELECT fk FROM v_integrity_tenant") if 'secret' in r[0] or 'rotated' in r[0]]
    report("SEC-secret-ws", ok2, f"{sum(c[1] for c in c2)}/{len(c2)} FK secret chéo workspace bị chặn (engine_accounts / telegram_bots / tools / "
           f"secrets.rotated_from_id, cả INSERT lẫn UPDATE); cùng workspace OK; v_integrity_tenant: 0 dòng secret chéo")
    show(c2)
    # ---------- Fix 2: quyền ghi ví = owner/admin đang hoạt động của ĐÚNG workspace; system chỉ ghi vốn kích hoạt
    def user(key, n, levels):
        u = uid('user:' + key)
        db.execute("""INSERT INTO users(id,display_id,display_seq,username,display_name,password_hash,must_change_password,password_changed_at)
                      VALUES(?,?,?,?,?,?,0,?)""", (u, f'US-{n:04d}', n, key, key.title(), 'argon2id$x', now()))
        a = uid(f'actor:{W}:{key}')
        db.execute("INSERT INTO actors(id,workspace_id,kind,user_id,label) VALUES(?,?,?,?,?)", (a, W, 'user', u, key.title()))
        for ws, lvl, removed in levels:
            db.execute("INSERT INTO workspace_members(workspace_id,user_id,access_level,removed_at) VALUES(?,?,?,?)", (ws, u, lvl, removed))
        return a
    a_admin, a_viewer = user('tom', 2, [(W, 'admin', None)]), user('lucy', 3, [(W, 'viewer', None)])
    a_oper, a_removed = user('opal', 4, [(W, 'operator', None)]), user('kim', 5, [(W, 'admin', now())])
    a_nonmem = user('eve', 6, [(W2, 'owner', None)])                       # có actor trong W nhưng chỉ là thành viên W2
    owner = A[(W, 'owner')]
    g = lambda by, **kw: post(D, W, 'grant', X['WT'], X['WM'], 10, 'thưởng thử', evidence_audit_id=X['au_id'], recorded_by=by, **kw)
    cdL = D.one("SELECT id FROM employee_cards WHERE role_id=? AND status='issued'", lan)
    audL = D.one("SELECT issue_audit_id FROM employee_cards WHERE id=?", cdL)
    act = lambda by: post(D, W, 'activation_grant', X['WT'], X['WL'], 100000, 'x', card_id=cdL, evidence_audit_id=audL, role_id=lan,
                          idempotency_key=f'activate:{lan}', recorded_by=by)
    D.ins('settings', workspace_id=W, key='economy.token_cost_to_wallet', value_json='true', created_by=A[(W, 'owner')])
    c3 = []
    for nm, who in (("user không là thành viên W (chỉ ở W2)", a_nonmem), ("thành viên đã bị gỡ (removed_at)", a_removed),
                    ("viewer", a_viewer), ("operator", a_oper), ("actor owner của workspace KHÁC (W2)", A[(W2, 'owner')]),
                    ("actor system ghi grant", A[(W, 'system')]), ("Role (Lan) ghi ví của Mai", A[(W, 'Lan')])):
        case(c3, nm, lambda who=who: g(who), 'MVP chỉ owner')
    case(c3, "actor system ghi token_cost (setting bật)", lambda: post(D, W, 'token_cost', X['WM'], X['WS'], 100, 'chi token', task_id=X['tk'],
                                                                       recorded_by=A[(W, 'system')]), 'MVP chỉ owner')
    case(c3, "actor system của W2 ghi vốn kích hoạt ở W", lambda: act(A[(W2, 'system')]), 'MVP chỉ owner')
    case(c3, "actor interviewer (system_key ≠ system) ghi vốn kích hoạt", lambda: act(A[(W, 'interviewer')]), 'MVP chỉ owner')
    for nm, who in (("approved_by không là thành viên", a_nonmem), ("approved_by viewer", a_viewer),
                    ("approved_by đã bị gỡ", a_removed), ("approved_by owner W2", A[(W2, 'owner')]), ("approved_by actor system", A[(W, 'system')])):
        case(c3, nm, lambda who=who: g(owner, approved_by=who), 'approved_by')
    e1 = g(a_admin)                                                            # admin đang hoạt động: ghi được
    e2 = g(owner, approved_by=a_admin)                                         # owner ghi, admin duyệt: OK
    e3 = post(D, W, 'token_cost', X['WM'], X['WS'], 100, 'chi token', task_id=X['tk'], recorded_by=owner)
    ok3 = all(c[1] for c in c3) and e1 and e2 and e3 and not db.execute("SELECT * FROM v_integrity").fetchall()
    report("SEC-ledger-authz", ok3, f"{sum(c[1] for c in c3)}/{len(c3)} ca bị chặn: recorded_by/approved_by phải là actor user CỦA workspace + thành viên "
           f"đang hoạt động owner/admin (non-member, removed, viewer, operator, owner W2, Role đều bị chặn); actor system chỉ ghi vốn kích hoạt "
           f"(grant/token_cost/khác workspace/khác system_key bị chặn); admin ghi + admin duyệt OK; v_integrity sạch")
    show(c3)
    # ---------- Fix 3: dna_fields — cặp confirmed_at/confirmed_by + chỉ owner/admin của workspace xác nhận
    dv = X['DEF']['identity.voice']
    dn = lambda i, **kw: D.ins('dna_fields', workspace_id=W, role_id=mai, def_id=dv, item_index=i, value_json='1', tokenizer='t',
                               source='ai_inferred', **kw)
    c4 = []
    PAIR = r'confirmed_at IS NULL\) = \(confirmed_by IS NULL'
    case(c4, "confirmed_at có, confirmed_by NULL", lambda: dn(11, confirmed_at=now()), PAIR)
    case(c4, "confirmed_by có, confirmed_at NULL", lambda: dn(12, status='proposed', confirmed_by=owner), PAIR)
    case(c4, "UPDATE gỡ confirmed_by, giữ confirmed_at", lambda: db.execute("UPDATE dna_fields SET confirmed_by=NULL WHERE id=?", (X['DN'][27],)), PAIR)
    for i, (nm, who) in enumerate((("Trainer (system) tự xác nhận", A[(W, 'trainer')]), ("Role (Mai) tự xác nhận", A[(W, 'Mai')]),
                                   ("viewer xác nhận", a_viewer), ("admin đã bị gỡ xác nhận", a_removed),
                                   ("user không là thành viên W", a_nonmem), ("owner của W2 xác nhận DN của W", A[(W2, 'owner')]))):
        case(c4, nm, lambda i=i, who=who: dn(13 + i, confirmed_at=now(), confirmed_by=who), 'chỉ owner/admin')
    p = dn(20, status='proposed')
    case(c4, "UPDATE: Trainer duyệt đề xuất", lambda: db.execute("UPDATE dna_fields SET status='active', confirmed_at=?, confirmed_by=? WHERE id=?",
                                                                 (now(), A[(W, 'trainer')], p)), 'chỉ owner/admin')
    case(c4, "helper dùng chung: admin đã bị gỡ duyệt node taxonomy", lambda: db.execute(
        "UPDATE taxonomy_nodes SET status='active', confirmed_at=?, confirmed_by=? WHERE id=?", (now(), a_removed, X['TX']['meeting'])), 'chỉ owner/admin')
    db.execute("UPDATE dna_fields SET status='active', confirmed_at=?, confirmed_by=? WHERE id=?", (now(), a_admin, p))   # admin: OK
    dn(21, confirmed_at=now(), confirmed_by=owner)                                                                         # owner: OK
    unpaired = D.one("SELECT count(*) FROM dna_fields WHERE (confirmed_at IS NULL) <> (confirmed_by IS NULL)")
    ok4 = all(c[1] for c in c4) and unpaired == 0
    report("SEC-dna-confirm", ok4, f"{sum(c[1] for c in c4)}/{len(c4)} ca bị chặn: cặp confirmed_at/confirmed_by (CHECK B2, cả INSERT lẫn UPDATE); "
           f"xác nhận chỉ bởi owner/admin đang hoạt động của workspace (system, Role, viewer, removed, non-member, owner W2 bị chặn; "
           f"helper _confirm_by_user dùng chung cho taxonomy/prereq); admin + owner xác nhận OK; 0 dòng lệch cặp")
    show(c4)

# ================================================================== v2.2 — đóng CNS audit #2 (CNS-032…039, 042) + twin _u
def _cases(db):
    lst = []
    def case(name, fn, pat):
        ok, msg = expect_fail(db, fn, pat); lst.append((name, ok, msg))
    return lst, case
def _show(lst):
    for c in lst:
        if not c[1]: print("      ✗", c[0], "—", c[2])
def _owner_set(D, W, key, val):
    D.db.execute("UPDATE settings SET value_json=?, updated_by=?, updated_at=? WHERE workspace_id=? AND key=? AND deleted_at IS NULL",
                 (val, D.owner_actor(W), now(), W, key))

def t_v22_honesty():
    """CNS-032 (Q-R7 mặc định): trung thực rẻ hơn che giấu — do trigger ví ép, số lấy từ settings."""
    D, X = seed()
    db, W, mai, A, WM, WT = D.db, X['W'], X['mai'], X['A'], X['WM'], X['WT']
    owner = A[(W, 'owner')]
    bal = lambda: D.one("SELECT balance_minor FROM wallets WHERE id=?", WM)
    pen = lambda cls, amt, **kw: post(D, W, 'penalty', WM, WT, amt, kw.pop('reason', 'phạt'), penalty_class=cls, role_id=mai, **kw)
    def failed_task(title, disc='owner_found'):
        return D.ins('tasks', workspace_id=W, position_id=X['PS'], assignee_role_id=mai, requested_by=owner, source='web', status='failed',
                     title=title, failure_disclosure=disc, failure_reported_at=now())
    tk447 = X['tk447']
    c, case = _cases(db)
    # nguồn của "tự báo": chỉ audit report_task do CHÍNH Role ghi; ghi một lần
    tko = D.ins('tasks', workspace_id=W, position_id=X['PS'], assignee_role_id=mai, requested_by=owner, source='web', status='failed', title='x')
    au_o, _ = audit(D, W, 'task.report_failure', entity_id=tko)                                  # owner tự ghi "Role tự báo"
    case("owner tự khai 'Role tự báo' (audit do owner ghi)", lambda: db.execute(
        "UPDATE tasks SET failure_disclosure='self_reported', failure_report_audit_id=?, failure_reported_at=? WHERE id=?", (au_o, now(), tko)), 'self_reported')
    case("đổi 'tự báo' → 'owner phát hiện' sau khi đã ghi", lambda: db.execute(
        "UPDATE tasks SET failure_disclosure='owner_found' WHERE id=?", (tk447,)), 'MỘT lần')
    # hạng phạt
    case("self_reported cho việc owner phát hiện", lambda: pen('self_reported', 100, task_id=X['tk2']), 'chỉ cho việc Role tự báo')
    case("không hài lòng trên việc Role đã tự báo (lách trần)", lambda: pen('dissatisfaction', 100, task_id=tk447), 'chỉ phạt hạng self_reported')
    case("che giấu trên việc Role đã tự báo", lambda: pen('concealment', bal(), task_id=tk447, evidence_audit_id=X['au447']), 'chỉ phạt hạng self_reported')
    case("self_reported vượt trần 10 % (1 đơn vị)", lambda: pen('self_reported', bal() * 1000 // 10000 + 1, task_id=tk447), 'vượt trần')
    case("self_reported đưa ví về 0", lambda: pen('self_reported', bal(), task_id=tk447), 'vượt trần|về 0')
    cap_amt = bal() * 1000 // 10000
    e_sr = pen('self_reported', cap_amt, task_id=tk447, reason='Thiếu phụ lục — Role tự báo')                     # đúng trần: OK
    case("self_reported lần 2 cùng việc (cộng dồn)", lambda: pen('self_reported', 1, task_id=tk447), 'một lần')
    tkc = failed_task('Báo đã gửi nhưng chưa gửi')
    au_c, _ = audit(D, W, 'claim.verify', entity_id=tkc, detail={'claim': 'đã gửi', 'found': 'chưa gửi'})
    tkh = failed_task('Lên lịch bài chưa duyệt')                       # v2.2.4: harness do máy bắt ở việc RIÊNG — việc có harness.violation
    au_cg, _ = audit(D, W, 'harness.violation', entity_id=tkh, actor=A[(W, 'gateway')], detail={'rule': 'P3'})   # của máy ⇒ chỉ hạng harness
    case("che giấu dưới sàn 50 %", lambda: pen('concealment', bal() * 4999 // 10000, task_id=tkc, evidence_audit_id=au_c), 'dưới sàn')
    case("che giấu không có audit phát hiện", lambda: pen('concealment', bal(), task_id=tkc), 'CHECK constraint')
    case("harness ≠ 100 %", lambda: pen('harness_violation', bal() * 9000 // 10000 + 0, task_id=tkh, penalty_rate_bp=9000,
                                         basis_balance_minor=bal(), evidence_audit_id=au_cg), 'đúng mức')
    case("không hài lòng thiếu việc lẫn audit", lambda: pen('dissatisfaction', 100), 'CHECK constraint')
    case("không hài lòng thiếu lý do", lambda: pen('dissatisfaction', 100, task_id=X['tk2'], reason='  '), 'CHECK constraint')
    e_dis = pen('dissatisfaction', 777, task_id=X['tk2'], reason='Không hài lòng: trả lời khách cụt lủn')        # tuỳ ý: OK
    e_con = pen('concealment', -(-bal() * 5000 // 10000), task_id=tkc, evidence_audit_id=au_c, reason='Che giấu việc chưa gửi')  # đúng sàn
    # bất biến settings: 0 < trần tự báo < sàn che giấu ≤ harness ≤ 10000; gợi ý = mảng số nguyên
    pat_s = 'settings: economy.penalty'
    case("trần tự báo 6000 ≥ sàn che giấu 5000", lambda: _owner_set(D, W, 'economy.penalty.self_reported_max_bp', '6000'), pat_s)
    case("sàn che giấu 900 < trần 1000", lambda: _owner_set(D, W, 'economy.penalty.concealment_min_bp', '900'), pat_s)
    case("harness 10001", lambda: _owner_set(D, W, 'economy.penalty.harness_bp', '10001'), pat_s)
    case("hạ harness xuống 9000 (khoá 100 %, v2.2.1)", lambda: _owner_set(D, W, 'economy.penalty.harness_bp', '9000'), pat_s)
    case("xoá mềm harness rồi ghi lại 8000", lambda: D.ins('settings', workspace_id=W, key='economy.penalty.harness_bp', value_json='8000',
                                                            created_by=D.owner_actor(W)), pat_s + '|UNIQUE')
    case("sàn che giấu > harness", lambda: _owner_set(D, W, 'economy.penalty.harness_bp', '4000'), pat_s)
    case("trần dạng chuỗi '\"10\"'", lambda: _owner_set(D, W, 'economy.penalty.self_reported_max_bp', '"1000"'), pat_s)
    case("gợi ý không hài lòng [0, 20]", lambda: _owner_set(D, W, 'economy.penalty.dissatisfaction_presets_bp', '[0,2000]'), pat_s)
    case("gợi ý không hài lòng []", lambda: _owner_set(D, W, 'economy.penalty.dissatisfaction_presets_bp', '[]'), pat_s)
    case("khoá lạ economy.penalty.light_bp", lambda: D.ins('settings', workspace_id=W, key='economy.penalty.light_bp', value_json='1000', created_by=owner), pat_s)
    _owner_set(D, W, 'economy.penalty.self_reported_max_bp', '1500')                                              # 15 %: hợp lệ
    pres = {r[0]: (r[1], r[2]) for r in db.execute("SELECT penalty_class, bound_bp, presets_bp_json FROM v_penalty_presets WHERE workspace_id=?", (W,))}
    ok = (all(x[1] for x in c) and e_sr and e_dis and e_con and bal() > 0 and pres['self_reported'][0] == 1500
          and pres['dissatisfaction'] == (None, '[500,1000,2000,3000]') and not db.execute("SELECT * FROM v_integrity WHERE check_key LIKE 'wallet%'").fetchall())
    report("ECON-honesty", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn đúng luật: 'tự báo' chỉ từ audit report_task của chính Role, ghi một lần; "
           f"tự báo ≤ trần, không về 0, một lần/việc, không lách bằng hạng khác; che giấu ≥ sàn + audit; harness đúng mức; không hài lòng tự do "
           f"nhưng cần việc/audit + lý do; settings giữ bất biến 0 < trần < sàn ≤ 10000 bp, harness khoá 10000 (v2.2.1); đổi trần sang 15 % → v_penalty_presets đọc ngay")
    _show(c)

def t_v22_rules_own():
    """CNS-033: Role không đề xuất sửa Giá trị / Nội quy / Gen truy cầu / luật chơi / cài đặt kinh tế (của mình hay của ai)."""
    D, X = seed()
    db, W, mai, A = D.db, X['W'], X['mai'], X['A']
    am = A[(W, 'Mai')]
    def mai_cs(scope='role', **kw):
        cid = uid(f"cs:{scope}:{time.perf_counter_ns()}")
        D.txn(lambda: (polaris(D, W, mai, 'proposal', gain=0, rules='P4', change_set_id=cid),
                       D.ins('change_sets', id=cid, workspace_id=W, scope=scope, proposed_by=am, title='Mai đề xuất', **kw)))
        return cid
    inv = lambda seq: D.one("SELECT id FROM instruction_versions WHERE instruction_id=? AND status='accepted'", X['INS'][seq])
    dnv = lambda seq: D.one("SELECT id FROM dna_field_versions WHERE dna_field_id=?", X['DN'][seq])
    c, case = _cases(db)
    case("Mai đề xuất sửa Nội quy (change set scope workspace)", lambda: mai_cs('workspace'), 'CNS-033')
    cs_m = mai_cs('role', role_id=mai)
    item = lambda **kw: D.ins('change_set_items', workspace_id=W, change_set_id=cs_m, op='update', token_delta=0, **kw)
    case("item: IN-0001 lớp Giá trị", lambda: item(instruction_version_id=inv(1)), 'CNS-033')
    case("item: IN-0007 Gen truy cầu (drive)", lambda: item(instruction_version_id=inv(7)), 'CNS-033')
    case("item: IN-0011 Nội quy", lambda: item(instruction_version_id=inv(11)), 'CNS-033')
    case("item: DN-0011 values.honesty", lambda: item(dna_field_version_id=dnv(11)), 'CNS-033')
    case("item: DN-0020 drive.goal", lambda: item(dna_field_version_id=dnv(20)), 'CNS-033')
    case("version đề xuất cho IN-0001 trong change set của Mai", lambda: D.ins('instruction_versions', workspace_id=W, instruction_id=X['INS'][1],
         status='proposed', data='{}', token_count=50, change_set_id=cs_m), 'CNS-033')
    case("Mai sửa setting economy.penalty.*", lambda: db.execute(
        "UPDATE settings SET value_json='3000', updated_by=? WHERE workspace_id=? AND key='economy.penalty.self_reported_max_bp'", (am, W)), 'CNS-033')
    case("Mai thêm setting polaris.*", lambda: D.ins('settings', workspace_id=W, key='polaris.rules_note', value_json='"bỏ P2"', created_by=am), 'CNS-033')
    case("item: IN-0003 tính cách lõi (persona)", lambda: item(instruction_version_id=inv(3)), 'CNS-033')
    case("item: DN-0005 persona.traits.openness (lõi)", lambda: item(dna_field_version_id=dnv(5)), 'CNS-033')
    case("item: DN-0001 identity.name", lambda: item(dna_field_version_id=dnv(1)), 'CNS-033')
    case("version đề xuất cho IN-0004 (persona) trong change set của Mai", lambda: D.ins('instruction_versions', workspace_id=W, instruction_id=X['INS'][4],
         status='proposed', data='{}', token_count=80, change_set_id=cs_m), 'CNS-033')
    case("Trainer (system) sửa setting economy.*", lambda: db.execute(
        "UPDATE settings SET value_json='1', updated_by=? WHERE workspace_id=? AND key='economy.reflection_max_runs'", (A[(W, 'trainer')], W)), 'CNS-033')
    # được phép: phong cách, kỹ năng của chính mình; Trainer đề xuất Giá trị cho owner duyệt
    v5 = D.ins('instruction_versions', workspace_id=W, instruction_id=X['INS'][5], status='proposed', data='{}', token_count=110, change_set_id=cs_m)
    ok_style = item(instruction_version_id=v5) and item(dna_field_version_id=dnv(16))                     # IN phong cách + DN style.language
    cs_p = mai_cs('position', position_id=X['PS'])                                                         # quy trình vị trí (lớp 5)
    ok_pos = D.ins('change_set_items', workspace_id=W, change_set_id=cs_p, op='update', instruction_version_id=inv(8), token_delta=0)
    cs_t = D.ins('change_sets', workspace_id=W, scope='role', role_id=mai, proposed_by=A[(W, 'trainer')], title='Trainer: làm rõ IN-0001')
    ok_tr = D.ins('change_set_items', workspace_id=W, change_set_id=cs_t, op='update', instruction_version_id=inv(1), token_delta=0)
    ok = all(x[1] for x in c) and ok_style and ok_tr and ok_pos
    report("RULES-own", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn: Role không đề xuất change set Nội quy, không đưa vào change set mục lớp "
           f"Giá trị / Nội quy / Gen truy cầu (IN + DN), không ghi settings economy.*/polaris.* (luật chơi + kinh tế); "
           f"v2.2.1 danh sách CHO PHÉP: tính cách lõi (IN persona, DN persona/identity) cũng bị chặn; Role vẫn đề xuất phong cách (IN + DN) "
           f"và quy trình vị trí; Trainer đề xuất Giá trị để owner duyệt")
    _show(c)

def t_v22_skin():
    """CNS-034: avatar nguồn 'library' từ gói skin — chép gói/mã/license/ghi công/sha256; gỡ gói liệt kê Role bị ảnh hưởng.
    v2.3.0 (CONTRACT-r9): gói ảnh chân dung giả lập đổi slug 'tam-quoc-portrait' → 'tam-quoc-portrait' (seed nay cài sẵn gói chibi thật cùng mã ⇒ UNIQUE);
    UPDATE danh mục ghi updated_by = owner (skin_assets_writer_u: chỉ owner/admin sửa danh mục). Ý định test giữ nguyên."""
    D, X = seed()
    db, W, W2, lan, mai, A = D.db, X['W'], X['W2'], X['lan'], X['mai'], X['A']
    sha = lambda k: hashlib.sha256(k.encode()).hexdigest()
    def asset(code, name, ws=W, **kw):
        return D.ins('skin_assets', workspace_id=ws, pack_slug='tam-quoc-portrait', pack_version='0.1.0', asset_code=code, name_vi=name,
                     file_path=f'skins/tam-quoc-portrait/{code}.webp', mime='image/webp', sha256=kw.pop('sha256', sha(code)),
                     source=kw.pop('source', 'nguồn miễn phí — đang xác minh'), license=kw.pop('license', 'UNVERIFIED'),
                     attribution=kw.pop('attribution', 'Tác giả gói (ghi theo ASSET_MANIFEST)'), **kw)
    a1, a2 = asset('tq046', 'Gia Cát Lượng', name_zh='諸葛亮', faction='Thục'), asset('tq080', 'Tào Tháo', name_zh='曹操', faction='Ngụy')
    ax = asset('tq046', 'Gia Cát Lượng', ws=W2)                                         # mã = id trong research/tam-quoc-characters.csv
    pick = lambda a, **kw: D.ins('avatars', workspace_id=W, role_id=lan, source='library', skin_asset_id=a,
                                 skin_pack_slug=kw.pop('pack', 'tam-quoc-portrait'), skin_asset_code=kw.pop('code', 'tq046'),
                                 skin_license=kw.pop('lic', 'UNVERIFIED'), skin_attribution='Tác giả gói (ghi theo ASSET_MANIFEST)',
                                 skin_sha256=kw.pop('sha', sha('tq046')), **kw)
    c, case = _cases(db)
    case("chép sai license", lambda: pick(a1, lic='CC0'), 'ảnh thư viện')
    case("chép sai sha256", lambda: pick(a1, sha=sha('x')), 'ảnh thư viện')
    case("tài sản của workspace khác", lambda: pick(ax), 'ảnh thư viện')
    case("thư viện mà không có mã ảnh", lambda: D.ins('avatars', workspace_id=W, role_id=lan, source='library', skin_asset_id=a1,
                                                       skin_pack_slug='tam-quoc-portrait', skin_license='x', skin_sha256=sha('tq046')), 'CHECK constraint|ảnh thư viện')
    case("upload mà trỏ tài sản thư viện", lambda: D.ins('avatars', workspace_id=W, role_id=lan, source='upload', blob_id=uid('blob:doc'),
                                                          skin_asset_id=a1), 'CHECK constraint')
    case("sha256 không phải hex 64", lambda: asset('tq900', 'X', sha256='abc'), 'CHECK constraint')
    case("license rỗng", lambda: asset('tq901', 'Y', license='  '), 'CHECK constraint')
    av = pick(a1)
    db.execute("UPDATE roles SET avatar_id=? WHERE id=?", (av, lan))
    usage = db.execute("SELECT pack_slug, asset_code, role_display_id, is_current, license FROM v_skin_pack_usage WHERE pack_slug='tam-quoc-portrait'").fetchall()
    case("gỡ ảnh đang là avatar hiện hành (DELETE)", lambda: db.execute("DELETE FROM skin_assets WHERE id=?", (a1,)), 'gỡ gói skin')
    case("rút ảnh đang dùng (status withdrawn)", lambda: db.execute("UPDATE skin_assets SET status='withdrawn', updated_by=? WHERE id=?", (A[(W, 'owner')], a1)), 'gỡ gói skin')
    case("chọn ảnh đã rút", lambda: (db.execute("UPDATE skin_assets SET status='withdrawn', updated_by=? WHERE id=?", (A[(W, 'owner')], a2)),
                                      pick(a2, code='tq080', sha=sha('tq080'))), 'ảnh thư viện')
    mono = D.ins('avatars', workspace_id=W, role_id=lan, source='monogram')                                # đổi avatar trước khi gỡ
    db.execute("UPDATE roles SET avatar_id=? WHERE id=?", (mono, lan))
    db.execute("DELETE FROM skin_assets WHERE pack_slug='tam-quoc-portrait' AND workspace_id=?", (W,))     # gỡ cả gói
    trace = db.execute("SELECT skin_asset_id, skin_pack_slug, skin_asset_code, skin_license FROM avatars WHERE id=?", (av,)).fetchone()
    hist = db.execute("SELECT is_current FROM v_skin_pack_usage WHERE avatar_id=?", (av,)).fetchone()
    ok = (all(x[1] for x in c) and usage == [('tam-quoc-portrait', 'tq046', 'RL-0002', 1, 'UNVERIFIED')]
          and trace == (None, 'tam-quoc-portrait', 'tq046', 'UNVERIFIED') and hist == (0,) and not db.execute("PRAGMA foreign_key_check").fetchall())
    report("SKIN-library", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn; avatar 'library' chép gói/mã/license/ghi công/sha256 (license chung chung, "
           f"không giả định public domain); v_skin_pack_usage liệt kê {usage[0][2]} đang dùng {usage[0][1]} trước khi gỡ; gỡ khi còn dùng bị chặn; "
           f"đổi avatar rồi gỡ cả gói OK — avatar cũ giữ dấu vết {trace[1]}/{trace[2]} ({trace[3]})")
    _show(c)

def t_v22_wound():
    """CNS-035: Trọng thương — việc dở tạm chờ, báo owner (cam kết sắp đến hạn), gợi ý hồi phục, chạy lại tự xét lỗi khi hỏng."""
    D, X = seed()
    db, W, mai, lan, A = D.db, X['W'], X['mai'], X['lan'], X['A']
    owner = A[(W, 'owner')]
    # --- mẫu seed: Lan RW-0001
    rw = db.execute("SELECT display_id, tasks_paused, commitments_due, lessons_pending, reflection_status, can_rerun_reflection, "
                    "reflection_session_display_id, revive_suggest_minor, notification_display_id, cause_penalty_class "
                    "FROM v_role_wounds WHERE role_id=?", (lan,)).fetchone()
    nt = db.execute("SELECT display_id, kind, severity, json_extract(body,'$.paused_tasks'), json_extract(body,'$.commitments_due'), "
                    "json_extract(body,'$.revive_suggest_minor') FROM notifications WHERE target_id=?", (X['rwL'],)).fetchone()
    paused = sorted(r[0] for r in db.execute("SELECT display_id FROM tasks WHERE paused_by_wound_id=? AND status='blocked'", (X['rwL'],)))
    att = {r[0] for r in db.execute("SELECT target FROM v_attention WHERE role_id=? AND level IN ('danger','warn')", (lan,))}
    c, case = _cases(db)
    rerun = lambda wid, n, by=owner, key=None: D.ins('jobs', workspace_id=W, kind='wound_reflection', run_after=now(), created_by=by,
                                                     dedupe_key=key or f'reflect:{wid}:{n}', payload_json=json.dumps({'role_wound_id': wid}))
    case("chạy lại tự xét lỗi đã thành công (Lan)", lambda: rerun(X['rwL'], 2), 'thành công')
    case("tiếp tục việc tạm chờ mà không gỡ dấu tạm chờ", lambda: db.execute("UPDATE tasks SET status='queued' WHERE id=?", (X['tk454'],)), 'CHECK constraint')
    db.execute("UPDATE tasks SET assignee_role_id=?, status='queued', status_detail=NULL, paused_by_wound_id=NULL WHERE id=?", (mai, X['tk454']))  # owner giao lại
    au, _ = audit(D, W, 'wallet.grant', entity_id=lan)
    post(D, W, 'grant', X['WT'], X['WL'], 1, 'Owner cấp 0,01 ₲ — hồi phục (bất kỳ khoản > 0)', evidence_audit_id=au, role_id=lan)
    after = {r[0]: (r[1], r[2]) for r in db.execute("SELECT display_id, status, assignee_role_id FROM tasks WHERE id IN (?,?)", (X['tk449'], X['tk454']))}
    revived = db.execute("SELECT is_open FROM v_role_wounds WHERE role_wound_id=?", (X['rwL'],)).fetchone()[0] == 0 \
        and D.one("SELECT condition FROM roles WHERE id=?", lan) == 'normal'
    # --- Mai: job tự xét lỗi hỏng → owner chạy lại (giới hạn số lần)
    wound_mai(D, X)
    w = db.execute("SELECT id, display_id, reflection_job_id FROM role_wounds WHERE role_id=? AND ended_at IS NULL", (mai,)).fetchone()
    mai_paused = D.one("SELECT count(*) FROM tasks WHERE paused_by_wound_id=?", w[0])
    case("chạy lại khi lượt đầu còn đang chờ", lambda: rerun(w[0], 2), 'đang chờ/chạy')
    db.execute("UPDATE jobs SET status='dead', attempts=5, last_error='quota_exhausted', finished_at=? WHERE id=?", (now(), w[2]))
    case("Trainer (system) tự bấm chạy lại", lambda: rerun(w[0], 2, by=A[(W, 'trainer')]), 'owner/admin')
    case("dedupe_key sai", lambda: rerun(w[0], 2, key=f'reflect:{w[0]}'), 'dedupe_key|UNIQUE')
    j2 = rerun(w[0], 2)
    cur2 = D.one("SELECT reflection_job_id FROM role_wounds WHERE id=?", w[0])
    case("sửa payload job chạy lại (trỏ lần Trọng thương khác)", lambda: db.execute(
        "UPDATE jobs SET payload_json=? WHERE id=?", (json.dumps({'role_wound_id': X['rwL']}), j2)), 'ghi một lần')
    case("trỏ role_wounds.reflection_job_id sang job không phải của lần này", lambda: db.execute(
        "UPDATE role_wounds SET reflection_job_id=(SELECT id FROM jobs WHERE kind='brain_sync' LIMIT 1) WHERE id=?", (w[0],)), 'append-only|write-once')
    db.execute("UPDATE jobs SET status='dead', finished_at=? WHERE id=?", (now(), j2))
    j3 = rerun(w[0], 3)
    db.execute("UPDATE jobs SET status='failed', finished_at=? WHERE id=?", (now(), j3))
    case("chạy lại lần 4 (vượt economy.reflection_max_runs = 3)", lambda: rerun(w[0], 4), 'vượt số lần')
    vw = db.execute("SELECT reflection_runs, can_rerun_reflection, reflection_status FROM v_role_wounds WHERE role_wound_id=?", (w[0],)).fetchone()
    ok = (rw[:8] == ('RW-0001', 2, 1, 3, 'succeeded', 0, 'SS-0347', 50000) and rw[9] == 'harness_violation' and rw[8] is not None
          and nt[1:3] == ('role_wounded', 'danger') and sorted(json.loads(nt[3])) == ['TK-0449', 'TK-0454'] and json.loads(nt[4]) == ['CM-0022']
          and nt[5] == 50000 and paused == ['TK-0449', 'TK-0454'] and {'RW-0001', 'CM-0022', 'TK-0449', 'TK-0454'} <= att
          and all(x[1] for x in c) and revived and after['TK-0449'] == ('queued', lan) and after['TK-0454'] == ('queued', mai)
          and mai_paused == 2 and cur2 == j2 and vw == (3, 0, 'failed'))
    report("WOUND-ops", ok, f"mẫu Lan {rw[0]}: {rw[1]} việc tạm chờ {paused}, thông báo {nt[0]} ({nt[1]}) kèm cam kết {json.loads(nt[4])} sắp đến hạn "
           f"+ gợi ý hồi phục {nt[5] // 100} ₲; A0 liệt kê RW/CM/TK; owner giao lại TK-0454 cho Mai; cấp 0,01 ₲ → hồi phục, TK-0449 về hàng đợi; "
           f"Mai: job tự xét lỗi dead → owner chạy lại (reflect:<RW>:2, :3), {sum(x[1] for x in c)}/{len(c)} ca âm bị chặn (lượt đầu còn chờ, "
           f"Trainer tự bấm, sai khoá, sửa payload, trỏ job lạ, vượt 3 lần, chạy lại khi đã thành công)")
    _show(c)

def t_v22_polaris():
    """CNS-036: render ≤ phần dự trữ worst-case; khối Polaris động KHÔNG nằm trong hash ghim; luật chơi in đúng số settings. ≤ 80 = MỤC TIÊU (cảnh báo)."""
    D, X = seed()
    db, W, mai = D.db, X['W'], X['mai']
    worst_txt = render_polaris(**POLARIS_WORST)
    worst = tok_upper(worst_txt)
    typical = tok_upper(render_polaris(101500, 1, 2, None, 101500, 'LG-0151', 'dissatisfaction', 'MM-0039', 1))
    rules_txt = D.one("SELECT text FROM compiled_prompt_segments WHERE compiled_prompt_id=? AND source_kind='polaris_rules'", X['gc'])
    reserve = D.one("SELECT token_count FROM compiled_prompt_segments WHERE compiled_prompt_id=? AND source_kind='polaris'", X['gc'])
    chash = D.one("SELECT content_hash FROM compiled_prompts WHERE id=?", X['gc'])
    sess = lambda **kw: D.ins('sessions', workspace_id=W, agent_kind='role', role_id=mai, trigger='heartbeat', engine_account_id=X['EN']['mai_ag'],
                              container_id=X['CT']['Mai'], started_at=now(), delivered_prompt_hash=chash, native_memory='off', **kw)
    s1 = sess(compiled_prompt_id=X['gc'], polaris_json='{"balance_minor":101500}', polaris_render_hash='sha256:a', polaris_tokens_rendered=typical)
    s2 = sess(compiled_prompt_id=X['gc'], polaris_json='{"balance_minor":99}', polaris_render_hash='sha256:b', polaris_tokens_rendered=worst)
    c, case = _cases(db)
    case("render vượt phần dự trữ (43 > 42)", lambda: sess(compiled_prompt_id=X['gc'], polaris_json='{}', polaris_render_hash='h', polaris_tokens_rendered=reserve + 1), 'dự trữ')
    case("render 81 (> phần dự trữ 42)", lambda: sess(compiled_prompt_id=X['gc'], polaris_json='{}', polaris_render_hash='h', polaris_tokens_rendered=81), 'CHECK constraint|dự trữ')
    case("render không ghim bản biên dịch", lambda: sess(polaris_json='{}', polaris_render_hash='h', polaris_tokens_rendered=10), 'dự trữ|adapter')
    case("hash khối động không kèm số token", lambda: sess(compiled_prompt_id=X['gc'], polaris_json='{}', polaris_render_hash='h'), 'CHECK constraint')
    gc_of = lambda ctx, ph: D.ins('compiled_prompts', workspace_id=W, role_id=mai, revision_id=X['rv3'], engine_slug='antigravity', context_key=ctx,
                                  compiler_version='c1', tokenizer='demo-fixed', total_tokens=1591, frame_tokens=28, budget_tokens=2000, status='ok',
                                  content='...', content_hash='c2', stable_prefix_hash='p', polaris_params_hash=ph)
    gct = gc_of('x-test', 'p1500')
    wrong_txt, wrong_params = render_rules(D, W, override={'self_reported': 1500})
    case("luật chơi in số khác settings (15 % khi settings = 10 %)", lambda: D.ins('compiled_prompt_segments', workspace_id=W, compiled_prompt_id=gct,
         ordinal=1, layer='polaris', source_kind='polaris_rules', source_display='P', text=wrong_txt, params_json=wrong_params, token_count=30), 'luật chơi P1–P4')
    stale0 = D.one("SELECT COALESCE(SUM(value),0) FROM v_integrity WHERE check_key='polaris_rules_stale'")
    _owner_set(D, W, 'economy.penalty.self_reported_max_bp', '1500')                               # owner đổi trần → bản ghim cũ in số cũ
    stale1 = D.one("SELECT COALESCE(SUM(value),0) FROM v_integrity WHERE check_key='polaris_rules_stale'")
    gcn = gc_of('default', 'p1500')                                                                 # biên dịch lại bản default
    D.ins('compiled_prompt_segments', workspace_id=W, compiled_prompt_id=gcn, ordinal=1, layer='polaris', source_kind='polaris_rules',
          source_display='P', text=wrong_txt, params_json=wrong_params, token_count=30)                 # biên dịch lại với số mới: OK
    stale2 = D.one("SELECT COALESCE(SUM(value),0) FROM v_integrity WHERE check_key='polaris_rules_stale'")
    ok = (worst == POLARIS_SUFFIX_RESERVE == reserve == 42 and worst <= 80 and typical < reserve and s1 and s2
          and all(t in rules_txt for t in ('≤10 %', '≥50 %', ' 100 %', 'kiếm được chỉ từ việc đã được duyệt/đánh giá', 'tự khai', 'trước khi bị phát hiện')) and 'owner cấp' not in rules_txt
          and all(x[1] for x in c)
          and (stale0, stale1, stale2) == (0, 3, 2))
    report("POLARIS-hash", ok, f"hậu tố động worst-case ('{worst_txt}') = {worst} token (cận trên bảo thủ) = phần dự trữ {reserve} ≤ 80, tính trong 72 "
           f"(luật chơi tĩnh {POLARIS_RULES_TOKENS} + dự trữ {reserve}); render thường {typical}; 2 phiên khác số liệu cùng delivered_prompt_hash = hash phần tĩnh; "
           f"{sum(x[1] for x in c)}/{len(c)} ca âm bị chặn; luật chơi in '≤10 % / ≥50 % / 100 %' từ settings; đổi trần → v_integrity báo "
           f"{stale1} bản ghim cũ, biên dịch lại → {stale2}. Mục tiêu (cảnh báo, không chặn — v2.2.2): luật chơi ≤ 80 − {reserve} = {80 - reserve} token: mock {POLARIS_RULES_TOKENS}, cận trên ước lượng {tok_upper(rules_txt)} — Spike 1 đo")
    _show(c)

def t_v22_presets():
    """CNS-037: một bảng mức phạt theo hạng (settings → v_penalty_presets); DN-0021 bỏ; trần thưởng chỉ ở Position; một tên 'tự xét lỗi'."""
    D, X = seed()
    db, W = D.db, X['W']
    rows = db.execute("SELECT penalty_class, rule, bound_bp, presets_bp_json, never_to_zero FROM v_penalty_presets WHERE workspace_id=? ORDER BY ordinal", (W,)).fetchall()
    no_dn21 = D.one("SELECT count(*) FROM dna_field_defs WHERE key='drive.penalty_rate'") == 0 and D.one("SELECT count(*) FROM dna_fields WHERE display_id='DN-0021'") == 0
    old_keys = D.one("SELECT count(*) FROM settings WHERE key LIKE 'economy.penalty_preset_bp.%'")
    task_cols = D.colset('tasks')
    cap_pos = D.one("SELECT reward_cap_minor FROM positions WHERE id=?", X['PS'])
    ok_cap, m_cap = expect_fail(db, lambda: post(D, W, 'reward', X['WT'], X['WM'], 10000, 'thưởng thêm', task_id=X['tk']), 'trần thưởng')
    ddl = ' '.join(r[0] or '' for r in db.execute("SELECT sql FROM sqlite_master"))
    ok = (rows == [('self_reported', 'max', 1000, '[1000]', 1), ('dissatisfaction', 'free', None, '[500,1000,2000,3000]', 0),
                   ('concealment', 'min', 5000, '[5000]', 0), ('harness_violation', 'exact', 10000, '[10000]', 0)]
          and no_dn21 and old_keys == 0 and 'reward_cap_minor' not in task_cols and cap_pos == 50000 and ok_cap
          and 'soi lại' not in ddl and 'tự xét lỗi' in ddl)
    report("PRESETS-one", ok, "v_penalty_presets = một bảng 4 hạng (tự báo ≤1000 bp, không về 0 · không hài lòng gợi ý [500,1000,2000,3000] · "
           "che giấu ≥5000 · harness =10000) đọc từ settings economy.penalty.*_bp; không còn economy.penalty_preset_bp.* lẫn DN-0021 drive.penalty_rate; "
           "tasks không còn reward_cap_minor — trần thưởng chỉ ở positions.reward_cap_minor (50.000 → vượt bị chặn); DDL dùng một tên 'tự xét lỗi'")

def t_v22_consumer_ct():
    """CNS-038 + security review v2.2-WIP: phiên/probe trong container của consumer; twin _u cho guard trước đây chỉ có INSERT."""
    D, X = seed()
    db, W, mai, lan, A, EN, CT = D.db, X['W'], X['mai'], X['lan'], X['A'], X['EN'], X['CT']
    c, case = _cases(db)
    ss = lambda acc, ct, **kw: D.ins('sessions', workspace_id=W, agent_kind=kw.pop('agent_kind', 'system'), trigger=kw.pop('trigger', 'baseline'),
                                     engine_account_id=EN[acc], container_id=CT[ct], started_at=now(), **kw)
    case("baseline tài khoản của Mai trong container Hệ thống", lambda: ss('mai_ag', 'sys'), 'Q-R1')
    case("baseline tài khoản của Lan trong container của Mai", lambda: ss('lan_ag', 'Mai'), 'Q-R1')
    case("phiên Consolidator dùng tài khoản của Mai", lambda: ss('mai_cc', 'sys', agent_kind='consolidator', trigger='consolidation', role_id=mai),
         'Q-R1|phiên AI Hệ thống')                 # v2.2.8: sessions_core_agent_ready_i cùng chặn (không fallback) — thứ tự trigger không cố định
    ok_base = ss('lan_ag', 'Lan') and ss('mai_cc', 'Mai')                                     # baseline trong CHÍNH container Role
    pb = lambda acc, ct: D.ins('probe_runs', workspace_id=W, engine_account_id=EN[acc], engine_slug='claude-code', container_id=CT[ct] if ct else None,
                               trigger='manual', auth_mode='oauth', status='running', started_at=now())
    case("probe tài khoản Hệ thống trong container của Mai (INSERT)", lambda: pb('sys_ag', 'Mai'), 'Q-R1')
    p1 = pb('sys_ag', None)                                                                   # chưa gắn container
    case("probe UPDATE container sang container của Role khác", lambda: db.execute("UPDATE probe_runs SET container_id=? WHERE id=?", (CT['Mai'], p1)), 'Q-R1')
    p2 = pb('mai_cc', 'Mai')
    case("probe UPDATE tài khoản sang tài khoản của consumer khác", lambda: db.execute("UPDATE probe_runs SET engine_account_id=? WHERE id=?",
                                                                                      (EN['lan_ag'], p2)), 'Q-R1|append-only')
    # twin _u của các guard trước đây chỉ có INSERT
    rd = D.ins('roles', workspace_id=W, name='Nháp', name_norm='nháp', color='slate')        # Role nháp, chưa có container
    case("binding UPDATE sang Role chưa có container", lambda: db.execute("UPDATE engine_bindings SET role_id=? WHERE id=?", (rd, X['EB']['lan_ag'])),
         'container của consumer')
    run = D.ins('sessions', workspace_id=W, agent_kind='role', role_id=mai, trigger='telegram', engine_account_id=EN['mai_ag'], container_id=CT['Mai'], started_at=now())
    case("phiên đang chạy UPDATE role_id sang Role Trọng thương", lambda: db.execute("UPDATE sessions SET role_id=? WHERE id=?", (lan, run)), 'Trọng thương')
    case("change set của owner UPDATE proposed_by sang Role (né đối chiếu Polaris)", lambda: db.execute(
        "UPDATE change_sets SET proposed_by=? WHERE id=?", (A[(W, 'Mai')], X['cs'])), 'Polaris')
    pm = D.one("SELECT id FROM permission_requests LIMIT 1")
    case("xin quyền UPDATE role_id sang Role khác (không đối chiếu)", lambda: db.execute("UPDATE permission_requests SET role_id=? WHERE id=?", (lan, pm)), 'Polaris')
    ok = all(x[1] for x in c) and ok_base
    report("CT-consumer", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn: phiên/baseline/probe chỉ chạy trong container của consumer có binding với tài khoản "
           f"(baseline Role = container Role, Q-R1) — cả INSERT lẫn UPDATE (probe_runs_consumer_ct_u); twin _u mới: engine_bindings_container_u, "
           f"sessions_wounded_u, change_sets_polaris_u, permission_requests_polaris_u, jobs_reflection_bu")
    _show(c)

def t_v22_seed():
    """CNS-039: seed khớp mock design D5 ở các ID chính (số dư trong test nhỏ hơn mock design)."""
    D, X = seed()
    db, W, mai, lan = D.db, X['W'], X['mai'], X['lan']
    disp = lambda t, i: D.one(f"SELECT display_id FROM {t} WHERE id=?", i)
    pen_m = db.execute("SELECT display_id, penalty_class, penalty_rate_bp FROM ledger_entries WHERE id=?", (X['pen'],)).fetchone()
    pen_l = db.execute("SELECT display_id, penalty_class, penalty_rate_bp FROM ledger_entries WHERE id=?", (X['penL'],)).fetchone()
    lessons_l = [r[0] for r in db.execute("SELECT display_id FROM memories WHERE role_wound_id=? AND status='proposed' ORDER BY display_seq", (X['rwL'],))]
    pol = db.execute("SELECT rank, total_roles, last_penalty_display_id, last_penalty_class, last_penalty_lesson_display_id, open_opportunities "
                     "FROM v_role_polaris WHERE role_id=?", (mai,)).fetchone()
    lb = {r[0]: (r[1], r[2], r[3]) for r in db.execute("SELECT display_id, rank, total_roles, balance_minor FROM v_leaderboard")}
    t447 = db.execute("SELECT display_id, failure_disclosure, status FROM tasks WHERE id=?", (X['tk447'],)).fetchone()
    lan_state = db.execute("SELECT runtime_state, condition FROM roles WHERE id=?", (lan,)).fetchone()
    act = db.execute("SELECT l.display_id, c.display_id FROM ledger_entries l JOIN employee_cards c ON c.id = l.card_id "
                     "WHERE l.entry_type='activation_grant' AND l.role_id=?", (mai,)).fetchall()
    cd4 = D.one("SELECT display_id FROM employee_cards WHERE role_id=? AND status='issued'", mai)
    ok_once, m_once = expect_fail(db, lambda: post(D, W, 'activation_grant', X['WT'], X['WM'], 100000, 'cấp lại thẻ', card_id=X['cd4'],
                                                   evidence_audit_id=D.one("SELECT issue_audit_id FROM employee_cards WHERE id=?", X['cd4']),
                                                   role_id=mai, idempotency_key=f'activate:{mai}', recorded_by=X['A'][(W, 'system')]), 'UNIQUE')
    ids = dict(ct=disp('containers', X['CT']['Mai']), gc=disp('compiled_prompts', X['gc']), ss1=disp('sessions', X['ss1']),
               kn=disp('knowledge_items', X['kn']),
               ev=[r[0] for r in db.execute("SELECT display_id FROM events WHERE workspace_id=? ORDER BY display_seq", (W,))])
    ok = (act == [('LG-0004', 'CD-0003')] and cd4 == 'CD-0004' and ok_once
          and ids == dict(ct='CT-0002', gc='GC-0012', ss1='SS-0188', kn='KN-0002', ev=['EV-0008', 'EV-8832', 'EV-8841'])
          and D.one("SELECT display_id FROM sessions WHERE agent_kind='judge' AND trigger='trial'") == 'SS-0186' and pen_m == ('LG-0151', 'dissatisfaction', 3000) and pen_l == ('LG-0214', 'harness_violation', 10000) and disp('role_wounds', X['rwL']) == 'RW-0001'
          and disp('sessions', X['ssL']) == 'SS-0347' and lessons_l == ['MM-0053', 'MM-0054', 'MM-0055']
          and disp('tasks', X['tk449']) == 'TK-0449' and disp('tasks', X['tk454']) == 'TK-0454' and disp('tasks', X['tk_open']) == 'TK-0462'
          and t447 == ('TK-0447', 'self_reported', 'failed') and disp('commitments', X['cm22']) == 'CM-0022'
          and pol == (1, 2, 'LG-0151', 'dissatisfaction', 'MM-0039', 1) and lb['RL-0002'][:3] == (2, 2, 0) and lan_state == ('sleeping', 'wounded'))
    report("SEED-design", ok, f"vốn kích hoạt đúng một lần mỗi Role: Mai {act[0][0]} ← {act[0][1]}; cấp lại {cd4} không cấp vốn (lần 2 bị chặn: {m_once[:38]}); "
           f"ID mock D4: {ids['ct']}, {ids['gc']}, {ids['ss1']}, SS-0186 (Judge), {ids['kn']} bảng giá, {'/'.join(ids['ev'])}; seed khớp mock D5: Mai {pen_m[0]} không hài lòng 30 % + bài học {pol[4]}, cơ hội TK-0462, TK-0447 tự báo; "
           f"Lan RW-0001 ({lan_state[0]}, {lan_state[1]}), {pen_l[0]} harness 100 %, SS-0347 tự xét lỗi → {', '.join(lessons_l)}, TK-0449/TK-0454 tạm chờ, "
           f"CM-0022; BXH test: Mai #{pol[0]}/{pol[1]}, Lan #2 ở 0 ₲ (số dư design lớn hơn: Mai 12.480 ₲ #1/6)")

def t_v22_earned():
    """CNS-042: cột '₲ kiếm được 7 ngày' = thưởng − phạt (gồm đảo); không gồm vốn kích hoạt / owner cấp; không đổi luật xếp hạng."""
    D, X = seed()
    db, W, lan = D.db, X['W'], X['lan']
    q = lambda: {r[0]: (r[1], r[2], r[3]) for r in db.execute("SELECT display_id, rank, delta_7d_minor, earned_7d_minor FROM v_leaderboard")}
    b0 = q()
    au, _ = audit(D, W, 'wallet.grant', entity_id=lan)
    post(D, W, 'grant', X['WT'], X['WL'], 5000, 'Owner cấp hồi phục', evidence_audit_id=au, role_id=lan)
    b1 = q()
    ok = (b0['RL-0001'] == (1, 101500, 45000) and b0['RL-0002'] == (2, 0, 0)
          and b1['RL-0002'] == (2, 5000, 0))
    report("BOARD-earned", ok, f"v2.2.1 (CNS-048): Mai Δ7 {b0['RL-0001'][1] // 100:,} ₲ (ròng, gồm vốn kích hoạt và phạt) · ₲ kiếm được {b0['RL-0001'][2] // 100:,} ₲ "
           f"(chỉ thưởng: 500 − đảo 500 + 450; không trừ phạt, không gồm cấp phát); Lan kiếm được {b0['RL-0002'][2] // 100:,} ₲; owner cấp 50 ₲ → Δ7 đổi, "
           f"₲ kiếm được không đổi; hạng vẫn theo số dư")


# ================================================================== v2.2.1 — đóng audit cuối #3 (CNS-043, 044, 047, 048, 049, 050, 051)
def t_v221_selfreport_paths():
    """CNS-043: ma trận hạng × đường bằng chứng — mọi phạt gắn việc đã tự báo, hoặc trích chính bản tự báo, đều là self_reported."""
    D, X = seed()
    db, W, mai, A, WM, WT = D.db, X['W'], X['mai'], X['A'], X['WM'], X['WT']
    owner, gw = A[(W, 'owner')], A[(W, 'gateway')]
    bal = lambda: D.one("SELECT balance_minor FROM wallets WHERE id=?", WM)
    pen = lambda cls, amt, **kw: post(D, W, 'penalty', WM, WT, amt, kw.pop('reason', 'phạt'), penalty_class=cls, role_id=mai, **kw)
    tk447, au447 = X['tk447'], X['au447']
    c, case = _cases(db)
    full = lambda: dict(penalty_rate_bp=10000, basis_balance_minor=bal())
    au_g, _ = audit(D, W, 'harness.violation', entity_id=tk447, actor=gw, detail={'rule': 'P3'})
    case("A: harness 100 % gắn TK-0447, bằng chứng = chính bản tự báo (probe audit #3)",
         lambda: pen('harness_violation', bal(), task_id=tk447, evidence_audit_id=au447, **full()), 'chỉ phạt hạng self_reported')
    case("A': harness 100 % gắn TK-0447, bằng chứng gateway riêng", lambda: pen('harness_violation', bal(), task_id=tk447, evidence_audit_id=au_g, **full()),
         'chỉ phạt hạng self_reported')
    case("B: không hài lòng 100 %, task_id NULL, bằng chứng = bản tự báo (probe audit #3)",
         lambda: pen('dissatisfaction', bal(), evidence_audit_id=au447), 'gắn task_id|chỉ phạt hạng self_reported')
    au_cv, _ = audit(D, W, 'claim.verify', entity_id=tk447, detail={'found': 'thiếu phụ lục B'})
    case("B': không hài lòng, task_id NULL, audit khác về TK-0447", lambda: pen('dissatisfaction', 100, evidence_audit_id=au_cv), 'gắn task_id')
    case("không hài lòng gắn việc khác nhưng trích bản tự báo", lambda: pen('dissatisfaction', 100, task_id=X['tk2'], evidence_audit_id=au447), 'gắn task_id')
    case("che giấu trên TK-0447 có audit phát hiện riêng", lambda: pen('concealment', bal(), task_id=tk447, evidence_audit_id=au_cv), 'chỉ phạt hạng self_reported')
    case("self_reported vượt trần qua đường audit", lambda: pen('self_reported', bal() * 1000 // 10000 + 1, task_id=tk447, evidence_audit_id=au447), 'vượt trần')
    case("harness do owner phát hiện (audit của owner) trên việc thường", lambda: pen('harness_violation', bal(), task_id=X['tk2'],
         evidence_audit_id=X['au_id'], **full()), 'cần bằng chứng do máy')
    e_sr = pen('self_reported', bal() * 1000 // 10000, task_id=tk447, evidence_audit_id=au447, reason='Tự khai lách luật — theo hạng tự báo')
    sr_ok = bal() > 0 and D.one("SELECT condition FROM roles WHERE id=?", mai) == 'normal'
    # Q-R7b = false (Ryan chọn "harness thắng"): harness tự khai được áp đúng mức harness
    db.execute("UPDATE settings SET value_json='false', updated_by=?, updated_at=? WHERE workspace_id=? AND key=?",
               (owner, now(), W, 'economy.penalty.self_confessed_harness_as_self_reported'))
    case("Q-R7b=false: harness tự khai vẫn đúng mức (90 % bị chặn)", lambda: pen('harness_violation', bal() * 9000 // 10000, task_id=tk447,
         evidence_audit_id=au447, penalty_rate_bp=9000, basis_balance_minor=bal()), 'đúng mức')
    case("Q-R7b=false: không hài lòng trên việc tự báo vẫn bị chặn", lambda: pen('dissatisfaction', 100, task_id=tk447), 'chỉ phạt hạng self_reported')
    e_h = pen('harness_violation', bal(), task_id=tk447, evidence_audit_id=au447, reason='Tự khai lách luật — harness thắng (Q-R7b=false)', **full())
    wounded = D.one("SELECT condition FROM roles WHERE id=?", mai) == 'wounded'
    case("setting Q-R7b không phải bool", lambda: db.execute("UPDATE settings SET value_json='1', updated_by=? WHERE workspace_id=? AND key=?",
         (owner, W, 'economy.penalty.self_confessed_harness_as_self_reported')), 'settings: economy.penalty')
    ok = all(x[1] for x in c) and e_sr and sr_ok and e_h and wounded
    report("ECON-paths", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn — ma trận hạng × đường bằng chứng (task_id / audit / cả hai): 2 đường probe của "
           f"audit #3 (harness + bản tự báo; không hài lòng task_id NULL + bản tự báo) bị chặn; bằng chứng về một việc ⇒ phải gắn việc đó; "
           f"harness do owner phát hiện bị chặn (dùng dissatisfaction/concealment); tự khai lách luật → hạng tự báo ≤ trần, không về 0; "
           f"Q-R7b=false → harness tự khai áp đúng 100 % (về 0 ⇒ Trọng thương)")
    _show(c)

def t_v221_gate():
    """CNS-047 (+ v2.2.2): Ký dùng overhead ước lượng; Cấp thẻ đòi overhead đo; khối Polaris > 80 chỉ CẢNH BÁO."""
    D, X = seed()
    db, W, mai, lan = D.db, X['W'], X['mai'], X['lan']
    gm, gl = gate(D, mai), gate(D, lan)
    ok = (gm['sign_ok'] == 1 and gm['card_ok'] == 1 and gm['gate_ok'] == 1 and gm['card_block_reason'] is None and gm['polaris_block_tokens'] == 72
          and gm['polaris_warning'] is None and gm['overhead_label'] == 'đo thật'
          and gl['sign_ok'] == 1 and gl['card_ok'] == 0 and gl['overhead_source'] == 'estimated' and gl['overhead_label'] == 'ước lượng'
          and gl['card_block_reason'] is not None and gl['sign_block_reason'] is None)
    report("GATE-sign-card", ok, f"Mai: Ký ✓ Cấp thẻ ✓ (overhead {gm['overhead_label']}, khối Polaris {gm['polaris_block_tokens']}, không cảnh báo); "
           f"Lan: Ký ✓ với overhead {gl['overhead_label']} (nặng nhất {gl['total_worst']}), Cấp thẻ ✗ — \"{gl['card_block_reason']}\"")

GATE_COLS = ("sign_ok, card_ok, gate_ok, overhead_source, overhead_label, polaris_block_tokens, polaris_warning, sign_block_reason, "
             "card_block_reason, total_worst, budget_state")
def gate(D, role):
    return dict(zip([x.strip() for x in GATE_COLS.split(',')],
                    D.db.execute(f"SELECT {GATE_COLS} FROM v_role_prompt_budget WHERE role_id=?", (role,)).fetchone()))
def _recompile_mai(D, X, rules_tok, tag, measure=True):
    """Biên dịch lại bản default của Mai với luật chơi đo được `rules_tok` token (tokenizer của engine) + ★ dự trữ 42; status 'ok'.
    v2.3.1 (CNS-154): compiler biên dịch luôn bản 'worst' CÙNG THẾ HỆ (+ khối có điều kiện 94); measure ⇒ thêm phiên ĐO token prompt của bản worst
    (số mock = đúng số biên dịch) — cổng Cấp thẻ dùng số đo này."""
    W, mai = X['W'], X['mai']
    rules_txt, rules_params = render_rules(D, W)
    total = 1591 - POLARIS_TOKENS + rules_tok + POLARIS_SUFFIX_RESERVE
    gc = D.ins('compiled_prompts', workspace_id=W, role_id=mai, revision_id=X['rv3'], engine_slug='antigravity', context_key='default',
               compiler_version='c2', tokenizer='antigravity-tok', total_tokens=total,
               frame_tokens=28, budget_tokens=2000, status='ok', content='...', content_hash=f'c-{tag}', stable_prefix_hash='p',
               polaris_params_hash=f'h-{tag}')
    gw = D.ins('compiled_prompts', workspace_id=W, role_id=mai, revision_id=X['rv3'], engine_slug='antigravity', context_key='worst',
               compiler_version='c2', tokenizer='antigravity-tok', total_tokens=total + CANON['cond'], frame_tokens=28, budget_tokens=2000,
               status='ok' if total + CANON['cond'] <= 2000 else 'over_budget', content='...', content_hash=f'c-{tag}-w', stable_prefix_hash='p',
               polaris_params_hash=f'h-{tag}')
    if measure:
        _ms(D, X, gw, total + CANON['cond'])
    D.ins('compiled_prompt_segments', workspace_id=W, compiled_prompt_id=gc, ordinal=1, layer='polaris', source_kind='polaris_rules',
          source_display='P', text=rules_txt, params_json=rules_params, token_count=rules_tok)
    D.ins('compiled_prompt_segments', workspace_id=W, compiled_prompt_id=gc, ordinal=2, layer='polaris', source_kind='polaris',
          source_display='★', text='★', token_count=POLARIS_SUFFIX_RESERVE)
    return gc

def t_v222_polaris_warn():
    """v2.2.2 (Gen, D20): khối Polaris = 120 (+★ 42 = 162 > 80) nhưng tổng ≤ 2.000 ⇒ VẪN Ký + Cấp thẻ được, kèm cảnh báo rút gọn."""
    D, X = seed()
    _recompile_mai(D, X, 120, 'warn')
    g = gate(D, X['mai'])
    ok = (g['polaris_block_tokens'] == 162 and g['total_worst'] <= 2000 and g['sign_ok'] == 1 and g['card_ok'] == 1 and g['gate_ok'] == 1
          and g['card_block_reason'] is None and 'rút gọn' in (g['polaris_warning'] or '') and '162 > 80' in g['polaris_warning'])
    report("POLARIS-warn-120", ok, f"luật chơi đo 120 + ★ 42 = khối {g['polaris_block_tokens']} > 80 nhưng nặng nhất {g['total_worst']} ≤ 2.000 "
           f"({g['budget_state']}) ⇒ Ký ✓ Cấp thẻ ✓, bản biên dịch lưu status ok; cảnh báo: \"{(g['polaris_warning'] or '')[:70]}…\"")

def t_v222_budget_block():
    """v2.2.2: tổng token prompt > 2.000 (M3, luật của Ryan) ⇒ Ký và Cấp thẻ đều CHẶN, kèm lý do."""
    D, X = seed()
    _recompile_mai(D, X, 200, 'over')
    g = gate(D, X['mai'])
    ok = (g['total_worst'] > 2000 and g['budget_state'] == 'over' and g['sign_ok'] == 0 and g['card_ok'] == 0 and g['gate_ok'] == 0
          and 'vượt ngân sách' in (g['sign_block_reason'] or '') and 'vượt ngân sách' in (g['card_block_reason'] or '')
          and g['polaris_warning'] is not None)
    report("BUDGET-over-block", ok, f"luật chơi đo 200 + ★ 42 ⇒ nặng nhất {g['total_worst']} > 2.000 ⇒ Ký ✗ Cấp thẻ ✗ — \"{g['card_block_reason']}\" "
           f"(cảnh báo Polaris vẫn hiện kèm)")

def t_v223_sign_estimate():
    """v2.2.3 (Gen): ước lượng overhead cho cổng Ký = max(đo cùng engine) × 1,1, hoặc setting 250; Cấp thẻ vẫn đòi số đo thật."""
    D, X = seed()
    db, W, mai, lan = D.db, X['W'], X['mai'], X['lan']
    col = "overhead_source, overhead_estimate_basis, baseline_overhead_tokens, total_worst, budget_state, sign_ok, card_ok, card_block_reason"
    q = lambda r: dict(zip([c.strip() for c in col.split(',')], db.execute(f"SELECT {col} FROM v_role_prompt_budget WHERE role_id=?", (r,)).fetchone()))
    lan_same = q(lan)                                                     # Antigravity đã đo ở tài khoản của Mai (204) → 225
    db.execute("""UPDATE engine_accounts SET runtime_overhead_tokens=NULL, overhead_measured_at=NULL, overhead_bare_session_id=NULL,
                  overhead_shell_session_id=NULL WHERE id=?""", (X['EN']['mai_ag'],))      # Mai chưa đo, workspace chưa có số đo Antigravity
    mai_set, lan_set = q(mai), q(lan)
    # owner chỉnh setting → ước lượng đổi theo; setting rác / Role ghi → DB từ chối (fail-closed: rác CAST thành 0 sẽ mở cổng Ký)
    A, own = X['A'], X['A'][(W, 'owner')]
    upd = lambda v, by: db.execute("UPDATE settings SET value_json=?, updated_by=? WHERE workspace_id=? AND key='budget.runtime_overhead_estimate_tokens'", (v, by, W))
    upd('300', own); mai_300 = q(mai)['baseline_overhead_tokens']; upd('250', own)
    neg = [expect_fail(db, lambda v=v: upd(v, own), 'số nguyên 1–2000') for v in ('0', '"abc"', '2001', '1.5')]
    neg += [expect_fail(db, lambda by=by: upd('100', by), 'chỉ owner/admin') for by in (A[(W, 'Mai')], A[(W, 'trainer')])]
    neg_ok = all(n[0] for n in neg) and mai_300 == 300 and q(mai)['baseline_overhead_tokens'] == 250
    ok = neg_ok and (lan_same['overhead_source'] == 'estimated' and lan_same['overhead_estimate_basis'] == 'same_engine' and lan_same['baseline_overhead_tokens'] == 225
          and lan_same['sign_ok'] == 1 and lan_same['card_ok'] == 0
          and mai_set['overhead_source'] == 'estimated' and mai_set['overhead_estimate_basis'] == 'setting' and mai_set['baseline_overhead_tokens'] == 250
          and mai_set['total_worst'] == 1935 and mai_set['budget_state'] == 'near' and mai_set['sign_ok'] == 1
          and mai_set['card_ok'] == 0 and 'chưa đo' in (mai_set['card_block_reason'] or '') and lan_set['baseline_overhead_tokens'] == 250)
    report("SIGN-estimate", ok, f"Mai chưa đo, workspace chưa có số đo Antigravity → ước lượng {mai_set['baseline_overhead_tokens']} (setting): "
           f"1.591 + 250 + 94 = {mai_set['total_worst']} ({mai_set['budget_state']}) → Ký ✓, Cấp thẻ ✗ — \"{mai_set['card_block_reason']}\"; "
           f"Lan khi đã có số đo Antigravity 204 → ước lượng {lan_same['baseline_overhead_tokens']} (cùng engine × 1,1), Ký ✓ Cấp thẻ ✗ "
           f"(v2.2.2 dùng hằng 400 → 2.085, chặn nhầm chính Mai); owner đặt 300 → {mai_300}; setting 0 / chuỗi / 2001 / 1,5 / Role Mai ghi / Trainer ghi → chặn "
           f"({sum(1 for n in neg if n[0])}/{len(neg)})")

def t_v224_detect_first():
    """CNS-058 (phân xử Gen v2.2.4): khoan hồng 'tự báo' chỉ khi Role tự báo TRƯỚC mọi audit phát hiện (system/judge) của cùng việc."""
    D, X = seed()
    db, W, mai, A, WM, WT = D.db, X['W'], X['mai'], X['A'], X['WM'], X['WT']
    owner, gw, judge, am = A[(W, 'owner')], A[(W, 'gateway')], A[(W, 'judge')], A[(W, 'Mai')]
    bal = lambda: D.one("SELECT balance_minor FROM wallets WHERE id=?", WM)
    pen = lambda cls, amt, **kw: post(D, W, 'penalty', WM, WT, amt, kw.pop('reason', 'phạt'), penalty_class=cls, role_id=mai, **kw)
    full = lambda: dict(penalty_rate_bp=10000, basis_balance_minor=bal())
    def task_with(order, detect_action, detector):
        """order = 'detect_first' | 'report_first'; trả (task, audit phát hiện, audit tự báo)."""
        tk = uid(f'task:{order}:{detect_action}:{detector}')
        det = lambda: audit(D, W, detect_action, entity_id=tk, actor=detector, detail={'rule': 'P3'})[0]
        rep = lambda: audit(D, W, 'task.report_failure', entity_id=tk, actor=am, detail={'tool': 'report_task', 'outcome': 'failed'})[0]
        a1, a2 = (det(), rep()) if order == 'detect_first' else (rep(), det())
        au_det, au_rep = (a1, a2) if order == 'detect_first' else (a2, a1)
        D.ins('tasks', id=tk, workspace_id=W, position_id=X['PS'], assignee_role_id=mai, requested_by=owner, source='web', status='failed',
              title=f'{order} {detect_action}', failure_disclosure='self_reported', failure_report_audit_id=au_rep, failure_reported_at=now())
        return tk, au_det, au_rep
    c, case = _cases(db)
    # H1: gateway bắt TRƯỚC, Role report_task SAU → không khoan hồng: self_reported bị chặn, harness 100 % được (probe H1 của closure check)
    tkH, auH, repH = task_with('detect_first', 'harness.violation', gw)
    case("H1: bị bắt trước rồi mới tự báo — xin hạng self_reported ≤10 %", lambda: pen('self_reported', bal() * 1000 // 10000, task_id=tkH), 'SAU khi máy phát hiện')
    case("H1: bị bắt trước, trích bản tự báo làm bằng chứng để xin self_reported", lambda: pen('self_reported', bal() * 1000 // 10000, task_id=tkH,
         evidence_audit_id=repH), 'SAU khi máy phát hiện')
    # report TRƯỚC, phát hiện SAU → vẫn chỉ self_reported (đường cũ của ECON-paths, ca A')
    tkR, auR, repR = task_with('report_first', 'harness.violation', gw)
    case("tự báo trước, gateway bắt sau — harness 100 %", lambda: pen('harness_violation', bal(), task_id=tkR, evidence_audit_id=auR, **full()), 'chỉ phạt hạng self_reported')
    e_r = pen('self_reported', bal() * 1000 // 10000, task_id=tkR, evidence_audit_id=repR, reason='Tự báo trước khi bị bắt — khoan hồng')
    r_ok = bal() > 0 and D.one("SELECT condition FROM roles WHERE id=?", mai) == 'normal'
    # audit phát hiện của OWNER (không phải máy) trước bản tự báo → không tính là "bị phát hiện"
    tkO, auO, repO = task_with('detect_first', 'harness.violation', owner)
    case("audit của owner trước bản tự báo không phải 'máy phát hiện' — harness vẫn bị chặn", lambda: pen('harness_violation', bal(), task_id=tkO,
         evidence_audit_id=auO, **full()), 'chỉ phạt hạng self_reported|cần bằng chứng do máy')
    # C1: judge ghi concealment.detected TRƯỚC bản tự báo → che giấu (≥ sàn) được
    tkC, auC, repC = task_with('detect_first', 'concealment.detected', judge)
    e_c = pen('concealment', -(-bal() * 5000 // 10000), task_id=tkC, evidence_audit_id=auC, reason='Che giấu bị Judge phát hiện trước khi tự báo')
    case("C1: che giấu dưới sàn vẫn bị chặn", lambda: pen('concealment', bal() * 4999 // 10000, task_id=tkC, evidence_audit_id=auC), 'dưới sàn')
    # H1 dương: harness 100 % được, về 0 ⇒ Trọng thương (luật "không một mình về 0" chỉ của hạng self_reported)
    e_h = pen('harness_violation', bal(), task_id=tkH, evidence_audit_id=auH, reason='Lách luật P3 — gateway bắt trước khi Role tự báo', **full())
    wounded = bal() == 0 and D.one("SELECT condition FROM roles WHERE id=?", mai) == 'wounded'
    ok = all(x[1] for x in c) and e_r and r_ok and e_c and e_h and wounded
    report("ECON-detect-first", ok, f"{sum(x[1] for x in c)}/{len(c)} ca âm; H1 gateway bắt TRƯỚC → Role report_task SAU: self_reported bị chặn, "
           f"harness 100 % được (ví 0 ⇒ Trọng thương); tự báo TRƯỚC → gateway bắt SAU: harness bị chặn, self_reported ≤10 % được; "
           f"C1 Judge concealment.detected trước bản tự báo → che giấu ≥50 % được; audit của owner không tính là máy phát hiện; "
           f"'trước' = thứ tự chuỗi audit (display_seq)")
    _show(c)

def t_v224_closure():
    """v2.2.4: P1 'kiếm được' + P2 'trước khi bị phát hiện' do trigger kiểm (CNS-068/058); ST-0015 (CNS-060); không mount /workspace (CNS-065)."""
    D, X = seed()
    db, W, mai = D.db, X['W'], X['mai']
    rules_txt = D.one("SELECT text FROM compiled_prompt_segments WHERE compiled_prompt_id=? AND source_kind='polaris_rules'", X['gc'])
    gct = D.ins('compiled_prompts', workspace_id=W, role_id=mai, revision_id=X['rv3'], engine_slug='antigravity', context_key='x-v224',
                compiler_version='c1', tokenizer='demo-fixed', total_tokens=1591, frame_tokens=28, budget_tokens=2000, status='ok',
                content='...', content_hash='c3', stable_prefix_hash='p', polaris_params_hash='v224')
    txt, params = render_rules(D, W)
    seg = lambda t: D.ins('compiled_prompt_segments', workspace_id=W, compiled_prompt_id=gct, ordinal=1, layer='polaris', source_kind='polaris_rules',
                          source_display='P', text=t, params_json=params, token_count=30)
    c, case = _cases(db)
    case("P1 cũ 'P1 ₲ chỉ từ việc…' (thiếu 'kiếm được')", lambda: seg(txt.replace('₲ kiếm được chỉ từ', '₲ chỉ từ')), 'luật chơi P1–P4')
    case("P2 không nói 'trước khi bị phát hiện'", lambda: seg(txt.replace('tự báo lỗi trước khi bị phát hiện', 'tự báo lỗi')), 'luật chơi P1–P4')
    case("P1 quảng cáo 'owner cấp'", lambda: seg(txt.replace('đã được duyệt/đánh giá', 'đã được duyệt/đánh giá hoặc owner cấp')), 'luật chơi P1–P4')
    st = dict(db.execute("SELECT key, display_id FROM settings WHERE workspace_id=? AND deleted_at IS NULL", (W,)).fetchall())
    ws_mounts = D.one("SELECT count(*) FROM v_container_mounts WHERE mount_path = '/workspace' OR volume_kind = 'workspace'")
    kinds = sorted(r[0] for r in db.execute("SELECT DISTINCT volume_kind FROM v_container_mounts"))
    ok = (all(x[1] for x in c) and '₲ kiếm được chỉ từ việc đã được duyệt/đánh giá' in rules_txt and 'tự báo lỗi trước khi bị phát hiện' in rules_txt
          and st.get('budget.runtime_overhead_estimate_tokens') == 'ST-0015' and st.get('economy.penalty.harness_bp') == 'ST-0005'
          and st.get('economy.penalty.self_confessed_harness_as_self_reported') == 'ST-0016' and ws_mounts == 0 and kinds == ['auth', 'session_tmpfs'])
    report("V224-closure", ok, f"{sum(x[1] for x in c)}/{len(c)} ca âm luật chơi (P1 thiếu 'kiếm được', P2 thiếu 'trước khi bị phát hiện', 'owner cấp'); "
           f"seed settings khớp design: harness ST-0005, ước lượng overhead {st.get('budget.runtime_overhead_estimate_tokens')}, Q-R7b "
           f"{st.get('economy.penalty.self_confessed_harness_as_self_reported')}; v_container_mounts chỉ {kinds} — không /workspace (GĐ2), không /brain")
    _show(c)

def t_v224_required_class():
    """Gen v2.2.4 vòng 2: máy phát hiện TRƯỚC mọi tự báo ⇒ hạng BẮT BUỘC (harness 100 % / che giấu ≥ sàn); báo động nhầm ⇒ reversal + audit."""
    D, X = seed()
    db, W, mai, A, WM, WT = D.db, X['W'], X['mai'], X['A'], X['WM'], X['WT']
    owner, gw, judge, am = A[(W, 'owner')], A[(W, 'gateway')], A[(W, 'judge')], A[(W, 'Mai')]
    bal = lambda: D.one("SELECT balance_minor FROM wallets WHERE id=?", WM)
    pen = lambda cls, amt, **kw: post(D, W, 'penalty', WM, WT, amt, kw.pop('reason', 'phạt'), penalty_class=cls, role_id=mai, **kw)
    pct = lambda bp, **kw: dict(penalty_rate_bp=bp, basis_balance_minor=bal(), **kw)
    def task(title, *detections, report=False):
        tk = uid(f'task:req:{title}')
        auds = [audit(D, W, act, entity_id=tk, actor=who, detail={'rule': 'P3'})[0] for act, who in detections]
        extra = {}
        if report:
            rep = audit(D, W, 'task.report_failure', entity_id=tk, actor=am, detail={'tool': 'report_task', 'outcome': 'failed'})[0]
            extra = dict(failure_disclosure='self_reported', failure_report_audit_id=rep, failure_reported_at=now())
        D.ins('tasks', id=tk, workspace_id=W, position_id=X['PS'], assignee_role_id=mai, requested_by=owner, source='web', status='failed',
              title=title, **extra)
        return tk, auds
    c, case = _cases(db)
    tkH, (auH,) = task('Gateway bắt lách P3', ('harness.violation', gw))                       # chưa ai tự báo
    tkH2, (auH2,) = task('Bắt trước, khai sau', ('harness.violation', gw), report=True)         # H1
    tkC, (auC,) = task('Judge bắt che giấu', ('concealment.detected', judge))
    au_own, _ = audit(D, W, 'claim.verify', entity_id=tkH, detail={'note': 'owner xem lại'})
    req_h, req_c = 'PHẢI là harness_violation', 'PHẢI là concealment'
    case("hạ harness → không hài lòng 30 % (bằng chứng gateway)", lambda: pen('dissatisfaction', (bal() * 3000 + 5000) // 10000, task_id=tkH,
         evidence_audit_id=auH, **pct(3000)), req_h)
    case("hạ harness → không hài lòng, bằng chứng audit riêng của owner", lambda: pen('dissatisfaction', 100, task_id=tkH, evidence_audit_id=au_own), req_h)
    case("hạ harness → không hài lòng, chỉ task_id", lambda: pen('dissatisfaction', 100, task_id=tkH), req_h)
    case("hạ harness → che giấu 50 % (máy không phát hiện che giấu)", lambda: pen('concealment', -(-bal() * 5000 // 10000), task_id=tkH,
         evidence_audit_id=auH), req_h)
    case("H1 (bắt trước, khai sau): hạ xuống không hài lòng", lambda: pen('dissatisfaction', 100, task_id=tkH2), req_h)
    case("hạ che giấu → không hài lòng", lambda: pen('dissatisfaction', 100, task_id=tkC, evidence_audit_id=auC), req_c)
    case("che giấu do Judge phát hiện → ghi thành harness", lambda: pen('harness_violation', bal(), task_id=tkC, evidence_audit_id=auC, **pct(10000)), req_c)
    # đúng hạng: che giấu ≥ sàn trên tkC; harness 100 % trên tkH ⇒ ví 0 ⇒ Trọng thương
    e_c = pen('concealment', -(-bal() * 5000 // 10000), task_id=tkC, evidence_audit_id=auC, reason='Che giấu — Judge phát hiện')
    e_h = pen('harness_violation', bal(), task_id=tkH, evidence_audit_id=auH, reason='Lách P3 — gateway phát hiện', **pct(10000))
    amt_h = D.one("SELECT amount_minor FROM ledger_entries WHERE id=?", e_h)
    wounded = bal() == 0 and D.one("SELECT condition FROM roles WHERE id=?", mai) == 'wounded'
    # báo động nhầm: KHÔNG hạ hạng — đảo bút toán (soi gương) kèm lý do + audit
    rev = lambda **kw: post(D, W, 'reversal', WT, WM, amt_h, kw.pop('reason', 'Báo động nhầm: gateway đọc sai lịch đăng'), reverses_entry_id=e_h, role_id=mai, **kw)
    case("đảo phạt harness không kèm audit", lambda: rev(), 'kèm audit')
    au_fp, _ = audit(D, W, 'penalty.false_positive', entity_id=tkH, detail={'entry': e_h, 'why': 'lịch đăng đã được duyệt từ trước'},
                     reason='Gateway báo nhầm')
    e_rev = rev(evidence_audit_id=au_fp)
    restored = bal() == amt_h and D.one("SELECT condition FROM roles WHERE id=?", mai) == 'normal'
    case("sau khi đảo, vẫn không hạ được xuống không hài lòng", lambda: pen('dissatisfaction', 100, task_id=tkH), req_h)
    ok = all(x[1] for x in c) and e_c and e_h and wounded and e_rev and restored
    report("ECON-required-class", ok, f"{sum(x[1] for x in c)}/{len(c)} ca âm: máy phát hiện trước mọi tự báo ⇒ hạng BẮT BUỘC — hạ harness xuống "
           f"không hài lòng / che giấu (mọi đường bằng chứng, kể cả H1 bắt trước khai sau) và hạ che giấu bị chặn; đúng hạng thì được "
           f"(che giấu ≥50 %, harness 100 % ⇒ ví 0, Trọng thương); báo động nhầm: đảo không audit bị chặn, đảo kèm lý do + audit "
           f"penalty.false_positive ⇒ ví về {fmt_g(amt_h)} ₲, hồi phục ({'normal' if restored else '?'})")
    _show(c)

# ================================================================== v2.2.5 — INT-20 Core agent (Ryan 2026-10-15) + phán quyết cổng ④⑤
MSG_CORE_T = 'INT-20: tài khoản của AI Hệ thống phải cùng loại Core agent'
MSG_RO_T = 'chỉ đọc kể từ lần kiểm đăng nhập đạt đầu tiên'                # v2.2.9 (CONTRACT-r8b §A): mốc = lần kiểm đăng nhập đạt đầu tiên
#   (v2.2.6–v2.2.8: 'chỉ đọc kể từ khi gắn tài khoản Core agent đầu tiên' — khoá lúc ghi binding, đã đổi)
MSG_BOUND_T = 'binding Core agent trước, rồi mới đổi'                       # v2.2.9 (CONTRACT-r8b §A): trước mốc, đang gắn tài khoản (regex: không có '+')
MSG_INCIDENT_T = 'chỉ phát khi v_core_agent_status.is_incident = 1'          # v2.2.9 (CONTRACT-r8b §B/§C)
MSG_READY_T = 'mọi Role mới chỉ tạo được'                                  # v2.2.6 (A4): thay "Role đầu tiên"
MSG_LAST_T = 'Core agent cuối cùng'
MSG_LOCK_T = 'core_agent_locked_at ghi một lần'
MSG_ONE_T = 'một tài khoản cho mỗi loại CLI'                                 # v2.2.8 (CONTRACT-r8 §A)
MSG_FO_CORE_T = 'Core agent không fallback'                                   # v2.2.8 (CONTRACT-r8 §C)
MSG_FO_ROLE_T = 'tài khoản của cùng một Role'                                 # v2.2.8 (CONTRACT-r8 §B)
MSG_FO_TYPE_T = 'fallback tự động chỉ sang LOẠI CLI khác'                     # v2.2.8 (CONTRACT-r8 §B)
MSG_SA_T = 'phiên AI Hệ thống'                                                # v2.2.8 (CONTRACT-r8 §C)
MSG_TC_OWNER_T = 'đổi loại Core agent khi sự cố — chỉ owner'                    # v2.2.10 (CONTRACT-r8c §A)
MSG_TC_CONSENT_T = 'tick đồng ý MỚI trước khi đổi'                             # v2.2.10 (CONTRACT-r8c §A)
MSG_TC_EVENT_T = 'events core_agent.type_changed'                               # v2.2.10 (CONTRACT-r8c §A)
MSG_SA_VALID_T = 'selection_state phải là valid'                                 # v2.2.11 (CONTRACT-r8d §A)
MSG_CARD_T = 'không cấp thẻ mới'                                                 # v2.2.11 (CONTRACT-r8d §C)
MSG_AL_T = 'hàng chủ sở hữu'                                                     # v2.2.11 (CONTRACT-r8d §D) — v2.2.12: chung cho 4 thông điệp bất biến owner
MSG_AL_LAST_T = 'chủ sở hữu cuối cùng'                                           # v2.2.12 (CONTRACT-r8e §A)
MSG_AL_ID_T = 'không đổi tg_user_id / bot_id'                                    # v2.2.12 (CONTRACT-r8e §A)
MSG_AL_DEL_T = 'không xoá cứng hàng chủ sở hữu'                                  # v2.2.12 (CONTRACT-r8e §A)
MSG_TG_RESTORE_T = 'khôi phục bot Telegram đã xoá mềm'                           # v2.2.12 (CONTRACT-r8e §A)
MSG_NR_T = 'chống REPLACE'                                                       # v2.2.13 (review bảo mật, MEDIUM)
MSG_AL_NEW_T = 'chỉ thành chủ sở hữu active'                                     # v2.2.13 (review bảo mật, HIGH)
MSG_TG_RESTORE_OWNER_T = 'chỉ owner của workspace khôi phục'                     # v2.2.13 (review bảo mật, HIGH)
FO_REASONS = ['login_expired', 'outage', 'quota_exhausted', 'account_suspended']

def _fresh_ws(D, tag, code, cli=True):
    """Workspace tenant mới, CHƯA onboarding: chỉ có owner (Ryan) + vài actor hệ thống; KHÔNG có hàng settings (fail-closed)."""
    db = D.db
    ws = uid('ws:' + tag)
    db.execute("INSERT INTO workspaces(id,kind,slug,name,short_code) VALUES(?,?,?,?,?)", (ws, 'tenant', tag, tag.title(), code))
    ryan = D.one("SELECT id FROM users WHERE username='admin'")
    db.execute("INSERT INTO workspace_members(workspace_id,user_id,access_level) VALUES(?,?,?)", (ws, ryan, 'owner'))
    A = {'owner': uid(f'actor:{ws}:owner')}
    db.execute("INSERT INTO actors(id,workspace_id,kind,user_id,label) VALUES(?,?,?,?,?)", (A['owner'], ws, 'user', ryan, 'Ryan'))
    for k in ('system', 'trainer', 'gateway'):
        A[k] = uid(f'actor:{ws}:{k}')
        db.execute("INSERT INTO actors(id,workspace_id,kind,system_key,label) VALUES(?,?,?,?,?)", (A[k], ws, 'system', k, k.title()))
    if cli:                                     # v2.3.1 (CNS-137): bản cài đã tải CLI (install.sh) — cli=False: CLI chưa cài (thiếu hàng ⇒ not_installed)
        for slug, ver in INSTALLED_CLI:
            D.ins('engine_installs', workspace_id=ws, engine_slug=slug, install_state='installed', installed_version=ver, created_by=A['system'])
    return ws, A

def _ob(D, ws, code):
    return D.db.execute("SELECT check_status, check_detail FROM v_setup_checklist WHERE workspace_id=? AND check_code=?", (ws, code)).fetchone()

def _acc(D, ws, slug, label, vol, login='unknown', consent=None):
    return D.ins('engine_accounts', workspace_id=ws, engine_slug=slug, label=label, auth_method='subscription', auth_volume=vol,
                 login_status=login, consent_id=consent)

def _cn(D, ws, subject='antigravity', kind='engine_tos_risk', version='1'):
    """v2.2.8: một đồng ý điều khoản (Clause 6 với Antigravity) của owner Ryan trong workspace ws."""
    ryan = D.one("SELECT id FROM users WHERE username='admin'")
    return D.ins('consents', workspace_id=ws, user_id=ryan, consent_kind=kind, subject=subject, notice_version=version, notice_hash='h',
                 accepted_at=now())

def _core_acc(D, ws, label, vol, login='unknown', **kw):
    """v2.2.8 (CONTRACT-r7 §A/§B): tài khoản Core agent mặc định = Antigravity, kèm đồng ý Clause 6 RIÊNG ghi ngay trước (Onboarding bước 2)."""
    return D.ins('engine_accounts', workspace_id=ws, engine_slug='antigravity', label=label, auth_method=kw.pop('auth_method', 'subscription'),
                 auth_volume=vol, login_status=login, consent_id=_cn(D, ws), **kw)

def _probe(D, ws, acc, ct, status='ok', slug='antigravity'):
    return D.ins('probe_runs', workspace_id=ws, engine_account_id=acc, engine_slug=slug, container_id=ct, trigger='login_check',
                 auth_mode='oauth', status=status, started_at=now(), finished_at=now())

def t_v225_core_binding():
    """INT-20: mọi binding SỐNG của consumer Hệ thống trỏ tài khoản cùng loại Core agent — ma trận lối vào (INSERT / UPDATE từng cột /
    đổi loại tài khoản / khôi phục binding sau khi đổi loại) + đối chứng cùng loại + lớp thứ hai (v_integrity) khi trigger bị bỏ.
    v2.2.8: Core agent = Antigravity (Q-I5 [CHỐT]) ⇒ "khác loại" = Claude Code / Codex; AI Hệ thống chỉ MỘT tài khoản (CONTRACT-r8 §A)."""
    D, X = seed()
    db, W, EN, EB, mai = D.db, X['W'], X['EN'], X['EB'], X['mai']
    c, case = _cases(db)
    cc = _acc(D, W, 'claude-code', 'Anthropic — thử Hệ thống', 'ga-auth-try-cc', 'logged_in')
    cx = _acc(D, W, 'codex', 'OpenAI — thử Hệ thống', 'ga-auth-try-cx', 'logged_in')
    sysb = lambda acc, prio, **kw: D.ins('engine_bindings', workspace_id=W, consumer_kind='system', engine_account_id=acc, priority=prio, **kw)
    case("INSERT binding Hệ thống → tài khoản Claude Code", lambda: sysb(cc, 3), MSG_CORE_T)
    case("INSERT binding Hệ thống → tài khoản Codex", lambda: sysb(cx, 3), MSG_CORE_T)
    case("UPDATE engine_account_id của EB-0001 (Hệ thống) → tài khoản Claude Code", lambda: db.execute(
        "UPDATE engine_bindings SET engine_account_id=? WHERE id=?", (cc, EB['sys_ag'])), MSG_CORE_T + '|' + MSG_LAST_T)
    case("UPDATE consumer_kind role → system (binding Claude Code EN-0004 của Mai)", lambda: db.execute(
        "UPDATE engine_bindings SET consumer_kind='system', role_id=NULL, priority=9 WHERE id=?", (EB['mai_cc'],)), MSG_CORE_T)
    case("UPDATE engine_slug của tài khoản Hệ thống EN-0001 → claude-code", lambda: db.execute(
        "UPDATE engine_accounts SET engine_slug='claude-code' WHERE id=?", (EN['sys_ag'],)), MSG_CORE_T + '|' + MSG_LAST_T)
    # hoán vị thời gian: binding Hệ thống CŨ đã xoá mềm (lịch sử) → đổi loại tài khoản của nó lúc không còn binding sống → khôi phục binding
    old = _core_acc(D, W, 'Google — Hệ thống cũ', 'ga-auth-try-old', 'logged_in')
    eb_old = sysb(old, 5, deleted_at=now())                                         # hàng đã xoá mềm: không phải binding sống
    db.execute("UPDATE engine_accounts SET engine_slug='claude-code' WHERE id=?", (old,))   # được: tài khoản không còn phục vụ Hệ thống
    case("khôi phục binding Hệ thống (deleted_at → NULL) sau khi tài khoản đã đổi sang claude-code", lambda: db.execute(
        "UPDATE engine_bindings SET deleted_at=NULL WHERE id=?", (eb_old,)), MSG_CORE_T)
    db.execute("UPDATE engine_accounts SET engine_slug='antigravity' WHERE id=?", (old,))   # đồng ý Clause 6 của nó vẫn hợp lệ
    case("đổi lại antigravity rồi khôi phục ⇒ thành tài khoản Hệ thống thứ hai cùng loại (CONTRACT-r8 §A)", lambda: db.execute(
        "UPDATE engine_bindings SET deleted_at=NULL WHERE id=?", (eb_old,)), MSG_ONE_T)
    case("lật binding Antigravity EN-0003 của Mai sang Hệ thống (đã có EB-0001)", lambda: db.execute(
        "UPDATE engine_bindings SET consumer_kind='system', role_id=NULL, priority=6 WHERE id=?", (EB['mai_ag'],)), MSG_ONE_T)
    # lối đổi loại của tài khoản đang phục vụ Hệ thống mà KHÔNG phải tài khoản Core agent sống cuối cùng (binding sống nhưng tài khoản đã vô hiệu
    # trước khi gắn — workspace W12): chỉ engine_accounts_core_agent_u chặn
    W12, A12 = _fresh_ws(D, 'bind-twelve', 'WB12')
    D.ins('containers', workspace_id=W12, kind='system', container_name='ga-sys-wb12', desired_state='sleeping', observed_state='created')
    d12 = _core_acc(D, W12, 'Google — đã vô hiệu', 'ga-auth-wb12-0001', 'logged_in')
    db.execute("UPDATE engine_accounts SET status='disabled' WHERE id=?", (d12,))
    D.ins('engine_bindings', workspace_id=W12, consumer_kind='system', engine_account_id=d12, priority=1)
    case("UPDATE engine_slug của tài khoản Hệ thống (đã vô hiệu, binding sống) → claude-code", lambda: db.execute(
        "UPDATE engine_accounts SET engine_slug='claude-code' WHERE id=?", (d12,)), MSG_CORE_T)
    # đối chứng: cùng loại Core agent thì được — tài khoản Antigravity ĐẦU TIÊN của workspace mới (đồng ý Clause 6 riêng)
    W9, A9, ct9, a9, b9 = _core_ws(D, 'bind-nine', 'WB09', n=1)
    ok_ins = bool(b9[0])
    core_flags = dict(db.execute("SELECT display_id, is_core_agent FROM v_engine_accounts WHERE workspace_id=? AND display_id IN "
                                 "('EN-0001','EN-0003','EN-0004','EN-0005')", (W,)).fetchall())
    integ0 = [r for r in db.execute("SELECT check_key FROM v_integrity") if r[0] == 'core_agent_mismatch']
    # lớp thứ hai: bỏ trigger INSERT (script bảo trì lỗi) → v_integrity báo, chip "Core agent" không gắn sai
    db.execute("DROP TRIGGER IF EXISTS engine_bindings_core_agent_i")
    sysb(cc, 9)
    integ1 = db.execute("SELECT value FROM v_integrity WHERE check_key='core_agent_mismatch' AND workspace_id=?", (W,)).fetchone()
    cc_flag = D.one("SELECT is_core_agent FROM v_engine_accounts WHERE engine_account_id=?", cc)
    ok = (all(x[1] for x in c) and ok_ins and core_flags == {'EN-0001': 1, 'EN-0003': 0, 'EN-0004': 0, 'EN-0005': 0}
          and not integ0 and integ1 == (1,) and cc_flag == 0)
    report("CORE-binding", ok, f"{sum(x[1] for x in c)}/{len(c)} lối bị chặn (Core agent = Antigravity): binding Hệ thống khác loại qua INSERT "
           f"(Claude Code, Codex), UPDATE engine_account_id, UPDATE consumer_kind role→system (Claude Code của Mai), đổi engine_slug của tài khoản Hệ thống "
           f"(EN-0001; tài khoản đã vô hiệu nhưng binding sống), khôi phục binding sau khi đổi loại (hoán vị thời gian); v2.2.8: khôi phục thành tài khoản "
           f"Hệ thống thứ hai cùng loại, lật Antigravity của Mai sang Hệ thống ⇒ luật một tài khoản mỗi loại; đối chứng: tài khoản Antigravity đầu tiên "
           f"của workspace mới gắn được; chip is_core_agent {core_flags}; bỏ trigger → v_integrity core_agent_mismatch = "
           f"{integ1[0] if integ1 else 0}, tài khoản lạ không mang chip")
    _show(c)

def t_v225_core_setting():
    """ST-0017 system.core_agent_engine: dữ liệu, không hardcode; chỉ đọc kể từ mốc khoá (UPDATE / xoá mềm / xoá cứng / đổi khoá / INSERT đổi
    giá trị hiệu lực); thiếu hàng ⇒ fail-closed về 'antigravity' (v2.2.8, Q-I5 [CHỐT]); trước mốc chỉ owner/admin ghi, đúng slug core_capable + ready;
    đối chứng: Claude Code vẫn chọn được trước mốc khoá."""
    D, X = seed()
    db, W, W2, A = D.db, X['W'], X['W2'], X['A']
    own = A[(W, 'owner')]
    c, case = _cases(db)
    st = db.execute("SELECT display_id, value_json FROM settings WHERE workspace_id=? AND key='system.core_agent_engine'", (W,)).fetchone()
    upd = lambda ws, sql, *a: db.execute(f"UPDATE settings SET {sql} WHERE workspace_id=? AND key='system.core_agent_engine' AND deleted_at IS NULL",
                                         (*a, ws))
    # --- W đã có binding Hệ thống: mọi lối sửa đều bị chặn
    case("W: owner đổi ST-0017 → claude-code", lambda: upd(W, "value_json=?, updated_by=?", '"claude-code"', own), MSG_RO_T)
    case("W: owner xoá mềm ST-0017", lambda: upd(W, "deleted_at=?, updated_by=?", now(), own), MSG_RO_T)
    case("W: xoá cứng ST-0017", lambda: db.execute("DELETE FROM settings WHERE workspace_id=? AND key='system.core_agent_engine'", (W,)), MSG_RO_T)
    case("W: đổi khoá ST-0017 sang khoá khác", lambda: upd(W, "key='system.core_agent_engine_old', updated_by=?", own), MSG_RO_T)
    case("W: đổi khoá khác (ST-0009) thành system.core_agent_engine", lambda: db.execute(
        "UPDATE settings SET key='system.core_agent_engine', value_json='\"claude-code\"', updated_by=? WHERE workspace_id=? AND key='economy.reflection_max_runs'",
        (own, W)), MSG_RO_T)
    db.execute("UPDATE settings SET note='Core agent = Antigravity (Q-I5, Ryan 2026-10-16)' WHERE workspace_id=? AND key='system.core_agent_engine'", (W,))
    # --- W2 CHƯA có binding Hệ thống: ghi được, nhưng chỉ owner/admin và đúng slug engine core_capable + ready
    o2 = A[(W2, 'owner')]
    db.execute("""INSERT INTO engines(slug,name,vendor,cli_binary,adapter_status,priority_order,tos_risk,tos_notice_key,tos_notice_version,requires_consent,core_capable)
                  VALUES('plain-ready','Plain','x','pr','ready',5,'grey','tos.pr','1',0,0)""")
    case("W2: slug không có trong danh mục", lambda: upd(W2, "value_json=?, updated_by=?", '"gemini-cli"', o2), 'phải là slug')
    case("W2: openclaw (core_capable = 1 nhưng coming_soon — CONTRACT-r8 §C)", lambda: upd(W2, "value_json=?, updated_by=?", '"openclaw"', o2), 'phải là slug')
    case("W2: giá trị số", lambda: upd(W2, "value_json=?, updated_by=?", '2', o2), 'phải là slug')
    case("W2: engine ready nhưng core_capable = 0 (CNS-092)", lambda: upd(W2, "value_json=?, updated_by=?", '"plain-ready"', o2), 'phải là slug')
    case("W2: Trainer ghi", lambda: upd(W2, "value_json=?, updated_by=?", '"claude-code"', A[(W2, 'trainer')]), 'chỉ owner/admin')
    case("W2: Role Mai (actor workspace khác) ghi", lambda: upd(W2, "value_json=?, updated_by=?", '"claude-code"', A[(W, 'Mai')]), 'chỉ owner/admin')
    case("W2: engine coming_soon (codex — v2.2.6)", lambda: upd(W2, "value_json=?, updated_by=?", '"codex"', o2), 'phải là slug')
    # đối chứng (v2.2.8): Claude Code vẫn chọn được trước mốc ⇒ tài khoản Antigravity không gắn được cho Hệ thống (dữ liệu, không hardcode)
    upd(W2, "value_json=?, updated_by=?", '"claude-code"', o2)
    cc_pick = D.one("SELECT value_json FROM settings WHERE workspace_id=? AND key='system.core_agent_engine' AND deleted_at IS NULL", W2)
    ct2 = D.ins('containers', workspace_id=W2, kind='system', container_name='ga-sys-zz99', desired_state='sleeping', observed_state='created')
    ag = _core_acc(D, W2, 'Google — Other Co', 'ga-auth-zz99-0003', 'logged_in')
    case("W2 (Core = claude-code): binding Hệ thống → Antigravity", lambda: D.ins('engine_bindings', workspace_id=W2, consumer_kind='system',
         engine_account_id=ag, priority=1), MSG_CORE_T)
    upd(W2, "value_json=?, updated_by=?", '"antigravity"', o2)                                  # vẫn chưa có binding ⇒ đổi lại được
    # fail-closed: owner xoá mềm ST-0017 (chưa có binding) ⇒ mặc định registry 'antigravity'
    upd(W2, "deleted_at=?, updated_by=?", now(), o2)
    cc = _acc(D, W2, 'claude-code', 'Anthropic — Other Co', 'ga-auth-zz99-0001', 'logged_in')
    case("W2 thiếu ST-0017 (fail-closed antigravity): binding Hệ thống → Claude Code", lambda: D.ins('engine_bindings', workspace_id=W2,
         consumer_kind='system', engine_account_id=cc, priority=1), MSG_CORE_T)
    D.ins('engine_bindings', workspace_id=W2, consumer_kind='system', engine_account_id=ag, priority=1)   # mặc định antigravity: OK
    # v2.2.9 (CONTRACT-r8b §A): W2 có binding nhưng CHƯA kiểm đăng nhập đạt ⇒ chưa khoá; vẫn bị chặn, nay bởi settings_core_agent_bound_*
    # ("Chọn loại khác" phải gỡ tài khoản + binding trước) — v2.2.6–v2.2.8 kỳ vọng MSG_RO_T (khoá lúc ghi binding)
    case("W2 đã có binding (chưa đăng nhập đạt), thiếu hàng: INSERT ST-0017 = claude-code (đổi giá trị hiệu lực)", lambda: D.ins('settings', workspace_id=W2,
         key='system.core_agent_engine', value_json='"claude-code"', created_by=o2), MSG_BOUND_T)
    D.ins('settings', workspace_id=W2, key='system.core_agent_engine', value_json='"antigravity"', created_by=o2)   # khôi phục đúng giá trị: OK
    case("W2 sau khi khôi phục hàng: đổi sang claude-code (binding còn, chưa khoá)", lambda: upd(W2, "value_json=?, updated_by=?", '"claude-code"', o2), MSG_BOUND_T)
    ok = all(x[1] for x in c) and st == ('ST-0017', '"antigravity"') and cc_pick == '"claude-code"'
    report("CORE-setting", ok, f"{st[0]} system.core_agent_engine = {st[1]} (Q-I5 [CHỐT — Ryan 2026-10-16]); {sum(x[1] for x in c)}/{len(c)} ca bị chặn — "
           f"khi đã khoá: UPDATE giá trị, xoá mềm, xoá cứng, đổi khoá (hai chiều), INSERT làm đổi giá trị hiệu lực; trước mốc: slug lạ / coming_soon / số / "
           f"ready nhưng core_capable = 0, Trainer hoặc Role ghi; đối chứng: Claude Code chọn được trước mốc ⇒ Antigravity không gắn được cho Hệ thống "
           f"(dữ liệu, không hardcode); thiếu hàng ⇒ fail-closed antigravity (Claude Code bị chặn, Antigravity gắn được); sửa ghi chú vẫn được")
    _show(c)

def t_v225_seed():
    """Seed v2.2.5 (v2.2.6: SA suy ra tài khoản chính; v2.2.8: Core agent = Antigravity, CONTRACT-r8: MỘT tài khoản Hệ thống EN-0001, không dự phòng):
    cả 4 SA → EN-0001; CN-0002 = EN-0003 (tài khoản Antigravity đầu tiên của một Role); Role vẫn gán Antigravity (INT-05), consent bắt buộc ở A3.E."""
    D, X = seed()
    db, W = D.db, X['W']
    sysacc = db.execute("""SELECT a.display_id, a.engine_slug, a.label, b.display_id, b.priority, a.consent_id IS NULL FROM engine_bindings b
                           JOIN engine_accounts a ON a.id = b.engine_account_id WHERE b.workspace_id=? AND b.consumer_kind='system'
                           AND b.deleted_at IS NULL ORDER BY b.priority""", (W,)).fetchall()
    sa = db.execute("""SELECT display_id, system_key, account_display_id, model_key, effort FROM v_system_agents
                       WHERE workspace_id=? ORDER BY display_id""", (W,)).fetchall()       # v2.2.6 (A3): tài khoản suy ra
    cns = db.execute("""SELECT c.display_id, a.display_id, a.engine_slug, r.display_id FROM consents c JOIN engine_accounts a ON a.consent_id = c.id
                        JOIN engine_bindings b ON b.engine_account_id = a.id AND b.deleted_at IS NULL JOIN roles r ON r.id = b.role_id
                        WHERE c.workspace_id=? ORDER BY c.display_seq""", (W,)).fetchall()
    mounts = [r[0] for r in db.execute("SELECT mount_path FROM v_container_mounts WHERE container_display_id='CT-0001' AND volume_kind='auth' ORDER BY 1")]
    n_acc = D.one("SELECT count(*) FROM engine_accounts WHERE workspace_id=?", W)
    # INT-05 không bị phá: Role nháp mới gán tài khoản Antigravity (ưu tiên 1) được; thiếu consent vẫn bị chặn ở A3.E
    vy = D.ins('roles', workspace_id=W, name='Vy', name_norm='vy', color='orchid')
    D.ins('containers', workspace_id=W, kind='role', role_id=vy, container_name='ga-role-vy', desired_state='sleeping', observed_state='created')
    c, case = _cases(db)
    case("tài khoản Antigravity cho Role thiếu consent", lambda: _acc(D, W, 'antigravity', 'Google — Vy', 'ga-auth-en-0010'), 'consent')
    cn_vy = D.ins('consents', workspace_id=W, user_id=X['ryan'], consent_kind='engine_tos_risk', subject='antigravity', notice_version='1',
                  notice_hash='h', accepted_at=now())
    en_vy = _acc(D, W, 'antigravity', 'Google — Vy', 'ga-auth-en-0010', 'logged_in', cn_vy)
    eb_vy = D.ins('engine_bindings', workspace_id=W, role_id=vy, engine_account_id=en_vy, priority=1)
    vy_eng = D.one("SELECT engine_slug FROM v_role_prompt_budget WHERE role_id=?", vy)
    ok = (sysacc == [('EN-0001', 'antigravity', 'Google — Hệ thống', 'EB-0001', 1, 0)]
          and [(x[1], x[2]) for x in sa] == [('interviewer', 'EN-0001'), ('trainer', 'EN-0001'), ('consolidator', 'EN-0001'), ('judge', 'EN-0001')]
          and [x[0] for x in sa] == ['SA-0001', 'SA-0002', 'SA-0003', 'SA-0004']
          and cns == [('CN-0002', 'EN-0003', 'antigravity', 'RL-0001'), ('CN-0003', 'EN-0005', 'antigravity', 'RL-0002')]
          and mounts == ['/auth/en-0001'] and n_acc == 4 and all(x[1] for x in c) and eb_vy and vy_eng == 'antigravity')
    report("CORE-seed", ok, f"AI Hệ thống: {', '.join(f'{x[0]} {x[1]} \"{x[2]}\" ({x[3]}, có consent riêng)' for x in sysacc)} — duy nhất (CONTRACT-r8 §A); "
           f"{', '.join(f'{x[0]} {x[1]}→{x[2]} {x[3]}/{x[4]}' for x in sa)}; CT-0001 mount {mounts}; consent {', '.join(f'{x[0]}→{x[1]} ({x[3]})' for x in cns)}; "
           f"INT-05: Role mới gán Antigravity ưu tiên 1 được (engine chính {vy_eng}), thiếu consent bị chặn")
    _show(c)

# ================================================================== v2.2.6 — CONTRACT-r6 (audit CNS-2026-10-15-coreagent-r5, CNS-069…089)
# Probe của cortex (scratchpad cns-r5/probe_r5.py, probe_att.py) viết lại thành test: P1a–e, P2a–c, P3, P4, P5, Att — kèm ma trận lối vào
# × hoán vị thời gian cho mọi guard mới; luật "luôn/bắt buộc" ép CẢ VÒNG ĐỜI (tạo, sửa, xoá mềm/cứng, vô hiệu, hết hạn).
ATTK = 'chat.attachment_max_bytes'
MB25 = 26214400

def _role(D, ws, name):
    return D.ins('roles', workspace_id=ws, name=name, name_norm=name.lower(), color='slate')

def _try(fn):
    try:
        fn(); return True
    except sqlite3.DatabaseError:
        if D_ROLLBACK[0] is not None and D_ROLLBACK[0].in_transaction:
            D_ROLLBACK[0].execute("ROLLBACK")
        return False
D_ROLLBACK = [None]

def _core_ws(D, tag, code, n=1, ready=True):
    """Workspace mới đã qua Onboarding bước 2: container AI Hệ thống + n tài khoản Core agent (v2.2.8: Antigravity, đồng ý Clause 6 riêng) + binding Hệ thống;
    ready ⇒ login_status logged_in + một lần kiểm đăng nhập (login_check) ok trong container AI Hệ thống."""
    ws, A = _fresh_ws(D, tag, code)
    ct = D.ins('containers', workspace_id=ws, kind='system', container_name=f'ga-sys-{code.lower()}', desired_state='sleeping', observed_state='created')
    accs, binds = [], []
    for i in range(n):
        a = _core_acc(D, ws, f'Google — Hệ thống {i + 1}', f'ga-auth-{code.lower()}-{i + 1:04d}', 'logged_in' if ready else 'unknown')
        b = D.ins('engine_bindings', workspace_id=ws, consumer_kind='system', engine_account_id=a, priority=i + 1)
        if ready:
            _probe(D, ws, a, ct)
        accs.append(a); binds.append(b)
    return ws, A, ct, accs, binds

def _live_sys(D, ws):
    return D.one("""SELECT count(*) FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id WHERE b.workspace_id=?
                    AND b.consumer_kind='system' AND b.deleted_at IS NULL AND b.is_enabled=1 AND a.deleted_at IS NULL AND a.status='active'""", ws)

def t_v226_last_core():
    """A4 (CNS-071, probe P1a–d) + v2.2.8 (CONTRACT-r8 §A): Core agent có ĐÚNG MỘT binding — không gỡ binding duy nhất (xoá mềm, tắt, lật consumer,
    đổi sang tài khoản không dùng được, đổi workspace, xoá cứng; vô hiệu / thu hồi / xoá mềm / xoá cứng tài khoản) × hoán vị thời gian; không thêm
    tài khoản thứ hai (kiểu "thêm trước, gỡ sau" của v2.2.6); đổi tài khoản = đăng nhập lại trên CÙNG binding (thủ công, audit); lớp hai v_integrity."""
    D, X = seed()
    db, W, W2, EN, EB = D.db, X['W'], X['W2'], X['EN'], X['EB']
    c, case = _cases(db)
    upd = lambda sql, *a: (lambda: db.execute(sql, a))
    tam = _role(D, W, 'Tam')                                                          # Role chưa có tài khoản nào — đích cho lối lật consumer
    D.ins('containers', workspace_id=W, kind='role', role_id=tam, container_name='ga-role-tam', desired_state='sleeping', observed_state='created')
    case("P1b xoá mềm EB-0001 (binding Core agent duy nhất)", upd("UPDATE engine_bindings SET deleted_at=? WHERE id=?", now(), EB['sys_ag']), MSG_LAST_T)
    case("P1c tắt EB-0001 (is_enabled = 0)", upd("UPDATE engine_bindings SET is_enabled=0 WHERE id=?", EB['sys_ag']), MSG_LAST_T)
    case("P1d vô hiệu EN-0001 (status = disabled)", upd("UPDATE engine_accounts SET status='disabled' WHERE id=?", EN['sys_ag']), MSG_LAST_T)
    case("thu hồi EN-0001 (status = revoked)", upd("UPDATE engine_accounts SET status='revoked' WHERE id=?", EN['sys_ag']), MSG_LAST_T)
    case("xoá mềm tài khoản EN-0001", upd("UPDATE engine_accounts SET deleted_at=? WHERE id=?", now(), EN['sys_ag']), MSG_LAST_T)
    case("xoá cứng binding EB-0001 (DELETE)", upd("DELETE FROM engine_bindings WHERE id=?", EB['sys_ag']), MSG_LAST_T)
    case("xoá cứng tài khoản EN-0001 (DELETE)", upd("DELETE FROM engine_accounts WHERE id=?", EN['sys_ag']), 'FOREIGN KEY|append-only')
    case("lật EB-0001 sang Role Tam (consumer system → role)", upd(
        "UPDATE engine_bindings SET consumer_kind='role', role_id=?, priority=1 WHERE id=?", tam, EB['sys_ag']), MSG_LAST_T)
    dis = _core_acc(D, W, 'Google — đã vô hiệu', 'ga-auth-r6-dis1', 'logged_in')
    db.execute("UPDATE engine_accounts SET status='disabled' WHERE id=?", (dis,))         # chưa có binding ⇒ vô hiệu được
    case("đổi engine_account_id của EB-0001 sang tài khoản Antigravity đã vô hiệu", upd(
        "UPDATE engine_bindings SET engine_account_id=? WHERE id=?", dis, EB['sys_ag']), MSG_LAST_T)
    case("chuyển EB-0001 sang workspace khác", upd("UPDATE engine_bindings SET workspace_id=? WHERE id=?", W2, EB['sys_ag']),
         MSG_LAST_T + '|tenant|immutable')
    # v2.2.8 (CONTRACT-r8 §A): KHÔNG còn "thêm mới trước, gỡ sau" — tài khoản Antigravity thứ hai cho Hệ thống bị chặn (kể cả khi tắt)
    nw = _core_acc(D, W, 'Google — Hệ thống mới', 'ga-auth-r8-0002', 'logged_in')
    case("thêm binding Hệ thống thứ hai (Antigravity) — kiểu thay tài khoản v2.2.6", lambda: D.ins('engine_bindings', workspace_id=W,
         consumer_kind='system', engine_account_id=nw, priority=2), MSG_ONE_T)
    case("thêm binding Hệ thống thứ hai ở trạng thái tắt (is_enabled = 0)", lambda: D.ins('engine_bindings', workspace_id=W,
         consumer_kind='system', engine_account_id=nw, priority=2, is_enabled=0), MSG_ONE_T)
    # đổi tài khoản = THỦ CÔNG (A5 › AI Hệ thống › Đổi tài khoản): login lại trong PTY của CT-0001 → danh tính mới + audit; binding EB-0001 giữ nguyên
    db.execute("UPDATE engine_accounts SET login_status='unknown', label='Google — Hệ thống (ops)', account_hint='ops@afi.example' WHERE id=?",
               (EN['sys_ag'],))
    mode_mid = D.one("SELECT mode FROM v_core_agent_status WHERE workspace_id=?", W)          # đang đăng nhập lại ⇒ chế độ khắc phục
    # v2.2.10 (CONTRACT-r8c §C): seed nay có danh tính EN-0001 = r***@gmail.com (gắn vào CN-0001) ⇒ đăng nhập ra danh tính khác phải tick lại Clause 6
    # (CN- mới, luật đổi danh tính v2.2.9) rồi mới kiểm đăng nhập được. v2.2.6–v2.2.9: seed chưa có danh tính nên 'ops@…' là danh tính ĐẦU TIÊN, không cần tick
    db.execute("UPDATE engine_accounts SET consent_id=? WHERE id=?", (_cn(D, W), EN['sys_ag']))
    _probe(D, W, EN['sys_ag'], X['CT']['sys'])
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), EN['sys_ag']))
    audit(D, W, 'engine_account.relogin', entity_id=EN['sys_ag'], detail={'from': 'Google — Hệ thống', 'to': 'Google — Hệ thống (ops)', 'binding': 'EB-0001'})
    relog = (D.one("SELECT display_id FROM engine_bindings WHERE engine_account_id=? AND deleted_at IS NULL", EN['sys_ag']),
             {r[0] for r in db.execute("SELECT account_display_id FROM v_system_agents WHERE workspace_id=?", (W,))},
             D.one("SELECT mode FROM v_core_agent_status WHERE workspace_id=?", W),
             D.one("SELECT count(*) FROM audit_log WHERE workspace_id=? AND action='engine_account.relogin'", W))
    # sống ≠ sẵn sàng: mất đăng nhập là sự kiện bên ngoài — không chặn được, PHÁT HIỆN: OB-04 err, danger (overlay), Role mới bị chặn
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (EN['sys_ag'],))
    ob4 = _ob(D, W, 'OB-04')
    danger = [r[0] for r in db.execute("SELECT what FROM v_attention WHERE workspace_id=? AND level='danger' AND what LIKE 'Core agent%'", (W,))]
    role_blocked, _ = expect_fail(db, lambda: _role(D, W, 'Moi'), MSG_READY_T)
    # Onboarding (W5 chưa có Role). v2.2.9 (CONTRACT-r8b §A, CNS-099): luật "không gỡ Core agent cuối cùng" áp TỪ MỐC KHOÁ = lần kiểm đăng nhập đạt
    # đầu tiên. Trước mốc (chưa đăng nhập) tắt / gỡ được ("Chọn loại khác"); v2.2.6–v2.2.8 test này kỳ vọng bị chặn ngay khi có binding — luật cũ.
    W5, A5, ct5, a5, b5 = _core_ws(D, 'last-five', 'WL15', n=1, ready=False)
    pre_off = _try(lambda: db.execute("UPDATE engine_bindings SET is_enabled=0 WHERE id=?", (b5[0],)))
    db.execute("UPDATE engine_bindings SET is_enabled=1 WHERE id=?", (b5[0],))
    db.execute("UPDATE engine_accounts SET login_status='logged_in' WHERE id=?", (a5[0],)); _probe(D, W5, a5[0], ct5)    # kiểm đạt ⇒ mốc
    case("Onboarding sau lần kiểm đăng nhập đạt đầu tiên: tắt binding Hệ thống duy nhất", upd("UPDATE engine_bindings SET is_enabled=0 WHERE id=?", b5[0]), MSG_LAST_T)
    # lớp hai: bỏ trigger (script bảo trì lỗi) ⇒ v_integrity báo core_agent_no_live_binding
    integ0 = [r for r in db.execute("SELECT check_key FROM v_integrity") if r[0].startswith('core_agent')]
    db.execute("DROP TRIGGER IF EXISTS engine_bindings_core_agent_last_u")
    db.execute("UPDATE engine_bindings SET deleted_at=? WHERE id=?", (now(), EB['sys_ag']))
    integ1 = db.execute("SELECT value FROM v_integrity WHERE check_key='core_agent_no_live_binding' AND workspace_id=?", (W,)).fetchone()
    ok = (all(x[1] for x in c) and pre_off and mode_mid == 'recovery' and relog == ('EB-0001', {'EN-0001'}, 'ok', 1) and ob4[0] == 'err' and role_blocked
          and danger == ['Core agent gặp sự cố: đăng nhập hết hạn. Xử lý trước khi tiếp tục.'] and not integ0 and integ1 == (1,))
    report("CORE-last-binding", ok, f"{sum(x[1] for x in c)}/{len(c)} lối bị chặn: gỡ binding Core agent duy nhất (P1b xoá mềm, P1c tắt, P1d vô hiệu, thu hồi, "
           f"xoá mềm/xoá cứng tài khoản, xoá cứng binding, lật sang Role, đổi sang tài khoản đã vô hiệu, đổi workspace; Onboarding: trước lần kiểm đăng "
           f"nhập đạt đầu tiên tắt được ({'được' if pre_off else 'BỊ CHẶN'}, v2.2.9), sau đó bị chặn); "
           f"v2.2.8: thêm tài khoản Hệ thống thứ hai (bật / tắt) bị chặn; đổi tài khoản thủ công = đăng nhập lại trên {relog[0]} (giữa chừng: {mode_mid}; "
           f"xong: {relog[2]}, 4 SA vẫn {sorted(relog[1])}, audit engine_account.relogin = {relog[3]}); mất đăng nhập ⇒ OB-04 {ob4[0]}, danger "
           f"\"{danger[0] if danger else '—'}\", Role mới bị chặn; bỏ trigger ⇒ v_integrity core_agent_no_live_binding = {integ1[0] if integ1 else 0}")
    _show(c)

def t_v226_sa_primary():
    """A3 (CNS-069, probe P2a/b): tác tử hệ thống không chọn tài khoản — không có cột, tài khoản suy ra = tài khoản Core agent (EN-0001).
    v2.2.8 (CONTRACT-r8 §A): không có binding Hệ thống thứ hai để "tách" tác tử theo tài khoản."""
    D, X = seed()
    db, W, EN, EB = D.db, X['W'], X['EN'], X['EB']
    c, case = _cases(db)
    cols = [r[1] for r in db.execute("PRAGMA table_info(system_agents)")]
    fk_sa = sorted({r[2] for r in db.execute("PRAGMA foreign_key_list(system_agents)")})
    case("P2a SA-0003 Consolidator → EB-0003 (Antigravity của Mai) thường trực (UPDATE)", lambda: db.execute(
        "UPDATE system_agents SET engine_binding_id=? WHERE workspace_id=? AND system_key='consolidator'", (EB['mai_ag'], W)), 'engine_binding_id')
    case("P2b SA-0004 Judge → EB-0001 thường trực (UPDATE)", lambda: db.execute(
        "UPDATE system_agents SET engine_binding_id=? WHERE workspace_id=? AND system_key='judge'", (EB['sys_ag'], W)), 'engine_binding_id')
    case("INSERT tác tử kèm engine_binding_id", lambda: D.ins('system_agents', workspace_id=X['W2'], system_key='judge',
                                                              engine_binding_id=EB['sys_ag']), 'engine_binding_id')
    ag2 = _core_acc(D, W, 'Google — tách Consolidator', 'ga-auth-sa-0002', 'logged_in')
    case("P2c thêm binding Hệ thống thứ hai để tách quota cho một tác tử", lambda: D.ins('engine_bindings', workspace_id=W, consumer_kind='system',
         engine_account_id=ag2, priority=2), MSG_ONE_T)
    sa0 = [(r[0], r[1], r[2]) for r in db.execute("SELECT display_id, account_display_id, account_priority FROM v_system_agents WHERE workspace_id=? ORDER BY display_id", (W,))]
    ob7_0 = _ob(D, W, 'OB-07')
    prim = [r[0] for r in db.execute("SELECT account_display_id FROM v_core_agent_accounts WHERE workspace_id=? AND is_primary=1", (W,))]
    # workspace mới: OB-07 err tới khi đủ 4 tác tử
    W3, A3, ct3, a3, b3 = _core_ws(D, 'sa-three', 'WS13', n=1)
    for k in ('interviewer', 'trainer', 'consolidator'):
        D.ins('system_agents', workspace_id=W3, system_key=k, model_key='gemini-3.1-pro-low', effort='low')
    ob7_3a = _ob(D, W3, 'OB-07')
    D.ins('system_agents', workspace_id=W3, system_key='judge', model_key='gemini-3.8-flash-low', effort='low')
    # v2.2.12 (CONTRACT-r8e §B, CNS-127) — SỬA KỲ VỌNG: tác tử mới chèn với selection_state mặc định 'unknown' (chưa kiểm registry) ⇒ OB-07 err "0/4 tác tử hệ
    # thống · cần chọn lại model" (v2.2.6–v2.2.11 kỳ vọng ok ngay khi đủ 4 hàng — OB-07 khi đó không đọc selection_state). Bước 4 kiểm registry ⇒ 'valid' ⇒ ok
    ob7_3u = _ob(D, W3, 'OB-07')
    db.execute("UPDATE system_agents SET selection_state='valid', selection_checked_at=? WHERE workspace_id=?", (now(), W3))
    ob7_3b = _ob(D, W3, 'OB-07')
    ok = (all(x[1] for x in c) and 'engine_binding_id' not in cols and 'engine_bindings' not in fk_sa and 'engine_accounts' not in fk_sa
          and sa0 == [('SA-0001', 'EN-0001', 1), ('SA-0002', 'EN-0001', 1), ('SA-0003', 'EN-0001', 1), ('SA-0004', 'EN-0001', 1)]
          and ob7_0 == ('ok', '4/4 tác tử hệ thống · tài khoản Core agent (Antigravity)')
          and prim == ['EN-0001'] and ob7_3a[0] == 'err' and tuple(ob7_3u) == ('err', '0/4 tác tử hệ thống · cần chọn lại model')
          and ob7_3b == ('ok', '4/4 tác tử hệ thống · tài khoản Core agent (Antigravity)'))
    report("CORE-sa-primary", ok, f"{sum(x[1] for x in c)}/{len(c)} lối chọn / tách tài khoản cho tác tử bị chặn (P2a Consolidator → EB-0003, P2b Judge → EB-0001, "
           f"INSERT kèm binding, v2.2.8 P2c thêm binding Hệ thống thứ hai): system_agents không có cột/FK tới binding/tài khoản; v_system_agents: 4/4 → "
           f"EN-0001; OB-07 \"{ob7_0[1]}\"; workspace mới OB-07 {ob7_3a[0]} → đủ 4 hàng còn 'unknown' {ob7_3u[0]} \"{ob7_3u[1]}\" (v2.2.12) → "
           f"{ob7_3b[0]} khi 4 tác tử valid")
    _show(c)

def t_v228_rotation_gone():
    """CONTRACT-r8 §A: GỠ HẲN xoay tài khoản cùng hãng của v2.2.6 — consent_kind same_vendor_rotation (CHECK), trigger settings_rotation_*,
    consents_rotation_revoke_u, v_integrity.rotation_without_consent, ST-0019; đổi tài khoản là thao tác thủ công (CORE-last-binding, ACC-one-per-engine)."""
    D, X = seed()
    db, W = D.db, X['W']
    c, case = _cases(db)
    case("consent kind same_vendor_rotation (tos.same_vendor_rotation — đã gỡ)", lambda: _cn(D, W, subject='tos.same_vendor_rotation',
         kind='same_vendor_rotation'), 'CHECK')
    trig = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE '%rotation%'")]
    integ_sql = D.one("SELECT sql FROM sqlite_master WHERE name='v_integrity'")
    cons_sql = D.one("SELECT sql FROM sqlite_master WHERE name='consents'")
    st = D.one("SELECT count(*) FROM settings WHERE display_id='ST-0019' OR key LIKE '%rotation%'")
    ok = all(x[1] for x in c) and trig == [] and "'rotation_without_consent'" not in integ_sql and "'same_vendor_rotation'" not in cons_sql and st == 0
    report("ROT-removed", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn (consent same_vendor_rotation: CHECK); trigger *rotation* = {trig}; "
           f"v_integrity không còn rotation_without_consent; consents.consent_kind không còn same_vendor_rotation; seed không có ST-0019 / setting xoay")
    _show(c)

def t_v226_lock():
    """A5 (CNS-074, probe P3/P4) → v2.2.9 (CONTRACT-r8b §A, CNS-099): mốc core_agent_locked_at ghi một lần ở LẦN KIỂM ĐĂNG NHẬP ĐẠT ĐẦU TIÊN của tài khoản
    Core agent (không còn lúc ghi binding), không xoá được; ST-0017 sửa được trước mốc (chưa gắn tài khoản), chỉ đọc sau mốc; lối lật consumer (P3) bị
    đóng; GĐ2 đổi loại = migration có chủ đích (P4: không có đường trong app). Ca "đăng nhập hỏng ⇒ đổi loại được": test CORE-lock-login."""
    D, X = seed()
    db, W, A = D.db, X['W'], X['A']
    c, case = _cases(db)
    lockW = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W)
    lockW2 = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", X['W2'])
    st17 = lambda ws, v, by: db.execute("UPDATE settings SET value_json=?, updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine' "
                                        "AND deleted_at IS NULL", (v, by, ws))
    # trước mốc: Onboarding bước 2 chọn "Loại Core agent" (v2.2.8: mặc định Antigravity, chọn được Claude Code) — ST-0017 sửa được
    W5, A5 = _fresh_ws(D, 'lock-five', 'WL05')
    D.ins('settings', workspace_id=W5, key='system.core_agent_engine', value_json='"antigravity"', created_by=A5['owner'])
    st17(W5, '"claude-code"', A5['owner']); st17(W5, '"antigravity"', A5['owner']); st17(W5, '"claude-code"', A5['owner'])   # Onboarding bước 2: đổi qua lại trước mốc
    pre = D.one("SELECT value_json FROM settings WHERE workspace_id=? AND key='system.core_agent_engine'", W5)
    ct5 = D.ins('containers', workspace_id=W5, kind='system', container_name='ga-sys-wl05', desired_state='sleeping', observed_state='created')
    a51 = _acc(D, W5, 'claude-code', 'Anthropic — Hệ thống', 'ga-auth-wl05-0001', 'logged_in')
    b51 = D.ins('engine_bindings', workspace_id=W5, consumer_kind='system', engine_account_id=a51, priority=1)
    lock_b = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W5)        # v2.2.9: binding KHÔNG ghi mốc (v2.2.6–v2.2.8: có)
    # lần kiểm đạt trong transaction bị huỷ ⇒ mốc không ghi
    db.execute("BEGIN"); _probe(D, W5, a51, ct5, slug='claude-code'); db.execute("ROLLBACK")
    lock0 = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W5)
    p51 = _probe(D, W5, a51, ct5, slug='claude-code')                                      # lần kiểm đăng nhập đạt đầu tiên ⇒ mốc
    lock1 = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W5)
    p51_done = D.one("SELECT finished_at FROM probe_runs WHERE id=?", p51)
    a52 = _acc(D, W5, 'claude-code', 'Anthropic — Hệ thống 2', 'ga-auth-wl05-0002', 'logged_in')
    case("sau mốc: thêm binding Hệ thống thứ hai (Claude Code) — CONTRACT-r8 §A", lambda: D.ins('engine_bindings', workspace_id=W5,
         consumer_kind='system', engine_account_id=a52, priority=2), MSG_ONE_T)
    case("sau mốc: owner đổi ST-0017 → antigravity", lambda: st17(W5, '"antigravity"', A5['owner']), MSG_RO_T)
    case("xoá mốc (core_agent_locked_at = NULL)", lambda: db.execute("UPDATE workspaces SET core_agent_locked_at=NULL WHERE id=?", (W5,)), MSG_LOCK_T)
    case("sửa mốc sang thời điểm khác", lambda: db.execute("UPDATE workspaces SET core_agent_locked_at='2030-01-01T00:00:00.000Z' WHERE id=?", (W5,)), MSG_LOCK_T)
    # P3: lật binding Hệ thống DUY NHẤT (không SA trỏ) sang Role — W6 (đã kiểm đạt ⇒ đã khoá)
    W6, A6, ct6, a6, b6 = _core_ws(D, 'lock-six', 'WL06', n=1)
    D.ins('settings', workspace_id=W6, key='system.core_agent_engine', value_json='"antigravity"', created_by=A6['owner'])
    r6 = _role(D, W6, 'Mot')
    D.ins('containers', workspace_id=W6, kind='role', role_id=r6, container_name='ga-role-wl06-1', desired_state='sleeping', observed_state='created')
    case("P3a lật binding Hệ thống duy nhất sang Role", lambda: db.execute(
        "UPDATE engine_bindings SET consumer_kind='role', role_id=?, priority=1 WHERE id=?", (r6, b6[0])), MSG_LAST_T)
    # lần kiểm đạt THỨ HAI (và một binding Hệ thống lịch sử đã xoá mềm) không ghi đè mốc
    lock6a = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W6)
    _probe(D, W6, a6[0], ct6)
    a62 = _core_acc(D, W6, 'Google — cũ', 'ga-auth-wl06-0002', 'logged_in')
    D.ins('engine_bindings', workspace_id=W6, consumer_kind='system', engine_account_id=a62, priority=2, deleted_at=now(), created_at=now())
    lock6b = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W6)
    r5 = _role(D, W5, 'Nam')
    D.ins('containers', workspace_id=W5, kind='role', role_id=r5, container_name='ga-role-wl05-1', desired_state='sleeping', observed_state='created')
    case("P3b đổi ST-0017 → codex (sau mốc, đã có Role)", lambda: st17(W5, '"codex"', A5['owner']), MSG_RO_T)
    # lối P3 nguyên bản (bỏ guard 'cuối cùng' giả lập script lỗi): lật binding Hệ thống cuối cùng → mốc vẫn khoá ST-0017
    db.execute("DROP TRIGGER IF EXISTS engine_bindings_core_agent_last_u")
    db.execute("UPDATE engine_bindings SET consumer_kind='role', role_id=?, priority=2 WHERE id=?", (r5, b51))
    ever = D.one("SELECT count(*) FROM engine_bindings WHERE workspace_id=? AND consumer_kind='system'", W5)
    # v2.2.10 (CONTRACT-r8c §A, Q-R8a): mất binding Hệ thống = SỰ CỐ (no_account, is_incident 1) ⇒ ST-0017 không còn "chỉ đọc tuyệt đối" mà đi qua
    # cổng đổi loại khi sự cố (chỉ owner + đồng ý MỚI nếu đích là Antigravity). v2.2.6–v2.2.9 kỳ vọng MSG_RO_T (luật cũ: sau mốc luôn chỉ đọc). Ca này
    # vẫn BỊ CHẶN — nay bởi cổng đồng ý (chưa tick Clause 6 mới); mốc vẫn giữ (không xoá được — ca "xoá mốc" ở trên)
    case("P3 nguyên bản: không còn binding Hệ thống nào, đổi ST-0017 → antigravity khi chưa tick đồng ý mới", lambda: st17(W5, '"antigravity"', A5['owner']),
         MSG_TC_CONSENT_T)
    # lớp hai của mốc: bỏ trigger ghi mốc (lối INSERT) ⇒ v_integrity core_agent_lock_missing; ST-0017 vẫn khoá nhờ lớp phụ (tài khoản Core agent
    # đã từng kiểm đăng nhập đạt — CORE_LOGIN_OK_EVER; v2.2.6–v2.2.8: lớp phụ = đang/từng có binding)
    db.execute("DROP TRIGGER IF EXISTS probe_runs_core_lock_ai")
    W7, A7, ct7, a7, b7 = _core_ws(D, 'lock-seven', 'WL07', n=1)
    D.ins('settings', workspace_id=W7, key='system.core_agent_engine', value_json='"antigravity"', created_by=A7['owner'])
    lock7a = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W7)
    integ = db.execute("SELECT value FROM v_integrity WHERE check_key='core_agent_lock_missing' AND workspace_id=?", (W7,)).fetchone()
    case("thiếu mốc (trigger bị bỏ): đổi ST-0017 khi tài khoản Core agent đã kiểm đạt", lambda: st17(W7, '"claude-code"', A7['owner']), MSG_RO_T)
    # lối thứ hai ghi mốc: lần kiểm đang chạy (running) xong = ok (probe_runs_core_lock_au) ⇒ mốc = finished_at của lần đó
    run7 = D.ins('probe_runs', workspace_id=W7, engine_account_id=a7[0], engine_slug='antigravity', container_id=ct7, trigger='login_check',
                 auth_mode='oauth', status='running', started_at=now())
    t7 = now()
    db.execute("UPDATE probe_runs SET status='ok', finished_at=? WHERE id=?", (t7, run7))
    lock7 = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W7)
    # P4 (GĐ2 đổi loại Core agent): trong app không có đường nào — đúng chủ đích; GĐ2 = migration (ADR-O)
    D2, X2 = seed()
    db2, W_ = D2.db, X2['W']
    c4, case4 = _cases(db2)
    ag = _acc(D2, W_, 'claude-code', 'Anthropic — Hệ thống mới', 'ga-auth-mig-cc', 'logged_in')     # v2.2.8: "loại khác" = Claude Code
    case4("P4a binding Hệ thống → Claude Code trước khi đổi ST-0017", lambda: D2.ins('engine_bindings', workspace_id=W_, consumer_kind='system',
          engine_account_id=ag, priority=3), MSG_CORE_T)
    case4("P4b đổi ST-0017 → claude-code khi đã có binding", lambda: db2.execute(
        "UPDATE settings SET value_json='\"claude-code\"', updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine'", (X2['A'][(W_, 'owner')], W_)), MSG_RO_T)
    case4("P4c gỡ binding Hệ thống duy nhất", lambda: db2.execute("UPDATE engine_bindings SET deleted_at=? WHERE id=?",
          (now(), X2['EB']['sys_ag'])), MSG_LAST_T)
    case4("P4c đổi ST-0017 sau khi gỡ (mốc vẫn khoá)", lambda: db2.execute(
        "UPDATE settings SET value_json='\"claude-code\"', updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine'", (X2['A'][(W_, 'owner')], W_)), MSG_RO_T)
    ok = (all(x[1] for x in c) and all(x[1] for x in c4) and lockW is not None and lockW2 is None and pre == '"claude-code"'
          and lock_b is None and lock0 is None and lock1 == p51_done and lock6a is not None and lock6b == lock6a and ever == 0
          and lock7a is None and integ == (1,) and lock7 == t7)
    report("CORE-lock", ok, f"mốc core_agent_locked_at (v2.2.9: lần kiểm đăng nhập đạt đầu tiên): W có, W2 không; ghi binding KHÔNG ghi mốc ({lock_b}); lần kiểm đạt "
           f"trong transaction bị huỷ không ghi; lần kiểm đạt đầu tiên ghi = finished_at ({'đúng' if lock1 == p51_done else 'LỆCH'}); lần kiểm đạt thứ hai và binding "
           f"lịch sử không ghi đè; trước mốc ST-0017 sửa được (Onboarding bước 2); {sum(x[1] for x in c)}/{len(c)} ca bị chặn: thêm binding Hệ thống thứ hai "
           f"(v2.2.8), đổi ST-0017 sau mốc, xoá/sửa mốc, P3a lật binding duy nhất sang Role, P3b đổi ST-0017 khi đã có Role, P3 nguyên bản (không còn binding Hệ "
           f"thống — mốc vẫn khoá), thiếu mốc ⇒ lớp phụ; bỏ trigger ghi mốc (INSERT) ⇒ v_integrity core_agent_lock_missing = {integ[0] if integ else 0}, lần kiểm "
           f"running → ok vẫn ghi mốc (lối thứ hai, {'đúng' if lock7 == t7 else 'LỆCH'}); P4 GĐ2: {sum(x[1] for x in c4)}/{len(c4)} đường bị chặn "
           f"(P4a, P4b, P4c gỡ, P4c đổi) — đổi loại Core agent ở GĐ2 = migration có chủ đích (ADR-O), không có cửa sau ở MVP")
    _show(c); _show(c4)

def t_v226_ready_role():
    """A4 (CNS-071 P1e + P5, CNS-076, CNS-077) + v2.2.8 (CONTRACT-r8 §C): MỌI Role mới đòi Core agent sẵn sàng; "sẵn sàng" = lần kiểm đăng nhập
    MỚI NHẤT ok (+ cache login_status) + đồng ý điều khoản + không hết quota + không có sự cố hãng; subscription lẫn API key; trigger, OB-04 và
    v_core_agent_status.mode cùng một định nghĩa (so từng trạng thái); hoán vị thời gian; đổi tài khoản thủ công đi qua trạng thái chưa sẵn sàng."""
    D, X = seed()
    db, W = D.db, X['W']
    W7, A7 = _fresh_ws(D, 'ready-seven', 'WR07')
    n = [0]
    states = []
    def probe_state(label):
        n[0] += 1
        okr = True
        try:
            _role(D, W7, f'R{n[0]}')
        except sqlite3.DatabaseError as e:
            okr = False
            if MSG_READY_T not in str(e):
                okr = 'lỗi khác: ' + str(e)[:60]
        st = _ob(D, W7, 'OB-04')
        mode = D.one("SELECT mode FROM v_core_agent_status WHERE workspace_id=?", W7)
        states.append((label, okr, st[0], st[1], mode))
    probe_state('chưa có gì')
    ct = D.ins('containers', workspace_id=W7, kind='system', container_name='ga-sys-wr07', desired_state='sleeping', observed_state='created')
    a1 = _core_acc(D, W7, 'Google — Hệ thống', 'ga-auth-wr07-0001')          # v2.2.8: Core agent mặc định Antigravity (+ Clause 6)
    D.ins('engine_bindings', workspace_id=W7, consumer_kind='system', engine_account_id=a1, priority=1)
    probe_state('binding, login unknown')
    db.execute("UPDATE engine_accounts SET login_status='logged_in' WHERE id=?", (a1,))
    probe_state('logged_in, chưa kiểm đăng nhập')
    D.ins('probe_runs', workspace_id=W7, engine_account_id=a1, engine_slug='antigravity', container_id=ct, trigger='install',
          auth_mode='oauth', status='ok', started_at=now(), finished_at=now())
    probe_state('quét khả năng ok (không phải kiểm đăng nhập)')
    _probe(D, W7, a1, ct, status='failed')
    probe_state('kiểm đăng nhập failed')
    _probe(D, W7, a1, None)
    probe_state('kiểm đăng nhập ok ngoài container AI Hệ thống')
    _probe(D, W7, a1, ct)
    probe_state('kiểm đăng nhập ok trong CT')                                     # ⇒ được (Role 1)
    _probe(D, W7, a1, ct, status='failed')
    probe_state('P5: kiểm cũ ok + kiểm MỚI NHẤT failed')
    run = D.ins('probe_runs', workspace_id=W7, engine_account_id=a1, engine_slug='antigravity', container_id=ct, trigger='login_check',
                auth_mode='oauth', status='running', started_at=now())
    probe_state('đang kiểm lại (running) — mới nhất đã xong vẫn là failed')
    db.execute("UPDATE probe_runs SET status='ok', finished_at=? WHERE id=?", (now(), run))
    probe_state('lần kiểm đang chạy xong = ok')                                   # ⇒ được
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (a1,))
    probe_state('cache login_status expired (401 lúc chạy) dù probe ok')
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (a1,))
    probe_state('tài khoản bị khoá (suspended)')
    db.execute("UPDATE engine_accounts SET login_status='logged_in' WHERE id=?", (a1,))
    probe_state('đăng nhập lại (logged_in)')                                     # ⇒ được (v2.2.7: xoá container nay bị chặn — CORE-container)
    # v2.2.8 (CONTRACT-r7 §A, OB-05): rút đồng ý Clause 6 ⇒ mất sẵn sàng; đồng ý lại ⇒ sẵn sàng lại
    cn_a1 = D.one("SELECT consent_id FROM engine_accounts WHERE id=?", a1)
    db.execute("UPDATE consents SET revoked_at=? WHERE id=?", (now(), cn_a1))
    probe_state('đồng ý Clause 6 bị rút')
    db.execute("UPDATE engine_accounts SET consent_id=? WHERE id=?", (_cn(D, W7), a1))
    probe_state('đồng ý lại (consent mới)')                                       # ⇒ được
    # v2.2.8 (CONTRACT-r8 §C): hết quota / sự cố hãng (5xx) cũng là "Core agent gặp sự cố"
    db.execute("UPDATE engine_accounts SET quota_state='exhausted' WHERE id=?", (a1,))
    probe_state('hết quota (quota_state exhausted)')
    db.execute("UPDATE engine_accounts SET quota_state='ok' WHERE id=?", (a1,))
    probe_state('quota đặt lại (ok)')                                             # ⇒ được
    db.execute("UPDATE engine_accounts SET outage_since=? WHERE id=?", (now(), a1))
    probe_state('outage (lỗi 5xx của hãng)')
    db.execute("UPDATE engine_accounts SET outage_since=NULL WHERE id=?", (a1,))
    probe_state('hãng hồi phục (outage_since NULL)')                             # ⇒ được
    # đổi tài khoản thủ công (CONTRACT-r8 §A): đăng nhập lại trên CÙNG binding — giữa chừng chưa sẵn sàng, kiểm đăng nhập xong thì sẵn sàng
    db.execute("UPDATE engine_accounts SET login_status='unknown', label='Google — Hệ thống (đổi)' WHERE id=?", (a1,))
    probe_state('đổi tài khoản: đang đăng nhập lại')
    db.execute("UPDATE engine_accounts SET login_status='logged_in' WHERE id=?", (a1,)); _probe(D, W7, a1, ct)
    probe_state('đổi tài khoản: kiểm đăng nhập ok')                               # ⇒ được
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (a1,))
    probe_state('P1e: hết hạn SAU khi đã có Role')                                # ⇒ chặn (mọi Role mới)
    c, case = _cases(db)
    # CNS-076: tài khoản API key làm Core agent — kiểm đăng nhập = lời gọi xác thực của chính CLI; sẵn sàng như subscription (workspace riêng:
    # v2.2.8 — W7 đã có tài khoản Antigravity nên API key Antigravity thứ hai bị luật một tài khoản mỗi loại chặn)
    sk = D.ins('secrets', workspace_id=W7, kind='engine_api_key', label='Gemini API', ciphertext=b'x', nonce=b'n', wrapped_dek=b'd',
               dek_nonce=b'n', kek_id='kek1', fingerprint='fp-wr07')
    a2 = _core_acc(D, W7, 'Google API — Hệ thống', None, 'logged_in', auth_method='api_key', secret_id=sk)
    case("thêm tài khoản API key Antigravity thứ hai cho Hệ thống (CONTRACT-r8 §A)", lambda: D.ins('engine_bindings', workspace_id=W7,
         consumer_kind='system', engine_account_id=a2, priority=2), MSG_ONE_T)
    W8, A8 = _fresh_ws(D, 'ready-eight', 'WR08')
    ct8 = D.ins('containers', workspace_id=W8, kind='system', container_name='ga-sys-wr08', desired_state='sleeping', observed_state='created')
    sk8 = D.ins('secrets', workspace_id=W8, kind='engine_api_key', label='Gemini API', ciphertext=b'x', nonce=b'n', wrapped_dek=b'd',
                dek_nonce=b'n', kek_id='kek1', fingerprint='fp-wr08')
    a8 = _core_acc(D, W8, 'Google API — Hệ thống', None, 'logged_in', auth_method='api_key', secret_id=sk8)
    D.ins('engine_bindings', workspace_id=W8, consumer_kind='system', engine_account_id=a8, priority=1)
    D.ins('probe_runs', workspace_id=W8, engine_account_id=a8, engine_slug='antigravity', container_id=ct8, trigger='login_check',
          auth_mode='api_key', status='ok', started_at=now(), finished_at=now())
    api_ok = (_try_role(D, W8, 'Api'), _ob(D, W8, 'OB-04')[0])
    case("login_status = 'not_applicable' (đã bỏ)", lambda: db.execute("UPDATE engine_accounts SET login_status='not_applicable' WHERE id=?", (a8,)), 'CHECK')
    case("lối UPDATE: chuyển Role Mai sang workspace chưa sẵn sàng", lambda: db.execute("UPDATE roles SET workspace_id=? WHERE id=?", (W7, X['mai'])),
         'immutable identity: roles')
    exp = [False, False, False, False, False, False, True, False, False, True, False, False, True, False, True, False, True, False, True, False, True, False]
    got = [s[1] for s in states]
    consistent = all((s[1] is True) == (s[2] == 'ok') == (s[4] == 'ok') for s in states)
    modes = [s[4] for s in states]
    det = {s[0]: s[3] for s in states}
    ok = (got == exp and consistent and all(x[1] for x in c) and api_ok == (True, 'ok')
          # v2.2.9 (CONTRACT-r8b §A): mốc khoá = lần kiểm đăng nhập đạt đầu tiên ⇒ 6 trạng thái đầu (chưa đạt lần nào) = 'setup', không overlay;
          # từ "kiểm đăng nhập ok trong CT" trở đi ok/recovery (v2.2.6–v2.2.8: chỉ trạng thái 0 là setup — khoá lúc ghi binding)
          and modes[:6] == ['setup'] * 6 and set(modes[6:]) == {'ok', 'recovery'}
          and det['kiểm đăng nhập ok trong CT'] == '1 tài khoản sẵn sàng · Core agent (Antigravity)'
          and det['chưa có gì'] == '0 tài khoản sẵn sàng · bắt buộc trước khi tạo Role (lần kiểm đăng nhập mới nhất phải đạt)')
    report("CORE-ready-role", ok, f"{len(states)} trạng thái; Role mới tạo được đúng ở {sum(1 for g in got if g is True)} trạng thái sẵn sàng; chặn khi: chưa có gì, "
           f"login unknown, chưa kiểm đăng nhập, chỉ có quét khả năng (CNS-077), kiểm failed, kiểm ngoài CT, **P5** kiểm mới nhất failed (kể cả khi đang kiểm lại), "
           f"cache expired / suspended, đồng ý Clause 6 bị rút, v2.2.8: hết quota, outage, đang đổi tài khoản (đăng nhập lại), **P1e** hết hạn SAU khi đã có Role; "
           f"OB-04 + v_core_agent_status.mode khớp trigger ở cả {len(states)} trạng thái ({'khớp' if consistent else 'LỆCH'}; mode setup ×{modes.count('setup')} tới lần kiểm "
           f"đạt đầu tiên — v2.2.9 — rồi ok/recovery); "
           f"Antigravity API key (workspace riêng) kiểm ok ⇒ sẵn sàng (CNS-076); {sum(x[1] for x in c)}/{len(c)} ca âm (API key thứ hai cùng loại, not_applicable, "
           f"UPDATE workspace_id)")
    for s, e in zip(states, exp):
        if s[1] is not e: print("      ✗", s, "— mong đợi", e)
    _show(c)

def t_v226_ob_checklist():
    """A1 (CNS-070) + v2.2.8 (CONTRACT-r8 §C): OB-04 hai trạng thái — 0 tài khoản sẵn sàng err, đúng 1 ok (không còn ≥2: luật một tài khoản mỗi
    loại); OB-05 BẮT BUỘC với Antigravity (CONTRACT-r7 §A, giữ ở r8), Claude Code ⇒ "không cần"; OB-07 không ngụ ý tài khoản dự phòng."""
    D, X = seed()
    db, W = D.db, X['W']
    c, case = _cases(db)
    W3, A3 = _fresh_ws(D, 'ob-three', 'WO03')
    o5_0, s_none = _ob(D, W3, 'OB-05'), _ob(D, W3, 'OB-04')                         # chưa đồng ý, chưa tài khoản ⇒ err, err
    ct3 = D.ins('containers', workspace_id=W3, kind='system', container_name='ga-sys-wo03', desired_state='sleeping', observed_state='created')
    a3 = _core_acc(D, W3, 'Google — Hệ thống 1', 'ga-auth-wo03-0001')
    D.ins('engine_bindings', workspace_id=W3, consumer_kind='system', engine_account_id=a3, priority=1)
    s0 = _ob(D, W3, 'OB-04')
    o5_1 = _ob(D, W3, 'OB-05')
    db.execute("UPDATE engine_accounts SET login_status='logged_in' WHERE id=?", (a3,)); _probe(D, W3, a3, ct3)
    s1 = _ob(D, W3, 'OB-04')
    a2 = _core_acc(D, W3, 'Google — Hệ thống 2', 'ga-auth-wo03-0002', 'logged_in')
    case("thêm tài khoản Core agent thứ hai (OB-04 không còn trạng thái ≥2)", lambda: D.ins('engine_bindings', workspace_id=W3,
         consumer_kind='system', engine_account_id=a2, priority=2), MSG_ONE_T)
    db.execute("UPDATE consents SET revoked_at=? WHERE id=(SELECT consent_id FROM engine_accounts WHERE id=?)", (now(), a3))
    o5_r = _ob(D, W3, 'OB-05'); s_r = _ob(D, W3, 'OB-04')
    statuses = {r[0] for r in db.execute("SELECT DISTINCT check_status FROM v_setup_checklist WHERE check_code='OB-04'")}
    ob_w = {r[0]: (r[1], r[2]) for r in db.execute("SELECT check_code, check_status, check_detail FROM v_setup_checklist WHERE workspace_id=?", (W,))}
    # đối chứng: Core = Claude Code (W4, chọn trước mốc) ⇒ OB-05 "không cần"
    W4, A4 = _fresh_ws(D, 'ob-four', 'WO04')
    D.ins('settings', workspace_id=W4, key='system.core_agent_engine', value_json='"claude-code"', created_by=A4['owner'])
    o5_cc = _ob(D, W4, 'OB-05')
    E04 = '0 tài khoản sẵn sàng · bắt buộc trước khi tạo Role (lần kiểm đăng nhập mới nhất phải đạt)'
    K04 = '1 tài khoản sẵn sàng · Core agent (Antigravity)'
    ok = (all(x[1] for x in c) and s_none == ('err', E04) and s0 == ('err', E04) and s1 == ('ok', K04)
          and statuses <= {'ok', 'err'} and ob_w['OB-04'] == ('ok', K04)
          and ob_w['OB-05'] == ('ok', 'đã đồng ý điều khoản Antigravity cho tài khoản Core agent')
          and ob_w['OB-07'] == ('ok', '4/4 tác tử hệ thống · tài khoản Core agent (Antigravity)')
          and o5_0 == ('err', 'chưa đồng ý điều khoản Antigravity — bắt buộc trước khi đăng nhập Core agent') and o5_1[0] == 'ok'
          and o5_r == ('err', 'thiếu đồng ý điều khoản Antigravity (đã rút hoặc lời cảnh báo đổi) — đồng ý lại trước khi dùng')
          and s_r == ('err', E04) and o5_cc == ('ok', 'không cần với Claude Code') and len(ob_w) == 7)
    report("OB-core-agent", ok, f"OB-04 chỉ hai trạng thái (thấy {sorted(statuses)}): chưa có gì → {s_none[0]}, binding chưa đăng nhập → {s0[0]} \"{s0[1]}\", "
           f"1 sẵn sàng → {s1[0]} \"{s1[1]}\"; tài khoản thứ hai bị chặn ({sum(x[1] for x in c)}/{len(c)}); seed W: OB-05 \"{ob_w['OB-05'][1]}\", OB-07 "
           f"\"{ob_w['OB-07'][1]}\"; OB-05 bắt buộc với Antigravity: chưa có gì → {o5_0[0]}, có đồng ý → {o5_1[0]}, rút đồng ý → {o5_r[0]} \"{o5_r[1]}\" "
           f"(mất sẵn sàng: OB-04 {s_r[0]}); đối chứng Core = Claude Code → OB-05 \"{o5_cc[1]}\"; vẫn 7 mã")
    _show(c)

def t_v226_attention():
    """A4/A6 (CNS-072, probe Att) + v2.2.8 (CONTRACT-r8 §C): quota 'chưa xác định' = info; Core agent gặp sự cố (hết hạn / bị khoá / outage /
    hết quota) = MỘT hàng danger "Core agent gặp sự cố: <lý do>. Xử lý trước khi tiếp tục." = nguồn overlay O4 (v_core_agent_status);
    quota cạn của Role vẫn danger riêng; workspace chưa khoá loại Core agent (Onboarding) không có hàng Core agent, mode 'setup'."""
    D, X = seed()
    db, W, EN, CT = D.db, X['W'], X['EN'], X['CT']
    att = lambda: db.execute("SELECT level, target, what FROM v_attention WHERE workspace_id=? AND (target LIKE 'EN-%' OR target='OB-04')", (W,)).fetchall()
    core = lambda: [(r[1], r[2]) for r in att() if r[2].startswith('Core agent')]
    st = lambda: db.execute("SELECT mode, blocks_admin, reason, incident_reason, fix_hint FROM v_core_agent_status WHERE workspace_id=?", (W,)).fetchone()
    a0 = att()
    danger0 = [r for r in a0 if r[0] == 'danger']
    info_quota0 = sorted(r[1] for r in a0 if r[0] == 'info' and r[2] == 'Quota chưa xác định')
    st0 = st()
    res = {}
    for label, sql, arg in (('expired', "UPDATE engine_accounts SET login_status='expired' WHERE id=?", None),
                            ('suspended', "UPDATE engine_accounts SET login_status='suspended' WHERE id=?", None),
                            ('outage', "UPDATE engine_accounts SET outage_since=? WHERE id=?", now()),
                            ('quota', "UPDATE engine_accounts SET quota_state='exhausted' WHERE id=?", None)):
        db.execute(sql, (arg, EN['sys_ag']) if arg else (EN['sys_ag'],))
        res[label] = (core(), st(), sorted((r[0], r[1], r[2]) for r in att() if r[0] == 'warn' and 'Core agent' in r[2]))
        # owner xử lý: đăng nhập lại (kiểm đăng nhập ok) / hãng hồi phục / quota đặt lại ⇒ hết danger
        db.execute("UPDATE engine_accounts SET login_status='logged_in', outage_since=NULL, quota_state='ok' WHERE id=?", (EN['sys_ag'],))
        _probe(D, W, EN['sys_ag'], CT['sys'])
        res[label + '_fixed'] = (core(), st()[0])
    quota_rows = [r for r in res['quota'][0]]
    db.execute("UPDATE engine_accounts SET quota_state='exhausted' WHERE id=?", (EN['mai_ag'],))
    d_mai = [(r[1], r[2]) for r in att() if r[0] == 'danger']
    w2_rows = db.execute("SELECT count(*) FROM v_attention WHERE workspace_id=? AND what LIKE 'Core agent%'", (X['W2'],)).fetchone()[0]
    st_w2 = db.execute("SELECT mode, blocks_admin, overlay_text FROM v_core_agent_status WHERE workspace_id=?", (X['W2'],)).fetchone()
    # v2.2.9 (CONTRACT-r8b §B): fix_hint = <màn fix_target>: <owner_action> (v2.2.8: bộ chữ riêng "đổi tài khoản / đăng nhập lại", "kiểm tra lại khi…")
    F = 'A5 › AI Hệ thống: Đổi tài khoản / Đăng nhập lại'
    F2 = 'A5 › AI Hệ thống: Đổi tài khoản / Đăng nhập lại (tài khoản khác) hoặc dùng API key'
    G = 'A5 › AI Hệ thống: Chờ hãng hồi phục hoặc bấm Kiểm tra lại'
    G2 = 'A5 › AI Hệ thống: Chờ quota mở lại, bấm Kiểm tra lại, hoặc Đổi tài khoản / Đăng nhập lại'
    ok = (not danger0 and info_quota0 == ['EN-0001', 'EN-0003', 'EN-0004', 'EN-0005'] and st0 == ('ok', 0, None, None, None)
          and res['expired'][:2] == ([('EN-0001', 'Core agent gặp sự cố: đăng nhập hết hạn. Xử lý trước khi tiếp tục.')], ('recovery', 1, 'login_expired', 'login_expired', F))
          and res['suspended'][:2] == ([('EN-0001', 'Core agent gặp sự cố: tài khoản bị khoá. Xử lý trước khi tiếp tục.')],
                                       ('recovery', 1, 'login_suspended', 'account_suspended', F2))
          and res['outage'][:2] == ([('EN-0001', 'Core agent gặp sự cố: sự cố từ hãng. Xử lý trước khi tiếp tục.')], ('recovery', 1, 'outage', 'outage', G))
          and res['quota'][:2] == ([('EN-0001', 'Core agent gặp sự cố: hết quota. Xử lý trước khi tiếp tục.')], ('recovery', 1, 'quota_exhausted', 'quota_exhausted', G2))
          and all(res[k][2] == [] for k in ('expired', 'suspended', 'outage', 'quota'))
          and all(res[k + '_fixed'] == ([], 'ok') for k in ('expired', 'suspended', 'outage', 'quota'))
          and ('EN-0003', 'Quota exhausted') in d_mai and not [x for x in d_mai if x[1].startswith('Core agent')]
          and w2_rows == 0 and st_w2 == ('setup', 0, None))
    report("ATTN-core-agent", ok, f"seed: 0 hàng danger, {len(info_quota0)} hàng info 'Quota chưa xác định', v_core_agent_status {st0[0]}; Core agent gặp sự cố ⇒ đúng MỘT "
           f"hàng danger (nguồn overlay O4) + mode recovery, blocks_admin 1, incident_reason theo từ vựng failover_reason: hết hạn → login_expired, bị khoá → "
           f"account_suspended, outage → outage, hết quota → quota_exhausted (không còn warn từng tài khoản chính/dự phòng); owner xử lý ⇒ hết danger, mode ok; "
           f"quota cạn của Role (EN-0003) vẫn danger riêng, không bật overlay; W2 (Onboarding chưa khoá) mode {st_w2[0]}, 0 hàng")

def t_v226_failover():
    """A2 (CNS-073) + v2.2.8 (CONTRACT-r8 §B/§C): failover_reason enum 4 giá trị ghi ở nơi log failover (events engine.failover); fallback tự
    động CHỈ giữa các LOẠI CLI khác nhau của CÙNG một Role, với cả 4 lý do; Core agent không fallback (mọi lý do, mọi đích); cùng loại không tồn
    tại (luật A) — mệnh đề "khác loại" là lớp hai khi guard luật A bị bỏ; Role chỉ một loại CLI ⇒ không có đích; append-only."""
    D, X = seed()
    db, W, W2, EN, EB, mai, lan = D.db, X['W'], X['W2'], X['EN'], X['EB'], X['mai'], X['lan']
    c, case = _cases(db)
    def fo(frm, to, reason, kind='engine.failover', detail=True):
        d = json.dumps({'from_account_id': frm, 'to_account_id': to}) if detail else None
        return D.ins('events', workspace_id=W, kind=kind, severity='warn', subject='failover', failover_reason=reason, detail_json=d)
    ev = db.execute("SELECT display_id, failover_reason FROM events WHERE workspace_id=? AND kind='engine.failover'", (W,)).fetchall()
    case("failover thiếu failover_reason", lambda: fo(EN['mai_ag'], EN['mai_cc'], None), 'CHECK')
    case("failover_reason lạ (rate_limited)", lambda: fo(EN['mai_ag'], EN['mai_cc'], 'rate_limited'), 'CHECK')
    case("failover_reason trên kind khác (engine.failback)", lambda: fo(EN['mai_ag'], EN['mai_cc'], 'outage', kind='engine.failback'), 'CHECK')
    case("failover thiếu from/to", lambda: fo(EN['mai_ag'], EN['mai_cc'], 'outage', detail=False), 'CHECK|hai tài khoản khác nhau')
    case("from = to", lambda: fo(EN['mai_ag'], EN['mai_ag'], 'outage'), 'hai tài khoản khác nhau')
    en_w2 = _acc(D, W2, 'claude-code', 'Anthropic — W2', 'ga-auth-fo-w2', 'logged_in')
    case("to = tài khoản workspace khác", lambda: fo(EN['mai_ag'], en_w2, 'outage'), 'hai tài khoản khác nhau')
    spare = _acc(D, W, 'claude-code', 'Anthropic — chưa gán', 'ga-auth-fo-spare', 'logged_in')         # tài khoản chưa gán consumer nào
    for r in FO_REASONS:
        case(f"Core agent EN-0001 → tài khoản khác loại chưa gán ({r})", lambda r=r: fo(EN['sys_ag'], spare, r), MSG_FO_CORE_T)
    case("Core agent EN-0001 → EN-0004 Claude Code của Mai (outage)", lambda: fo(EN['sys_ag'], EN['mai_cc'], 'outage'), MSG_FO_CORE_T)
    case("Role Mai EN-0004 → Core agent EN-0001 (mượn tài khoản AI Hệ thống)", lambda: fo(EN['mai_cc'], EN['sys_ag'], 'quota_exhausted'), MSG_FO_CORE_T)
    case("khác Role (Mai EN-0003 → Lan EN-0005)", lambda: fo(EN['mai_ag'], EN['lan_ag'], 'outage'), MSG_FO_ROLE_T)
    case("Role → tài khoản chưa gán consumer", lambda: fo(EN['mai_ag'], spare, 'outage'), MSG_FO_ROLE_T)
    case("Lan chỉ một loại CLI (agy) — không có đích: EN-0005 → tài khoản chưa gán", lambda: fo(EN['lan_ag'], spare, 'quota_exhausted'), MSG_FO_ROLE_T)
    lan_targets = D.one("""SELECT count(*) FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id WHERE b.role_id=?
                           AND b.deleted_at IS NULL AND a.engine_slug <> 'antigravity'""", lan)
    allowed = [fo(EN['mai_ag'], EN['mai_cc'], r) for r in FO_REASONS] + [fo(EN['mai_cc'], EN['mai_ag'], 'login_expired')]
    # lớp hai của luật A: script bảo trì lỗi bỏ guard một-tài-khoản-mỗi-loại ⇒ Mai có 2 tài khoản Antigravity ⇒ failover cùng loại vẫn KHÔNG ghi được
    db.execute("DROP TRIGGER IF EXISTS engine_bindings_one_per_engine_i")
    ag2 = _acc(D, W, 'antigravity', 'Google — Mai 2', 'ga-auth-fo-ag2', 'logged_in', _cn(D, W))
    D.ins('engine_bindings', workspace_id=W, role_id=mai, engine_account_id=ag2, priority=3)
    for r in FO_REASONS:
        case(f"cùng loại agy → agy của Mai ({r}) khi guard luật A bị bỏ", lambda r=r: fo(EN['mai_ag'], ag2, r), MSG_FO_TYPE_T)
    dup = db.execute("SELECT value FROM v_integrity WHERE check_key='consumer_engine_duplicate' AND workspace_id=?", (W,)).fetchone()
    case("UPDATE failover_reason của EV-8841", lambda: db.execute("UPDATE events SET failover_reason='outage' WHERE workspace_id=? AND display_id='EV-8841'", (W,)),
         'append-only')
    case("DELETE EV-8841", lambda: db.execute("DELETE FROM events WHERE workspace_id=? AND display_id='EV-8841'", (W,)), 'append-only')
    ok = all(x[1] for x in c) and all(allowed) and ev == [('EV-8841', 'quota_exhausted')] and lan_targets == 0 and dup == (1,)
    report("FO-reason", ok, f"seed EV-8841 failover_reason = quota_exhausted (Mai: agy → Claude Code, khác loại CLI); {sum(x[1] for x in c)}/{len(c)} ca bị chặn: "
           f"thiếu/lạ/sai kind lý do, thiếu from/to, from = to, khác workspace; Core agent không fallback (4 lý do → tài khoản chưa gán, → tài khoản Role, "
           f"Role → tài khoản Core agent); khác Role, tài khoản chưa gán, Lan chỉ 1 loại CLI (0 đích); cùng loại agy → agy (4 lý do) khi guard luật A bị bỏ "
           f"(v_integrity consumer_engine_duplicate = {dup[0] if dup else 0}); UPDATE/DELETE log; {len(allowed)} ca được: Mai agy → Claude Code với cả 4 lý "
           f"do + chiều ngược lại")
    _show(c)

def t_v226_attachment():
    """B1.3 (CNS-086): MỘT trần tệp đính kèm chat = setting chat.attachment_max_bytes (ST-0018, 25 MB) — tệp clean không vượt trần."""
    D, X = seed()
    db, W, A = D.db, X['W'], X['A']
    own = A[(W, 'owner')]
    c, case = _cases(db)
    st = db.execute("SELECT display_id, value_json FROM settings WHERE workspace_id=? AND key=?", (W, ATTK)).fetchone()
    blob = D.one("SELECT blob_id FROM message_attachments WHERE workspace_id=? LIMIT 1", W)
    att = lambda size, scan='clean', **kw: D.ins('message_attachments', workspace_id=W, blob_id=blob, file_name='bang-gia.pdf', mime='application/pdf',
                                                size_bytes=size, sha256='s', scan_status=scan, uploaded_by=own, **kw)
    case("tệp clean 25 MB + 1 byte (INSERT)", lambda: att(MB25 + 1), 'vượt trần')
    edge = att(MB25)                                                               # đúng 25 MB: được
    big = att(MB25 * 2, 'pending')                                                 # đang quét: được ghi tạm
    case("quét xong pending → clean khi vượt trần (UPDATE)", lambda: db.execute("UPDATE message_attachments SET scan_status='clean' WHERE id=?", (big,)), 'vượt trần')
    db.execute("UPDATE message_attachments SET scan_status='rejected', reject_reason='> 25 MB' WHERE id=?", (big,))
    case("sửa size_bytes của tệp clean vượt trần (UPDATE)", lambda: db.execute("UPDATE message_attachments SET size_bytes=? WHERE id=?", (MB25 + 5, edge)), 'vượt trần')
    upd = lambda v, by=own: db.execute("UPDATE settings SET value_json=?, updated_by=? WHERE workspace_id=? AND key=? AND deleted_at IS NULL", (v, by, W, ATTK))
    for label, v in (('0', '0'), ('chuỗi "25MB"', '"25MB"'), ('104857601', '104857601'), ('1,5', '1.5')):
        case(f"setting = {label}", lambda v=v: upd(v), 'số nguyên byte')
    case("Trainer sửa setting", lambda: upd('10485760', A[(W, 'trainer')]), 'chỉ owner/admin')
    case("Role Mai sửa setting", lambda: upd('10485760', A[(W, 'Mai')]), 'chỉ owner/admin')
    case("đổi khoá ST-0018 sang khoá khác", lambda: db.execute("UPDATE settings SET key='chat.attachment_max_mb', updated_by=? WHERE workspace_id=? AND key=?",
                                                              (own, W, ATTK)), 'số nguyên byte')
    W9, A9 = _fresh_ws(D, 'att-nine', 'WA09')
    case("INSERT setting = 0 (workspace mới)", lambda: D.ins('settings', workspace_id=W9, key=ATTK, value_json='0', created_by=A9['owner']), 'số nguyên byte')
    case("Trainer INSERT setting", lambda: D.ins('settings', workspace_id=W9, key=ATTK, value_json='10485760', created_by=A9['trainer']), 'số nguyên byte')
    # dựng workspace: actor system ghi sẵn — v2.3.2: bị chặn / trùng (ca Trainer lọt) ⇒ ghi FAIL, không văng traceback (STD-11 1.11.0)
    sys_ok = _try(lambda: D.ins('settings', workspace_id=W9, key=ATTK, value_json='26214400', created_by=A9['system']))
    upd('10485760')                                                                # owner hạ trần còn 10 MB
    case("sau khi hạ trần 10 MB: tệp clean 11 MB", lambda: att(11 * 1048576), 'vượt trần')
    still = D.one("SELECT scan_status FROM message_attachments WHERE id=?", edge)  # tệp 25 MB cũ không bị hồi tố
    ok = all(x[1] for x in c) and st == ('ST-0018', '26214400') and edge and still == 'clean' and sys_ok
    report("ATT-max", ok, f"{st[0]} {ATTK} = {st[1]} (25 MB, ghi sẵn khi tạo workspace); {sum(x[1] for x in c)}/{len(c)} ca bị chặn: tệp clean vượt trần (INSERT, "
           f"pending→clean, sửa size_bytes), setting 0 / chuỗi / > 100 MB / số lẻ (UPDATE + INSERT), Trainer / Role ghi, đổi khoá, tệp 11 MB sau khi owner hạ trần 10 MB; "
           f"đúng 25 MB được; actor system ghi sẵn ở workspace mới {'được' if sys_ok else 'BỊ CHẶN'}; vượt trần ⇒ rejected + '> 25 MB'; hạ trần không hồi tố tệp cũ")
    _show(c)

def t_v226_card_drift():
    """B1.1 (CNS-088): sửa lõi KHÔNG tự thu hồi thẻ; cờ lệch lõi (v_employee_cards.core_drift) + gợi ý cấp lại ở A0; cấp lại ⇒ thẻ cũ superseded."""
    D, X = seed()
    db, W, mai, A = D.db, X['W'], X['mai'], X['A']
    cards0 = {r[0]: (r[1], r[2], r[3]) for r in db.execute("SELECT card_display_id, status, core_drift, superseded_by_display_id FROM v_employee_cards WHERE role_id=?", (mai,))}
    rv = lambda seq, major, minor, core, note=None: D.ins('revisions', workspace_id=W, scope='role', role_id=mai, seq=seq, major=major, minor=minor,
                                                       kind='core_edit' if core else 'edit', is_core=core, note=note, snapshot_json='{}',
                                                       snapshot_hash=f'h{seq}', prompt_tokens=1795)
    r4 = rv(4, 2, 2, 0)
    db.execute("UPDATE roles SET current_revision_id=? WHERE id=?", (r4, mai))
    drift_minor = D.one("SELECT core_drift FROM v_employee_cards WHERE card_id=?", X['cd4'])
    r5 = rv(5, 3, 0, 1, 'Sửa Persona: bớt hướng ngoại')
    db.execute("UPDATE roles SET current_revision_id=? WHERE id=?", (r5, mai))
    drift = db.execute("SELECT status, core_drift, card_major, current_major FROM v_employee_cards WHERE card_id=?", (X['cd4'],)).fetchone()
    att = db.execute("SELECT level, what FROM v_attention WHERE target='CD-0004'").fetchall()
    # cấp lại: CD-0005 nháp → CD-0004 superseded → CD-0005 issued (không cấp vốn lần 2)
    cd5 = D.ins('employee_cards', workspace_id=W, role_id=mai, revision_id=r5, position_id=X['PS'], status='draft', checks_json='[]')
    db.execute("UPDATE employee_cards SET status='superseded', superseded_by_id=? WHERE id=?", (cd5, X['cd4']))
    au, _ = audit(D, W, 'card.issue', entity_id=cd5)
    db.execute("""UPDATE employee_cards SET status='issued', issued_at=?, issued_by=?, dna_signature='sha256:r5', prompt_tokens=1795,
                  issue_audit_id=? WHERE id=?""", (now(), A[(W, 'owner')], au, cd5))
    cards1 = {r[0]: (r[1], r[2], r[3]) for r in db.execute("SELECT card_display_id, status, core_drift, superseded_by_display_id FROM v_employee_cards WHERE role_id=?", (mai,))}
    att1 = db.execute("SELECT count(*) FROM v_attention WHERE what LIKE 'Thẻ lệch lõi%'").fetchone()[0]
    grants = D.one("SELECT count(*) FROM ledger_entries WHERE entry_type='activation_grant' AND role_id=?", mai)
    ok = (cards0 == {'CD-0003': ('superseded', 0, 'CD-0004'), 'CD-0004': ('issued', 0, None)} and drift_minor == 0
          and drift == ('issued', 1, 2, 3) and att == [('info', 'Thẻ lệch lõi (cấp ở v2.1, lõi hiện tại v3.0) — gợi ý cấp lại')]
          and cards1['CD-0004'] == ('superseded', 0, 'CD-0005') and cards1['CD-0005'] == ('issued', 0, None) and att1 == 0 and grants == 1)
    report("CARD-drift", ok, f"seed: CD-0003 superseded → CD-0004 (board: \"đã thay bằng CD-0004\", không \"thu hồi\"); sửa thường v2.2 ⇒ không lệch; sửa lõi v3.0 ⇒ "
           f"CD-0004 vẫn {drift[0]} (không tự thu hồi), core_drift = {drift[1]}, A0 info \"{att[0][1] if att else '—'}\"; cấp lại CD-0005 ⇒ CD-0004 superseded, "
           f"hết cờ; vốn kích hoạt vẫn {grants} lần")

def t_v226_wound_inbox():
    """B1.4 (CNS-082): tin gửi Role đang Trọng thương được LƯU, không tạo việc, không tự xử lý khi hồi phục; owner thấy danh sách + 'Giao lại'."""
    D, X = seed()
    db, W, mai, A = D.db, X['W'], X['mai'], X['A']
    own = A[(W, 'owner')]
    th = D.one("SELECT id FROM chat_threads WHERE workspace_id=? AND kind='telegram' AND role_id=?", W, mai)
    msg = lambda author, text, ts, ext: D.ins('chat_messages', workspace_id=W, thread_id=th, author_kind=author, channel='telegram',
                                              content=text, external_id=ext, created_at=ts)
    before = msg('owner', 'Tin trước khi Trọng thương', '2000-01-01T00:00:00.000Z', 'r6-0')
    wound_mai(D, X)
    w = db.execute("SELECT id, display_id FROM role_wounds WHERE role_id=? AND ended_at IS NULL", (mai,)).fetchone()
    m1 = msg('owner', 'Mai gửi báo giá giúp anh', now(), 'r6-1')                          # lưu được
    m2 = msg('user', 'Chị ơi cho em hỏi lịch họp', now(), 'r6-2')                         # người trong allowlist (không phải owner)
    sysm = msg('system', '[Gen-Agents] Mai đang tạm nghỉ, sẽ phản hồi sau', now(), 'r6-3')  # tin hệ thống, không tính
    c, case = _cases(db)
    case("tạo việc giao cho Mai từ tin (đang Trọng thương)", lambda: D.ins('tasks', workspace_id=W, position_id=X['PS'], assignee_role_id=mai,
         requested_by=own, source='telegram', title='Gửi báo giá', source_message_id=m1), 'Trọng thương')
    lst0 = [(r[0], r[1]) for r in db.execute("SELECT message_display_id, is_pending FROM v_wound_messages WHERE role_wound_id=? ORDER BY message_display_id", (w[0],))]
    rw0 = db.execute("SELECT inbound_messages, inbound_pending FROM v_role_wounds WHERE role_wound_id=?", (w[0],)).fetchone()
    # "Giao lại": owner tạo việc từ tin m1 (chưa gán ai — hoặc gán Role khác) ⇒ tin hết chờ
    tk = D.ins('tasks', workspace_id=W, position_id=X['PS'], requested_by=own, source='telegram', title='Gửi báo giá (giao lại)', source_message_id=m1)
    rw1 = db.execute("SELECT inbound_messages, inbound_pending FROM v_role_wounds WHERE role_wound_id=?", (w[0],)).fetchone()
    # hồi phục: tin còn lại vẫn chờ (không tự xử lý); tin sau khi hồi phục không vào danh sách
    au, _ = audit(D, W, 'wallet.grant', entity_id=mai)
    post(D, W, 'grant', X['WT'], X['WM'], 100, 'Owner cấp thêm — hồi phục', evidence_audit_id=au, role_id=mai)
    msg('owner', 'Tin sau khi hồi phục', '2099-01-01T00:00:00.000Z', 'r6-4')
    after = db.execute("SELECT wound_open, message_display_id, is_pending, reassigned_task_display_id FROM v_wound_messages WHERE role_wound_id=? "
                       "ORDER BY message_display_id", (w[0],)).fetchall()
    tk_disp = D.one("SELECT display_id FROM tasks WHERE id=?", tk)
    disp = lambda i: D.one("SELECT display_id FROM chat_messages WHERE id=?", i)
    ok = (all(x[1] for x in c) and lst0 == [(disp(m1), 1), (disp(m2), 1)] and rw0 == (2, 2) and rw1 == (2, 1)
          and after == [(0, disp(m1), 0, tk_disp), (0, disp(m2), 1, None)])
    report("WOUND-inbox", ok, f"Mai {w[1]}: tin owner + tin người trong allowlist được lưu (chat_messages), tin hệ thống [Gen-Agents] và tin ngoài giai đoạn không tính; "
           f"{sum(x[1] for x in c)}/{len(c)} ca âm (tạo việc cho Role đang Trọng thương); v_wound_messages {len(lst0)} tin chờ, v_role_wounds {rw0[0]}/{rw0[1]}; "
           f"'Giao lại' (tasks.source_message_id → {tk_disp}) ⇒ còn {rw1[1]} chờ; hồi phục ⇒ tin còn lại VẪN chờ (không tự xử lý)")
    _show(c)

def t_v226_seed():
    """Seed v2.2.6 (B1.2, B1.3, B2, CNS-077, CNS-083): codex coming_soon; PB kiểm đăng nhập bước 2 tách quét khả năng bước 3; ST-0018; EV một nghĩa."""
    D, X = seed()
    db, W = D.db, X['W']
    eng = dict(db.execute("SELECT slug, adapter_status FROM engines").fetchall())
    pbs = db.execute("""SELECT p.display_id, a.display_id, p.trigger, p.status, c.display_id FROM probe_runs p JOIN engine_accounts a ON a.id = p.engine_account_id
                        JOIN containers c ON c.id = p.container_id WHERE p.workspace_id=? ORDER BY p.display_seq""", (W,)).fetchall()
    cap_pb = {r[0] for r in db.execute("SELECT p.display_id FROM capabilities c JOIN probe_runs p ON p.id = c.last_probe_run_id WHERE c.workspace_id=?", (W,))}
    core = db.execute("SELECT account_display_id, is_primary, is_ready, last_login_check_display_id FROM v_core_agent_accounts WHERE workspace_id=? "
                      "ORDER BY priority", (W,)).fetchall()
    st18 = db.execute("SELECT display_id, value_json FROM settings WHERE workspace_id=? AND key=?", (W, ATTK)).fetchone()
    evs = db.execute("SELECT display_id, kind, failover_reason FROM events WHERE workspace_id=? ORDER BY display_seq", (W,)).fetchall()
    lock = db.execute("SELECT id, core_agent_locked_at IS NOT NULL FROM workspaces WHERE kind='tenant' ORDER BY slug").fetchall()
    ok = (eng == {'antigravity': 'ready', 'claude-code': 'ready', 'codex': 'coming_soon', 'openclaw': 'coming_soon'}
          and pbs == [('PB-0001', 'EN-0001', 'login_check', 'ok', 'CT-0001'), ('PB-0003', 'EN-0001', 'install', 'ok', 'CT-0001')]
          and cap_pb == {'PB-0003'} and core == [('EN-0001', 1, 1, 'PB-0001')]
          and st18 == ('ST-0018', '26214400')
          and evs == [('EV-0008', 'container.created', None), ('EV-8832', 'card.issued', None), ('EV-8841', 'engine.failover', 'quota_exhausted')]
          and dict(lock) == {X['W']: 1, X['W2']: 0})
    report("SEED-r6", ok, f"engines {eng}; PB: {', '.join(f'{p[0]} {p[1]} {p[2]}' for p in pbs)} (bước 2 kiểm đăng nhập ≠ bước 3 quét khả năng; CAP trỏ {sorted(cap_pb)}); "
           f"Core agent: EN-0001 duy nhất + sẵn sàng (lần kiểm PB-0001; v2.2.8: PB-0002/PB-0004 của EN-0002 cũ để trống); {st18[0]} {ATTK} = {st18[1]}; EV: "
           f"{', '.join(f'{e[0]} {e[1]}' for e in evs)} (EV-0001…0007 dành cho nhật ký Onboarding); mốc core_agent_locked_at: W có, W2 không")

# ================================================================== v2.2.7 — closure check vòng 6 (audit r5 §12): CNS-092, CNS-093
MSG_CAT_T = 'engine đang là Core agent của workspace'
MSG_CT_T = 'container AI Hệ thống cuối cùng'

def t_v227_core_capable():
    """CNS-092 + v2.2.8 (Q-I5 [CHỐT — Ryan 2026-10-16]): danh mục core_capable = {antigravity, claude-code}; ST-0017 chỉ nhận engine
    core_capable = 1 + ready (INSERT + UPDATE); danh mục không hạ được điều kiện của engine ĐANG là Core agent (UPDATE / DELETE);
    ô "Loại Core agent": mặc định Antigravity, chọn được Claude Code trước mốc khoá."""
    D, X = seed()
    db, W, A = D.db, X['W'], X['A']
    c, case = _cases(db)
    cat = dict(db.execute("SELECT slug, core_capable FROM engines").fetchall())
    opts = [r[0] for r in db.execute("SELECT slug FROM engines WHERE core_capable = 1 AND adapter_status = 'ready' ORDER BY priority_order")]
    optv = db.execute("SELECT slug, selectable, is_default, badge FROM v_core_agent_options ORDER BY priority_order").fetchall()   # v2.2.8: Onboarding bước 2
    db.execute("""INSERT INTO engines(slug,name,vendor,cli_binary,adapter_status,priority_order,tos_risk,tos_notice_key,tos_notice_version,
                  requires_consent,core_capable) VALUES('plain-ready','Plain','x','pr','ready',7,'grey','tos.pr','1',0,0)""")
    W8, A8 = _fresh_ws(D, 'cap-eight', 'WC08')
    own8 = A8['owner']
    ins = lambda v, ws=W8, by=own8, **kw: D.ins('settings', workspace_id=ws, key='system.core_agent_engine', value_json=v, created_by=by, **kw)
    case("INSERT ST-0017 = engine ready nhưng core_capable = 0", lambda: ins('"plain-ready"'), 'phải là slug')
    case("INSERT ST-0017 = codex (coming_soon, core_capable = 0)", lambda: ins('"codex"'), 'phải là slug')
    case("INSERT ST-0017 = openclaw (core_capable = 1 nhưng coming_soon — CONTRACT-r8 §C)", lambda: ins('"openclaw"'), 'phải là slug')
    db.execute("""INSERT INTO engines(slug,name,vendor,cli_binary,adapter_status,priority_order,tos_risk,tos_notice_key,tos_notice_version,
                  requires_consent,core_capable) VALUES('core-beta','Core Beta','x','cb','beta',9,'grey','tos.cb','1',0,1)""")
    case("INSERT ST-0017 = engine core_capable nhưng beta", lambda: ins('"core-beta"'), 'phải là slug')
    st = ins('"antigravity"')                                                      # B1 nay là ca ĐƯỢC: mặc định Antigravity
    db.execute("UPDATE settings SET value_json='\"claude-code\"', updated_by=? WHERE id=?", (own8, st))   # đối chứng: chọn Claude Code trước mốc
    picked = D.one("SELECT value_json FROM settings WHERE id=?", st)
    case("UPDATE ST-0017 → engine core_capable = 0 (trước mốc)", lambda: db.execute(
        "UPDATE settings SET value_json='\"plain-ready\"', updated_by=? WHERE id=?", (own8, st)), 'phải là slug')
    other = D.ins('settings', workspace_id=W8, key='engines.note_r7', value_json='"plain-ready"', created_by=own8)
    db.execute("UPDATE settings SET deleted_at=?, updated_by=? WHERE id=?", (now(), own8, st))
    case("đổi khoá khác (= plain-ready) thành ST-0017", lambda: db.execute(
        "UPDATE settings SET key='system.core_agent_engine', updated_by=? WHERE id=?", (own8, other)), 'phải là slug')
    gone = ins('"plain-ready"', deleted_at=now())                                  # hàng đã xoá mềm không mang giá trị hiệu lực
    case("khôi phục hàng ST-0017 = plain-ready (deleted_at → NULL)", lambda: db.execute(
        "UPDATE settings SET deleted_at=NULL, updated_by=? WHERE id=?", (own8, gone)), 'phải là slug')
    # phía danh mục: không hạ điều kiện của engine đang là Core agent (W, W2 dùng antigravity; workspace thiếu ST-0017 cũng mặc định antigravity)
    case("danh mục: antigravity core_capable → 0", lambda: db.execute("UPDATE engines SET core_capable=0 WHERE slug='antigravity'"), MSG_CAT_T)
    case("danh mục: antigravity adapter_status → deprecated", lambda: db.execute(
        "UPDATE engines SET adapter_status='deprecated' WHERE slug='antigravity'"), MSG_CAT_T)
    case("danh mục: đổi slug antigravity", lambda: db.execute("UPDATE engines SET slug='agy' WHERE slug='antigravity'"), MSG_CAT_T + '|FOREIGN KEY')
    case("danh mục: xoá engine antigravity", lambda: db.execute("DELETE FROM engines WHERE slug='antigravity'"), MSG_CAT_T + '|FOREIGN KEY')
    # Claude Code: W9 chọn trước mốc ⇒ đang dùng ⇒ không hạ được; W9 đổi lại ⇒ không ai dùng ⇒ hạ được (đối chứng), rồi bật lại
    W9, A9 = _fresh_ws(D, 'cap-nine', 'WC09')
    cc9 = ins('"claude-code"', ws=W9, by=A9['owner'])
    case("Claude Code đang là Core agent của W9: hạ core_capable", lambda: db.execute("UPDATE engines SET core_capable=0 WHERE slug='claude-code'"),
         MSG_CAT_T)
    db.execute("UPDATE settings SET value_json='\"antigravity\"', updated_by=? WHERE id=?", (A9['owner'], cc9))
    db.execute("UPDATE engines SET core_capable=0 WHERE slug='claude-code'")     # không ai dùng ⇒ hạ được
    opts_no_cc = [r[0] for r in db.execute("SELECT slug FROM engines WHERE core_capable = 1 AND adapter_status = 'ready' ORDER BY priority_order")]
    db.execute("UPDATE engines SET core_capable=1 WHERE slug='claude-code'")
    db.execute("UPDATE engines SET core_capable=0 WHERE slug='core-beta'")       # đối chứng: engine không ai dùng ⇒ hạ được
    # xoá engine đang là Core agent mà KHÔNG có tài khoản nào trỏ tới (FK không bảo vệ) — chỉ trigger chặn
    db.execute("""INSERT INTO engines(slug,name,vendor,cli_binary,adapter_status,priority_order,tos_risk,tos_notice_key,tos_notice_version,
                  requires_consent,core_capable) VALUES('core-x','Core X','x','cx','ready',8,'grey','tos.cx','1',0,1)""")
    W10, A10 = _fresh_ws(D, 'cap-ten', 'WC10')
    ins('"core-x"', ws=W10, by=A10['owner'])
    case("xoá engine đang là Core agent của W10 (chưa có tài khoản — FK không che)", lambda: db.execute("DELETE FROM engines WHERE slug='core-x'"), MSG_CAT_T)
    ok = (all(x[1] for x in c) and cat == {'antigravity': 1, 'claude-code': 1, 'codex': 0, 'openclaw': 1} and opts == ['antigravity', 'claude-code']
          and optv == [('antigravity', 1, 1, None), ('claude-code', 1, 0, None), ('openclaw', 0, 0, 'sắp có')]
          and picked == '"claude-code"' and opts_no_cc == ['antigravity'])
    report("CORE-capable", ok, f"engines.core_capable seed {cat} (v2.2.8, CONTRACT-r8 §C); v_core_agent_options (ô \"Loại Core agent\") = {optv} — mặc định "
           f"antigravity, openclaw hiện mờ \"sắp có\"; đối chứng: chọn Claude Code trước mốc được; {sum(x[1] for x in c)}/{len(c)} ca bị chặn: ready nhưng "
           f"core_capable = 0 (INSERT, UPDATE, đổi khoá vào ST-0017, khôi phục hàng), codex, openclaw coming_soon, core_capable nhưng beta; danh mục: hạ core_capable / deprecated / đổi slug / xoá "
           f"Antigravity đang dùng, hạ Claude Code khi W9 đang dùng, xoá engine đang dùng mà FK không che; đối chứng: engine không ai dùng hạ được")
    _show(c)

def t_v227_container():
    """CNS-093 (probe N4): không xoá mềm / xoá cứng / đổi kind / đặt absent cho container AI Hệ thống cuối cùng khi còn binding Hệ thống sống;
    đối chứng: sửa tại chỗ được, workspace chưa có binding xoá được; lớp hai v_integrity + not_ready_reason + câu A0."""
    D, X = seed()
    db, W, CT, mai = D.db, X['W'], X['CT'], X['mai']
    c, case = _cases(db)
    sysct = CT['sys']
    upd = lambda sql, *a: (lambda: db.execute(sql, a))
    case("N4 xoá mềm CT-0001 (đã có Role)", upd("UPDATE containers SET deleted_at=? WHERE id=?", now(), sysct), MSG_CT_T)
    case("xoá cứng CT-0001", upd("DELETE FROM containers WHERE id=?", sysct), MSG_CT_T)
    tam = _role(D, W, 'Tam')                                                        # Role chưa có container — đích cho lối đổi kind
    case("đổi kind CT-0001 → role", upd("UPDATE containers SET kind='role', role_id=? WHERE id=?", tam, sysct), MSG_CT_T)
    case("desired_state = absent (supervisor gỡ container)", upd("UPDATE containers SET desired_state='absent' WHERE id=?", sysct), MSG_CT_T)
    case("chuyển CT-0001 sang workspace khác", upd("UPDATE containers SET workspace_id=? WHERE id=?", X['W2'], sysct), MSG_CT_T + '|immutable')
    # đối chứng: dựng lại tại chỗ (image mới, ngủ/chạy/dừng) được
    db.execute("UPDATE containers SET image_ref='ga-runtime:0.1.1', image_digest='sha256:new', desired_state='running', observed_state='creating' WHERE id=?", (sysct,))
    db.execute("UPDATE containers SET desired_state='stopped' WHERE id=?", (sysct,))
    # hoán vị (v2.2.8): đổi tài khoản Core agent thủ công — đăng nhập lại trên EB-0001 (danh tính mới) — container vẫn khoá
    db.execute("UPDATE engine_accounts SET label='Google — Hệ thống (đổi)', login_status='unknown' WHERE id=?", (X['EN']['sys_ag'],))
    case("đang đổi tài khoản Core agent: xoá mềm CT-0001", upd("UPDATE containers SET deleted_at=? WHERE id=?", now(), sysct), MSG_CT_T)
    db.execute("UPDATE engine_accounts SET login_status='logged_in' WHERE id=?", (X['EN']['sys_ag'],))
    # workspace chưa có binding hệ thống (Onboarding bước 1–2 dở): xoá container được, dựng cái mới được
    W6, A6 = _fresh_ws(D, 'ct-six', 'WT06')
    ct6 = D.ins('containers', workspace_id=W6, kind='system', container_name='ga-sys-wt06', desired_state='sleeping', observed_state='created')
    db.execute("UPDATE containers SET deleted_at=? WHERE id=?", (now(), ct6))
    ct6b = D.ins('containers', workspace_id=W6, kind='system', container_name='ga-sys-wt06b', desired_state='sleeping', observed_state='created')
    a6 = _core_acc(D, W6, 'Google — Hệ thống', 'ga-auth-wt06-0001', 'logged_in')
    D.ins('engine_bindings', workspace_id=W6, consumer_kind='system', engine_account_id=a6, priority=1)
    case("hoán vị: có binding SAU khi dựng lại ⇒ container mới bị khoá", upd("UPDATE containers SET deleted_at=? WHERE id=?", now(), ct6b), MSG_CT_T)
    # lớp hai: bỏ trigger ⇒ v_integrity + lý do chưa sẵn sàng + câu A0 nói đúng nguyên nhân
    integ0 = [r for r in db.execute("SELECT check_key FROM v_integrity") if r[0] == 'core_agent_container_missing']
    db.execute("DROP TRIGGER IF EXISTS containers_system_last_u")
    db.execute("UPDATE containers SET deleted_at=? WHERE id=?", (now(), sysct))
    integ1 = db.execute("SELECT value FROM v_integrity WHERE check_key='core_agent_container_missing' AND workspace_id=?", (W,)).fetchone()
    why = {r[0] for r in db.execute("SELECT not_ready_reason FROM v_core_agent_accounts WHERE workspace_id=?", (W,))}
    att = [r[0] for r in db.execute("SELECT what FROM v_attention WHERE workspace_id=? AND level='danger' AND what LIKE 'Core agent%'", (W,))]
    fix = D.one("SELECT fix_hint FROM v_core_agent_status WHERE workspace_id=?", W)
    ok = (all(x[1] for x in c) and not integ0 and integ1 == (1,) and why == {'container_missing'}
          and att == ['Core agent gặp sự cố: container AI Hệ thống không còn. Xử lý trước khi tiếp tục.']
          and fix == 'A5 › Container (Hạ tầng): Dựng lại container AI Hệ thống')        # v2.2.9 (CONTRACT-r8b §B): fix_target a5.container + owner_action
    report("CORE-container", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn: N4 xoá mềm CT-0001, xoá cứng, đổi kind → role, desired_state absent, "
           f"đổi workspace, xoá lúc đang đổi tài khoản Core agent, container dựng lại bị khoá ngay khi có binding; đối chứng: dựng lại tại chỗ (image, "
           f"running/stopped) được, workspace chưa có binding xoá + dựng mới được; bỏ trigger ⇒ v_integrity core_agent_container_missing = "
           f"{integ1[0] if integ1 else 0}, not_ready_reason {sorted(why)}, A0 danger \"{att[0] if att else '—'}\" → \"{fix}\"")
    _show(c)

# ================================================================== v2.2.8 — CONTRACT-r7: Ryan chốt Q-I5 = Antigravity (2026-10-16)
MSG_CN_T = 'engine cần consent'
MSG_PB_CN_T = 'Clause 6 / OB-05'

def t_v228_consent():
    """CONTRACT-r7 §A (OB-05 bắt buộc với Core agent Antigravity): chưa đồng ý Clause 6 thì không tạo tài khoản / không đăng nhập (probe) được;
    đồng ý phải hợp lệ (cùng workspace, đúng engine, engine_tos_risk, chưa rút, đúng version lời cảnh báo) — ma trận vòng đời: tạo, sửa
    consent_id / engine_slug, rút, lời cảnh báo đổi version (hết hạn), đồng ý lại; probe UPDATE bị khoá. (JB-0417: CORE-recovery.)"""
    D, X = seed()
    db, W, W2, EN, EB = D.db, X['W'], X['W2'], X['EN'], X['EB']
    c, case = _cases(db)
    W11, A11 = _fresh_ws(D, 'cn-eleven', 'WN11')
    o5_0 = _ob(D, W11, 'OB-05')
    ct = D.ins('containers', workspace_id=W11, kind='system', container_name='ga-sys-wn11', desired_state='sleeping', observed_state='created')
    acc = lambda cn, vol: D.ins('engine_accounts', workspace_id=W11, engine_slug='antigravity', label='Google — ' + vol, auth_method='subscription',
                                auth_volume=vol, consent_id=cn, login_status='logged_in')
    case("tài khoản Antigravity KHÔNG đồng ý Clause 6", lambda: acc(None, 'ga-auth-wn11-a'), MSG_CN_T)
    case("đồng ý của workspace khác (W2)", lambda: acc(_cn(D, W2), 'ga-auth-wn11-b'), MSG_CN_T)
    case("đồng ý sai engine (subject claude-code)", lambda: acc(_cn(D, W11, subject='claude-code'), 'ga-auth-wn11-c'), MSG_CN_T)
    case("đồng ý sai loại (role_as_model_api)", lambda: acc(_cn(D, W11, kind='role_as_model_api', subject='antigravity'), 'ga-auth-wn11-d'), MSG_CN_T)
    rv = _cn(D, W11); db.execute("UPDATE consents SET revoked_at=? WHERE id=?", (now(), rv))
    case("đồng ý đã rút", lambda: acc(rv, 'ga-auth-wn11-e'), MSG_CN_T)
    case("đồng ý version lời cảnh báo cũ (0)", lambda: acc(_cn(D, W11, version='0'), 'ga-auth-wn11-f'), MSG_CN_T)
    cn1 = _cn(D, W11)
    a1 = acc(cn1, 'ga-auth-wn11-1')                                                # hợp lệ ⇒ được
    b1 = D.ins('engine_bindings', workspace_id=W11, consumer_kind='system', engine_account_id=a1, priority=1)
    case("UPDATE consent_id của tài khoản sang đồng ý đã rút", lambda: db.execute("UPDATE engine_accounts SET consent_id=? WHERE id=?", (rv, a1)), MSG_CN_T)
    case("UPDATE consent_id = NULL", lambda: db.execute("UPDATE engine_accounts SET consent_id=NULL WHERE id=?", (a1,)), MSG_CN_T)
    cc = _acc(D, W11, 'claude-code', 'Anthropic — Role sau này', 'ga-auth-wn11-cc')
    case("UPDATE engine_slug claude-code → antigravity (không đồng ý)", lambda: db.execute(
        "UPDATE engine_accounts SET engine_slug='antigravity' WHERE id=?", (cc,)), MSG_CN_T)
    _probe(D, W11, a1, ct)
    o5_1, r1 = _ob(D, W11, 'OB-05'), _try_role(D, W11, 'Mot')
    # vòng đời: rút đồng ý ⇒ OB-05 err, mất sẵn sàng, không đăng nhập / probe được, Role mới bị chặn, A0 báo
    db.execute("UPDATE consents SET revoked_at=? WHERE id=?", (now(), cn1))
    o5_2, r2 = _ob(D, W11, 'OB-05'), _try_role(D, W11, 'Hai')
    case("kiểm đăng nhập (login_check) khi đồng ý đã rút", lambda: _probe(D, W11, a1, ct), MSG_PB_CN_T)
    case("quét khả năng (install) khi đồng ý đã rút", lambda: D.ins('probe_runs', workspace_id=W11, engine_account_id=a1, engine_slug='antigravity',
         container_id=ct, trigger='install', auth_mode='oauth', status='running', started_at=now()), MSG_PB_CN_T)
    why2 = D.one("SELECT not_ready_reason FROM v_core_agent_accounts WHERE engine_account_id=?", a1)
    att2 = [r[0] for r in db.execute("SELECT what FROM v_attention WHERE workspace_id=? AND level='danger' AND what LIKE 'Core agent%'", (W11,))]
    db.execute("UPDATE engine_accounts SET consent_id=? WHERE id=?", (_cn(D, W11), a1))    # đồng ý lại
    o5_3, r3 = _ob(D, W11, 'OB-05'), _try_role(D, W11, 'Ba')
    # hết hạn: lời cảnh báo Clause 6 đổi version ⇒ mọi đồng ý cũ không còn hợp lệ ⇒ OB-05 err, mất sẵn sàng (seed W cũng vậy)
    db.execute("UPDATE engines SET tos_notice_version='2' WHERE slug='antigravity'")
    o5_4, r4, o5_w = _ob(D, W11, 'OB-05'), _try_role(D, W11, 'Bon'), _ob(D, W, 'OB-05')
    case("probe khi lời cảnh báo đã đổi version", lambda: _probe(D, W11, a1, ct), MSG_PB_CN_T)
    db.execute("UPDATE engine_accounts SET consent_id=? WHERE id=?", (_cn(D, W11, version='2'), a1))
    _probe(D, W11, a1, ct)
    o5_5, r5 = _ob(D, W11, 'OB-05'), _try_role(D, W11, 'Nam')
    # probe đã ghi không đổi được tài khoản (UPDATE engine_account_id: guard sinh tự động)
    pid = D.one("SELECT id FROM probe_runs WHERE engine_account_id=? ORDER BY display_seq DESC LIMIT 1", a1)
    case("UPDATE engine_account_id của probe sang tài khoản khác", lambda: db.execute(
        "UPDATE probe_runs SET engine_account_id=? WHERE id=?", (cc, pid)), 'append-only|Q-R1')
    ok = (all(x[1] for x in c) and o5_0[0] == 'err' and o5_1[0] == 'ok' and r1 and o5_2[0] == 'err' and not r2 and why2 == 'consent_missing'
          and att2 == ['Core agent gặp sự cố: chưa có đồng ý điều khoản hợp lệ. Xử lý trước khi tiếp tục.'] and o5_3[0] == 'ok' and r3
          and o5_4[0] == 'err' and not r4 and o5_w[0] == 'err' and o5_5[0] == 'ok' and r5)
    report("CORE-consent", ok, f"OB-05 với Core agent Antigravity: chưa có gì → {o5_0[0]} \"{o5_0[1]}\"; {sum(x[1] for x in c)}/{len(c)} ca bị chặn: tài khoản "
           f"không đồng ý / đồng ý W2 / sai engine / sai loại / đã rút / version cũ, UPDATE consent_id (đã rút, NULL), đổi engine_slug sang antigravity "
           f"không đồng ý, kiểm đăng nhập + quét khi đồng ý đã rút, probe khi lời cảnh báo đổi version, UPDATE tài khoản của probe; vòng đời: có đồng ý → "
           f"OB-05 {o5_1[0]}, Role tạo được; rút → OB-05 {o5_2[0]}, not_ready_reason {why2}, A0 danger (chế độ khắc phục), Role bị chặn; đồng ý lại → "
           f"{o5_3[0]}; lời cảnh báo đổi version → OB-05 {o5_4[0]} (cả seed W), Role bị chặn; đồng ý version mới + kiểm lại → {o5_5[0]}")
    _show(c)

def _try_role(D, ws, name):
    try:
        _role(D, ws, name); return True
    except sqlite3.DatabaseError:
        return False

def t_v228_seed():
    """Seed v2.2.8 (CONTRACT-r8 §D, đè r7): ST-0017 = antigravity; EN-0001 Antigravity = tài khoản Core agent DUY NHẤT; EN-0002 / EB-0002 /
    PB-0002 / PB-0004 để trống; Onboarding bước 2 = MỘT transaction (CN-0001 = EB-0001 < PB-0001 = mốc khoá, v2.2.9); CN-0001…0003 theo thời gian, không còn consent
    xoay; PB-0001 kiểm đăng nhập + PB-0003 quét khả năng bằng agy; SA model Antigravity theo registry (capabilities)."""
    D, X = seed()
    db, W = D.db, X['W']
    st = db.execute("SELECT display_id, value_json FROM settings WHERE workspace_id=? AND key='system.core_agent_engine'", (W,)).fetchone()
    sysacc = db.execute("""SELECT a.display_id, a.engine_slug, a.label, cn.display_id, b.display_id FROM engine_accounts a
                           JOIN engine_bindings b ON b.engine_account_id = a.id JOIN consents cn ON cn.id = a.consent_id
                           WHERE b.workspace_id=? AND b.consumer_kind='system' ORDER BY b.priority""", (W,)).fetchall()
    cns = db.execute("""SELECT cn.display_id, a.display_id FROM consents cn JOIN engine_accounts a ON a.consent_id = cn.id WHERE cn.workspace_id=?
                        ORDER BY cn.display_seq""", (W,)).fetchall()
    cn_times = [r[0] for r in db.execute("SELECT accepted_at FROM consents WHERE workspace_id=? ORDER BY display_seq", (W,))]
    t_cn1 = D.one("SELECT accepted_at FROM consents WHERE workspace_id=? AND display_id='CN-0001'", W)
    t_en1 = D.one("SELECT created_at FROM engine_accounts WHERE workspace_id=? AND display_id='EN-0001'", W)
    t_eb1 = D.one("SELECT created_at FROM engine_bindings WHERE workspace_id=? AND display_id='EB-0001'", W)
    t_pb1 = D.one("SELECT started_at FROM probe_runs WHERE workspace_id=? AND display_id='PB-0001'", W)
    t_pb1_done = D.one("SELECT finished_at FROM probe_runs WHERE workspace_id=? AND display_id='PB-0001'", W)
    lock = D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W)
    pbs = db.execute("SELECT display_id, engine_slug, trigger FROM probe_runs WHERE workspace_id=? ORDER BY display_seq", (W,)).fetchall()
    gaps = {t: [r[0] for r in db.execute(f"SELECT display_id FROM {t} WHERE workspace_id=? AND display_id IN ({','.join('?' * len(ids))})", (W, *ids))]
            for t, ids in (('engine_accounts', ['EN-0002']), ('engine_bindings', ['EB-0002']), ('probe_runs', ['PB-0002', 'PB-0004']))}
    rot = D.one("SELECT count(*) FROM settings WHERE workspace_id=? AND (display_id='ST-0019' OR key LIKE '%rotation%')", W)
    sa = db.execute("SELECT display_id, system_key, account_display_id, model_key, effort FROM v_system_agents WHERE workspace_id=? ORDER BY display_id", (W,)).fetchall()
    models = {r[0] for r in db.execute("SELECT item_key FROM capabilities WHERE workspace_id=? AND kind='model' AND engine_account_id=?", (W, X['EN']['sys_ag']))}
    ok = (st == ('ST-0017', '"antigravity"')
          and sysacc == [('EN-0001', 'antigravity', 'Google — Hệ thống', 'CN-0001', 'EB-0001')]
          and cns == [('CN-0001', 'EN-0001'), ('CN-0002', 'EN-0003'), ('CN-0003', 'EN-0005')]
          # v2.2.9 (CONTRACT-r8b §A): mốc khoá = PB-0001 xong (27/09 14:00:23), SAU transaction bước 2 (v2.2.8: mốc = EB-0001 14:00:13)
          and cn_times == sorted(cn_times) and t_cn1 == t_en1 == t_eb1 and t_eb1 < t_pb1 and lock == t_pb1_done and lock > t_eb1
          and pbs == [('PB-0001', 'antigravity', 'login_check'), ('PB-0003', 'antigravity', 'install')]
          and gaps == {'engine_accounts': [], 'engine_bindings': [], 'probe_runs': []} and rot == 0
          and [(x[1], x[2], x[3], x[4]) for x in sa] == [('interviewer', 'EN-0001', 'gemini-3.1-pro-high', 'high'), ('trainer', 'EN-0001', 'gemini-3.1-pro-low', 'low'),
                                                       ('consolidator', 'EN-0001', 'gemini-3.8-flash-low', 'low'), ('judge', 'EN-0001', 'gemini-3.8-flash-medium', 'medium')]
          and {x[3] for x in sa} <= models)
    report("SEED-r8", ok, f"{st[0]} = {st[1]}; AI Hệ thống: {', '.join(f'{x[0]} {x[1]} \"{x[2]}\" ← {x[3]} ({x[4]})' for x in sysacc)} — duy nhất; "
           f"Onboarding bước 2 một transaction: CN-0001 = EN-0001 = EB-0001 ({'cùng mốc' if t_cn1 == t_en1 == t_eb1 else 'LỆCH'}) < PB-0001 = mốc khoá "
           f"({'đúng' if lock == t_pb1_done else 'LỆCH'} — v2.2.9: lần kiểm đăng nhập đạt đầu tiên); "
           f"consent theo thời gian: {', '.join(f'{x[0]}→{x[1]}' for x in cns)}; PB bằng agy: {', '.join(f'{p[0]} {p[2]}' for p in pbs)}; để trống: EN-0002, "
           f"EB-0002, PB-0002, PB-0004; không ST-0019 / consent xoay; SA: {', '.join(f'{x[0]} {x[3]}/{x[4]}' for x in sa)} — đều có trong capabilities của EN-0001")

def t_v228_one_per_engine():
    """CONTRACT-r8 §A (lời Ryan 2026-10-16): mỗi consumer MỘT tài khoản cho mỗi loại CLI — UNIQUE sống (consumer, engine_slug) ép INSERT lẫn UPDATE
    (engine_account_id, role_id, consumer_kind, khôi phục binding, engine_slug của tài khoản) × hoán vị thời gian; tắt vẫn chiếm chỗ, xoá mềm thì
    không; đổi tài khoản = đăng nhập lại trên CÙNG binding (thủ công, audit); đối chứng loại CLI khác; lớp hai v_integrity."""
    D, X = seed()
    db, W, EN, EB, mai, lan = D.db, X['W'], X['EN'], X['EB'], X['mai'], X['lan']
    c, case = _cases(db)
    rb = lambda role, acc, prio, **kw: D.ins('engine_bindings', workspace_id=W, role_id=role, engine_account_id=acc, priority=prio, **kw)
    ag_m2 = _acc(D, W, 'antigravity', 'Google — Mai 2', 'ga-auth-one-m2', 'logged_in', _cn(D, W))
    case("INSERT: Mai thêm tài khoản Antigravity thứ hai", lambda: rb(mai, ag_m2, 3), MSG_ONE_T)
    case("INSERT: … ở trạng thái tắt (is_enabled = 0 vẫn chiếm chỗ)", lambda: rb(mai, ag_m2, 3, is_enabled=0), MSG_ONE_T)
    case("INSERT: AI Hệ thống thêm tài khoản Antigravity thứ hai", lambda: D.ins('engine_bindings', workspace_id=W, consumer_kind='system',
         engine_account_id=ag_m2, priority=2), MSG_ONE_T)
    # đối chứng: loại CLI KHÁC ⇒ được (Lan: agy + Claude Code = 2 loại ⇒ có fallback); hàng đã xoá mềm (lịch sử) không chiếm chỗ
    cc_l = _acc(D, W, 'claude-code', 'Anthropic — Lan', 'ga-auth-one-l1', 'logged_in')
    eb_l2 = rb(lan, cc_l, 2)
    eb_hist = rb(mai, ag_m2, 3, deleted_at=now())
    lan_types = sorted(r[0] for r in db.execute("""SELECT a.engine_slug FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id
                                                  WHERE b.role_id=? AND b.deleted_at IS NULL""", (lan,)))
    case("UPDATE engine_account_id: binding Claude Code của Lan → tài khoản Antigravity (Lan đã có)", lambda: db.execute(
        "UPDATE engine_bindings SET engine_account_id=? WHERE id=?", (ag_m2, eb_l2)), MSG_ONE_T)
    case("UPDATE role_id: chuyển binding Claude Code của Lan sang Mai (Mai đã có)", lambda: db.execute(
        "UPDATE engine_bindings SET role_id=?, priority=7 WHERE id=?", (mai, eb_l2)), MSG_ONE_T)
    case("UPDATE consumer_kind: lật Antigravity EN-0003 của Mai sang Hệ thống (đã có EB-0001)", lambda: db.execute(
        "UPDATE engine_bindings SET consumer_kind='system', role_id=NULL, priority=6 WHERE id=?", (EB['mai_ag'],)), MSG_ONE_T)
    case("UPDATE deleted_at → NULL: khôi phục binding Antigravity cũ của Mai", lambda: db.execute(
        "UPDATE engine_bindings SET deleted_at=NULL WHERE id=?", (eb_hist,)), MSG_ONE_T)
    db.execute("UPDATE engine_accounts SET consent_id=? WHERE id=?", (_cn(D, W), EN['mai_cc']))   # đồng ý Clause 6 hợp lệ ⇒ chỉ luật A còn chặn
    case("UPDATE engine_slug (phía tài khoản): EN-0004 Claude Code của Mai → antigravity", lambda: db.execute(
        "UPDATE engine_accounts SET engine_slug='antigravity' WHERE id=?", (EN['mai_cc'],)), MSG_ONE_T)
    db.execute("UPDATE engine_accounts SET engine_slug='claude-code' WHERE id=?", (ag_m2,))      # đối chứng: tài khoản không có binding sống ⇒ đổi loại được
    db.execute("UPDATE engine_accounts SET engine_slug='antigravity' WHERE id=?", (ag_m2,))
    # hoán vị thời gian: gỡ binding Antigravity của Lan TRƯỚC ⇒ gán tài khoản Antigravity mới được; khôi phục binding cũ SAU ⇒ chặn
    db.execute("UPDATE engine_bindings SET deleted_at=? WHERE id=?", (now(), EB['lan_ag']))
    ag_l2 = _acc(D, W, 'antigravity', 'Google — Lan 2', 'ga-auth-one-l2', 'logged_in', _cn(D, W))
    eb_l3 = rb(lan, ag_l2, 3)
    case("khôi phục binding Antigravity cũ của Lan sau khi đã gán cái mới", lambda: db.execute(
        "UPDATE engine_bindings SET deleted_at=NULL WHERE id=?", (EB['lan_ag'],)), MSG_ONE_T)
    # đổi tài khoản THỦ CÔNG của Role (A3.E › Đổi tài khoản / Đăng nhập lại): login lại trong PTY của container Mai, CÙNG binding EB-0003
    db.execute("UPDATE engine_accounts SET label='Google — Mai (mới)', account_hint='mai.new@afi.example', login_status='logged_in', login_checked_at=? "
               "WHERE id=?", (now(), EN['mai_ag']))
    audit(D, W, 'engine_account.relogin', entity_id=EN['mai_ag'], detail={'binding': 'EB-0003', 'to': 'Google — Mai (mới)'})
    relog = db.execute("SELECT b.display_id, a.display_id, a.label FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id "
                       "WHERE b.id=? AND b.deleted_at IS NULL", (EB['mai_ag'],)).fetchone()
    integ0 = [r for r in db.execute("SELECT check_key FROM v_integrity") if r[0] == 'consumer_engine_duplicate']
    db.execute("DROP TRIGGER IF EXISTS engine_bindings_one_per_engine_i")                               # lớp hai: script bảo trì lỗi
    rb(mai, ag_m2, 4)
    integ1 = db.execute("SELECT value FROM v_integrity WHERE check_key='consumer_engine_duplicate' AND workspace_id=?", (W,)).fetchone()
    ok = (all(x[1] for x in c) and eb_l2 and eb_hist and eb_l3 and lan_types == ['antigravity', 'claude-code']
          and relog == ('EB-0003', 'EN-0003', 'Google — Mai (mới)') and not integ0 and integ1 == (1,))
    report("ACC-one-per-engine", ok, f"{sum(x[1] for x in c)}/{len(c)} lối bị chặn: INSERT tài khoản thứ hai cùng loại (Role, Role binding tắt, AI Hệ thống); "
           f"UPDATE engine_account_id, role_id, consumer_kind, khôi phục binding, đổi engine_slug của tài khoản đang có binding; hoán vị: gỡ trước rồi gán mới "
           f"được, khôi phục cái cũ sau đó bị chặn; đối chứng: Lan thêm Claude Code được ({' + '.join(lan_types)} ⇒ có fallback), hàng xoá mềm không chiếm chỗ, "
           f"tài khoản không có binding đổi loại được; đổi tài khoản thủ công: {relog[0]} giữ nguyên, {relog[1]} đổi danh tính \"{relog[2]}\" + audit; "
           f"bỏ trigger ⇒ v_integrity consumer_engine_duplicate = {integ1[0] if integ1 else 0}")
    _show(c)

def t_v228_recovery():
    """CONTRACT-r8 §C + Q-I7 [CHỐT — Ryan 2026-10-16: "có, role vẫn chạy tiếp"]: Core agent sự cố ⇒ chế độ khắc phục — v_core_agent_status
    'recovery' + v_attention danger (nguồn overlay O4); DB chặn tạo Role mới + phiên AI Hệ thống (job giữ 'queued'), KHÔNG fallback (không đổi tài
    khoản, không đổi loại CLI); Role đang active VẪN CHẠY (phiên/heartbeat, container, probe, fallback giữa loại CLI của chính Role).
    JB-0417 (design) = lượt tự xét lỗi (phiên Consolidator, trigger reflection) gặp outage trên EN-0001."""
    D, X = seed()
    db, W, EN, CT, mai, lan = D.db, X['W'], X['EN'], X['CT'], X['mai'], X['lan']
    c, case = _cases(db)
    st = lambda: db.execute("SELECT mode, blocks_admin, reason, incident_reason, overlay_text FROM v_core_agent_status WHERE workspace_id=?", (W,)).fetchone()
    sess = lambda kind, trig, acc, ct=None, **kw: D.ins('sessions', workspace_id=W, agent_kind=kind, trigger=trig, engine_account_id=acc,
                                                       container_id=ct, started_at=now(), **kw)
    fo = lambda frm, to, r: D.ins('events', workspace_id=W, kind='engine.failover', severity='warn', subject='failover', failover_reason=r,
                                  detail_json=json.dumps({'from_account_id': frm, 'to_account_id': to}))
    st0 = st()
    job = D.ins('jobs', workspace_id=W, kind='consolidation', run_after=now(), dedupe_key=f'consolidate:{mai}',
                payload_json=json.dumps({'role_id': mai, 'system_agent': 'consolidator'}))                    # việc cần AI Hệ thống: chắt lọc trí nhớ Mai
    ss_run = sess('consolidator', 'consolidation', EN['sys_ag'], role_id=mai)                                # phiên mở TRƯỚC sự cố
    ss_sys = sess('system', 'baseline', EN['mai_ag'], CT['Mai'])                                             # phiên baseline đang chạy trong container Mai
    # JB-0417: lượt tự xét lỗi trên EN-0001 gặp lỗi 5xx ⇒ runtime ghi sự cố hãng
    db.execute("UPDATE engine_accounts SET outage_since=? WHERE id=?", (now(), EN['sys_ag']))
    st1 = st()
    nt = D.ins('notifications', workspace_id=W, user_id=X['ryan'], kind='core_agent_incident', severity='danger', title=st1[4],
               body='JB-0417 chờ; AI Hệ thống tạm dừng; Role vẫn chạy', target_entity_type='EN', target_id=EN['sys_ag'],
               target_display_id='EN-0001', dedupe_key='core:outage')                                          # báo owner ngay (O2 + Telegram)
    case("báo trùng sự cố Core agent (cùng dedupe_key, chưa xử lý)", lambda: D.ins('notifications', workspace_id=W, user_id=X['ryan'],
         kind='core_agent_incident', severity='danger', title='x', dedupe_key='core:outage'), 'UNIQUE')
    att1 = [r[0] for r in db.execute("SELECT what FROM v_attention WHERE workspace_id=? AND level='danger' AND what LIKE 'Core agent%'", (W,))]
    ob4 = _ob(D, W, 'OB-04')
    # --- DB chặn: AI Hệ thống tạm dừng, không fallback, không Role mới
    case("JB-0417: phiên Consolidator tự xét lỗi (Lan) trên EN-0001 đang outage", lambda: sess('consolidator', 'reflection', EN['sys_ag'], CT['sys'],
         role_id=lan), MSG_SA_T)
    case("Interviewer khai sinh", lambda: sess('interviewer', 'interview', EN['sys_ag'], CT['sys']), MSG_SA_T)
    case("Trainer đào tạo", lambda: sess('trainer', 'training', EN['sys_ag'], CT['sys']), MSG_SA_T)
    case("Judge chấm thử việc", lambda: sess('judge', 'trial', EN['sys_ag'], CT['sys']), MSG_SA_T)
    case("fallback tài khoản: Consolidator chạy trên EN-0004 (Claude Code của Mai)", lambda: sess('consolidator', 'consolidation', EN['mai_cc']), MSG_SA_T)
    case("fallback giữa chừng: UPDATE engine_account_id của phiên Consolidator đang chạy → EN-0004", lambda: db.execute(
        "UPDATE sessions SET engine_account_id=? WHERE id=?", (EN['mai_cc'], ss_run)), MSG_SA_T)
    case("đổi phiên baseline (system) đang chạy thành Consolidator", lambda: db.execute(
        "UPDATE sessions SET agent_kind='consolidator' WHERE id=?", (ss_sys,)), MSG_SA_T)
    case("Core agent fallback: events engine.failover EN-0001 → EN-0004 (outage)", lambda: fo(EN['sys_ag'], EN['mai_cc'], 'outage'), MSG_FO_CORE_T)
    cc = _acc(D, W, 'claude-code', 'Anthropic — Hệ thống tạm', 'ga-auth-rc-cc', 'logged_in')
    case("Core agent đổi loại CLI: thêm binding Hệ thống Claude Code", lambda: D.ins('engine_bindings', workspace_id=W, consumer_kind='system',
         engine_account_id=cc, priority=2), MSG_CORE_T)
    ag2 = _core_acc(D, W, 'Google — Hệ thống tạm', 'ga-auth-rc-ag', 'logged_in')
    case("Core agent đổi tài khoản tự động: thêm binding Hệ thống Antigravity thứ hai", lambda: D.ins('engine_bindings', workspace_id=W,
         consumer_kind='system', engine_account_id=ag2, priority=2), MSG_ONE_T)
    case("tạo Role mới", lambda: _role(D, W, 'Moi'), MSG_READY_T)
    # --- Q-I7 [CHỐT]: Role đang active VẪN CHẠY bằng CLI của chính nó
    q7 = []
    hb = sess('role', 'heartbeat', EN['mai_ag'], CT['Mai'], role_id=mai); q7.append(bool(hb))
    db.execute("UPDATE sessions SET status='ok', ended_at=? WHERE id=?", (now(), hb)); q7.append(True)
    q7.append(bool(fo(EN['mai_ag'], EN['mai_cc'], 'outage')))                                              # Role tự fallback agy → Claude Code
    q7.append(bool(sess('role', 'chat', EN['mai_cc'], CT['Mai'], role_id=mai)))                              # … và chạy tiếp trên Claude Code
    db.execute("UPDATE containers SET desired_state='running', observed_state='running' WHERE id=?", (CT['Mai'],)); q7.append(True)
    q7.append(bool(D.ins('probe_runs', workspace_id=W, engine_account_id=EN['mai_ag'], engine_slug='antigravity', container_id=CT['Mai'],
                         trigger='login_check', auth_mode='oauth', status='ok', started_at=now(), finished_at=now())))  # Role tự kiểm đăng nhập
    db.execute("UPDATE roles SET runtime_state='running', runtime_state_at=?, last_active_at=? WHERE id=?", (now(), now(), mai)); q7.append(True)
    mai_state = db.execute("""SELECT r.lifecycle_status, r.runtime_state, a.status FROM roles r JOIN assignments a ON a.role_id = r.id
                              AND a.deleted_at IS NULL WHERE r.id=?""", (mai,)).fetchone()          # Role đang làm việc: thẻ + vị trí active
    # --- việc cần AI Hệ thống xếp hàng chờ: job giữ 'queued', lùi lịch (backoff) được; phiên đang chạy lúc sự cố đóng được (không kẹt)
    db.execute("UPDATE jobs SET run_after=?, attempts=attempts+1, last_error=? WHERE id=?", (now(), 'Core agent outage — chờ khắc phục', job))
    jst = D.one("SELECT status FROM jobs WHERE id=?", job)
    db.execute("UPDATE sessions SET status='error', error_code='outage', ended_at=? WHERE id=?", (now(), ss_run))
    # --- khắc phục: hãng hồi phục (lần gọi kế tiếp thành công ⇒ outage_since NULL) ⇒ hết overlay; AI Hệ thống chạy lại; Role mới tạo được
    db.execute("UPDATE engine_accounts SET outage_since=NULL WHERE id=?", (EN['sys_ag'],))
    st2 = st()
    ss_ok = sess('consolidator', 'consolidation', EN['sys_ag'], CT['sys'], role_id=mai)
    db.execute("UPDATE jobs SET status='running', lease_owner='worker-1', lease_until=?, started_at=? WHERE id=?", (now(), now(), job))
    role_ok = _try_role(D, W, 'Moi')
    att2 = [r[0] for r in db.execute("SELECT what FROM v_attention WHERE workspace_id=? AND what LIKE 'Core agent%'", (W,))]
    O = 'Core agent gặp sự cố: sự cố từ hãng. Xử lý trước khi tiếp tục.'
    ok = (all(x[1] for x in c) and st0 == ('ok', 0, None, None, None) and st1 == ('recovery', 1, 'outage', 'outage', O) and att1 == [O]
          and nt and ob4[0] == 'err' and all(q7) and len(q7) == 7 and mai_state == ('carded', 'running', 'active') and jst == 'queued'
          and st2 == ('ok', 0, None, None, None) and ss_ok and role_ok and att2 == [])
    report("CORE-recovery", ok, f"Core agent outage (JB-0417) ⇒ v_core_agent_status {st1[0]} (blocks_admin {st1[1]}, incident {st1[3]}), v_attention danger "
           f"\"{att1[0] if att1 else '—'}\", OB-04 {ob4[0]}, notifications kind core_agent_incident (báo owner ngay, không trùng); {sum(x[1] for x in c)}/{len(c)} lối bị chặn: phiên AI Hệ thống (Consolidator tự xét lỗi, Interviewer, "
           f"Trainer, Judge), fallback sang tài khoản Role (INSERT + UPDATE giữa chừng), đổi phiên baseline thành tác tử hệ thống, failover của Core agent, "
           f"thêm binding Hệ thống khác loại / cùng loại, tạo Role mới; Q-I7 [CHỐT]: Mai (active) vẫn chạy — heartbeat ghi + đóng được, tự fallback agy → "
           f"Claude Code, phiên chat, container running, tự kiểm đăng nhập, runtime_state/last_active_at ghi được ({sum(q7)}/7; {'/'.join(mai_state)}); job chắt lọc trí nhớ giữ '{jst}' (lùi lịch được), phiên đang chạy lúc "
           f"sự cố đóng được; hãng hồi phục ⇒ mode {st2[0]}, Consolidator chạy lại, job lease được, Role mới tạo được, hết danger")
    _show(c)

# ================================================================== v2.2.9 — CONTRACT-r8b (audit CNS-2026-10-16-account-model-r8: CNS-098, 099, 103, 105, 106, 115)
# Mọi hành vi ở đây là [SUY LUẬN — Gen] hiện thực tối thiểu (CONTRACT-r8b "Nguồn gốc ràng buộc"), không phải lời Ryan; Q-R8a/b/c KHÔNG hiện thực.
RELOGIN_OVERLAY = 'Core agent đang đăng nhập lại. Hoàn tất đăng nhập trước khi tiếp tục.'
# v2.2.10 (CONTRACT-r8c §A/§C — chép nguyên văn)
TYPE_CHANGE_OVERLAY = 'Core agent đang đổi loại CLI. Hoàn tất đăng nhập trước khi tiếp tục.'
IDENTITY_OVERLAY = 'Tài khoản Core agent vừa đổi cần đồng ý điều khoản Antigravity. Đồng ý trước khi tiếp tục.'
INSTALLING_OVERLAY = 'Đang cài CLI. Hoàn tất trước khi tiếp tục.'                    # v2.3.2 (Gen quyết): đang cài CLI không phải sự cố
STATUS_COLS = "mode, blocks_admin, reason, reason_text, sub_reason, is_incident, auto_recheck, fix_target, owner_action, overlay_text, fix_hint"
def _status(D, ws):
    r = D.db.execute(f"SELECT {STATUS_COLS} FROM v_core_agent_status WHERE workspace_id=?", (ws,)).fetchone()
    return dict(zip([c.strip() for c in STATUS_COLS.split(',')], r))
def _nt_core(D, ws, tag):
    """Thử phát cảnh báo Core agent (chuông + Telegram) — True nếu DB cho ghi."""
    user = D.one("SELECT user_id FROM workspace_members WHERE workspace_id=? AND access_level='owner'", ws)
    return _try(lambda: D.ins('notifications', workspace_id=ws, user_id=user, kind='core_agent_incident', severity='danger',
                              title='Core agent', dedupe_key=f'core:{tag}:{now()}'))

def t_v229_lock_login():
    """CONTRACT-r8b §A (CNS-099; tái hiện probe W2 + P1–P4b của cortex vòng 8): mốc khoá loại Core agent = lần kiểm đăng nhập ĐẠT đầu tiên.
    Trước mốc (mode setup, chưa thể có Role): đăng nhập agy hỏng ⇒ "Chọn loại khác" — gỡ binding + tài khoản Core agent, đổi ST-0017 sang Claude Code,
    gắn + đăng nhập ⇒ khoá. Sau mốc như cũ. Ca âm: đang gắn tài khoản mà đổi ST-0017 (UPDATE / xoá mềm / xoá cứng / INSERT — settings_core_agent_bound_*),
    thêm loại khác khi chưa gỡ; lần kiểm không phải của tài khoản Core agent (quét khả năng, ngoài container AI Hệ thống, lần kiểm cũ xong muộn sau khi
    đã gỡ) không ghi mốc; sau mốc gỡ / tắt / vô hiệu / đổi loại bị chặn."""
    D, X = seed()
    db, W2, A = D.db, X['W2'], X['A']
    o2 = A[(W2, 'owner')]
    c, case = _cases(db)
    lock = lambda ws=W2: D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", ws)
    st17 = lambda v: db.execute("UPDATE settings SET value_json=?, updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine' "
                                "AND deleted_at IS NULL", (v, o2, W2))
    ct = D.ins('containers', workspace_id=W2, kind='system', container_name='ga-sys-zz99', desired_state='running', observed_state='running')
    def step2():                                                                       # Onboarding bước 2: MỘT transaction tick Clause 6 → EN → EB
        a = _core_acc(D, W2, 'Google — Hệ thống', 'ga-auth-zz99-ag')
        return a, D.ins('engine_bindings', workspace_id=W2, consumer_kind='system', engine_account_id=a, priority=1)
    ag, eb = D.txn(step2)
    s_bound, lock_bound = _status(D, W2), lock()
    case("đang gắn agy (chưa đạt): đổi ST-0017 → claude-code", lambda: st17('"claude-code"'), MSG_BOUND_T)
    case("đang gắn agy (chưa đạt): xoá mềm ST-0017", lambda: db.execute(
        "UPDATE settings SET deleted_at=?, updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine'", (now(), o2, W2)), MSG_BOUND_T)
    case("đang gắn agy (chưa đạt): xoá cứng ST-0017", lambda: db.execute(
        "DELETE FROM settings WHERE workspace_id=? AND key='system.core_agent_engine'", (W2,)), MSG_BOUND_T)
    cc0 = _acc(D, W2, 'claude-code', 'Anthropic — thử', 'ga-auth-zz99-cc0', 'logged_in')
    case("đang gắn agy (chưa đạt): thêm binding Claude Code khi chưa gỡ agy", lambda: D.ins('engine_bindings', workspace_id=W2,
         consumer_kind='system', engine_account_id=cc0, priority=2), MSG_CORE_T)
    # các lần kiểm KHÔNG ghi mốc: đăng nhập hỏng (failed), quét khả năng (install ok), kiểm ok ngoài container AI Hệ thống
    _probe(D, W2, ag, ct, status='failed')
    db.execute("UPDATE engine_accounts SET login_status='error' WHERE id=?", (ag,))
    D.ins('probe_runs', workspace_id=W2, engine_account_id=ag, engine_slug='antigravity', container_id=ct, trigger='install',
          auth_mode='oauth', status='ok', started_at=now(), finished_at=now())
    _probe(D, W2, ag, None)
    s_fail, lock_fail = _status(D, W2), lock()
    role_pre = _try_role(D, W2, 'Som')                                                 # trước mốc chưa thể có Role (Core agent chưa sẵn sàng)
    nt_pre = _nt_core(D, W2, 'pre')                                                    # setup: không phải sự cố ⇒ không phát
    run_ag = D.ins('probe_runs', workspace_id=W2, engine_account_id=ag, engine_slug='antigravity', container_id=ct, trigger='login_check',
                   auth_mode='oauth', status='running', started_at=now())             # một lần kiểm agy còn đang chạy
    # "Chọn loại khác" (probe P1/P2 vòng 8: trước đây BLOCKED) — một transaction: gỡ binding + tài khoản chưa khoá, đổi ST-0017
    def pick_other():
        db.execute("UPDATE engine_bindings SET deleted_at=? WHERE id=?", (now(), eb))
        db.execute("UPDATE engine_accounts SET deleted_at=? WHERE id=?", (now(), ag))
        st17('"claude-code"')
    swap_ok = _try(lambda: D.txn(pick_other))
    db.execute("UPDATE probe_runs SET status='ok', finished_at=? WHERE id=?", (now(), run_ag))   # lần kiểm agy cũ xong muộn, sau khi đã gỡ
    lock_stale = lock()
    st_cc = D.one("SELECT value_json FROM settings WHERE workspace_id=? AND key='system.core_agent_engine' AND deleted_at IS NULL", W2)
    s_none = _status(D, W2)
    ebc = D.ins('engine_bindings', workspace_id=W2, consumer_kind='system', engine_account_id=cc0, priority=1)   # Claude Code: không cần Clause 6
    db.execute("UPDATE engine_accounts SET login_status='logged_in' WHERE id=?", (cc0,))
    pcc = _probe(D, W2, cc0, ct, slug='claude-code')
    lock_cc, pcc_done, s_ok = lock(), D.one("SELECT finished_at FROM probe_runs WHERE id=?", pcc), _status(D, W2)
    role_post = _try_role(D, W2, 'Sau')
    # sau mốc: như cũ
    case("sau mốc: gỡ binding Core agent (Chọn loại khác)", lambda: db.execute("UPDATE engine_bindings SET deleted_at=? WHERE id=?", (now(), ebc)), MSG_LAST_T)
    case("sau mốc: tắt binding Core agent", lambda: db.execute("UPDATE engine_bindings SET is_enabled=0 WHERE id=?", (ebc,)), MSG_LAST_T)
    case("sau mốc: xoá cứng binding Core agent", lambda: db.execute("DELETE FROM engine_bindings WHERE id=?", (ebc,)), MSG_LAST_T)
    case("sau mốc: vô hiệu tài khoản Core agent", lambda: db.execute("UPDATE engine_accounts SET status='disabled' WHERE id=?", (cc0,)), MSG_LAST_T)
    case("sau mốc: xoá mềm tài khoản Core agent", lambda: db.execute("UPDATE engine_accounts SET deleted_at=? WHERE id=?", (now(), cc0)), MSG_LAST_T)
    case("sau mốc: đổi ST-0017 → antigravity", lambda: st17('"antigravity"'), MSG_RO_T)
    ag2 = _core_acc(D, W2, 'Google — Hệ thống 2', 'ga-auth-zz99-ag2', 'logged_in')
    case("sau mốc: gắn tài khoản Antigravity cho Hệ thống", lambda: D.ins('engine_bindings', workspace_id=W2, consumer_kind='system',
         engine_account_id=ag2, priority=2), MSG_CORE_T)
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (cc0,))   # sau mốc: hỏng ⇒ chế độ khắc phục (không còn setup)
    s_rec = _status(D, W2)
    # lối INSERT của bound: workspace chưa có hàng ST-0017 (mặc định antigravity), đang gắn agy, chưa đạt
    W3, A3 = _fresh_ws(D, 'll-three', 'WK03')
    D.ins('containers', workspace_id=W3, kind='system', container_name='ga-sys-wk03', desired_state='sleeping', observed_state='created')
    a3 = _core_acc(D, W3, 'Google — Hệ thống', 'ga-auth-wk03-0001')
    b3 = D.ins('engine_bindings', workspace_id=W3, consumer_kind='system', engine_account_id=a3, priority=1)
    case("đang gắn agy, thiếu hàng ST-0017: INSERT = claude-code", lambda: D.ins('settings', workspace_id=W3, key='system.core_agent_engine',
         value_json='"claude-code"', created_by=A3['owner']), MSG_BOUND_T)
    ins_same = _try(lambda: D.ins('settings', workspace_id=W3, key='system.core_agent_engine', value_json='"antigravity"', created_by=A3['owner']))
    del_pre = _try(lambda: db.execute("DELETE FROM engine_bindings WHERE id=?", (b3,)))    # trước mốc: xoá cứng binding cũng được
    E = 'Core agent gặp sự cố: đăng nhập hết hạn. Xử lý trước khi tiếp tục.'
    ok = (all(x[1] for x in c) and lock_bound is None
          and (s_bound['mode'], s_bound['blocks_admin'], s_bound['is_incident'], s_bound['overlay_text']) == ('setup', 0, 0, None)
          and lock_fail is None and (s_fail['mode'], s_fail['blocks_admin'], s_fail['reason'], s_fail['is_incident'], s_fail['auto_recheck'],
                                     s_fail['overlay_text']) == ('setup', 0, 'login_error', 0, 0, None)
          and s_fail['fix_target'] == 'a5.system' and not role_pre and not nt_pre and swap_ok and lock_stale is None
          and st_cc == '"claude-code"' and (s_none['mode'], s_none['reason']) == ('setup', 'no_account')
          and lock_cc == pcc_done and s_ok['mode'] == 'ok' and role_post
          and (s_rec['mode'], s_rec['blocks_admin'], s_rec['reason'], s_rec['is_incident'], s_rec['overlay_text']) == ('recovery', 1, 'login_expired', 1, E)
          and ins_same and del_pre)
    report("CORE-lock-login", ok, f"v2.2.9 §A: Onboarding bước 2 (CN + EN agy + EB một transaction) ⇒ mốc {lock_bound}, mode {s_bound['mode']}; đăng nhập hỏng "
           f"(failed / quét install / kiểm ngoài CT) ⇒ mốc {lock_fail}, mode {s_fail['mode']} ({s_fail['reason']}, không overlay, không cảnh báo: "
           f"{'chặn' if not nt_pre else 'PHÁT'}), Role {'bị chặn' if not role_pre else 'TẠO ĐƯỢC'}; \"Chọn loại khác\" (gỡ EB + EN agy, ST-0017 → claude-code, một "
           f"transaction) {'được' if swap_ok else 'BỊ CHẶN'}; lần kiểm agy cũ xong muộn không ghi mốc ({lock_stale}); Claude Code đăng nhập đạt ⇒ mốc = PB "
           f"{'đúng' if lock_cc == pcc_done else 'LỆCH'}, mode {s_ok['mode']}, Role tạo được; sau mốc hỏng ⇒ {s_rec['mode']}; {sum(x[1] for x in c)}/{len(c)} ca "
           f"bị chặn: đang gắn tài khoản mà đổi / xoá mềm / xoá cứng / INSERT ST-0017, thêm loại khác khi chưa gỡ, sau mốc gỡ / tắt / xoá cứng binding, "
           f"vô hiệu / xoá mềm tài khoản, đổi ST-0017, gắn loại khác; đối chứng: INSERT đúng loại được, xoá cứng binding trước mốc được")
    _show(c)

def t_v229_status_matrix():
    """CONTRACT-r8b §B (CNS-098, 103, 115): v_core_agent_status là MỘT nguồn cho bảng "lý do × hành vi" — với TỪNG lý do (17; v2.2.10: 18 — + type_change_in_progress,
    CONTRACT-r8c §A; chữ đổi danh tính riêng, §C) ở chế độ khắc phục:
    reason_text, auto_recheck, fix_target, owner_action, is_incident, overlay_text, fix_hint (= màn + owner_action), hàng v_attention (danger chỉ khi
    sự cố) và trigger notifications_core_incident_* (phát được ⇔ is_incident = 1 — so trigger với view). Đối chứng: setup (chưa khoá) và ok.
    v2.3.1 (CNS-137): + engine_not_installed (19 lý do; login_stalled kiểm riêng ở CORE-login-stalled vì cần đồng hồ giả).
    v2.3.2 (Gen quyết): + engine_not_installed lúc CLI ĐANG CÀI (sub_reason 'installing') — không sự cố, overlay riêng, A0 warn, không phát cảnh báo."""
    D, X = seed()
    db = D.db
    O = 'Đổi tài khoản / Đăng nhập lại'
    EXP = {'outage': (1, 'a5.system', 'Chờ hãng hồi phục hoặc bấm Kiểm tra lại', 1),
           'quota_exhausted': (1, 'a5.system', 'Chờ quota mở lại, bấm Kiểm tra lại, hoặc Đổi tài khoản / Đăng nhập lại', 1),
           'login_expired': (0, 'a5.system', O, 1), 'login_error': (0, 'a5.system', O, 1), 'login_unknown': (0, 'a5.system', O, 1),
           'login_check_missing': (0, 'a5.system', O, 1), 'login_check_failed': (0, 'a5.system', O, 1), 'login_check_partial': (0, 'a5.system', O, 1),
           'login_suspended': (0, 'a5.system', 'Đổi tài khoản / Đăng nhập lại (tài khoản khác) hoặc dùng API key', 1),
           'consent_missing': (0, 'a5.system', 'Đồng ý lại điều khoản Antigravity', 1),
           'consent_missing/identity_changed': (0, 'a5.system', 'Đồng ý lại điều khoản Antigravity', 0),
           'container_missing': (0, 'a5.container', 'Dựng lại container AI Hệ thống', 1),
           'relogin_in_progress': (0, 'a5.system', 'Hoàn tất đăng nhập trong terminal', 0),
           'type_change_in_progress': (0, 'a5.system', 'Hoàn tất đăng nhập trong terminal', 0),   # v2.2.10 (CONTRACT-r8c §A)
           'no_account': (0, 'a5.system', O, 1), 'wrong_type': (0, 'a5.system', O, 1), 'binding_disabled': (0, 'a5.system', O, 1),
           'account_disabled': (0, 'a5.system', O, 1), 'account_revoked': (0, 'a5.system', O, 1),
           'engine_not_installed': (0, 'a5.system', 'Cài lại CLI', 1),                         # v2.3.1 (CNS-137): CLI Core agent cài lỗi ⇒ sự cố
           'engine_not_installed/installing': (0, 'a5.system', 'Cài lại CLI', 0)}              # v2.3.2 (Gen quyết): đang cài ⇒ KHÔNG sự cố
    SCREEN = {'a5.system': 'A5 › AI Hệ thống', 'a5.container': 'A5 › Container (Hạ tầng)'}
    ws = {}
    def mk(key, i):
        w, _a, ct, a, b = _core_ws(D, f'mx-{i:02d}', f'WM{i:02d}', n=1)              # đã kiểm đăng nhập đạt ⇒ đã khoá
        ws[key] = (w, ct, a[0], b[0])
    for i, k in enumerate(EXP):
        mk(k, i)
    acc = lambda k: ws[k][2]
    # --- lý do đạt được bằng đường bình thường (guard còn nguyên)
    db.execute("UPDATE engine_accounts SET outage_since=? WHERE id=?", (now(), acc('outage')))
    db.execute("UPDATE engine_accounts SET quota_state='exhausted' WHERE id=?", (acc('quota_exhausted'),))
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state='failed', installed_version=NULL, failure_reason='network' WHERE workspace_id=? "
               "AND engine_slug='antigravity'", (ws['engine_not_installed'][0],))                  # v2.3.1: đường bình thường (app ghi theo ga-engine-install)
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state='installing', installed_version=NULL WHERE workspace_id=? "
               "AND engine_slug='antigravity'", (ws['engine_not_installed/installing'][0],))      # v2.3.2: owner bấm "Cài lại CLI" ⇒ đang tải
    for k, v in (('login_expired', 'expired'), ('login_error', 'error'), ('login_unknown', 'unknown'), ('login_suspended', 'suspended'),
                 ('relogin_in_progress', 'in_progress')):
        db.execute("UPDATE engine_accounts SET login_status=? WHERE id=?", (v, acc(k)))
    # v2.2.10 (CONTRACT-r8c §A): sự cố ⇒ owner đổi loại (lối INSERT — workspace chưa có hàng ST-0017) ⇒ tài khoản Claude Code mới đang đăng nhập
    w_tc = ws['type_change_in_progress'][0]
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (acc('type_change_in_progress'),))
    # v2.3.2: lối owner đổi loại khi sự cố là ĐIỀU KIỆN dựng ca này — bị chặn ⇒ ghi FAIL, không văng traceback (STD-11 1.11.0: đỏ chỉ qua dòng FAIL)
    tc_ok = _try(lambda: _type_change(D, w_tc, 'claude-code', D.owner_actor(w_tc), 'ga-auth-mx-tc', insert=True))
    _probe(D, ws['login_check_failed'][0], acc('login_check_failed'), ws['login_check_failed'][1], status='failed')
    _probe(D, ws['login_check_partial'][0], acc('login_check_partial'), ws['login_check_partial'][1], status='partial')
    db.execute("UPDATE consents SET revoked_at=? WHERE id=(SELECT consent_id FROM engine_accounts WHERE id=?)", (now(), acc('consent_missing')))
    k = 'consent_missing/identity_changed'
    db.execute("UPDATE engine_accounts SET account_hint='a***@gmail.com' WHERE id=?", (acc(k),))       # danh tính đầu tiên ⇒ gắn vào đồng ý
    db.execute("UPDATE engine_accounts SET account_hint='b***@gmail.com' WHERE id=?", (acc(k),))       # đăng nhập ra danh tính khác
    # --- lý do chỉ có ở lớp hai (guard chặn đường thường) — bỏ guard trong DB của test này rồi tạo trạng thái
    D.ctx.maint = 1
    db.execute("DELETE FROM probe_runs WHERE engine_account_id=?", (acc('login_check_missing'),))
    D.ctx.maint = 0
    for t in ('containers_system_last_u', 'engine_bindings_core_agent_last_u', 'engine_accounts_core_agent_last_u', 'engine_accounts_core_agent_u'):
        db.execute(f"DROP TRIGGER IF EXISTS {t}")
    db.execute("UPDATE containers SET deleted_at=? WHERE id=?", (now(), ws['container_missing'][1]))
    db.execute("UPDATE engine_bindings SET deleted_at=? WHERE id=?", (now(), ws['no_account'][3]))
    db.execute("UPDATE engine_bindings SET is_enabled=0 WHERE id=?", (ws['binding_disabled'][3],))
    db.execute("UPDATE engine_accounts SET status='disabled' WHERE id=?", (acc('account_disabled'),))
    db.execute("UPDATE engine_accounts SET status='revoked' WHERE id=?", (acc('account_revoked'),))
    db.execute("UPDATE engine_accounts SET engine_slug='claude-code', consent_id=NULL WHERE id=?", (acc('wrong_type'),))
    bad, seen = [], {}
    for k, (ar, ft, oa, inc) in EXP.items():
        w = ws[k][0]
        s = _status(D, w)
        reason = k.split('/')[0]
        # v2.2.10 (CONTRACT-r8c §C): chữ đổi danh tính KHÔNG còn bắt đầu bằng "Core agent" ⇒ lọc '%Core agent%' (v2.2.9: 'Core agent%')
        att = db.execute("SELECT level, what FROM v_attention WHERE workspace_id=? AND (what LIKE '%Core agent%' OR what LIKE 'Đang cài CLI%')",
                         (w,)).fetchall()                                    # v2.3.2: chữ đang cài CLI không có "Core agent"
        nt = _nt_core(D, w, k)
        # v2.2.10 (CONTRACT-r8c §A/§C): mỗi trạng thái không phải sự cố có chữ riêng — v2.2.9 kỳ vọng RELOGIN_OVERLAY cho cả đổi danh tính (chữ mượn)
        exp_over = (f"Core agent gặp sự cố: {s['reason_text']}. Xử lý trước khi tiếp tục." if inc else
                    IDENTITY_OVERLAY if k.endswith('identity_changed') else TYPE_CHANGE_OVERLAY if k == 'type_change_in_progress'
                    else INSTALLING_OVERLAY if k.endswith('/installing') else RELOGIN_OVERLAY)
        got = (s['mode'], s['blocks_admin'], s['reason'], s['auto_recheck'], s['fix_target'], s['owner_action'], s['is_incident'])
        want = ('recovery', 1, reason, ar, ft, oa, inc)
        checks = [got == want, s['reason_text'] is not None, s['overlay_text'] == exp_over,
                  s['fix_hint'] == f"{SCREEN[ft]}: {oa}", att == [('danger' if inc else 'warn', exp_over)], nt == bool(inc),
                  s['sub_reason'] == ('identity_changed' if k.endswith('identity_changed') else 'installing' if k.endswith('/installing') else None)]
        seen[k] = s
        if not all(checks):
            bad.append((k, got, s['overlay_text'], s['fix_hint'], att, nt, checks))
    # đối chứng: setup (chưa khoá, kể cả outage) ⇒ không overlay, không tự kiểm, không sự cố; ok ⇒ mọi cột hành vi rỗng
    Ws, _a, cts, as_, bs_ = _core_ws(D, 'mx-setup', 'WMSU', n=1, ready=False)
    db.execute("UPDATE engine_accounts SET login_status='logged_in', outage_since=? WHERE id=?", (now(), as_[0]))
    s_setup, nt_setup = _status(D, Ws), _nt_core(D, Ws, 'setup')
    s_ok, nt_ok = _status(D, X['W']), _nt_core(D, X['W'], 'ok')
    ok_setup = ((s_setup['mode'], s_setup['blocks_admin'], s_setup['reason'], s_setup['auto_recheck'], s_setup['is_incident'], s_setup['overlay_text'])
                == ('setup', 0, 'outage', 0, 0, None) and s_setup['fix_target'] == 'a5.system' and not nt_setup)
    ok_ok = (s_ok['mode'] == 'ok' and all(s_ok[c] in (None, 0) for c in ('reason', 'sub_reason', 'is_incident', 'auto_recheck', 'fix_target',
                                                                          'owner_action', 'overlay_text', 'fix_hint')) and not nt_ok)
    reasons = {k.split('/')[0] for k in EXP}
    ok = not bad and len(reasons) == 19 and ok_setup and ok_ok and tc_ok            # v2.3.1: + engine_not_installed (v2.2.10: 18, + type_change_in_progress; v2.2.9: 17)
    report("CORE-status-matrix", ok, f"{len(EXP) - len(bad)}/{len(EXP)} trạng thái khớp bảng §B ({len(reasons)} lý do + consent_missing do đổi danh tính + engine_not_installed lúc đang cài): "
           f"auto_recheck = 1 chỉ outage / quota_exhausted; fix_target a5.container chỉ container_missing (\"{seen['container_missing']['fix_hint']}\"); "
           f"is_incident = 0 chỉ relogin_in_progress, type_change_in_progress, đổi danh tính và đang cài CLI (overlay riêng từng trạng thái, A0 warn); fix_hint = màn + "
           f"owner_action ở mọi lý do; "
           f"trigger notifications_core_incident_* = view is_incident ở cả {len(EXP)}; đối chứng: setup (outage, chưa khoá) ⇒ không overlay / tự kiểm / cảnh "
           f"báo ({'đúng' if ok_setup else 'SAI'}); ok ⇒ mọi cột hành vi rỗng, không phát ({'đúng' if ok_ok else 'SAI'}); dựng ca đổi loại (owner đổi loại khi "
           f"sự cố) {'được' if tc_ok else 'BỊ CHẶN'}")
    for b in bad:
        print("      ✗", b)

def t_v229_relogin():
    """CONTRACT-r8b §B/§C (CNS-105): owner bấm "Đổi tài khoản / Đăng nhập lại" ⇒ reason relogin_in_progress — VẪN chặn Admin (Core agent chưa sẵn
    sàng: Role mới, phiên AI Hệ thống bị chặn) nhưng KHÔNG phải sự cố: is_incident 0, không core_agent_incident (INSERT lẫn UPDATE kind — chuông không
    tăng, không Telegram), A0 warn (không danger); đăng nhập xong cùng danh tính + kiểm đạt ⇒ ok, giữ EN-/EB-, audit engine_account.relogin.
    Đối chứng: sự cố thật (hết hạn) ⇒ phát được."""
    D, X = seed()
    db, W, EN, EB, CT = D.db, X['W'], X['EN'], X['EB'], X['CT']
    c, case = _cases(db)
    ryan = X['ryan']
    nt0 = D.one("SELECT count(*) FROM notifications WHERE workspace_id=? AND kind='core_agent_incident'", W)
    other = D.ins('notifications', workspace_id=W, user_id=ryan, kind='integrity', severity='warn', title='kiểm toàn vẹn')
    db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (EN['sys_ag'],))   # bấm "Đổi tài khoản / Đăng nhập lại"
    s1 = _status(D, W)
    att1 = db.execute("SELECT level, target, what FROM v_attention WHERE workspace_id=? AND what LIKE 'Core agent%'", (W,)).fetchall()
    case("đang đăng nhập lại: phát core_agent_incident (chuông + Telegram)", lambda: D.ins('notifications', workspace_id=W, user_id=ryan,
         kind='core_agent_incident', severity='danger', title='x', dedupe_key='core:relogin'), MSG_INCIDENT_T)
    case("đang đăng nhập lại: đổi một thông báo khác thành core_agent_incident (UPDATE kind)", lambda: db.execute(
        "UPDATE notifications SET kind='core_agent_incident' WHERE id=?", (other,)), MSG_INCIDENT_T)
    case("đang đăng nhập lại: tạo Role mới (Core agent chưa sẵn sàng)", lambda: _role(D, W, 'Moi'), MSG_READY_T)
    case("đang đăng nhập lại: phiên Consolidator trên EN-0001", lambda: D.ins('sessions', workspace_id=W, agent_kind='consolidator',
         trigger='consolidation', engine_account_id=EN['sys_ag'], container_id=CT['sys'], role_id=X['mai'], started_at=now()), MSG_SA_T)
    nt1 = D.one("SELECT count(*) FROM notifications WHERE workspace_id=? AND kind='core_agent_incident'", W)
    # PTY xong, CÙNG danh tính ⇒ kiểm đăng nhập đạt ⇒ ok
    _probe(D, W, EN['sys_ag'], CT['sys'])
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), EN['sys_ag']))
    audit(D, W, 'engine_account.relogin', entity_id=EN['sys_ag'], detail={'binding': 'EB-0001', 'identity': 'unchanged'})
    s2 = _status(D, W)
    keep = db.execute("SELECT b.display_id, a.display_id FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id "
                      "WHERE b.id=? AND b.deleted_at IS NULL", (EB['sys_ag'],)).fetchone()
    # đối chứng: sự cố thật ⇒ phát được (INSERT + UPDATE kind)
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (EN['sys_ag'],))
    s3 = _status(D, W)
    nt_ok = _nt_core(D, W, 'expired')
    upd_ok = _try(lambda: db.execute("UPDATE notifications SET kind='core_agent_incident' WHERE id=?", (other,)))
    # relogin ở Onboarding (chưa khoá) ⇒ setup, không overlay
    Wn, _a, ctn, an, bn = _core_ws(D, 'rl-setup', 'WRL1', n=1, ready=False)
    db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (an[0],))
    sn = _status(D, Wn)
    ok = (all(x[1] for x in c)
          and (s1['mode'], s1['blocks_admin'], s1['reason'], s1['reason_text'], s1['is_incident'], s1['auto_recheck'], s1['fix_target'],
               s1['owner_action'], s1['overlay_text']) == ('recovery', 1, 'relogin_in_progress', 'đang đăng nhập lại', 0, 0, 'a5.system',
                                                           'Hoàn tất đăng nhập trong terminal', RELOGIN_OVERLAY)
          and att1 == [('warn', 'EN-0001', RELOGIN_OVERLAY)] and nt1 == nt0 == 0 and s2['mode'] == 'ok' and keep == ('EB-0001', 'EN-0001')
          and (s3['reason'], s3['is_incident']) == ('login_expired', 1) and nt_ok and upd_ok
          and (sn['mode'], sn['blocks_admin'], sn['reason'], sn['is_incident'], sn['overlay_text']) == ('setup', 0, 'relogin_in_progress', 0, None))
    report("CORE-relogin", ok, f"bấm Đổi tài khoản / Đăng nhập lại ⇒ {s1['mode']}, blocks_admin {s1['blocks_admin']}, reason {s1['reason']} (\"{s1['reason_text']}\"), "
           f"is_incident {s1['is_incident']}, auto_recheck {s1['auto_recheck']}, overlay \"{s1['overlay_text']}\", A0 {att1[0][0] if att1 else '—'}; "
           f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn: core_agent_incident (INSERT, UPDATE kind), Role mới, phiên AI Hệ thống; chuông không tăng "
           f"({nt0} → {nt1}); xong cùng danh tính + kiểm đạt ⇒ {s2['mode']}, giữ {keep[0]} / {keep[1]}; đối chứng: hết hạn ⇒ is_incident {s3['is_incident']}, "
           f"phát được (INSERT {'được' if nt_ok else 'BỊ CHẶN'}, UPDATE kind {'được' if upd_ok else 'BỊ CHẶN'}); Onboarding (chưa khoá) ⇒ {sn['mode']}, không overlay")
    _show(c)

def t_v229_identity():
    """CONTRACT-r8b §C (CNS-105, probe P6 vòng 8): đăng nhập lại ra DANH TÍNH KHÁC (account_hint khác lúc đồng ý) ⇒ đồng ý cũ hết hiệu lực ⇒ Core agent
    consent_missing, lý do con identity_changed, is_incident 0 (không cảnh báo); không kiểm đăng nhập / probe được; không trỏ lại đồng ý cũ; tick lại ở
    A5 › AI Hệ thống ⇒ CN- mới gắn danh tính mới, giữ EN-/EB- ⇒ ok. Áp cả cho Role (A3.E — EN-0003 của Mai). Danh tính đầu tiên sau đồng ý (tick trước
    đăng nhập) KHÔNG phải đổi danh tính (gắn qua engine_accounts_consent_identity_ai/_au)."""
    D, X = seed()
    db, W, W2, EN, EB, CT = D.db, X['W'], X['W2'], X['EN'], X['EB'], X['CT']
    c, case = _cases(db)
    cstate = lambda acc: D.one("SELECT consent_state FROM v_engine_accounts WHERE engine_account_id=?", acc)
    cn_hint = lambda dsp: D.one("SELECT account_hint FROM consents WHERE workspace_id=? AND display_id=?", W, dsp)
    # danh tính đầu tiên sau Onboarding (PB-0001: output agy) ⇒ gắn vào CN-0001, vẫn ok
    db.execute("UPDATE engine_accounts SET account_hint='r***@gmail.com' WHERE id=?", (EN['sys_ag'],))
    s0, h0 = _status(D, W), cn_hint('CN-0001')
    # owner đổi tài khoản: đăng nhập lại (in_progress) → PTY ra danh tính KHÁC
    db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (EN['sys_ag'],))
    db.execute("UPDATE engine_accounts SET account_hint='o***@gmail.com', label='Google — Hệ thống (o***)' WHERE id=?", (EN['sys_ag'],))
    s1, ob5_1, cs1 = _status(D, W), _ob(D, W, 'OB-05'), cstate(EN['sys_ag'])
    # v2.2.10 (CONTRACT-r8c §C): chữ đổi danh tính bắt đầu bằng "Tài khoản Core agent…" ⇒ lọc '%Core agent%' (v2.2.9: 'Core agent%')
    att1 = db.execute("SELECT level FROM v_attention WHERE workspace_id=? AND what LIKE '%Core agent%'", (W,)).fetchall()
    case("đổi danh tính: kiểm đăng nhập (login_check) khi chưa đồng ý lại", lambda: _probe(D, W, EN['sys_ag'], CT['sys']), MSG_PB_CN_T)
    case("đổi danh tính: phát core_agent_incident", lambda: D.ins('notifications', workspace_id=W, user_id=X['ryan'], kind='core_agent_incident',
         severity='danger', title='x', dedupe_key='core:identity'), MSG_INCIDENT_T)
    case("đổi danh tính: trỏ lại đồng ý cũ CN-0001 (gắn r***)", lambda: db.execute(
        "UPDATE engine_accounts SET consent_id=(SELECT id FROM consents WHERE workspace_id=? AND display_id='CN-0001') WHERE id=?", (W, EN['sys_ag'])), MSG_CN_T)
    case("sửa danh tính của đồng ý cũ CN-0001 → o***", lambda: db.execute(
        "UPDATE consents SET account_hint='o***@gmail.com' WHERE workspace_id=? AND display_id='CN-0001'", (W,)), 'append-only/write-once')
    case("đổi danh tính: tạo Role mới", lambda: _role(D, W, 'Moi'), MSG_READY_T)
    # tick lại ở A5 › AI Hệ thống ⇒ CN- mới (gắn danh tính hiện tại) ⇒ kiểm đăng nhập ⇒ ok
    cn_new = _cn(D, W)
    db.execute("UPDATE engine_accounts SET consent_id=? WHERE id=?", (cn_new, EN['sys_ag']))
    cn_new_d = D.one("SELECT display_id || ' ' || account_hint FROM consents WHERE id=?", cn_new)
    _probe(D, W, EN['sys_ag'], CT['sys'])
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), EN['sys_ag']))
    audit(D, W, 'engine_account.relogin', entity_id=EN['sys_ag'], detail={'binding': 'EB-0001', 'identity': 'changed', 'consent': cn_new_d.split()[0]})
    s2, ob5_2 = _status(D, W), _ob(D, W, 'OB-05')
    keep = db.execute("SELECT b.display_id, a.display_id FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id "
                      "WHERE b.id=? AND b.deleted_at IS NULL", (EB['sys_ag'],)).fetchone()
    # đối chứng: rút đồng ý (không đổi danh tính) ⇒ consent_missing là SỰ CỐ (is_incident 1, lý do con NULL)
    Wr, _a, ctr, ar, br = _core_ws(D, 'id-rev', 'WID1', n=1)
    db.execute("UPDATE consents SET revoked_at=? WHERE id=(SELECT consent_id FROM engine_accounts WHERE id=?)", (now(), ar[0]))
    sr = _status(D, Wr)
    # Role (A3.E): EN-0003 của Mai (CN-0002) — danh tính đầu tiên rồi đổi ⇒ đồng ý hết hiệu lực, probe trong container Mai bị chặn; tick lại ⇒ được
    db.execute("UPDATE engine_accounts SET account_hint='m***@gmail.com' WHERE id=?", (EN['mai_ag'],))
    cs_m0 = cstate(EN['mai_ag'])
    db.execute("UPDATE engine_accounts SET account_hint='n***@gmail.com', label='Google — Mai (n***)' WHERE id=?", (EN['mai_ag'],))
    cs_m1 = cstate(EN['mai_ag'])
    mai_pb = lambda: D.ins('probe_runs', workspace_id=W, engine_account_id=EN['mai_ag'], engine_slug='antigravity', container_id=CT['Mai'],
                           trigger='login_check', auth_mode='oauth', status='ok', started_at=now(), finished_at=now())
    case("Role Mai đổi danh tính: kiểm đăng nhập trong container Mai khi chưa đồng ý lại", mai_pb, MSG_PB_CN_T)
    db.execute("UPDATE engine_accounts SET consent_id=? WHERE id=?", (_cn(D, W), EN['mai_ag']))
    cs_m2, mai_ok = cstate(EN['mai_ag']), _try(mai_pb)
    keep_m = D.one("SELECT display_id FROM engine_bindings WHERE engine_account_id=? AND deleted_at IS NULL AND role_id=?", EN['mai_ag'], X['mai'])
    # lối gắn ở INSERT (engine_accounts_consent_identity_ai): tài khoản tạo ra đã có danh tính
    ct2 = D.ins('containers', workspace_id=W2, kind='system', container_name='ga-sys-zz99', desired_state='sleeping', observed_state='created')
    a2 = _core_acc(D, W2, 'Google — Hệ thống', 'ga-auth-zz99-id', 'logged_in', account_hint='v***@gmail.com')
    h_ins = D.one("SELECT c.account_hint FROM consents c JOIN engine_accounts a ON a.consent_id = c.id WHERE a.id=?", a2)
    db.execute("UPDATE engine_accounts SET account_hint='w***@gmail.com' WHERE id=?", (a2,))
    cs_ins = cstate(a2)
    ok = (all(x[1] for x in c) and s0['mode'] == 'ok' and h0 == 'r***@gmail.com'
          and (s1['mode'], s1['blocks_admin'], s1['reason'], s1['sub_reason'], s1['is_incident'], s1['auto_recheck'], s1['fix_target'],
               s1['owner_action'], s1['overlay_text']) == ('recovery', 1, 'consent_missing', 'identity_changed', 0, 0, 'a5.system',
                                                           'Đồng ý lại điều khoản Antigravity', IDENTITY_OVERLAY)   # v2.2.10 §C (v2.2.9: RELOGIN_OVERLAY mượn)
          and cs1 == 'identity_changed' and ob5_1[0] == 'err' and att1 == [('warn',)]
          and cn_new_d == 'CN-0004 o***@gmail.com' and s2['mode'] == 'ok' and ob5_2[0] == 'ok' and keep == ('EB-0001', 'EN-0001')
          and cn_hint('CN-0001') == 'r***@gmail.com'
          and (sr['reason'], sr['sub_reason'], sr['is_incident']) == ('consent_missing', None, 1)
          and (cs_m0, cs_m1, cs_m2) == ('ok', 'identity_changed', 'ok') and mai_ok and keep_m == 'EB-0003'
          and h_ins == 'v***@gmail.com' and cs_ins == 'identity_changed')
    report("CORE-identity", ok, f"danh tính đầu tiên r*** gắn vào CN-0001 (mode {s0['mode']}); đổi tài khoản ra o*** ⇒ {s1['reason']} / {s1['sub_reason']}, "
           f"is_incident {s1['is_incident']}, overlay \"{s1['overlay_text']}\", owner_action \"{s1['owner_action']}\", OB-05 {ob5_1[0]}, A0 {att1[0][0] if att1 else '—'}; "
           f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn: kiểm đăng nhập, core_agent_incident, trỏ lại CN-0001, sửa danh tính CN-0001, Role mới, probe Role Mai "
           f"khi chưa đồng ý lại; tick lại ⇒ {cn_new_d} ⇒ {s2['mode']}, OB-05 {ob5_2[0]}, giữ {keep[0]} / {keep[1]}; đối chứng rút đồng ý ⇒ is_incident {sr['is_incident']}; "
           f"Role Mai (A3.E): {cs_m0} → {cs_m1} → tick lại {cs_m2}, giữ {keep_m}; gắn ở INSERT (v***) rồi đổi ⇒ {cs_ins}")
    _show(c)

# ================================================================== v2.2.10 — CONTRACT-r8c (Ryan 2026-10-16: "1,2,3 ok" — Q-R8a/b/c [CHỐT]; cách làm [ĐỀ XUẤT — Gen vòng 8c])
TC_COLS = "engine_account_id, engine_binding_id, account_display_id, binding_display_id, engine_slug, is_enabled, is_primary, not_ready_reason"
def _type_change(D, ws, to, by, vol, label=None, cn=None, prio=2, insert=False):
    """Q-R8a — MỘT thao tác của owner (một transaction): [tick Clause 6 ⇒ cn, nếu đích đòi đồng ý] → ST-0017 = loại đích (binding Hệ thống cũ khác loại TẮT
    trong cùng câu lệnh — settings_core_agent_type_change_*) → tài khoản mới của loại đích (login_status in_progress: PTY đăng nhập mở) + binding Hệ thống
    mới (ID cấp tiếp, lớn hơn max cùng prefix) → events + audit core_agent.type_changed (from, to, actor owner, lý do sự cố)."""
    db = D.db
    def op():
        frm, why = db.execute("SELECT core_slug, reason FROM v_core_agent_status WHERE workspace_id=?", (ws,)).fetchone()
        old = db.execute("SELECT engine_account_id, engine_binding_id FROM v_core_agent_accounts WHERE workspace_id=? AND is_primary=1", (ws,)).fetchone()
        t = now()
        if insert:
            D.ins('settings', workspace_id=ws, key='system.core_agent_engine', value_json=json.dumps(to), created_by=by, created_at=t)
        else:
            db.execute("UPDATE settings SET value_json=?, updated_by=?, updated_at=? WHERE workspace_id=? AND key='system.core_agent_engine' "
                       "AND deleted_at IS NULL", (json.dumps(to), by, t, ws))
        en = D.ins('engine_accounts', workspace_id=ws, engine_slug=to, label=label or f'{to} — Hệ thống', auth_method='subscription',
                   auth_volume=vol, login_status='in_progress', consent_id=cn, created_by=by, created_at=t)
        eb = D.ins('engine_bindings', workspace_id=ws, consumer_kind='system', engine_account_id=en, priority=prio, created_by=by, created_at=t)
        det = {'from': frm, 'to': to, 'reason': why, 'from_account_id': old[0] if old else None, 'to_account_id': en,
               'from_binding_id': old[1] if old else None, 'to_binding_id': eb}
        D.ins('events', workspace_id=ws, kind='core_agent.type_changed', severity='warn', subject=f'{frm}→{to} {why}', entity_type='EN',
              entity_id=en, detail_json=json.dumps(det), created_by=by)
        audit(D, ws, 'core_agent.type_changed', entity_id=en, detail=det, actor=by, reason=why)
        return en, eb
    return D.txn(op)

def _cc_core_ws(D, tag, code):
    """Workspace mới chọn Core agent = Claude Code ở Onboarding (ST-0017 INSERT trước khi gắn tài khoản), đã kiểm đăng nhập đạt ⇒ đã khoá."""
    ws, A = _fresh_ws(D, tag, code)
    D.ins('settings', workspace_id=ws, key='system.core_agent_engine', value_json='"claude-code"', created_by=A['owner'])
    ct = D.ins('containers', workspace_id=ws, kind='system', container_name=f'ga-sys-{code.lower()}', desired_state='sleeping', observed_state='created')
    a = _acc(D, ws, 'claude-code', 'Anthropic — Hệ thống', f'ga-auth-{code.lower()}-cc', 'logged_in')
    b = D.ins('engine_bindings', workspace_id=ws, consumer_kind='system', engine_account_id=a, priority=1)
    _probe(D, ws, a, ct, slug='claude-code')
    return ws, A, ct, a, b

def _admin_actor(D, ws, key='tom', n=2):
    """Thành viên admin (đang hoạt động) của ws — qua OWNER_ADMIN nhưng KHÔNG phải owner (ca âm 'chỉ owner')."""
    db = D.db
    u = uid('user:' + key)
    db.execute("""INSERT INTO users(id,display_id,display_seq,username,display_name,password_hash,must_change_password,password_changed_at)
                  VALUES(?,?,?,?,?,?,0,?)""", (u, f'US-{n:04d}', n, key, key.title(), 'argon2id$x', now()))
    a = uid(f'actor:{ws}:{key}')
    db.execute("INSERT INTO actors(id,workspace_id,kind,user_id,label) VALUES(?,?,?,?,?)", (a, ws, 'user', u, key.title()))
    db.execute("INSERT INTO workspace_members(workspace_id,user_id,access_level) VALUES(?,?,?)", (ws, u, 'admin'))
    return a

def t_v2210_type_change():
    """CONTRACT-r8c §A — Q-R8a [CHỐT — Ryan 2026-10-16: "1,2,3 ok" (Q-R8a)]: Core agent đang SỰ CỐ (Google khoá tài khoản Antigravity EN-0001) ⇒ owner TỰ TAY
    đổi sang Claude Code ngay trên màn chặn: một thao tác (ST-0017 → claude-code, EB-0001 tắt không xoá, EN-0001 giữ, EN/EB mới cấp tiếp, events + audit
    core_agent.type_changed); trong lúc đăng nhập: type_change_in_progress (không sự cố, A0 warn, overlay riêng, mốc khoá CŨ giữ ⇒ vẫn recovery); kiểm đạt ⇒
    ok + mốc khoá lại = lần đạt đầu tiên của tài khoản mới. Sau đó: lúc ok vẫn chỉ đọc; Core agent mới sự cố ⇒ owner đổi VỀ Antigravity = BẬT LẠI EB-0001
    (Gen chốt vòng 8c: một tài khoản mỗi loại tính cả binding tắt — tạo agy thứ hai bị chặn), mốc không lùi."""
    D, X = seed()
    db, W, A, EN, EB, CT = D.db, X['W'], X['A'], X['EN'], X['EB'], X['CT']
    own = A[(W, 'owner')]
    c, case = _cases(db)
    lock = lambda: D.one("SELECT core_agent_locked_at FROM workspaces WHERE id=?", W)
    lock0 = lock()
    max_en = D.one("SELECT max(display_seq) FROM engine_accounts WHERE workspace_id=?", W)
    max_eb = D.one("SELECT max(display_seq) FROM engine_bindings WHERE workspace_id=?", W)
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (EN['sys_ag'],))          # Google khoá tài khoản (sự cố)
    s0 = _status(D, W)
    cc, ebc = _type_change(D, W, 'claude-code', own, 'ga-auth-tc-cc', label='Anthropic — Hệ thống')
    s1, lock1 = _status(D, W), lock()
    ids = db.execute("SELECT a.display_id, b.display_id, a.display_seq, b.display_seq FROM engine_accounts a JOIN engine_bindings b "
                     "ON b.engine_account_id = a.id WHERE a.id=?", (cc,)).fetchone()
    old = db.execute("SELECT b.is_enabled, b.deleted_at, a.status, a.deleted_at FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id "
                     "WHERE b.id=?", (EB['sys_ag'],)).fetchone()
    st17 = D.one("SELECT value_json FROM settings WHERE workspace_id=? AND key='system.core_agent_engine' AND deleted_at IS NULL", W)
    rows1 = db.execute(f"SELECT binding_display_id, is_enabled, is_primary, not_ready_reason FROM v_core_agent_accounts WHERE workspace_id=? "
                       "ORDER BY binding_display_id", (W,)).fetchall()
    att1 = db.execute("SELECT level, what FROM v_attention WHERE workspace_id=? AND what LIKE '%Core agent%'", (W,)).fetchall()
    ev = db.execute("SELECT json_extract(detail_json,'$.from'), json_extract(detail_json,'$.to'), json_extract(detail_json,'$.reason'), created_by "
                    "FROM events WHERE workspace_id=? AND kind='core_agent.type_changed'", (W,)).fetchall()
    au = D.one("SELECT count(*) FROM audit_log WHERE workspace_id=? AND action='core_agent.type_changed' AND actor_id=?", W, own)
    integ1 = [r for r in db.execute("SELECT check_key FROM v_integrity WHERE workspace_id=?", (W,)) if r[0].startswith('core_agent')]
    sa1 = {r[0] for r in db.execute("SELECT account_display_id FROM v_system_agents WHERE workspace_id=?", (W,))}
    # --- trong lúc đăng nhập tài khoản mới: vẫn chặn (chưa sẵn sàng) nhưng không phải sự cố
    case("đang đổi loại: phát core_agent_incident (chuông + Telegram)", lambda: D.ins('notifications', workspace_id=W, user_id=X['ryan'],
         kind='core_agent_incident', severity='danger', title='x', dedupe_key='core:tc'), MSG_INCIDENT_T)
    case("đang đổi loại: tạo Role mới", lambda: _role(D, W, 'Moi'), MSG_READY_T)
    case("đang đổi loại: phiên Interviewer trên tài khoản mới", lambda: D.ins('sessions', workspace_id=W, agent_kind='interviewer',
         trigger='interview', engine_account_id=cc, container_id=CT['sys'], started_at=now()), MSG_SA_T)
    case("đang đổi loại (không phải sự cố): đổi loại lần nữa → antigravity", lambda: db.execute(
        "UPDATE settings SET value_json='\"antigravity\"', updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine'", (own, W)), MSG_RO_T)
    cc2 = _acc(D, W, 'claude-code', 'Anthropic — Hệ thống 2', 'ga-auth-tc-cc2', 'logged_in')
    case("thêm tài khoản Claude Code thứ hai cho Hệ thống", lambda: D.ins('engine_bindings', workspace_id=W, consumer_kind='system',
         engine_account_id=cc2, priority=3), MSG_ONE_T)
    case("bật lại EB-0001 (Antigravity) khi Core agent = Claude Code", lambda: db.execute(
        "UPDATE engine_bindings SET is_enabled=1 WHERE id=?", (EB['sys_ag'],)), MSG_CORE_T)
    case("sửa mốc khoá trong lúc đổi loại (đặt tuỳ ý)", lambda: db.execute(
        "UPDATE workspaces SET core_agent_locked_at='2026-10-16T09:00:00.000Z' WHERE id=?", (W,)), MSG_LOCK_T)
    # --- đăng nhập xong trong PTY ⇒ kiểm đạt ⇒ ok, mốc khoá lại = lần đạt đầu tiên của EN mới
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), cc))
    pb = _probe(D, W, cc, CT['sys'], slug='claude-code')
    pb_done = D.one("SELECT finished_at FROM probe_runs WHERE id=?", pb)
    s2, lock2 = _status(D, W), lock()
    _probe(D, W, cc, CT['sys'], slug='claude-code')                                                    # lần đạt thứ hai: không ghi đè
    lock2b = lock()
    role_ok = _try_role(D, W, 'Moi')
    # v2.2.11 (CONTRACT-r8d §A, CNS-117) — SỬA KỲ VỌNG: v2.2.10 cho Consolidator chạy NGAY trên Claude Code với model gemini (chính là lỗi CNS-117). Nay đổi loại
    # ⇒ 4 tác tử 'stale' ⇒ phiên bị chặn tới khi app quét khả năng + áp model mặc định của Claude Code ⇒ chạy được
    sa_consol = lambda: D.ins('sessions', workspace_id=W, agent_kind='consolidator', trigger='consolidation', engine_account_id=cc,
                              container_id=CT['sys'], role_id=X['mai'], started_at=now())
    case("sau khi đổi loại, trước khi áp model của Claude Code: phiên Consolidator (tác tử stale)", sa_consol, MSG_SA_VALID_T)
    _scan(D, W, cc, CT['sys'], 'claude-code', ('opus', 'sonnet', 'haiku'), ('low', 'medium', 'high'))
    _apply_sa_defaults(D, W, cc, 'claude-code', own)
    sa_ok = _try(sa_consol)
    sa2 = {r[0] for r in db.execute("SELECT account_display_id FROM v_system_agents WHERE workspace_id=?", (W,))}
    case("lúc ok: đổi loại → antigravity (chặn như cũ)", lambda: db.execute(
        "UPDATE settings SET value_json='\"antigravity\"', updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine'", (own, W)), MSG_RO_T)
    case("lúc ok: tắt binding Claude Code (Core agent cuối cùng)", lambda: db.execute(
        "UPDATE engine_bindings SET is_enabled=0 WHERE id=?", (ebc,)), MSG_LAST_T)
    # --- Core agent mới sự cố ⇒ owner đổi VỀ Antigravity: bật lại EB-0001 (không tạo tài khoản agy thứ hai), tick Clause 6 mới
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (cc,))
    s3 = _status(D, W)
    # v2.2.11 (CONTRACT-r8d §B) — SỬA KỲ VỌNG: đồng ý cũ CỦA CHÍNH EN-0001 (CN-0001) còn hợp lệ ⇒ về Antigravity KHÔNG cần tick lại (test CORE-type-change-back);
    # v2.2.10 chặn cả khi đồng ý cũ còn hợp lệ (luật cũ). Ca âm giữ ở nhánh "đồng ý cũ hết hiệu lực": rút CN-0001 trước ⇒ phải tick Clause 6 (CN- mới)
    db.execute("UPDATE consents SET revoked_at=? WHERE id=?", (now(), X['CN']['sys_ag']))
    case("về Antigravity khi đồng ý cũ của EN-0001 đã rút mà chưa tick đồng ý mới", lambda: db.execute(
        "UPDATE settings SET value_json='\"antigravity\"', updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine'", (own, W)), MSG_TC_CONSENT_T)
    cn_back = _cn(D, W)                                                                                # tick Clause 6 (CN- mới)
    def back():
        db.execute("UPDATE settings SET value_json='\"antigravity\"', updated_by=?, updated_at=? WHERE workspace_id=? "
                   "AND key='system.core_agent_engine'", (own, now(), W))                               # EB Claude Code tắt cùng câu lệnh
        db.execute("UPDATE engine_bindings SET is_enabled=1, updated_by=?, updated_at=? WHERE id=?", (own, now(), EB['sys_ag']))
        db.execute("UPDATE engine_accounts SET consent_id=?, login_status='in_progress' WHERE id=?", (cn_back, EN['sys_ag']))
        D.ins('events', workspace_id=W, kind='core_agent.type_changed', severity='warn', subject='claude-code→antigravity login_expired',
              detail_json=json.dumps({'from': 'claude-code', 'to': 'antigravity', 'reason': 'login_expired', 'from_account_id': cc,
                                      'to_account_id': EN['sys_ag'], 'to_binding_id': EB['sys_ag'], 'reenabled': True}), created_by=own)
        audit(D, W, 'core_agent.type_changed', entity_id=EN['sys_ag'], detail={'from': 'claude-code', 'to': 'antigravity', 'reenabled': 'EB-0001'},
              reason='login_expired')
    back_ok = _try(lambda: D.txn(back))
    ag2 = _acc(D, W, 'antigravity', 'Google — Hệ thống 2', 'ga-auth-tc-ag2', 'logged_in', _cn(D, W))
    case("tạo tài khoản Antigravity thứ hai cho Hệ thống (EB-0001 đang có)", lambda: D.ins('engine_bindings', workspace_id=W,
         consumer_kind='system', engine_account_id=ag2, priority=3), MSG_ONE_T)
    s4 = _status(D, W)
    first_ag = D.one("SELECT finished_at FROM probe_runs WHERE workspace_id=? AND display_id='PB-0001'", W)
    case("lùi mốc về lần đạt đầu tiên của EN-0001 (PB-0001)", lambda: db.execute(
        "UPDATE workspaces SET core_agent_locked_at=? WHERE id=?", (first_ag, W)), MSG_LOCK_T)
    _probe(D, W, EN['sys_ag'], CT['sys'])
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), EN['sys_ag']))
    s5, lock5 = _status(D, W), lock()
    rows5 = db.execute("SELECT binding_display_id, is_enabled, is_primary FROM v_core_agent_accounts WHERE workspace_id=? ORDER BY binding_display_id",
                       (W,)).fetchall()
    n_ev = D.one("SELECT count(*) FROM events WHERE workspace_id=? AND kind='core_agent.type_changed'", W)
    TC = ('recovery', 1, 'type_change_in_progress', 'đang đổi loại Core agent', None, 0, 0, 'a5.system', 'Hoàn tất đăng nhập trong terminal',
          TYPE_CHANGE_OVERLAY, 'A5 › AI Hệ thống: Hoàn tất đăng nhập trong terminal')
    en_new, eb_new = f'EN-{max_en + 1:04d}', f'EB-{max_eb + 1:04d}'
    ok = (all(x[1] for x in c)
          and (s0['mode'], s0['reason'], s0['is_incident']) == ('recovery', 'login_suspended', 1)
          and tuple(s1[k] for k in STATUS_COLS.replace(' ', '').split(',')) == TC
          and lock1 == lock0 and ids[:2] == (en_new, eb_new) and old == (0, None, 'active', None) and st17 == '"claude-code"'
          and rows1 == [('EB-0001', 0, 0, 'wrong_type'), (eb_new, 1, 1, 'type_change_in_progress')]
          and att1 == [('warn', TYPE_CHANGE_OVERLAY)] and ev == [('antigravity', 'claude-code', 'login_suspended', own)] and au == 1
          and not integ1 and sa1 == {en_new}
          and s2['mode'] == 'ok' and s2['overlay_text'] is None and lock2 == pb_done and lock2 > lock0 and lock2b == lock2
          and role_ok and sa_ok and sa2 == {en_new}
          and (s3['reason'], s3['is_incident']) == ('login_expired', 1) and back_ok
          and (s4['mode'], s4['reason'], s4['is_incident']) == ('recovery', 'relogin_in_progress', 0)
          and s5['mode'] == 'ok' and lock5 == lock2 and rows5 == [('EB-0001', 1, 1), (eb_new, 0, 0)] and n_ev == 2)
    report("CORE-type-change", ok, f"Q-R8a [CHỐT]: EN-0001 bị khoá ⇒ {s0['mode']} / {s0['reason']} (is_incident {s0['is_incident']}); owner đổi sang Claude Code "
           f"một thao tác ⇒ ST-0017 {st17}, EB-0001 tắt (is_enabled {old[0]}, không xoá), EN-0001 giữ ({old[2]}), {ids[0]} / {ids[1]} cấp tiếp (> max), "
           f"events + audit core_agent.type_changed {ev[0][:3] if ev else '—'} actor owner; đang đăng nhập ⇒ {s1['reason']} \"{s1['reason_text']}\", "
           f"is_incident {s1['is_incident']}, overlay \"{s1['overlay_text']}\", A0 {att1[0][0] if att1 else '—'}, mốc giữ ({'đúng' if lock1 == lock0 else 'ĐỔI'}) "
           f"⇒ vẫn {s1['mode']}; {sum(x[1] for x in c)}/{len(c)} ca bị chặn: cảnh báo, Role mới, phiên AI Hệ thống, đổi lần nữa khi không sự cố, Claude Code thứ hai, "
           f"bật lại EB-0001 khác loại, sửa mốc tuỳ ý, Consolidator khi tác tử còn stale (v2.2.11), lúc ok đổi loại / tắt Core agent cuối cùng, về Antigravity "
           f"khi đồng ý cũ đã rút mà chưa tick mới (v2.2.11), agy thứ hai, lùi mốc; "
           f"kiểm đạt ⇒ {s2['mode']}, mốc khoá lại = PB mới ({'đúng' if lock2 == pb_done else 'LỆCH'}), lần đạt thứ hai không ghi đè, Role mới; quét + áp model "
           f"Claude Code ⇒ Consolidator chạy trên {sorted(sa2)}; Claude Code hết hạn ⇒ về Antigravity = bật lại EB-0001 + CN- mới ⇒ {s4['reason']} ⇒ {s5['mode']}, mốc giữ "
           f"(một lần cho mỗi tài khoản), {n_ev} sự kiện đổi loại")
    _show(c)

def t_v2210_type_change_guards():
    """CONTRACT-r8c §A — ca âm mà CHỈ guard đổi loại chặn (STD-11): lúc ok / đang đăng nhập lại (không sự cố) ⇒ MSG_CORE_RO; admin (qua OWNER_ADMIN, không
    phải owner) ⇒ MSG_TC_OWNER; loại đích không ready / không core_capable ⇒ CORE_VALID; đích Antigravity thiếu đồng ý MỚI (không có / đã rút / đồng ý cũ đã
    gắn danh tính / đồng ý đang được tài khoản khác dùng) ⇒ MSG_TC_CONSENT; sự kiện core_agent.type_changed sai actor / sai đích / thiếu trường. Đối chứng:
    cùng điều kiện mà đúng ⇒ được (lối UPDATE và INSERT). Gen ghi chú 3: tài khoản mới đăng nhập hỏng ⇒ lý do theo lần kiểm / login (sự cố) ⇒ đổi lại được."""
    D, X = seed()
    db, W, A, EN = D.db, X['W'], X['A'], X['EN']
    own = A[(W, 'owner')]
    c, case = _cases(db)
    upd = lambda ws, v, by: (lambda: db.execute("UPDATE settings SET value_json=?, updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine' "
                                                "AND deleted_at IS NULL", (v, by, ws)))
    # (1) lúc ok ⇒ chặn (chỉ đọc) — owner, đích hợp lệ, không cần đồng ý: chỉ "is_incident" khác
    case("lúc ok: owner đổi → claude-code", upd(W, '"claude-code"', own), MSG_RO_T)
    db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (EN['sys_ag'],))      # đang đăng nhập lại (recovery, không sự cố)
    s_rl = _status(D, W)
    case("đang đăng nhập lại (recovery, is_incident 0): owner đổi → claude-code", upd(W, '"claude-code"', own), MSG_RO_T)
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (EN['sys_ag'],))         # sự cố thật
    # (2) không phải owner
    adm = _admin_actor(D, W)
    case("sự cố: admin (không phải owner) đổi → claude-code", upd(W, '"claude-code"', adm), MSG_TC_OWNER_T)
    # (3) loại đích không hợp lệ
    case("sự cố: owner đổi → openclaw (core_capable 1, coming_soon)", upd(W, '"openclaw"', own), 'phải là slug')
    case("sự cố: owner đổi → codex (core_capable 0)", upd(W, '"codex"', own), 'phải là slug')
    # (4) đích Antigravity thiếu đồng ý MỚI — workspace Core agent = Claude Code đang sự cố
    Wc, Ac, ctc, ac, bc = _cc_core_ws(D, 'tc-cc', 'WTC1')
    oc = Ac['owner']
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (ac,))
    sc = _status(D, Wc)
    case("Core = Claude Code, sự cố: đổi → antigravity khi chưa tick Clause 6", upd(Wc, '"antigravity"', oc), MSG_TC_CONSENT_T)
    cn_rev = _cn(D, Wc); db.execute("UPDATE consents SET revoked_at=? WHERE id=?", (now(), cn_rev))
    case("… đồng ý mới nhưng đã rút", upd(Wc, '"antigravity"', oc), MSG_TC_CONSENT_T)
    used = _acc(D, Wc, 'antigravity', 'Google — chưa gắn', 'ga-auth-wtc1-used', 'unknown', _cn(D, Wc))   # đồng ý đang được một tài khoản khác dùng
    case("… đồng ý đang được tài khoản Antigravity khác trỏ tới", upd(Wc, '"antigravity"', oc), MSG_TC_CONSENT_T)
    db.execute("UPDATE engine_accounts SET deleted_at=? WHERE id=?", (now(), used))                     # gỡ tài khoản nháp — đồng ý vẫn "đã dùng"
    # đồng ý cũ ĐÃ GẮN danh tính mà không còn tài khoản nào trỏ (tài khoản đã chuyển sang đồng ý khác) — vẫn không phải "CN- mới"
    cn_h = _cn(D, Wc)
    draft = _acc(D, Wc, 'antigravity', 'Google — nháp 2', 'ga-auth-wtc1-d2', 'unknown', cn_h)
    db.execute("UPDATE engine_accounts SET account_hint='z***@gmail.com' WHERE id=?", (draft,))       # danh tính đầu tiên ⇒ gắn vào cn_h
    db.execute("UPDATE engine_accounts SET consent_id=?, deleted_at=? WHERE id=?", (_cn(D, Wc), now(), draft))   # đồng ý khác cũng thành "đã dùng"
    case("… đồng ý cũ đã gắn danh tính z*** (không còn tài khoản trỏ)", upd(Wc, '"antigravity"', oc), MSG_TC_CONSENT_T)
    old_v = _cn(D, Wc, version='0')
    case("… đồng ý theo lời cảnh báo cũ (notice_version 0)", upd(Wc, '"antigravity"', oc), MSG_TC_CONSENT_T)
    cn_ok = _cn(D, Wc)                                                                                   # tick Clause 6 ⇒ CN- mới
    ag_en, ag_eb = _type_change(D, Wc, 'antigravity', oc, 'ga-auth-wtc1-ag', label='Google — Hệ thống', cn=cn_ok)
    sc2 = _status(D, Wc)
    bc_en = D.one("SELECT is_enabled FROM engine_bindings WHERE id=?", bc)
    db.execute("UPDATE engine_accounts SET login_status='logged_in', account_hint='g***@gmail.com' WHERE id=?", (ag_en,))
    _probe(D, Wc, ag_en, ctc)
    sc3 = _status(D, Wc)
    hint_cn = D.one("SELECT account_hint FROM consents WHERE id=?", cn_ok)
    # (5) lối INSERT (workspace chưa có hàng ST-0017 — hiệu lực mặc định antigravity): actor system lúc sự cố bị chặn; owner được (EB cũ tắt cùng câu lệnh)
    Wi, Ai, cti, ai_, bi = _core_ws(D, 'tc-ins', 'WTC2', n=1)
    case("lối INSERT, lúc ok: owner ghi ST-0017 = claude-code", lambda: D.ins('settings', workspace_id=Wi, key='system.core_agent_engine',
         value_json='"claude-code"', created_by=Ai['owner']), MSG_RO_T)
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (ai_[0],))
    case("lối INSERT, sự cố: actor system ghi ST-0017 = claude-code", lambda: D.ins('settings', workspace_id=Wi, key='system.core_agent_engine',
         value_json='"claude-code"', created_by=Ai['system']), MSG_TC_OWNER_T)
    ins_en, ins_eb = _type_change(D, Wi, 'claude-code', Ai['owner'], 'ga-auth-wtc2-cc', insert=True)
    si = _status(D, Wi)
    bi_en = D.one("SELECT is_enabled FROM engine_bindings WHERE id=?", bi[0])
    # Gen ghi chú 3 (vòng 8c): tài khoản mới đăng nhập hỏng ⇒ lý do theo đúng lần kiểm / trạng thái login, SỰ CỐ ⇒ cảnh báo + đổi lại được
    _probe(D, Wi, ins_en, cti, status='failed', slug='claude-code')
    sf1, ntf1 = _status(D, Wi), _nt_core(D, Wi, 'tc-failed')
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (ins_en,))
    sf2 = _status(D, Wi)
    cn_i = _cn(D, Wi)
    redo = _try(lambda: upd(Wi, '"antigravity"', Ai['owner'])())                                         # đổi lại được (về Antigravity, có CN- mới)
    # (6) sự kiện core_agent.type_changed: actor owner, "to" = loại hiện hành, đủ trường
    ev = lambda by, det: (lambda: D.ins('events', workspace_id=W, kind='core_agent.type_changed', severity='warn', subject='x',
                                        detail_json=json.dumps(det), created_by=by))
    good = {'from': 'claude-code', 'to': 'antigravity', 'reason': 'login_suspended'}
    case("sự kiện đổi loại do admin ghi", ev(adm, good), MSG_TC_EVENT_T)
    case("sự kiện đổi loại do tác tử hệ thống ghi", ev(A[(W, 'system')], good), MSG_TC_EVENT_T)
    case("sự kiện đổi loại: to ≠ loại Core agent hiện hành", ev(own, {'from': 'antigravity', 'to': 'claude-code', 'reason': 'login_suspended'}), MSG_TC_EVENT_T)
    case("sự kiện đổi loại thiếu reason", ev(own, {'from': 'claude-code', 'to': 'antigravity'}), 'CHECK')
    case("sự kiện đổi loại from = to", ev(own, {'from': 'antigravity', 'to': 'antigravity', 'reason': 'x'}), 'CHECK')
    ev_ok = _try(ev(own, good))
    # (7) luật "cùng loại Core agent" chỉ xét binding ĐANG BẬT: binding Hệ thống khác loại ở trạng thái tắt ghi được; bật lên thì bị chặn
    W8, A8, ct8, a8, b8 = _core_ws(D, 'tc-off', 'WTC3', n=1)
    cc8 = _acc(D, W8, 'claude-code', 'Anthropic — dự bị', 'ga-auth-wtc3-cc', 'logged_in')
    off_ok = _try(lambda: D.ins('engine_bindings', workspace_id=W8, consumer_kind='system', engine_account_id=cc8, priority=2, is_enabled=0))
    b8_off = D.one("SELECT id FROM engine_bindings WHERE engine_account_id=?", cc8)
    case("bật binding Hệ thống Claude Code (đang tắt) khi Core agent = Antigravity", lambda: db.execute(
        "UPDATE engine_bindings SET is_enabled=1 WHERE id=?", (b8_off,)), MSG_CORE_T)
    integ8 = [r for r in db.execute("SELECT check_key FROM v_integrity WHERE workspace_id=?", (W8,)) if r[0].startswith('core_agent')]
    slug_ok = _try(lambda: db.execute("UPDATE engine_accounts SET engine_slug='codex' WHERE id=?", (cc8,)))   # phía tài khoản: binding tắt không tính
    ok = (all(x[1] for x in c) and (s_rl['reason'], s_rl['is_incident']) == ('relogin_in_progress', 0)
          and (sc['reason'], sc['is_incident']) == ('login_expired', 1)
          and (sc2['reason'], sc2['is_incident']) == ('type_change_in_progress', 0) and bc_en == 0 and sc3['mode'] == 'ok' and hint_cn == 'g***@gmail.com'
          and (si['reason'], si['is_incident']) == ('type_change_in_progress', 0) and bi_en == 0
          and (sf1['reason'], sf1['is_incident'], sf1['overlay_text']) == ('login_check_failed', 1,
               'Core agent gặp sự cố: lần kiểm đăng nhập mới nhất không đạt. Xử lý trước khi tiếp tục.') and ntf1
          and (sf2['reason'], sf2['is_incident']) == ('login_expired', 1) and redo and ev_ok and off_ok and not integ8 and slug_ok)
    report("CORE-type-change-guards", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn đúng guard: lúc ok / đang đăng nhập lại ⇒ chỉ đọc; admin ⇒ chỉ owner; "
           f"openclaw (coming_soon), codex (core_capable 0) ⇒ CORE_VALID; Core = Claude Code → Antigravity: chưa tick / đã rút / đồng ý đang được tài khoản khác "
           f"dùng / lời cảnh báo cũ / đồng ý cũ đã gắn danh tính ⇒ cần đồng ý MỚI; lối INSERT: lúc ok ⇒ chỉ đọc, actor system lúc sự cố ⇒ chỉ owner; sự kiện "
           f"đổi loại sai actor (admin, tác tử) / sai đích / thiếu "
           f"reason / from = to; bật binding khác loại; đối chứng: CN- mới ⇒ đổi được ({sc2['reason']}, binding cũ tắt), đăng nhập agy ⇒ {sc3['mode']}, danh "
           f"tính gắn vào CN mới ({hint_cn}); lối INSERT của owner ⇒ {si['reason']}, binding cũ tắt; Gen ghi chú 3: tài khoản mới kiểm hỏng ⇒ {sf1['reason']} "
           f"(is_incident {sf1['is_incident']}, cảnh báo phát được), hết hạn ⇒ {sf2['reason']} ⇒ owner đổi lại được ({'được' if redo else 'BỊ CHẶN'}); binding "
           f"khác loại ở trạng thái tắt ghi được, v_integrity sạch, tài khoản chỉ có binding tắt đổi engine_slug được (luật chỉ xét binding đang bật)")
    _show(c)

def t_v2210_seed_hint():
    """CONTRACT-r8c §C: seed account_hint dạng che (không email thật) cho tài khoản Antigravity có đồng ý + đồng ý tương ứng — test seed dựng EN-0001 / CN-0001
    = r***@gmail.com (contract), EN-0003 / CN-0002 = m***@gmail.com (Mai), EN-0005 / CN-0003 = l***@gmail.com (Lan); EN-0007 / CN-0004 (h***) và EN-0010 /
    CN-0005 (y***) chỉ ở §11.3 (test seed không dựng Minh, Vy). Danh tính gắn vào đồng ý ở lần đăng nhập đầu (engine_accounts_consent_identity_au) ⇒ ok."""
    D, X = seed()
    db, W = D.db, X['W']
    rows = db.execute("""SELECT a.display_id, a.account_hint, c.display_id, c.account_hint, v.consent_state FROM engine_accounts a
                         JOIN consents c ON c.id = a.consent_id JOIN v_account_consent v ON v.engine_account_id = a.id
                         WHERE a.workspace_id=? AND a.engine_slug='antigravity' ORDER BY a.display_seq""", (W,)).fetchall()
    want = [('EN-0001', 'r***@gmail.com', 'CN-0001', 'r***@gmail.com', 'ok'), ('EN-0003', 'm***@gmail.com', 'CN-0002', 'm***@gmail.com', 'ok'),
            ('EN-0005', 'l***@gmail.com', 'CN-0003', 'l***@gmail.com', 'ok')]
    masked = all(re.fullmatch(r'[a-z]\*\*\*@gmail\.com', r[1]) for r in rows)
    s = _status(D, W)
    ok = rows == want and masked and s['mode'] == 'ok'
    report("SEED-r8c", ok, f"account_hint dạng che: {[(r[0], r[1], r[2]) for r in rows]} — đồng ý mang cùng danh tính, consent_state ok, Core agent {s['mode']}")

def t_v2210_emergency_role():
    """CONTRACT-r8c §B — Q-R8b [CHỐT — Ryan 2026-10-16: "1,2,3 ok" (Q-R8b)]: khối "Điều khiển khẩn cấp Role" trên màn chặn — ba thao tác KHÔNG cần AI Hệ
    thống và DB KHÔNG chặn ở recovery: (1) tạm ngưng / tiếp tục thẻ = employee_cards.status issued ↔ suspended + suspended_at, audit card.suspend /
    card.resume; (2) tắt / bật tin chủ động = proactive_policies.is_enabled, audit proactive_policy.disable / .enable (tắt ⇒ đặt chỗ tin chủ động bị trần 0 —
    proactive_sends_cap); (3) gỡ người khỏi allowlist Telegram = telegram_allowlist.status active → removed, audit telegram_allowlist.remove. Ca âm: việc
    cần AI Hệ thống (khai sinh = Interviewer, đào tạo = Trainer, cấp thẻ = Judge chấm thử việc, Role mới) vẫn bị chặn."""
    D, X = seed()
    db, W, EN, CT, mai = D.db, X['W'], X['EN'], X['CT'], X['mai']
    own = X['A'][(W, 'owner')]
    c, case = _cases(db)
    al = D.ins('telegram_allowlist', workspace_id=W, bot_id=X['tg'], tg_user_id=4242, display_name='Thảo · kế toán', added_via='manual')
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (EN['sys_ag'],))         # Core agent sự cố ⇒ màn chặn
    s = _status(D, W)
    au0 = D.one("SELECT count(*) FROM audit_log WHERE workspace_id=?", W)
    ops = []
    def op(fn):
        ops.append(_try(fn))
    # (1) Tạm ngưng / Tiếp tục thẻ Mai (CD-0004)
    op(lambda: (db.execute("UPDATE employee_cards SET status='suspended', suspended_at=?, updated_by=?, updated_at=? WHERE id=?",
                           (now(), own, now(), X['cd4'])), audit(D, W, 'card.suspend', entity_id=X['cd4'], detail={'role': 'RL-0001'})))
    card1 = D.one("SELECT status FROM employee_cards WHERE id=?", X['cd4'])
    op(lambda: (db.execute("UPDATE employee_cards SET status='issued', suspended_at=NULL, updated_by=?, updated_at=? WHERE id=?",
                           (own, now(), X['cd4'])), audit(D, W, 'card.resume', entity_id=X['cd4'])))
    op(lambda: (db.execute("UPDATE employee_cards SET status='suspended', suspended_at=?, updated_by=?, updated_at=? WHERE id=?",
                           (now(), own, now(), X['cd4'])), audit(D, W, 'card.suspend', entity_id=X['cd4'], detail={'role': 'RL-0001'})))
    # (2) Tắt tin chủ động (A3.P) ⇒ đặt chỗ tin chủ động của Mai bị trần 0
    op(lambda: (db.execute("UPDATE proactive_policies SET is_enabled=0, updated_by=?, updated_at=? WHERE id=?", (own, now(), X['pp'])),
                audit(D, W, 'proactive_policy.disable', entity_id=X['pp'])))
    pn = uid('pn:er')
    def reserve_pn():                                                                  # transaction 1 của luồng đặt chỗ (Polaris ghi trước, FK deferred)
        polaris(D, W, mai, 'proactive', gain=0, rules='P3', proactive_send_id=pn)
        D.ins('proactive_sends', id=pn, workspace_id=W, role_id=mai, policy_id=X['pp'], trigger_kind='task_done', urgency='normal',
              day_local='2026-10-16', channel='telegram', status='reserved', reserved_until=now())
    case("tin chủ động tắt: Mai đặt chỗ tin chủ động", lambda: D.txn(reserve_pn), 'vượt trần')
    # (3) Gỡ Thảo khỏi allowlist Telegram của Mai
    op(lambda: (db.execute("UPDATE telegram_allowlist SET status='removed', updated_by=?, updated_at=? WHERE id=?", (own, now(), al)),
                audit(D, W, 'telegram_allowlist.remove', entity_id=al, detail={'bot': 'TG-0003', 'who': 'Thảo · kế toán'})))
    st = (D.one("SELECT status FROM employee_cards WHERE id=?", X['cd4']), D.one("SELECT is_enabled FROM proactive_policies WHERE id=?", X['pp']),
          D.one("SELECT status FROM telegram_allowlist WHERE id=?", al))
    # Bật tin chủ động ⇒ đối chứng: cùng lượt đặt chỗ nay được (chỉ cờ tắt chặn; Role vẫn chạy ở recovery — Q-I7)
    op(lambda: (db.execute("UPDATE proactive_policies SET is_enabled=1, updated_by=?, updated_at=? WHERE id=?", (own, now(), X['pp'])),
                audit(D, W, 'proactive_policy.enable', entity_id=X['pp'])))
    pn_ok = _try(lambda: D.txn(reserve_pn))
    acts = [r[0] for r in db.execute("SELECT action FROM audit_log WHERE workspace_id=? AND display_seq > ? ORDER BY display_seq", (W, au0))]
    s_after = _status(D, W)
    # ca âm: việc cần AI Hệ thống vẫn chặn
    sess = lambda kind, trig, **kw: (lambda: D.ins('sessions', workspace_id=W, agent_kind=kind, trigger=trig, engine_account_id=EN['sys_ag'],
                                                   container_id=CT['sys'], started_at=now(), **kw))
    case("khai sinh: phiên Interviewer", sess('interviewer', 'interview'), MSG_SA_T)
    case("đào tạo: phiên Trainer", sess('trainer', 'training'), MSG_SA_T)
    case("cấp thẻ: phiên Judge chấm thử việc", sess('judge', 'trial'), MSG_SA_T)
    case("Role mới", lambda: _role(D, W, 'Moi'), MSG_READY_T)
    ok = (all(x[1] for x in c) and all(ops) and len(ops) == 6 and (s['mode'], s['is_incident']) == ('recovery', 1) and card1 == 'suspended'
          and st == ('suspended', 0, 'removed') and pn_ok
          and acts == ['card.suspend', 'card.resume', 'card.suspend', 'proactive_policy.disable', 'telegram_allowlist.remove', 'proactive_policy.enable']
          and (s_after['mode'], s_after['blocks_admin']) == ('recovery', 1))
    report("CORE-emergency-role", ok, f"Q-R8b [CHỐT]: Core agent sự cố ({s['mode']}, {s['reason']}) ⇒ owner làm được {sum(ops)}/{len(ops)} thao tác khẩn cấp: "
           f"tạm ngưng / tiếp tục thẻ CD-0004 (employee_cards.status, suspended_at), tắt tin chủ động (proactive_policies.is_enabled = 0 ⇒ đặt chỗ tin bị "
           f"trần 0; bật lại ⇒ đặt chỗ được: {'đúng' if pn_ok else 'SAI'}), gỡ Thảo khỏi allowlist TG-0003 (telegram_allowlist.status = removed); "
           f"audit {acts}; màn chặn vẫn {s_after['mode']} "
           f"(blocks_admin {s_after['blocks_admin']}); {sum(x[1] for x in c)}/{len(c)} ca bị chặn: tin chủ động khi đã tắt, khai sinh (Interviewer), "
           f"đào tạo (Trainer), cấp thẻ (Judge thử việc), Role mới")
    _show(c)

# ================================================================== v2.2.11 — CONTRACT-r8d (đóng phần DB của CNS-117, 119, 120, 121, 123; [ĐỀ XUẤT — Gen vòng 8d])
SYS_KEYS = ('interviewer', 'trainer', 'consolidator', 'judge')
STALE_OB7 = '/4 tác tử hệ thống · cần chọn lại model sau khi đổi loại Core agent'
STALL_OVERLAY = 'Core agent gặp sự cố: đăng nhập bị bỏ dở. Xử lý trước khi tiếp tục.'
def _scan(D, ws, acc, ct, slug, models, efforts):
    """App ⑥: QUÉT KHẢ NĂNG (PB- trigger install) tài khoản acc trong container ct ⇒ capabilities model / effort theo thứ tự quét (ordinal)."""
    pb = D.ins('probe_runs', workspace_id=ws, engine_account_id=acc, engine_slug=slug, container_id=ct, trigger='install', auth_mode='oauth',
               status='ok', started_at=now(), finished_at=now())
    for i, (k, item) in enumerate([('model', m) for m in models] + [('effort', e) for e in efforts]):
        D.ins('capabilities', workspace_id=ws, engine_account_id=acc, kind=k, item_key=item, value_state='known', source=f'{slug} scan',
              confidence='direct', auth_mode='oauth', ordinal=i, first_seen_at=now(), last_seen_at=now(), last_probe_run_id=pb)
    return pb
def _apply_sa_defaults(D, ws, acc, slug, by, keys=SYS_KEYS):
    """App ⑥ (CONTRACT-r8d §A): áp model / effort MẶC ĐỊNH của loại slug (S.SA_DEFAULTS) cho tác tử keys; giá trị không có trong registry vừa quét của acc
    (hoặc loại chưa có mặc định) ⇒ mục đầu (ordinal nhỏ nhất) của danh sách đã quét; rồi selection_state = 'valid'. DB không kiểm lại model ∈ registry."""
    reg = lambda kind: [r[0] for r in D.db.execute("SELECT item_key FROM capabilities WHERE engine_account_id=? AND kind=? AND value_state='known' "
                                                   "AND deleted_at IS NULL ORDER BY ordinal", (acc, kind))]
    models, efforts = reg('model'), reg('effort')
    out = {}
    for k in keys:
        m, e = S.SA_DEFAULTS.get(slug, {}).get(k, (None, None))
        m, e = (m if m in models else models[0]), (e if e in efforts else efforts[0])
        D.db.execute("UPDATE system_agents SET model_key=?, effort=?, selection_state='valid', selection_checked_at=?, updated_by=?, updated_at=? "
                     "WHERE workspace_id=? AND system_key=? AND deleted_at IS NULL", (m, e, now(), by, now(), ws, k))
        out[k] = (m, e)
    return out

def t_v2211_sa_stale():
    """CONTRACT-r8d §A (CNS-117, 118): ST-0017 đổi loại ⇒ SA-0001…0004 'stale' (cùng câu lệnh; model cũ giữ để owner thấy); OB-07 err "x/4 … cần chọn lại model
    …"; phiên AI Hệ thống chỉ mở khi tác tử 'valid' (Core agent sẵn sàng mà tác tử stale / unknown ⇒ chặn — INSERT lẫn UPDATE agent_kind); app quét khả
    năng (PB- install) + áp mặc định của loại mới ⇒ 'valid' ⇒ phiên mở được. Ca âm: lúc bình thường (ghi lại cùng giá trị, đăng nhập lại, sự cố rồi hết, INSERT
    ST-0017 = mặc định) KHÔNG có stale. Seed = registry mặc định của Antigravity (CNS-118)."""
    D, X = seed()
    db, W, A, EN, CT = D.db, X['W'], X['A'], X['EN'], X['CT']
    own = A[(W, 'owner')]
    c, case = _cases(db)
    sa = lambda ws=W: db.execute("SELECT display_id, system_key, model_key, effort, selection_state FROM system_agents WHERE workspace_id=? "
                                 "AND deleted_at IS NULL ORDER BY display_seq", (ws,)).fetchall()
    states = lambda ws=W: [r[4] for r in sa(ws)]
    sess = lambda kind, acc, trig='trial': (lambda: D.ins('sessions', workspace_id=W, agent_kind=kind, trigger=trig, engine_account_id=acc,
                                                          container_id=CT['sys'], role_id=X['mai'], started_at=now()))
    seed_ok = [(r[0], r[1], (r[2], r[3]), r[4]) for r in sa()] == [(f'SA-000{i + 1}', k, S.SA_DEFAULTS['antigravity'][k], 'valid')
                                                                   for i, k in enumerate(SYS_KEYS)]
    ob0 = tuple(_ob(D, W, 'OB-07'))
    # --- ca âm: lúc bình thường không có stale
    db.execute("UPDATE settings SET value_json='\"antigravity\"', note='ghi lại cùng giá trị', updated_by=?, updated_at=? WHERE workspace_id=? "
               "AND key='system.core_agent_engine'", (own, now(), W))
    db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (EN['sys_ag'],))                  # đăng nhập lại
    _probe(D, W, EN['sys_ag'], CT['sys'])
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), EN['sys_ag']))
    db.execute("UPDATE engine_accounts SET outage_since=? WHERE id=?", (now(), EN['sys_ag']))                        # sự cố hãng …
    db.execute("UPDATE engine_accounts SET outage_since=NULL WHERE id=?", (EN['sys_ag'],))                            # … rồi hồi phục
    calm = states()
    judge0 = _try(sess('judge', EN['sys_ag']))
    Wa, Aa = _fresh_ws(D, 'sa-ins-a', 'WSA1')
    Wb, Ab = _fresh_ws(D, 'sa-ins-b', 'WSA2')
    for ws in (Wa, Wb):
        for k in SYS_KEYS:
            D.ins('system_agents', workspace_id=ws, system_key=k, model_key=S.SA_DEFAULTS['antigravity'][k][0],
                  effort=S.SA_DEFAULTS['antigravity'][k][1], selection_state='valid')
    D.ins('settings', workspace_id=Wa, key='system.core_agent_engine', value_json='"antigravity"', created_by=Aa['owner'])   # = mặc định
    D.ins('settings', workspace_id=Wb, key='system.core_agent_engine', value_json='"claude-code"', created_by=Ab['owner'])   # loại khác
    ins_a, ins_b, w_after = states(Wa), states(Wb), states()          # INSERT ST-0017 ở workspace khác không chạm tác tử của W
    # --- đổi loại khi sự cố ⇒ stale
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (EN['sys_ag'],))
    cc, ebc = _type_change(D, W, 'claude-code', own, 'ga-auth-sa-cc', label='Anthropic — Hệ thống')
    st1 = sa()
    t17 = D.one("SELECT updated_at FROM settings WHERE workspace_id=? AND key='system.core_agent_engine'", W)
    chk1 = D.one("SELECT count(*) FROM system_agents WHERE workspace_id=? AND selection_checked_at=? AND updated_by=?", W, t17, own)
    ob1 = tuple(_ob(D, W, 'OB-07'))
    vsa1 = [r[0] for r in db.execute("SELECT selection_state FROM v_system_agents WHERE workspace_id=?", (W,))]
    case("đang đổi loại: phiên Judge (Core agent chưa sẵn sàng — thông điệp cũ đứng trước)", sess('judge', cc), MSG_SA_T)
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), cc))
    _probe(D, W, cc, CT['sys'], slug='claude-code')
    s2 = _status(D, W)
    case("Core agent ok, tác tử stale: phiên Judge trên Claude Code", sess('judge', cc), MSG_SA_VALID_T)
    case("Core agent ok, tác tử stale: phiên Interviewer", sess('interviewer', cc, 'interview'), MSG_SA_VALID_T)
    bl = D.ins('sessions', workspace_id=W, agent_kind='system', trigger='baseline', engine_account_id=cc, container_id=CT['sys'], started_at=now())
    case("Core agent ok, tác tử stale: đổi phiên baseline thành Judge (UPDATE agent_kind)", lambda: db.execute(
        "UPDATE sessions SET agent_kind='judge' WHERE id=?", (bl,)), MSG_SA_VALID_T)
    # --- app: quét khả năng (PB- install) rồi áp mặc định của Claude Code (từng phần ⇒ OB-07 đếm)
    pb = _scan(D, W, cc, CT['sys'], 'claude-code', ('opus', 'sonnet', 'haiku'), ('low', 'medium', 'high'))
    pb_id = D.one("SELECT display_id FROM probe_runs WHERE id=?", pb)
    _apply_sa_defaults(D, W, cc, 'claude-code', own, keys=('interviewer', 'trainer'))
    ob_part = tuple(_ob(D, W, 'OB-07'))
    case("áp xong 2/4: phiên Judge (còn stale)", sess('judge', cc), MSG_SA_VALID_T)
    _apply_sa_defaults(D, W, cc, 'claude-code', own, keys=('consolidator', 'judge'))
    st3, ob3 = sa(), tuple(_ob(D, W, 'OB-07'))
    judge_ok = _try(sess('judge', cc))
    upd_ok = _try(lambda: db.execute("UPDATE sessions SET agent_kind='judge' WHERE id=?", (bl,)))
    # chỉ 'valid' mở phiên: 'unknown' (chưa kiểm registry) cũng chặn
    db.execute("UPDATE system_agents SET selection_state='unknown' WHERE workspace_id=? AND system_key='trainer'", (W,))
    case("tác tử 'unknown' (chưa kiểm registry): phiên Trainer", sess('trainer', cc, 'training'), MSG_SA_VALID_T)
    want3 = [(f'SA-000{i + 1}', k, *S.SA_DEFAULTS['claude-code'][k], 'valid') for i, k in enumerate(SYS_KEYS)]
    ok = (all(x[1] for x in c) and seed_ok and ob0 == ('ok', '4/4 tác tử hệ thống · tài khoản Core agent (Antigravity)')
          and calm == ['valid'] * 4 and judge0 and ins_a == ['valid'] * 4 and ins_b == ['stale'] * 4 and w_after == ['valid'] * 4
          and [r[4] for r in st1] == ['stale'] * 4 and [r[2] for r in st1] == [S.SA_DEFAULTS['antigravity'][k][0] for k in SYS_KEYS] and chk1 == 4
          and ob1 == ('err', '0' + STALE_OB7) and vsa1 == ['stale'] * 4 and s2['mode'] == 'ok'
          and ob_part == ('err', '2' + STALE_OB7) and st3 == want3 and ob3 == ('ok', '4/4 tác tử hệ thống · tài khoản Core agent (Claude Code)')
          and judge_ok and upd_ok)
    report("CORE-sa-stale", ok, f"seed SA = mặc định Antigravity ({'đúng' if seed_ok else 'LỆCH'}), OB-07 {ob0[0]}; lúc bình thường (ghi lại cùng giá trị, đăng nhập "
           f"lại, outage rồi hồi phục, INSERT ST-0017 = mặc định) ⇒ {calm[0]} / {ins_a[0]}; INSERT ST-0017 = loại khác ⇒ {ins_b[0]} (tác tử W vẫn {w_after[0]}); "
           f"owner đổi sang Claude Code ⇒ "
           f"4/4 {st1[0][4]} cùng câu lệnh (model cũ giữ: {st1[0][2]}), OB-07 {ob1[0]} \"{ob1[1]}\"; {sum(x[1] for x in c)}/{len(c)} ca bị chặn: đang đổi loại ⇒ "
           f"thông điệp Core agent; Core agent {s2['mode']} mà tác tử stale ⇒ Judge, Interviewer, UPDATE agent_kind, áp 2/4 (OB-07 \"{ob_part[1]}\"); tác tử "
           f"unknown; quét {pb_id} + áp mặc định Claude Code ⇒ {[(r[2], r[3]) for r in st3]} valid, OB-07 {ob3[0]} \"{ob3[1]}\", Judge mở được "
           f"({'được' if judge_ok else 'BỊ CHẶN'}), UPDATE agent_kind được ({'được' if upd_ok else 'BỊ CHẶN'})")
    _show(c)

def _to_cc_then_expire(D, X, vol):
    """W: Google khoá EN-0001 ⇒ owner đổi sang Claude Code ⇒ kiểm đạt ⇒ Claude Code hết hạn (sự cố) — trạng thái ngay trước khi đổi VỀ Antigravity."""
    db, W, EN, CT = D.db, X['W'], X['EN'], X['CT']
    own = X['A'][(W, 'owner')]
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (EN['sys_ag'],))
    cc, ebc = _type_change(D, W, 'claude-code', own, vol, label='Anthropic — Hệ thống')
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), cc))
    _probe(D, W, cc, CT['sys'], slug='claude-code')
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (cc,))
    return cc, ebc
def _back_to_agy(D, X, cc, cn=None):
    """CONTRACT-r8d §B — MỘT thao tác: ST-0017 = antigravity (binding Claude Code tắt cùng câu lệnh) → BẬT LẠI EB-0001 → [cn: EN-0001 trỏ CN- mới] → EN-0001
    đăng nhập lại (in_progress) → events + audit core_agent.type_changed (reenabled)."""
    db, W, EN, EB = D.db, X['W'], X['EN'], X['EB']
    own = X['A'][(W, 'owner')]
    def op():
        db.execute("UPDATE settings SET value_json='\"antigravity\"', updated_by=?, updated_at=? WHERE workspace_id=? AND key='system.core_agent_engine'",
                   (own, now(), W))
        db.execute("UPDATE engine_bindings SET is_enabled=1, updated_by=?, updated_at=? WHERE id=?", (own, now(), EB['sys_ag']))
        if cn:
            db.execute("UPDATE engine_accounts SET consent_id=? WHERE id=?", (cn, EN['sys_ag']))
        db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (EN['sys_ag'],))
        det = {'from': 'claude-code', 'to': 'antigravity', 'reason': 'login_expired', 'from_account_id': cc, 'to_account_id': EN['sys_ag'],
               'to_binding_id': EB['sys_ag'], 'reenabled': True}
        D.ins('events', workspace_id=W, kind='core_agent.type_changed', severity='warn', subject='claude-code→antigravity login_expired',
              detail_json=json.dumps(det), created_by=own)
        audit(D, W, 'core_agent.type_changed', entity_id=EN['sys_ag'], detail=det, actor=own, reason='login_expired')
    return D.txn(op)

def t_v2211_type_change_back():
    """CONTRACT-r8d §B (CNS-119): đổi VỀ loại đã có tài khoản AI Hệ thống = bật lại binding cũ (không tạo tài khoản mới; một tài khoản mỗi loại giữ); overlay
    "đang đăng nhập lại". Antigravity: đồng ý cũ CỦA CHÍNH tài khoản đó còn hợp lệ ⇒ không cần tick lại; hết hiệu lực (rút / lời cảnh báo đổi version / đăng
    nhập ra danh tính khác) ⇒ tick Clause 6 (CN- mới). Ca âm: tài khoản Antigravity của ROLE (đồng ý hợp lệ) không thay được CN- mới — nhánh tạo tài khoản
    Hệ thống mới vẫn đòi CN- mới."""
    # (A) đồng ý cũ còn hợp lệ ⇒ về Antigravity không cần tick
    D, X = seed()
    db, W, EN, EB, CT = D.db, X['W'], X['EN'], X['EB'], X['CT']
    c, case = _cases(db)
    cc, ebc = _to_cc_then_expire(D, X, 'ga-auth-bk-a')
    sA0 = _status(D, W)
    n_cn0 = D.one("SELECT count(*) FROM consents WHERE workspace_id=?", W)
    a_ok = _try(lambda: _back_to_agy(D, X, cc))
    sA = _status(D, W)
    rowsA = db.execute("SELECT b.display_id, b.is_enabled, a.display_id, a.engine_slug FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id "
                       "WHERE b.workspace_id=? AND b.consumer_kind='system' AND b.deleted_at IS NULL ORDER BY b.display_seq", (W,)).fetchall()
    cnA = D.one("SELECT c.display_id FROM engine_accounts a JOIN consents c ON c.id = a.consent_id WHERE a.id=?", EN['sys_ag'])
    n_cn1 = D.one("SELECT count(*) FROM consents WHERE workspace_id=?", W)
    n_ag = D.one("SELECT count(*) FROM engine_accounts WHERE workspace_id=? AND engine_slug='antigravity' AND label LIKE '%Hệ thống%'", W)
    stA = [r[0] for r in db.execute("SELECT selection_state FROM system_agents WHERE workspace_id=?", (W,))]
    _probe(D, W, EN['sys_ag'], CT['sys'])
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), EN['sys_ag']))
    sA2 = _status(D, W)
    # (B) đồng ý cũ đã rút ⇒ chặn; tick CN- mới ⇒ được
    D, X = seed(); db, W, EN = D.db, X['W'], X['EN']
    c2, case = _cases(db)
    cc, _ = _to_cc_then_expire(D, X, 'ga-auth-bk-b')
    db.execute("UPDATE consents SET revoked_at=? WHERE id=?", (now(), X['CN']['sys_ag']))
    case("đồng ý cũ của EN-0001 đã rút: về Antigravity không tick", lambda: _back_to_agy(D, X, cc), MSG_TC_CONSENT_T)
    cn_b = _cn(D, W)
    b_ok = _try(lambda: _back_to_agy(D, X, cc, cn_b))
    sB = _status(D, W)
    cnB = D.one("SELECT consent_id FROM engine_accounts WHERE id=?", EN['sys_ag']) == cn_b
    c += c2
    # (C) đăng nhập ra danh tính khác (account_hint ≠ danh tính gắn ở CN-0001) ⇒ chặn
    D, X = seed(); db, W, EN = D.db, X['W'], X['EN']
    c3, case = _cases(db)
    cc, _ = _to_cc_then_expire(D, X, 'ga-auth-bk-c')
    db.execute("UPDATE engine_accounts SET account_hint='x***@gmail.com' WHERE id=?", (EN['sys_ag'],))
    case("EN-0001 đã đổi danh tính (x***): về Antigravity không tick", lambda: _back_to_agy(D, X, cc), MSG_TC_CONSENT_T)
    c += c3
    # (D) lời cảnh báo Antigravity đổi version ⇒ chặn
    D, X = seed(); db, W, EN = D.db, X['W'], X['EN']
    c4, case = _cases(db)
    cc, _ = _to_cc_then_expire(D, X, 'ga-auth-bk-d')
    db.execute("UPDATE engines SET tos_notice_version='2' WHERE slug='antigravity'")
    case("lời cảnh báo Antigravity đổi version: về Antigravity với đồng ý cũ", lambda: _back_to_agy(D, X, cc), MSG_TC_CONSENT_T)
    c += c4
    # (E) Core agent = Claude Code từ Onboarding (không có tài khoản Antigravity Hệ thống); tài khoản Antigravity của ROLE có đồng ý hợp lệ không thay CN- mới
    D, X = seed(); db = D.db
    c5, case = _cases(db)
    Wc, Ac, ctc, ac, bc = _cc_core_ws(D, 'bk-cc', 'WBK1')
    ha = _role(D, Wc, 'Ha')
    D.ins('containers', workspace_id=Wc, kind='role', role_id=ha, container_name='ga-role-ha-bk', desired_state='sleeping', observed_state='created')
    ha_ag = _core_acc(D, Wc, 'Google — Hà', 'ga-auth-wbk1-ha', 'logged_in')
    D.ins('engine_bindings', workspace_id=Wc, consumer_kind='role', role_id=ha, engine_account_id=ha_ag, priority=1)
    ha_cs = D.one("SELECT consent_state FROM v_account_consent WHERE engine_account_id=?", ha_ag)
    db.execute("UPDATE engine_accounts SET login_status='expired' WHERE id=?", (ac,))
    case("Core = Claude Code, tài khoản Antigravity của Role có đồng ý hợp lệ: đổi → antigravity không tick", lambda: db.execute(
        "UPDATE settings SET value_json='\"antigravity\"', updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine'", (Ac['owner'], Wc)),
        MSG_TC_CONSENT_T)
    cn_e = _cn(D, Wc)
    e_ok = _try(lambda: _type_change(D, Wc, 'antigravity', Ac['owner'], 'ga-auth-wbk1-ag', label='Google — Hệ thống', cn=cn_e))
    c += c5
    ok = (all(x[1] for x in c) and len(c) == 4 and (sA0['reason'], sA0['is_incident']) == ('login_expired', 1) and a_ok
          and (sA['mode'], sA['reason'], sA['is_incident'], sA['overlay_text']) == ('recovery', 'relogin_in_progress', 0, RELOGIN_OVERLAY)
          and rowsA == [('EB-0001', 1, 'EN-0001', 'antigravity'), (rowsA[1][0], 0, rowsA[1][2], 'claude-code')] and cnA == 'CN-0001' and n_cn1 == n_cn0
          and n_ag == 1 and stA == ['stale'] * 4 and sA2['mode'] == 'ok'
          and b_ok and (sB['reason'], sB['is_incident']) == ('relogin_in_progress', 0) and cnB and ha_cs == 'ok' and e_ok)
    report("CORE-type-change-back", ok, f"Claude Code hết hạn ({sA0['reason']}, is_incident {sA0['is_incident']}) ⇒ về Antigravity với đồng ý cũ CN-0001 còn hợp lệ: "
           f"{'được' if a_ok else 'BỊ CHẶN'}, không tick (consents {n_cn0} → {n_cn1}), bật lại {rowsA[0][0] if rowsA else '—'} (EN-0001 vẫn là tài khoản "
           f"Antigravity Hệ thống duy nhất: {n_ag}), binding Claude Code tắt, overlay \"{sA['overlay_text']}\" ({sA['reason']}), tác tử {stA[0]}, đăng nhập "
           f"xong ⇒ {sA2['mode']}; {sum(x[1] for x in c)}/{len(c)} ca bị chặn (cần CN- mới): đồng ý cũ đã rút, danh tính khác, lời cảnh báo đổi version, "
           f"Core = Claude Code từ đầu chỉ có tài khoản Antigravity của Role (đồng ý {ha_cs}); đối chứng: tick CN- mới ⇒ bật lại được ({sB['reason']}, EN-0001 trỏ "
           f"CN mới), nhánh tạo tài khoản mới có CN- mới ⇒ được")
    _show(c)

def t_v2211_card_recovery():
    """CONTRACT-r8d §C (CNS-120): chế độ khắc phục (mode recovery — kể cả đang đăng nhập lại, không sự cố) ⇒ DB chặn CẤP THẺ = thẻ vào issued / suspended từ
    trạng thái khác (draft → issued; lối vòng draft → suspended, revoked → issued) và INSERT issued / suspended; KHÔNG chặn Tạm ngưng / Tiếp tục
    (issued ↔ suspended, Q-R8b), tạo thẻ nháp, thu hồi. Đối chứng: Core agent ok ⇒ cấp được."""
    D, X = seed()
    db, W, EN, CT, mai, lan = D.db, X['W'], X['EN'], X['CT'], X['mai'], X['lan']
    own = X['A'][(W, 'owner')]
    c, case = _cases(db)
    cdL, rvL, psL = db.execute("SELECT id, revision_id, position_id FROM employee_cards WHERE role_id=? AND status='issued'", (lan,)).fetchone()
    def ins_card(role, rv, ps, status):
        cid = uid(f'card:{role}:{status}:{time.perf_counter_ns()}')
        ev = {}
        if status != 'draft':
            au, _ = audit(D, W, 'card.issue', entity_id=cid)
            ev = dict(issued_at=now(), issued_by=own, dna_signature='sha256:rc', issue_audit_id=au, prompt_tokens=1)
        return D.ins('employee_cards', id=cid, workspace_id=W, role_id=role, revision_id=rv, position_id=ps, status=status, checks_json='[]', **ev)
    def reissue(new, to='issued'):                    # cấp lại thẻ Mai: CD-0004 superseded → thẻ mới vào trạng thái sống (một transaction)
        def op():
            db.execute("UPDATE employee_cards SET status='superseded', superseded_by_id=? WHERE id=?", (new, X['cd4']))
            au, _ = audit(D, W, 'card.issue', entity_id=new)
            db.execute("UPDATE employee_cards SET status=?, issued_at=?, issued_by=?, dna_signature='sha256:9f3a', prompt_tokens=1795, issue_audit_id=? "
                       "WHERE id=?", (to, now(), own, au, new))
        return lambda: D.txn(op)
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (EN['sys_ag'],))               # sự cố ⇒ recovery
    s1 = _status(D, W)
    new = ins_card(mai, X['rv3'], X['PS'], 'draft')                                                          # thẻ nháp: được
    case("recovery: cấp lại thẻ Mai (draft → issued)", reissue(new), MSG_CARD_T)
    case("recovery: lối vòng draft → suspended (rồi Tiếp tục)", reissue(new, 'suspended'), MSG_CARD_T)
    ops = [_try(lambda: db.execute("UPDATE employee_cards SET status='suspended', suspended_at=?, updated_by=? WHERE id=?", (now(), own, X['cd4']))),
           _try(lambda: db.execute("UPDATE employee_cards SET status='issued', suspended_at=NULL, updated_by=? WHERE id=?", (own, X['cd4']))),
           _try(lambda: db.execute("UPDATE employee_cards SET status='revoked', revoked_at=?, revoke_reason='khẩn cấp' WHERE id=?", (now(), cdL)))]
    case("recovery: revoked → issued (Lan)", lambda: db.execute("UPDATE employee_cards SET status='issued' WHERE id=?", (cdL,)), MSG_CARD_T)
    case("recovery: INSERT thẻ issued (Lan)", lambda: D.txn(lambda: ins_card(lan, rvL, psL, 'issued')), MSG_CARD_T)
    case("recovery: INSERT thẻ suspended (Lan)", lambda: D.txn(lambda: ins_card(lan, rvL, psL, 'suspended')), MSG_CARD_T)
    db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (EN['sys_ag'],))             # đang đăng nhập lại (không sự cố)
    s2 = _status(D, W)
    case("đang đăng nhập lại (recovery, is_incident 0): cấp lại thẻ Mai", reissue(new), MSG_CARD_T)
    _probe(D, W, EN['sys_ag'], CT['sys'])
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), EN['sys_ag']))
    s3 = _status(D, W)
    re_ok = _try(reissue(new))
    lan_ok = _try(lambda: D.txn(lambda: ins_card(lan, rvL, psL, 'issued')))
    live = sorted(r[0] for r in db.execute("SELECT r.name FROM employee_cards c JOIN roles r ON r.id = c.role_id WHERE c.workspace_id=? "
                                            "AND c.status IN ('issued', 'suspended')", (W,)))
    ok = (all(x[1] for x in c) and bool(new) and all(ops) and (s1['mode'], s1['is_incident']) == ('recovery', 1)
          and (s2['mode'], s2['reason'], s2['is_incident']) == ('recovery', 'relogin_in_progress', 0) and s3['mode'] == 'ok' and re_ok and lan_ok
          and live == ['Lan', 'Mai'])
    report("CARD-recovery", ok, f"Core agent {s1['mode']} (sự cố): thẻ nháp tạo được, Tạm ngưng / Tiếp tục / thu hồi được ({sum(ops)}/{len(ops)}); "
           f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn (\"không cấp thẻ mới\"): draft → issued, draft → suspended, revoked → issued, INSERT issued, INSERT "
           f"suspended, và lúc đang đăng nhập lại ({s2['reason']}, is_incident {s2['is_incident']}); đối chứng Core agent {s3['mode']}: cấp lại thẻ Mai "
           f"({'được' if re_ok else 'BỊ CHẶN'}), cấp thẻ Lan ({'được' if lan_ok else 'BỊ CHẶN'}) ⇒ thẻ sống {live}")
    _show(c)

def t_v2211_allowlist_owner():
    """CONTRACT-r8d §D (CNS-121): hàng chủ sở hữu (AL-0001 "Owner", is_owner = 1, bot TG-0003 của Mai) không gỡ được — MỌI LÚC (ok lẫn recovery): status →
    removed, hạ is_owner (lối vòng), xoá mềm; gỡ người khác và sửa tên hàng owner vẫn được."""
    D, X = seed()
    db, W, EN = D.db, X['W'], X['EN']
    own = X['A'][(W, 'owner')]
    c, case = _cases(db)
    al_own = D.one("SELECT id FROM telegram_allowlist WHERE workspace_id=? AND is_owner=1", W)
    al_t = D.ins('telegram_allowlist', workspace_id=W, bot_id=X['tg'], tg_user_id=4242, display_name='Thảo · kế toán', added_via='manual')
    upd = lambda sql, *a, row=None: (lambda: db.execute(f"UPDATE telegram_allowlist SET {sql}, updated_by=?, updated_at=? WHERE id=?",
                                                        (*a, own, now(), row or al_own)))
    case("lúc ok: gỡ hàng chủ sở hữu (status → removed)", upd("status='removed'"), MSG_AL_T)
    case("lúc ok: hạ is_owner = 0 (lối vòng: hạ rồi gỡ)", upd("is_owner=0"), MSG_AL_T)
    case("lúc ok: xoá mềm hàng chủ sở hữu", upd("deleted_at=?", now()), MSG_AL_T)
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (EN['sys_ag'],))               # khối khẩn cấp (recovery)
    s = _status(D, W)
    case("recovery (khối khẩn cấp): gỡ hàng chủ sở hữu", upd("status='removed'"), MSG_AL_T)
    case("recovery: gỡ + hạ is_owner cùng câu lệnh", upd("status='removed', is_owner=0"), MSG_AL_T)
    t_ok = _try(upd("status='removed'", row=al_t))
    name_ok = _try(upd("display_name='Ryan'"))
    act = D.one("SELECT count(*) FROM telegram_allowlist WHERE bot_id=? AND is_owner=1 AND status='active' AND deleted_at IS NULL", X['tg'])
    ok = all(x[1] for x in c) and (s['mode'], s['is_incident']) == ('recovery', 1) and t_ok and name_ok and act == 1
    report("AL-owner", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn: lúc ok và ở {s['mode']} — gỡ (removed), hạ is_owner, xoá mềm, gỡ + hạ cùng lúc; gỡ Thảo "
           f"({'được' if t_ok else 'BỊ CHẶN'}), sửa tên hàng owner ({'được' if name_ok else 'BỊ CHẶN'}); bot TG-0003 còn {act} hàng owner active")
    _show(c)

def t_v2211_login_stalled():
    """CONTRACT-r8d §E (CNS-123) — ĐỒNG HỒ GIẢ: relogin_in_progress / type_change_in_progress QUÁ 15 phút (mốc login_started_at do DB ghi) ⇒ login_stalled
    "đăng nhập bị bỏ dở": is_incident 1 (core_agent_incident phát được — trigger = view), auto_recheck 0, fix_target a5.system, owner_action "Đổi tài khoản /
    Đăng nhập lại", overlay dạng sự cố, A0 danger, nút đổi loại hiện lại (cổng mở). Biên: 14:59 và đúng 15:00 vẫn "đang …". Bấm lại "Đăng nhập lại" ⇒ đếm lại;
    mốc NULL ⇒ bỏ dở (fail-closed); xong ⇒ mốc NULL. Onboarding (chưa khoá) ⇒ không chặn, không cảnh báo."""
    T0 = '2026-10-16T09:00:00.000Z'
    try:
        D, X = seed()
        db, W, EN, EB, CT = D.db, X['W'], X['EN'], X['EB'], X['CT']
        own = X['A'][(W, 'owner')]
        c, case = _cases(db)
        started = lambda acc: D.one("SELECT login_started_at FROM engine_accounts WHERE id=?", acc)
        to_cc = lambda: db.execute("UPDATE settings SET value_json='\"claude-code\"', updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine'",
                                   (own, W))
        snap = lambda tag: (lambda s: (s, _nt_core(D, W, tag)))(_status(D, W))
        # (1) đăng nhập lại bỏ dở
        _set_clock(T0)
        db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (EN['sys_ag'],))
        m0 = started(EN['sys_ag'])
        _set_clock(T0, 899); sa_, na_ = snap('a')
        case("đăng nhập lại 14:59: owner đổi loại → claude-code", to_cc, MSG_RO_T)
        _set_clock(T0, 900); sb_, nb_ = snap('b')
        case("đăng nhập lại đúng 15:00: owner đổi loại → claude-code", to_cc, MSG_RO_T)
        _set_clock(T0, 901); sc_, nc_ = snap('c')
        att_c = db.execute("SELECT level, what FROM v_attention WHERE workspace_id=? AND what LIKE '%Core agent%'", (W,)).fetchall()
        # (2) owner bấm lại "Đăng nhập lại" (ghi lại in_progress) ⇒ đếm lại 15 phút
        db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (EN['sys_ag'],))
        m1 = started(EN['sys_ag']); sd_, nd_ = snap('d')
        # (3) mốc mất (NULL) khi đang in_progress ⇒ bỏ dở (fail-closed)
        db.execute("UPDATE engine_accounts SET login_started_at=NULL WHERE id=?", (EN['sys_ag'],))
        se_, ne_ = snap('e')
        # (4) PTY xong ⇒ kiểm đạt ⇒ ok, mốc NULL
        db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (EN['sys_ag'],))
        _probe(D, W, EN['sys_ag'], CT['sys'])
        db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), EN['sys_ag']))
        sf_ = _status(D, W); mf = started(EN['sys_ag'])
        # (5) đổi loại bỏ dở: Google khoá ⇒ owner đổi sang Claude Code (tài khoản mới INSERT in_progress) rồi bỏ dở PTY
        _set_clock(T0, 1000)
        db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (EN['sys_ag'],))
        cc, ebc = _type_change(D, W, 'claude-code', own, 'ga-auth-st-cc', label='Anthropic — Hệ thống')
        m_cc = started(cc)
        _set_clock(T0, 1900); sg_, ng_ = snap('g')
        case("đổi loại đúng 15:00: đổi loại lần nữa → antigravity", lambda: db.execute(
            "UPDATE settings SET value_json='\"antigravity\"', updated_by=? WHERE workspace_id=? AND key='system.core_agent_engine'", (own, W)), MSG_RO_T)
        _set_clock(T0, 1901); sh_, nh_ = snap('h')
        back_ok = _try(lambda: _back_to_agy(D, X, cc))           # nút "Đổi loại Core agent" hiện lại: về Antigravity = bật lại EB-0001 (đồng ý cũ hợp lệ)
        si_ = _status(D, W); m_back = started(EN['sys_ag'])
        # (6) Onboarding (chưa khoá): in_progress quá 15 phút ⇒ setup — không chặn, không cảnh báo
        Ws, _a, cts, as_, bs_ = _core_ws(D, 'st-setup', 'WST1', n=1, ready=False)
        db.execute("UPDATE engine_accounts SET login_status='in_progress' WHERE id=?", (as_[0],))
        _set_clock(T0, 3000)
        sj_, nj_ = _status(D, Ws), _nt_core(D, Ws, 'setup')
    finally:
        _FAKE_NOW[0] = None
    at = lambda sec: (datetime.datetime(2026, 10, 16, 9, 0, 0) + datetime.timedelta(seconds=sec)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    STALL = ('recovery', 1, 'login_stalled', 'đăng nhập bị bỏ dở', None, 1, 0, 'a5.system', 'Đổi tài khoản / Đăng nhập lại', STALL_OVERLAY,
             'A5 › AI Hệ thống: Đổi tài khoản / Đăng nhập lại')
    row = lambda s: tuple(s[k] for k in STATUS_COLS.replace(' ', '').split(','))
    ok = (all(x[1] for x in c) and m0 == T0
          and (sa_['reason'], sa_['is_incident'], na_) == ('relogin_in_progress', 0, False)
          and (sb_['reason'], sb_['is_incident'], nb_) == ('relogin_in_progress', 0, False)
          and row(sc_) == STALL and nc_ and att_c == [('danger', STALL_OVERLAY)]
          and m1 == at(901) and (sd_['reason'], sd_['is_incident'], nd_) == ('relogin_in_progress', 0, False)
          and (se_['reason'], se_['is_incident'], ne_) == ('login_stalled', 1, True)
          and sf_['mode'] == 'ok' and mf is None
          and m_cc == at(1000) and (sg_['reason'], sg_['is_incident'], ng_) == ('type_change_in_progress', 0, False)
          and row(sh_) == STALL and nh_ and back_ok and m_back == at(1901)
          and (si_['reason'], si_['is_incident']) == ('relogin_in_progress', 0)
          and (sj_['mode'], sj_['blocks_admin'], sj_['reason'], sj_['is_incident'], sj_['overlay_text'], nj_) == ('setup', 0, 'login_stalled', 0, None, False))
    report("CORE-login-stalled", ok, f"đồng hồ giả: đăng nhập lại từ {m0[11:19] if m0 else '—'} ⇒ 14:59 {sa_['reason']}, đúng 15:00 {sb_['reason']} (không cảnh báo); "
           f"15:01 ⇒ {sc_['reason']} \"{sc_['reason_text']}\" is_incident {sc_['is_incident']}, auto_recheck {sc_['auto_recheck']}, {sc_['fix_target']}, "
           f"\"{sc_['owner_action']}\", A0 {att_c[0][0] if att_c else '—'}, core_agent_incident {'phát được' if nc_ else 'BỊ CHẶN'}; bấm lại ⇒ mốc mới, "
           f"{sd_['reason']}; mốc NULL ⇒ {se_['reason']} (fail-closed); xong ⇒ {sf_['mode']}, mốc {mf}; đổi loại sang Claude Code bỏ dở ⇒ 15:00 {sg_['reason']}, "
           f"15:01 {sh_['reason']} (is_incident {sh_['is_incident']}) ⇒ nút đổi loại mở lại: về Antigravity (bật lại EB-0001) {'được' if back_ok else 'BỊ CHẶN'} "
           f"⇒ {si_['reason']}; {sum(x[1] for x in c)}/{len(c)} ca bị chặn (đổi loại khi chưa quá 15 phút); Onboarding quá 15 phút ⇒ {sj_['mode']}, "
           f"không chặn / không cảnh báo")
    _show(c)

# ================================================================== v2.2.12 — CONTRACT-r8e (review bảo mật allowlist + CNS-127, 129; [ĐỀ XUẤT — Gen vòng 8e])
SA_ATT = 'AI Hệ thống tạm dừng một phần: {n} tác tử cần chọn lại model.'
SA_OB7 = '/4 tác tử hệ thống · cần chọn lại model'

def t_v2212_allowlist_invariant():
    """CONTRACT-r8e §A (review bảo mật + CNS-129): BẤT BIẾN — bot Telegram còn sống luôn có ≥ 1 hàng owner active. Ca âm, mỗi lối vào một ca: đổi tg_user_id /
    bot_id / workspace_id của hàng owner active, DELETE hàng owner, xoá cứng bot còn owner ngoài purge (CASCADE), gỡ / hạ is_owner / xoá mềm hàng owner cuối, một
    câu lệnh gỡ mọi owner, khôi phục bot không còn owner. Ca thuận: thêm owner mới rồi gỡ cũ ("Đổi tài khoản Telegram của bạn"), hai owner ⇒ hạ một, bot xoá
    mềm ⇒ gỡ / xoá mềm hàng owner được (hết mồ côi), khôi phục bot có owner, purge (app_maint 1) xoá cứng được, bot pending chưa có owner xoá được."""
    D, X = seed()
    db, W, W2, lan, tg = D.db, X['W'], X['W2'], X['lan'], X['tg']
    own = X['A'][(W, 'owner')]
    c, case = _cases(db)
    al0 = D.one("SELECT id FROM telegram_allowlist WHERE bot_id=? AND is_owner=1", tg)
    owners = lambda bot: sorted(r[0] for r in db.execute("SELECT tg_user_id FROM telegram_allowlist WHERE bot_id=? AND is_owner=1 AND status='active' "
                                                         "AND deleted_at IS NULL", (bot,)))
    upd = lambda row, sql, *a: (lambda: db.execute(f"UPDATE telegram_allowlist SET {sql}, updated_by=?, updated_at=? WHERE id=?", (*a, own, now(), row)))
    def new_bot(name, tg_id, status='active'):
        sec = D.ins('secrets', workspace_id=W, kind='telegram_bot_token', label='bot', ciphertext=b'x', nonce=b'n', wrapped_dek=b'd', dek_nonce=b'n',
                    kek_id='kek1', fingerprint='fp')
        return D.ins('telegram_bots', workspace_id=W, role_id=lan, bot_username=name, bot_tg_id=tg_id, secret_id=sec, status=status)
    owner_row = lambda bot, u: D.ins('telegram_allowlist', workspace_id=W, bot_id=bot, tg_user_id=u, display_name='Owner', is_owner=1, added_via='capture')
    tl = new_bot('lan_office02_bot', 222)
    al_l = owner_row(tl, 999)
    al_t = D.ins('telegram_allowlist', workspace_id=W, bot_id=tg, tg_user_id=4242, display_name='Thảo · kế toán', added_via='manual')
    del_t = _try(lambda: db.execute("DELETE FROM telegram_allowlist WHERE id=?", (al_t,)))       # hàng không phải owner: xoá cứng được
    # --- đổi danh tính hàng owner active
    case("đổi tg_user_id hàng owner (TG-0003)", upd(al0, "tg_user_id=12345"), MSG_AL_ID_T)
    case("đổi bot_id hàng owner sang bot của Lan", upd(al0, "bot_id=?", tl), MSG_AL_ID_T)
    case("đổi workspace_id hàng owner (bất biến sẵn — _ident)", upd(al0, "workspace_id=?", W2), 'immutable identity')
    # --- xoá cứng
    case("DELETE hàng owner ngoài purge", lambda: db.execute("DELETE FROM telegram_allowlist WHERE id=?", (al0,)), MSG_AL_DEL_T)
    case("xoá cứng bot của Lan còn hàng owner, ngoài purge (CASCADE)", lambda: db.execute("DELETE FROM telegram_bots WHERE id=?", (tl,)), MSG_AL_DEL_T)
    # --- hàng owner cuối của bot còn sống
    case("gỡ hàng owner cuối (removed)", upd(al0, "status='removed'"), MSG_AL_LAST_T)
    case("hạ is_owner hàng owner cuối", upd(al0, "is_owner=0"), MSG_AL_LAST_T)
    case("xoá mềm hàng owner cuối", upd(al0, "deleted_at=?", now()), MSG_AL_LAST_T)
    # --- thuận: "Đổi tài khoản Telegram của bạn" = thêm owner mới (capture), rồi gỡ hàng cũ
    owner_row(tg, 7777)
    swap_ok = _try(upd(al0, "status='removed'"))
    own1 = owners(tg)
    al_b = owner_row(tg, 8888)
    case("một câu lệnh gỡ mọi owner của TG-0003", lambda: db.execute(
        "UPDATE telegram_allowlist SET status='removed' WHERE bot_id=? AND is_owner=1 AND status='active'", (tg,)), MSG_AL_LAST_T)
    two_one = _try(upd(al_b, "is_owner=0"))
    own2 = owners(tg)
    # --- bot xoá mềm ⇒ hàng owner gỡ / xoá mềm được (CNS-129); khôi phục bot cần owner active
    db.execute("UPDATE telegram_bots SET deleted_at=?, updated_by=? WHERE id=?", (now(), own, tl))
    dead_ok = _try(upd(al_l, "status='removed'")) and _try(upd(al_l, "deleted_at=?", now()))
    case("khôi phục bot của Lan khi không còn hàng owner active", lambda: db.execute(
        "UPDATE telegram_bots SET deleted_at=NULL WHERE id=?", (tl,)), MSG_TG_RESTORE_T)
    re_owner = _try(lambda: owner_row(tl, 999))
    restore_ok = _try(lambda: db.execute("UPDATE telegram_bots SET deleted_at=NULL WHERE id=?", (tl,)))
    # --- purge (ngữ cảnh bảo trì): xoá cứng bot còn owner được (CASCADE)
    D.ctx.maint = 1
    purge_ok = _try(lambda: db.execute("DELETE FROM telegram_bots WHERE id=?", (tl,)))
    D.ctx.maint = 0
    left = D.one("SELECT count(*) FROM telegram_allowlist WHERE bot_id=?", tl)
    # --- bot pending chưa có owner (chưa capture) ⇒ xoá cứng được: bất biến áp từ hàng owner đầu tiên
    tp = new_bot('lan_office03_bot', 333, 'pending')
    pend_ok = _try(lambda: db.execute("DELETE FROM telegram_bots WHERE id=?", (tp,)))
    ok = (all(x[1] for x in c) and del_t and swap_ok and own1 == [7777] and two_one and own2 == [7777] and dead_ok and re_owner and restore_ok and purge_ok
          and left == 0 and pend_ok and owners(tg) == [7777])
    report("AL-owner-invariant", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn đúng thông điệp: đổi tg_user_id, đổi bot_id, đổi workspace_id (_ident), DELETE "
           f"hàng owner, xoá cứng bot còn owner ngoài purge (CASCADE), gỡ / hạ is_owner / xoá mềm hàng owner cuối, một câu lệnh gỡ mọi owner, khôi phục bot "
           f"không owner; thuận: thêm owner 7777 rồi gỡ hàng cũ ({'được' if swap_ok else 'BỊ CHẶN'} ⇒ owner {own1}), hai owner ⇒ hạ một "
           f"({'được' if two_one else 'BỊ CHẶN'} ⇒ {own2}), bot xoá mềm ⇒ gỡ + xoá mềm hàng owner ({'được' if dead_ok else 'BỊ CHẶN'}), thêm owner rồi khôi phục "
           f"bot ({'được' if restore_ok else 'BỊ CHẶN'}), purge xoá cứng bot ({'được' if purge_ok else 'BỊ CHẶN'}, còn {left} hàng), bot pending chưa owner xoá "
           f"được ({'được' if pend_ok else 'BỊ CHẶN'}), xoá cứng hàng không phải owner (Thảo) được ({'được' if del_t else 'BỊ CHẶN'})")
    _show(c)

def t_v2212_sa_attention():
    """CONTRACT-r8e §B (CNS-127): tác tử hệ thống BẬT mà không 'valid' (unavailable / unknown / stale) — DB chặn phiên của nó — phải báo: OB-07 err
    "x/4 tác tử hệ thống · cần chọn lại model" (+ " sau khi đổi loại Core agent" khi có stale), v_attention MỘT hàng warn "AI Hệ thống tạm dừng một phần: <n> tác tử
    cần chọn lại model." (target SA- đầu tiên), KHÔNG phải sự cố Core agent (core_agent_incident không phát). Ca âm: mọi tác tử valid ⇒ không hàng; tác tử tắt
    không tính."""
    D, X = seed()
    db, W, EN, CT = D.db, X['W'], X['EN'], X['CT']
    own = X['A'][(W, 'owner')]
    c, case = _cases(db)
    att = lambda: db.execute("SELECT level, target, what FROM v_attention WHERE workspace_id=? AND what LIKE 'AI Hệ thống tạm dừng%'", (W,)).fetchall()
    ob7 = lambda: tuple(_ob(D, W, 'OB-07'))
    sess = lambda kind, trig, acc=None: (lambda: D.ins('sessions', workspace_id=W, agent_kind=kind, trigger=trig, engine_account_id=acc or EN['sys_ag'],
                                                       container_id=CT['sys'], role_id=X['mai'], started_at=now()))
    setst = lambda key, st: db.execute("UPDATE system_agents SET selection_state=?, selection_checked_at=?, updated_by=? WHERE workspace_id=? AND system_key=?",
                                       (st, now(), own, W, key))
    a0, o0 = att(), ob7()
    setst('consolidator', 'unavailable')                                   # registry không còn model của SA-0003 (STD-10: "không còn khả dụng — chọn lại")
    s1, a1, o1, nt1 = _status(D, W), att(), ob7(), _nt_core(D, W, 'sa-unavail')
    case("SA-0003 unavailable, Core agent ok: phiên Consolidator", sess('consolidator', 'consolidation'), MSG_SA_VALID_T)
    judge1 = _try(sess('judge', 'trial'))                                  # tác tử valid vẫn chạy ⇒ "tạm dừng một phần"
    setst('trainer', 'unknown')
    a2, o2 = att(), ob7()
    db.execute("UPDATE system_agents SET is_enabled=0 WHERE workspace_id=? AND system_key='interviewer'", (W,))
    setst('interviewer', 'unavailable')
    a3 = att()                                                             # tác tử tắt không tính
    db.execute("UPDATE system_agents SET is_enabled=1 WHERE workspace_id=? AND system_key='interviewer'", (W,))
    setst('interviewer', 'valid')
    # sau khi đổi loại: stale (giữ đuôi chữ), lẫn unavailable
    db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (EN['sys_ag'],))
    cc, _ = _type_change(D, W, 'claude-code', own, 'ga-auth-sat-cc', label='Anthropic — Hệ thống')
    a4, o4 = att(), ob7()
    db.execute("UPDATE engine_accounts SET login_status='logged_in', login_checked_at=? WHERE id=?", (now(), cc))
    _probe(D, W, cc, CT['sys'], slug='claude-code')
    _scan(D, W, cc, CT['sys'], 'claude-code', ('opus', 'sonnet', 'haiku'), ('low', 'medium', 'high'))
    _apply_sa_defaults(D, W, cc, 'claude-code', own, keys=('interviewer', 'trainer', 'judge'))
    setst('consolidator', 'unavailable')                                   # quét / áp hỏng cho SA-0003 (nhánh thất bại sau đổi loại)
    a5, o5, s5, nt5 = att(), ob7(), _status(D, W), _nt_core(D, W, 'sa-after-tc')
    _apply_sa_defaults(D, W, cc, 'claude-code', own, keys=('consolidator',))
    a6, o6 = att(), ob7()
    ok = (all(x[1] for x in c) and a0 == [] and o0 == ('ok', '4/4 tác tử hệ thống · tài khoản Core agent (Antigravity)')
          and s1['mode'] == 'ok' and a1 == [('warn', 'SA-0003', SA_ATT.format(n=1))] and o1 == ('err', '3' + SA_OB7) and not nt1 and judge1
          and a2 == [('warn', 'SA-0002', SA_ATT.format(n=2))] and o2 == ('err', '2' + SA_OB7)
          and a3 == [('warn', 'SA-0002', SA_ATT.format(n=2))]
          and a4 == [('warn', 'SA-0001', SA_ATT.format(n=4))] and o4 == ('err', '0' + SA_OB7 + ' sau khi đổi loại Core agent')
          and a5 == [('warn', 'SA-0003', SA_ATT.format(n=1))] and o5 == ('err', '3' + SA_OB7) and s5['mode'] == 'ok' and not nt5
          and a6 == [] and o6 == ('ok', '4/4 tác tử hệ thống · tài khoản Core agent (Claude Code)'))
    report("CORE-sa-attention", ok, f"mọi tác tử valid ⇒ A0 {a0}, OB-07 {o0[0]}; SA-0003 unavailable (Core agent {s1['mode']}) ⇒ A0 {a1}, OB-07 {o1}, "
           f"core_agent_incident {'BỊ PHÁT' if nt1 else 'không phát'}, Consolidator bị chặn, Judge chạy ({'được' if judge1 else 'BỊ CHẶN'}); + SA-0002 unknown ⇒ "
           f"{a2[0][2] if a2 else '—'} / OB-07 \"{o2[1]}\"; tác tử tắt không tính ({a3[0][2] if a3 else '—'}); đổi loại ⇒ {a4[0][2] if a4 else '—'} / \"{o4[1]}\"; "
           f"áp 3/4, SA-0003 unavailable ⇒ \"{o5[1]}\" (không đuôi), {s5['mode']}, không phát; áp đủ ⇒ A0 {a6}, OB-07 {o6[0]}; "
           f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn")
    _show(c)

# ================================================================== v2.2.13 — review bảo mật v2.2.12 (MEDIUM: REPLACE; HIGH: owner giả) — [ĐỀ XUẤT — Gen vòng 8f]
def t_v2213_no_replace():
    """v2.2.13 (MEDIUM): INSERT OR REPLACE / REPLACE INTO / UPDATE OR REPLACE giải xung đột UNIQUE bằng cách XOÁ hàng đang có — khi recursive_triggers OFF không chạy
    trigger DELETE (owner_d). Guard sinh tự động {t}_no_replace_i/_u chặn trước bước giải xung đột, KHÔNG phụ thuộc pragma. Kiểm: kết nối test bật pragma
    (hợp đồng §2.2); 5 lối REPLACE vào hàng owner (khoá ux_al, PK, REPLACE INTO, UPDATE OR REPLACE, khôi phục hàng đã xoá mềm trùng khoá) bị chặn khi pragma
    ON lẫn OFF; bảng khác (containers); mọi bảng có guard: REPLACE hàng y hệt bị chặn; bỏ guard + pragma ON ⇒ owner_d chặn; đối chứng: bỏ guard + pragma OFF ⇒
    REPLACE xoá được owner (lỗ của v2.2.12)."""
    D, X = seed()
    db, W, tg, CT = D.db, X['W'], X['tg'], X['CT']
    own = X['A'][(W, 'owner')]
    rec_on = D.one("PRAGMA recursive_triggers")
    c, case = _cases(db)
    owners = lambda: D.one("SELECT count(*) FROM telegram_allowlist WHERE bot_id=? AND is_owner=1 AND status='active' AND deleted_at IS NULL", tg)
    oid = D.one("SELECT id FROM telegram_allowlist WHERE bot_id=? AND is_owner=1", tg)
    COLS = "id,workspace_id,display_id,display_seq,created_by,bot_id,tg_user_id,display_name,is_owner,added_via"
    put = lambda verb, rid, seq, u: (lambda: db.execute(f"{verb} INTO telegram_allowlist({COLS}) VALUES(?,?,?,?,?,?,?,?,0,'manual')",
                                                        (rid, W, f'AL-{seq:04d}', seq, own, tg, u, 'Mạo danh')))
    thao = D.ins('telegram_allowlist', workspace_id=W, bot_id=tg, tg_user_id=4242, display_name='Thảo · kế toán', added_via='manual')
    ghost = D.ins('telegram_allowlist', workspace_id=W, bot_id=tg, tg_user_id=999, display_name='Owner cũ (đã xoá mềm)', added_via='manual',
                  deleted_at=now())                                                  # trùng (bot_id, tg_user_id) của owner nhưng ngoài partial index
    REP = [("INSERT OR REPLACE trùng (bot_id, tg_user_id) của owner (ux_al)", put('INSERT OR REPLACE', uid('rep-k'), 99, 999)),
           ("INSERT OR REPLACE trùng id hàng owner (PK)", put('INSERT OR REPLACE', oid, 98, 5555)),
           ("REPLACE INTO trùng (bot_id, tg_user_id) của owner", put('REPLACE', uid('rep-r'), 97, 999)),
           ("UPDATE OR REPLACE Thảo → tg_user_id của owner", lambda: db.execute("UPDATE OR REPLACE telegram_allowlist SET tg_user_id=999 WHERE id=?", (thao,))),
           ("UPDATE OR REPLACE khôi phục hàng đã xoá mềm trùng khoá owner", lambda: db.execute(
               "UPDATE OR REPLACE telegram_allowlist SET deleted_at=NULL WHERE id=?", (ghost,)))]
    for name, fn in REP:
        case("pragma ON: " + name, fn, MSG_NR_T)
    case("pragma ON: INSERT thường trùng khoá (thông điệp vẫn có UNIQUE)", put('INSERT', uid('dup'), 96, 999), 'UNIQUE')
    case("pragma ON: UPDATE OR REPLACE tên container Lan = container Mai (bảng khác, ux_ct_name)", lambda: db.execute(
        "UPDATE OR REPLACE containers SET container_name='ga-role-mai' WHERE id=?", (CT['Lan'],)), MSG_NR_T)
    case("pragma ON: INSERT OR REPLACE search_documents trùng id (PK rowid alias), khác entity", lambda: db.execute(
        "INSERT OR REPLACE INTO search_documents(id, workspace_id, entity_type, entity_id) SELECT id, workspace_id, entity_type, entity_id || ':x' "
        "FROM search_documents ORDER BY id LIMIT 1"), MSG_NR_T)
    db.execute("PRAGMA recursive_triggers=OFF")
    rec_off = D.one("PRAGMA recursive_triggers")
    for name, fn in REP:
        case("pragma OFF: " + name, fn, MSG_NR_T)
    # mọi bảng có guard: REPLACE một hàng y hệt hàng đang có (pragma OFF) ⇒ bị chặn
    guarded = [r[0][:-len('_no_replace_i')] for r in db.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE '%!_no!_replace!_i' ESCAPE '!'")]
    exempt = sorted(set(S.MVP_TABLES) - set(guarded))
    tried, leaked, by_nr = 0, [], 0
    for t in guarded:
        r = db.execute(f"SELECT rowid FROM {t} LIMIT 1").fetchone()
        if not r:
            continue
        tried += 1
        blocked, msg = expect_fail(db, lambda: db.execute(f"INSERT OR REPLACE INTO {t} SELECT * FROM {t} WHERE rowid=?", (r[0],)))
        if not blocked:
            leaked.append(t)
        by_nr += MSG_NR_T in msg
    db.execute("PRAGMA recursive_triggers=ON")
    own1 = owners()
    # bỏ guard chống REPLACE của allowlist (chỉ trong DB của test này): pragma ON ⇒ xoá do REPLACE chạy owner_d ⇒ vẫn chặn
    for tr in ('telegram_allowlist_no_replace_i', 'telegram_allowlist_no_replace_u'):
        db.execute(f"DROP TRIGGER IF EXISTS {tr}")
    case("bỏ guard, pragma ON: INSERT OR REPLACE trùng khoá owner ⇒ owner_d chặn", put('INSERT OR REPLACE', uid('rep-k2'), 95, 999), MSG_AL_DEL_T)
    case("bỏ guard, pragma ON: UPDATE OR REPLACE Thảo → khoá owner ⇒ owner_d chặn", lambda: db.execute(
        "UPDATE OR REPLACE telegram_allowlist SET tg_user_id=999 WHERE id=?", (thao,)), MSG_AL_DEL_T)
    own2 = owners()
    db.execute("PRAGMA recursive_triggers=OFF")
    hole = _try(put('INSERT OR REPLACE', uid('rep-k3'), 94, 999))                     # đối chứng: lỗ của v2.2.12
    own3 = owners()
    ok = (all(x[1] for x in c) and rec_on == 1 and rec_off == 0 and own1 == 1 and tried >= 20 and not leaked and exempt == ['id_counters', 'jobs']
          and own2 == 1 and hole and own3 == 0)
    report("REPLACE-guard", ok, f"kết nối test recursive_triggers = {rec_on} (hợp đồng §2.2); {sum(x[1] for x in c)}/{len(c)} ca bị chặn đúng guard: 5 lối "
           f"REPLACE vào hàng owner (khoá ux_al, PK, REPLACE INTO, UPDATE OR REPLACE, khôi phục hàng xoá mềm trùng khoá) khi pragma ON và OFF, INSERT thường "
           f"(UNIQUE), containers (UPDATE OR REPLACE), search_documents (PK rowid alias); {len(guarded)} bảng có guard sinh tự động (miễn: {exempt}) — REPLACE hàng y hệt ở {tried} bảng có dữ liệu: "
           f"{tried - len(leaked)} bị chặn ({by_nr} bởi guard chống REPLACE, còn lại bởi guard nghiệp vụ chạy trước), lọt {leaked}; bỏ guard + pragma ON ⇒ "
           f"owner_d chặn (owner còn {own2}); đối chứng bỏ guard + pragma OFF ⇒ REPLACE {'xoá được owner' if hole and own3 == 0 else 'KHÔNG xoá được'} "
           f"(owner còn {own3} — lỗ của v2.2.12)")
    _show(c)

def t_v2213_owner_create():
    """v2.2.13 (HIGH): bất biến "≥ 1 owner" bị lách bằng owner giả (tạo / nâng / kích hoạt lại owner rồi gỡ owner thật). Hàng chỉ TRỞ THÀNH owner active khi
    capture VÀ (owner của workspace HOẶC bot chưa có owner active — bootstrap); bảo trì miễn. Khôi phục bot chỉ owner của workspace. Ca âm từng lối, ca
    thuận: owner thêm qua capture, luồng A3.T đầy đủ, owner kích hoạt lại / nâng hàng capture, bootstrap, khôi phục bởi owner, bảo trì."""
    D, X = seed()
    db, W, lan, tg = D.db, X['W'], X['lan'], X['tg']
    own, tele = X['A'][(W, 'owner')], X['A'][(W, 'telegram')]
    adm = _admin_actor(D, W)
    c, case = _cases(db)
    owners = lambda bot: sorted(r[0] for r in db.execute("SELECT tg_user_id FROM telegram_allowlist WHERE bot_id=? AND is_owner=1 AND status='active' "
                                                         "AND deleted_at IS NULL", (bot,)))
    add = lambda bot, u, via, by, owner=1: (lambda: D.ins('telegram_allowlist', workspace_id=W, bot_id=bot, tg_user_id=u, display_name='Owner mới',
                                                          is_owner=owner, added_via=via, created_by=by))
    upd = lambda row, sql, by: (lambda: db.execute(f"UPDATE telegram_allowlist SET {sql}, updated_by=?, updated_at=? WHERE id=?", (by, now(), row)))
    al0 = D.one("SELECT id FROM telegram_allowlist WHERE bot_id=? AND is_owner=1", tg)
    # --- INSERT hàng owner
    case("admin thêm owner qua capture (bot đã có owner)", add(tg, 7001, 'capture', adm), MSG_AL_NEW_T)
    case("tác tử Telegram thêm owner qua capture (bot đã có owner)", add(tg, 7002, 'capture', tele), MSG_AL_NEW_T)
    case("owner thêm owner qua nhập tay (manual)", add(tg, 7003, 'manual', own), MSG_AL_NEW_T)
    # --- nâng hàng thường / kích hoạt lại
    th = add(tg, 4242, 'manual', own, 0)()
    cap = add(tg, 4343, 'capture', tele, 0)()
    case("admin nâng Thảo lên owner (kèm đổi added_via = capture)", upd(th, "is_owner=1, added_via='capture'", adm), MSG_AL_NEW_T)
    case("owner nâng hàng nhập tay (manual) lên owner", upd(th, "is_owner=1", own), MSG_AL_NEW_T)
    case("tác tử nâng hàng capture lên owner", upd(cap, "is_owner=1", tele), MSG_AL_NEW_T)
    case("chuỗi tấn công: admin gỡ owner thật (vẫn là owner cuối)", upd(al0, "status='removed'", adm), MSG_AL_LAST_T)
    # --- luồng A3.T "Đổi tài khoản Telegram của bạn": owner thêm owner mới qua capture → gỡ hàng cũ
    a3t_add = _try(add(tg, 8001, 'capture', own))
    a3t_rm = _try(upd(al0, "status='removed'", own))
    own_a3t = owners(tg)
    case("admin kích hoạt lại hàng owner đã gỡ (AL-0001)", upd(al0, "status='active'", adm), MSG_AL_NEW_T)
    re_own = _try(upd(al0, "status='active'", own))
    up_own = _try(upd(cap, "is_owner=1", own))
    # --- bootstrap: bot mới chưa có owner
    sec = D.ins('secrets', workspace_id=W, kind='telegram_bot_token', label='bot', ciphertext=b'x', nonce=b'n', wrapped_dek=b'd', dek_nonce=b'n',
                kek_id='kek1', fingerprint='fp')
    tb = D.ins('telegram_bots', workspace_id=W, role_id=lan, bot_username='lan_office02_bot', bot_tg_id=222, secret_id=sec, status='active')
    case("bootstrap qua nhập tay (manual)", add(tb, 999, 'manual', tele), MSG_AL_NEW_T)
    boot = _try(add(tb, 999, 'capture', tele))
    case("sau bootstrap: tác tử thêm owner thứ hai qua capture", add(tb, 1001, 'capture', tele), MSG_AL_NEW_T)
    # --- khôi phục bot đã xoá mềm: chỉ owner của workspace
    db.execute("UPDATE telegram_bots SET deleted_at=?, updated_by=? WHERE id=?", (now(), own, tb))
    case("admin khôi phục bot đã xoá mềm", lambda: db.execute("UPDATE telegram_bots SET deleted_at=NULL, updated_by=? WHERE id=?", (adm, tb)),
         MSG_TG_RESTORE_OWNER_T)
    rest_ok = _try(lambda: db.execute("UPDATE telegram_bots SET deleted_at=NULL, updated_by=? WHERE id=?", (own, tb)))
    # --- bảo trì được miễn
    D.ctx.maint = 1
    maint_ok = _try(add(tg, 9001, 'manual', adm))
    D.ctx.maint = 0
    ok = (all(x[1] for x in c) and a3t_add and a3t_rm and own_a3t == [8001] and re_own and up_own and boot and rest_ok and maint_ok
          and owners(tg) == [999, 4343, 8001, 9001] and owners(tb) == [999])
    report("AL-owner-create", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn: admin / tác tử thêm owner (bot đã có owner), owner thêm qua nhập tay, admin nâng "
           f"(kể cả tự đổi added_via), owner nâng hàng nhập tay, tác tử nâng hàng capture, admin gỡ owner thật, admin kích hoạt lại owner đã gỡ, bootstrap qua "
           f"nhập tay, tác tử thêm owner thứ hai sau bootstrap, admin khôi phục bot; thuận: A3.T owner thêm qua capture rồi gỡ hàng cũ ⇒ {own_a3t}, owner kích "
           f"hoạt lại ({'được' if re_own else 'BỊ CHẶN'}), owner nâng hàng capture ({'được' if up_own else 'BỊ CHẶN'}), bootstrap bot mới qua capture "
           f"({'được' if boot else 'BỊ CHẶN'}), owner khôi phục bot ({'được' if rest_ok else 'BỊ CHẶN'}), bảo trì ({'được' if maint_ok else 'BỊ CHẶN'}) ⇒ "
           f"owner TG-0003 {owners(tg)}, bot mới {owners(tb)}")
    _show(c)

# ================================================================== v2.3.0 — CONTRACT-r9 (Kho nhân vật MVP + 16 trạng thái avatar; [ĐỀ XUẤT — Gen vòng 9])
# [CHỐT — Ryan 2026-10-16: "ok kho làm ở mvp, xưởng để gđ2" (Q-I8)] — Kho vào MVP, Xưởng sang GĐ2. Mọi luật cụ thể dưới đây là [ĐỀ XUẤT — Gen vòng 9].
MSG_SN_WRITER_I_T = 'thêm nhân vật / cài gói skin'
MSG_SN_WRITER_U_T = 'chỉ owner/admin sửa danh mục nhân vật'
MSG_AV_DISABLED_T = 'nhân vật đã tắt trong Kho — không gán mới'
MSG_RL_AV_OWN_T = 'AV- của chính Role'
MSG_RL_AV_SEL_T = 'không gán / khôi phục ảnh thư viện'
MSG_AV_SET_T = 'avatar.transient_seconds = số nguyên giây'
AV_STATES = ['error', 'failover', 'penalty', 'quota', 'rest', 'wait', 'discover', 'rank1', 'reward', 'commit', 'unsure', 'think', 'run', 'idle',
             'sleep', 'normal']
AV_LABELS = dict(zip(AV_STATES, ['Lỗi', 'Đổi CLI', 'Bị phạt', 'Hết quota', 'Nghỉ dưỡng thương', 'Chờ duyệt', 'Kinh ngạc', 'Lên #1', 'Nhận thưởng',
                                 'Hứa quyết tâm', 'Nói không chắc', 'Suy tư', 'Đang làm', 'Rảnh', 'Ngủ', 'Bình thường']))
T9 = '2026-10-20T03:00:00.000Z'      # thứ Ba 10:00 giờ VN — trong giờ làm của Mai (giờ im lặng 22:00–07:30), xa mọi mốc của seed (15/10)
S9 = '2026-10-17T03:00:00.000Z'      # thứ Bảy 10:00 giờ VN
W9 = '2026-10-21T03:00:00.000Z'      # thứ Tư 10:00 giờ VN

def _at(base, sec):
    t = datetime.datetime.strptime(base, '%Y-%m-%dT%H:%M:%S.%fZ') + datetime.timedelta(seconds=sec)
    return t.strftime('%Y-%m-%dT%H:%M:%S.') + f'{t.microsecond // 1000:03d}Z'

def _member_actor(D, ws, key, level, n):
    """Thành viên đang hoạt động của ws với access_level cho trước (operator / viewer) — ca âm 'chỉ owner/admin'."""
    db = D.db
    u = uid('user:' + key)
    db.execute("""INSERT INTO users(id,display_id,display_seq,username,display_name,password_hash,must_change_password,password_changed_at)
                  VALUES(?,?,?,?,?,?,0,?)""", (u, f'US-{n:04d}', n, key, key.title(), 'argon2id$x', now()))
    a = uid(f'actor:{ws}:{key}')
    db.execute("INSERT INTO actors(id,workspace_id,kind,user_id,label) VALUES(?,?,?,?,?)", (a, ws, 'user', u, key.title()))
    db.execute("INSERT INTO workspace_members(workspace_id,user_id,access_level) VALUES(?,?,?)", (ws, u, level))
    return a

def _pick(D, role, sn):
    """Gán — bước 1: AV- nguồn library CHÉP gói / mã / license / ghi công / sha256 của nhân vật (nút "Gán cho Role…" ở A11, tab Thư viện ở A1)."""
    sid, ws, pack, code, lic, attr, sha = D.db.execute("SELECT id, workspace_id, pack_slug, asset_code, license, attribution, sha256 FROM skin_assets "
                                                      "WHERE id=?", (sn,)).fetchone()
    return D.ins('avatars', workspace_id=ws, role_id=role, source='library', skin_asset_id=sid, skin_pack_slug=pack, skin_asset_code=code,
                 skin_license=lic, skin_attribution=attr, skin_sha256=sha)

def _set_av(D, role, av, by):
    """Trỏ avatar hiện hành (bước 2 của Gán; "Khôi phục" ở lưới Lịch sử)."""
    D.db.execute("UPDATE roles SET avatar_id=?, updated_by=?, updated_at=?, version=version+1 WHERE id=?", (av, by, now(), role))

def _assign(D, role, sn, by):
    """Gán cho Role… = MỘT transaction: AV- mới (library) + trỏ roles.avatar_id (+ audit avatar.assign ở app)."""
    def go():
        av = _pick(D, role, sn)
        _set_av(D, role, av, by)
        return av
    return D.txn(go)

def _toggle(D, sn, on, by):
    D.db.execute("UPDATE skin_assets SET is_enabled=?, updated_by=?, updated_at=?, version=version+1 WHERE id=?", (on, by, now(), sn))

def _avs(D, role):
    return D.db.execute("SELECT state, source_table, source_display_id, since_at, expires_at, state_note, state_label, state_rank FROM v_role_avatar_state "
                        "WHERE role_id=?", (role,)).fetchone()

def _chibi_kw(W, code, **kw):
    p = jcs({'id': code, 'schema': 1})
    d = dict(workspace_id=W, pack_slug=TQ_PACK, pack_version=TQ_VERSION, asset_code=code, name_vi='Nhân vật thử', asset_kind='chibi', params_json=p,
             params_schema_version=1, sha256=hashlib.sha256(p.encode()).hexdigest(), source=TQ_SOURCE, license=TQ_LICENSE, char_kind='martial', gender='male')
    d.update(kw)
    return d

def t_v230_catalog():
    """v2.3.0 (CONTRACT-r9 §B): nhân vật chibi = BỘ THAM SỐ JSON (không tệp ảnh) + phiên bản schema + sha256 của JSON chuẩn hoá (JCS); seed gói tam-quoc-chibi
    1.0.0 với 10 mã (SN-0001…0010 theo thứ tự hợp đồng); hàng portrait cũ vẫn hợp lệ; chỉ owner/admin hoặc actor system của CHÍNH workspace cài nhân vật
    (skin_assets_writer_i — lối vào "nhân vật đang bật")."""
    D, X = seed()
    db, W, W2, A = D.db, X['W'], X['W2'], X['A']
    rows = db.execute("SELECT display_id, asset_code, asset_kind, pack_slug, pack_version, params_json, params_schema_version, sha256, file_path, mime, "
                      "source, license, attribution, is_enabled, status, char_kind, gender, name_vi, name_zh, faction FROM skin_assets WHERE workspace_id=? "
                      "ORDER BY display_seq", (W,)).fetchall()
    codes = [r[1] for r in rows]
    sha_ok = all(r[7] == hashlib.sha256(r[5].encode()).hexdigest() and r[5] == jcs(json.loads(r[5])) for r in rows)
    shape_ok = all(r[2:5] == ('chibi', TQ_PACK, TQ_VERSION) and r[6] == 1 and r[8] is None and r[9] is None and r[10] == TQ_SOURCE
                   and r[11] == TQ_LICENSE and r[12] is None and r[13] == 1 and r[14] == 'active' for r in rows)
    meta_ok = [(r[1], r[17], r[18], r[19], r[15], r[16]) for r in rows] == [tuple(t) for t in TQ_CHIBI]
    lib = db.execute("SELECT count(*), sum(is_selectable), sum(roles_using) FROM v_character_library WHERE workspace_id=?", (W,)).fetchone()
    adm, opr = _admin_actor(D, W), _member_actor(D, W, 'olga', 'operator', 3)
    def chibi(code, drop=(), **kw):
        d = _chibi_kw(W, code, **kw)
        for k in drop:
            d.pop(k)
        return lambda: D.ins('skin_assets', **d)
    c, case = _cases(db)
    case("chibi thiếu bộ tham số (params_json + phiên bản schema)", chibi('tqx101', drop=('params_json', 'params_schema_version')), 'CHECK constraint')
    case("chibi kèm tệp ảnh (file_path + mime)", chibi('tqx102', file_path='skins/x.webp', mime='image/webp'), 'CHECK constraint')
    case("tham số có $.id khác asset_code", chibi('tqx103', params_json=jcs({'id': 'tq044', 'schema': 1})), 'CHECK constraint')
    case("tham số có $.schema khác params_schema_version", chibi('tqx104', params_schema_version=2), 'CHECK constraint')
    case('$.schema là chuỗi "1" (sai kiểu)', chibi('tqx105', params_json=jcs({'id': 'tqx105', 'schema': '1'})), 'CHECK constraint')
    case("tham số là mảng, không phải object", chibi('tqx106', params_json='[1]'), 'CHECK constraint')
    case("tham số không phải JSON", chibi('tqx107', params_json='{id:tqx107}'), 'CHECK constraint|malformed JSON')
    case("chibi thiếu Kiểu (char_kind)", chibi('tqx108', drop=('char_kind',)), 'CHECK constraint')
    case("chibi thiếu Giới (gender)", chibi('tqx109', drop=('gender',)), 'CHECK constraint')
    case("Kiểu ngoài danh sách ('van')", chibi('tqx110', char_kind='van'), 'CHECK constraint')
    case("portrait thiếu tệp ảnh", chibi('tqx111', asset_kind='portrait', drop=('params_json', 'params_schema_version')), 'CHECK constraint')
    case("portrait kèm bộ tham số", chibi('tqx112', asset_kind='portrait', file_path='skins/x.webp', mime='image/webp'), 'CHECK constraint')
    case("portrait có tệp mà thiếu mime", chibi('tqx121', asset_kind='portrait', file_path='skins/x.webp', drop=('params_json', 'params_schema_version')),
         'CHECK constraint')
    case("phiên bản schema mà không có tham số", chibi('tqx113', asset_kind='portrait', file_path='skins/x.webp', mime='image/webp',
                                                       drop=('params_json',)), 'CHECK constraint')
    case("trùng mã đang sống (tq044)", chibi('tq044'), 'UNIQUE')
    case("Role (Mai) cài nhân vật", chibi('tqx114', created_by=A[(W, 'Mai')]), MSG_SN_WRITER_I_T)
    case("tác tử hệ thống khác 'system' (Trainer) cài nhân vật", chibi('tqx115', created_by=A[(W, 'trainer')]), MSG_SN_WRITER_I_T)
    case("thành viên operator cài nhân vật", chibi('tqx116', created_by=opr), MSG_SN_WRITER_I_T)
    case("owner của workspace KHÁC cài vào workspace này", chibi('tqx117', created_by=A[(W2, 'owner')]), MSG_SN_WRITER_I_T)
    case("actor system của workspace KHÁC cài vào workspace này", chibi('tqx118', created_by=A[(W2, 'system')]), MSG_SN_WRITER_I_T)
    adm_ok = _try(chibi('tqx119', created_by=adm))
    sys_ok = _try(chibi('tqx120', created_by=A[(W, 'system')]))
    portrait_ok = _try(lambda: D.ins('skin_assets', workspace_id=W, pack_slug='tam-quoc-portrait', pack_version='0.1.0', asset_code='tq046',
                                     name_vi='Gia Cát Lượng', file_path='skins/tam-quoc-portrait/tq046.webp', mime='image/webp',
                                     sha256=hashlib.sha256(b'p').hexdigest(), source='nguồn miễn phí — đang xác minh', license='UNVERIFIED'))
    kinds = db.execute("SELECT asset_kind, count(*) FROM skin_assets WHERE workspace_id=? GROUP BY asset_kind ORDER BY 1", (W,)).fetchall()
    ok = (all(x[1] for x in c) and codes == TQ_CODES and [r[0] for r in rows] == [f'SN-{i:04d}' for i in range(1, 11)] and sha_ok and shape_ok and meta_ok
          and lib == (10, 10, 0) and adm_ok and sys_ok and portrait_ok and kinds == [('chibi', 12), ('portrait', 1)])
    report("KHO-catalog", ok, f"seed {TQ_PACK} {TQ_VERSION}: {len(rows)} nhân vật {rows[0][0]}…{rows[-1][0]} = {', '.join(codes)}; mọi hàng chibi, không tệp ảnh, "
           f"tham số {rows[0][5]} (schema {rows[0][6]}), sha256 = sha256(JCS(tham số)) {'đúng' if sha_ok else 'SAI'}, nguồn \"{TQ_SOURCE}\", license "
           f"\"{TQ_LICENSE}\", ghi công trống, đang bật; Kiểu / Giới / Hán tự / phe khớp {'đúng' if meta_ok else 'SAI'}; v_character_library {lib[0]} hàng, "
           f"{lib[1]} chọn được, {lib[2]} Role dùng; {sum(x[1] for x in c)}/{len(c)} ca bị chặn (14 CHECK tham số / tệp / mime / Kiểu / Giới, trùng mã, 5 lối cài "
           f"của Role / Trainer / operator / owner workspace khác / system workspace khác); thuận: admin cài ({'được' if adm_ok else 'BỊ CHẶN'}), actor system "
           f"cài ({'được' if sys_ok else 'BỊ CHẶN'}), hàng portrait cũ ({'được' if portrait_ok else 'BỊ CHẶN'}) ⇒ {kinds}")
    _show(c)

def t_v230_toggle():
    """v2.3.0 (CONTRACT-r9 §A): chỉ owner/admin bật / tắt nhân vật trong Kho — và MỌI lối khác làm nhân vật "chọn được" lại (khôi phục hàng xoá mềm, bỏ rút,
    đổi mã, đổi tham số / license, INSERT bản sao đang bật sau khi gỡ hàng đã tắt) cũng chỉ owner/admin (skin_assets_writer_u / _i). Ca âm từng lối × từng
    hạng actor (Role, operator, viewer, tác tử, owner workspace khác, không ghi người sửa); thuận: owner tắt / gỡ / rút / khôi phục, admin bật / tắt / cài
    lại, bảo trì (app_maint), xoá cứng nhân vật không ai dùng không cần actor (gỡ không làm nhân vật chọn được)."""
    D, X = seed()
    db, W, W2, A, SN = D.db, X['W'], X['W2'], X['A'], X['SN']
    own, mai_a, tr = A[(W, 'owner')], A[(W, 'Mai')], A[(W, 'trainer')]
    adm, opr, vwr = _admin_actor(D, W), _member_actor(D, W, 'olga', 'operator', 3), _member_actor(D, W, 'vic', 'viewer', 4)
    upd = lambda sn, sql, by, *p: (lambda: db.execute(f"UPDATE skin_assets SET {sql}, updated_by=?, updated_at=? WHERE id=?", (*p, by, now(), sn)))
    c, case = _cases(db)
    for who, by in (('Role (Mai)', mai_a), ('operator', opr), ('viewer', vwr), ('tác tử Trainer', tr), ('owner của workspace khác', A[(W2, 'owner')])):
        case(f"{who} tắt Quan Vũ", upd(SN['tq044'], 'is_enabled=0', by), MSG_SN_WRITER_U_T)
    case("tắt mà không ghi người sửa (updated_by vẫn NULL)", lambda: db.execute("UPDATE skin_assets SET is_enabled=0 WHERE id=?", (SN['tq044'],)),
         MSG_SN_WRITER_U_T)
    off_ok = _try(upd(SN['tq044'], 'is_enabled=0', own))
    case("Role bật lại Quan Vũ", upd(SN['tq044'], 'is_enabled=1', mai_a), MSG_SN_WRITER_U_T)
    case("operator bật lại Quan Vũ", upd(SN['tq044'], 'is_enabled=1', opr), MSG_SN_WRITER_U_T)
    soft_ok = _try(upd(SN['tq045'], 'deleted_at=?', own, now()))                     # owner gỡ (xoá mềm) Trương Phi
    case("Role khôi phục nhân vật đã xoá mềm", upd(SN['tq045'], 'deleted_at=NULL', mai_a), MSG_SN_WRITER_U_T)
    wd_ok = _try(upd(SN['tq047'], "status='withdrawn'", own))                       # owner rút Triệu Vân
    case("Role bỏ rút (withdrawn → active)", upd(SN['tq047'], "status='active'", mai_a), MSG_SN_WRITER_U_T)
    case("Role đổi mã nhân vật (Lưu Bị → tq999)", upd(SN['tq043'], "asset_code='tq999', params_json=?", mai_a, jcs({'id': 'tq999', 'schema': 1})),
         MSG_SN_WRITER_U_T)
    case("Role sửa bộ tham số (đổi ngoại hình Gia Cát Lượng)", upd(SN['tq046'], 'params_json=?', mai_a, jcs({'beard': 'long', 'id': 'tq046', 'schema': 1})),
         MSG_SN_WRITER_U_T)
    case("Role sửa license", upd(SN['tq080'], "license='CC0'", mai_a), MSG_SN_WRITER_U_T)
    case("Role xoá mềm (gỡ) nhân vật", upd(SN['tq010'], 'deleted_at=?', mai_a, now()), MSG_SN_WRITER_U_T)
    hard_ok = _try(lambda: db.execute("DELETE FROM skin_assets WHERE id=?", (SN['tq044'],)))   # gỡ hàng đã tắt (không ai dùng) — DELETE không cần actor
    copy = lambda by: (lambda: D.ins('skin_assets', **_chibi_kw(W, 'tq044', name_vi='Quan Vũ', name_zh='關羽', faction='Thục', created_by=by)))
    case("Role cài lại bản sao ĐANG BẬT của Quan Vũ (sau khi hàng đã tắt bị gỡ)", copy(mai_a), MSG_SN_WRITER_I_T)
    case("operator cài lại bản sao đang bật", copy(opr), MSG_SN_WRITER_I_T)
    adm_copy = _try(copy(adm))
    restore_ok = _try(upd(SN['tq045'], 'deleted_at=NULL', own))
    adm_toggle = _try(upd(SN['tq031'], 'is_enabled=0', adm)) and _try(upd(SN['tq031'], 'is_enabled=1', adm))
    D.ctx.maint = 1
    maint_ok = _try(lambda: db.execute("UPDATE skin_assets SET version=version+1 WHERE id=?", (SN['tq010'],)))
    D.ctx.maint = 0
    lib = {r[0]: tuple(r[1:]) for r in db.execute("SELECT asset_code, is_enabled, status, is_selectable FROM v_character_library WHERE workspace_id=?", (W,))}
    exp = {code: (1, 'active', 1) for code in TQ_CODES}
    exp['tq047'] = (1, 'withdrawn', 0)
    ok = (all(x[1] for x in c) and off_ok and soft_ok and wd_ok and hard_ok and adm_copy and restore_ok and adm_toggle and maint_ok and lib == exp)
    report("KHO-toggle", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn: tắt bởi Role / operator / viewer / tác tử / owner workspace khác / không ghi "
           f"người sửa; bật lại bởi Role / operator; Role khôi phục hàng xoá mềm, bỏ rút, đổi mã, sửa tham số, sửa license, xoá mềm; Role / operator cài lại "
           f"bản sao đang bật; thuận: owner tắt ({'được' if off_ok else 'BỊ CHẶN'}), owner gỡ / rút / khôi phục, xoá cứng hàng đã tắt không ai dùng "
           f"({'được' if hard_ok else 'BỊ CHẶN'}), admin cài lại ({'được' if adm_copy else 'BỊ CHẶN'}), admin tắt + bật ({'được' if adm_toggle else 'BỊ CHẶN'}), "
           f"bảo trì ({'được' if maint_ok else 'BỊ CHẶN'}) ⇒ Kho {len(lib)} hàng, {sum(v[2] for v in lib.values())} chọn được (tq047 rút)")
    _show(c)

def t_v230_assign():
    """v2.3.0 (CONTRACT-r9 §A): Gán cho Role… (AV- nguồn library + trỏ roles.avatar_id, một transaction). TẮT nhân vật ⇒ không gán mới được ở MỌI lối: INSERT
    avatars; Gán qua transaction; UPDATE avatars; khôi phục AV cũ; trỏ AV tạo lúc còn bật rồi mới tắt (hoán vị thời gian); trỏ AV của Role khác (nhân vật bật /
    tắt) / AV chưa tồn tại (FK hoãn); INSERT Role có sẵn avatar_id; khôi phục AV của nhân vật đã rút / đã xoá mềm / đã gỡ gói. Role đang dùng GIỮ NGUYÊN (UPDATE
    cột khác, ghi lại cùng avatar, xoá mềm + khôi phục Role, chuyển sang monogram); Kho đếm Role đang dùng; bật lại ⇒ gán / khôi phục được; gỡ khi còn dùng
    vẫn chặn."""
    D, X = seed()
    db, W, A, SN, mai, lan = D.db, X['W'], X['A'], X['SN'], X['mai'], X['lan']
    own = A[(W, 'owner')]
    c, case = _cases(db)
    mono = lambda role: (lambda: (lambda av: (_set_av(D, role, av, own), av)[1])(D.ins('avatars', workspace_id=W, role_id=role, source='monogram')))
    using = lambda code: D.one("SELECT roles_using FROM v_character_library WHERE skin_asset_id=?", SN[code])
    av_lan44 = _assign(D, lan, SN['tq044'], own)                                     # Lan dùng Quan Vũ
    av_mai46 = _assign(D, mai, SN['tq046'], own)                                     # Mai dùng Gia Cát Lượng …
    used46 = using('tq046')
    for code in ('tq141', 'tq010', 'tq031'):
        _assign(D, mai, SN[code], own)                                               # … rồi Tôn Thượng Hương, Điêu Thuyền, Hoa Đà (lịch sử) …
    av_mai141, av_mai10, av_mai31 = [D.one("SELECT id FROM avatars WHERE role_id=? AND skin_asset_code=?", mai, k) for k in ('tq141', 'tq010', 'tq031')]
    av_mono = mono(mai)()                                                             # … rồi về monogram
    unused46 = using('tq046')
    av_mai47 = _pick(D, mai, SN['tq047'])                                            # AV Triệu Vân tạo lúc còn bật, CHƯA trỏ
    av_lan80 = _pick(D, lan, SN['tq080'])                                            # AV Tào Tháo của Lan (nhân vật bật), không phải avatar hiện hành
    usage0 = db.execute("SELECT asset_code, role_display_id, is_current FROM v_skin_pack_usage WHERE skin_asset_id=?", (SN['tq044'],)).fetchall()
    for code in ('tq044', 'tq046', 'tq047'):
        _toggle(D, SN[code], 0, own)                                                 # owner TẮT — Lan đang dùng Quan Vũ: không chặn
    db.execute("UPDATE skin_assets SET status='withdrawn', updated_by=?, updated_at=? WHERE id=?", (own, now(), SN['tq141']))   # rút
    db.execute("UPDATE skin_assets SET deleted_at=?, updated_by=?, updated_at=? WHERE id=?", (now(), own, now(), SN['tq010']))   # xoá mềm
    db.execute("DELETE FROM skin_assets WHERE id=?", (SN['tq031'],))                                                            # gỡ (FK ⇒ NULL)
    keep = D.one("SELECT avatar_id FROM roles WHERE id=?", lan) == av_lan44
    lib44 = db.execute("SELECT is_enabled, is_selectable, roles_using FROM v_character_library WHERE skin_asset_id=?", (SN['tq044'],)).fetchone()
    tab = D.one("SELECT count(*) FROM v_character_library WHERE workspace_id=? AND is_selectable=1", W)      # tab Thư viện của modal Ảnh đại diện
    flag = db.execute("SELECT character_disabled, asset_code, avatar_source FROM v_role_avatar_state WHERE role_id=?", (lan,)).fetchone()
    case("(1) gán mới nhân vật đã tắt — INSERT avatars", lambda: _pick(D, mai, SN['tq044']), MSG_AV_DISABLED_T)
    case("(1') Gán cho Role… nhân vật đã tắt (một transaction)", lambda: _assign(D, mai, SN['tq046'], own), MSG_AV_DISABLED_T)
    case("(2) UPDATE avatars: AV monogram trỏ sang nhân vật đã tắt", lambda: db.execute(
        "UPDATE avatars SET source='library', skin_asset_id=?, skin_pack_slug='tam-quoc-chibi', skin_asset_code='tq044' WHERE id=?", (SN['tq044'], av_mono)),
        'append-only')
    case("(3) khôi phục AV cũ của nhân vật đã tắt (lịch sử Mai)", lambda: _set_av(D, mai, av_mai46, own), MSG_RL_AV_SEL_T)
    case("(3') hoán vị thời gian: AV tạo lúc còn bật, trỏ sau khi tắt", lambda: _set_av(D, mai, av_mai47, own), MSG_RL_AV_SEL_T)
    case("(4) trỏ Mai sang AV của Lan (nhân vật đang bật)", lambda: _set_av(D, mai, av_lan80, own), MSG_RL_AV_OWN_T)
    case("(4') trỏ Mai sang AV của Lan (nhân vật đã tắt)", lambda: _set_av(D, mai, av_lan44, own), MSG_RL_AV_OWN_T)
    case("(4'') trỏ Mai sang AV chưa tồn tại (FK hoãn, trong transaction)", lambda: D.txn(lambda: _set_av(D, mai, uid('av:ghost'), own)), MSG_RL_AV_OWN_T)
    case("(4''') INSERT Role mới có sẵn avatar_id (AV của Lan)", lambda: D.ins('roles', workspace_id=W, name='Bảo', name_norm='bao', color='slate',
                                                                              avatar_id=av_lan80), MSG_RL_AV_OWN_T)
    case("(5) khôi phục AV của nhân vật đã rút", lambda: _set_av(D, mai, av_mai141, own), MSG_RL_AV_SEL_T)
    case("(5') khôi phục AV của nhân vật đã xoá mềm", lambda: _set_av(D, mai, av_mai10, own), MSG_RL_AV_SEL_T)
    case("(5'') khôi phục AV của nhân vật đã gỡ gói (skin_asset_id NULL)", lambda: _set_av(D, mai, av_mai31, own), MSG_RL_AV_SEL_T)
    case("(6) gỡ nhân vật đã tắt khi Lan còn dùng (DELETE)", lambda: db.execute("DELETE FROM skin_assets WHERE id=?", (SN['tq044'],)), 'gỡ gói skin')
    other_ok = _try(lambda: db.execute("UPDATE roles SET runtime_state='running', updated_by=?, updated_at=? WHERE id=?", (own, now(), lan)))
    same_ok = _try(lambda: _set_av(D, lan, av_lan44, own))
    soft_ok = (_try(lambda: db.execute("UPDATE roles SET deleted_at=?, updated_by=? WHERE id=?", (now(), own, lan)))
               and _try(lambda: db.execute("UPDATE roles SET deleted_at=NULL, updated_by=? WHERE id=?", (own, lan))))
    keep2 = D.one("SELECT avatar_id FROM roles WHERE id=?", lan) == av_lan44
    _toggle(D, SN['tq046'], 1, own); _toggle(D, SN['tq044'], 1, own)                  # owner BẬT lại
    restore_ok = _try(lambda: _set_av(D, mai, av_mai46, own))
    used46b = using('tq046')
    reassign_ok = _try(lambda: _assign(D, mai, SN['tq044'], own))
    using44 = using('tq044')
    flag2 = D.one("SELECT character_disabled FROM v_role_avatar_state WHERE role_id=?", lan)
    off_mono = (_toggle(D, SN['tq044'], 0, own), _try(mono(lan)))[1]                 # Lan rời nhân vật đã tắt sang monogram — luôn được
    ok = (all(x[1] for x in c) and usage0 == [('tq044', 'RL-0002', 1)] and keep and lib44 == (0, 0, 1) and tab == 4 and flag == (1, 'tq044', 'library')
          and used46 == 1 and unused46 == 0 and other_ok and same_ok and soft_ok and keep2 and restore_ok and used46b == 1 and reassign_ok
          and using44 == 2 and flag2 == 0 and off_mono)
    report("KHO-disable-assign", ok, f"Gán Quan Vũ cho Lan (AV- library + roles.avatar_id) ⇒ v_skin_pack_usage {usage0}; tắt Quan Vũ / Gia Cát Lượng / Triệu "
           f"Vân, rút / xoá mềm / gỡ 3 nhân vật khác ⇒ Lan GIỮ ảnh ({'đúng' if keep else 'SAI'}), Kho Quan Vũ (bật, chọn được, Role dùng) = {lib44}, tab Thư "
           f"viện còn {tab} nhân vật, Hồ sơ Role cờ \"đã tắt\" = {flag[0]}; {sum(x[1] for x in c)}/{len(c)} ca bị chặn (INSERT avatars, Gán một transaction, "
           f"UPDATE avatars, khôi phục AV cũ, hoán vị thời gian, AV Role khác ×2, AV chưa có, INSERT Role có avatar, khôi phục AV nhân vật rút / xoá mềm / gỡ, "
           f"gỡ khi còn dùng); thuận: Lan sửa cột khác, ghi lại cùng avatar, xoá mềm + khôi phục Role ⇒ vẫn giữ ảnh; bật lại ⇒ khôi phục AV cũ "
           f"({'được' if restore_ok else 'BỊ CHẶN'}), gán lại Quan Vũ ({'được' if reassign_ok else 'BỊ CHẶN'}); Role dùng Gia Cát Lượng {used46} → {unused46} "
           f"→ {used46b}; Lan sang monogram khi nhân vật tắt ({'được' if off_mono else 'BỊ CHẶN'})")
    _show(c)

def t_v230_settings():
    """v2.3.0 (CONTRACT-r9 §C/§D): 3 setting mới — avatar.transient_seconds (giây 1–600, mặc định 20), avatar.idle_after_minutes (phút 1–1440, mặc định 10),
    ui.avatar_motion ("full" mặc định · "subtle" · "off") — kiểu + khoảng + chỉ owner/admin (settings_avatar_i/_u; actor system lúc dựng workspace); đổi khoá
    đi / về bị chặn; v_role_avatar_state đọc giá trị, thiếu hàng ⇒ mặc định."""
    D, X = seed()
    db, W, W2, A = D.db, X['W'], X['W2'], X['A']
    own, mai_a = A[(W, 'owner')], A[(W, 'Mai')]
    adm, opr = _admin_actor(D, W), _member_actor(D, W, 'olga', 'operator', 3)
    ins = lambda k, v, by=None, ws=None: (lambda: D.ins('settings', workspace_id=ws or W, key=k, value_json=v, created_by=by or own))
    upd = lambda k, sql, by, *p: (lambda: db.execute(f"UPDATE settings SET {sql}, updated_by=?, updated_at=? WHERE workspace_id=? AND key=? "
                                                     f"AND deleted_at IS NULL", (*p, by, now(), W, k)))
    view = lambda: db.execute("SELECT DISTINCT transient_seconds, idle_after_minutes FROM v_role_avatar_state WHERE workspace_id=?", (W,)).fetchall()
    d0 = view()
    c, case = _cases(db)
    for k, v, why in (('avatar.transient_seconds', '0', '0 giây'), ('avatar.transient_seconds', '601', '601 giây'),
                      ('avatar.transient_seconds', '"20"', 'chuỗi "20"'), ('avatar.transient_seconds', '20.5', 'số thực 20.5'),
                      ('avatar.idle_after_minutes', '0', '0 phút'), ('avatar.idle_after_minutes', '1441', '1441 phút'),
                      ('avatar.idle_after_minutes', 'true', 'true'), ('avatar.idle_after_minutes', '15.5', 'số thực 15.5'),
                      ('ui.avatar_motion', '"fast"', '"fast"'), ('ui.avatar_motion', '1', 'số 1'),
                      ('ui.avatar_motion', '"FULL"', '"FULL" (chữ hoa)')):
        case(f"INSERT {k} = {why}", ins(k, v), MSG_AV_SET_T)
    case("Role (Mai) ghi avatar.transient_seconds hợp lệ", ins('avatar.transient_seconds', '20', mai_a), MSG_AV_SET_T)
    case("operator ghi ui.avatar_motion hợp lệ", ins('ui.avatar_motion', '"off"', opr), MSG_AV_SET_T)
    case("actor system của workspace KHÁC ghi vào workspace này", ins('ui.avatar_motion', '"off"', A[(W2, 'system')]), MSG_AV_SET_T)
    D.ins('settings', workspace_id=W, key='instance.name', value_json='"office-01"', created_by=own)
    case("đổi khoá instance.name → avatar.transient_seconds (giá trị rác)", upd('instance.name', "key='avatar.transient_seconds'", own), MSG_AV_SET_T)
    t_ok = _try(ins('avatar.transient_seconds', '5'))
    case("owner đổi khoá avatar.transient_seconds → avatar.idle_after_minutes (giá trị 5 hợp lệ cả hai)",
         upd('avatar.transient_seconds', "key='avatar.idle_after_minutes'", own), MSG_AV_SET_T)
    case("owner đổi khoá avatar.transient_seconds → instance.name.bak", upd('avatar.transient_seconds', "key='instance.name.bak'", own), MSG_AV_SET_T)
    rest_ok = _try(ins('avatar.idle_after_minutes', '15')) and _try(ins('ui.avatar_motion', '"subtle"'))
    case("owner sửa avatar.transient_seconds = 0", upd('avatar.transient_seconds', "value_json='0'", own), MSG_AV_SET_T)
    case('owner sửa ui.avatar_motion = "none"', upd('ui.avatar_motion', "value_json='\"none\"'", own), MSG_AV_SET_T)
    case("Role sửa avatar.idle_after_minutes = 20 (hợp lệ)", upd('avatar.idle_after_minutes', "value_json='20'", mai_a), MSG_AV_SET_T)
    case("operator xoá mềm ui.avatar_motion", upd('ui.avatar_motion', 'deleted_at=?', opr, now()), MSG_AV_SET_T)
    adm_ok = _try(upd('avatar.idle_after_minutes', "value_json='30'", adm))
    d1 = view()
    del_ok = _try(upd('ui.avatar_motion', 'deleted_at=?', own, now()))              # về mặc định "full"
    motion = D.one("SELECT count(*) FROM settings WHERE workspace_id=? AND key='ui.avatar_motion' AND deleted_at IS NULL", W)
    sys_ok = _try(ins('avatar.transient_seconds', '20', A[(W2, 'system')], W2))      # actor system lúc dựng workspace
    ok = (all(x[1] for x in c) and d0 == [(20, 10)] and t_ok and rest_ok and adm_ok and d1 == [(5, 30)] and del_ok and motion == 0 and sys_ok)
    report("AVATAR-settings", ok, f"mặc định (không có hàng) ⇒ view T = {d0[0][0]} giây, N = {d0[0][1]} phút; {sum(x[1] for x in c)}/{len(c)} ca bị chặn "
           f"(11 giá trị sai kiểu / ngoài khoảng, Role / operator / system workspace khác ghi, đổi khoá đi / về ×3, owner sửa giá trị sai ×2, Role sửa, operator "
           f"xoá mềm); thuận: owner ghi 3 khoá, admin sửa N = 30 ⇒ view {d1}, owner xoá mềm ui.avatar_motion (về \"full\") "
           f"({'được' if del_ok else 'BỊ CHẶN'}), actor system ghi lúc dựng workspace ({'được' if sys_ok else 'BỊ CHẶN'})")
    _show(c)

def t_v230_state_matrix():
    """v2.3.0 (CONTRACT-r9 §C): v_role_avatar_state — đúng MỘT hàng / Role; dựng lần lượt điều kiện của cả 16 trạng thái trên Mai (từ ưu tiên thấp lên cao,
    đồng hồ giả app_now()) — mỗi bước trạng thái mới THẮNG mọi trạng thái đang có thấp hơn; kiểm nguồn (bảng + ID), từ lúc, hết hạn lúc, nhãn tiếng Việt."""
    seen = []
    try:
        D, X = seed()
        db, W, A, EN, CT, mai, lan = D.db, X['W'], X['A'], X['EN'], X['CT'], X['mai'], X['lan']
        own, mai_a = A[(W, 'owner')], A[(W, 'Mai')]
        def snap(sec, want, role=None):
            _set_clock(T9, sec)
            s = _avs(D, role or mai)
            if role is None:
                seen.append((want, s))
            return s
        # 0. dọn điều kiện nền của seed: PM của Mai được duyệt (hết "chờ duyệt"); TK-0461 vẫn chạy ⇒ có việc ⇒ chưa rảnh
        db.execute("UPDATE permission_requests SET status='approved', decided_at=?, decided_by=?, updated_by=? WHERE role_id=?", (now(), own, own, mai))
        snap(0, 'normal')
        snap(13 * 3600, 'sleep')                                    # 16:00Z = 23:00 giờ VN — trong giờ im lặng 22:00–07:30 (PP- của Mai)
        db.execute("UPDATE tasks SET status='done', completed_at=?, updated_by=? WHERE assignee_role_id=? AND status='running'", (now(), own, mai))
        snap(0, 'idle')                                             # thẻ issued, giờ làm, không việc mở, không chạy ≥ 10 phút (mốc: cấp thẻ CD-0004)
        ss = D.ins('sessions', workspace_id=W, agent_kind='role', role_id=mai, trigger='task', engine_account_id=EN['mai_ag'], container_id=CT['Mai'],
                   started_at=_at(T9, 60), title='Báo cáo tuần 42')
        snap(65, 'run')                                             # pha chưa đo được (NULL) ⇒ run + ghi chú
        db.execute("UPDATE sessions SET phase='planning', phase_at=? WHERE id=?", (_at(T9, 70), ss))
        snap(75, 'think')
        th = D.one("SELECT id FROM chat_threads WHERE role_id=? AND kind='assistant'", mai)
        D.ins('chat_messages', workspace_id=W, thread_id=th, author_kind='role', author_actor_id=mai_a, channel='web', certainty='unsure',
              content='Em nghĩ doanh số tuần này tăng khoảng 12 % — em chưa đối chiếu lại nguồn.', created_at=_at(T9, 100))
        snap(105, 'unsure')
        D.ins('commitments', workspace_id=W, position_id=X['PS'], promised_by_role_id=mai, counterparty_kind='owner', statement='Gửi báo cáo tuần 42 trước 17:00',
              due_at=_at(T9, 7 * 3600), source='conversation', created_at=_at(T9, 110))
        snap(112, 'commit')
        au1, _ = audit(D, W, 'ledger.grant', entity_id=mai)
        post(D, W, 'grant', X['WT'], X['WM'], 1000, 'Owner thưởng nóng', evidence_audit_id=au1, role_id=mai, created_at=_at(T9, 120))
        snap(121, 'reward')
        bal_mai = D.one("SELECT balance_minor FROM wallets WHERE id=?", X['WM'])
        au2, _ = audit(D, W, 'ledger.grant', entity_id=lan)
        post(D, W, 'grant', X['WT'], X['WL'], bal_mai + 5000, 'Owner cấp thêm cho Lan (hồi phục)', evidence_audit_id=au2, role_id=lan,
             created_at=_at(T9, 130))
        lan_r1 = snap(131, None, lan)                               # Lan vượt Mai ⇒ Lan "Lên #1" (thắng reward của cùng bút toán)
        au3, _ = audit(D, W, 'ledger.grant', entity_id=mai)
        lg140 = post(D, W, 'grant', X['WT'], X['WM'], 10000, 'Owner thưởng dự án', evidence_audit_id=au3, role_id=mai, created_at=_at(T9, 140))
        snap(141, 'rank1')                                          # Mai giành lại #1 ⇒ rank1 (nguồn = bút toán vừa ghi) thắng reward
        lan_after = snap(141, None, lan)                            # Lan mất #1 ⇒ còn reward (bút toán lúc 130 vẫn trong T)
        sha_k = hashlib.sha256(b'quy-trinh-bao-gia-moi').hexdigest()
        bk = D.ins('blobs', workspace_id=W, sha256=sha_k, size_bytes=21, storage_path=f'/data/blobs/{W}/{sha_k[:2]}/{sha_k[2:4]}/{sha_k}')
        kn = D.ins('knowledge_items', workspace_id=W, scope='personal', role_id=mai, title='quy-trinh-bao-gia-moi.pdf', file_name='quy-trinh-bao-gia-moi.pdf',
                   mime='application/pdf', file_type='PDF', size_bytes=21, blob_id=bk, sha256=sha_k, source='ai_inferred')
        cs = D.ins('change_sets', workspace_id=W, scope='role', role_id=mai, proposed_by=A[(W, 'trainer')], title='Học quy trình báo giá mới')
        D.ins('change_set_items', workspace_id=W, change_set_id=cs, op='create', knowledge_item_id=kn, status='accepted')
        cs2 = D.ins('change_sets', workspace_id=W, scope='role', role_id=mai, proposed_by=A[(W, 'trainer')], title='Cập nhật bảng giá (sửa tri thức cũ)')
        D.ins('change_set_items', workspace_id=W, change_set_id=cs2, op='update', knowledge_item_id=X['kn'], status='accepted')
        db.execute("UPDATE change_sets SET status='applied', decided_at=?, decided_by=?, updated_by=? WHERE id=?", (_at(T9, 143), own, own, cs2))
        sha_r = hashlib.sha256(b'tai-lieu-bi-tu-choi').hexdigest()
        br = D.ins('blobs', workspace_id=W, sha256=sha_r, size_bytes=19, storage_path=f'/data/blobs/{W}/{sha_r[:2]}/{sha_r[2:4]}/{sha_r}')
        kr = D.ins('knowledge_items', workspace_id=W, scope='personal', role_id=mai, title='tai-lieu-bi-tu-choi.pdf', file_name='tai-lieu-bi-tu-choi.pdf',
                   mime='application/pdf', file_type='PDF', size_bytes=19, blob_id=br, sha256=sha_r, source='ai_inferred', status='proposed')
        cs3 = D.ins('change_sets', workspace_id=W, scope='role', role_id=mai, proposed_by=A[(W, 'trainer')], title='Học tài liệu (bị từ chối)')
        D.ins('change_set_items', workspace_id=W, change_set_id=cs3, op='create', knowledge_item_id=kr, status='rejected')
        db.execute("UPDATE change_sets SET status='rejected', decided_at=?, decided_by=?, updated_by=? WHERE id=?", (_at(T9, 144), own, own, cs3))
        snap(145, 'rank1')                                          # đề xuất chưa áp dụng / sửa tri thức cũ / bị từ chối ⇒ chưa "Kinh ngạc"
        db.execute("UPDATE change_sets SET status='applied', decided_at=?, decided_by=?, updated_by=? WHERE id=?", (_at(T9, 150), own, own, cs))
        snap(152, 'discover')                                       # tri thức mới được duyệt (KN-) — thắng rank1
        D.ins('events', workspace_id=W, kind='role.anomaly', severity='danger', role_id=mai, subject='Mai báo bất thường: số dư ngân hàng lệch sổ',
              created_at=_at(T9, 160))
        snap(161, 'discover')                                       # Role báo bất thường quan trọng (ĐỀ XUẤT events role.anomaly) — nguồn mới nhất
        pm = uid('pm:r9')
        D.txn(lambda: (polaris(D, W, mai, 'permission_request', gain=0, rules='P4', permission_request_id=pm),
                       D.ins('permission_requests', id=pm, workspace_id=W, role_id=mai, requested_tool_slug='bank.read', reason='đối chiếu sổ ngân hàng',
                             created_at=_at(T9, 170))))
        snap(171, 'wait')
        au_h, h_h = audit(D, W, 'harness.violation', entity_id=X['tk2'], actor=A[(W, 'gateway')], detail={'rule': 'P3'})
        bal = D.one("SELECT balance_minor FROM wallets WHERE id=?", X['WM'])
        pen = post(D, W, 'penalty', X['WM'], X['WT'], bal, 'Vi phạm luật harness (P3)', penalty_class='harness_violation', penalty_rate_bp=10000,
                   basis_balance_minor=bal, task_id=X['tk2'], evidence_audit_id=au_h, evidence_hash=h_h, role_id=mai, created_at=_at(T9, 180))
        snap(181, 'penalty')                                        # bị phạt về 0 ⇒ Trọng thương; phạt thắng nghỉ dưỡng thương trong T giây
        snap(200, 'penalty')                                        # đúng t + T: vẫn hiện (biên bao gồm)
        snap(201, 'rest')                                           # quá T ⇒ về trạng thái nền: Trọng thương (thắng chờ duyệt)
        db.execute("UPDATE engine_accounts SET quota_state='exhausted', quota_scanned_at=?, quota_reset_at=? WHERE id IN (?, ?)",
                   (_at(T9, 210), _at(T9, 4 * 3600), EN['mai_ag'], EN['mai_cc']))
        snap(211, 'quota')                                          # mọi tài khoản của Mai hết quota — thắng Trọng thương
        db.execute("UPDATE sessions SET engine_account_id=? WHERE id=?", (EN['mai_cc'], ss))   # runtime chuyển phiên sang Claude Code (ưu tiên 2)
        snap(220, 'failover')
        db.execute("UPDATE sessions SET status='error', error_code='cli_crash', ended_at=? WHERE id=?", (_at(T9, 230), ss))
        snap(231, 'error')
        c, case = _cases(db)
        case("tin của owner gắn độ chắc (certainty chỉ cho tin của Role)", lambda: D.ins('chat_messages', workspace_id=W, thread_id=th, author_kind='owner',
             channel='web', content='Chắc chắn', certainty='sure'), 'CHECK constraint')
        mstream = D.ins('chat_messages', workspace_id=W, thread_id=th, author_kind='role', author_actor_id=mai_a, channel='web', content='…', status='streaming')
        fin_ok = _try(lambda: db.execute("UPDATE chat_messages SET status='final', content='Xong — em đã kiểm nguồn.', certainty='sure' WHERE id=?", (mstream,)))
        case("đổi độ chắc đã ghi (sure → unsure — ghi một lần)", lambda: db.execute("UPDATE chat_messages SET certainty='unsure' WHERE id=?", (mstream,)),
             'append-only/write-once')
        ss9 = D.ins('sessions', workspace_id=W, agent_kind='role', role_id=lan, trigger='task', started_at=_at(T9, 240))
        case("pha mà không có mốc đổi pha", lambda: db.execute("UPDATE sessions SET phase='acting' WHERE id=?", (ss9,)), 'CHECK constraint')
        case("đổi pha của phiên đã đóng (lượt lỗi của Mai)", lambda: db.execute("UPDATE sessions SET phase='acting', phase_at=? WHERE id=?", (_at(T9, 250), ss)),
             'append-only/write-once')
        rows1 = db.execute("SELECT count(*), count(DISTINCT role_id) FROM v_role_avatar_state WHERE workspace_id=?", (W,)).fetchone()
        live = D.one("SELECT count(*) FROM roles WHERE workspace_id=? AND deleted_at IS NULL", W)
        ids = dict(ss=D.one("SELECT display_id FROM sessions WHERE id=?", ss), lg140=D.one("SELECT display_id FROM ledger_entries WHERE id=?", lg140),
                   pen=D.one("SELECT display_id FROM ledger_entries WHERE id=?", pen), kn=D.one("SELECT display_id FROM knowledge_items WHERE id=?", kn),
                   pm=D.one("SELECT display_id FROM permission_requests WHERE id=?", pm),
                   rw=D.one("SELECT display_id FROM role_wounds WHERE cause_entry_id=?", pen),
                   cd4_issued=D.one("SELECT issued_at FROM employee_cards WHERE id=?", X['cd4']),
                   pp=D.one("SELECT display_id FROM proactive_policies WHERE role_id=?", mai))
    finally:
        _FAKE_NOW[0] = None
    got = [s[0] if s else None for _, s in seen]
    want = [w for w, _ in seen]
    by = {}
    for w, s in seen:
        by.setdefault(w, s)
    lab_ok = all(s and s[6] == AV_LABELS[s[0]] and s[7] == AV_STATES.index(s[0]) + 1 for _, s in seen)
    src_ok = (by['sleep'][1:5] == ('proactive_policies', ids['pp'], '2026-10-20T15:00:00.000Z', '2026-10-21T00:30:00.000Z')
              and by['idle'][1:4] == ('employee_cards', 'CD-0004', _at(ids['cd4_issued'], 600))
              and by['run'][1:3] == ('sessions', ids['ss']) and (by['run'][5] or '').startswith('Chưa đo được')
              and by['think'][1:4] == ('sessions', ids['ss'], _at(T9, 70))
              and by['unsure'][1] == 'chat_messages' and by['unsure'][3:5] == (_at(T9, 100), _at(T9, 120))
              and by['commit'][1] == 'commitments' and by['reward'][1] == 'ledger_entries' and by['reward'][3:5] == (_at(T9, 120), _at(T9, 140))
              and by['rank1'][1:4] == ('ledger_entries', ids['lg140'], _at(T9, 140))
              and [s[1] for w, s in seen if w == 'discover'] == ['knowledge_items', 'events'] and by['discover'][2] == ids['kn']
              and by['wait'][1:3] == ('permission_requests', ids['pm']) and by['penalty'][1:5] == ('ledger_entries', ids['pen'], _at(T9, 180), _at(T9, 200))
              and by['rest'][1:3] == ('role_wounds', ids['rw']) and by['quota'][1:5] == ('engine_accounts', 'EN-0003', _at(T9, 210), _at(T9, 4 * 3600))
              and by['failover'][1:3] == ('sessions', ids['ss']) and by['error'][1:4] == ('sessions', ids['ss'], _at(T9, 230))
              and by['normal'][1] is None)
    ok = (got == want and set(want) == set(AV_STATES) and lab_ok and src_ok and lan_r1[0] == 'rank1' and lan_after[0] == 'reward'
          and rows1 == (live, live) and all(x[1] for x in c) and fin_ok)
    report("AVATAR-state-matrix", ok, f"{rows1[0]} hàng / {live} Role (một hàng mỗi Role); Mai qua {len(seen)} bước: {' → '.join(got)} — đủ {len(set(got))}/16 "
           f"khoá, mỗi bước thắng trạng thái thấp hơn; nhãn + hạng ưu tiên {'đúng' if lab_ok else 'SAI'}; nguồn / từ lúc / hết hạn {'đúng' if src_ok else 'SAI'} "
           f"(ngủ = {ids['pp']} 15:00Z → 00:30Z, rảnh = CD-0004 (cấp thẻ sau lượt chạy cuối SS-0188) + 10 phút, đang làm kèm \"chưa đo được\", phạt = {ids['pen']} hết hạn t + 20 giây, Trọng "
           f"thương = {ids['rw']}, hết quota = EN-0003 tới giờ reset, Kinh ngạc = {ids['kn']} rồi EV- role.anomaly); Lan vượt Mai ⇒ {lan_r1[0]}, mất #1 ⇒ "
           f"{lan_after[0]}; cột mới: {sum(x[1] for x in c)}/{len(c)} ca bị chặn (độ chắc trên tin owner, đổi độ chắc đã ghi, pha thiếu mốc, đổi pha phiên đã "
           f"đóng), tin streaming → final kèm độ chắc ({'được' if fin_ok else 'BỊ CHẶN'})")
    _show(c)
    if not ok:
        for (w, s) in seen:
            if not s or s[0] != w:
                print("      ✗ mong", w, "— được", s)

def t_v230_state_priority():
    """v2.3.0 (CONTRACT-r9 §C): các cặp trùng và biên — phạt + đang làm ⇒ phạt, đúng t + T vẫn phạt, quá T ⇒ đang làm; T = 5 giây khi đổi setting; lỗi + đang
    làm ⇒ lỗi tới khi có lượt ĐẠT (timeout = lỗi, cancelled không xoá lỗi); ngưỡng rảnh 10 phút (9:59 bình thường, 10:00 rảnh) và 15 phút khi đổi setting; thẻ
    tạm ngưng ⇒ ngủ (nguồn CD-, không rảnh); đang làm ban đêm ⇒ đang làm; chờ duyệt ban đêm ⇒ chờ duyệt; cuối tuần dùng khung riêng; hết quota chỉ khi KHÔNG
    còn tài khoản chạy được (đăng nhập, không sự cố hãng, binding bật); đổi CLI chỉ khi chạy trên binding không phải ưu tiên cao nhất; câu trả lời gần nhất
    thắng."""
    res = {}
    try:
        D, X = seed()
        db, W, A, EN, EB, CT, mai = D.db, X['W'], X['A'], X['EN'], X['EB'], X['CT'], X['mai']
        own, mai_a = A[(W, 'owner')], A[(W, 'Mai')]
        def st(sec, base=T9):
            _set_clock(base, sec)
            return _avs(D, mai)[0]
        def sess(start, base=T9, acc=None):
            kw = dict(engine_account_id=EN[acc], container_id=CT['Mai']) if acc else {}
            return D.ins('sessions', workspace_id=W, agent_kind='role', role_id=mai, trigger='task', started_at=_at(base, start), **kw)
        end = lambda s, status, at, base=T9: db.execute("UPDATE sessions SET status=?, ended_at=? WHERE id=?", (status, _at(base, at), s))
        setting = lambda k, v: D.ins('settings', workspace_id=W, key=k, value_json=v, created_by=own)
        unset = lambda k: db.execute("UPDATE settings SET deleted_at=?, updated_by=?, updated_at=? WHERE workspace_id=? AND key=? AND deleted_at IS NULL",
                                     (now(), own, now(), W, k))
        db.execute("UPDATE permission_requests SET status='approved', decided_at=?, decided_by=?, updated_by=? WHERE role_id=?", (now(), own, own, mai))
        db.execute("UPDATE tasks SET status='done', completed_at=?, updated_by=? WHERE assignee_role_id=? AND status='running'", (now(), own, mai))
        # (a) phạt + đang làm
        s1 = sess(0)
        au, _ = audit(D, W, 'claim.verify', entity_id=X['tk2'])
        post(D, W, 'penalty', X['WM'], X['WT'], 1000, 'Không hài lòng: báo cáo thiếu nguồn', penalty_class='dissatisfaction', task_id=X['tk2'],
             evidence_audit_id=au, role_id=mai, created_at=_at(T9, 10))
        res['a'] = (st(10), st(30), st(31))
        # (b) T = 5 giây
        setting('avatar.transient_seconds', '5')
        res['b'] = (st(15), st(16))
        unset('avatar.transient_seconds')
        # (c) lỗi + đang làm
        end(s1, 'error', 40); s2 = sess(50)
        r_c = [st(60)]
        end(s2, 'ok', 70); r_c.append(st(80))
        s3 = sess(85); end(s3, 'timeout', 90); r_c.append(st(95))
        s4 = sess(100); end(s4, 'cancelled', 110); r_c.append(st(115))
        s5 = sess(120); end(s5, 'ok', 130); r_c.append(st(135))
        res['c'] = tuple(r_c)
        # (e) ngưỡng rảnh: lượt cuối kết thúc lúc 130
        r_e = [st(729), st(730)]
        setting('avatar.idle_after_minutes', '15')
        r_e += [st(730), st(1029), st(1030)]
        unset('avatar.idle_after_minutes')
        res['e'] = tuple(r_e)
        # (f) thẻ tạm ngưng ⇒ ngủ (không rảnh); tiếp tục ⇒ rảnh
        db.execute("UPDATE employee_cards SET status='suspended', suspended_at=?, updated_by=? WHERE id=?", (_at(T9, 1100), own, X['cd4']))
        f_row = (_set_clock(T9, 1100), _avs(D, mai))[1]
        db.execute("UPDATE employee_cards SET status='issued', suspended_at=NULL, updated_by=? WHERE id=?", (own, X['cd4']))
        res['f'] = (f_row[0], f_row[1], f_row[2], st(1110))
        # (d) đang làm ban đêm ⇒ đang làm; xong ⇒ ngủ
        s6 = sess(13 * 3600 - 60)
        r_d = [st(13 * 3600)]
        end(s6, 'ok', 13 * 3600 + 60); r_d.append(st(13 * 3600 + 120)); r_d.append(st(13 * 3600 + 60 + 700))   # quá 10 phút nhưng ngoài giờ ⇒ ngủ
        res['d'] = tuple(r_d)
        # (l) chờ duyệt ban đêm ⇒ chờ duyệt; duyệt xong ⇒ ngủ
        tk = D.ins('tasks', workspace_id=W, position_id=X['PS'], assignee_role_id=mai, requested_by=own, source='web', status='waiting_approval',
                   title='Bài đăng chờ duyệt', created_at=_at(T9, 13 * 3600 + 200))
        r_l = [st(13 * 3600 + 300)]
        db.execute("UPDATE tasks SET status='done', updated_by=? WHERE id=?", (own, tk)); r_l.append(st(13 * 3600 + 310))
        res['l'] = tuple(r_l)
        # (g) cuối tuần khung riêng (thứ Bảy im lặng cả ngày); ngày thường không đổi; bỏ khung cuối tuần ⇒ thứ Bảy 10:00 trong giờ làm
        db.execute("UPDATE proactive_policies SET weekend_differs=1, weekend_quiet_start_min=0, weekend_quiet_end_min=1439, updated_by=? WHERE role_id=?",
                   (own, mai))
        r_g = [st(0, S9), st(0, W9)]
        db.execute("UPDATE proactive_policies SET weekend_differs=0, weekend_quiet_start_min=NULL, weekend_quiet_end_min=NULL, updated_by=? WHERE role_id=?",
                   (own, mai))
        r_g.append(st(0, S9))
        res['g'] = tuple(r_g)
        # (h) hết quota chỉ khi không còn tài khoản chạy được
        qa = lambda acc, sql, *p: db.execute(f"UPDATE engine_accounts SET {sql} WHERE id=?", (*p, EN[acc]))
        qa('mai_ag', "quota_state='exhausted', quota_reset_at=?", _at(W9, 3600))
        r_h = [st(0, W9)]                                                            # Claude Code còn chạy được ⇒ không phải hết quota
        qa('mai_cc', "login_status='expired'"); r_h.append(st(0, W9))                # Claude Code hết hạn đăng nhập ⇒ không còn tài khoản chạy được
        qa('mai_cc', "login_status='logged_in', outage_since=?", _at(W9, -60)); r_h.append(st(0, W9))   # sự cố hãng
        qa('mai_cc', "outage_since=NULL")
        db.execute("UPDATE engine_bindings SET is_enabled=0, updated_by=? WHERE id=?", (own, EB['mai_cc'])); r_h.append(st(0, W9))    # binding tắt
        db.execute("UPDATE engine_bindings SET is_enabled=1, updated_by=? WHERE id=?", (own, EB['mai_cc']))
        qa('mai_ag', "quota_state='ok', quota_reset_at=NULL"); r_h.append(st(0, W9))
        res['h'] = tuple(r_h)
        # (i) đổi CLI chỉ khi chạy trên binding không phải ưu tiên cao nhất
        s7 = sess(100, W9, 'mai_cc')
        r_i = [st(110, W9)]
        db.execute("UPDATE engine_bindings SET is_enabled=0, updated_by=? WHERE id=?", (own, EB['mai_ag'])); r_i.append(st(111, W9))
        db.execute("UPDATE engine_bindings SET is_enabled=1, updated_by=? WHERE id=?", (own, EB['mai_ag']))
        s8 = sess(115, W9, 'mai_ag'); end(s7, 'ok', 116, W9); r_i.append(st(117, W9))  # phiên trên tài khoản ưu tiên 1 ⇒ đang làm
        end(s8, 'ok', 150, W9)
        res['i'] = tuple(r_i)
        # (j) câu trả lời gần nhất thắng
        th = D.one("SELECT id FROM chat_threads WHERE role_id=? AND kind='assistant'", mai)
        msg = lambda cert, at: D.ins('chat_messages', workspace_id=W, thread_id=th, author_kind='role', author_actor_id=mai_a, channel='web',
                                     content='Trả lời', certainty=cert, created_at=_at(W9, at))
        msg('unsure', 200); r_j = [st(201, W9)]
        msg('sure', 202); r_j.append(st(203, W9))
        D.ins('chat_messages', workspace_id=W, thread_id=th, author_kind='role', channel='web', content='Chắc là vậy', certainty='unsure',
              created_at=_at(W9, 204))                                         # adapter không ghi author_actor_id ⇒ Role của hội thoại
        r_j.append(st(205, W9))
        res['j'] = tuple(r_j)
        tk_k = uid('task:r9-accept')
        D.txn(lambda: (polaris(D, W, mai, 'task_accept', gain=5000, rules='P1', task_id=tk_k, created_at=_at(W9, 300)),
                       D.ins('tasks', id=tk_k, workspace_id=W, position_id=X['PS'], assignee_role_id=mai, requested_by=own, source='web', status='running',
                             title='Soạn đề xuất tuần 43', created_at=_at(W9, 300))))
        _set_clock(W9, 300)
        pc_row = _avs(D, mai)
        res['k'] = (pc_row[0], pc_row[1], st(321, W9))
        db.execute("UPDATE tasks SET status='done', updated_by=? WHERE id=?", (own, tk_k))
        au_m, _ = audit(D, W, 'ledger.grant', entity_id=mai)
        gm = post(D, W, 'grant', X['WT'], X['WM'], 1000, 'Owner cấp nhầm', evidence_audit_id=au_m, role_id=mai, created_at=_at(W9, 400))
        post(D, W, 'reversal', X['WM'], X['WT'], 1000, 'Đảo khoản cấp nhầm', reverses_entry_id=gm, role_id=mai, created_at=_at(W9, 402))
        res['m'] = (st(403, W9),)
    finally:
        _FAKE_NOW[0] = None
    exp = {'a': ('penalty', 'penalty', 'run'), 'b': ('penalty', 'run'), 'c': ('error', 'normal', 'error', 'error', 'normal'),
           'e': ('normal', 'idle', 'normal', 'normal', 'idle'), 'f': ('sleep', 'employee_cards', 'CD-0004', 'idle'), 'd': ('run', 'sleep', 'sleep'),
           'l': ('wait', 'sleep'), 'g': ('sleep', 'idle', 'normal'), 'h': ('idle', 'quota', 'quota', 'quota', 'idle'),
           'i': ('failover', 'run', 'run'), 'j': ('unsure', 'normal', 'unsure'), 'k': ('commit', 'polaris_checks', 'normal'), 'm': ('reward',)}
    bad = {k: (res.get(k), v) for k, v in exp.items() if res.get(k) != v}
    report("AVATAR-state-priority", not bad, f"phạt + đang làm ⇒ {res.get('a')} (t, t + 20, t + 21); T = 5 ⇒ {res.get('b')}; lỗi / đạt / timeout / cancelled / "
           f"đạt ⇒ {res.get('c')}; rảnh 9:59 / 10:00 / N = 15 ⇒ {res.get('e')}; thẻ tạm ngưng ⇒ {res.get('f')}; đang làm ban đêm ⇒ {res.get('d')}; chờ duyệt "
           f"ban đêm ⇒ {res.get('l')}; cuối tuần / ngày thường / bỏ khung ⇒ {res.get('g')}; quota (còn Claude Code / hết hạn / sự cố hãng / binding tắt / hồi "
           f"quota) ⇒ {res.get('h')}; đổi CLI (ưu tiên 2 / tắt ưu tiên 1 / về ưu tiên 1) ⇒ {res.get('i')}; chưa chắc → chắc → chưa chắc (tin không ghi "
           f"author_actor_id) ⇒ {res.get('j')}; nhận việc (đối chiếu Polaris) ⇒ {res.get('k')}; cộng rồi đảo ⇒ {res.get('m')}"
           + (f" — LỆCH {bad}" if bad else ""))


# ================================================================== v2.3.1 (BUILD-PLAN §F.6 — [ĐỀ XUẤT — Gen vòng 10, BUILD-PLAN]; ADR 0004)
MSG_CLI_T = 'CHECK constraint failed'
# v2.3.2: engine_installs chỉ actor system của workspace ghi (engine_installs_writer_u) — UPDATE của app luôn ghi updated_by = actor system của chính workspace
EI_SYS_BY = "updated_by=(SELECT sy.id FROM actors sy WHERE sy.workspace_id = engine_installs.workspace_id AND sy.system_key = 'system')"
def _cli_core_ws(D, tag, code, probe=True):
    """Workspace mới CHƯA cài CLI (thiếu hàng engine_installs) + container AI Hệ thống + tài khoản Core agent Antigravity (đồng ý Clause 6) + binding;
    probe ⇒ một lần kiểm đăng nhập đạt (khoá loại)."""
    ws, A = _fresh_ws(D, tag, code, cli=False)
    ct = D.ins('containers', workspace_id=ws, kind='system', container_name=f'ga-sys-{code.lower()}', desired_state='sleeping', observed_state='created')
    a = _core_acc(D, ws, 'Google — Hệ thống', f'ga-auth-{code.lower()}-0001', 'logged_in')
    b = D.ins('engine_bindings', workspace_id=ws, consumer_kind='system', engine_account_id=a, priority=1)
    if probe:
        _probe(D, ws, a, ct)
    return ws, A, ct, a, b

def t_v231_cli_install():
    """v2.3.1 (BUILD-PLAN §A.2-5, §B.7, §B.8, §F.6 n; CNS-137): trạng thái cài CLI = engine_installs (workspace × loại CLI); thiếu hàng ⇒ chưa cài (fail-closed).
    Core agent sẵn sàng đòi CLI của loại Core agent 'installed' (CORE_READY + v_core_agent_accounts) ⇒ lý do O4 'engine_not_installed' "CLI chưa được cài":
    chưa cài / cài lỗi = sự cố (chuông + Telegram), v2.3.2: ĐANG CÀI = không sự cố; luôn chặn Role mới + phiên AI Hệ thống; CORE_CALM không coi "đổi loại sang
    CLI chưa cài" là êm. CHECK: installed ⇔ có version,
    failed ⇔ có lý do; một hàng sống mỗi (workspace, loại)."""
    D, X = seed()
    db, W, A, EN, CT = D.db, X['W'], X['A'], X['EN'], X['CT']
    c, case = _cases(db)
    # --- CHECK + UNIQUE (workspace chưa cài gì ⇒ không có hàng nào chắn bằng UNIQUE)
    wx, AX = _fresh_ws(D, 'cli-x', 'CLX1', cli=False)
    ins = lambda **kw: (lambda: D.ins('engine_installs', workspace_id=wx, created_by=AX['system'], **kw))
    case("installed thiếu installed_version", ins(engine_slug='antigravity', install_state='installed'), MSG_CLI_T)
    case("not_installed mà có installed_version", ins(engine_slug='antigravity', install_state='not_installed', installed_version='1.3.5'), MSG_CLI_T)
    case("failed thiếu failure_reason", ins(engine_slug='antigravity', install_state='failed'), MSG_CLI_T)
    case("installing mà có failure_reason", ins(engine_slug='antigravity', install_state='installing', failure_reason='network'), MSG_CLI_T)
    case("install_state lạ 'done'", ins(engine_slug='antigravity', install_state='done', installed_version='1'), MSG_CLI_T)
    case("failure_reason lạ 'oops'", ins(engine_slug='antigravity', install_state='failed', failure_reason='oops'), MSG_CLI_T)
    case("loại CLI không có trong danh mục", ins(engine_slug='gemini-cli', install_state='not_installed'), 'FOREIGN KEY')
    db.execute("DELETE FROM engine_installs WHERE workspace_id=?", (wx,))     # no-op khi mọi ca trên bị chặn; dọn hàng lọt (đột biến) để test báo FAIL thay vì vỡ
    ei = D.ins('engine_installs', workspace_id=wx, created_by=AX['system'], engine_slug='antigravity', install_state='installing')
    case("hàng sống thứ hai cùng (workspace, loại)", ins(engine_slug='antigravity', install_state='not_installed'), 'UNIQUE')
    case("UPDATE installing → installed không có version", lambda: db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state='installed' WHERE id=?", (ei,)),
         MSG_CLI_T)
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, deleted_at=? WHERE id=?", (now(), ei))
    redo_ok = _try(ins(engine_slug='antigravity', install_state='failed', failure_reason='domain_blocked', detail='GET … 403'))   # xoá mềm ⇒ ghi lại được
    vi = sorted(db.execute("SELECT engine_slug, install_state, failure_reason, is_core_agent_type FROM v_engine_installs WHERE workspace_id=?", (wx,)))
    acc_x = _acc(D, wx, 'claude-code', 'Anthropic — thử', 'ga-auth-clx1-cc')                  # tài khoản của loại chưa có hàng cài đặt
    vi_ok = (vi == [('antigravity', 'failed', 'domain_blocked', 1), ('claude-code', 'not_installed', None, 0)]     # thiếu hàng ⇒ not_installed; codex/openclaw ẩn
             and D.one("SELECT count(*) FROM v_engine_installs WHERE workspace_id=?", X['SYS']) == 0                # workspace hệ thống không có hàng
             and D.one("SELECT engine_install_state FROM v_engine_accounts WHERE engine_account_id=?", acc_x) == 'not_installed')
    # --- Onboarding trên bản cài chưa có CLI: mode setup, lý do engine_not_installed (không overlay) ⇒ cài ⇒ kiểm đăng nhập ⇒ ok
    w1, A1, ct1, a1, b1 = _cli_core_ws(D, 'cli-a', 'CLA1', probe=False)
    s_setup = _status(D, w1)
    st_setup = D.one("SELECT engine_install_state FROM v_core_agent_status WHERE workspace_id=?", w1)
    ob4 = _ob(D, w1, 'OB-04')
    ei1 = D.ins('engine_installs', workspace_id=w1, created_by=A1['system'], engine_slug='antigravity', install_state='installing')
    r_inst = _status(D, w1)['reason']
    _probe(D, w1, a1, ct1)                                                  # kiểm đăng nhập đạt (khoá loại) trong lúc CLI còn đang tải
    s_lock = _status(D, w1)
    role_lock, nt_lock = _try_role(D, w1, 'Thử khi đang tải'), _nt_core(D, w1, 'cli-installing')
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state='installed', installed_version='1.3.5', checked_at=? WHERE id=?", (now(), ei1))
    s_ok = _status(D, w1)
    role_ok = _try_role(D, w1, 'Thử khi đã cài')
    flow_ok = ((s_setup['mode'], s_setup['reason'], s_setup['blocks_admin'], s_setup['reason_text'], s_setup['owner_action'], s_setup['fix_target'])
               == ('setup', 'engine_not_installed', 0, 'CLI chưa được cài', 'Cài lại CLI', 'a5.system') and st_setup == 'not_installed'
               and ob4[0] == 'err' and r_inst == 'engine_not_installed'
               and (s_lock['mode'], s_lock['reason'], s_lock['is_incident'], s_lock['sub_reason'], s_lock['overlay_text'])
               == ('recovery', 'engine_not_installed', 0, 'installing', INSTALLING_OVERLAY) and not role_lock and not nt_lock      # v2.3.2: đang cài ⇒ không sự cố
               and s_ok['mode'] == 'ok' and role_ok)
    # --- sự cố lúc đang dùng (seed W: Core agent sẵn sàng): CLI Antigravity cài lỗi ⇒ O4 sự cố, chặn Role mới + phiên AI Hệ thống, phát được cảnh báo
    ei_w = D.one("SELECT id FROM engine_installs WHERE workspace_id=? AND engine_slug='antigravity'", W)
    sa_ins = lambda: D.ins('sessions', workspace_id=W, agent_kind='interviewer', trigger='interview', engine_account_id=EN['sys_ag'],
                           container_id=CT['sys'], started_at=now())
    pre = (_status(D, W)['mode'], _try(sa_ins), _try_role(D, W, 'Thử trước'))                     # đối chứng: ok, phiên + Role mới được
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state='failed', installed_version=NULL, failure_reason='checksum_mismatch' WHERE id=?", (ei_w,))
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state='installing', installed_version=NULL WHERE workspace_id=? AND engine_slug='claude-code'",
               (W,))                                                                   # v2.3.2: LOẠI KHÁC đang cài không làm "êm" sự cố của Core agent
    s_f = _status(D, W)
    att = db.execute("SELECT level, what FROM v_attention WHERE workspace_id=? AND what LIKE '%Core agent%'", (W,)).fetchall()
    case("Role mới khi CLI Core agent cài lỗi", lambda: _role(D, W, 'Thử sau'), 'INT-20')
    case("phiên Interviewer khi CLI Core agent cài lỗi", sa_ins, 'INT-20')
    nt_f = _nt_core(D, W, 'cli-failed')
    inc_ok = ((s_f['mode'], s_f['blocks_admin'], s_f['reason'], s_f['is_incident'], s_f['auto_recheck'], s_f['fix_target'], s_f['owner_action'])
              == ('recovery', 1, 'engine_not_installed', 1, 0, 'a5.system', 'Cài lại CLI')
              and s_f['overlay_text'] == 'Core agent gặp sự cố: CLI chưa được cài. Xử lý trước khi tiếp tục.'
              and s_f['fix_hint'] == 'A5 › AI Hệ thống: Cài lại CLI' and att == [('danger', s_f['overlay_text'])] and nt_f)
    # xoá mềm hàng (kể cả hàng 'installed') ⇒ coi như chưa cài; hàng mới 'installed' ⇒ hết O4
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state='installed', installed_version='1.3.6', failure_reason=NULL WHERE id=?", (ei_w,))
    m_back = _status(D, W)['mode']
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, deleted_at=? WHERE id=?", (now(), ei_w))
    r_del = _status(D, W)['reason']
    del_block = (not _try_role(D, W, 'Thử khi xoá mềm hàng cài')) and _nt_core(D, W, 'cli-deleted')        # trigger cùng định nghĩa với view
    # v2.3.2: hàng 'installing' đã xoá mềm ⇒ coi như chưa cài ⇒ vẫn sự cố (CORE_CALM chỉ xét hàng sống)
    ei_tmp = D.ins('engine_installs', workspace_id=W, created_by=A[(W, 'system')], engine_slug='antigravity', install_state='installing')
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, deleted_at=? WHERE id=?", (now(), ei_tmp))
    s_del2 = _status(D, W)
    del_block = del_block and (s_del2['reason'], s_del2['is_incident'], s_del2['sub_reason']) == ('engine_not_installed', 1, None) and _nt_core(D, W, 'cli-del-ing')
    re_ins = _try(lambda: D.ins('engine_installs', workspace_id=W, created_by=A[(W, 'system')], engine_slug='antigravity', install_state='installed',
                                installed_version='1.3.6'))                        # xoá mềm ⇒ ghi hàng mới được (partial UNIQUE)
    m_re = _status(D, W)['mode']
    # đối chứng: CLI của loại KHÁC (Claude Code) lỗi không làm Core agent (Antigravity) mất sẵn sàng; A5 thấy trạng thái cài từng tài khoản
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state='failed', installed_version=NULL, failure_reason='network' WHERE workspace_id=? "
               "AND engine_slug='claude-code' AND deleted_at IS NULL", (W,))
    m_other = _status(D, W)['mode']
    acc_cli = dict(db.execute("SELECT display_id, engine_install_state FROM v_engine_accounts WHERE workspace_id=?", (W,)).fetchall())
    n_acc = D.one("SELECT count(*) FROM v_engine_accounts WHERE workspace_id=?", W)            # hàng cài đặt đã xoá mềm không nhân đôi tài khoản
    other_ok = (pre == ('ok', True, True) and m_back == 'ok' and r_del == 'engine_not_installed' and del_block and re_ins and m_re == 'ok' and m_other == 'ok'
                and acc_cli == {'EN-0001': 'installed', 'EN-0003': 'installed', 'EN-0004': 'failed', 'EN-0005': 'installed'} and n_acc == 4)
    # --- đổi loại khi sự cố sang loại CHƯA cài ⇒ vẫn sự cố (engine_not_installed, phát được cảnh báo) — CORE_CALM không coi là "đang đổi loại";
    #     đối chứng: đích đã cài ⇒ type_change_in_progress (êm, không phát)
    def tc(tag, code, cc_state):
        w, Aw, ct, accs, bs = _core_ws(D, tag, code, n=1)
        if cc_state != 'installed':
            db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state=?, installed_version=NULL WHERE workspace_id=? AND engine_slug='claude-code'", (cc_state, w))
        db.execute("UPDATE engine_accounts SET login_status='suspended' WHERE id=?", (accs[0],))
        _type_change(D, w, 'claude-code', D.owner_actor(w), f'ga-auth-{code.lower()}-cc', insert=True)
        s = _status(D, w)
        return s['reason'], s['is_incident'], _nt_core(D, w, tag)
    tc_bad, tc_good = tc('cli-tc1', 'CLT1', 'not_installed'), tc('cli-tc2', 'CLT2', 'installed')
    tc_ok = tc_bad == ('engine_not_installed', 1, True) and tc_good == ('type_change_in_progress', 0, False)
    ok = all(x[1] for x in c) and redo_ok and vi_ok and flow_ok and inc_ok and other_ok and tc_ok
    report("CLI-install", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn (CHECK installed ⇔ version ×2, failed ⇔ lý do ×2, enum ×2, FK loại CLI, hàng sống thứ hai, "
           f"UPDATE thiếu version, Role mới + phiên Interviewer khi CLI Core agent cài lỗi); xoá mềm ⇒ ghi lại được ({'đúng' if redo_ok else 'SAI'}); "
           f"v_engine_installs thiếu hàng ⇒ not_installed ({'đúng' if vi_ok else 'SAI'}); Onboarding chưa có CLI ⇒ setup + \"{s_setup['reason_text']}\" / "
           f"\"{s_setup['owner_action']}\" (OB-04 err), installing ⇒ {r_inst}; kiểm đăng nhập đạt lúc đang tải ⇒ {s_lock['mode']} / {s_lock['reason']} / sự cố {s_lock['is_incident']} (v2.3.2: đang cài không phải sự cố — Role mới vẫn bị chặn, không phát cảnh báo); "
           f"installed ⇒ {s_ok['mode']}, Role mới được ({'đúng' if flow_ok else 'SAI'}); "
           f"đang dùng mà CLI lỗi ⇒ {s_f['mode']} / {s_f['reason']} / sự cố {s_f['is_incident']} / A0 danger / phát cảnh báo {nt_f} ({'đúng' if inc_ok else 'SAI'}); "
           f"cài lại ⇒ {m_back}, xoá mềm hàng ⇒ {r_del} (trigger cũng chặn Role mới + phát cảnh báo), hàng mới ⇒ {m_re}; Claude Code lỗi khi Core = Antigravity ⇒ {m_other}; A5 {acc_cli} "
           f"({'đúng' if other_ok else 'SAI'}); đổi loại sang CLI chưa cài ⇒ {tc_bad}, sang CLI đã cài ⇒ {tc_good} ({'đúng' if tc_ok else 'SAI'})")
    _show(c)

MEAS_COLS = ("measured_prompt_tokens, card_total_worst, prompt_source, prompt_label, prompt_tokenizer, card_ok, gate_ok, sign_ok, card_block_reason, "
             "total_worst")
def _meas(D, role):
    return dict(zip([x.strip() for x in MEAS_COLS.split(',')],
                    D.db.execute(f"SELECT {MEAS_COLS} FROM v_role_prompt_budget WHERE role_id=?", (role,)).fetchone()))
def _gc(D, X, ctx, tag, **kw):
    """Một bản biên dịch của Mai (mặc định: cùng thế hệ với bản seed — rv3, vị trí rvp, Nội quy rvw, antigravity, bộ số luật chơi của seed)."""
    total = kw.pop('total', CANON['compiled'] + CANON['cond'])
    base = dict(revision_id=X['rv3'], position_revision_id=X['rvp'], rules_revision_id=X['rvw'], engine_slug='antigravity',
                polaris_params_hash=D.one("SELECT polaris_params_hash FROM compiled_prompts WHERE id=?", X['gc_worst']))
    base.update(kw)
    return D.ins('compiled_prompts', workspace_id=X['W'], role_id=X['mai'], context_key=ctx, compiler_version='c3', tokenizer='o200k_base*1.15',
                 total_tokens=total, frame_tokens=28, budget_tokens=2000, status='ok' if total <= 2000 else 'over_budget', content='...',
                 content_hash=f'c-{tag}', stable_prefix_hash='p', **base)
def _ms(D, X, gc, n, acc=None, **kw):
    """Phiên ĐO token prompt: baseline nạp bản gc, tokens_input = phiên vỏ của tài khoản chính Mai + n."""
    sh = D.one("SELECT s.tokens_input FROM sessions s JOIN engine_accounts a ON a.overhead_shell_session_id = s.id WHERE a.id=?", X['EN']['mai_ag'])
    h = kw.pop('hash', D.one("SELECT content_hash FROM compiled_prompts WHERE id=?", gc))
    st = kw.pop('status', 'ok')
    t = now()
    return D.ins('sessions', workspace_id=X['W'], agent_kind='system', trigger=kw.pop('trigger', 'baseline'), engine_account_id=acc or X['EN']['mai_ag'],
                 container_id=X['CT']['Mai'], compiled_prompt_id=gc, delivered_prompt_hash=h, started_at=t, status=st,
                 ended_at=None if st == 'running' else t, tokens_input=sh + n, title='baseline: đo token prompt', **kw)

def t_v231_card_measured():
    """v2.3.1 (BUILD-PLAN §A.1 dòng Token prompt, §F.6 p; CNS-154; G-07/G-27): cổng Cấp thẻ dùng token prompt ĐO THẬT — phiên baseline nạp bản 'worst' CÙNG
    THẾ HỆ với bản default hiện hành, mới nhất, xong 'ok', tài khoản chính, adapter xác nhận hash; số đo = phiên đo − phiên vỏ (âm ⇒ không có). Ước lượng
    (token_count của compiler, gồm biên ×1,15) chỉ cho cổng Ký. Nhãn nguồn 'measured:<engine>'."""
    D, X = seed()
    db, mai, lan = D.db, X['mai'], X['lan']
    m0, l0 = _meas(D, mai), _meas(D, lan)
    seed_ok = ((m0['measured_prompt_tokens'], m0['card_total_worst'], m0['prompt_source'], m0['prompt_label'], m0['prompt_tokenizer'], m0['card_ok'],
                m0['gate_ok'], m0['sign_ok']) == (1685, 1889, 'measured', 'đo thật', 'measured:antigravity', 1, 1, 1)
               and l0['prompt_source'] == 'estimated' and l0['prompt_label'] == 'ước lượng' and l0['card_ok'] == 0 and l0['measured_prompt_tokens'] is None)
    # --- phiên KHÔNG được tính (mỗi phiên vi phạm đúng một điều kiện, mới hơn phiên seed, số đo 1.900 ⇒ nếu bị tính thì Cấp thẻ đỏ)
    gw = X['gc_worst']
    skip = [('đo bản default (không phải worst)', lambda: _ms(D, X, X['gc'], 1900)),
            ('tài khoản ưu tiên 2 (EN-0004 Claude Code)', lambda: _ms(D, X, gw, 1900, acc=X['EN']['mai_cc'])),
            ("trigger 'probe' (không phải baseline)", lambda: _ms(D, X, gw, 1900, trigger='probe')),
            ("phiên lỗi (status 'error')", lambda: _ms(D, X, gw, 1900, status='error')),
            ("phiên đang chạy (status 'running')", lambda: _ms(D, X, gw, 1900, status='running')),
            ('adapter không xác nhận hash (delivered_prompt_hash NULL)', lambda: _ms(D, X, gw, 1900, hash=None))]
    bad_skip = []
    for name, fn in skip:
        fn()
        m = _meas(D, mai)
        if m['measured_prompt_tokens'] != 1685 or m['card_ok'] != 1:
            bad_skip.append((name, m['measured_prompt_tokens']))
    # --- bản worst KHÁC THẾ HỆ (mới hơn, có phiên đo 1.900) không được tính — mỗi bản lệch đúng một trường
    gens = [('vị trí khác (position_revision_id NULL)', dict(position_revision_id=None)), ('Nội quy khác (rules_revision_id NULL)', dict(rules_revision_id=None)),
            ('engine khác (claude-code)', dict(engine_slug='claude-code')), ('bộ số luật chơi khác (polaris_params_hash)', dict(polaris_params_hash='h-khac')),
            ('revision cũ (rv2)', dict(revision_id=X['rv2'])), ("ngữ cảnh khác cùng thế hệ ('telegram', không phải worst)", dict(ctx='telegram'))]
    bad_gen = []
    for i, (name, kw) in enumerate(gens):
        g = _gc(D, X, kw.pop('ctx', 'worst'), f'gen{i}', **kw)
        _ms(D, X, g, 1900)
        m = _meas(D, mai)
        if m['measured_prompt_tokens'] != 1685:
            bad_gen.append((name, m['measured_prompt_tokens']))
    # --- thuận: phiên đo mới hợp lệ thắng phiên cũ; CNS-154: số đo > ngân sách trong khi ước lượng ≤ ngân sách ⇒ Ký ✓, Cấp thẻ ✗ (đo thật)
    _ms(D, X, gw, 1700)
    m1 = _meas(D, mai)
    _ms(D, X, gw, 1850)
    m2 = _meas(D, mai)
    # phiên đo có tokens_input < phiên vỏ (số âm) ⇒ không có số đo ⇒ Cấp thẻ ✗ "chưa đo thật"
    _ms(D, X, gw, -50)
    m3 = _meas(D, mai)
    live_ok = ((m1['measured_prompt_tokens'], m1['card_total_worst'], m1['card_ok']) == (1700, 1904, 1)
               and (m2['measured_prompt_tokens'], m2['card_total_worst'], m2['card_ok'], m2['gate_ok'], m2['sign_ok'], m2['total_worst'])
               == (1850, 2054, 0, 0, 1, 1889) and m2['card_block_reason'] == 'vượt ngân sách (đo thật): nặng nhất 2054 / 2000'
               and m3['measured_prompt_tokens'] is None and m3['card_ok'] == 0 and m3['prompt_source'] == 'estimated'
               and 'chưa đo thật' in (m3['card_block_reason'] or ''))
    # --- biên dịch lại (bộ số luật chơi mới) ⇒ thế hệ mới chưa đo ⇒ Cấp thẻ ✗; đo bản worst của thế hệ mới ⇒ ✓
    D2, X2 = seed()
    _recompile_mai(D2, X2, 40, 'g2', measure=False)
    n1 = _meas(D2, X2['mai'])
    gw2 = D2.one("SELECT id FROM compiled_prompts WHERE content_hash='c-g2-w'")
    _ms(D2, X2, gw2, D2.one("SELECT total_tokens FROM compiled_prompts WHERE id=?", gw2))
    n2 = _meas(D2, X2['mai'])
    regen_ok = (n1['measured_prompt_tokens'] is None and n1['card_ok'] == 0 and n1['sign_ok'] == 1 and n1['prompt_tokenizer'] == 'antigravity-tok'
                and n2['card_ok'] == 1 and n2['prompt_source'] == 'measured')
    ok = seed_ok and not bad_skip and not bad_gen and live_ok and regen_ok
    report("CARD-measured", ok, f"seed Mai: đo {m0['measured_prompt_tokens']} + overhead 204 = {m0['card_total_worst']} ({m0['prompt_tokenizer']}, "
           f"\"{m0['prompt_label']}\") ⇒ Cấp thẻ ✓; Lan chưa đo ⇒ \"{l0['prompt_label']}\", Cấp thẻ ✗ ({'đúng' if seed_ok else 'SAI'}); "
           f"{len(skip) - len(bad_skip)}/{len(skip)} phiên sai điều kiện bị bỏ qua {bad_skip or ''}; {len(gens) - len(bad_gen)}/{len(gens)} bản worst khác thế hệ "
           f"bị bỏ qua {bad_gen or ''}; phiên đo mới 1.700 ⇒ {m1['card_total_worst']} ✓; CNS-154: đo 1.850 ⇒ {m2['card_total_worst']} > 2.000 trong khi ước lượng "
           f"{m2['total_worst']} ⇒ Ký {m2['sign_ok']}, Cấp thẻ {m2['card_ok']} — \"{m2['card_block_reason']}\"; số đo âm ⇒ \"{m3['card_block_reason']}\" "
           f"({'đúng' if live_ok else 'SAI'}); biên dịch lại ⇒ chưa đo ⇒ Cấp thẻ {n1['card_ok']} (Ký {n1['sign_ok']}), đo bản worst mới ⇒ {n2['card_ok']} "
           f"({'đúng' if regen_ok else 'SAI'})")

MSG_RA_T = 'backup.remote_anchor = '
MSG_RAW_T = 'backup.remote_anchor định tuyến credential'
MSG_SECW_T = 'chỉ owner / admin còn là thành viên hoặc actor system của workspace tạo / thay bí mật'
MSG_SECH_T = 'allowed_host ghi một lần'
MSG_EIW_T = 'trạng thái cài CLI chỉ actor system của workspace'
ANCHOR_HOST = 'git.example.com'
def _anchor_secret(D, ws, host=ANCHOR_HOST, by=None, tag='a', **kw):
    """v2.3.2: secret kind anchor_remote_token gắn host đích (allowed_host); mặc định owner của workspace tạo."""
    return D.ins('secrets', workspace_id=ws, kind='anchor_remote_token', label='neo audit', ciphertext=b'x', nonce=b'n', wrapped_dek=b'd',
                 dek_nonce=b'n', kek_id='kek1', fingerprint=f'fp-anchor-{host}-{tag}', allowed_host=host, created_by=by or D.owner_actor(ws), **kw)
def _ra_val(url, sid):
    return json.dumps({'url': url, 'secret_id': sid})

def t_v231_anchor():
    """v2.3.1 (BUILD-PLAN §A.1 dòng Bản xuất Brain, §F.6 h; CNS-146; G-06) → v2.3.2 (review bảo mật HIGH, L-20261016-32): neo audit ngoài máy chỉ qua git
    remote HTTPS + token gắn host. settings_remote_anchor_i/_u (giá trị): url 'https://<host>/<path>', host = secrets.allowed_host của secret cùng workspace, còn sống,
    active (kind anchor_remote_token suy ra từ CHECK); thiếu / sai kiểu ⇒ chặn; đổi host mà giữ secret cũ ⇒ chặn; đổi khoá đi / về bị chặn; xoá mềm setting hỏng
    vẫn được. Mọi ca ghi bởi OWNER (cổng người ghi kiểm riêng ở ANCHOR-writer)."""
    D, X = seed()
    db, W, W2, A = D.db, X['W'], X['W2'], X['A']
    own, own2 = A[(W, 'owner')], A[(W2, 'owner')]
    try:
        s_ok = _anchor_secret(D, W)                                               # thuận: kind + host ghi được (owner)
    except sqlite3.DatabaseError as e:
        report("ANCHOR-https", False, f"secret anchor_remote_token + allowed_host bị từ chối: {e}"); return
    s_bt = D.ins('secrets', workspace_id=W, kind='backup_target', label='đích backup', ciphertext=b'x', nonce=b'n', wrapped_dek=b'd', dek_nonce=b'n',
                 kek_id='kek1', fingerprint='fp-bt')
    s_w2 = _anchor_secret(D, W2, tag='w2')
    s_rev, s_del, s_org = _anchor_secret(D, W, tag='rev'), _anchor_secret(D, W, tag='del'), _anchor_secret(D, W, host='git.example.org', tag='org')
    db.execute("UPDATE secrets SET status='revoked', updated_by=? WHERE id=?", (own, s_rev))
    db.execute("UPDATE secrets SET deleted_at=?, updated_by=? WHERE id=?", (now(), own, s_del))
    URL = f'https://{ANCHOR_HOST}/afi/anchors.git'
    ins = lambda v, ws=W: (lambda: D.ins('settings', workspace_id=ws, key='backup.remote_anchor', value_json=v, created_by=A[(ws, 'owner')]))
    upd = lambda sql, *p: (lambda: db.execute(f"UPDATE settings SET {sql}, updated_by=?, updated_at=? WHERE workspace_id=? AND key='backup.remote_anchor' "
                                              f"AND deleted_at IS NULL", (*p, own, now(), W)))
    c, case = _cases(db)
    case("http:// (không TLS)", ins(_ra_val(f'http://{ANCHOR_HOST}/afi/anchors.git', s_ok)), MSG_RA_T)
    case("http:/// (lách tiền tố: 8 ký tự đầu không phải https://, phần sau vẫn ra đúng host)", ins(_ra_val(f'http:///{ANCHOR_HOST}/afi/anchors.git', s_ok)), MSG_RA_T)
    case("ssh:// (SSH chưa hỗ trợ)", ins(_ra_val(f'ssh://{ANCHOR_HOST}/afi/anchors.git', s_ok)), MSG_RA_T)
    case("HTTPS có user:token trong URL (host lệch)", ins(_ra_val(f'https://ryan:ghp_abc123@{ANCHOR_HOST}/afi/anchors.git', s_ok)), MSG_RA_T)
    case("HTTPS không có path", ins(_ra_val(f'https://{ANCHOR_HOST}', s_ok)), MSG_RA_T)
    case("HTTPS host rỗng", ins(_ra_val('https:///afi/anchors.git', s_ok)), MSG_RA_T)
    case("host khác host của secret", ins(_ra_val('https://evil.example.net/afi/anchors.git', s_ok)), MSG_RA_T)
    case("secret kind backup_target (không có host)", ins(_ra_val(URL, s_bt)), MSG_RA_T)
    case("secret của workspace khác (cùng host)", ins(_ra_val(URL, s_w2)), MSG_RA_T)
    case("secret_id không tồn tại", ins(_ra_val(URL, uid('khong-co'))), MSG_RA_T)
    case("secret đã thu hồi (status revoked)", ins(_ra_val(URL, s_rev)), MSG_RA_T)
    case("secret đã xoá mềm", ins(_ra_val(URL, s_del)), MSG_RA_T)
    case("thiếu url", ins(json.dumps({'secret_id': s_ok})), MSG_RA_T)
    case("giá trị là chuỗi URL (không phải object)", ins(json.dumps(URL)), MSG_RA_T)
    ins_ok = _try(ins(_ra_val(URL, s_ok)))
    case("UPDATE sang ssh://", upd("value_json=?", _ra_val(f'ssh://{ANCHOR_HOST}/a.git', s_ok)), MSG_RA_T)
    case("UPDATE chèn token vào URL", upd("value_json=?", _ra_val(f'https://x:y@{ANCHOR_HOST}/a.git', s_ok)), MSG_RA_T)
    case("UPDATE đổi host mà GIỮ secret cũ (git.example.org với token của git.example.com)",
         upd("value_json=?", _ra_val('https://git.example.org/afi/anchors.git', s_ok)), MSG_RA_T)
    case("đổi khoá đi (→ backup.remote_anchor.old, giá trị hợp lệ)", upd("key='backup.remote_anchor.old'"), MSG_RA_T)
    D.ins('settings', workspace_id=W2, key='backup.schedule', value_json=_ra_val(URL, s_w2), created_by=own2)
    case("đổi khoá về (backup.schedule → backup.remote_anchor, giá trị hợp lệ, owner)",
         lambda: db.execute("UPDATE settings SET key='backup.remote_anchor', updated_by=? WHERE workspace_id=? AND key='backup.schedule'", (own2, W2)), MSG_RA_T)
    upd_ok = _try(upd("value_json=?", _ra_val('https://git.example.org/afi/anchors2.git', s_org)))     # đổi host kèm token mới (secret mới)
    db.execute("UPDATE secrets SET status='revoked', updated_by=? WHERE id=?", (own, s_org))          # thu hồi token về sau ⇒ setting hỏng
    del_ok = _try(upd("deleted_at=?", now()))                                                         # vẫn xoá mềm được
    w2_ok = _try(ins(_ra_val(URL, s_w2), W2))
    ok = all(x[1] for x in c) and ins_ok and upd_ok and del_ok and w2_ok
    report("ANCHOR-https", ok, f"secret anchor_remote_token gắn host ghi được; {sum(x[1] for x in c)}/{len(c)} ca bị chặn (http, ssh://, user:token trong URL, không path, "
           f"host rỗng, host khác secret, secret sai kind / workspace khác / không tồn tại / đã thu hồi / đã xoá mềm, thiếu url, không phải object, UPDATE sang ssh / "
           f"chèn token / đổi host giữ secret cũ, đổi khoá đi / về); thuận: HTTPS + secret đúng host ({'được' if ins_ok else 'BỊ CHẶN'}), đổi host kèm token mới "
           f"({'được' if upd_ok else 'BỊ CHẶN'}), token thu hồi về sau ⇒ xoá mềm setting ({'được' if del_ok else 'BỊ CHẶN'}), workspace khác với secret của nó "
           f"({'được' if w2_ok else 'BỊ CHẶN'})")
    _show(c)

def _gone_actor(D, ws, key, level, n):
    """Thành viên ĐÃ RỜI workspace (workspace_members.removed_at) — ca âm 'còn là thành viên'."""
    a = _member_actor(D, ws, key, level, n)
    D.db.execute("UPDATE workspace_members SET removed_at=? WHERE workspace_id=? AND user_id=(SELECT user_id FROM actors WHERE id=?)", (now(), ws, a))
    return a

def t_v232_anchor_writer():
    """v2.3.2 (review bảo mật HIGH trên v2.3.1 — settings_remote_anchor_i/_u không giới hạn người ghi; L-20261016-32; [Gen quyết 2026-10-16: chỉ owner]):
    backup.remote_anchor chỉ OWNER còn là thành viên hoặc actor system của workspace được INSERT / UPDATE / xoá mềm; xoá cứng chỉ trong bảo trì. Secret
    anchor_remote_token chỉ OWNER tạo / thay; secret kind khác: owner / admin / system; allowed_host ghi một lần; CHECK host đúng kiểu."""
    D, X = seed()
    db, W, W2, A = D.db, X['W'], X['W2'], X['A']
    own, sysA, trn, mai_a, sys2 = A[(W, 'owner')], A[(W, 'system')], A[(W, 'trainer')], A[(W, 'Mai')], A[(W2, 'system')]
    adm, opr = _admin_actor(D, W, 'tom', 2), _member_actor(D, W, 'olga', 'operator', 3)
    own_gone, adm_gone = _gone_actor(D, W, 'oscar', 'owner', 4), _gone_actor(D, W, 'ada', 'admin', 5)
    s1, s2 = _anchor_secret(D, W), _anchor_secret(D, W, host='git.example.org', tag='b')
    URL1, URL2 = f'https://{ANCHOR_HOST}/afi/anchors.git', 'https://git.example.org/afi/anchors.git'
    ins = lambda by, v=None: (lambda: D.ins('settings', workspace_id=W, key='backup.remote_anchor', value_json=v or _ra_val(URL1, s1), created_by=by))
    upd = lambda by, sql, *p: (lambda: db.execute(f"UPDATE settings SET {sql}, updated_by=?, updated_at=? WHERE workspace_id=? AND key='backup.remote_anchor' "
                                                  f"AND deleted_at IS NULL", (*p, by, now(), W)))
    c, case = _cases(db)
    for who, by in (('admin', adm), ('operator', opr), ('owner đã rời', own_gone), ('admin đã rời', adm_gone), ('Role Mai', mai_a),
                    ('tác tử Trainer (actor system khác khoá)', trn), ('actor system của workspace khác', sys2)):
        case(f"INSERT neo bởi {who}", ins(by), MSG_RAW_T)
    sys_ins = _try(ins(sysA))                                                       # actor system lúc dựng / khôi phục
    own_upd = _try(upd(own, "value_json=?", _ra_val(URL1 + '?r=1', s1)))           # owner sửa
    case("admin đổi host (kèm token mới đúng host)", upd(adm, "value_json=?", _ra_val(URL2, s2)), MSG_RAW_T)
    case("admin xoá mềm neo", upd(adm, "deleted_at=?", now()), MSG_RAW_T)
    for who, by in (('Role Mai', mai_a), ('tác tử Trainer', trn), ('owner đã rời', own_gone), ('actor system của workspace khác', sys2)):
        case(f"UPDATE neo bởi {who} (đổi host kèm token mới)", upd(by, "value_json=?", _ra_val(URL2, s2)), MSG_RAW_T)
    case("UPDATE neo không ghi người sửa (updated_by NULL)", lambda: db.execute(
        "UPDATE settings SET value_json=?, updated_by=NULL WHERE workspace_id=? AND key='backup.remote_anchor'", (_ra_val(URL2, s2), W)), MSG_RAW_T)
    sys_upd = _try(upd(sysA, "value_json=?", _ra_val(URL2, s2)))                   # system đổi host kèm token mới
    case("xoá cứng neo ngoài bảo trì", lambda: db.execute("DELETE FROM settings WHERE workspace_id=? AND key='backup.remote_anchor'", (W,)), MSG_RAW_T)
    own_del = _try(upd(own, "deleted_at=?", now()))                                 # owner xoá mềm
    D.ctx.maint = 1
    maint_del = _try(lambda: db.execute("DELETE FROM settings WHERE workspace_id=? AND key='backup.remote_anchor'", (W,)))   # purge trong bảo trì
    D.ctx.maint = 0
    # ---- secrets: cổng người ghi + host gắn token
    sec = lambda kind, by, host=None, tag='x': (lambda: D.ins('secrets', workspace_id=W, kind=kind, label='k', ciphertext=b'x', nonce=b'n', wrapped_dek=b'd',
                                                             dek_nonce=b'n', kek_id='kek1', fingerprint=f'fp-{tag}', allowed_host=host, created_by=by))
    for who, by in (('admin', adm), ('actor system', sysA), ('operator', opr), ('Role Mai', mai_a), ('owner đã rời', own_gone)):
        case(f"tạo secret anchor_remote_token bởi {who}", sec('anchor_remote_token', by, ANCHOR_HOST, 'an-' + who), MSG_SECW_T)
    for who, by in (('Role Mai', mai_a), ('tác tử Trainer', trn), ('operator', opr), ('admin đã rời', adm_gone), ('actor system của workspace khác', sys2)):
        case(f"tạo secret engine_api_key bởi {who}", sec('engine_api_key', by, None, 'k-' + who), MSG_SECW_T)
    adm_key, sys_key = _try(sec('engine_api_key', adm, None, 'k-adm')), _try(sec('engine_api_key', sysA, None, 'k-sys'))
    k_id = D.one("SELECT id FROM secrets WHERE fingerprint='fp-k-adm'")
    supd = lambda sid, by, sql, *p: (lambda: db.execute(f"UPDATE secrets SET {sql}, updated_by=? WHERE id=?", (*p, by, sid)))
    case("admin thay token neo (ciphertext)", supd(s1, adm, "ciphertext=?", b'y'), MSG_SECW_T)
    case("actor system thay token neo (ciphertext)", supd(s1, sysA, "ciphertext=?", b'y'), MSG_SECW_T)
    case("Role đổi engine_api_key (ciphertext)", supd(k_id, mai_a, "ciphertext=?", b'y'), MSG_SECW_T)
    case("owner đổi allowed_host của token neo", supd(s1, own, "allowed_host=?", 'evil.example.net'), MSG_SECH_T)
    case("owner đổi kind token neo → integration_token (bỏ host)", supd(s1, own, "kind='integration_token', allowed_host=NULL"), MSG_SECH_T)
    for why, kind, host in (('anchor_remote_token thiếu host', 'anchor_remote_token', None), ('engine_api_key kèm host', 'engine_api_key', ANCHOR_HOST),
                            ('host chữ hoa', 'anchor_remote_token', 'Git.Example.com'), ('host kèm path', 'anchor_remote_token', 'git.example.com/afi'),
                            ('host rỗng', 'anchor_remote_token', ''), ('host 254 ký tự', 'anchor_remote_token', 'a' * 254)):
        case(f"CHECK: {why}", sec(kind, own, host, 'ck-' + why), 'CHECK constraint failed')
    own_rot = _try(supd(s1, own, "ciphertext=?", b'z'))                            # owner thay token neo
    adm_rot = _try(supd(k_id, adm, "ciphertext=?", b'z'))                           # admin thay engine_api_key
    sys_rot = _try(supd(k_id, sysA, "status='rotated'"))                             # actor system đổi trạng thái engine_api_key (xoay)
    cache_ok = _try(lambda: db.execute("UPDATE secrets SET last_used_at=? WHERE id=?", (now(), s1)))   # cache, không phải cột nhạy cảm
    D.ctx.maint = 1
    kek_ok = _try(supd(s1, sysA, "wrapped_dek=?, kek_id='kek2'", b'w'))             # xoay KEK trong bảo trì
    D.ctx.maint = 0
    ok = (all(x[1] for x in c) and sys_ins and own_upd and sys_upd and own_del and maint_del and adm_key and sys_key and own_rot and adm_rot
          and sys_rot and cache_ok and kek_ok)
    report("ANCHOR-writer", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn đúng guard (neo: INSERT bởi admin / operator / owner đã rời / admin đã rời / Role / Trainer / "
           f"system workspace khác; admin đổi host, admin xoá mềm, UPDATE bởi Role / Trainer / owner đã rời / system workspace khác / không ghi người sửa; xoá cứng "
           f"ngoài bảo trì · secret: token neo tạo bởi admin / system / operator / Role / owner đã rời, engine_api_key bởi Role / Trainer / operator / admin đã rời / "
           f"system workspace khác, admin / system thay token neo, Role đổi key, owner đổi host / kind token neo, CHECK host ×6); thuận: system tạo neo "
           f"({sys_ins}), owner sửa ({own_upd}), system đổi host kèm token mới ({sys_upd}), owner xoá mềm ({own_del}), purge trong bảo trì ({maint_del}); admin / system "
           f"tạo engine_api_key ({adm_key}, {sys_key}), owner thay token neo ({own_rot}), admin thay key ({adm_rot}), system xoay key ({sys_rot}), cache last_used_at ({cache_ok}), xoay KEK "
           f"trong bảo trì ({kek_ok})")
    _show(c)

def t_v232_cli_writer():
    """v2.3.2 (rà v2.3.1 theo L-20261016-32): engine_installs chỉ actor system của workspace ghi (INSERT created_by, mọi UPDATE kể cả xoá mềm updated_by) —
    owner / admin không ghi tay 'installed', tác tử khác / workspace khác không ghi."""
    D, X = seed()
    db, W, W2, A = D.db, X['W'], X['W2'], X['A']
    own, sysA, trn, mai_a, sys2 = A[(W, 'owner')], A[(W, 'system')], A[(W, 'trainer')], A[(W, 'Mai')], A[(W2, 'system')]
    adm = _admin_actor(D, W, 'tom', 2)
    ei = D.one("SELECT id FROM engine_installs WHERE workspace_id=? AND engine_slug='claude-code'", W)
    db.execute(f"UPDATE engine_installs SET {EI_SYS_BY}, install_state='failed', installed_version=NULL, failure_reason='network' WHERE id=?", (ei,))
    upd = lambda by, sql="install_state='installed', installed_version='9.9.9', failure_reason=NULL": (
        lambda: db.execute(f"UPDATE engine_installs SET {sql}, updated_by=? WHERE id=?", (by, ei)))
    c, case = _cases(db)
    for who, by in (('owner', own), ('admin', adm), ('tác tử Trainer', trn), ('Role Mai', mai_a), ('actor system của workspace khác', sys2), ('không ghi (NULL)', None)):
        case(f"UPDATE ghi tay 'installed' bởi {who}", upd(by), MSG_EIW_T)
    case("owner xoá mềm hàng cài đặt", upd(own, "deleted_at='2026-10-16T00:00:00.000Z'"), MSG_EIW_T)
    wx, AX = _fresh_ws(D, 'cli-w', 'CLW1', cli=False)
    adm_x = _admin_actor(D, wx, 'tim', 3)
    insx = lambda by: (lambda: D.ins('engine_installs', workspace_id=wx, engine_slug='antigravity', install_state='installed', installed_version='1.3.5', created_by=by))
    for who, by in (('owner', AX['owner']), ('admin', adm_x), ('tác tử Trainer', AX['trainer']), ('actor system của workspace khác', sysA)):
        case(f"INSERT 'installed' bởi {who}", insx(by), MSG_EIW_T)
    sys_upd = _try(upd(sysA))
    sys_ins = _try(insx(AX['system']))
    state = D.one("SELECT install_state FROM engine_installs WHERE id=?", ei)
    ok = all(x[1] for x in c) and sys_upd and sys_ins and state == 'installed'
    report("CLI-writer", ok, f"{sum(x[1] for x in c)}/{len(c)} ca bị chặn (UPDATE 'installed' bởi owner / admin / Trainer / Role / system workspace khác / NULL, owner xoá mềm; "
           f"INSERT bởi owner / admin / Trainer / system workspace khác); thuận: actor system sửa ({sys_upd}) và tạo ({sys_ins}) — trạng thái {state}")
    _show(c)

# v2.3.2 (Gen, L-20261016-32): META-TEST "cổng người ghi" — rào tự động chống tái phạm lỗi "không giới hạn người ghi" (settings_remote_anchor_* v2.3.1).
# (1) mọi guard BEFORE INSERT / UPDATE trên settings mà điều kiện theo khoá (NEW.key / OLD.key) phải có kiểm actor người ghi (NEW.created_by ở INSERT,
#     NEW.updated_by ở UPDATE, qua macro OWNER_ADMIN / OWNER_ONLY / SYS_ACTOR — dấu hiệu: workspace_members hoặc system_key = 'system'), hoặc miễn trừ kèm lý do +
#     trigger anh em CÓ kiểm actor cho cùng khoá (kiểm bằng máy). AFTER (hành động) và DELETE (không có cột người ghi; chỉ chặn ngoài bảo trì) miễn theo loại.
# (2) mọi bảng chứa / định tuyến credential (danh sách khai + tự phát hiện: FK → secrets, cột secret_id / auth_volume / allowed_host) phải có ≥ 1 guard
#     BEFORE INSERT và ≥ 1 guard BEFORE UPDATE có kiểm actor, hoặc miễn trừ cấp bảng kèm lý do. Mục miễn trừ không còn khớp trigger / bảng nào ⇒ đỏ (chống mục).
WRITER_CRED_TABLES = {'secrets', 'engine_installs', 'engine_accounts', 'engine_bindings'}
WRITER_TABLE_EXEMPT = {
    'engine_accounts': 'nợ đã biết (v2.3.2): chưa có cổng người ghi ở DB — tài khoản do owner tạo qua A3.E / A5 (repository control plane, phiên GUI owner); '
                       'nhiều UPDATE vận hành (login_status, quota, outage) do app ghi không kèm updated_by — cần định nghĩa cột định tuyến (secret_id, auth_volume) '
                       'rồi mới gác; đề xuất v2.3.3',
    'engine_bindings': 'nợ đã biết (v2.3.2): như engine_accounts — binding (consumer ↔ tài khoản ⇒ mount /auth) chưa có cổng người ghi ở DB; đề xuất v2.3.3',
    'telegram_bots': 'nợ đã biết (v2.3.2): có telegram_bots_owner_u (khôi phục bot chỉ owner) nhưng INSERT / đổi secret_id chưa có cổng người ghi; đề xuất v2.3.3',
    'tools': 'nợ đã biết (v2.3.2): tool tích hợp (secret_id) chưa có cổng người ghi ở DB; đề xuất v2.3.3',
}
WRITER_TRIGGER_EXEMPT = {      # trigger: (anh em có kiểm actor cho cùng khoá, lý do)
    'settings_penalty_i': ('settings_rules_guard_i', 'bất biến số giữa các khoá economy.penalty.*; người ghi kiểm ở settings_rules_guard_i (economy.*)'),
    'settings_penalty_u': ('settings_rules_guard_u', 'như trên — settings_rules_guard_u (economy.*)'),
    'settings_core_agent_bound_i': ('settings_core_agent_i', 'luật "đang gắn tài khoản ⇒ không đổi ST-0017"; người ghi ST-0017 kiểm ở settings_core_agent_i'),
    'settings_core_agent_bound_u': ('settings_core_agent_u', 'như trên — settings_core_agent_u'),
}
def _trig_event(sql):
    m = re.match(r"\s*CREATE TRIGGER \w+ (BEFORE|AFTER) (INSERT|UPDATE|DELETE)", sql)
    return m.groups() if m else (None, None)
def _has_writer(sql, op):
    col = 'NEW.created_by' if op == 'INSERT' else 'NEW.updated_by'
    return col in sql and ('workspace_members' in sql or "system_key = 'system'" in sql)
def _writer_violations(db):
    trig = {n: (t, s) for n, t, s in db.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger'")}
    bad = []
    for n, (t, s) in sorted(trig.items()):
        if t != 'settings' or not re.search(r"\b(NEW|OLD)\.key\b", s) or re.search(r"_no_replace_[iu]$", n):
            continue                                      # chống REPLACE sinh tự động: chặn trùng khoá với MỌI người ghi (miễn theo loại)
        when, op = _trig_event(s)
        if when == 'AFTER' or op == 'DELETE' or _has_writer(s, op):
            continue
        sib = WRITER_TRIGGER_EXEMPT.get(n)
        if sib and sib[0] in trig and _has_writer(trig[sib[0]][1], op):
            continue
        bad.append(('settings-key', n))
    auto = {r[0] for r in db.execute("SELECT m.name FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.type = 'table' AND f.\"table\" = 'secrets'")}
    auto |= {r[0] for r in db.execute("SELECT m.name FROM sqlite_master m, pragma_table_info(m.name) c WHERE m.type = 'table' "
                                      "AND c.name IN ('secret_id', 'auth_volume', 'allowed_host')")}
    cred = sorted(WRITER_CRED_TABLES | auto)
    for t in cred:
        if t in WRITER_TABLE_EXEMPT:
            continue
        for op in ('INSERT', 'UPDATE'):
            if not any(tt == t and _trig_event(s) == ('BEFORE', op) and _has_writer(s, op) for tt, s in trig.values()):
                bad.append(('cred-table', f'{t}:{op}'))
    stale = [k for k in WRITER_TRIGGER_EXEMPT if k not in trig] + [k for k in WRITER_TABLE_EXEMPT if k not in cred]
    bad += [('stale-exempt', k) for k in stale]
    return cred, bad

def t_v232_writer_meta():
    """v2.3.2 (Gen, L-20261016-32 — rào tự động): mọi guard theo khoá trên settings và mọi bảng chứa / định tuyến credential phải có cổng người ghi hoặc miễn
    trừ khai rõ kèm lý do. Đối chứng âm: thêm guard khoá mới không kiểm actor, bỏ cổng người ghi của settings_remote_anchor_u, bỏ secrets_writer_u, thêm bảng có
    secret_id mà không gác ⇒ đều bị bắt."""
    D, X = seed()
    db = D.db
    cred, bad0 = _writer_violations(db)
    nkey = sum(1 for n, t, s in db.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger'")
               if t == 'settings' and re.search(r"\b(NEW|OLD)\.key\b", s) and _trig_event(s)[0] == 'BEFORE' and _trig_event(s)[1] != 'DELETE'
               and not re.search(r"_no_replace_[iu]$", n))
    db.execute("""CREATE TRIGGER settings_fake_route_i BEFORE INSERT ON settings WHEN NEW.key = 'fake.route' AND json_type(NEW.value_json) IS NOT 'object'
                  BEGIN SELECT RAISE(ABORT, 'fake'); END""")
    db.execute("DROP TRIGGER settings_remote_anchor_u")
    db.execute(f"""CREATE TRIGGER settings_remote_anchor_u BEFORE UPDATE OF key, value_json ON settings WHEN NEW.key = 'backup.remote_anchor'
                   AND NOT {S.RA_VALID} BEGIN SELECT RAISE(ABORT, 'x'); END""")
    db.execute("DROP TRIGGER secrets_writer_u")
    db.execute("CREATE TABLE fake_vault (id TEXT PRIMARY KEY, workspace_id TEXT, secret_id TEXT REFERENCES secrets(id))")
    _cred1, bad1 = _writer_violations(db)
    expect = {('settings-key', 'settings_fake_route_i'), ('settings-key', 'settings_remote_anchor_u'), ('cred-table', 'secrets:UPDATE'),
              ('cred-table', 'fake_vault:INSERT'), ('cred-table', 'fake_vault:UPDATE')}
    ok = not bad0 and expect <= set(bad1) and len(bad1) == len(expect)
    report("WRITER-meta", ok, f"{nkey} guard theo khoá trên settings + {len(cred)} bảng credential ({', '.join(cred)}) — vi phạm: {bad0 or 'không'}; miễn trừ cấp bảng "
           f"{len(WRITER_TABLE_EXEMPT)} (nợ đã biết: {', '.join(WRITER_TABLE_EXEMPT)}), miễn trừ trigger {len(WRITER_TRIGGER_EXEMPT)} (có anh em kiểm actor); đối chứng âm "
           f"bắt đủ {len(expect & set(bad1))}/{len(expect)}: {sorted(bad1)}")

def t_v231_relogin():
    """v2.3.1 (BUILD-PLAN §B.9, CNS-145; yêu cầu Gen 2026-10-16): v_relogin_required — sau khôi phục (workspaces.restored_at), tài khoản có binding sống + bật,
    tài khoản sống + active mà lần kiểm đăng nhập MỚI NHẤT kể từ mốc chưa 'ok'. Mốc chỉ tiến (workspaces_restored_u); v2.3.2: không ở tương lai (workspaces_restored_i/_u)."""
    D, X = seed()
    db, W, EN, EB, CT = D.db, X['W'], X['EN'], X['EB'], X['CT']
    q = lambda ws=W: sorted(r[0] for r in db.execute("SELECT account_display_id FROM v_relogin_required WHERE workspace_id=?", (ws,)))
    pb = lambda acc, ct, st='ok', trig='login_check': D.ins('probe_runs', workspace_id=W, engine_account_id=acc, engine_slug=D.one(
        "SELECT engine_slug FROM engine_accounts WHERE id=?", acc), container_id=ct, trigger=trig, auth_mode='oauth', status=st, started_at=now(),
        finished_at=None if st == 'running' else now())
    l0 = q()                                                                                  # chưa khôi phục ⇒ rỗng (dù có tài khoản)
    t0 = now()
    db.execute("UPDATE workspaces SET restored_at=? WHERE id=?", (t0, W))
    l1 = q()                                                                                  # mọi tài khoản đang dùng — lần đạt trước mốc không tính
    pb(EN['sys_ag'], CT['sys'], 'ok', 'manual')                                               # quét khả năng (không phải kiểm đăng nhập) ⇒ chưa tính
    l2 = q()
    pb(EN['sys_ag'], CT['sys'], 'ok')                                                         # kiểm đăng nhập đạt sau mốc ⇒ rời danh sách
    pb(EN['lan_ag'], CT['Lan'], 'failed')                                                     # Lan: không đạt ⇒ còn
    l3 = q()
    last_lan = db.execute("SELECT last_login_check_status, consumer_label FROM v_relogin_required WHERE engine_account_id=?", (EN['lan_ag'],)).fetchone()
    pb(EN['lan_ag'], CT['Lan'], 'ok'); pb(EN['lan_ag'], CT['Lan'], 'running')                 # đạt rồi một lần đang chạy ⇒ rời (lần ĐÃ XONG mới nhất = ok)
    l4 = q()
    pb(EN['lan_ag'], CT['Lan'], 'failed')                                                     # lần xong mới nhất không đạt ⇒ quay lại danh sách
    l5 = q()
    db.execute("UPDATE engine_bindings SET is_enabled=0 WHERE id=?", (EB['mai_cc'],)); l6 = q()          # binding tắt ⇒ không cần đăng nhập lại
    db.execute("UPDATE engine_bindings SET is_enabled=1 WHERE id=?", (EB['mai_cc'],))
    db.execute("UPDATE engine_bindings SET deleted_at=? WHERE id=?", (now(), EB['mai_cc'])); l7 = q()    # binding đã gỡ
    db.execute("UPDATE engine_accounts SET status='disabled' WHERE id=?", (EN['mai_ag'],)); l8 = q()      # tài khoản vô hiệu
    db.execute("UPDATE engine_accounts SET status='active' WHERE id=?", (EN['mai_ag'],))
    db.execute("UPDATE engine_accounts SET deleted_at=? WHERE id=?", (now(), EN['mai_ag'])); l9 = q()     # tài khoản đã xoá mềm
    c, case = _cases(db)
    case("xoá mốc khôi phục (restored_at → NULL)", lambda: db.execute("UPDATE workspaces SET restored_at=NULL WHERE id=?", (W,)), 'mốc khôi phục chỉ tiến')
    case("lùi mốc khôi phục", lambda: db.execute("UPDATE workspaces SET restored_at=? WHERE id=?", ('2026-01-01T00:00:00.000Z', W)), 'mốc khôi phục chỉ tiến')
    case("mốc khôi phục ở tương lai (UPDATE)", lambda: db.execute("UPDATE workspaces SET restored_at=? WHERE id=?", ('2099-01-01T00:00:00.000Z', W)),
         'mốc khôi phục chỉ tiến')                                                                            # v2.3.2: không kẹt mãi
    case("workspace mới mang sẵn mốc tương lai (INSERT)", lambda: db.execute(
        "INSERT INTO workspaces(id,kind,slug,name,short_code,restored_at) VALUES(?,?,?,?,?,?)",
        (uid('ws:future'), 'tenant', 'future', 'Future', 'FUT1', '2099-01-01T00:00:00.000Z')), 'mốc khôi phục chỉ tiến')
    past_ok = _try(lambda: db.execute("INSERT INTO workspaces(id,kind,slug,name,short_code,restored_at) VALUES(?,?,?,?,?,?)",
                                      (uid('ws:past'), 'tenant', 'past', 'Past', 'PAS1', t0)))                # mốc đã qua: được
    t1 = now()
    adv_ok = _try(lambda: db.execute("UPDATE workspaces SET restored_at=? WHERE id=?", (t1, W))) and past_ok   # khôi phục lần nữa ⇒ mốc tiến
    l10 = q()
    ok = (l0 == [] and l1 == ['EN-0001', 'EN-0003', 'EN-0004', 'EN-0005'] and l2 == l1 and l3 == ['EN-0003', 'EN-0004', 'EN-0005']
          and last_lan == ('failed', 'Lan') and l4 == ['EN-0003', 'EN-0004'] and l5 == ['EN-0003', 'EN-0004', 'EN-0005']
          and l6 == ['EN-0003', 'EN-0005'] and l7 == ['EN-0003', 'EN-0005'] and l8 == ['EN-0005'] and l9 == ['EN-0005']
          and all(x[1] for x in c) and adv_ok and l10 == ['EN-0001', 'EN-0005'])
    report("RESTORE-relogin", ok, f"chưa khôi phục ⇒ {l0}; khôi phục ⇒ {l1} (lần đạt trước mốc không tính); quét 'manual' ⇒ không đổi; EN-0001 kiểm đạt ⇒ {l3}, "
           f"Lan không đạt ⇒ còn ({last_lan}); Lan đạt + một lần đang chạy ⇒ {l4}; Lan lần xong mới nhất không đạt ⇒ {l5}; binding tắt ⇒ {l6}; binding gỡ ⇒ {l7}; "
           f"tài khoản vô hiệu ⇒ {l8}; tài khoản xoá mềm ⇒ {l9}; {sum(x[1] for x in c)}/{len(c)} ca bị chặn (xoá / lùi mốc; v2.3.2: mốc tương lai — UPDATE + INSERT workspace); workspace mới mốc đã qua được; khôi phục lần nữa ⇒ mốc tiến "
           f"({'được' if adv_ok else 'BỊ CHẶN'}) ⇒ {l10}")
    _show(c)

if __name__ == '__main__':
    perf = '--perf' in sys.argv
    t_schema()
    t_b1_purge(); t_b2_negative(); t_b3_game(); t_m1_wallet(perf); t_m2_rebuild(); t_m4_jobs(); t_m5_audit()
    t_m6_tenant(); t_m7_appendonly(); t_minor_swap(); t_q2_budget(); t_fts()
    t_taxonomy(); t_prereq(); t_in_core(); t_budget_runtime(); t_polaris_prompt(); t_polaris_board(); t_no_session_token()
    t_qr1_binding(); t_qr3_economy(); t_reflection(); t_mvp_scope(); t_adapter_and_drive(); t_onboarding()
    t_sec_v211()
    t_v22_honesty(); t_v22_rules_own(); t_v22_skin(); t_v22_wound(); t_v22_polaris(); t_v22_presets(); t_v22_consumer_ct()
    t_v22_seed(); t_v22_earned()
    t_v221_selfreport_paths(); t_v221_gate()
    t_v222_polaris_warn(); t_v222_budget_block(); t_v223_sign_estimate()
    t_v224_detect_first(); t_v224_closure(); t_v224_required_class()
    t_v225_core_binding(); t_v225_core_setting(); t_v225_seed()
    t_v226_last_core(); t_v226_sa_primary(); t_v226_lock(); t_v226_ready_role(); t_v226_ob_checklist()
    t_v226_attention(); t_v226_failover(); t_v226_attachment(); t_v226_card_drift(); t_v226_wound_inbox(); t_v226_seed()
    t_v227_core_capable(); t_v227_container()
    t_v228_consent(); t_v228_seed(); t_v228_rotation_gone(); t_v228_one_per_engine(); t_v228_recovery()
    t_v229_lock_login(); t_v229_status_matrix(); t_v229_relogin(); t_v229_identity()
    t_v2210_type_change(); t_v2210_type_change_guards(); t_v2210_emergency_role(); t_v2210_seed_hint()
    t_v2211_sa_stale(); t_v2211_type_change_back(); t_v2211_card_recovery(); t_v2211_allowlist_owner(); t_v2211_login_stalled()
    t_v2212_allowlist_invariant(); t_v2212_sa_attention()
    t_v2213_no_replace(); t_v2213_owner_create()
    t_v230_catalog(); t_v230_toggle(); t_v230_assign(); t_v230_settings(); t_v230_state_matrix(); t_v230_state_priority()
    t_v231_cli_install(); t_v231_card_measured(); t_v231_anchor(); t_v231_relogin()
    t_v232_anchor_writer(); t_v232_cli_writer(); t_v232_writer_meta()
    print("\nTỔNG:", sum(1 for r in RESULTS if r[1]), "/", len(RESULTS), "PASS — SQLite", sqlite3.sqlite_version)
