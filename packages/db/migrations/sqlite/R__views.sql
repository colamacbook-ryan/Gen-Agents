-- repeatable: views
-- GENERATED bởi `pnpm db:gen` từ db/spec/schema_v2_2.sql (nguồn = repo, DB v2.3.4) — KHÔNG SỬA TAY.
-- 31 view, theo thứ tự tạo (view sau có thể đọc view trước). Trigger KHÔNG được SELECT từ view.

-- @ga:object view v_role_prompt_budget
CREATE VIEW v_role_prompt_budget AS
WITH primary_engine AS (
  SELECT b.role_id, a.engine_slug, a.id AS account_id, a.runtime_overhead_tokens AS baseline_tok
  FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id   -- v2.1.1 tenant
  WHERE b.role_id IS NOT NULL AND b.priority = 1 AND b.is_enabled = 1 AND b.deleted_at IS NULL
), cur_pos AS (
  SELECT role_id, position_id FROM assignments
  WHERE status = 'active' AND is_primary = 1 AND deleted_at IS NULL
), blocks AS (                                    -- IN lớp Role + Nội quy (workspace) + lớp 5 của vị trí đang giữ
  SELECT i.role_id AS rid, i.layer, i.condition_kind, i.condition_value, i.token_count, i.engine_scope
  FROM instructions i
  WHERE i.role_id IS NOT NULL AND i.status = 'active' AND i.is_enabled = 1 AND i.deleted_at IS NULL
  UNION ALL
  SELECT r.id, i.layer, i.condition_kind, i.condition_value, i.token_count, i.engine_scope
  FROM roles r JOIN instructions i ON i.workspace_id = r.workspace_id AND i.layer = 'house_rules'
  WHERE i.status = 'active' AND i.is_enabled = 1 AND i.deleted_at IS NULL
  UNION ALL
  SELECT p.role_id, i.layer, i.condition_kind, i.condition_value, i.token_count, i.engine_scope
  FROM cur_pos p JOIN instructions i ON i.position_id = p.position_id
  WHERE i.status = 'active' AND i.is_enabled = 1 AND i.deleted_at IS NULL
), blocks_eng AS (
  SELECT b.rid, b.layer, b.condition_kind, b.condition_value, b.token_count
  FROM blocks b LEFT JOIN primary_engine e ON e.role_id = b.rid
  WHERE b.engine_scope IS NULL OR b.engine_scope = e.engine_slug
), in_default AS (
  SELECT rid,
         SUM(CASE WHEN layer NOT IN ('position', 'house_rules') THEN token_count ELSE 0 END) AS in_tok,
         SUM(CASE WHEN layer = 'house_rules' THEN token_count ELSE 0 END) AS rules_tok,
         SUM(CASE WHEN layer = 'position' THEN token_count ELSE 0 END) AS pos_tok
  FROM blocks_eng WHERE condition_kind = 'always' GROUP BY rid
), in_worst AS (                                  -- mỗi loại điều kiện: lấy giá trị nặng nhất, rồi cộng
  SELECT rid, SUM(max_tok) AS cond_tok FROM (
    SELECT rid, condition_kind, MAX(tok) AS max_tok FROM (
      SELECT rid, condition_kind, condition_value, SUM(token_count) AS tok
      FROM blocks_eng WHERE condition_kind <> 'always'
      GROUP BY rid, condition_kind, condition_value
    ) per_value GROUP BY rid, condition_kind
  ) per_kind GROUP BY rid
), dn AS (
  SELECT f.role_id AS rid, SUM(f.token_count) AS dn_tok
  FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id
  WHERE f.status = 'active' AND f.is_in_prompt = 1 AND f.deleted_at IS NULL AND d.deprecated_at IS NULL
  GROUP BY f.role_id
), sk AS (                                        -- chỉ mục skill; không có dòng skill_engine_support = mọi engine
  SELECT rs.role_id AS rid, SUM(sv.index_tokens) AS sk_tok
  FROM role_skills rs
  JOIN skill_versions sv ON sv.id = rs.skill_version_id
  LEFT JOIN primary_engine e ON e.role_id = rs.role_id
  WHERE rs.status = 'learned' AND rs.deleted_at IS NULL
    AND (NOT EXISTS (SELECT 1 FROM skill_engine_support s WHERE s.skill_version_id = sv.id)
         OR EXISTS (SELECT 1 FROM skill_engine_support s WHERE s.skill_version_id = sv.id AND s.engine_slug = e.engine_slug))
  GROUP BY rs.role_id
), pend AS (                                     -- đề xuất chờ duyệt: của Role + của vị trí đang giữ + Nội quy workspace
  SELECT x.rid, SUM(x.tok) AS pend_tok FROM (
    SELECT cs.role_id AS rid, ci.token_delta AS tok
    FROM change_sets cs JOIN change_set_items ci ON ci.change_set_id = cs.id
    WHERE cs.status = 'open' AND ci.status = 'pending' AND cs.role_id IS NOT NULL
    UNION ALL
    SELECT p.role_id, ci.token_delta
    FROM cur_pos p JOIN change_sets cs ON cs.position_id = p.position_id
    JOIN change_set_items ci ON ci.change_set_id = cs.id
    WHERE cs.status = 'open' AND ci.status = 'pending'
    UNION ALL
    SELECT r.id, ci.token_delta
    FROM roles r JOIN change_sets cs ON cs.workspace_id = r.workspace_id AND cs.scope = 'workspace'
    JOIN change_set_items ci ON ci.change_set_id = cs.id
    WHERE cs.status = 'open' AND ci.status = 'pending'
  ) x GROUP BY x.rid
), tools_extra AS (                              -- định nghĩa tool KHÔNG built-in lộ ra CLI (built-in đã nằm trong baseline đo được)
  SELECT x.rid, SUM(x.tok) AS tool_tok FROM (
    SELECT g.role_id AS rid, t.id AS tid, t.definition_tokens AS tok
    FROM tool_grants g JOIN tools t ON t.id = g.tool_id
    WHERE g.role_id IS NOT NULL AND g.mode IN ('allow', 'ask') AND g.deleted_at IS NULL AND t.is_builtin = 0 AND t.status = 'active'
    UNION
    SELECT p.role_id, t.id, t.definition_tokens
    FROM cur_pos p JOIN tool_grants g ON g.position_id = p.position_id JOIN tools t ON t.id = g.tool_id
    WHERE g.mode IN ('allow', 'ask') AND g.deleted_at IS NULL AND t.is_builtin = 0 AND t.status = 'active'
  ) x GROUP BY x.rid
), cur_gc AS (                                   -- bản biên dịch default mới nhất của revision hiện hành (engine chính hoặc trung lập)
  SELECT r.id AS rid, (SELECT cp.id FROM compiled_prompts cp
                       WHERE cp.revision_id = r.current_revision_id AND cp.context_key = 'default'
                         AND (cp.engine_slug IS e.engine_slug OR cp.engine_slug IS NULL)
                       ORDER BY cp.display_seq DESC LIMIT 1) AS gc_id
  FROM roles r LEFT JOIN primary_engine e ON e.role_id = r.id
), cur_gw AS (                                   -- v2.3.1: bản 'worst' CÙNG THẾ HỆ với bản default hiện hành (cùng revision, vị trí, Nội quy, engine, bộ số luật chơi)
  SELECT g.rid, (SELECT w.id FROM compiled_prompts d JOIN compiled_prompts w ON w.revision_id = d.revision_id
                   AND w.position_revision_id IS d.position_revision_id AND w.rules_revision_id IS d.rules_revision_id
                   AND w.engine_slug IS d.engine_slug AND w.polaris_params_hash IS d.polaris_params_hash AND w.context_key = 'worst'
                 WHERE d.id = g.gc_id ORDER BY w.display_seq DESC LIMIT 1) AS gw_id
  FROM cur_gc g
), meas AS (                                     -- v2.3.1: phiên ĐO mới nhất — baseline đã xong 'ok', tài khoản chính, adapter xác nhận nạp đúng bản 'worst'
  SELECT w.rid, (SELECT ms.id FROM sessions ms WHERE ms.compiled_prompt_id = w.gw_id AND ms.engine_account_id = e.account_id
                   AND ms.trigger = 'baseline' AND ms.status = 'ok' AND ms.delivered_prompt_hash IS NOT NULL
                 ORDER BY ms.display_seq DESC LIMIT 1) AS ms_id
  FROM cur_gw w LEFT JOIN primary_engine e ON e.role_id = w.rid
), base AS (
  SELECT r.workspace_id, r.id AS role_id, r.display_id, e.engine_slug, e.account_id AS engine_account_id,
         COALESCE(dn.dn_tok, 0)  AS dna_tokens,
         COALESCE(d.in_tok, 0)   AS instruction_tokens,
         COALESCE(d.rules_tok, 0) AS house_rules_tokens,
         COALESCE(d.pos_tok, 0)  AS position_tokens,
         COALESCE(sk.sk_tok, 0)  AS skill_index_tokens,
         COALESCE((SELECT cp.frame_tokens FROM compiled_prompts cp WHERE cp.id = g.gc_id), 28) AS frame_tokens,  -- 28 = khung compiler v1 (có Nội quy)
         -- v2.2 (CNS-036): Polaris = luật chơi tĩnh (prefix) + phần dự trữ worst-case của hậu tố động; chưa biên dịch: giữ chỗ trần 80
         COALESCE((SELECT SUM(s.token_count) FROM compiled_prompt_segments s
                   WHERE s.compiled_prompt_id = g.gc_id AND s.source_kind IN ('polaris_rules', 'polaris')), 80) AS polaris_tokens,
         (SELECT s.token_count FROM compiled_prompt_segments s
           WHERE s.compiled_prompt_id = g.gc_id AND s.source_kind = 'polaris_rules') AS polaris_rules_tokens,
         (SELECT s.token_count FROM compiled_prompt_segments s
           WHERE s.compiled_prompt_id = g.gc_id AND s.source_kind = 'polaris') AS polaris_suffix_reserve_tokens,
         -- v2.2.3 (Gen): chưa đo → ƯỚC LƯỢNG = max(overhead đo của tài khoản CÙNG engine trong workspace) × 1,1 (làm tròn lên);
         -- chưa có số đo nào của engine đó → setting budget.runtime_overhead_estimate_tokens (mặc định 250). Bỏ hằng 400 (gấp đôi số đo ~204).
         COALESCE(e.baseline_tok,
                  (SELECT (MAX(x.runtime_overhead_tokens) * 11 + 9) / 10 FROM engine_accounts x        -- max(đo, cùng engine) × 1,1, làm tròn lên
                    WHERE x.workspace_id = r.workspace_id AND x.engine_slug = e.engine_slug
                      AND x.runtime_overhead_tokens IS NOT NULL AND x.deleted_at IS NULL),
                  COALESCE((SELECT CAST(st.value_json AS INTEGER) FROM settings st WHERE st.workspace_id = r.workspace_id
                            AND st.key = 'budget.runtime_overhead_estimate_tokens' AND st.deleted_at IS NULL), 250)) AS baseline_overhead_tokens,
         CASE WHEN e.baseline_tok IS NOT NULL THEN NULL
              WHEN EXISTS (SELECT 1 FROM engine_accounts x WHERE x.workspace_id = r.workspace_id AND x.engine_slug = e.engine_slug
                           AND x.runtime_overhead_tokens IS NOT NULL AND x.deleted_at IS NULL) THEN 'same_engine'
              ELSE 'setting' END AS overhead_estimate_basis,
         -- v2.2.1 (CNS-047): 'estimated' (nhãn "ước lượng") — Ký giấy khai sinh dùng được; Cấp thẻ đòi 'measured'
         CASE WHEN e.baseline_tok IS NULL THEN 'estimated' ELSE 'measured' END AS overhead_source,
         (SELECT cp.status FROM compiled_prompts cp WHERE cp.id = g.gc_id) AS compiled_status,
         (SELECT cp.tokenizer FROM compiled_prompts cp WHERE cp.id = g.gc_id) AS compiled_tokenizer,
         -- v2.3.1: token prompt ĐO THẬT của bản 'worst' = phiên đo − phiên baseline vỏ (overhead_shell_session_id) của tài khoản chính; âm / thiếu ⇒ NULL
         m.ms_id AS measured_prompt_session_id,
         (SELECT ms.tokens_input - sh.tokens_input FROM sessions ms JOIN engine_accounts xa ON xa.id = e.account_id
            JOIN sessions sh ON sh.id = xa.overhead_shell_session_id
          WHERE ms.id = m.ms_id AND ms.tokens_input >= sh.tokens_input) AS measured_prompt_tokens,
         COALESCE(te.tool_tok, 0) AS tool_definition_tokens,
         COALESCE(w.cond_tok, 0) AS conditional_worst_extra,
         COALESCE(p.pend_tok, 0) AS pending_delta,
         r.prompt_budget_tokens  AS budget
  FROM roles r
  LEFT JOIN primary_engine e ON e.role_id = r.id
  LEFT JOIN cur_gc g ON g.rid = r.id
  LEFT JOIN meas m ON m.rid = r.id
  LEFT JOIN dn ON dn.rid = r.id          LEFT JOIN in_default d ON d.rid = r.id
  LEFT JOIN in_worst w ON w.rid = r.id   LEFT JOIN sk ON sk.rid = r.id
  LEFT JOIN pend p ON p.rid = r.id       LEFT JOIN tools_extra te ON te.rid = r.id
  WHERE r.deleted_at IS NULL
), tot AS (
  SELECT b.*,
         dna_tokens + instruction_tokens + house_rules_tokens + position_tokens + skill_index_tokens + frame_tokens + polaris_tokens
           AS compiled_tokens,
         baseline_overhead_tokens + tool_definition_tokens AS runtime_overhead_tokens,
         measured_prompt_tokens + baseline_overhead_tokens + tool_definition_tokens AS card_total_worst   -- v2.3.1: NULL khi chưa đo
  FROM base b
)
SELECT t.*,
       compiled_tokens + runtime_overhead_tokens AS total_default,
       compiled_tokens + runtime_overhead_tokens + conditional_worst_extra AS total_worst,
       budget - (compiled_tokens + runtime_overhead_tokens + conditional_worst_extra) AS headroom,
       -- MỘT quy tắc màu cho mọi màn (CNS-004): xanh < 75% ≤ vàng ≤ 100% < đỏ, áp lên total_worst
       CASE WHEN compiled_tokens + runtime_overhead_tokens + conditional_worst_extra > budget THEN 'over'
            WHEN (compiled_tokens + runtime_overhead_tokens + conditional_worst_extra) * 4 >= budget * 3 THEN 'near'
            ELSE 'ok' END AS budget_state,
       CASE WHEN overhead_source = 'measured' THEN 'đo thật' ELSE 'ước lượng' END AS overhead_label,
       -- v2.2.1 (CNS-044) + v2.2.2 (Gen, D20): khối Polaris (luật chơi + dự trữ ★) đo từ bản biên dịch; > 80 = CẢNH BÁO (mục tiêu), không chặn
       polaris_tokens AS polaris_block_tokens,
       CASE WHEN polaris_tokens > 80
            THEN 'khối Polaris ' || polaris_tokens || ' > 80 token (mục tiêu; luật chơi ' || COALESCE(polaris_rules_tokens, '?') || ' + ★ '
                 || COALESCE(polaris_suffix_reserve_tokens, '?') || ') — rút gọn: P4 về khối Giá trị, chú giải ★ vào khung, P1–P4 chỉ còn số + động từ'
            END AS polaris_warning,
       -- v2.3.1 (CNS-154): nguồn của phần prompt — 'measured' khi có số đo thật của bản 'worst' cùng thế hệ, còn lại 'estimated' (ước lượng của compiler)
       CASE WHEN measured_prompt_tokens IS NOT NULL THEN 'measured' ELSE 'estimated' END AS prompt_source,
       CASE WHEN measured_prompt_tokens IS NOT NULL THEN 'đo thật' ELSE 'ước lượng' END AS prompt_label,
       CASE WHEN measured_prompt_tokens IS NOT NULL THEN 'measured:' || engine_slug ELSE compiled_tokenizer END AS prompt_tokenizer,
       -- v2.2.1 (CNS-047): Ký — được dùng overhead ước lượng; v2.2.2: chỉ CHẶN theo tổng ngân sách (M3, ≤ 2.000) và các điều kiện cứng; khối Polaris dài
       -- chỉ cảnh báo. v2.3.1 (CNS-154): Ký dùng ƯỚC LƯỢNG (token_count của compiler, đã gồm biên ×1,15 — G-27); Cấp thẻ dùng SỐ ĐO THẬT (card_total_worst =
       -- token prompt đo của bản 'worst' + overhead đo + định nghĩa tool không built-in), đòi overhead đo + luật chơi đã biên dịch + bản biên dịch ok;
       -- ước lượng không bao giờ mở cổng Cấp thẻ.
       CASE WHEN compiled_tokens + runtime_overhead_tokens + conditional_worst_extra <= budget THEN 1 ELSE 0 END AS sign_ok,
       CASE WHEN card_total_worst <= budget
             AND overhead_source = 'measured' AND polaris_rules_tokens IS NOT NULL AND compiled_status IS 'ok' THEN 1 ELSE 0 END AS card_ok,
       CASE WHEN card_total_worst <= budget
             AND overhead_source = 'measured' AND polaris_rules_tokens IS NOT NULL AND compiled_status IS 'ok' THEN 1 ELSE 0 END AS gate_ok,   -- = card_ok (tên cũ)
       CASE WHEN compiled_tokens + runtime_overhead_tokens + conditional_worst_extra > budget
              THEN 'vượt ngân sách: nặng nhất ' || (compiled_tokens + runtime_overhead_tokens + conditional_worst_extra) || ' / ' || budget
            END AS sign_block_reason,
       CASE WHEN compiled_status IS 'failed' THEN 'bản biên dịch mới nhất lỗi — biên dịch lại'
            WHEN polaris_rules_tokens IS NULL THEN 'chưa biên dịch luật chơi Polaris bằng tokenizer của engine'
            WHEN overhead_source <> 'measured' THEN 'overhead runtime chưa đo — đang dùng ước lượng ' || baseline_overhead_tokens
                 || ' (' || CASE overhead_estimate_basis WHEN 'same_engine' THEN 'max đo cùng engine × 1,1' ELSE 'setting' END || '; Ký được, Cấp thẻ chưa)'
            WHEN measured_prompt_tokens IS NULL THEN 'token prompt chưa đo thật — chạy phiên đo bản biên dịch nặng nhất (Cấp thẻ không dùng ước lượng)'
            WHEN card_total_worst > budget
              THEN 'vượt ngân sách (đo thật): nặng nhất ' || card_total_worst || ' / ' || budget
            END AS card_block_reason
