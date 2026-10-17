#!/usr/bin/env python3
"""Bộ sinh SEED THAM CHIẾU máy đọc được — db/spec/seed_reference.json, định dạng `ga.seed-reference.v1` (packages/contracts/src/seed.ts;
DATABASE §11.1–11.2; CNS-170). Từ DB v2.3.4: tệp này là NGUỒN DUY NHẤT của dữ liệu seed tham chiếu (lane DB); @ga/db kiểm sha + schema rồi áp
bằng conn.bootstrap() (applyGlobalSeed / applyWorkspaceSeed). Seed demo (Afi Labs, Mai, Lan…) KHÔNG nằm ở đây — chỉ ở bộ test.

  python3 -B -I db/spec/gen_seed.py --rev <sha 40> --version X.Y.Z   ghi seed_reference.json (nội dung không đổi ⇒ giữ tệp cũ, kể cả rev cũ)
  python3 -B -I db/spec/gen_seed.py --check                          sinh lại với rev / version ghi trong tệp ⇒ phải TRÙNG BYTE

`pnpm db:sync` gọi bộ sinh (rev = HEAD của repo lúc sinh — bản sinh nằm ở commit con của rev đó); `pnpm db:sync -- --check` gọi --check.
Bộ test (SEED-ref) đối chiếu tệp với seed() của bộ test và áp nó lên DB trống bằng đúng thuật toán của bên áp (INSERT … SELECT … WHERE NOT EXISTS
theo conflictKey — KHÔNG dùng ON CONFLICT: trigger chống REPLACE `<bảng>_no_replace_i` là BEFORE INSERT, chạy trước bước giải xung đột ⇒ ghi trùng
khoá bị RAISE dù có ON CONFLICT DO NOTHING).

id của hàng seed (lane DB quyết — WorkspaceSeedTarget.idFor): seed_row_id(workspace_id, key) = '0000000000' (phần thời gian ULID cố định = 0) + 16 ký tự
Crockford base32 của 80 bit đầu sha256(UTF-8 'ga.seed-reference.v1:' + workspace_id + ':' + key). key = '<bảng>:<display_id viết thường>' (vd
'settings:st-0017'). Tất định theo (workspace, key) ⇒ chạy lại không đổi id; khác workspace ⇒ khác id. Không đơn điệu — thứ tự luôn theo display_seq
(§2.1). Phần global dùng cùng hàm với workspace hệ thống (giá trị ghi sẵn, không $ref). Actor hệ thống của tenant: id do app cấp trước ($ref actor).
"""
import argparse, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'seed_reference.json')
FORMAT = 'ga.seed-reference.v1'
REPO = 'colamacbook-ryan/gen-agents'
GENERATOR = 'db/spec/gen_seed.py'
SYSTEM_WS = '0' * 26                     # = SYSTEM_WORKSPACE_ID (contracts) = SYS của schema_v2_2.py
CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'


def seed_row_id(workspace_id, key):
    """id tất định của hàng seed theo (workspace, key) — dạng ULID (26 ký tự Crockford), phần thời gian = 0."""
    n = int.from_bytes(hashlib.sha256(f'{FORMAT}:{workspace_id}:{key}'.encode('utf-8')).digest()[:10], 'big')
    return '0' * 10 + ''.join(CROCK[(n >> (5 * (15 - i))) & 31] for i in range(16))


def canonical(obj):
    """JSON chuẩn hoá (JCS thu hẹp — = canonicalJson của contracts): khoá sắp xếp, không khoảng trắng, không escape ký tự ngoài ASCII."""
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


# ---------------------------------------------------------------- dữ liệu (DATABASE §11.2)
# = contracts ACTOR_SYSTEM_KEYS (thứ tự giữ nguyên); seed theo TỪNG workspace (M6), cả workspace hệ thống
ACTOR_KEYS = ('system', 'interviewer', 'trainer', 'consolidator', 'judge', 'scheduler', 'gateway', 'updater', 'telegram', 'assistant')

