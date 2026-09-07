# Loop log

The loop's running memory. Every run appends here, whether or not it filed
anything — the "no action" entries are what stop a finding being re-reported.

Format is defined in `.claude/skills/loop-pipeline/SKILL.md`.

## 2026-09-07 loop-issue

- **Finding:** #5 — `claude-fable-5-1` substring-matched the `fable-5` PRICING row, pricing cache reads at $1/MTok instead of the published $0.25 (0.025x base input). Classified bug; reproduced with a failing test.
- **Action:** PR #6 (draft) on `loop/fable-5-1-pricing`. Verifier verdict: PASS.
- **Why:** Wrong cost number on a model with 3k+ messages in real transcripts. Mythos 5.1 has the same rate and same shadowing but is out of scope — separate issue.