FROM tot t;

-- @ga:object view v_leaderboard
CREATE VIEW v_leaderboard AS
WITH elig AS (
  SELECT w.workspace_id, w.role_id, w.id AS wallet_id, w.balance_minor, r.display_id, r.name, r.condition
  FROM wallets w JOIN roles r ON r.id = w.role_id
  WHERE w.owner_kind = 'role' AND w.status = 'active' AND r.deleted_at IS NULL
    AND r.lifecycle_status IN ('carded', 'suspended')
), ranked AS (
  SELECT e.workspace_id, e.role_id, e.wallet_id, e.balance_minor, e.display_id, e.name, e.condition,
         RANK() OVER (PARTITION BY e.workspace_id ORDER BY e.balance_minor DESC) AS rank,
         COUNT(*) OVER (PARTITION BY e.workspace_id) AS total_roles
  FROM elig e
)
SELECT k.workspace_id, k.role_id, k.wallet_id, k.display_id, k.name, k.condition, k.balance_minor, k.rank, k.total_roles,
       (SELECT MIN(x.balance_minor) FROM ranked x WHERE x.workspace_id = k.workspace_id AND x.balance_minor > k.balance_minor)
         - k.balance_minor AS gap_to_next_minor,
       COALESCE((SELECT SUM(CASE WHEN l.credit_wallet_id = k.wallet_id THEN l.amount_minor ELSE -l.amount_minor END)
                 FROM ledger_entries l
                 WHERE (l.credit_wallet_id = k.wallet_id OR l.debit_wallet_id = k.wallet_id)
                   AND l.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')), 0) AS delta_7d_minor,
       COALESCE((SELECT SUM(CASE WHEN l.credit_wallet_id = k.wallet_id THEN l.amount_minor ELSE -l.amount_minor END)
                 FROM ledger_entries l
                 WHERE (l.credit_wallet_id = k.wallet_id OR l.debit_wallet_id = k.wallet_id)
                   AND l.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
                   AND (l.entry_type IN ('reward', 'honesty_reward')
                        OR (l.entry_type = 'reversal' AND (SELECT o.entry_type FROM ledger_entries o WHERE o.id = l.reverses_entry_id)
                            IN ('reward', 'honesty_reward')))), 0) AS earned_7d_minor
FROM ranked k;

-- @ga:object view v_role_polaris
CREATE VIEW v_role_polaris AS
SELECT r.workspace_id, r.id AS role_id, r.display_id, r.name,
       (SELECT f.value_json FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id
         WHERE f.role_id = r.id AND d.key = 'drive.goal' AND f.deleted_at IS NULL) AS goal_value_json,
       lb.balance_minor, lb.rank, lb.total_roles, lb.gap_to_next_minor, lb.delta_7d_minor, lb.earned_7d_minor,
       lp.id AS last_penalty_entry_id, lp.display_id AS last_penalty_display_id, lp.amount_minor AS last_penalty_minor,
       lp.penalty_class AS last_penalty_class,
       (SELECT m.display_id FROM memories m WHERE m.evidence_ledger_entry_id = lp.id AND m.kind = 'lesson'
          AND m.status = 'active' AND m.deleted_at IS NULL ORDER BY m.display_seq DESC LIMIT 1) AS last_penalty_lesson_display_id,
       r.condition,
       (SELECT w.display_id FROM role_wounds w WHERE w.role_id = r.id AND w.ended_at IS NULL) AS open_wound_display_id,
       (SELECT count(*) FROM tasks t WHERE t.workspace_id = r.workspace_id AND t.status = 'todo' AND t.assignee_role_id IS NULL
          AND t.deleted_at IS NULL
          AND (t.position_id IS NULL OR t.position_id = (SELECT a.position_id FROM assignments a
               WHERE a.role_id = r.id AND a.status = 'active' AND a.deleted_at IS NULL))) AS open_opportunities,
       (SELECT count(*) FROM polaris_checks c WHERE c.role_id = r.id
          AND c.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')) AS polaris_checks_7d
FROM roles r
LEFT JOIN v_leaderboard lb ON lb.role_id = r.id
LEFT JOIN ledger_entries lp ON lp.id = (SELECT l.id FROM ledger_entries l JOIN wallets w ON w.id = l.debit_wallet_id
                                        WHERE w.role_id = r.id AND l.entry_type = 'penalty' ORDER BY l.display_seq DESC LIMIT 1)
WHERE r.deleted_at IS NULL;

-- @ga:object view v_roles
CREATE VIEW v_roles AS
SELECT r.workspace_id, r.id AS role_id, r.display_id, r.display_seq, r.name, r.color, r.avatar_id,
       r.lifecycle_status, r.runtime_state, r.runtime_detail, r.condition,
       ea.engine_slug, eb.model_key, ps.title AS position_title,
       w.balance_minor, lb.rank AS coin_rank, lb.total_roles,
       (SELECT COALESCE(SUM(u.tokens_input + u.tokens_output), 0) FROM usage_daily u
         WHERE u.role_id = r.id AND u.day_local = date('now')) AS tokens_today,
       (SELECT count(*) FROM role_skills rs WHERE rs.role_id = r.id AND rs.status = 'learned' AND rs.deleted_at IS NULL) AS skills_count,
       (SELECT count(*) FROM memories m WHERE m.status = 'active' AND m.deleted_at IS NULL
          AND (m.role_id = r.id OR m.position_id = a.position_id)) AS memories_count,
       b.total_default AS prompt_tokens, b.total_worst AS prompt_tokens_worst, b.budget AS prompt_budget, b.budget_state,
       r.last_active_at
FROM roles r
LEFT JOIN assignments a ON a.role_id = r.id AND a.status = 'active' AND a.deleted_at IS NULL
LEFT JOIN positions ps ON ps.id = a.position_id
LEFT JOIN engine_bindings eb ON eb.role_id = r.id AND eb.workspace_id = r.workspace_id AND eb.priority = 1 AND eb.deleted_at IS NULL
LEFT JOIN engine_accounts ea ON ea.id = eb.engine_account_id AND ea.workspace_id = eb.workspace_id
LEFT JOIN wallets w ON w.role_id = r.id
LEFT JOIN v_leaderboard lb ON lb.role_id = r.id
LEFT JOIN v_role_prompt_budget b ON b.role_id = r.id
WHERE r.deleted_at IS NULL;

-- @ga:object view v_dna_sheet
CREATE VIEW v_dna_sheet AS
SELECT f.workspace_id, f.role_id, f.id AS dna_field_id, f.display_id, d.field_group, d.key, f.item_index,
       f.value_json, f.value_num, f.prose, d.value_type, f.source, f.confirmed_at, d.tier, d.is_core, d.prompt_layer,
       f.is_in_prompt, f.covered_by_instruction_id, f.token_count, f.version, f.status
FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id
WHERE f.deleted_at IS NULL;

-- @ga:object view v_tree_nodes
CREATE VIEW v_tree_nodes AS
WITH RECURSIVE tiers(skill_id, tier) AS (
  SELECT s.id, 1 FROM skills s
  WHERE s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM skill_prereqs p WHERE p.skill_id = s.id AND p.kind = 'upgrade'
                                             AND p.status <> 'obsolete' AND p.deleted_at IS NULL)
  UNION ALL
  SELECT p.skill_id, t.tier + 1 FROM skill_prereqs p JOIN tiers t ON p.requires_skill_id = t.skill_id
  WHERE p.kind = 'upgrade' AND p.status <> 'obsolete' AND p.deleted_at IS NULL AND t.tier < 50
)
SELECT s.workspace_id, 'skill' AS domain, 'SK' AS entity_type, s.id AS node_id, s.display_id, s.slug AS name, s.status,
       c.id AS category_id, c.display_id AS category_display_id, c.name AS category_name,
       br.display_id AS branch_display_id, br.name AS branch_name, g.display_id AS group_display_id, g.name AS group_name,
       t.tier, s.tier_label,
       (SELECT count(*) FROM skill_prereqs p WHERE p.skill_id = s.id AND p.status <> 'obsolete' AND p.deleted_at IS NULL) AS prereq_count,
       'tree:skills/node:' || s.display_id AS anchor
FROM skills s
LEFT JOIN tiers t ON t.skill_id = s.id
LEFT JOIN taxonomy_nodes c ON c.id = s.category_id
LEFT JOIN taxonomy_nodes br ON br.id = c.parent_id
LEFT JOIN taxonomy_nodes g ON g.id = br.parent_id
WHERE s.deleted_at IS NULL
UNION ALL
SELECT k.workspace_id, 'knowledge', 'KN', k.id, k.display_id, k.title, k.status,
       c.id, c.display_id, c.name, br.display_id, br.name, g.display_id, g.name, NULL, NULL, 0,
       'tree:knowledge/node:' || k.display_id
FROM knowledge_items k
LEFT JOIN taxonomy_nodes c ON c.id = k.category_id
LEFT JOIN taxonomy_nodes br ON br.id = c.parent_id
LEFT JOIN taxonomy_nodes g ON g.id = br.parent_id
WHERE k.deleted_at IS NULL AND k.status IN ('active', 'proposed');

-- @ga:object view v_role_skill_tree
CREATE VIEW v_role_skill_tree AS
SELECT r.workspace_id, r.id AS role_id, s.id AS skill_id, s.display_id, s.category_id,
       CASE WHEN rs.status = 'learned' THEN 'learned'
            WHEN rs.status = 'disabled' THEN 'disabled'
            WHEN rs.status = 'proposed' OR s.status = 'proposed' THEN 'proposed'
            WHEN NOT EXISTS (SELECT 1 FROM skill_prereqs p WHERE p.skill_id = s.id AND p.status = 'active' AND p.deleted_at IS NULL
                               AND NOT EXISTS (SELECT 1 FROM role_skills x WHERE x.role_id = r.id AND x.skill_id = p.requires_skill_id
                                                 AND x.status = 'learned' AND x.deleted_at IS NULL)) THEN 'available'
            ELSE 'locked' END AS node_state,
       rs.proficiency
FROM roles r
JOIN skills s ON s.workspace_id = r.workspace_id AND s.deleted_at IS NULL AND s.status <> 'obsolete'
LEFT JOIN role_skills rs ON rs.role_id = r.id AND rs.skill_id = s.id AND rs.deleted_at IS NULL
WHERE r.deleted_at IS NULL;

-- @ga:object view v_container_mounts
CREATE VIEW v_container_mounts AS
SELECT c.workspace_id, c.id AS container_id, c.display_id AS container_display_id, c.kind, c.role_id,
       'auth' AS volume_kind, a.auth_volume AS volume_name, '/auth/' || lower(a.display_id) AS mount_path, 'rw' AS mode,
       a.id AS engine_account_id
FROM containers c
JOIN engine_bindings b ON b.deleted_at IS NULL AND b.is_enabled = 1 AND b.workspace_id = c.workspace_id
     AND ((c.kind = 'role' AND b.role_id = c.role_id) OR (c.kind = 'system' AND b.consumer_kind = 'system'))
JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = c.workspace_id
     AND a.auth_volume IS NOT NULL AND a.deleted_at IS NULL
WHERE c.deleted_at IS NULL
UNION ALL
SELECT c.workspace_id, c.id, c.display_id, c.kind, c.role_id, 'session_tmpfs', NULL, '/run/ga', 'rw', NULL
FROM containers c WHERE c.deleted_at IS NULL;

-- @ga:object view v_quota_windows
CREATE VIEW v_quota_windows AS
WITH latest AS (
  SELECT q.workspace_id, q.engine_account_id, q.window_key, q.window_seconds, q.state, q.remaining_pct, q.reset_at,
         q.observed_at, q.source, q.confidence,
         ROW_NUMBER() OVER (PARTITION BY q.engine_account_id, q.window_key ORDER BY q.observed_at DESC, q.id DESC) AS rn
  FROM quota_snapshots q
), cur AS (SELECT * FROM latest WHERE rn = 1)
SELECT l.workspace_id, l.engine_account_id, a.display_id AS account_display_id, b.consumer_kind, b.role_id, b.priority,
       l.window_key, l.window_seconds, l.state, l.remaining_pct, l.reset_at, l.observed_at, l.source, l.confidence,
       CASE WHEN l.window_seconds IS NULL THEN 'unknown'
            WHEN l.window_seconds = (SELECT MAX(x.window_seconds) FROM cur x WHERE x.engine_account_id = l.engine_account_id) THEN 'longest'
            WHEN l.window_seconds = (SELECT MIN(x.window_seconds) FROM cur x WHERE x.engine_account_id = l.engine_account_id) THEN 'shortest'
            ELSE 'other' END AS window_rank
FROM cur l JOIN engine_accounts a ON a.id = l.engine_account_id AND a.workspace_id = l.workspace_id
LEFT JOIN engine_bindings b ON b.engine_account_id = a.id AND b.workspace_id = a.workspace_id AND b.deleted_at IS NULL;

-- @ga:object view v_account_consent
CREATE VIEW v_account_consent AS
SELECT a.workspace_id, a.id AS engine_account_id, a.display_id AS account_display_id, a.engine_slug, a.account_hint,
       a.consent_id, cn.display_id AS consent_display_id, cn.account_hint AS consent_account_hint, cn.accepted_at AS consent_accepted_at,
       CASE WHEN COALESCE(e.requires_consent, 1) = 0 THEN 'not_required'
            WHEN cn.id IS NULL OR cn.workspace_id IS NOT a.workspace_id OR cn.consent_kind IS NOT 'engine_tos_risk' OR cn.subject IS NOT a.engine_slug
                 OR cn.revoked_at IS NOT NULL OR cn.notice_version IS NOT e.tos_notice_version THEN 'missing'
            WHEN cn.account_hint IS NOT NULL AND cn.account_hint IS NOT a.account_hint THEN 'identity_changed'
            ELSE 'ok' END AS consent_state
FROM engine_accounts a
LEFT JOIN engines e ON e.slug = a.engine_slug
LEFT JOIN consents cn ON cn.id = a.consent_id;

-- @ga:object view v_core_agent_accounts
CREATE VIEW v_core_agent_accounts AS
WITH wk AS (
  SELECT w.id AS workspace_id,
         COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                   AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity') AS core_slug
  FROM workspaces w WHERE w.kind = 'tenant'
), b AS (
  SELECT b.workspace_id, b.id AS engine_binding_id, b.display_id AS binding_display_id, b.priority, b.is_enabled,
         a.id AS engine_account_id, a.display_id AS account_display_id, a.label, a.engine_slug, a.auth_method,
         a.status AS account_status, a.login_status, a.login_checked_at, a.login_started_at, a.quota_state, a.outage_since, wk.core_slug,
         -- v2.2.8 (CONTRACT-r7 §A, OB-05): đồng ý điều khoản hợp lệ (= CONSENT_OK() của schema_v2_2.py); v2.2.9: một nguồn v_account_consent (+ danh tính)
         CASE WHEN vc.consent_state IN ('not_required', 'ok') THEN 1 ELSE 0 END AS consent_ok, vc.consent_state,
         COALESCE((SELECT ei.install_state FROM engine_installs ei WHERE ei.workspace_id = b.workspace_id AND ei.engine_slug = a.engine_slug
                   AND ei.deleted_at IS NULL), 'not_installed') AS engine_install_state,                                   -- v2.3.1 (CNS-137)
         (SELECT lp.id FROM probe_runs lp JOIN containers lc ON lc.id = lp.container_id AND lc.workspace_id = b.workspace_id
            AND lc.kind = 'system' AND lc.deleted_at IS NULL
          WHERE lp.engine_account_id = a.id AND lp.trigger = 'login_check' AND lp.status <> 'running'
          ORDER BY lp.display_seq DESC LIMIT 1) AS last_login_check_id
  FROM engine_bindings b
  JOIN wk ON wk.workspace_id = b.workspace_id
  JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id AND a.deleted_at IS NULL
  JOIN v_account_consent vc ON vc.engine_account_id = a.id
  WHERE b.consumer_kind = 'system' AND b.deleted_at IS NULL
)
SELECT b.*, p.display_id AS last_login_check_display_id, p.status AS last_login_check_status, p.finished_at AS last_login_check_at,
       CASE WHEN b.is_enabled = 1 AND b.account_status = 'active' AND b.engine_slug = b.core_slug AND b.login_status = 'logged_in'
                 AND b.quota_state <> 'exhausted' AND b.outage_since IS NULL AND b.engine_install_state = 'installed'
                 AND p.status IS 'ok' AND b.consent_ok = 1 THEN 1 ELSE 0 END AS is_ready,
       CASE WHEN b.engine_slug <> b.core_slug THEN 'wrong_type'
            -- v2.2.7 (CNS-093): không còn container AI Hệ thống sống (lớp hai — trigger containers_system_last_* chặn khi còn binding)
            WHEN NOT EXISTS (SELECT 1 FROM containers sc WHERE sc.workspace_id = b.workspace_id AND sc.kind = 'system'
                             AND sc.deleted_at IS NULL AND sc.desired_state <> 'absent') THEN 'container_missing'
            WHEN b.engine_install_state <> 'installed' THEN 'engine_not_installed'   -- v2.3.1 (CNS-137): CLI chưa cài / đang tải / cài lỗi
            WHEN b.consent_ok = 0 THEN 'consent_missing'        -- v2.2.8: chưa đồng ý / đã rút / lời cảnh báo đổi version
            WHEN b.is_enabled = 0 THEN 'binding_disabled'
            WHEN b.account_status <> 'active' THEN 'account_' || b.account_status
            -- v2.2.10 (CONTRACT-r8c §A, Q-R8a): owner vừa ĐỔI LOẠI Core agent lúc sự cố — tài khoản mới (gắn sau mốc khoá, CHƯA từng kiểm đăng nhập
            -- đạt trong container AI Hệ thống) đang đăng nhập ⇒ type_change_in_progress; lần kiểm của nó đã xong mà KHÔNG đạt ⇒ lý do theo lần kiểm đó
            -- (login_check_failed / _partial — SỰ CỐ, owner thấy lại "Đổi loại Core agent"); tài khoản đã từng đạt mà đăng nhập lại vẫn là relogin_in_progress
            WHEN b.login_status = 'in_progress'
                 AND (SELECT lw.core_agent_locked_at FROM workspaces lw WHERE lw.id = b.workspace_id) IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM probe_runs op JOIN containers oc ON oc.id = op.container_id AND oc.workspace_id = b.workspace_id
                                   AND oc.kind = 'system'
                                 WHERE op.engine_account_id = b.engine_account_id AND op.trigger = 'login_check' AND op.status = 'ok')
                 THEN CASE WHEN p.id IS NOT NULL THEN 'login_check_' || p.status
                           WHEN COALESCE(b.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0 THEN 'login_stalled'   -- v2.2.11 (CONTRACT-r8d §E)
                           ELSE 'type_change_in_progress' END
            WHEN b.login_status = 'in_progress'                       -- v2.2.9 (CONTRACT-r8b §B/§C): owner đang đăng nhập lại
                 THEN CASE WHEN COALESCE(b.login_started_at >= strftime('%Y-%m-%dT%H:%M:%fZ', app_now(), '-15 minutes'), 0) = 0 THEN 'login_stalled'   -- v2.2.11 (CONTRACT-r8d §E)
                           ELSE 'relogin_in_progress' END
            WHEN b.login_status <> 'logged_in' THEN 'login_' || b.login_status
            WHEN b.outage_since IS NOT NULL THEN 'outage'              -- v2.2.8 (CONTRACT-r8 §C): sự cố phía hãng (5xx)
            WHEN b.quota_state = 'exhausted' THEN 'quota_exhausted'   -- v2.2.8: hết quota
            WHEN p.id IS NULL THEN 'login_check_missing'
            WHEN p.status <> 'ok' THEN 'login_check_' || p.status END AS not_ready_reason,
       CASE WHEN b.is_enabled = 1 AND b.account_status = 'active' AND b.engine_slug = b.core_slug
                 AND b.priority = (SELECT MIN(x.priority) FROM engine_bindings x JOIN engine_accounts xa ON xa.id = x.engine_account_id
                                     AND xa.workspace_id = x.workspace_id
                                   WHERE x.workspace_id = b.workspace_id AND x.consumer_kind = 'system' AND x.deleted_at IS NULL
                                     AND x.is_enabled = 1 AND xa.deleted_at IS NULL AND xa.status = 'active' AND xa.engine_slug = b.core_slug)
            THEN 1 ELSE 0 END AS is_primary
FROM b LEFT JOIN probe_runs p ON p.id = b.last_login_check_id;

-- @ga:object view v_system_agents
CREATE VIEW v_system_agents AS
SELECT sa.workspace_id, sa.id AS system_agent_id, sa.display_id, sa.system_key, sa.model_key, sa.effort, sa.is_enabled,
       sa.selection_state, c.engine_binding_id, c.binding_display_id, c.engine_account_id, c.account_display_id,
       c.label AS account_label, c.priority AS account_priority, c.is_ready AS account_is_ready
FROM system_agents sa
LEFT JOIN v_core_agent_accounts c ON c.workspace_id = sa.workspace_id AND c.is_primary = 1
WHERE sa.deleted_at IS NULL;

-- @ga:object view v_core_agent_status
CREATE VIEW v_core_agent_status AS
WITH wk AS (
  SELECT w.id AS workspace_id, w.core_agent_locked_at,
         COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                   AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity') AS core_slug
  FROM workspaces w WHERE w.kind = 'tenant'
), x AS (
  SELECT wk.workspace_id, wk.core_agent_locked_at, wk.core_slug, COALESCE(e.name, wk.core_slug) AS core_name,
         c.engine_account_id, c.account_display_id, c.label AS account_label, c.binding_display_id, c.consent_state,
         COALESCE(c.is_ready, 0) AS is_ready,
         CASE WHEN c.is_ready = 1 THEN NULL WHEN c.engine_account_id IS NULL THEN 'no_account' ELSE c.not_ready_reason END AS reason,
         COALESCE((SELECT ei.install_state FROM engine_installs ei WHERE ei.workspace_id = wk.workspace_id AND ei.engine_slug = wk.core_slug
                   AND ei.deleted_at IS NULL), 'not_installed') AS engine_install_state                                   -- v2.3.1 (CNS-137)
  FROM wk LEFT JOIN engines e ON e.slug = wk.core_slug
  LEFT JOIN v_core_agent_accounts c ON c.workspace_id = wk.workspace_id AND c.engine_binding_id = (
       SELECT y.engine_binding_id FROM v_core_agent_accounts y WHERE y.workspace_id = wk.workspace_id
       ORDER BY y.is_ready DESC, (y.engine_slug = y.core_slug) DESC, y.is_enabled DESC, y.priority LIMIT 1)
), t AS (
  SELECT x.*,
         CASE x.reason WHEN 'no_account' THEN 'chưa có tài khoản Core agent' WHEN 'wrong_type' THEN 'tài khoản sai loại CLI'
              WHEN 'container_missing' THEN 'container AI Hệ thống không còn' WHEN 'consent_missing' THEN 'chưa có đồng ý điều khoản hợp lệ'
              WHEN 'binding_disabled' THEN 'binding Core agent đang tắt' WHEN 'account_disabled' THEN 'tài khoản bị vô hiệu'
              WHEN 'account_revoked' THEN 'tài khoản bị thu hồi' WHEN 'login_expired' THEN 'đăng nhập hết hạn'
              WHEN 'login_suspended' THEN 'tài khoản bị khoá' WHEN 'login_error' THEN 'lỗi đăng nhập'
              WHEN 'login_unknown' THEN 'chưa xác nhận đăng nhập' WHEN 'outage' THEN 'sự cố từ hãng'
              WHEN 'quota_exhausted' THEN 'hết quota' WHEN 'login_check_missing' THEN 'chưa kiểm đăng nhập'
              WHEN 'login_check_failed' THEN 'lần kiểm đăng nhập mới nhất không đạt' WHEN 'login_check_partial' THEN 'lần kiểm đăng nhập mới nhất không đạt'
              WHEN 'relogin_in_progress' THEN 'đang đăng nhập lại' WHEN 'type_change_in_progress' THEN 'đang đổi loại Core agent'
              WHEN 'login_stalled' THEN 'đăng nhập bị bỏ dở'
              WHEN 'engine_not_installed' THEN 'CLI chưa được cài'                                                             -- v2.3.1 (CNS-137)
              END AS reason_text,
         CASE WHEN x.reason = 'consent_missing' AND x.consent_state = 'identity_changed' THEN 'identity_changed'
              WHEN x.reason = 'engine_not_installed' AND x.engine_install_state = 'installing' THEN 'installing' END AS sub_reason,   -- v2.3.2 (Gen quyết)
         CASE WHEN x.is_ready = 0 AND x.core_agent_locked_at IS NOT NULL THEN 1 ELSE 0 END AS blocks
  FROM x
), u AS (
  SELECT t.*,
         CASE WHEN t.blocks = 1 AND t.reason NOT IN ('relogin_in_progress', 'type_change_in_progress') AND t.sub_reason IS NULL THEN 1 ELSE 0 END
           AS is_incident,
         CASE WHEN t.is_ready = 1 THEN NULL WHEN t.reason = 'container_missing' THEN 'a5.container' ELSE 'a5.system' END AS fix_target,
         CASE WHEN t.is_ready = 1 THEN NULL
              WHEN t.reason = 'outage' THEN 'Chờ hãng hồi phục hoặc bấm Kiểm tra lại'
              WHEN t.reason = 'quota_exhausted' THEN 'Chờ quota mở lại, bấm Kiểm tra lại, hoặc Đổi tài khoản / Đăng nhập lại'
              WHEN t.reason IN ('login_expired', 'login_error', 'login_unknown', 'login_check_missing', 'login_check_failed', 'login_check_partial',
                                'no_account', 'wrong_type', 'binding_disabled', 'account_disabled', 'account_revoked', 'login_stalled')
                   THEN 'Đổi tài khoản / Đăng nhập lại'
              WHEN t.reason = 'login_suspended' THEN 'Đổi tài khoản / Đăng nhập lại (tài khoản khác) hoặc dùng API key'
              WHEN t.reason = 'consent_missing' THEN 'Đồng ý lại điều khoản ' || t.core_name
              WHEN t.reason = 'container_missing' THEN 'Dựng lại container AI Hệ thống'
              WHEN t.reason IN ('relogin_in_progress', 'type_change_in_progress') THEN 'Hoàn tất đăng nhập trong terminal'
              WHEN t.reason = 'engine_not_installed' THEN 'Cài lại CLI'                                                   -- v2.3.1 (CNS-137)
              END AS owner_action
  FROM t
)
SELECT u.workspace_id, u.core_slug, u.core_name, u.core_agent_locked_at, u.engine_account_id, u.account_display_id, u.account_label,
       u.binding_display_id, u.is_ready, u.engine_install_state,
       CASE WHEN u.is_ready = 1 THEN 'ok' WHEN u.core_agent_locked_at IS NULL THEN 'setup' ELSE 'recovery' END AS mode,
       u.blocks AS blocks_admin,
       u.reason, u.reason_text, u.sub_reason,
       CASE u.reason WHEN 'login_expired' THEN 'login_expired' WHEN 'login_suspended' THEN 'account_suspended'
                     WHEN 'outage' THEN 'outage' WHEN 'quota_exhausted' THEN 'quota_exhausted' END AS incident_reason,
       u.is_incident,
       CASE WHEN u.blocks = 1 AND u.reason IN ('outage', 'quota_exhausted') THEN 1 ELSE 0 END AS auto_recheck,
       u.fix_target, u.owner_action,
       CASE WHEN u.blocks = 0 THEN NULL
            WHEN u.is_incident = 1 THEN 'Core agent gặp sự cố: ' || COALESCE(u.reason_text, u.reason) || '. Xử lý trước khi tiếp tục.'
            WHEN u.reason = 'type_change_in_progress' THEN 'Core agent đang đổi loại CLI. Hoàn tất đăng nhập trước khi tiếp tục.'
            WHEN u.sub_reason = 'identity_changed'
                 THEN 'Tài khoản Core agent vừa đổi cần đồng ý điều khoản ' || u.core_name || '. Đồng ý trước khi tiếp tục.'
            WHEN u.sub_reason = 'installing' THEN 'Đang cài CLI. Hoàn tất trước khi tiếp tục.'                                 -- v2.3.2 (Gen quyết)
            ELSE 'Core agent đang đăng nhập lại. Hoàn tất đăng nhập trước khi tiếp tục.' END AS overlay_text,
       CASE WHEN u.is_ready = 1 THEN NULL
            ELSE CASE u.fix_target WHEN 'a5.container' THEN 'A5 › Container (Hạ tầng)' ELSE 'A5 › AI Hệ thống' END || ': ' || u.owner_action
            END AS fix_hint
FROM u;

-- @ga:object view v_core_agent_options
CREATE VIEW v_core_agent_options AS
SELECT e.slug, e.name, e.vendor, e.cli_binary, e.adapter_status, e.priority_order, e.requires_consent,
       CASE WHEN e.adapter_status = 'ready' THEN 1 ELSE 0 END AS selectable,
       CASE WHEN e.slug = 'antigravity' THEN 1 ELSE 0 END AS is_default,
       CASE WHEN e.adapter_status = 'ready' THEN NULL WHEN e.adapter_status = 'coming_soon' THEN 'sắp có' ELSE e.adapter_status END AS badge
FROM engines e WHERE e.core_capable = 1;

-- @ga:object view v_employee_cards
CREATE VIEW v_employee_cards AS
SELECT c.workspace_id, c.id AS card_id, c.display_id AS card_display_id, c.role_id, r.display_id AS role_display_id, r.name,
       c.status, c.issued_at, c.issue_audit_display_id, c.dna_signature, c.prompt_tokens,
       cr.major AS card_major, cr.minor AS card_minor, nr.major AS current_major, nr.minor AS current_minor,
       s.display_id AS superseded_by_display_id,
       CASE WHEN c.status IN ('issued', 'suspended') AND nr.major > cr.major THEN 1 ELSE 0 END AS core_drift
FROM employee_cards c
JOIN roles r ON r.id = c.role_id AND r.workspace_id = c.workspace_id
JOIN revisions cr ON cr.id = c.revision_id AND cr.workspace_id = c.workspace_id
LEFT JOIN revisions nr ON nr.id = r.current_revision_id AND nr.workspace_id = r.workspace_id
LEFT JOIN employee_cards s ON s.id = c.superseded_by_id AND s.workspace_id = c.workspace_id
WHERE c.deleted_at IS NULL;

-- @ga:object view v_wound_messages
CREATE VIEW v_wound_messages AS
SELECT m.workspace_id, w.id AS role_wound_id, w.display_id AS wound_display_id, w.role_id, r.display_id AS role_display_id, r.name,
       CASE WHEN w.ended_at IS NULL THEN 1 ELSE 0 END AS wound_open,
       m.id AS message_id, m.display_id AS message_display_id, m.created_at, m.author_kind, m.channel,
       th.id AS thread_id, th.display_id AS thread_display_id, th.kind AS thread_kind,
       (SELECT t.display_id FROM tasks t WHERE t.source_message_id = m.id AND t.workspace_id = m.workspace_id AND t.deleted_at IS NULL
        ORDER BY t.display_seq LIMIT 1) AS reassigned_task_display_id,
       CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.source_message_id = m.id AND t.workspace_id = m.workspace_id AND t.deleted_at IS NULL)
            THEN 0 ELSE 1 END AS is_pending
FROM role_wounds w
JOIN roles r ON r.id = w.role_id AND r.workspace_id = w.workspace_id
JOIN chat_threads th ON th.workspace_id = w.workspace_id AND th.role_id = w.role_id AND th.agent = 'role'
     AND th.kind IN ('telegram', 'workspace') AND th.deleted_at IS NULL
JOIN chat_messages m ON m.thread_id = th.id AND m.workspace_id = w.workspace_id
WHERE m.author_kind IN ('owner', 'user', 'external') AND m.created_at >= w.started_at
  AND (w.ended_at IS NULL OR m.created_at < w.ended_at);

-- @ga:object view v_attention
CREATE VIEW v_attention AS
SELECT f.workspace_id, 'warn' AS level, f.display_id AS target, 'DN chờ xác nhận' AS what, f.role_id
  FROM dna_fields f WHERE f.deleted_at IS NULL AND (f.status = 'proposed' OR (f.source = 'ai_inferred' AND f.confirmed_at IS NULL))
UNION ALL
SELECT p.workspace_id, 'warn', p.display_id, 'Xin quyền ' || p.requested_tool_slug, p.role_id
  FROM permission_requests p WHERE p.status = 'pending' AND p.deleted_at IS NULL
UNION ALL
SELECT m.workspace_id, 'info', m.display_id, CASE WHEN m.kind = 'lesson' THEN 'Bài học chờ duyệt' ELSE 'Trí nhớ đề xuất' END, m.role_id
  FROM memories m WHERE m.status = 'proposed' AND m.deleted_at IS NULL
UNION ALL
SELECT c.workspace_id, 'info', c.display_id, c.title, c.role_id
  FROM change_sets c WHERE c.status = 'open' AND c.deleted_at IS NULL
UNION ALL
SELECT t.workspace_id, 'info', t.display_id, 'Nhánh/chủng loại AI đề xuất', NULL
  FROM taxonomy_nodes t WHERE t.status = 'proposed' AND t.deleted_at IS NULL
UNION ALL
SELECT w.workspace_id, 'danger', w.display_id, 'Trọng thương — cấp thêm ₲ (bất kỳ khoản > 0) để hồi phục', w.role_id
  FROM role_wounds w WHERE w.ended_at IS NULL
UNION ALL
SELECT m.workspace_id, 'danger', m.display_id, 'Cam kết sắp đến hạn — Role đang nghỉ dưỡng thương (' || w.display_id || ')', w.role_id
  FROM role_wounds w JOIN commitments m ON m.workspace_id = w.workspace_id
  WHERE w.ended_at IS NULL AND m.status = 'open' AND m.deleted_at IS NULL AND m.counterparty_kind IN ('external', 'user')
    AND m.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', w.started_at, '+' || COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s
          WHERE s.workspace_id = w.workspace_id AND s.key = 'economy.wound_commitment_horizon_hours' AND s.deleted_at IS NULL), 72) || ' hours')
    AND (m.promised_by_role_id = w.role_id OR m.position_id IN (SELECT a.position_id FROM assignments a
         WHERE a.role_id = w.role_id AND a.status = 'active' AND a.deleted_at IS NULL))
