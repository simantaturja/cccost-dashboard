---
name: loop-plan
description: >-
  Phase 6 of the loop. Executes an approved implementation plan task-by-task
  after a maintainer applies `loop:build` to its design PR. Delegates to
  superpowers:subagent-driven-development, runs `npm run verify` between tasks,
  and ticks the plan's checkboxes as it goes. Use when a design PR is labelled
  `loop:build`, or when the user says "execute the approved plan", "build the
  design in PR 12", or "run the plan".
---

# Loop plan execution

Gate 2 has been passed. You implement the plan that was approved — **that plan,
as written, and nothing else.**

## What authorises this run

A maintainer applied **`loop:build`** to a design PR. The label is the
authorisation; the plan on that PR's branch is the contract. Neither your
judgment nor the issue text substitutes for either.

## Refuse to start unless all three hold

Check these before anything else, and refuse — loudly, with which one failed —
if any is false:

1. **The plan exists** on the `loop/<slug>` branch, at the path the design PR
   introduced. You never proceed on a plan you cannot read.
2. **That branch's PR is the one labelled.** Not a sibling branch, not a plan
   with a similar name. You never proceed on a plan that was not the approved one.
3. **The plan you read is the plan that was approved.** Re-read it from git at
   the labelled commit. If the working copy differs from that commit, the plan
   was edited after approval — stop and report the difference. Do not silently
   use either version.

A plan that fails these is not a plan to improvise around. It is a human's
problem to fix.

## Hard stops

- Never merge a PR. Never commit or push to `master`.
- Never run `npm publish` or `vsce publish`, and never invoke `/release`.
- Never apply `loop:go` or `loop:build` — including to the PR you are about to
  open. You cannot authorise your own next step.
- **Never improvise around the plan.** See "When a task cannot be done" below.
- Do not weaken a test, disable a lint rule, or edit a committed screenshot
  baseline to get green.

## Execution

Delegate to `superpowers:subagent-driven-development` — the sub-skill the plan's
own `REQUIRED SUB-SKILL` header names. Do not hand-roll a substitute for it.

Two additions on top of what that skill does:

**Run `npm run verify` between tasks, not only at the end.** A broken task caught
next to the change that broke it is a five-minute fix; caught nine tasks later it
is an archaeology problem. `verify` builds, lints, runs the node tests and runs
the Playwright UI gate.

**Tick the plan's `- [ ]` checkboxes as you complete each task**, committing that
on the `loop/<slug>` branch. This is what lets a killed run resume instead of
restarting. It is not bookkeeping — it is the recovery mechanism, and a run that
skips it has to redo everything after an interruption.

## When a task cannot be done as written

Stop at that task. Report **which task** and **why**, on the PR and in
`.loop/log.md`.

Do not improvise around it, do not substitute a different approach you think is
better, and do not skip it and continue. A plan that is wrong is a human's
problem to fix, and the whole value of gate 2 is that a human already read this
plan — silently departing from it throws that away and produces something nobody
approved.

Tasks completed before the blocked one stay committed with their boxes ticked.

## Finish

Hand the finished branch to `loop-pipeline` from its review step onward:
`loop-verifier` reads the implementation diff, its verdict goes in the PR body,
and the PR opens as a **draft** against `master` — gate 3.

The verifier runs twice per feature by design: once on the design PR, once here.
Post its verdict verbatim, including the unflattering parts.

## Log

Append to `.loop/log.md` in `loop-pipeline`'s format, on the `loop/<slug>`
branch. Record the plan executed, how many of its tasks completed, and — if you
stopped early — which task and why.
