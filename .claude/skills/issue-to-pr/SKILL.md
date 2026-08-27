---
name: issue-to-pr
description: >-
  Triage the GitHub issues on this repo (cccost-dashboard), judge which are real
  bugs or worth-building features, then implement the one you pick — TDD, green
  CI, branch, PR. Use when the user says "check the issues", "triage the issues",
  "what's in the backlog", "anything worth fixing", "implement issue 12",
  "fix #12", "work on that issue", or pastes an issue URL. Also use when the user
  asks whether a reported issue is real, reproducible, or in scope.
disable-model-invocation: true
---

# GitHub issue → PR

Two jobs, in this order: **decide what deserves code**, then **write it**. Most of the
value is in the first job — an issue implemented that shouldn't have been is worse
than one left open.

Hard rule: **the verdict table is a stop.** Never move from triage into
implementation without the user naming the issue to build.

This skill is user-only (`disable-model-invocation: true`) and the rule above is
load-bearing — do not relax it to enable automation. The unattended path is the
separate `loop-issue` skill, where applying the `loop:go` label is the
maintainer's naming act.

## Stage 1 — Sweep

```bash
gh issue list --state open --limit 50 \
  --json number,title,labels,author,createdAt,comments,body
```

Zero open issues → say so and stop. Don't invent work.

Set aside (report as skipped, one line each, no triage effort):

- an open PR already links it — check `gh pr list --state open --json number,title,body`
- labeled `wontfix` or `duplicate`
- labeled `question`, and the last comment is yours/the maintainer's — the reporter owes a reply

## Stage 2 — Classify

Every remaining issue is exactly one of: **bug**, **feature**, **docs**,
**not-actionable** (support request, unrelated tool, no content).

Label the issue carries ≠ the classification. A reporter's "bug" that asks for new
behavior is a feature. Judge from the body, not the label.

## Stage 3 — Evaluate

### Bugs — repro first, verdict second

No reproduction, no `REAL` verdict. In order:

1. Find the claim in the code. `lib/`, `server.js`, `web/src/`.
2. Reproduce it. Preferred: a failing test in `test/core.test.js` driving the real
   function. Where the bug depends on log shape, hand-build the minimal fixture the
   way that file already does — a `JSON.stringify({...})` line handed to
   `parseSession`, no temp dirs. Date/time bugs: `core.test.js` pins
   `process.env.TZ = 'Asia/Dhaka'` before its requires, so a repro that "only
   happens in my timezone" is testable.
3. Verdict:
   - `REAL` — failing test committed to the branch later, or an unambiguous defect
     you can point at with `file:line` and explain. Both, when cheap.
   - `NEEDS-INFO` — plausible but not reproducible. Write **the exact question** to
     ask the reporter (version, `~/.claude/projects` layout, the number they saw vs
     expected). Vague "please provide more detail" is not an output.
   - `NOT-A-BUG` — code behaves as designed. Say what the reporter likely expected
     and why the design differs.

A crash or a wrong number in a cost figure outranks everything else in this repo —
the product's whole claim is that its numbers are right.

### Features — judge against this product, not in the abstract

Read before opining (both, not skimmed):

- `.claude/skills/cccost-product-owner/references/product.md` — the wedge, the
  three-tier **feasibility gate**, the two-tier **non-goals**
- `.claude/skills/cccost-product-owner/references/landscape.md` — who else does this
  and whether they already do it better

Then:

- `CUT` — fails the feasibility gate (needs signal the JSONL logs don't carry), or
  lands in tier-1 non-goals. Feasibility is the first check, not the last: an idea
  the data can't support is dead regardless of how good it is.
- `DEFER` — feasible and in scope, but weaker than what's already queued. Say what
  it loses to.
- `ACCEPT` — feasible, on-wedge, and worth the code.

Docs issues: `ACCEPT` if the doc is wrong or missing something a new user hits;
`CUT` if it's a rewrite for taste.

## Stage 4 — Verdict table, then STOP

| # | Kind | Verdict | Why (one line) | Size | Touches |
|---|------|---------|----------------|------|---------|

- **Size** — agentic hours, not human hours.
- **Touches** — real paths (`lib/core.js`, `web/src/components/Tiles.jsx`), not "the backend".
- **Why** — the load-bearing reason. Not a restatement of the title.

End with: which one you'd build first and why. Then **stop and wait.** Do not open
files for implementation, do not create a branch.

## Stage 5 — Implement the chosen issue

### Preflight — stop on any failure

```bash
git status --short                  # must be empty
git rev-parse --abbrev-ref HEAD     # expect master
git pull --ff-only
```

Dirty tree → report and stop. Never build on top of someone's uncommitted work.

### Build

```bash
git switch -c fix/<number>-<slug>   # or feat/<number>-<slug>
```

Use `superpowers:test-driven-development`. For a bug, the repro test from Stage 3 is
the first commit and it must be red before the fix goes in. Follow the surrounding
code's style; touch only what the issue requires.

### Verify — mirror CI, don't approximate it

`.github/workflows/ci.yml` runs on node 20 and 22:

```bash
npm --prefix web ci     # only when web/ is touched
npm run build
npm test
```

`superpowers:verification-before-completion` applies: paste the output. "Tests pass"
without the run is not a result.

### Ship

```bash
git commit -m "fix(scope): <what changed> (#<number>)"
git push -u origin HEAD
gh pr create --title "..." --body "...

Fixes #<number>"
```

Commit and PR text: normal prose, no caveman, no self-attribution beyond the repo's
existing convention. Then comment the PR link on the issue.

Leave `CHANGELOG.md` and the version alone — `/release` owns those.

## Stage 6 — The rejected issues

`CUT` / `NOT-A-BUG` / `NEEDS-INFO` all deserve a reply, and all are outward-facing.

**Draft the comment, show it, ask before posting.** Never close an issue on your own —
closing is the maintainer's call. Tone: the reason, plainly, crediting what the
reporter got right. A `CUT` explains the constraint (the logs don't carry that
signal; that's a deliberate non-goal), not "won't do".

## Guardrails

- **Breaking changes get flagged, never slipped in.** A change to the CLI surface,
  `config.json`, or the parsed data shape stops for approval even if the issue asked
  for it.
- **Cost math is the product.** Any change under `lib/` that moves a number needs a
  test asserting the number, not just that it runs.
- **Don't fix adjacent things.** Unrelated defects you notice get mentioned in the
  PR description, not committed.
- **One issue per branch.** Two issues that look related are still two PRs unless the
  user says otherwise.