# engines (v2.2.8, CONTRACT-r8 §C): core_capable antigravity = 1, claude-code = 1, openclaw = 1, codex = 0; MVP chỉ antigravity + claude-code ready.
# cli_binary theo DATABASE §5 (agy / claude / codex / openclaw); tos_risk: antigravity 'high', codex 'grey' (§11.2) — claude-code / openclaw §11.2 không
# ghi ⇒ 'grey' [ĐỀ XUẤT — lane DB, chờ Gen]. supports_subscription / supports_api_key để mặc định của DDL.
ENGINES = [
    dict(slug='antigravity', name='Antigravity', vendor='google', cli_binary='agy', adapter_status='ready', priority_order=1, tos_risk='high',
         requires_consent=1, core_capable=1),
    dict(slug='claude-code', name='Claude Code', vendor='anthropic', cli_binary='claude', adapter_status='ready', priority_order=2, tos_risk='grey',
         requires_consent=0, core_capable=1),
    dict(slug='codex', name='Codex', vendor='openai', cli_binary='codex', adapter_status='coming_soon', priority_order=3, tos_risk='grey',
         requires_consent=0, core_capable=0),
    dict(slug='openclaw', name='OpenClaw', vendor='openclaw', cli_binary='openclaw', adapter_status='coming_soon', priority_order=4, tos_risk='grey',
         requires_consent=0, core_capable=1),
]
TOS_NOTICE_VERSION = '1'

# dna_field_defs (§11.4, 31 khoá — values.red_lines là danh sách): (key, field_group, tier, value_type, prompt_layer). Dạng TỐI THIỂU hợp lệ:
# enum_options / scale_* / prose_template chờ Q8 (bộ DNA chuẩn cần duyệt) — registry của app lấp khi chưa có.
DNA_DEFS = [
    ('identity.name', 'identity', 1, 'text', 'persona'), ('identity.address_style', 'identity', 1, 'text', 'style'),
    ('identity.voice', 'identity', 1, 'text', 'style'), ('identity.class', 'identity', 1, 'text', 'persona'),
    ('persona.traits.openness', 'persona', 1, 'scale', 'persona'), ('persona.traits.extraversion', 'persona', 1, 'scale', 'persona'),
    ('persona.traits.agreeableness', 'persona', 1, 'scale', 'persona'), ('persona.traits.stability', 'persona', 1, 'scale', 'persona'),
    ('persona.traits.conscientiousness', 'persona', 1, 'scale', 'persona'), ('persona.traits.proactivity', 'persona', 1, 'scale', 'persona'),
    ('values.honesty', 'values', 1, 'text', 'values'), ('values.transparency', 'values', 1, 'text', 'values'),
    ('values.privacy', 'values', 1, 'text', 'values'), ('style.tone', 'style', 1, 'text', 'style'),
    ('style.report_length', 'style', 1, 'text', 'style'), ('style.language', 'style', 1, 'enum', 'style'),
    ('rules.ask_when_unclear', 'routine', 2, 'text', 'style'), ('rules.no_number_guessing', 'routine', 2, 'text', 'style'),
    ('rules.escalation', 'routine', 2, 'text', 'style'), ('drive.goal', 'drive', 1, 'enum', 'drive'),
    ('senses.telegram.bot', 'senses', 1, 'text', 'style'), ('senses.email', 'senses', 1, 'text', 'style'),
    ('senses.calendar', 'senses', 1, 'text', 'style'), ('identity.gender', 'identity', 1, 'enum', 'persona'),
    ('identity.birth_date', 'identity', 1, 'date', 'persona'), ('values.red_lines', 'values', 1, 'text', 'values'),
    ('values.hierarchy', 'values', 1, 'text', 'values'), ('senses.telegram.allowlist', 'senses', 1, 'text', 'style'),
    ('style.max_words', 'style', 1, 'number', 'style'), ('style.format', 'style', 1, 'text', 'style'),
    ('style.signature_opening', 'style', 1, 'text', 'style'),
]
DNA_LIST = {'values.red_lines'}
DNA_IDENTITY_LOCKED = {'identity.name', 'identity.gender', 'identity.birth_date', 'drive.goal'}

# settings ghi sẵn mỗi tenant (display_id khớp design HeThong: ST-0002…0009, ST-0015…0018); value_json = JSON chuẩn
SETTINGS = [
    (2, 'economy.initial_grant_minor', '100000'), (3, 'economy.penalty.self_reported_max_bp', '1000'),
    (4, 'economy.penalty.concealment_min_bp', '5000'), (5, 'economy.penalty.harness_bp', '10000'),
    (6, 'economy.penalty.dissatisfaction_presets_bp', '[500,1000,2000,3000]'), (7, 'economy.revive_suggest_minor', '50000'),
    (8, 'economy.wound_commitment_horizon_hours', '72'), (9, 'economy.reflection_max_runs', '3'),
    (15, 'budget.runtime_overhead_estimate_tokens', '250'), (16, 'economy.penalty.self_confessed_harness_as_self_reported', 'true'),
    (17, 'system.core_agent_engine', '"antigravity"'), (18, 'chat.attachment_max_bytes', '26214400'),
]

