# Claude Code Cost Dashboard

Local dashboard for Claude Code token usage and cost, computed from
`~/.claude/projects/**/*.jsonl`. Includes subagent and workflow-agent
transcripts, merged into their parent session.

## Run

    npm start        # http://localhost:3456

## Test

    npm test

## Config

`config.json` in the repo root (optional; built-in defaults used if missing):

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

A session is attributed to the first client whose path prefix matches the
session's project path; no match falls back to `defaultClient`.

## Features

- **Client attribution** — `byClient` / `monthly` rollups from session daily data.
  `GET /api/report?month=YYYY-MM` (defaults to the current month) returns a
  markdown billing table (cost per client + total).
- **Plan ROI** — a tile showing the latest month's API-equivalent value as a
  multiple of `subscriptionUSDPerMonth`.
- **Efficiency advisor** — flags sessions with a low cache-hit ratio, `fable-5`
  used on a short session, or subagent-heavy cost, with estimated savings.

## Notes

- Costs are API-equivalent (usage × current Anthropic pricing); on a Max
  subscription they represent value, not billing.
- Pricing table lives in `lib/core.js` (`PRICING`) — update when Anthropic
  pricing changes. Cache writes are priced per TTL (5m = 1.25× input,
  1h = 2× input); cache reads at 0.1× input.
- Assistant messages are deduped by `message.id` (streaming writes duplicates).
- Refresh the page to pick up new sessions; only changed files are re-parsed.
