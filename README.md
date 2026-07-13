# Claude Code Cost Dashboard

Local dashboard for Claude Code token usage and cost, computed from
`~/.claude/projects/**/*.jsonl`. Includes subagent and workflow-agent
transcripts, merged into their parent session.

## Run

    npm run build    # builds the React frontend (web/) to web/dist
    npm start        # http://localhost:3456

The frontend is a Vite + React app in `web/`. `server.js` serves the built
`web/dist/` (and keeps `/api/data` + `/api/report`); if `web/dist` is missing it
returns a 500 asking you to run the build.

### Frontend dev mode

    cd web && npm install && npm run dev

The Vite dev server proxies `/api` to `http://localhost:3456`, so run `npm start`
in the repo root alongside it for live data.

## Test

    npm test

## Config

`config.json` in the repo root (optional; built-in defaults used if missing).
It is gitignored — copy `config.example.json` and edit it with your own values:

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

Paths are matched as prefixes against each session's project directory. Set
`subscriptionUSDPerMonth` to your plan price for the ROI figure. With no
`clients`, every session is attributed to `defaultClient`.

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
- **Prompt history** — expand a row on the Sessions tab for a per-prompt timeline
  (each user prompt with the tokens/cost of the work it triggered, including
  subagent activity attributed by timestamp window). Prompt text is fetched
  lazily via `GET /api/session?key=<sessionKey>` and never enters the main
  `/api/data` payload or the in-memory cache. A project filter narrows the table.

## How the efficiency advisor works

Each session is run through `advisorFor` (`lib/core.js`). A session can trip
several rules; each adds a reason. Only flagged sessions are returned, sorted by
cost (highest first) and capped at 25. The thresholds are hand-picked heuristics,
not tuned against outcomes — treat the output as a "look here first" signal.

| Rule | Fires when | Meaning |
|---|---|---|
| Low cache hit ratio | cost ≥ $1 **and** cache-read < 50% of input-side tokens | Context was rebuilt instead of served from cache (reads are ~10× cheaper than fresh input). |
| Premium model on a short session | used `fable-5` **and** < 20 messages | A short session rarely needs the most expensive model. Estimated saving = `fableCost × 0.7` (Sonnet ≈ 30% of Fable's price). |
| Subagent-heavy | cost ≥ $5 **and** subagents > 60% of session cost | Subagent fan-out can add large overhead — worth checking the delegation earned its cost. |

Only the premium-model rule produces a dollar estimate; the other two point.

Limitations worth knowing:

- A low cache ratio is often not your fault — the 5-minute cache TTL expiring
  between bursts, `/clear`, or long idle gaps all lower it. It flags a symptom,
  not necessarily a fixable mistake.
- The Sonnet-saving estimate assumes the task would have succeeded on Sonnet,
  which the advisor cannot verify.
- The `$1` / `$5` / 20-message / 50% / 60% cutoffs are judgment calls and will
  produce some false positives.

## Notes

- Costs are API-equivalent (usage × current Anthropic pricing); on a Max
  subscription they represent value, not billing.
- Pricing table lives in `lib/core.js` (`PRICING`) — update when Anthropic
  pricing changes. Cache writes are priced per TTL (5m = 1.25× input,
  1h = 2× input); cache reads at 0.1× input.
- Assistant messages are deduped by `message.id` (streaming writes duplicates).
- Days and months are bucketed by the machine's **local** calendar date, so
  billing months follow wall-clock time rather than UTC.
- Refresh the page to pick up new sessions; only changed files are re-parsed.
