# Prompt History per Session — Design

**Date:** 2026-07-13
**Status:** Approved (chat).

## Goal

Per-session prompt timeline: every user prompt with the tokens/cost of the work it
triggered (all assistant activity — including subagents — until the next prompt).
Reachable per project via a project filter on the Sessions tab.

## Backend

### Session linking

`/api/data` session objects gain `key: "<projectDirName>/<sessionId>"` (the server's
existing `sessionKey`). Server attaches it to merged aggregates before
`buildResponse` (aggregate pass-through; no core rollup changes needed).

### New endpoint

`GET /api/session?key=<urlencoded sessionKey>` — parses that session's files from
disk **on demand** (prompt texts never enter the main payload or the in-memory
cache). 404 if key unknown. Response:

```js
{
  sessionId, project,
  turns: [{
    timestamp,            // of the user prompt
    prompt,               // full text
    flagged,              // true when the "prompt" is a continuation/summary blob, not typed text
    tokens: { input, output, cacheWrite5m, cacheWrite1h, cacheRead },
    costUSD,
    subagentCostUSD,      // portion of costUSD contributed by subagent files
    models: [modelId...]
  }]
}
```

### Core logic (`lib/core.js`, unit-tested)

- `parseTurns(mainText)` — walk main-file lines in order:
  - A **prompt line** starts a new turn: `type === "user"`, has `message.content`
    that is a string or contains a `text` block, NOT `isMeta`, NOT `isSidechain`,
    NOT a tool_result-only message, and text does not start with command/hook
    wrappers (`<command-name>`, `<local-command-stdout>`, `Caveat:`,
    `<system-reminder>`). For array content, prompt text = concatenated `text`
    blocks.
  - Assistant messages with usage accumulate into the current turn (dedup by
    `message.id`, last occurrence wins — same rule as parseSession). Assistant
    activity before the first prompt goes into a synthetic first turn with
    `flagged: true` and prompt `"(session continuation)"`.
- `attributeSubagentTurns(turns, subagentText)` — parse a subagent file's priced
  messages (same dedup) and add each message's cost/tokens to the turn whose
  time window contains its timestamp (window = [turn.ts, nextTurn.ts); messages
  before first window → first turn, after last → last turn). Adds to both
  `costUSD`/`tokens` and `subagentCostUSD`.
- Both exported; tests: prompt detection filters (command wrapper skipped,
  tool_result skipped, meta skipped), turn cost attribution across 2 prompts,
  synthetic first turn, subagent timestamp attribution incl. boundary cases.

## Frontend

- Sessions tab: **project filter dropdown** (All + distinct short project names,
  filters the table client-side).
- Session row expansion gains the prompt timeline (lazy `fetch` of
  `/api/session?key=` on first expand; loading + error states):
  - Each turn: time, prompt text (truncated ~200 chars, click toggles full),
    cost, in/out tokens, subagent share when > 0, models.
  - Flagged turns visually marked ("continuation").
  - Existing per-model breakdown stays (above or beside the timeline).

## Constraints

- Backend zero-dep rule unchanged. Root tests extended (currently 14 pass).
- Endpoint reads files on demand; no caching of turn data (session files are
  read in one pass; fine for a local tool).
- React app rebuilt (`npm run build`).