# tools built-in của gateway (§2.8, §11.2) — sao vào từng tenant, builtin_key = slug; definition_tokens 0: đã nằm trong overhead đo bằng baseline (§7.5).
# risk_level / default_mode / tên hiển thị: [ĐỀ XUẤT — lane DB] (UI dịch theo builtin_key). set_field chỉ tác tử hệ thống (Interviewer / Trainer).
TOOLS = [
    ('recall', 'low', 'role'), ('remember', 'low', 'role'), ('report_task', 'low', 'role'),
    ('send_telegram', 'medium', 'role'), ('set_field', 'low', 'system'),
]

# gói skin MVP tam-quoc-chibi 1.0.0 (v2.3.0, CONTRACT-r9 §B): (mã, tên, Hán tự, phe, kiểu, giới) — tham số tối thiểu {"id","schema"} (JCS), sha256 của chuỗi đó
SKIN_PACK, SKIN_VERSION, SKIN_SCHEMA = 'tam-quoc-chibi', '1.0.0', 1
SKIN_SOURCE, SKIN_LICENSE = 'Afi Labs — vẽ bằng code (SVG + CSS)', 'Proprietary — Afi Labs'
SKINS = [('tq046', 'Gia Cát Lượng', '諸葛亮', 'Thục', 'strategist', 'male'), ('tq044', 'Quan Vũ', '關羽', 'Thục', 'martial', 'male'),
         ('tq080', 'Tào Tháo', '曹操', 'Ngụy', 'lord', 'male'), ('tq043', 'Lưu Bị', '劉備', 'Thục', 'lord', 'male'),
         ('tq045', 'Trương Phi', '張飛', 'Thục', 'martial', 'male'), ('tq047', 'Triệu Vân', '趙雲', 'Thục', 'martial', 'male'),
         ('tq010', 'Điêu Thuyền', '貂蟬', 'Quần hùng', 'civil', 'female'), ('tq141', 'Tôn Thượng Hương', '孫尚香', 'Ngô', 'martial', 'female'),
         ('tq031', 'Hoa Đà', '華佗', 'Quần hùng', 'civil', 'male'), ('tqx001', 'Lính quèn', None, None, 'soldier', 'male')]

SYSTEM_AGENT_KEYS = ('interviewer', 'trainer', 'consolidator', 'judge')   # model / effort chọn ở Onboarding bước 4 (selection_state mặc định 'unknown')
POSITION_TEMPLATE = 'Trợ lý của {owner_name}'                             # app render title khi biết / đổi tên owner (§5 positions)


# ---------------------------------------------------------------- dựng seed
WS = {'$ref': 'workspace'}


def _ref_id(key):
    return {'$ref': 'id', 'key': key}


def _display(table, prefix, seq):
    did = f'{prefix}-{seq:04d}'
    return dict(id=_ref_id(f'{table}:{did.lower()}'), workspace_id=WS, display_id=did, display_seq=seq)


