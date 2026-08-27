# Sessions / per-prompt cost — magnitude bars — design

Date: 2026-07-19
Status: approved (design), pending implementation plan

## Problem

The Sessions tab (`SessionsTable.jsx`) shows cost as plain numbers at three
levels — the outer session list, the per-model table in the drill-down, and
the per-prompt (turn) timeline. Every other cost view in the redesigned
"instrument" UI (`BreakdownBars.jsx`, `Tiles.jsx` value-scale, `WasteTrend.jsx`)
pairs a number with a magnitude bar so relative size reads at a glance. Sessions
is the one place left where you have to read digits to find the expensive
thing — a bigger cost, a bigger contributor, or an expensive prompt inside an
otherwise-cheap session, none of it visible without scanning numbers.

## Goals

Bring the existing magnitude-bar pattern to all three cost levels already
rendered by `SessionsTable.jsx`:

1. Outer session rows — spot big-spend sessions without opening any row.
2. Per-model table (session drill-down) — spot which model drove the cost.
3. Per-prompt timeline — spot which turn(s) drove a session's cost, and how
   much of that was subagent spend, matching the tab's own copy: "see its
   prompts and where the cost went."

Non-goals: no new data/API — every value used already exists on the payload
(`s.costUSD`, `m.costUSD`, `t.costUSD`, `t.subagentCostUSD`). No sorting/search
on the turn list. No change to `lib/core.js` or `lib/scan.js`.

## Approach

Reuse the track/fill pair already established in `BreakdownBars.jsx`
(`h-[11px] rounded bg-surface-2` track, `bg-chart` fill, width = `%`, floored
so a zero-cost row still shows a sliver) — no new CSS, no new component file.
All three changes live in `SessionsTable.jsx`.

**1. Session rows.** The Cost `<td>` becomes a small track+fill (fixed width,
e.g. 56px) followed by the number, same as it appears today. Fill width is
relative to the max `costUSD` among the currently filtered + sorted `rows`
(recomputed in the existing `rows` `useMemo`), so the scale rescales when the
project filter changes — matching `BreakdownBars`' own "relative to what's
shown" behavior.

**2. Per-model table (`SessionDetail`).** Add a `Share` column after `Cost`:
same track+fill, width relative to the max `m.costUSD` across that session's
`models` entries (local scale, computed once per render from the already-sorted
`models` array).

**3. Per-prompt timeline (`Turn`).** Add a full-width thin bar (~4px) directly
under the existing header row (timestamp / continuation badge / cost). Width
relative to the max `costUSD` among `state.turns` for that session (computed
once in `PromptTimeline`, passed down as `maxCost` prop). If `t.subagentCostUSD
> 0`, the bar is stacked: a `bg-chart` segment for `costUSD - subagentCostUSD`
and a `bg-accent` segment on top for `subagentCostUSD` — same stacking idea as
`WasteTrend`'s errored/redundant bars. Bar carries a `title` with the cost
breakdown for hover detail; the number in the header row remains the primary
readable value.

## Error handling / edge cases

- All-zero-cost session/model/turn set → `max` floors at a small epsilon
  (`Math.max(..., 0.01)`, same guard `BreakdownBars` already uses) so bars
  render as a minimum sliver, not `NaN%` or a division by zero.
- Single row/model/turn → bar fills 100%, which is correct (it's the biggest
  thing in its own set).
- `subagentCostUSD` occasionally exceeds `costUSD` by float rounding at the
  cent level — stacked segment widths are clamped so the two segments never
  sum past 100%.

## Testing

UI-only change, no `lib/` behavior touched, so no new unit tests. Verify by
running the dev server and checking, per tab load: session rows show
proportional bars sorted by both cost and date; opening a session shows model
`Share` bars matching the model cost order; the prompt timeline shows a
visible bar under at least one turn, stacked where a turn has subagent cost;
dark mode and empty-state (no sessions / no turns) still render without
errors.

## Rollout

Single change set, one file (`SessionsTable.jsx`). No migration, no payload
shape change.
