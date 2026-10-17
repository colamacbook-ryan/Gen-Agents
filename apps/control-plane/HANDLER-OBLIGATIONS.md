# Mandatory handler obligations for M2

Source: PR #7 security review, 2026-10-17 (copied from the coordinator's scratchpad, numbering kept). Every M2 lane MUST read
this before writing handlers. The contract cannot express these points, so the handler has to do them itself. The L-APP
meta-tests cover some of them; everything else is each lane's responsibility, and each one needs a negative test.

Status markers (L-APP skeleton, `apps/control-plane/src/{http,context,events}`):
- **✓ auto** — the skeleton enforces it for every mounted route; meta-test `test/meta/security.test.ts` (or the named test) goes red if broken. The lane gets it for free.
- **◐ partial** — the skeleton gives the tool / covers part; the rest is the lane's job.
- **✗ lane** — only the lane can do it (domain knowledge). Write the negative test yourself.

1. **Tenant.** The workspace comes ONLY from the session. — **◐**
   - ✓ auto: workspace + actor come from the session's membership (`http/session.ts`); `ctx.read/write/ref/events` have no workspace parameter; client hints (`x-ga-workspace-id`) are ignored (cross-tenant meta-test sends one).
   - ✓ auto: every Ref field in params / query / body with a ref of tenant B ⇒ never 2xx (path ⇒ 404); a prefix without a seeder in `@ga/testkit` ⇒ red.
   - Every Ref/ULID lookup goes through `ctx.ref` (with `workspace_id`). A ref from another workspace, or a ULID from a table whose prefix doesn't match, ⇒ 404. — ✓ `ctx.ref` does both (test `pipeline.test.ts` "ctx.ref"); ✗ lane: actually call it for every ref (incl. body refs like SYS-55 `attachmentRefs`, WRK-17 `toRoleRef`) and add a seeder for each new prefix.
   - Users are reached ONLY through a join on `workspace_members`. Never return `email` / `username` / `password_hash`. — ◐ `ctx.ref('US', …)` joins `workspace_members`; output validation (strict) drops nothing silently — an extra field ⇒ 500. ✗ lane: don't put those fields in queries.
2. **Parent–child relations.** Each of these must be checked in the handler: — **✗ lane**
   - SYS-38: the DNA belongs to the role.
   - SYS-53: the skill belongs to the role.
   - GW-09: `order` == exactly the set of bindings of the Role.
   - GW-20: the account ∈ the Role's bindings (it must not run on the Core agent account or another Role's account).
   - WRK-23/25: the evidence belongs to the right Role.
   - SYS-65, WRK-42.
   - OPS-07: `appliesTo` matches the target.
   (Seeders receive `seeded` — earlier refs of the same request — so the cross-tenant positive control can build consistent parent/child data.)
3. **Permissions.** Wherever the permission depends on a flag the client sends, read the permission level from SERVER state instead. — **◐**
   - ✓ auto: `route.auth` + `ownerWhen` (`requiredAccess`, every condition of the list) checked on the raw AND the validated input; `operator` / unknown access level ⇒ 403 (`accessLevelToAuth` of contracts).
   - ◐ conditions on STORED state (`egress_loosen`, OPS-08): the edge cannot see the DB ⇒ without a hook it treats them as matched ⇒ `O` (admin always 403). To let admin tighten, pass `defineHandler(id, fn, { stored: (input, ctx) => ({ egressAction }) })` — read via `ctx.ref` / `ctx.read`; test both directions.
   - ✗ lane: Example: WRK-05 uses the `capture.purpose` stored on the server, not `asOwner` from the body.
   - ✗ lane: captureId / ownerChangeId must belong to the right workspace and the right bot (they are OpaqueId, not Ref — `ctx.ref` does not cover them).
4. **Recovery.** `isCoreAgentAccount` is computed from the DB, using the accountRef on the path or in the ticket. — **◐**
   - ✓ auto: `RecoveryGuard` reads `recoveryDecision` of the registry; no provider / provider error ⇒ recovery (fail-closed); `o4=core` asks `RecoveryProvider.isCoreAgentTarget` with the VALIDATED input only. Meta-test: every O4 reason × every mounted route.
   - ✗ L-SYS: the real `RecoveryProvider` (`v_core_agent_status`, `isCoreAgentTarget` from the DB).
   - ✗ lane: GW-05/06 in recovery: return only the Core agent's rows. SYS-78 resume: BLOCKED in recovery. WRK-14: in recovery, only `enabled:false` is allowed.
5. **Masking for V** (`confidential`). Applies to: SYS-23 snapshot, SYS-37, SYS-54 summary, WRK-34/35, OPS-21 (V sees only the list of keys, not before/after), OPS-33/34/35 cells, OPS-36 snippet. — **✗ lane** (`ctx.actor.authLevel === 'V'`).
6. **SSE.** — **◐**
   - ✓ auto (`events/bus.ts`): filter each connection by workspace + audience (V/A/O/recipient) + recipient; replay buffer per workspace; replay re-checks the permission of the CURRENT connection; credential-like / off-schema events rejected; slow subscriber ⇒ `resync` + drop.
   - ✓ audience = `SSE_EVENT_AUDIENCE` + `sseEventAllows` of contracts (incl. `GRID_MIN_AUTH` for `grid.changed`).
   - ✗ L-SYS: cut the stream when a member is removed or downgraded — call `bus.disconnect(workspaceId, userId)`.