UNION ALL
SELECT t.workspace_id, 'warn', t.display_id, 'Việc tạm chờ (' || w.display_id || ') — giao lại hoặc chờ hồi phục', w.role_id
  FROM tasks t JOIN role_wounds w ON w.id = t.paused_by_wound_id WHERE t.status = 'blocked'
UNION ALL
SELECT a.workspace_id, 'danger', a.display_id, 'Quota exhausted', NULL
  FROM engine_accounts a WHERE a.quota_state = 'exhausted' AND a.deleted_at IS NULL
UNION ALL
-- v2.2.6 (CONTRACT-r6 A6, CNS-072): quota "chưa xác định" (CLI không trả usage — Claude Code) là INFO, không phải danger thường trực (STD-10)
SELECT a.workspace_id, 'info', a.display_id, 'Quota chưa xác định', NULL
  FROM engine_accounts a WHERE a.quota_state = 'unknown' AND a.deleted_at IS NULL
UNION ALL
-- v2.2.8 (CONTRACT-r8 §C): Core agent gặp sự cố (đã khoá loại Core agent mà không sẵn sàng — hết hạn, outage, hết quota, bị khoá, mất đồng ý,
-- mất container…) ⇒ MỘT hàng danger mỗi workspace = nguồn của overlay "chế độ khắc phục" (chữ = v_core_agent_status.overlay_text).
-- Thay 3 nhóm hàng của v2.2.6/v2.2.7 (danger "0 tài khoản sẵn sàng", danger "bị khoá", warn từng tài khoản chính/dự phòng).
-- v2.2.9 (CONTRACT-r8b §B/§C): hàng danger = sự cố (is_incident = 1, chữ overlay_text giữ); đang đăng nhập lại / đổi danh tính chờ đồng ý lại vẫn
-- chặn Admin nhưng KHÔNG phải sự cố ⇒ hàng warn cùng overlay_text (không báo động giả cho việc owner vừa làm, CNS-105).
SELECT s.workspace_id, CASE WHEN s.is_incident = 1 THEN 'danger' ELSE 'warn' END, COALESCE(s.account_display_id, 'OB-04'), s.overlay_text, NULL
  FROM v_core_agent_status s WHERE s.blocks_admin = 1
