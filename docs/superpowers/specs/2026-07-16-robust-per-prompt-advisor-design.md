# Robust, per-prompt advisor — design

Date: 2026-07-16
Status: approved (design), pending implementation plan

## Problem

The advisor is session-level only. `advisorFor(s)` (lib/core.js) applies three
hardcoded rules — low cache ratio, premium-model-on-short-session, high subagent
cost share — and emits `payload.advisor` (top 25 sessions by cost). Gaps:

- **Not per-prompt.** A single wasteful prompt inside an otherwise-fine session is
  invisible. Turn-level data already exists (`parseTurns` + `attributeSubagentTurns`)
  but only feeds the on-demand session drill-down; the advisor never touches it.
- **Not robust.** Rules are flat strings with no severity, no confidence, and no
  fix. Thresholds are hardcoded absolutes (`$1`, `<20 msgs`, `0.5`, `$5`, `0.6`)
  that over- or under-flag depending on the user's own usage scale.

## Goals

1. Advice at **prompt (turn) granularity**, surfaced in two places:
   - inline per-turn warnings in the session drill-down, and
   - a global **"worst prompts"** ranked list in the Advisor tab.
2. **More robust** rules: severity + confidence per finding, data-relative
   thresholds, and a concrete actionable fix on every finding.

Non-goals: no change to pricing/parsing of tokens; no new persistence layer; no
config UI for thresholds (derived from data, with fixed floors).

## Approach (A — shared rule engine, findings cached in store)

Single source of truth for advice, reused by session-level, global per-prompt, and
drill-down per-prompt paths.

### New module: `lib/advisor.js`

Pure, transport-free. Rules are data objects, not inline pushes.

```
// A rule definition
{ id, level: 'session'|'turn', severity(ctx,subject)->'high'|'med'|'low',
  confidence: 0..1, test(subject, ctx) -> null | { message, fix, estSavingUSD } }
```

Exports:
- `adviseSession(session, ctx) -> { reasons: Finding[], estSavingUSD }`
- `adviseTurn(turn, ctx) -> Finding[]`
- `computeThresholds(sessions, turns) -> ctx`  (population stats + floors)

`Finding = { id, message, fix, severity, confidence, estSavingUSD }`.

`ctx` (thresholds) carries: `turnCostP50`, `turnCostP90`, `sessionCostP50`,
`maxInputRate` (from core), and absolute floors (`minTurnCostUSD`,
`minSessionCostUSD`) so low-usage accounts don't over-flag. `severity` is derived
by comparing the subject's magnitude (cost / est. saving) to these percentiles.

### Rule catalog

**Turn-level (`adviseTurn`):**
- **T1 premium-trivial** — turn uses a `maxInputRate` model AND prompt is
  short/trivial AND cost ≥ `minTurnCostUSD`. Fix: "use Haiku/Sonnet for this
  prompt." `estSaving = cost * 0.7`.
- **T2 low-cache-big-turn** — `cacheRead/denom < 0.5` AND cost ≥ `turnCostP90`.
  Fix: "context churn — avoid re-editing/large re-reads within one prompt."
- **T3 subagent-dominated** — `subagentCostUSD/costUSD > 0.7` AND cost ≥
  `minTurnCostUSD`. Fix: "check delegation value; a direct edit may be cheaper."
- **T4 runaway-turn** — cost ≥ `K * turnCostP50` (K≈8) AND cost ≥ `turnCostP90`.
  Fix: "break into smaller prompts / interrupt sooner."

**Session-level (`adviseSession`):** ports the existing three, enriched with
severity + fix, plus one new:
- **S1 low-cache-ratio** (existing logic, floor `minSessionCostUSD`).
- **S2 premium-on-short** (existing).
- **S3 subagent-share** (existing).
- **S4 should-have-cleared** *(new)* — high turn count AND cache-write tokens
  dominate cost. Fix: "run /clear between unrelated tasks."

Thresholds replace today's hardcoded `$1 / <20 / 0.5 / $5 / 0.6` with the
`ctx` percentile values (existing constants become the absolute floors).

### Pipeline changes

**`lib/scan.js` (store):** on `refresh()`, for each session whose files changed,
compute turn findings once and cache **only tiny records** keyed by mtime:
`{ sessionId, project, turnIndex, promptPreview, costUSD, findings[] }`
(promptPreview ≈ first 120 chars; full prompt text is NOT retained → bounded
memory). Expose `turnFindings()` returning the flat list across sessions.
Turn computation reuses `parseTurns` + `attributeSubagentTurns` so global and
drill-down agree.

**`lib/core.js` `buildResponse(sessions, config, turnFindings)`:**
- compute `ctx = computeThresholds(...)`.
- `advisor` entries use `adviseSession(s, ctx)` (reasons now `Finding[]`).
- new `worstPrompts` = `turnFindings` mapped through severity ranking, sorted by
  `severity` then `estSavingUSD` then `costUSD`, sliced top 25.

**`server.js`:**
- pass `store.turnFindings()` into `buildResponse`.
- session drill-down (`/session`): run `adviseTurn(turn, ctx)` on each freshly
  parsed turn, attach `turn.findings`.

### Frontend

- **`AdvisorTable.jsx`** — `reasons` are objects now; render message + a severity
  badge + the fix line. Add an `Est. saving` already present.
- **new `WorstPromptsTable.jsx`** — Project · Session · Turn · Prompt preview ·
  Cost · Severity · Reasons/fix. Sorted by severity.
- **`SessionsTable.jsx`** — each turn row shows a ⚠ with its findings (message +
  fix) when `turn.findings.length`.
- **`TabNav.jsx` / `App.jsx`** — surface the global worst-prompts list within the
  Advisor view (section under existing flagged-sessions table).

## Data flow

```
refresh() ─┬─ parseSession (per file, cached)        ── session aggregates
           └─ parseTurns+attribute (per session)     ── cached turn findings
buildResponse(sessions, config, turnFindings)
   ├─ computeThresholds → ctx
   ├─ adviseSession(s, ctx)  → payload.advisor[].reasons: Finding[]
   └─ rank turnFindings      → payload.worstPrompts[]
/session endpoint: adviseTurn(turn, ctx) → turn.findings[]  (drill-down)
```

## Error handling / edge cases

- Empty usage / no sessions → `worstPrompts: []`, existing empty-state copy holds.
- Low-usage account: absolute floors prevent flagging sub-dollar turns even if
  they top the percentile.
- Unknown-model turns: skipped by rate-dependent rules (getRates null), as today.
- `synthetic first turn` / `(session continuation)`: excluded from prompt-shape
  rules (T1) since prompt text is not user-authored; cost-based rules still apply.

## Testing

- `test/advisor.test.js` (new): each rule fires on a crafted subject and stays
  silent below floor; severity mapping from percentiles; `worstPrompts` ranking
  order; empty-input safety.
- `test/core.test.js`: `buildResponse` emits `worstPrompts`; `advisor` reasons are
  objects with `severity`/`fix`; backward-compat of session ranking.

## Rollout

Single change set. No migration (advisor is derived, not stored). Frontend and
core ship together since payload shape changes (`reasons` string → object).