7. **Per-user notifications.** SYS-83/84 and the SSE `notification` event filter on `user_id = the session's user`. — ◐ SSE: bus delivers `notification` only to `recipientUserId` (publish without it ⇒ rejected). ✗ lane: SYS-83/84 queries.
8. **Data Console.** — **✗ lane** (L-OPS / L-DB)
   - `cols` / `sort` / `group` / fields in `q` are checked against `GRID_COLUMNS`. `view` must be in `GridInfo.views`.
   - SQL is generated only by L-DB's parameterised compiler, runs on the read-only connection, with a 2 s ceiling (OPS-34 too).
   - OPS-34: row cap + rate limit.
   - CSV: use `csvCell()` (escape TEXT cells starting with `= + - @ \t \r`; quote fully; numbers left as is). (CSV responses are `RawBody` — the skeleton cannot validate them.)
   - The cursor is HMAC-signed (keyset values + sort column). Never treat the cursor's contents as a column name.
   - The minimum permission for a grid/record is `max(route.auth, RECORD_ACCESS[prefix], GridInfo.minAuth)`.
9. **Idempotency.** — **◐**
   - ✓ auto: Namespace the key by (ws, actor, routeId). Forbid reserved prefixes (any `:`, e.g. `activate:`). The request fingerprint = route + path params + query + actor + hash(body); same key + different fingerprint ⇒ 409, never a replay; concurrent same key ⇒ 409 `in_flight`; caps per workspace and per (workspace, actor) ⇒ 429 only for that subject; nothing live is ever evicted (`test/http/idempotency.test.ts`).
   - Applies to SYS-19, SYS-74, WRK-23…26.
   - ✗ lane (added 2026-10-17): the in-memory store is LOST ON RESTART. Routes whose table has an `idempotency_key` column (WRK-23…26 ⇒ `ledger_entries.idempotency_key`, UNIQUE per workspace) MUST pass the validated key down to the DB so the UNIQUE constraint is the last line of defence. SYS-19 / SYS-74 have no DB column yet ⇒ waiting for `idempotency_keys` (DB v2.3.6).
10. **Secrets.** — **◐**
    - ✓ auto: no response may carry credential-like strings — the test client runs `findCredentialLike` on every JSON response; output validation is strict; the logger redacts every line (`redactValue` + `redactLogLine`); unknown errors never echo `err.message`.
    - ✗ lane: The logger masks by the schema's `gaSecret` meta, not only by key name (don't log request bodies). Audit before/after never contains a secret or a ticket. GW-14 tickets are single-use with a 60 s TTL.
11. **Logs (OPS-24/25).** — **✗ lane**: Mask at WRITE time. Never dump PTY output into the JSONL. `q` is a substring match only: never fed to RegExp or a shell.
12. **OPS-20 `action` filter.** `*` is allowed only at the end; escape `%` and `_` in LIKE. — **✗ lane**
13. **Upload (SYS-21/52/55/68).** — **✗ lane** (multipart is rejected by `createApp` until implemented)
    - Read as a stream and enforce the cap BEFORE buffering (avatar 5 MB; others use `chat.attachment_max_bytes`).
    - Check MIME by content. `fileName` is never used as a path.
    - zip/tar: guard against zip-slip, symlinks, and zip bombs (cap on total extracted size + number of files).
    - Only accept `clean` files.
14. **WRK-07.** At most 5 attempts, constant-time compare, never log the code. — **✗ lane**
15. **Edge.** — **✓ auto**
    - Body > 1 MB rejected BEFORE `JSON.parse` (declared Content-Length, lying Content-Length, chunked — all tested).
    - CSRF (registry `requiresCsrf`, own edge layer on top of L-SEC).
    - `must_change_password` ⇒ only EXT-02/03/04.
    - access_level `operator` ⇒ rejected (`accessLevelToAuth` fail-closed; local copy until contracts has it).
16. **Engine install/pin.** Never interpolate a slug/version into a shell; use only `EXEC_ARGV`. — **✗ lane** (L-GW)
17. **AI actor ≠ system actor.** Any worker/job that executes the RESULT OF AN LLM (consolidation, trial_run, Interviewer/Trainer/Judge proposals, Role turns) MUST write using that agent's actor (`systemActorId(conn, ws, '<agent_key>')` or the Role's actor). It must NEVER write as `'system'`. The `'system'` actor is only for deterministic platform code (migrations, purge on a schedule, applying a change set the owner approved). Mixing them up = handing AI system privileges (re-review of DB v2.3.5, 2026-10-17). — **◐** `ctx.write` of an HTTP handler always writes as the SESSION's actor (cannot pick another); ✗ lane: workers / jobs outside HTTP.
18. **Grant expiry (GW-29 / GW-31).** Extending `expiresAt` of a tool grant loosens a fence ⇒ requires `O` (check in the handler on the stored grant; add a negative test for admin). — **✗ lane** (L-GW)
19. **OPS-37 locate.** Same read permission as OPS-33 (`max(route.auth, RECORD_ACCESS[prefix], GRID_MIN_AUTH[grid])`); rows the caller can't read come back as `gone` (never their content, never "forbidden" — no existence oracle). — **✗ lane** (L-OPS)
20. **OPS-35 record.** After looking up a ULID (which carries no prefix), re-check the REAL prefix/table of the row against `RECORD_ACCESS` before returning anything; a mismatch ⇒ 404. — **◐** `ctx.ref` already returns 404 for a ULID of another table; ✗ lane: `Ref('*')` lookups.
21. **Self-scoped grid.** The `notifications` grid (`GRID_SELF_SCOPED`) is filtered by `user_id = session user` in OPS-33 / 34 / 35 / 37, not just by workspace. — **✗ lane** (L-OPS)