UNION ALL
-- v2.2.12 (CONTRACT-r8e §B, CNS-127 — [ĐỀ XUẤT — Gen vòng 8e]): tác tử hệ thống BẬT mà không 'valid' (stale / unavailable / unknown — DB chặn phiên của nó:
-- SA_VALID()) ⇒ MỘT hàng warn mỗi workspace, target = SA- đầu tiên không hợp lệ (CTA mở A5 › AI Hệ thống). Không phải sự cố Core agent: không chuông / Telegram.
SELECT sv.workspace_id, 'warn',
       (SELECT s1.display_id FROM system_agents s1 WHERE s1.workspace_id = sv.workspace_id AND s1.deleted_at IS NULL AND s1.is_enabled = 1
          AND s1.selection_state <> 'valid' ORDER BY s1.display_seq LIMIT 1),
       'AI Hệ thống tạm dừng một phần: ' || count(*) || ' tác tử cần chọn lại model.', NULL
  FROM system_agents sv WHERE sv.deleted_at IS NULL AND sv.is_enabled = 1 AND sv.selection_state <> 'valid'
  GROUP BY sv.workspace_id
UNION ALL
-- v2.2.6 (B1.1): thẻ lệch lõi — không tự thu hồi; gợi ý cấp lại (thẻ cũ thành superseded)
SELECT e.workspace_id, 'info', e.card_display_id,
       'Thẻ lệch lõi (cấp ở v' || e.card_major || '.' || e.card_minor || ', lõi hiện tại v' || e.current_major || '.' || e.current_minor
       || ') — gợi ý cấp lại', e.role_id
  FROM v_employee_cards e WHERE e.core_drift = 1
UNION ALL
SELECT r.workspace_id, 'info', r.display_id, 'Đã khai sinh nhưng chưa có thẻ', r.id
  FROM roles r WHERE r.born_at IS NOT NULL AND r.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM employee_cards c WHERE c.role_id = r.id AND c.status IN ('issued', 'suspended'));

-- @ga:object view v_engine_accounts
CREATE VIEW v_engine_accounts AS
SELECT a.workspace_id, a.id AS engine_account_id, a.display_id, a.engine_slug, a.label, a.auth_method,
       a.login_status, a.quota_state, a.quota_remaining_pct, a.quota_reset_at, a.cli_version_current,
       b.consumer_kind, b.role_id AS consumer_role_id, r.display_id AS consumer_display_id,
       CASE WHEN b.consumer_kind = 'system' THEN 'Hệ thống' ELSE r.name END AS consumer_label, b.priority,
       a.runtime_overhead_tokens,
       (SELECT count(*) FROM capabilities c WHERE c.engine_account_id = a.id AND c.missing_since IS NULL AND c.value_state = 'unknown') AS caps_unknown,
       -- v2.2.5 (INT-20): chip "Core agent" ở màn Engine + Onboarding = tài khoản của AI Hệ thống, cùng loại setting system.core_agent_engine
       CASE WHEN b.consumer_kind = 'system' AND a.engine_slug = COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s
                 WHERE s.workspace_id = a.workspace_id AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity')
            THEN 1 ELSE 0 END AS is_core_agent,
       -- v2.2.9 (CONTRACT-r8b §C): trạng thái đồng ý điều khoản (v_account_consent) — A3.E / A5 hiện banner "đồng ý lại" khi 'missing' hoặc
       -- 'identity_changed' (đăng nhập ra danh tính khác: đồng ý cũ hết hiệu lực, tick lại = CN- mới, giữ EN-/EB-); áp cho Role lẫn AI Hệ thống
       vc.consent_state, vc.consent_display_id,
       -- v2.3.1 (CNS-137): trạng thái cài CLI của loại tài khoản (A5 cột "CLI", nút "Cài lại") — thiếu hàng ⇒ 'not_installed'
       COALESCE(ei.install_state, 'not_installed') AS engine_install_state, ei.installed_version AS engine_installed_version
FROM engine_accounts a
JOIN v_account_consent vc ON vc.engine_account_id = a.id
LEFT JOIN engine_bindings b ON b.engine_account_id = a.id AND b.workspace_id = a.workspace_id AND b.deleted_at IS NULL
LEFT JOIN roles r ON r.id = b.role_id AND r.workspace_id = b.workspace_id
LEFT JOIN engine_installs ei ON ei.workspace_id = a.workspace_id AND ei.engine_slug = a.engine_slug AND ei.deleted_at IS NULL
WHERE a.deleted_at IS NULL;

-- @ga:object view v_engine_installs
CREATE VIEW v_engine_installs AS
SELECT w.id AS workspace_id, e.slug AS engine_slug, e.name AS engine_name, e.adapter_status, e.core_capable,
       i.id AS engine_install_id, COALESCE(i.install_state, 'not_installed') AS install_state, i.installed_version, i.failure_reason, i.detail,
       i.checked_at, COALESCE(i.updated_at, i.created_at) AS state_changed_at,
       CASE WHEN e.slug = COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                                    AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity') THEN 1 ELSE 0 END AS is_core_agent_type
FROM workspaces w CROSS JOIN engines e
LEFT JOIN engine_installs i ON i.workspace_id = w.id AND i.engine_slug = e.slug AND i.deleted_at IS NULL
WHERE w.kind = 'tenant' AND e.adapter_status IN ('ready', 'beta');

-- @ga:object view v_relogin_required
CREATE VIEW v_relogin_required AS
SELECT w.id AS workspace_id, w.restored_at, a.id AS engine_account_id, a.display_id AS account_display_id, a.label, a.engine_slug, a.auth_method,
       b.consumer_kind, b.role_id, r.display_id AS consumer_display_id,
       CASE WHEN b.consumer_kind = 'system' THEN 'Hệ thống' ELSE r.name END AS consumer_label,
       p.display_id AS last_login_check_display_id, p.status AS last_login_check_status, p.finished_at AS last_login_check_at
FROM workspaces w
JOIN engine_bindings b ON b.workspace_id = w.id AND b.deleted_at IS NULL AND b.is_enabled = 1
JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id AND a.deleted_at IS NULL AND a.status = 'active'
LEFT JOIN roles r ON r.id = b.role_id AND r.workspace_id = b.workspace_id
LEFT JOIN probe_runs p ON p.id = (SELECT lp.id FROM probe_runs lp WHERE lp.engine_account_id = a.id AND lp.trigger = 'login_check'
                                   AND lp.finished_at >= w.restored_at ORDER BY lp.display_seq DESC LIMIT 1)   -- lần đang chạy: finished_at NULL ⇒ không tính
WHERE w.restored_at IS NOT NULL AND p.status IS NOT 'ok';

-- @ga:object view v_memory_chain
CREATE VIEW v_memory_chain AS
WITH RECURSIVE chain(start_id, id, display_id, superseded_by_id, depth) AS (
  SELECT id, id, display_id, superseded_by_id, 0 FROM memories
  UNION ALL
  SELECT c.start_id, m.id, m.display_id, m.superseded_by_id, c.depth + 1
  FROM memories m JOIN chain c ON m.id = c.superseded_by_id
  WHERE c.depth < 50
)
SELECT start_id, id, display_id, depth FROM chain;

-- @ga:object view v_ledger_by_role
CREATE VIEW v_ledger_by_role AS
SELECT e.workspace_id, w.role_id, e.id AS entry_id, e.display_id, e.display_seq, e.created_at, e.entry_type, e.penalty_class,
       e.reason, -e.amount_minor AS delta_minor, e.debit_balance_after AS balance_after, e.recorded_by,
       e.evidence_audit_display_id, e.task_id
FROM ledger_entries e JOIN wallets w ON w.id = e.debit_wallet_id WHERE w.owner_kind = 'role'
UNION ALL
SELECT e.workspace_id, w.role_id, e.id, e.display_id, e.display_seq, e.created_at, e.entry_type, e.penalty_class,
       e.reason, e.amount_minor, e.credit_balance_after, e.recorded_by, e.evidence_audit_display_id, e.task_id
FROM ledger_entries e JOIN wallets w ON w.id = e.credit_wallet_id WHERE w.owner_kind = 'role';

-- @ga:object view v_integrity
CREATE VIEW v_integrity AS
SELECT 'wallet_sum_nonzero' AS check_key, workspace_id, SUM(balance_minor) AS value
  FROM wallets GROUP BY workspace_id HAVING SUM(balance_minor) <> 0