def body(rev, version):
    g_actors = [dict(id=seed_row_id(SYSTEM_WS, f'actors:{k}'), workspace_id=SYSTEM_WS, kind='system', system_key=k, label=k.title())
                for k in ACTOR_KEYS]
    g_engines = [dict(e, tos_notice_key='tos.' + e['slug'], tos_notice_version=TOS_NOTICE_VERSION) for e in ENGINES]
    g_dna = [dict(id=seed_row_id(SYSTEM_WS, f'dna_field_defs:{k}'), workspace_id=SYSTEM_WS, key=k, field_group=grp, tier=tier, value_type=vt,
                  label_key='dna.' + k, is_core=1 if grp in ('values', 'persona') else 0, prompt_layer=layer, schema_version='1',
                  is_list=1 if k in DNA_LIST else 0, is_identity_locked=1 if k in DNA_IDENTITY_LOCKED else 0)
             for k, grp, tier, vt, layer in DNA_DEFS]
    w_actors = [dict(id={'$ref': 'actor', 'key': k}, workspace_id=WS, kind='system', system_key=k, label=k.title()) for k in ACTOR_KEYS]
    w_settings = [dict(_display('settings', 'ST', n), key=k, value_json=v) for n, k, v in SETTINGS]
    w_positions = [dict(_display('positions', 'PS', 1), title='Trợ lý', title_template=POSITION_TEMPLATE, is_default=1)]
    w_wallets = [dict(_display('wallets', 'WL', i + 1), owner_kind=k, allow_negative=1) for i, k in enumerate(('treasury', 'sink'))]
    w_agents = [dict(_display('system_agents', 'SA', i + 1), system_key=k) for i, k in enumerate(SYSTEM_AGENT_KEYS)]
    w_tools = [dict(_display('tools', 'TL', i + 1), slug=s, name=s, kind='gateway_builtin', risk_level=r, default_mode='allow', allowed_agents=a,
                    is_builtin=1, builtin_key=s, definition_tokens=0, status='active') for i, (s, r, a) in enumerate(TOOLS)]
    w_skins = []
    for i, (code, name, zh, fac, kind, gender) in enumerate(SKINS):
        p = canonical({'id': code, 'schema': SKIN_SCHEMA})
        w_skins.append(dict(_display('skin_assets', 'SN', i + 1), pack_slug=SKIN_PACK, pack_version=SKIN_VERSION, asset_code=code, asset_kind='chibi',
                            name_vi=name, name_zh=zh, faction=fac, char_kind=kind, gender=gender, params_json=p, params_schema_version=SKIN_SCHEMA,
                            sha256=hashlib.sha256(p.encode('utf-8')).hexdigest(), source=SKIN_SOURCE, license=SKIN_LICENSE))
    per = [('actors', ['workspace_id', 'system_key'], w_actors), ('settings', ['workspace_id', 'display_seq'], w_settings),
           ('positions', ['workspace_id', 'display_seq'], w_positions), ('wallets', ['workspace_id', 'display_seq'], w_wallets),
           ('system_agents', ['workspace_id', 'display_seq'], w_agents), ('tools', ['workspace_id', 'display_seq'], w_tools),
           ('skin_assets', ['workspace_id', 'display_seq'], w_skins)]
    # id_counters: số đã dùng lớn nhất mỗi prefix (§2.1 cấp số bằng upsert) ⇒ hàng app tạo sau tiếp nối, không đụng số của seed
    counters = {}
    for _t, _k, rows in per:
        for r in rows:
            if 'display_id' in r:
                pfx = r['display_id'].split('-')[0]
                counters[pfx] = max(counters.get(pfx, 0), r['display_seq'])
    per.append(('id_counters', ['workspace_id', 'prefix'], [dict(workspace_id=WS, prefix=p, last_seq=n) for p, n in counters.items()]))
    return {
        'format': FORMAT,
        'databaseVersion': version,
        'source': {'repo': REPO, 'rev': rev, 'generator': GENERATOR},
        'global': [dict(table='workspaces', conflictKey=['id'],
                        rows=[dict(id=SYSTEM_WS, kind='system', slug='system', name='System', short_code='SYS0')]),
                   dict(table='actors', conflictKey=['workspace_id', 'system_key'], rows=g_actors),
                   dict(table='engines', conflictKey=['slug'], rows=g_engines),
                   dict(table='dna_field_defs', conflictKey=['workspace_id', 'key'], rows=g_dna)],
        'perWorkspace': [dict(table=t, conflictKey=k, rows=rows) for t, k, rows in per],
    }


def build(rev, version):
    if not re.fullmatch(r'[0-9a-f]{40}', rev or ''):
        raise ValueError('rev phải là sha git 40 ký tự hex')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version or ''):
        raise ValueError('version phải dạng X.Y.Z')
    b = body(rev, version)
    return dict(b, sha256=hashlib.sha256(canonical(b).encode('utf-8')).hexdigest())


def render(seed):
    return json.dumps(seed, ensure_ascii=False, indent=2) + '\n'


def _strip(seed):
    return {k: (dict(v, rev=None) if k == 'source' else v) for k, v in seed.items() if k != 'sha256'}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--rev')
    ap.add_argument('--version')
    a = ap.parse_args()
    old_text = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else None
    if a.check:
        if old_text is None:
            sys.exit('✗ thiếu db/spec/seed_reference.json — chạy `pnpm db:sync`')
        old = json.loads(old_text)
        if render(build(old['source']['rev'], old['databaseVersion'])) != old_text:
            sys.exit('✗ seed_reference.json khác đầu ra gen_seed.py (sửa bộ sinh rồi chạy `pnpm db:sync`, không sửa tay tệp)')
        print(f"✓ seed_reference.json = đầu ra gen_seed.py (rev {old['source']['rev'][:12]}, DB v{old['databaseVersion']})")
        return
    new = build(a.rev, a.version)
    if old_text is not None and _strip(json.loads(old_text)) == _strip(new):
        print(f"✓ seed_reference.json không đổi nội dung — giữ rev {json.loads(old_text)['source']['rev'][:12]}")
        return
    text = render(new)
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(text)
    n_g = sum(len(t['rows']) for t in new['global'])
    n_w = sum(len(t['rows']) for t in new['perWorkspace'])
    print(f"✓ seed_reference.json: global {len(new['global'])} bảng / {n_g} hàng, perWorkspace {len(new['perWorkspace'])} bảng / {n_w} hàng, "
          f"rev {a.rev[:12]}, sha256 {new['sha256'][:12]}…")


if __name__ == '__main__':
    main()
