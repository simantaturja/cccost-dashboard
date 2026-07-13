# Claude Code Cost Dashboard

Local dashboard for Claude Code token usage and cost, computed from
`~/.claude/projects/**/*.jsonl`. Includes subagent and workflow-agent
transcripts, merged into their parent session.

## Run

    npm start        # http://localhost:3456

## Test

    npm test

## Notes

- Costs are API-equivalent (usage × current Anthropic pricing); on a Max
  subscription they represent value, not billing.
- Pricing table lives in `lib/core.js` (`PRICING`) — update when Anthropic
  pricing changes. Cache writes are priced per TTL (5m = 1.25× input,
  1h = 2× input); cache reads at 0.1× input.
- Assistant messages are deduped by `message.id` (streaming writes duplicates).
- Refresh the page to pick up new sessions; only changed files are re-parsed.