UNION ALL
SELECT 'wallet_cache_mismatch', w.workspace_id, count(*)
  FROM wallets w LEFT JOIN ledger_entries e ON e.id = w.last_entry_id
  WHERE w.balance_minor IS NOT (CASE WHEN w.last_entry_id IS NULL THEN 0
                                     WHEN e.debit_wallet_id = w.id THEN e.debit_balance_after ELSE e.credit_balance_after END)
  GROUP BY w.workspace_id
UNION ALL
SELECT 'wound_open_but_funded', w.workspace_id, count(*)
  FROM role_wounds r JOIN wallets w ON w.id = r.wallet_id WHERE r.ended_at IS NULL AND w.balance_minor > 0 GROUP BY w.workspace_id
UNION ALL
SELECT 'auth_volume_multi_mount', m.workspace_id, count(*) FROM (
  SELECT workspace_id, volume_name FROM v_container_mounts WHERE volume_kind = 'auth'
  GROUP BY workspace_id, volume_name HAVING count(*) > 1) m GROUP BY m.workspace_id
UNION ALL
SELECT 'polaris_rules_stale', s.workspace_id, count(*)
  FROM compiled_prompt_segments s JOIN compiled_prompts cp ON cp.id = s.compiled_prompt_id
  JOIN v_penalty_presets p1 ON p1.workspace_id = s.workspace_id AND p1.penalty_class = 'self_reported'
  JOIN v_penalty_presets p3 ON p3.workspace_id = s.workspace_id AND p3.penalty_class = 'concealment'
  JOIN v_penalty_presets p4 ON p4.workspace_id = s.workspace_id AND p4.penalty_class = 'harness_violation'
  WHERE s.source_kind = 'polaris_rules'
    AND cp.display_seq = (SELECT MAX(x.display_seq) FROM compiled_prompts x WHERE x.role_id = cp.role_id
                          AND x.engine_slug IS cp.engine_slug AND x.context_key = cp.context_key)
    AND (json_extract(s.params_json, '$.self_reported_max_bp') IS NOT p1.bound_bp
         OR json_extract(s.params_json, '$.concealment_min_bp') IS NOT p3.bound_bp
         OR json_extract(s.params_json, '$.harness_bp') IS NOT p4.bound_bp)
  GROUP BY s.workspace_id
UNION ALL
SELECT 'core_agent_mismatch', b.workspace_id, count(*)        -- v2.2.5 (INT-20): lớp thứ hai sau trigger engine_bindings_core_agent_*
  FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id   -- v2.2.10 (CONTRACT-r8c §A): chỉ binding đang BẬT (binding cũ
  WHERE b.consumer_kind = 'system' AND b.deleted_at IS NULL AND b.is_enabled = 1  -- đã tắt khi đổi loại lúc sự cố không phải lệch)
    AND a.engine_slug IS NOT COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = b.workspace_id
                                       AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity')
  GROUP BY b.workspace_id
UNION ALL
SELECT 'core_agent_lock_missing', lk.workspace_id, count(*)    -- v2.2.9 (CONTRACT-r8b §A): lớp hai sau probe_runs_core_lock_ai/_au —
  FROM probe_runs lk JOIN workspaces w ON w.id = lk.workspace_id  -- tài khoản Core agent đã kiểm đăng nhập đạt (= CORE_PROBE) mà chưa có mốc
  WHERE w.core_agent_locked_at IS NULL AND lk.trigger = 'login_check' AND lk.status = 'ok'
    AND EXISTS (SELECT 1 FROM containers lc JOIN engine_bindings lb ON lb.workspace_id = lc.workspace_id WHERE lc.id = lk.container_id
                AND lc.workspace_id = lk.workspace_id AND lc.kind = 'system' AND lb.engine_account_id = lk.engine_account_id
                AND lb.consumer_kind = 'system' AND lb.deleted_at IS NULL)
  GROUP BY lk.workspace_id
UNION ALL
SELECT 'core_agent_no_live_binding', w.id, 1                  -- v2.2.6 (A4): lớp hai sau engine_bindings_core_agent_last_* / engine_accounts_core_agent_last_u
  FROM workspaces w WHERE w.kind = 'tenant' AND w.core_agent_locked_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id
                   WHERE b.workspace_id = w.id AND b.consumer_kind = 'system' AND b.deleted_at IS NULL AND b.is_enabled = 1
                     AND a.deleted_at IS NULL AND a.status = 'active'
                     AND a.engine_slug = COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                                                   AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity'))
UNION ALL
SELECT 'core_agent_container_missing', b.workspace_id, 1      -- v2.2.7 (CNS-093): lớp hai sau containers_system_last_u/_d
  FROM engine_bindings b WHERE b.consumer_kind = 'system' AND b.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = b.workspace_id AND c.kind = 'system' AND c.deleted_at IS NULL
                   AND c.desired_state <> 'absent')
  GROUP BY b.workspace_id
UNION ALL
SELECT 'consumer_engine_duplicate', d.workspace_id, count(*)  -- v2.2.8 (CONTRACT-r8 §A): lớp hai sau engine_bindings_one_per_engine_* /
  FROM (SELECT b.workspace_id FROM engine_bindings b                -- engine_accounts_one_per_engine_u (v2.2.6 rotation_without_consent: đã gỡ)
        JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id
        WHERE b.deleted_at IS NULL GROUP BY b.workspace_id, b.consumer_kind, b.role_id, a.engine_slug HAVING count(*) > 1) d
  GROUP BY d.workspace_id
UNION ALL
SELECT 'anchors_gone', workspace_id, count(*) FROM message_anchors WHERE resolved_state = 'gone' GROUP BY workspace_id
UNION ALL
SELECT 'blobs_orphan', b.workspace_id, count(*) FROM blobs b
  WHERE b.gc_after IS NULL
    AND NOT EXISTS (SELECT 1 FROM knowledge_items k WHERE k.blob_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM message_attachments a WHERE a.blob_id = b.id OR a.thumbnail_blob_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM avatars v WHERE v.blob_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM skill_files f WHERE f.blob_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM probe_runs p WHERE p.raw_blob_id = b.id)
  GROUP BY b.workspace_id;

-- @ga:object view v_card_checks
CREATE VIEW v_card_checks AS                      -- lưới "Thẻ › checklist": 9 hàng CK-01…CK-09 đọc từ checks_json (đóng băng khi cấp)
SELECT c.workspace_id, c.id AS card_id, c.display_id AS card_display_id, c.role_id, c.status AS card_status,
       json_extract(j.value, '$.code') AS check_code, json_extract(j.value, '$.key') AS check_key,
       json_extract(j.value, '$.status') AS check_status, json_extract(j.value, '$.required') AS is_required,
       json_extract(j.value, '$.evidence_display') AS evidence_display, json_extract(j.value, '$.detail') AS detail,
       json_extract(j.value, '$.checked_at') AS checked_at
FROM employee_cards c, json_each(c.checks_json) j
WHERE c.deleted_at IS NULL;

-- @ga:object view v_setup_checklist
CREATE VIEW v_setup_checklist AS
WITH wk AS (
  SELECT w.id AS workspace_id,
         COALESCE((SELECT json_extract(s.value_json, '$') FROM settings s WHERE s.workspace_id = w.id
                   AND s.key = 'system.core_agent_engine' AND s.deleted_at IS NULL), 'antigravity') AS core_slug
  FROM workspaces w WHERE w.kind = 'tenant'
), k AS (
  SELECT wk.workspace_id, wk.core_slug, COALESCE(e.name, wk.core_slug) AS core_name, COALESCE(e.requires_consent, 1) AS core_requires_consent,
    (SELECT count(*) FROM v_core_agent_accounts ca WHERE ca.workspace_id = wk.workspace_id AND ca.is_ready = 1) AS ready_n,
    (SELECT count(*) FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id
      WHERE b.workspace_id = wk.workspace_id AND b.consumer_kind = 'system' AND b.deleted_at IS NULL AND a.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM v_account_consent vc WHERE vc.engine_account_id = a.id AND vc.consent_state NOT IN ('not_required', 'ok'))) AS unconsented_n,   -- v2.2.9: một nguồn
    (SELECT count(*) FROM engine_bindings b JOIN engine_accounts a ON a.id = b.engine_account_id AND a.workspace_id = b.workspace_id
      WHERE b.workspace_id = wk.workspace_id AND b.consumer_kind = 'system' AND b.deleted_at IS NULL AND a.deleted_at IS NULL) AS sys_acc_n,
    (SELECT count(*) FROM v_system_agents sa
      WHERE sa.workspace_id = wk.workspace_id AND sa.is_enabled = 1 AND sa.engine_account_id IS NOT NULL) AS sa_core_n,
    (SELECT count(*) FROM system_agents sv WHERE sv.workspace_id = wk.workspace_id AND sv.deleted_at IS NULL AND sv.is_enabled = 1 AND sv.selection_state <> 'valid') AS sa_bad_n,                 -- v2.2.12
    (SELECT count(*) FROM system_agents sv WHERE sv.workspace_id = wk.workspace_id AND sv.deleted_at IS NULL AND sv.is_enabled = 1
        AND sv.selection_state = 'stale') AS sa_stale_n,                                                                  -- v2.2.11 (v2.2.12: chỉ tác tử bật)
    (SELECT count(*) FROM system_agents sv WHERE sv.workspace_id = wk.workspace_id AND sv.deleted_at IS NULL AND sv.is_enabled = 1
        AND sv.selection_state = 'valid') AS sa_valid_n                                                                   -- v2.2.11
  FROM wk LEFT JOIN engines e ON e.slug = wk.core_slug
)
SELECT w.id AS workspace_id, 'OB-01' AS check_code, 'owner' AS check_key, 'users' AS source_table,
       CASE WHEN EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.access_level = 'owner' AND m.removed_at IS NULL)
            THEN 'ok' ELSE 'err' END AS check_status,
       NULL AS check_detail
FROM workspaces w WHERE w.kind = 'tenant'
UNION ALL
SELECT w.id, 'OB-02', 'admin_password', 'users',
       CASE WHEN EXISTS (SELECT 1 FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = w.id
                         AND m.access_level = 'owner' AND u.must_change_password = 0 AND u.password_changed_at IS NOT NULL)
            THEN 'ok' ELSE 'err' END, NULL
FROM workspaces w WHERE w.kind = 'tenant'
UNION ALL
SELECT w.id, 'OB-03', 'system_container', 'containers',
       CASE WHEN EXISTS (SELECT 1 FROM containers c WHERE c.workspace_id = w.id AND c.kind = 'system' AND c.deleted_at IS NULL)
            THEN 'ok' ELSE 'err' END, NULL
FROM workspaces w WHERE w.kind = 'tenant'
UNION ALL
SELECT k.workspace_id, 'OB-04', 'core_agent_logged_in', 'engine_accounts',
       CASE WHEN k.ready_n >= 1 THEN 'ok' ELSE 'err' END,
       CASE WHEN k.ready_n >= 1 THEN '1 tài khoản sẵn sàng · Core agent (' || k.core_name || ')'
            ELSE '0 tài khoản sẵn sàng · bắt buộc trước khi tạo Role (lần kiểm đăng nhập mới nhất phải đạt)' END
FROM k
UNION ALL
SELECT k.workspace_id, 'OB-05', 'engine_consent', 'consents',
       CASE WHEN k.core_requires_consent = 0 OR (k.sys_acc_n > 0 AND k.unconsented_n = 0) THEN 'ok' ELSE 'err' END,
       CASE WHEN k.core_requires_consent = 0 THEN 'không cần với ' || k.core_name
            WHEN k.sys_acc_n = 0 THEN 'chưa đồng ý điều khoản ' || k.core_name || ' — bắt buộc trước khi đăng nhập Core agent'   -- v2.2.8
            WHEN k.unconsented_n = 0 THEN 'đã đồng ý điều khoản ' || k.core_name || ' cho tài khoản Core agent'
            ELSE 'thiếu đồng ý điều khoản ' || k.core_name || ' (đã rút hoặc lời cảnh báo đổi) — đồng ý lại trước khi dùng' END
FROM k
UNION ALL
SELECT w.id, 'OB-06', 'capabilities_scanned', 'capabilities',
       CASE WHEN EXISTS (SELECT 1 FROM capabilities c JOIN engine_bindings b ON b.engine_account_id = c.engine_account_id AND b.workspace_id = c.workspace_id
                         WHERE b.workspace_id = w.id AND b.consumer_kind = 'system' AND b.deleted_at IS NULL)
            THEN 'ok' ELSE 'warn' END, NULL
FROM workspaces w WHERE w.kind = 'tenant'
UNION ALL
SELECT k.workspace_id, 'OB-07', 'system_agents', 'system_agents',
       CASE WHEN k.sa_bad_n = 0 AND k.sa_core_n = 4 THEN 'ok' ELSE 'err' END,
       CASE WHEN k.sa_bad_n > 0 THEN k.sa_valid_n || '/4 tác tử hệ thống · cần chọn lại model'
                                     || CASE WHEN k.sa_stale_n > 0 THEN ' sau khi đổi loại Core agent' ELSE '' END
            ELSE k.sa_core_n || '/4 tác tử hệ thống · tài khoản Core agent (' || k.core_name || ')' END
FROM k;

-- @ga:object view v_penalty_presets
CREATE VIEW v_penalty_presets AS
WITH s AS (
  SELECT w.id AS workspace_id,
    COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = w.id AND x.key = 'economy.penalty.self_reported_max_bp' AND x.deleted_at IS NULL), 1000) AS cap_bp,
    COALESCE((SELECT x.value_json FROM settings x WHERE x.workspace_id = w.id AND x.key = 'economy.penalty.dissatisfaction_presets_bp' AND x.deleted_at IS NULL), '[500,1000,2000,3000]') AS dis_json,
    COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = w.id AND x.key = 'economy.penalty.concealment_min_bp' AND x.deleted_at IS NULL), 5000) AS floor_bp,
    COALESCE((SELECT CAST(x.value_json AS INTEGER) FROM settings x WHERE x.workspace_id = w.id AND x.key = 'economy.penalty.harness_bp' AND x.deleted_at IS NULL), 10000) AS harness_bp,
    COALESCE((SELECT CASE x.value_json WHEN 'true' THEN 1 WHEN 'false' THEN 0 END FROM settings x WHERE x.workspace_id = w.id
              AND x.key = 'economy.penalty.self_confessed_harness_as_self_reported' AND x.deleted_at IS NULL), 1) AS self_confessed
  FROM workspaces w WHERE w.kind = 'tenant'
)
SELECT workspace_id, 'self_reported' AS penalty_class, 1 AS ordinal, 'max' AS rule, cap_bp AS bound_bp, json_array(cap_bp) AS presets_bp_json,
       1 AS never_to_zero, 'Tự báo thất bại' AS label,
       'trừ tối đa theo trần; KHÔNG BAO GIỜ một mình đưa ví về 0; mỗi việc một lần; MỌI phạt gắn việc đã tự báo hoặc trích bản tự báo đều là hạng này'
       || CASE WHEN self_confessed = 1 THEN ' (kể cả tự khai lách luật harness)' ELSE '' END AS note FROM s
UNION ALL
SELECT workspace_id, 'dissatisfaction', 2, 'free', NULL, dis_json, 0,
       'Không hài lòng', 'owner tuỳ chọn mức (gợi ý theo mảng), bắt buộc lý do + việc hoặc audit (bằng chứng về một việc ⇒ phải gắn việc đó); dùng cho vi phạm Giá trị/Nội quy owner phát hiện' FROM s
UNION ALL
SELECT workspace_id, 'concealment', 3, 'min', floor_bp, json_array(floor_bp), 0,
       'Che giấu / lừa dối bị phát hiện', 'trừ tối thiểu theo sàn; bằng chứng audit (bản ghi phát hiện); vi phạm Giá trị/Nội quy có yếu tố lừa dối' FROM s
UNION ALL
SELECT workspace_id, 'harness_violation', 4, 'exact', harness_bp, json_array(harness_bp), 0,
       'Vi phạm luật harness', 'trừ đúng mức; bằng chứng audit do máy phát hiện (gateway/judge)'
       || CASE WHEN self_confessed = 1 THEN '; Role tự khai → hạng tự báo' ELSE '; Role tự khai vẫn áp mức này' END FROM s;

