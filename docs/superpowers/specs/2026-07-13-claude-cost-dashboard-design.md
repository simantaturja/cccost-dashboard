# Claude Code Cost Dashboard — Design

**Date:** 2026-07-13
**Status:** Approved by user (chat), pending spec review

## Problem

Claude Code usage spans ~40 projects and 1,573 session JSONL files (~322MB) under
`~/.claude/projects/`. There is no visibility into where tokens and money go. The user
wants a dashboard with a summary view and a per-session breakdown.

## Decision Summary

- **Build custom** (ccusage considered and rejected — user wants own dashboard).
- **Form factor:** local web app — small Node server + one HTML page.
- **Stack:** Node.js, no framework (`node:http`), vanilla JS frontend, zero build step.
- **Views:** summary tiles, per-project, per-model, daily trend, cache efficiency,
  per-session table with drill-down.

## Data Source

`~/.claude/projects/<project-dir>/<session-id>.jsonl`

- One JSON object per line. Relevant lines: `type === "assistant"` with
  `message.usage` present.
- Fields used: `message.id`, `message.model`, `message.usage.input_tokens`,
  `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`,
  `message.usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`
  (breakdown present on newer entries), `timestamp`, `sessionId`, `cwd`.
- **No `costUSD` field exists** — cost must be computed from usage × pricing.
- Project name derived from the project directory name (decoded from the dashed path),
  falling back to `cwd` from entries.

### Critical data handling rules

1. **Dedup by `message.id`.** Streaming writes the same message (same `id`, same usage)
   on multiple lines. Count each message id once per session file (last occurrence wins).
2. **Cache write TTL split.** 36k+ entries carry 1h cache writes, billed 2× input rate
   (5m writes bill 1.25×). When `usage.cache_creation` breakdown exists, price
   5m and 1h buckets separately. Fallback: treat `cache_creation_input_tokens`
   as 5m (1.25×).
3. **Malformed lines** are skipped and counted (surfaced as a diagnostic number, not an error).
4. Missing usage fields default to 0.
5. Entries with synthetic/unknown model names (`"opus"`, `"sonnet"`, `"haiku"`) are
   matched to a pricing family by substring; models with no match cost $0 and are
   flagged in the UI.

## Pricing Table (USD per 1M tokens, verified 2026-07-13 from Anthropic docs)

| Model family (substring match) | Input | Output | Cache write 5m | Cache write 1h | Cache read |
|---|---|---|---|---|---|
| `fable-5`, `mythos-5` | 10.00 | 50.00 | 12.50 | 20.00 | 1.00 |
| `opus` (4.5–4.8)      | 5.00  | 25.00 | 6.25  | 10.00 | 0.50 |
| `sonnet` (4.5/4.6/5)  | 3.00  | 15.00 | 3.75  | 6.00  | 0.30 |
| `haiku` (4.5)         | 1.00  | 5.00  | 1.25  | 2.00  | 0.10 |

Multiplier rule: cache write 5m = 1.25× input, 1h = 2× input, cache read = 0.1× input.
Sonnet 5 intro pricing ($2/$10 through 2026-08-31) deliberately ignored — standard
rates used; error is negligible at observed volume (~1.6k sonnet-5 messages).

`cost(message) = input×in + output×out + w5m×write5m + w1h×write1h + reads×read` (all /1M).

## Architecture

```
server.js            Node http server, port 3456
  ├── scanner        walk ~/.claude/projects/**/*.jsonl
  ├── parser         line-parse, filter assistant+usage, dedup by message.id
  ├── pricing        model → rates table, cost per message
  ├── aggregator     per-session rollup → in-memory store
  └── /api/data      JSON endpoint (recomputes changed files only)
public/index.html    single page: fetch /api/data, render all views
package.json         name, start script; zero runtime deps
```

### Incremental cache

In-memory `Map<filePath, {mtimeMs, size, sessionAggregate}>`. On every `/api/data`
request: stat all JSONL files; re-parse only new files or files whose mtime/size
changed; drop entries for deleted files. First scan (~322MB) runs once at startup.

### Session aggregate shape

```js
{
  sessionId, project, firstTimestamp, lastTimestamp,
  messages,               // deduped assistant message count
  tokens: { input, output, cacheWrite5m, cacheWrite1h, cacheRead },
  costUSD,
  models: { [modelId]: { tokens..., costUSD } },
  malformedLines
}
```

### /api/data response

```js
{
  generatedAt,
  summary: { totalCostUSD, totalTokens, sessionCount, projectCount,
             cacheReadTokens, cacheSavingsUSD, unknownModelMessages },
  byProject: [ { project, costUSD, tokens, sessionCount } ],   // cost desc
  byModel:   [ { model, costUSD, tokens, messages } ],
  daily:     [ { date, costUSD, tokens } ],                    // all days, UI shows last 90
  sessions:  [ session aggregates, cost desc ]
}
```

`cacheSavingsUSD` = cacheRead tokens × (input rate − read rate), summed per model —
what those tokens would have cost as fresh input minus what was paid.

## UI (single page)

1. **Summary tiles** — total cost, total tokens, session count, cache savings.
2. **Daily spend** — bar chart, last 90 days.
3. **Per project** — table, cost descending.
4. **Per model** — table/split with cost share.
5. **Cache efficiency** — cache-read vs fresh-input ratio + savings.
6. **Sessions** — table (project, session id, date, messages, tokens, cost), sortable
   by cost and date, client-side. Click row → expandable detail: per-model breakdown,
   token type split.

Charts rendered with vanilla JS/SVG or a single inlined chart snippet — no CDN,
no build step. Dark/light per `prefers-color-scheme`.

## Error Handling

- Unreadable file → skip, count in diagnostics.
- Malformed line → skip, count.
- Unknown model → $0 cost, count surfaced in summary tile footnote.
- No other defensive handling (local tool, single user).

## Testing / Verification

1. **Fixture test** (`test/fixture.test.js`, `node --test`): small hand-written JSONL
   with known usage numbers, including a duplicated message id and a 1h cache write →
   assert exact expected cost and token totals from the aggregator.
2. **End-to-end:** start server against real data, verify page renders, cross-check
   one session's totals against `npx ccusage` output for the same session (tolerance:
   pricing-table differences only).

## Out of Scope

- Live/websocket updates (refresh = reload).
- Historical pricing (one current table).
- Multi-user, auth, deployment.
- Subscription (Max plan) vs API-billing distinction — costs shown are API-equivalent value.
