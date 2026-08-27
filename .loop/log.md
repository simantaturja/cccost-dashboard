# Loop log

The loop's running memory. Every run appends here, whether or not it filed
anything — the "no action" entries are what stop a finding being re-reported.

Format is defined in `.claude/skills/loop-pipeline/SKILL.md`.

## 2026-08-27 loop-issue

- **Finding:** #3 — `landscape.md` opens by pointing at a private claude.ai
  artifact URL and at `scratchpad/cccost-landscape.html`, a path that is neither
  tracked nor on disk. Confirmed: both are real dead ends, and those two lines
  are their only occurrences in the repo.
- **Action:** no PR. The fix is a 4-line deletion, fully specified and posted as
  a patch on #3 for a human to apply.
- **Why:** the file lives under `.claude/**`, which the harness refuses to let an
  unattended agent write. That refusal is a guardrail worth keeping — a public
  issue steering the loop into editing its own skill and agent definitions is the
  exact shape this lane is built to resist, and the harness cannot tell a benign
  dead-link report from a hostile one by target alone. Reaching for `sed` or
  `git apply` to get around it would defeat the guardrail, so this run stops here
  rather than shipping the fix.