-- @ga:object view v_role_wounds
CREATE VIEW v_role_wounds AS
SELECT w.workspace_id, w.id AS role_wound_id, w.display_id, w.role_id, r.display_id AS role_display_id, r.name,
       w.started_at, w.ended_at, CASE WHEN w.ended_at IS NULL THEN 1 ELSE 0 END AS is_open,
       c.display_id AS cause_display_id, c.penalty_class AS cause_penalty_class, c.amount_minor AS cause_amount_minor,
       j.display_id AS reflection_job_display_id, j.status AS reflection_status,
       (SELECT count(*) FROM jobs x WHERE x.workspace_id = w.workspace_id AND x.kind = 'wound_reflection'
          AND json_extract(x.payload_json, '$.role_wound_id') = w.id) AS reflection_runs,
       CASE WHEN w.reflection_done_at IS NULL AND j.status IN ('failed', 'dead', 'cancelled')
             AND (SELECT count(*) FROM jobs x WHERE x.workspace_id = w.workspace_id AND x.kind = 'wound_reflection'
                    AND json_extract(x.payload_json, '$.role_wound_id') = w.id)
                 < COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s WHERE s.workspace_id = w.workspace_id
                             AND s.key = 'economy.reflection_max_runs' AND s.deleted_at IS NULL), 3)
            THEN 1 ELSE 0 END AS can_rerun_reflection,
       (SELECT ss.display_id FROM sessions ss WHERE ss.id = w.reflection_session_id) AS reflection_session_display_id,
       w.reflection_done_at, w.lessons_proposed,
       (SELECT count(*) FROM memories m WHERE m.role_wound_id = w.id AND m.status = 'proposed' AND m.deleted_at IS NULL) AS lessons_pending,
       (SELECT count(*) FROM tasks t WHERE t.paused_by_wound_id = w.id) AS tasks_paused,
       (SELECT count(*) FROM commitments m
         WHERE m.workspace_id = w.workspace_id AND m.status = 'open' AND m.deleted_at IS NULL AND m.counterparty_kind IN ('external', 'user')
           AND m.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', w.started_at, '+' || COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s
                 WHERE s.workspace_id = w.workspace_id AND s.key = 'economy.wound_commitment_horizon_hours' AND s.deleted_at IS NULL), 72) || ' hours')
           AND (m.promised_by_role_id = w.role_id OR m.position_id IN (SELECT a.position_id FROM assignments a
                WHERE a.role_id = w.role_id AND a.status = 'active' AND a.deleted_at IS NULL))) AS commitments_due,
       COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s WHERE s.workspace_id = w.workspace_id
                 AND s.key = 'economy.revive_suggest_minor' AND s.deleted_at IS NULL), 50000) AS revive_suggest_minor,
       n.display_id AS notification_display_id,
       -- v2.2.6 (B1.4): tin owner/người khác gửi lúc Role Trọng thương — được lưu, không tạo việc; danh sách ở v_wound_messages
       (SELECT count(*) FROM v_wound_messages wm WHERE wm.role_wound_id = w.id) AS inbound_messages,
       (SELECT count(*) FROM v_wound_messages wm WHERE wm.role_wound_id = w.id AND wm.is_pending = 1) AS inbound_pending
FROM role_wounds w
JOIN roles r ON r.id = w.role_id
JOIN ledger_entries c ON c.id = w.cause_entry_id
LEFT JOIN jobs j ON j.id = w.reflection_job_id
LEFT JOIN notifications n ON n.id = w.notification_id;

-- @ga:object view v_skin_pack_usage
CREATE VIEW v_skin_pack_usage AS
SELECT a.workspace_id, COALESCE(s.pack_slug, a.skin_pack_slug) AS pack_slug, COALESCE(s.asset_code, a.skin_asset_code) AS asset_code,
       s.id AS skin_asset_id, s.display_id AS skin_asset_display_id, a.skin_license AS license, a.skin_attribution AS attribution,
       a.id AS avatar_id, a.display_id AS avatar_display_id, r.id AS role_id, r.display_id AS role_display_id, r.name,
       CASE WHEN r.avatar_id = a.id THEN 1 ELSE 0 END AS is_current
FROM avatars a JOIN roles r ON r.id = a.role_id
LEFT JOIN skin_assets s ON s.id = a.skin_asset_id
WHERE a.source = 'library' AND r.deleted_at IS NULL;

-- @ga:object view v_character_library
CREATE VIEW v_character_library AS
SELECT s.workspace_id, s.id AS skin_asset_id, s.display_id, s.display_seq, s.asset_code, s.name_vi, s.name_zh, s.faction, s.char_kind, s.gender,
       s.pack_slug, s.pack_version, s.asset_kind, s.source, s.source_url, s.license, s.license_url, s.attribution, s.sha256,
       s.params_schema_version, s.params_json, s.file_path, s.mime, s.status, s.is_enabled,
       CASE WHEN s.status = 'active' AND s.is_enabled = 1 THEN 1 ELSE 0 END AS is_selectable,
       (SELECT count(*) FROM roles r JOIN avatars a ON a.id = r.avatar_id WHERE a.skin_asset_id = s.id AND r.deleted_at IS NULL) AS roles_using
FROM skin_assets s
WHERE s.deleted_at IS NULL;

