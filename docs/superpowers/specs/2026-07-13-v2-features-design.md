# V2 Features — Client Attribution, Plan ROI, Efficiency Advisor

**Date:** 2026-07-13
**Status:** Approved (chat). Extends 2026-07-13-claude-cost-dashboard-design.md.

## Feature 1: Client attribution + monthly billing report

### Config

New `config.json` in repo root (committed, user-editable):

```json
{
  "subscriptionUSDPerMonth": 200,
  "clients": {
    "Client A": ["/absolute/path/to/clientA/projects"],
    "Client B": ["/absolute/path/to/clientB/projects"]
  },
  "defaultClient": "Personal"
}
```

- A session belongs to a client when its `project` path starts with any of the
  client's path prefixes. First match wins. No match → `defaultClient`.
- Server loads config at startup; missing file → built-in defaults above.

### Aggregation

- Client-month rollup uses **session daily data** (accurate for sessions spanning
  months): each `session.daily[date]` contributes to `client × date.slice(0,7)`.
- `buildResponse(sessions, config)` gains:
  - `byClient: [{ client, costUSD, tokens, sessionCount, months: { "YYYY-MM": costUSD } }]` (cost desc)
  - `monthly: [{ month, costUSD, tokens }]` (ascending)

### Report endpoint

`GET /api/report?month=YYYY-MM` (default: current month) → `text/markdown`:

```
# Claude Code usage — 2026-07

| Client | Cost (USD) |
|---|---|
| Client A | $412.10 |
| Client B | $210.55 |
| Personal | $88.20 |
| **Total** | **$710.85** |

Generated 2026-07-13 · API-equivalent value at current Anthropic pricing.
```

### UI

- New section **By client**: table (client, sessions, tokens, cost, share) +
  per-month columns for the last 3 months.
- Link/button "Download monthly report" → `/api/report?month=<selected>` for the
  months present in data (simple `<select>` + link).

## Feature 2: Plan ROI tile

- Uses `subscriptionUSDPerMonth` from config.
- `buildResponse` gains `roi: { subscriptionUSDPerMonth, months: [{ month, valueUSD, multiple }] }`
  where `multiple = valueUSD / subscriptionUSDPerMonth` (ascending months).
- UI: one tile — current month's multiple, e.g. **“9.0×”** with label
  “July value vs $200/mo plan”. Footnote: value is API-equivalent, not billing.

## Feature 3: Efficiency advisor

### Session-level input

`mergeSessionAggregates` output gains `subagentCostUSD` — the summed `costUSD` of
non-main file aggregates (server passes `isMain` through to the merge; main file's
cost excluded). Sessions with no subagents → 0.

### Rules (exactly these three; no more)

Evaluated per session; a session can match several. Each match → reason string +
estimated saving where computable.

1. **Low cache ratio** — `costUSD >= 1` AND
   `cacheRead / (input + cacheWrite5m + cacheWrite1h + cacheRead) < 0.5`
   (guard: denominator > 0).
   Reason: `"Low cache hit ratio (NN%) — context likely rebuilt repeatedly"`.
2. **Premium model on short session** — session includes a `fable-5` model with
   cost > 0 AND session `messages < 20`.
   Reason: `"fable-5 on a short session — sonnet likely sufficient (est. save $X)"`
   where `X = fableCost × 0.7` (sonnet ≈ 30% of fable price).
3. **Subagent-heavy** — `subagentCostUSD / costUSD > 0.6` AND `costUSD >= 5`.
   Reason: `"NN% of cost from subagents ($Y) — check delegation value"`.

### Output

`buildResponse` gains `advisor: [{ sessionId, project, lastTimestamp, costUSD,
estSavingUSD, reasons: [string] }]` — only flagged sessions, sorted by `costUSD`
desc, capped at 25.

### UI

New section **Efficiency advisor**: table (project, session, date, cost,
est. saving, reasons). Empty state: “No flagged sessions.”

## Constraints

- Same stack rules: zero deps, no build step, `node --test`.
- All new core logic in `lib/core.js` with unit tests in `test/core.test.js`
  (config mapping, client-month rollup, roi, each advisor rule, subagentCostUSD).
- Existing tests must keep passing. `buildResponse(sessions)` without config must
  still work (config optional; client/roi/advisor sections then computed with
  defaults).
- README: document config.json and new features.
