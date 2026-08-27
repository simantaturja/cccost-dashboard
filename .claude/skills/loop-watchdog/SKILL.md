---
name: loop-watchdog
description: >-
  Lane 1 of the loop. Runs three drift checks against this repo — model IDs seen
  in real Claude Code transcripts that are missing from the committed allowlist,
  PRICING rates against Anthropic's published rates, and log-schema fields the
  parser depends on. Decides what counts as a finding, files it as a
  `loop:watchdog` issue, and hands it to `loop-pipeline`. Use when the user says
  "run the watchdog", "check for drift", "are the prices still right", "any new
  models", or on the daily scheduled run.
---

# Loop watchdog

You look for one thing: **the dashboard reporting a confident wrong number.**

`getRates` (`lib/core.js:38-43`) resolves a model ID by substring, first match
wins. That fails two ways:

- **Loud drift** — an ID matches nothing, is priced at $0, and
  `unknownModelMessages` increments (`lib/core.js:344`). Visible if someone looks.
- **Silent drift** — a new ID substring-matches an *older* entry and is billed at
  that older model's rates. A future `claude-opus-6` matches `'opus'` and prices
  at Opus-5. No counter moves, no test fails, the number is just wrong.

Silent drift is why this lane exists. Commit `ce7b49d` was this bug found by
hand.

## Hard stops

- Never merge a PR. Never commit or push to `master`.
- Never run `npm publish` or `vsce publish`, and never invoke `/release`.
- Never apply `loop:go` or `loop:build`. Those are the human's gates.
- **Never write a pricing rate you did not fetch and cannot cite.** A wrong rate
  is worse than a missing one — a missing one increments a counter someone sees,
  a wrong one bills silently. If you cannot fetch the published rate, file the
  issue and stop there.
- Append to `.loop/log.md` on **every** run, including the ones that find
  nothing. The quiet entries are what stop a non-finding being re-reported
  tomorrow.

## Check 1 — new model IDs

The silent-drift check. This is the important one.

Collect every distinct model ID appearing as `message.model` in
`~/.claude/projects/**/*.jsonl`. Compare against the `priced` and
`intentionallyUnpriced` arrays in `test/fixtures/known-models.json`.

Any ID in the transcripts and in neither array is a finding. For each, report:

- the exact ID
- how many messages carry it
- **which `PRICING` entry it currently matches**, by running the same
  first-match-wins substring walk `getRates` does — or `null` if it matches none

That last field is the whole point. `null` is loud drift, annoying but visible.
A *match* is silent drift: state plainly which model's rates it is currently
being billed at and what that means for the numbers already on the dashboard.

## Check 2 — rate drift

Compare every rate in the `PRICING` table (`lib/core.js:4-19`) against
Anthropic's currently published rates.

**Fetch them at run time. Never answer this check from model memory** — your
knowledge has a cutoff and pricing changes without one. If the fetch fails, say
the check did not run. A skipped check reported as skipped is fine; a check
answered from memory is how the wrong number gets committed.

Report any rate that differs, with both values and the source URL.

## Check 3 — log-schema drift

The parser depends on these fields. Confirm each still appears in transcripts
from the last few days:

`usage.*` (the token counts), `speed`, `message.model`, `tool_use_id`, `cwd`

A field that has vanished from recent transcripts is a finding — the parser is
silently reading nothing where it used to read data.

## Dedup — before you file anything

Two sources, both required:

1. `.loop/log.md` — what previous runs already decided, including what they
   decided *not* to file and why. A finding recorded here as "no action" stays
   no action unless something changed; say what changed if you re-open it.
2. `gh issue list --search "label:loop:watchdog,loop:audit" --state all --json number,title`
   — what is already filed. The comma inside `--search` is an OR; separate
   `--label` flags would be an AND and match nothing.

A finding present in either is not new. Append a one-line note saying you saw it
again and move on.

## Acting on a finding

For each genuinely new finding:

1. `gh issue create --label loop:watchdog` with the finding, its evidence, and —
   for check 1 — the current mis-match and its cost consequence.

2. Then decide whether you can also *fix* it:

   - **Yes, when the fix is machine-checkable and you have the facts.** Adding an
     observed ID to `test/fixtures/known-models.json`, or adding a `PRICING` row
     whose rates you fetched in check 2 and can cite. Hand it to `loop-pipeline`
     with the issue number and acceptance criteria — for a pricing change the
     criteria must include a test pinning the new rates.
   - **No — file and stop.** When the correct rates are unknown, when the fix
     needs a judgment about ordering in the substring table, or when check 3
     found a schema change whose right response is a parser design decision.
     Say in the issue why you stopped rather than building.

   `PRICING` is ordered and first match wins. A new entry that is a substring of
   an existing one, or vice versa, changes how *other* IDs resolve. If a row's
   position is not obvious, that is a human's call — file it.

## Logging — every run

Append to `.loop/log.md` in the format `loop-pipeline` defines:

```
## YYYY-MM-DD loop-watchdog

- **Finding:** one line
- **Action:** filed #N / PR #N / no action
- **Why:** one line — especially when the action was "no action", since that is
  what stops this finding being re-reported tomorrow
```

Record all three checks each run, including the ones that found nothing and the
ones that could not run. "Check 2 skipped, rate fetch failed" is a real entry
and a useful one.

Where the log gets committed:

- **Filed something** — `loop-pipeline` commits it on the `loop/<slug>` branch.
- **Quiet run** — commit it yourself on a `loop/log-<date>` branch and push that.
  Never on `master`, so the human gate holds even for a no-op run.