-- @ga:object view v_role_avatar_state
CREATE VIEW v_role_avatar_state AS
WITH b0 AS (
  SELECT r.workspace_id, r.id AS role_id, r.display_id AS role_display_id, r.name, r.avatar_id,
         strftime('%Y-%m-%dT%H:%M:%fZ', app_now()) AS now_ts,
         COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s WHERE s.workspace_id = r.workspace_id AND s.key = 'avatar.transient_seconds'
                   AND s.deleted_at IS NULL), 20) AS t_sec,
         COALESCE((SELECT CAST(s.value_json AS INTEGER) FROM settings s WHERE s.workspace_id = r.workspace_id AND s.key = 'avatar.idle_after_minutes'
                   AND s.deleted_at IS NULL), 10) AS idle_min,
         (SELECT w.id FROM wallets w WHERE w.role_id = r.id AND w.owner_kind = 'role') AS wallet_id
  FROM roles r WHERE r.deleted_at IS NULL
), b AS (
  SELECT b0.*, strftime('%Y-%m-%dT%H:%M:%fZ', b0.now_ts, '-' || b0.t_sec || ' seconds') AS t_from FROM b0
), run AS (                              -- phiên Role đang chạy (mới nhất)
  SELECT b.role_id, s.id, s.display_id, s.started_at, s.phase, s.phase_at, s.engine_account_id
  FROM b JOIN sessions s ON s.id = (SELECT x.id FROM sessions x WHERE x.workspace_id = b.workspace_id AND x.role_id = b.role_id AND x.agent_kind = 'role'
                                    AND x.status = 'running' ORDER BY x.display_seq DESC LIMIT 1)
), bind AS (                             -- binding sống + bật của Role, tài khoản active (danh sách ưu tiên của chính Role)
  SELECT eb.role_id, eb.priority, eb.engine_account_id, ea.display_id AS account_display_id, ea.quota_state, ea.quota_scanned_at, ea.quota_reset_at,
         ea.login_status, ea.outage_since, e.adapter_status
  FROM engine_bindings eb JOIN engine_accounts ea ON ea.id = eb.engine_account_id AND ea.workspace_id = eb.workspace_id
  JOIN engines e ON e.slug = ea.engine_slug
  WHERE eb.consumer_kind = 'role' AND eb.deleted_at IS NULL AND eb.is_enabled = 1 AND ea.deleted_at IS NULL AND ea.status = 'active'
), waits AS (                            -- việc của Role chờ owner duyệt
  SELECT t.assignee_role_id AS role_id, 'tasks' AS tbl, t.id, t.display_id, COALESCE(t.updated_at, t.created_at) AS at, 1 AS o, t.display_seq AS sq
  FROM tasks t WHERE t.status IN ('waiting_approval', 'waiting_permission') AND t.deleted_at IS NULL AND t.assignee_role_id IS NOT NULL
  UNION ALL
  SELECT p.role_id, 'permission_requests', p.id, p.display_id, p.created_at, 2, p.display_seq
  FROM permission_requests p WHERE p.status = 'pending' AND p.deleted_at IS NULL
  UNION ALL
  SELECT a.role_id, 'change_sets', c.id, c.display_id, c.created_at, 3, c.display_seq
  FROM change_sets c JOIN actors a ON a.id = c.proposed_by AND a.kind = 'role' AND a.role_id IS NOT NULL
  WHERE c.status = 'open' AND c.deleted_at IS NULL
), wait_pick AS (
  SELECT w.*, ROW_NUMBER() OVER (PARTITION BY w.role_id ORDER BY w.at, w.o, w.sq) AS rn FROM waits w
), disc AS (                             -- tri thức mới của Role được duyệt (change set áp dụng) · Role báo bất thường (events role.anomaly, ĐỀ XUẤT)
  SELECT COALESCE(k.role_id, c.role_id, pa.role_id) AS role_id, 'knowledge_items' AS tbl, k.id, k.display_id, c.decided_at AS at, k.display_seq AS sq
  FROM change_set_items i JOIN change_sets c ON c.id = i.change_set_id
  JOIN knowledge_items k ON k.id = i.knowledge_item_id
  LEFT JOIN actors pa ON pa.id = c.proposed_by
  WHERE i.op = 'create' AND i.status = 'accepted'                          -- mục được chấp nhận (từ chối / chưa duyệt ⇒ không; decided_at NULL ⇒ không)
  UNION ALL
  SELECT e.role_id, 'events', e.id, e.display_id, e.created_at, e.display_seq
  FROM events e WHERE e.kind = 'role.anomaly' AND e.severity IN ('warn', 'danger') AND e.role_id IS NOT NULL
), disc_pick AS (
  SELECT d.*, b.t_sec, ROW_NUMBER() OVER (PARTITION BY d.role_id ORDER BY d.at DESC, d.sq DESC) AS rn
  FROM disc d JOIN b ON b.role_id = d.role_id WHERE d.at >= b.t_from AND d.at <= b.now_ts
), elig AS (                             -- cùng tập với v_leaderboard (ví Role active, Role còn sống, carded / suspended)
  SELECT w.workspace_id, w.role_id, w.id AS wallet_id, w.balance_minor
  FROM wallets w JOIN roles rr ON rr.id = w.role_id
  WHERE w.owner_kind = 'role' AND w.status = 'active' AND rr.deleted_at IS NULL AND rr.lifecycle_status IN ('carded', 'suspended')
), rank1 AS (                            -- đang hạng 1 (= v_leaderboard.rank 1, đồng hạng tính) VÀ bút toán gần nhất trong T giây mà TRƯỚC nó Role chưa hạng 1
  SELECT e.role_id, x.id, x.display_id, x.created_at, b.t_sec
  FROM b JOIN elig e ON e.role_id = b.role_id
  JOIN ledger_entries x ON x.id = (
    SELECT l.id FROM ledger_entries l
    WHERE l.workspace_id = e.workspace_id AND l.created_at >= b.t_from AND l.created_at <= b.now_ts
      AND EXISTS (SELECT 1 FROM elig o WHERE o.workspace_id = e.workspace_id AND o.role_id <> e.role_id
                  AND COALESCE((SELECT CASE WHEN p.debit_wallet_id = o.wallet_id THEN p.debit_balance_after ELSE p.credit_balance_after END
                                FROM ledger_entries p WHERE (p.debit_wallet_id = o.wallet_id OR p.credit_wallet_id = o.wallet_id)
                                  AND p.display_seq < l.display_seq ORDER BY p.display_seq DESC LIMIT 1), 0)
                    > COALESCE((SELECT CASE WHEN p.debit_wallet_id = e.wallet_id THEN p.debit_balance_after ELSE p.credit_balance_after END
                                FROM ledger_entries p WHERE (p.debit_wallet_id = e.wallet_id OR p.credit_wallet_id = e.wallet_id)
                                  AND p.display_seq < l.display_seq ORDER BY p.display_seq DESC LIMIT 1), 0))
    ORDER BY l.display_seq DESC LIMIT 1)
  WHERE NOT EXISTS (SELECT 1 FROM elig o WHERE o.workspace_id = e.workspace_id AND o.balance_minor > e.balance_minor)
), commits AS (                          -- Role nhận việc (đối chiếu Polaris task_accept) hoặc ký cam kết
  SELECT p.role_id, 'polaris_checks' AS tbl, p.id, p.display_id, p.created_at AS at, p.display_seq AS sq
  FROM polaris_checks p WHERE p.subject_kind = 'task_accept'
  UNION ALL
  SELECT m.promised_by_role_id, 'commitments', m.id, m.display_id, m.created_at, m.display_seq
  FROM commitments m WHERE m.promised_by_role_id IS NOT NULL AND m.deleted_at IS NULL
), commit_pick AS (
  SELECT c.*, b.t_sec, ROW_NUMBER() OVER (PARTITION BY c.role_id ORDER BY c.at DESC, c.sq DESC) AS rn
  FROM commits c JOIN b ON b.role_id = c.role_id WHERE c.at >= b.t_from AND c.at <= b.now_ts
), lastmsg AS (                          -- câu trả lời gần nhất (tin final) của Role
  SELECT b.role_id, m.id, m.display_id, m.created_at, m.certainty, b.t_from, b.t_sec
  FROM b JOIN chat_messages m ON m.id = (
    SELECT x.id FROM chat_messages x JOIN chat_threads th ON th.id = x.thread_id LEFT JOIN actors xa ON xa.id = x.author_actor_id
    WHERE x.workspace_id = b.workspace_id AND x.author_kind = 'role' AND x.status = 'final' AND x.created_at <= b.now_ts
      AND COALESCE(xa.role_id, th.role_id) IS b.role_id
    ORDER BY x.display_seq DESC LIMIT 1)
), cards AS (                            -- thẻ sống (ux_cd_live: tối đa một mỗi Role)
  SELECT c.role_id, c.id, c.display_id, c.status, c.issued_at, c.suspended_at
  FROM employee_cards c WHERE c.status IN ('issued', 'suspended') AND c.deleted_at IS NULL
), pol AS (                              -- hợp đồng giờ làm A3.P: giờ địa phương theo timezone của policy
  SELECT b.role_id, b.now_ts, p.id AS policy_id, p.display_id AS policy_display_id, p.quiet_start_min, p.quiet_end_min, p.weekend_differs,
         p.weekend_quiet_start_min, p.weekend_quiet_end_min, app_local_time(b.now_ts, p.timezone) AS loc
  FROM b JOIN proactive_policies p ON p.role_id = b.role_id AND p.workspace_id = b.workspace_id AND p.deleted_at IS NULL
), polq AS (
  SELECT pol.*,
         CAST(strftime('%H', loc) AS INTEGER) * 3600 + CAST(strftime('%M', loc) AS INTEGER) * 60 + CAST(strftime('%S', loc) AS INTEGER) AS sod,
         60 * CASE WHEN weekend_differs = 1 AND strftime('%w', loc) IN ('0', '6') THEN weekend_quiet_start_min ELSE quiet_start_min END AS qs,
         60 * CASE WHEN weekend_differs = 1 AND strftime('%w', loc) IN ('0', '6') THEN weekend_quiet_end_min ELSE quiet_end_min END AS qe
  FROM pol
), hours AS (                            -- in_quiet: trong giờ im lặng (start > end = qua đêm; start = end = không có giờ im lặng); mốc theo khung của ngày hiện tại
  SELECT role_id, policy_id, policy_display_id,
         CASE WHEN sod IS NULL OR qs = qe THEN 0 WHEN qs < qe THEN (sod >= qs AND sod < qe) ELSE (sod >= qs OR sod < qe) END AS in_quiet,
         strftime('%Y-%m-%dT%H:%M:%S.000Z', now_ts, '-' || ((sod - qs + 86400) % 86400) || ' seconds') AS quiet_since,
         strftime('%Y-%m-%dT%H:%M:%S.000Z', now_ts, '+' || ((qe - sod + 86400) % 86400) || ' seconds') AS quiet_until
  FROM polq
), lastend AS (                          -- lượt chạy kết thúc gần nhất
  SELECT b.role_id, s.id, s.display_id, s.ended_at
  FROM b JOIN sessions s ON s.id = (SELECT x.id FROM sessions x WHERE x.workspace_id = b.workspace_id AND x.role_id = b.role_id AND x.agent_kind = 'role'
                                    AND x.status <> 'running' AND x.ended_at IS NOT NULL ORDER BY x.ended_at DESC, x.display_seq DESC LIMIT 1)
), idle AS (                             -- thẻ issued, trong giờ làm, không việc mở; rảnh kể từ (lượt chạy cuối hoặc lúc cấp thẻ) + N phút (đang chạy: run / think hạng cao hơn)
  SELECT b.role_id, b.now_ts,
         CASE WHEN le.ended_at > cd.issued_at THEN 'sessions' ELSE 'employee_cards' END AS tbl,
         CASE WHEN le.ended_at > cd.issued_at THEN le.id ELSE cd.id END AS sid,
         CASE WHEN le.ended_at > cd.issued_at THEN le.display_id ELSE cd.display_id END AS sdisp,
         strftime('%Y-%m-%dT%H:%M:%fZ', CASE WHEN le.ended_at > cd.issued_at THEN le.ended_at ELSE cd.issued_at END, '+' || b.idle_min || ' minutes') AS idle_from
  FROM b JOIN cards cd ON cd.role_id = b.role_id AND cd.status = 'issued'
  LEFT JOIN lastend le ON le.role_id = b.role_id
  LEFT JOIN hours h ON h.role_id = b.role_id
  WHERE COALESCE(h.in_quiet, 0) = 0
    AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.workspace_id = b.workspace_id AND t.assignee_role_id = b.role_id AND t.deleted_at IS NULL
                    AND t.status IN ('todo', 'queued', 'running', 'waiting_approval', 'waiting_permission', 'blocked'))
), cand AS (
  -- 1 error: lượt chạy lỗi gần nhất (error / timeout) chưa có lượt đạt (ok) sau nó
  SELECT b.role_id, 1 AS rk, 0 AS ord, 'error' AS state, 'sessions' AS source_table, s.id AS source_id, s.display_id AS source_display_id,
         s.ended_at AS since_at, NULL AS expires_at, NULL AS state_note
  FROM b JOIN sessions s ON s.id = (SELECT x.id FROM sessions x WHERE x.workspace_id = b.workspace_id AND x.role_id = b.role_id AND x.agent_kind = 'role'
                                    AND x.status IN ('error', 'timeout') ORDER BY x.display_seq DESC LIMIT 1)
  WHERE NOT EXISTS (SELECT 1 FROM sessions o WHERE o.workspace_id = b.workspace_id AND o.role_id = b.role_id AND o.agent_kind = 'role'
                    AND o.status = 'ok' AND o.display_seq > s.display_seq)
  UNION ALL
  -- 2 failover: phiên đang chạy trên tài khoản KHÔNG phải ưu tiên cao nhất trong danh sách binding sống + bật của Role
  SELECT run.role_id, 2, 0, 'failover', 'sessions', run.id, run.display_id, run.started_at, NULL, NULL
  FROM run JOIN bind cur ON cur.role_id = run.role_id AND cur.engine_account_id = run.engine_account_id
  WHERE cur.priority > (SELECT MIN(p.priority) FROM bind p WHERE p.role_id = run.role_id)
  UNION ALL
  -- 3 penalty: khoản phạt (entry_type penalty, trừ ví Role) trong T giây
  SELECT b.role_id, 3, 0, 'penalty', 'ledger_entries', l.id, l.display_id, l.created_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', l.created_at, '+' || b.t_sec || ' seconds'), NULL
  FROM b JOIN ledger_entries l ON l.id = (SELECT x.id FROM ledger_entries x WHERE x.workspace_id = b.workspace_id AND x.debit_wallet_id = b.wallet_id
                                          AND x.entry_type = 'penalty' AND x.created_at >= b.t_from AND x.created_at <= b.now_ts
                                          ORDER BY x.display_seq DESC LIMIT 1)
  UNION ALL
  -- 4 quota: tài khoản ưu tiên cao nhất hết quota VÀ không còn tài khoản nào của Role chạy được (đăng nhập, không sự cố hãng, adapter ready/beta, còn quota)
  SELECT pb.role_id, 4, 0, 'quota', 'engine_accounts', pb.engine_account_id, pb.account_display_id, pb.quota_scanned_at, pb.quota_reset_at, NULL
  FROM bind pb JOIN b ON b.role_id = pb.role_id
  WHERE pb.priority = (SELECT MIN(p.priority) FROM bind p WHERE p.role_id = pb.role_id) AND pb.quota_state = 'exhausted'
    AND NOT EXISTS (SELECT 1 FROM bind o WHERE o.role_id = pb.role_id AND o.quota_state <> 'exhausted' AND o.login_status = 'logged_in'
                    AND o.outage_since IS NULL AND o.adapter_status IN ('ready', 'beta'))
  UNION ALL
  -- 5 rest: Trọng thương đang mở
  SELECT b.role_id, 5, 0, 'rest', 'role_wounds', w.id, w.display_id, w.started_at, NULL, NULL
  FROM b JOIN role_wounds w ON w.role_id = b.role_id AND w.ended_at IS NULL
  UNION ALL
  -- 6 wait: việc chờ duyệt lâu nhất (tasks waiting_approval / waiting_permission · xin quyền pending · đề xuất của chính Role đang mở)
  SELECT wp.role_id, 6, 0, 'wait', wp.tbl, wp.id, wp.display_id, wp.at, NULL, NULL
  FROM wait_pick wp JOIN b ON b.role_id = wp.role_id WHERE wp.rn = 1
  UNION ALL
  -- 7 discover (thoáng qua)
  SELECT dp.role_id, 7, 0, 'discover', dp.tbl, dp.id, dp.display_id, dp.at, strftime('%Y-%m-%dT%H:%M:%fZ', dp.at, '+' || dp.t_sec || ' seconds'), NULL
  FROM disc_pick dp WHERE dp.rn = 1
  UNION ALL
  -- 8 rank1 (thoáng qua)
  SELECT r1.role_id, 8, 0, 'rank1', 'ledger_entries', r1.id, r1.display_id, r1.created_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', r1.created_at, '+' || r1.t_sec || ' seconds'), NULL
  FROM rank1 r1
  UNION ALL
  -- 9 reward: khoản cộng vào ví Role trong T giây (thưởng, cấp thêm, vốn kích hoạt, đảo phạt…)
  SELECT b.role_id, 9, 0, 'reward', 'ledger_entries', l.id, l.display_id, l.created_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', l.created_at, '+' || b.t_sec || ' seconds'), NULL
  FROM b JOIN ledger_entries l ON l.id = (SELECT x.id FROM ledger_entries x WHERE x.workspace_id = b.workspace_id AND x.credit_wallet_id = b.wallet_id
                                          AND x.created_at >= b.t_from AND x.created_at <= b.now_ts ORDER BY x.display_seq DESC LIMIT 1)
  UNION ALL
  -- 10 commit (thoáng qua)
  SELECT cp.role_id, 10, 0, 'commit', cp.tbl, cp.id, cp.display_id, cp.at, strftime('%Y-%m-%dT%H:%M:%fZ', cp.at, '+' || cp.t_sec || ' seconds'), NULL
  FROM commit_pick cp WHERE cp.rn = 1
  UNION ALL
  -- 11 unsure: câu trả lời gần nhất tự gắn nhãn chưa chắc, trong T giây
  SELECT lm.role_id, 11, 0, 'unsure', 'chat_messages', lm.id, lm.display_id, lm.created_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', lm.created_at, '+' || lm.t_sec || ' seconds'), NULL
  FROM lastmsg lm WHERE lm.certainty = 'unsure' AND lm.created_at >= lm.t_from
  UNION ALL
  -- 12 think: phiên đang chạy ở pha lập kế hoạch
  SELECT run.role_id, 12, 0, 'think', 'sessions', run.id, run.display_id, run.phase_at, NULL, NULL
  FROM run WHERE run.phase = 'planning'
  UNION ALL
  -- 13 run: phiên đang chạy (pha thao tác; pha chưa đo được ⇒ cũng hiện run, kèm ghi chú)
  SELECT run.role_id, 13, 0, 'run', 'sessions', run.id, run.display_id, COALESCE(CASE WHEN run.phase = 'acting' THEN run.phase_at END, run.started_at), NULL,
         CASE WHEN run.phase IS NULL THEN 'Chưa đo được pha lập kế hoạch — tạm hiện Đang làm' END
  FROM run
  UNION ALL
  -- 14 idle
  SELECT i.role_id, 14, 0, 'idle', i.tbl, i.sid, i.sdisp, i.idle_from, NULL, NULL
  FROM idle i WHERE i.idle_from <= i.now_ts
  UNION ALL
  -- 15 sleep: thẻ tạm ngưng · ngoài giờ làm
  SELECT cd.role_id, 15, 0, 'sleep', 'employee_cards', cd.id, cd.display_id, cd.suspended_at, NULL, NULL
  FROM cards cd JOIN b ON b.role_id = cd.role_id WHERE cd.status = 'suspended'
  UNION ALL
  SELECT h.role_id, 15, 1, 'sleep', 'proactive_policies', h.policy_id, h.policy_display_id, h.quiet_since, h.quiet_until, NULL
  FROM hours h WHERE h.in_quiet = 1
  UNION ALL
  -- 16 normal
  SELECT b.role_id, 16, 0, 'normal', NULL, NULL, NULL, NULL, NULL, NULL FROM b
), pick AS (
  SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.role_id ORDER BY c.rk, c.ord) AS rn FROM cand c
)
SELECT b.workspace_id, b.role_id, b.role_display_id, b.name AS role_name, p.rk AS state_rank, p.state,
       CASE p.state WHEN 'error' THEN 'Lỗi' WHEN 'failover' THEN 'Đổi CLI' WHEN 'penalty' THEN 'Bị phạt' WHEN 'quota' THEN 'Hết quota'
                    WHEN 'rest' THEN 'Nghỉ dưỡng thương' WHEN 'wait' THEN 'Chờ duyệt' WHEN 'discover' THEN 'Kinh ngạc' WHEN 'rank1' THEN 'Lên #1'
                    WHEN 'reward' THEN 'Nhận thưởng' WHEN 'commit' THEN 'Hứa quyết tâm' WHEN 'unsure' THEN 'Nói không chắc' WHEN 'think' THEN 'Suy tư'
                    WHEN 'run' THEN 'Đang làm' WHEN 'idle' THEN 'Rảnh' WHEN 'sleep' THEN 'Ngủ' WHEN 'normal' THEN 'Bình thường' END AS state_label,
       p.source_table, p.source_id, p.source_display_id, p.since_at, p.expires_at, p.state_note,
       b.t_sec AS transient_seconds, b.idle_min AS idle_after_minutes, b.now_ts AS evaluated_at,
       b.avatar_id, av.source AS avatar_source, av.skin_asset_id, sn.asset_code, sn.asset_kind,
       CASE WHEN av.source = 'library' AND sn.is_enabled = 0 THEN 1 ELSE 0 END AS character_disabled
FROM b JOIN pick p ON p.role_id = b.role_id AND p.rn = 1
LEFT JOIN avatars av ON av.id = b.avatar_id
LEFT JOIN skin_assets sn ON sn.id = av.skin_asset_id;

-- @ga:object view v_integrity_tenant
CREATE VIEW v_integrity_tenant AS
SELECT 'actors.role_id' AS fk, c.workspace_id, count(*) AS n FROM actors c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'id_aliases.created_by' AS fk, c.workspace_id, count(*) AS n FROM id_aliases c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.created_by' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.updated_by' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.avatar_id' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN avatars p ON p.id = c.avatar_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.birth_revision_id' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN revisions p ON p.id = c.birth_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'roles.current_revision_id' AS fk, c.workspace_id, count(*) AS n FROM roles c JOIN revisions p ON p.id = c.current_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'avatars.created_by' AS fk, c.workspace_id, count(*) AS n FROM avatars c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'avatars.role_id' AS fk, c.workspace_id, count(*) AS n FROM avatars c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'avatars.blob_id' AS fk, c.workspace_id, count(*) AS n FROM avatars c JOIN blobs p ON p.id = c.blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'avatars.skin_asset_id' AS fk, c.workspace_id, count(*) AS n FROM avatars c JOIN skin_assets p ON p.id = c.skin_asset_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skin_assets.created_by' AS fk, c.workspace_id, count(*) AS n FROM skin_assets c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skin_assets.updated_by' AS fk, c.workspace_id, count(*) AS n FROM skin_assets c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skin_assets.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM skin_assets c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_defs.created_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_defs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_defs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_defs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_defs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_defs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.created_by' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.updated_by' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.role_id' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.def_id' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN dna_field_defs p ON p.id = c.def_id WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.confirmed_by' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN actors p ON p.id = c.confirmed_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_fields.covered_by_instruction_id' AS fk, c.workspace_id, count(*) AS n FROM dna_fields c JOIN instructions p ON p.id = c.covered_by_instruction_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.dna_field_id' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN dna_fields p ON p.id = c.dna_field_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.revision_id' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.created_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'dna_field_versions.decided_by' AS fk, c.workspace_id, count(*) AS n FROM dna_field_versions c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.created_by' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.role_id' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.position_id' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'revisions.restored_from_id' AS fk, c.workspace_id, count(*) AS n FROM revisions c JOIN revisions p ON p.id = c.restored_from_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.created_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.updated_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.role_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.position_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.proposed_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.proposed_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.source_thread_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN chat_threads p ON p.id = c.source_thread_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.source_session_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN sessions p ON p.id = c.source_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.decided_by' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_sets.revision_id' AS fk, c.workspace_id, count(*) AS n FROM change_sets c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.dna_field_version_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN dna_field_versions p ON p.id = c.dna_field_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.instruction_version_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN instruction_versions p ON p.id = c.instruction_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.role_skill_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN role_skills p ON p.id = c.role_skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.knowledge_item_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN knowledge_items p ON p.id = c.knowledge_item_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.memory_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN memories p ON p.id = c.memory_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.taxonomy_node_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN taxonomy_nodes p ON p.id = c.taxonomy_node_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'change_set_items.skill_prereq_id' AS fk, c.workspace_id, count(*) AS n FROM change_set_items c JOIN skill_prereqs p ON p.id = c.skill_prereq_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.created_by' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.updated_by' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.role_id' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.position_id' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instructions.engine_scope' AS fk, c.workspace_id, count(*) AS n FROM instructions c JOIN engines p ON p.slug = c.engine_scope WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.instruction_id' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN instructions p ON p.id = c.instruction_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.revision_id' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.created_by' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'instruction_versions.decided_by' AS fk, c.workspace_id, count(*) AS n FROM instruction_versions c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.created_by' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.updated_by' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.parent_id' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN taxonomy_nodes p ON p.id = c.parent_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'taxonomy_nodes.confirmed_by' AS fk, c.workspace_id, count(*) AS n FROM taxonomy_nodes c JOIN actors p ON p.id = c.confirmed_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.created_by' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.updated_by' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.current_version_id' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN skill_versions p ON p.id = c.current_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skills.category_id' AS fk, c.workspace_id, count(*) AS n FROM skills c JOIN taxonomy_nodes p ON p.id = c.category_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_versions.skill_id' AS fk, c.workspace_id, count(*) AS n FROM skill_versions c JOIN skills p ON p.id = c.skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_versions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM skill_versions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_versions.created_by' AS fk, c.workspace_id, count(*) AS n FROM skill_versions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_versions.decided_by' AS fk, c.workspace_id, count(*) AS n FROM skill_versions c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.created_by' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.skill_id' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN skills p ON p.id = c.skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.requires_skill_id' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN skills p ON p.id = c.requires_skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_prereqs.confirmed_by' AS fk, c.workspace_id, count(*) AS n FROM skill_prereqs c JOIN actors p ON p.id = c.confirmed_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_engine_support.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM skill_engine_support c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_engine_support.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM skill_engine_support c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_files.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM skill_files c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'skill_files.blob_id' AS fk, c.workspace_id, count(*) AS n FROM skill_files c JOIN blobs p ON p.id = c.blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.created_by' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.updated_by' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.role_id' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.skill_id' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN skills p ON p.id = c.skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_skills.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM role_skills c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'blobs.created_by' AS fk, c.workspace_id, count(*) AS n FROM blobs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.created_by' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.updated_by' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.role_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.position_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.blob_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN blobs p ON p.id = c.blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.duplicate_of_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN knowledge_items p ON p.id = c.duplicate_of_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.superseded_by_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN knowledge_items p ON p.id = c.superseded_by_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.source_attachment_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN message_attachments p ON p.id = c.source_attachment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_items.category_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_items c JOIN taxonomy_nodes p ON p.id = c.category_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'knowledge_chunks.knowledge_item_id' AS fk, c.workspace_id, count(*) AS n FROM knowledge_chunks c JOIN knowledge_items p ON p.id = c.knowledge_item_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.created_by' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.updated_by' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.role_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.position_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.source_session_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN sessions p ON p.id = c.source_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.superseded_by_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN memories p ON p.id = c.superseded_by_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.commitment_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN commitments p ON p.id = c.commitment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.role_wound_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN role_wounds p ON p.id = c.role_wound_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.evidence_task_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN tasks p ON p.id = c.evidence_task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'memories.evidence_ledger_entry_id' AS fk, c.workspace_id, count(*) AS n FROM memories c JOIN ledger_entries p ON p.id = c.evidence_ledger_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.created_by' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.session_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.role_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.memory_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN memories p ON p.id = c.memory_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.knowledge_chunk_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN knowledge_chunks p ON p.id = c.knowledge_chunk_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'recall_hits.knowledge_item_id' AS fk, c.workspace_id, count(*) AS n FROM recall_hits c JOIN knowledge_items p ON p.id = c.knowledge_item_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.created_by' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.updated_by' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.reports_to_position_id' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN positions p ON p.id = c.reports_to_position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'positions.current_revision_id' AS fk, c.workspace_id, count(*) AS n FROM positions c JOIN revisions p ON p.id = c.current_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.created_by' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.updated_by' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.role_id' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'assignments.position_id' AS fk, c.workspace_id, count(*) AS n FROM assignments c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.created_by' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.assignment_id' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN assignments p ON p.id = c.assignment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.role_id' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.position_id' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.ledger_entry_id' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN ledger_entries p ON p.id = c.ledger_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trust_tier_changes.decided_by' AS fk, c.workspace_id, count(*) AS n FROM trust_tier_changes c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.created_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.updated_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.position_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.assignee_role_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN roles p ON p.id = c.assignee_role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.requested_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.requested_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.verified_by' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN actors p ON p.id = c.verified_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.commitment_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN commitments p ON p.id = c.commitment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.parent_task_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN tasks p ON p.id = c.parent_task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.proactive_job_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN proactive_jobs p ON p.id = c.proactive_job_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.thread_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN chat_threads p ON p.id = c.thread_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.paused_by_wound_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN role_wounds p ON p.id = c.paused_by_wound_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tasks.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM tasks c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.created_by' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.updated_by' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.position_id' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.promised_by_role_id' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN roles p ON p.id = c.promised_by_role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.source_message_id' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN chat_messages p ON p.id = c.source_message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'commitments.source_session_id' AS fk, c.workspace_id, count(*) AS n FROM commitments c JOIN sessions p ON p.id = c.source_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.created_by' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.role_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.position_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.task_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN tasks p ON p.id = c.task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.thread_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN chat_threads p ON p.id = c.thread_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.compiled_prompt_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN compiled_prompts p ON p.id = c.compiled_prompt_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'sessions.container_id' AS fk, c.workspace_id, count(*) AS n FROM sessions c JOIN containers p ON p.id = c.container_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.created_by' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.updated_by' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.role_id' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'wallets.last_entry_id' AS fk, c.workspace_id, count(*) AS n FROM wallets c JOIN ledger_entries p ON p.id = c.last_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.created_by' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.debit_wallet_id' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN wallets p ON p.id = c.debit_wallet_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.credit_wallet_id' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN wallets p ON p.id = c.credit_wallet_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.reverses_entry_id' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN ledger_entries p ON p.id = c.reverses_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.recorded_by' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN actors p ON p.id = c.recorded_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ledger_entries.approved_by' AS fk, c.workspace_id, count(*) AS n FROM ledger_entries c JOIN actors p ON p.id = c.approved_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.created_by' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.role_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.wallet_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN wallets p ON p.id = c.wallet_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.cause_entry_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN ledger_entries p ON p.id = c.cause_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.revive_entry_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN ledger_entries p ON p.id = c.revive_entry_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'role_wounds.reflection_session_id' AS fk, c.workspace_id, count(*) AS n FROM role_wounds c JOIN sessions p ON p.id = c.reflection_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_installs.created_by' AS fk, c.workspace_id, count(*) AS n FROM engine_installs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_installs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM engine_installs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_installs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM engine_installs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_installs.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM engine_installs c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.created_by' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.updated_by' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.secret_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN secrets p ON p.id = c.secret_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.last_probe_run_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN probe_runs p ON p.id = c.last_probe_run_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.overhead_bare_session_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN sessions p ON p.id = c.overhead_bare_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.overhead_shell_session_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN sessions p ON p.id = c.overhead_shell_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_accounts.consent_id' AS fk, c.workspace_id, count(*) AS n FROM engine_accounts c JOIN consents p ON p.id = c.consent_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.created_by' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.updated_by' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.role_id' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'engine_bindings.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM engine_bindings c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'system_agents.created_by' AS fk, c.workspace_id, count(*) AS n FROM system_agents c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'system_agents.updated_by' AS fk, c.workspace_id, count(*) AS n FROM system_agents c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'system_agents.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM system_agents c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'probe_runs.created_by' AS fk, c.workspace_id, count(*) AS n FROM probe_runs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'probe_runs.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM probe_runs c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'probe_runs.container_id' AS fk, c.workspace_id, count(*) AS n FROM probe_runs c JOIN containers p ON p.id = c.container_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'probe_runs.raw_blob_id' AS fk, c.workspace_id, count(*) AS n FROM probe_runs c JOIN blobs p ON p.id = c.raw_blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.created_by' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.updated_by' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'capabilities.last_probe_run_id' AS fk, c.workspace_id, count(*) AS n FROM capabilities c JOIN probe_runs p ON p.id = c.last_probe_run_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'quota_snapshots.created_by' AS fk, c.workspace_id, count(*) AS n FROM quota_snapshots c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'quota_snapshots.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM quota_snapshots c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'quota_snapshots.probe_run_id' AS fk, c.workspace_id, count(*) AS n FROM quota_snapshots c JOIN probe_runs p ON p.id = c.probe_run_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.created_by' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.updated_by' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'model_ranks.ranked_by' AS fk, c.workspace_id, count(*) AS n FROM model_ranks c JOIN actors p ON p.id = c.ranked_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.created_by' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.role_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.revision_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.position_revision_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN revisions p ON p.id = c.position_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.rules_revision_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN revisions p ON p.id = c.rules_revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompts.engine_slug' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompts c JOIN engines p ON p.slug = c.engine_slug WHERE p.workspace_id <> c.workspace_id AND p.workspace_id <> '00000000000000000000000000' GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompt_segments.compiled_prompt_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompt_segments c JOIN compiled_prompts p ON p.id = c.compiled_prompt_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompt_segments.dna_field_version_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompt_segments c JOIN dna_field_versions p ON p.id = c.dna_field_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompt_segments.instruction_version_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompt_segments c JOIN instruction_versions p ON p.id = c.instruction_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'compiled_prompt_segments.skill_version_id' AS fk, c.workspace_id, count(*) AS n FROM compiled_prompt_segments c JOIN skill_versions p ON p.id = c.skill_version_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'containers.created_by' AS fk, c.workspace_id, count(*) AS n FROM containers c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'containers.updated_by' AS fk, c.workspace_id, count(*) AS n FROM containers c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'containers.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM containers c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'containers.role_id' AS fk, c.workspace_id, count(*) AS n FROM containers c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.created_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.updated_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.role_id' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_bots.secret_id' AS fk, c.workspace_id, count(*) AS n FROM telegram_bots c JOIN secrets p ON p.id = c.secret_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_allowlist.created_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_allowlist c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_allowlist.updated_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_allowlist c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_allowlist.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM telegram_allowlist c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'telegram_allowlist.bot_id' AS fk, c.workspace_id, count(*) AS n FROM telegram_allowlist c JOIN telegram_bots p ON p.id = c.bot_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_policies.created_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_policies c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_policies.updated_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_policies c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_policies.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_policies c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_policies.role_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_policies c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.created_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.position_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_jobs.skill_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_jobs c JOIN skills p ON p.id = c.skill_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.created_by' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.role_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.policy_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN proactive_policies p ON p.id = c.policy_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.message_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN chat_messages p ON p.id = c.message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.task_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN tasks p ON p.id = c.task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.commitment_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN commitments p ON p.id = c.commitment_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'proactive_sends.proactive_job_id' AS fk, c.workspace_id, count(*) AS n FROM proactive_sends c JOIN proactive_jobs p ON p.id = c.proactive_job_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tools.created_by' AS fk, c.workspace_id, count(*) AS n FROM tools c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tools.updated_by' AS fk, c.workspace_id, count(*) AS n FROM tools c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tools.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM tools c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tools.secret_id' AS fk, c.workspace_id, count(*) AS n FROM tools c JOIN secrets p ON p.id = c.secret_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.created_by' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.updated_by' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.tool_id' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN tools p ON p.id = c.tool_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.role_id' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.position_id' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'tool_grants.source_request_id' AS fk, c.workspace_id, count(*) AS n FROM tool_grants c JOIN permission_requests p ON p.id = c.source_request_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.created_by' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.updated_by' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.role_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.tool_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN tools p ON p.id = c.tool_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.task_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN tasks p ON p.id = c.task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.session_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.decided_by' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'permission_requests.grant_id' AS fk, c.workspace_id, count(*) AS n FROM permission_requests c JOIN tool_grants p ON p.id = c.grant_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.created_by' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.updated_by' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.role_id' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.position_id' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'egress_rules.tool_id' AS fk, c.workspace_id, count(*) AS n FROM egress_rules c JOIN tools p ON p.id = c.tool_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.created_by' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.role_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.permission_request_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN permission_requests p ON p.id = c.permission_request_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.proactive_send_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN proactive_sends p ON p.id = c.proactive_send_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.task_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN tasks p ON p.id = c.task_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'polaris_checks.session_id' AS fk, c.workspace_id, count(*) AS n FROM polaris_checks c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.created_by' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.updated_by' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.role_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.revision_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.compiled_prompt_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN compiled_prompts p ON p.id = c.compiled_prompt_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.position_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN positions p ON p.id = c.position_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.issued_by' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN actors p ON p.id = c.issued_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'employee_cards.superseded_by_id' AS fk, c.workspace_id, count(*) AS n FROM employee_cards c JOIN employee_cards p ON p.id = c.superseded_by_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.created_by' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.role_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.revision_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN revisions p ON p.id = c.revision_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.compiled_prompt_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN compiled_prompts p ON p.id = c.compiled_prompt_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.engine_account_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN engine_accounts p ON p.id = c.engine_account_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.judge_session_id' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN sessions p ON p.id = c.judge_session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'trial_runs.decided_by' AS fk, c.workspace_id, count(*) AS n FROM trial_runs c JOIN actors p ON p.id = c.decided_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.created_by' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.updated_by' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.role_id' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN roles p ON p.id = c.role_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_threads.telegram_bot_id' AS fk, c.workspace_id, count(*) AS n FROM chat_threads c JOIN telegram_bots p ON p.id = c.telegram_bot_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.created_by' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.thread_id' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN chat_threads p ON p.id = c.thread_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.author_actor_id' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN actors p ON p.id = c.author_actor_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.session_id' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.reply_to_id' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN chat_messages p ON p.id = c.reply_to_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'chat_messages.redacted_by' AS fk, c.workspace_id, count(*) AS n FROM chat_messages c JOIN actors p ON p.id = c.redacted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.created_by' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.updated_by' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.message_id' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN chat_messages p ON p.id = c.message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.blob_id' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN blobs p ON p.id = c.blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.thumbnail_blob_id' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN blobs p ON p.id = c.thumbnail_blob_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_attachments.uploaded_by' AS fk, c.workspace_id, count(*) AS n FROM message_attachments c JOIN actors p ON p.id = c.uploaded_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_anchors.created_by' AS fk, c.workspace_id, count(*) AS n FROM message_anchors c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'message_anchors.message_id' AS fk, c.workspace_id, count(*) AS n FROM message_anchors c JOIN chat_messages p ON p.id = c.message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ui_actions.created_by' AS fk, c.workspace_id, count(*) AS n FROM ui_actions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ui_actions.message_id' AS fk, c.workspace_id, count(*) AS n FROM ui_actions c JOIN chat_messages p ON p.id = c.message_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ui_actions.session_id' AS fk, c.workspace_id, count(*) AS n FROM ui_actions c JOIN sessions p ON p.id = c.session_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'ui_actions.change_set_id' AS fk, c.workspace_id, count(*) AS n FROM ui_actions c JOIN change_sets p ON p.id = c.change_set_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'audit_log.created_by' AS fk, c.workspace_id, count(*) AS n FROM audit_log c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'audit_log.actor_id' AS fk, c.workspace_id, count(*) AS n FROM audit_log c JOIN actors p ON p.id = c.actor_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'events.created_by' AS fk, c.workspace_id, count(*) AS n FROM events c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'notifications.created_by' AS fk, c.workspace_id, count(*) AS n FROM notifications c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'notifications.updated_by' AS fk, c.workspace_id, count(*) AS n FROM notifications c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'notifications.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM notifications c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'jobs.created_by' AS fk, c.workspace_id, count(*) AS n FROM jobs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'app_versions.created_by' AS fk, c.workspace_id, count(*) AS n FROM app_versions c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'app_versions.updated_by' AS fk, c.workspace_id, count(*) AS n FROM app_versions c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'app_versions.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM app_versions c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'backups.created_by' AS fk, c.workspace_id, count(*) AS n FROM backups c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'backups.updated_by' AS fk, c.workspace_id, count(*) AS n FROM backups c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'backups.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM backups c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.created_by' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.updated_by' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.from_version' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN app_versions p ON p.semver = c.from_version WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.to_version' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN app_versions p ON p.semver = c.to_version WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.initiated_by' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN actors p ON p.id = c.initiated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'update_runs.backup_id' AS fk, c.workspace_id, count(*) AS n FROM update_runs c JOIN backups p ON p.id = c.backup_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'settings.created_by' AS fk, c.workspace_id, count(*) AS n FROM settings c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'settings.updated_by' AS fk, c.workspace_id, count(*) AS n FROM settings c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'settings.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM settings c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'secrets.created_by' AS fk, c.workspace_id, count(*) AS n FROM secrets c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'secrets.updated_by' AS fk, c.workspace_id, count(*) AS n FROM secrets c JOIN actors p ON p.id = c.updated_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'secrets.deleted_by' AS fk, c.workspace_id, count(*) AS n FROM secrets c JOIN actors p ON p.id = c.deleted_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'secrets.rotated_from_id' AS fk, c.workspace_id, count(*) AS n FROM secrets c JOIN secrets p ON p.id = c.rotated_from_id WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id
UNION ALL
SELECT 'consents.created_by' AS fk, c.workspace_id, count(*) AS n FROM consents c JOIN actors p ON p.id = c.created_by WHERE p.workspace_id <> c.workspace_id GROUP BY c.workspace_id;
