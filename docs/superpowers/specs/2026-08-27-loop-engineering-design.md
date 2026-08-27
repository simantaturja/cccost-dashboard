# Loop engineering for cccost-dashboard

Date: 2026-08-27
Status: approved design, pending implementation plan
Source: https://addyosmani.com/blog/loop-engineering/

## Goal

Turn this repo from a hand-driven project into one that runs an autonomous
improvement loop: scheduled discovery, isolated worktrees, sub-agent draft +
verify, and a draft PR waiting for review. The engineer stays the engineer —
the loop does the grunt work and always stops before merge.

## Scope

Four lanes were requested. They share one substrate and ship in order:

1. **Watchdog** — pricing/model/log-format drift (first)
2. **Issue autopilot** — GitHub issues to draft PRs
3. **Self-audit** — UI regressions, untested branches, dead code
4. **Feature engine** — roadmap item to draft PR

The watchdog ships first because it *feeds* the issue tracker: its findings are
the first real input the autopilot consumes, so lane 1 dogfoods lane 2's queue
rather than lane 2 waiting on strangers.

This spec covers the substrate (Phases 0-2) and lanes 1-2 in full (Phases 3-4).
Lanes 3-4 are sketched; each gets its own spec when its turn comes.

## Human gate

Three gates, in order. Each is a human act; the loop cannot pass one on its own.

| # | Gate | Human act | What it authorises |
|---|---|---|---|
| 1 | **Work this issue** | apply `loop:go` | the loop may triage, and may build a bug or docs fix |
| 2 | **Design approved** | apply `loop:build` on the design PR | the loop may implement the plan it authored |
| 3 | **Code approved** | review and merge the implementation draft PR | the change ships |

The loop may create issues, comment on issues, apply `loop:*` labels, open
worktrees, commit on a `loop/<slug>` branch, push that branch, author the spec
and plan, and open draft PRs against master. It may not merge, commit or push to
master, publish to npm, or release the extension. Every line that ships is read
by a human first.

**What gate 2 is for.** The loop authors the spec and the plan, which means both
encode decisions no human made. Gate 2 is where those decisions get caught. That
only works if the artifacts make their own choices visible, so every loop-authored
spec must open with an **Assumptions and interpretations** section: the readings
the issue admitted, which one it took, what it rejected and why, and every
question it had to answer without you. A spec that reads as settled prose has
hidden exactly what gate 2 exists to inspect. See "How a feature gets built".

## Current state (verified 2026-08-27)

| Primitive | State |
|---|---|
| Skills | 3 exist: `cccost-product-owner`, `issue-to-pr`, `release` — but `.claude/` is in `.gitignore`, so they are unversioned and machine-local |
| State/memory | none durable; `.superpowers/sdd/*` is per-run scratch |
| Sub-agents | none — no `.claude/agents/` |
| Automations | none |
| Worktrees | not used |
| Connectors | no `.mcp.json`; `gh` 2.93.0 installed and authed — sufficient |
| Agent conventions | no root `AGENTS.md` or `CLAUDE.md` |
| Verification | CI builds frontend + runs `node --test` on node 20/22. No linter. No frontend tests at all. No UI checks |
| Input queue | `gh issue list` returns empty |

Test coverage is 865 lines against `lib/core.js` and 33 against `server.js`.
Nothing covers the 19 files in `web/src/`.

## The drift problem (lane 1's real target)

`getRates` in `lib/core.js:38-43` resolves a model ID by substring, first match
wins, against a 6-entry `PRICING` table.

Two failure classes:

- **Loud drift.** An ID matching no entry returns `null`, the message is priced
  at $0, and `unknownModelMessages` increments (`lib/core.js:344`), surfacing in
  `Diagnostics.jsx`. Visible if someone looks.
- **Silent drift.** A new ID that substring-matches an *older* entry is priced
  at that older model's rates. A future `claude-opus-6` matches `'opus'` and
  bills at Opus-5 rates. No counter increments, no test fails, the dashboard
  reports a confident wrong number.

Silent drift is the dangerous class and nothing detects it today. Commit
`ce7b49d` ("correct Sonnet 5 rates and price fast mode") was this bug found by
hand. The watchdog exists to find it by machine.

Detection requires a committed allowlist of *known* model IDs. Any ID observed
in real logs that is absent from the allowlist is a finding — whether or not it
matched a pricing entry.

## Architecture

```
                 local Claude Code cron (daily)
                              |
                    .claude/skills/loop-watchdog
                              |
                  reads ~/.claude/projects/**/*.jsonl
                  reads .loop/log.md  (what was already judged)
                  reads open issues   (what is already filed)
                              |
                      new finding?  --no--> append to .loop/log.md, exit
                              |yes
                    gh issue create --label loop:watchdog
                              |
                  git worktree add ../cccost-loop/<slug>
                              |
                 .claude/agents/loop-drafter   (may write)
                              |
                   npm run verify  (lint + test + test:ui)
                              |
                 .claude/agents/loop-verifier  (read-only)
                              |
                    gh pr create --draft   --> HUMAN
```

Two state artifacts, by design:

- `.loop/log.md` — the loop's running memory, **tracked in git**. Every run
  appends what it checked, when, and what it decided *not* to file and why.
  This is what stops the watchdog re-reporting the same non-issue nightly. It
  is committed on the `loop/<slug>` branch when the run files something, and
  directly on a `loop/log-<date>` branch when the run is quiet — never on
  master, so the human gate holds even for a no-op run.
- **GitHub Issues** labeled `loop:watchdog` / `loop:audit` — the actionable
  queue. Survives machine loss, triageable from a phone, and it fills the empty
  queue the autopilot needs.

Three labels are human-applied and act as gates:

| Label | Applied by | Effect |
|---|---|---|
| `loop:go` | **human — gate 1** | Triage this issue; build it if bug or docs, else design it (Phase 4) |
| `loop:needs-review` | loop | Marker only, fires nothing. A design PR is open and waiting on gate 2 |
| `loop:build` | **human — gate 2** | Design approved — execute the plan (Phase 6) |

## How a feature gets built

An issue can be written any way at all, so the loop's first act is to decide
which of two paths it is on. The split is by ambiguity, not by size.

| Issue class | Loop's move | Why |
|---|---|---|
| **bug**, **docs** | Build it. Repro, failing test, fix, draft PR. | Ambiguity is low and the failing test *is* the spec — a machine-checkable statement of correct behaviour. Gate 2 is skipped; gates 1 and 3 still apply. |
| **feature** | Author a spec and a plan, open a **design PR**, stop at gate 2. | Ambiguity is the whole problem, so the design is reviewed as prose and file:line steps before any code exists. |
| **not-actionable** | Comments its reasoning, stops. | Nothing to build. |

### The design PR

For a feature the loop writes two artifacts and opens a **docs-only draft PR**
containing just them:

- `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`
- `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`

Reviewed as a diff, with inline comments, in the place review already happens.
CI on it is trivially green — no source changed. Your comments are the revision
request; the loop revises and pushes to the same PR. Approving means applying
`loop:build`, which is gate 2.

The spec must follow the shape the repo's existing specs already use, plus the
mandatory **Assumptions and interpretations** section described under Human
gate. The plan must follow the shape of the repo's existing plans: the
`REQUIRED SUB-SKILL` header, checkbox steps, file:line targets, per-task
interfaces, and global constraints.

**The verifier reads the design PR before you do.** `loop-verifier` attacks the
spec and plan for unstated assumptions, scope creep beyond the issue, and steps
that contradict `AGENTS.md`, and posts its verdict on the PR. It cannot edit
them. You review the design *and* its adversarial read, not the design alone.

### The whole path

```
issue --> gate 1: human applies loop:go
             |
             v
      loop classifies
             |
   bug/docs  |  feature
      |      |
      |      +--> loop authors spec + plan
      |               |
      |           design PR (docs only) + loop:needs-review
      |               |
      |           loop-verifier attacks it, posts verdict
      |               |
      |           GATE 2: human reviews diff, applies loop:build
      |               |
      |           loop executes the plan task-by-task
      |               |
      +---------------+--> loop-pipeline --> implementation draft PR
                                                    |
                                          GATE 3: human reviews, merges
```

Two PRs per feature, deliberately: the design PR is a durable record of what was
approved, and it stays pointable-at after the implementation lands.

**The plan is what the loop implements from — never the issue directly.** This
repo's plans are already written for unattended execution: every one opens with
*"For agentic workers: REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
or superpowers:executing-plans to implement this plan task-by-task"* and carries
file:line targets, exact code, and per-task interfaces. Executing one is
mechanical. Authoring one is not — which is why gate 2 sits between them.

## Runners

Hybrid, because the two lanes need different things:

| Lane | Runner | Why |
|---|---|---|
| Watchdog | local Claude Code cron, daily | checks 1 and 3 need real `~/.claude` transcripts; CI never sees them |
| Issue autopilot | GitHub Actions, event-driven | needs no local data; must work while the Mac sleeps; GitHub already pushes the event, so nothing polls |

Both authenticate with `CLAUDE_CODE_OAUTH_TOKEN`, not `ANTHROPIC_API_KEY` — the
action supports subscription auth, so the cloud runner costs no API credits.

**Assumption to verify at Phase 4, not to build on.** The action's docs describe
a `settings` input and a plugin mechanism; they do *not* document auto-loading
`.claude/skills` or `.claude/agents` from the checkout. It likely works, since
the action runs Claude Code against a checkout. The workflow therefore names the
skill and agent files by path in its `prompt` input, so the run reads them as
files regardless of whether they auto-load.

## Skills and agents

Everything the loop needs, and which phase writes it.

### Skills

| Skill | State | Phase | Purpose |
|---|---|---|---|
| `loop-pipeline` | **new** | 2 | The shared mechanics every lane repeats: dedup against `.loop/log.md` and open issues, open the worktree, hand off to the drafter, run `npm run verify`, hand off to the verifier, open the draft PR, append to `.loop/log.md`. Lane skills call this instead of each restating the pipeline. |
| `loop-watchdog` | **new** | 3 | Lane 1's three drift checks. Decides *what* is a finding; `loop-pipeline` does what happens next. |
| `loop-issue` | **new** | 4 | Lane 2's single-issue path: classify, then build (bug/docs) or hand to `loop-design` (feature). |
| `loop-design` | **new** | 5 | Authors the spec and plan for a feature and opens the design PR. Stops at gate 2 — it cannot apply `loop:build` to its own PR. |
| `loop-plan` | **new** | 6 | Executes an approved plan task-by-task once a human applies `loop:build`. Delegates to `superpowers:subagent-driven-development`, which the plans already name. |
| `issue-to-pr` | exists, **frontmatter edit** | 0 | Committed, plus `disable-model-invocation: true`. User-only. |
| `cccost-product-owner` | exists, unchanged | 0 | Committed. `loop-design` reads it for the WHAT/WHY half of a spec. |
| `release` | exists, **frontmatter edit** | 0 | Committed, plus `disable-model-invocation: true`. User-only. |

### User-only skills

`issue-to-pr` and `release` both carry `disable-model-invocation: true`, so only
a human typing `/issue-to-pr` or `/release` can start them. Claude cannot invoke
either, in this session or inside any loop run.

This is the correct guard for `release` specifically: it publishes to npm and the
VS Code Marketplace. The docs give exactly this case — *"Use this for workflows
with side effects or that you want to control timing, like `/commit`, `/deploy`
... You don't want Claude deciding to deploy because your code looks ready."*
It also makes "no auto-release" enforced by the harness rather than by an
instruction an agent might reason around.

**Consequence for `loop-issue`.** It cannot *invoke* `issue-to-pr`. Where it
reuses that skill's classification and evaluation stages, it does so by
**reading the file as reference text** (`.claude/skills/issue-to-pr/SKILL.md`),
which the field does not block — a plain file read, not an invocation. The lane
skill must say this explicitly so nobody later "fixes" the reuse by re-enabling
model invocation.

The four `loop-*` skills stay invocable by both, deliberately: you need to be
able to dry-run a lane by hand while building and debugging it.

**Why `loop-issue` is separate rather than a mode on `issue-to-pr`.** Most
directly: `issue-to-pr` is user-only, so a loop run cannot invoke it at all.
Beyond that, the existing skill states a hard rule: *"the verdict table is a stop. Never move
from triage into implementation without the user naming the issue to build."*
Its Stage 1 also sweeps every open issue, whereas Phase 4 acts on exactly one.
Adding an unattended mode would mean weakening that stop rule in the file that
also runs interactively — the kind of edit that quietly removes a guardrail from
both paths. Instead `loop-issue` states plainly that **applying the `loop:go`
label is the maintainer's naming act**, which is what satisfies the stop rule,
and delegates classification and evaluation to `issue-to-pr`'s stages by
reference. The interactive skill is not weakened.

### Agents

| Agent | Phase | Tools | Model / effort |
|---|---|---|---|
| `loop-drafter` | 2 | Read, Edit, Write, Bash, Grep, Glob | inherits session model; default effort |
| `loop-verifier` | 2 | **Read, Grep, Bash only** | inherits session model; high effort |

The verifier's lack of Edit/Write is genuinely structural: it cannot fix what it
is judging, so it cannot launder its own approval. It runs twice per feature:
once on the design PR (Phase 5) and once on the implementation diff (Phase 6).

**Deny-list, stated in both agent definitions and enforced three ways.**

*Structural, via `permissions.deny`* in the committed `.claude/settings.json`,
which binds a subagent even when its frontmatter grants the tool — `loop-verifier`
holding Bash does not reopen them: `npm publish`, `gh pr merge`, `gh pr review`.

*Structural, via a `PreToolUse` hook on `Bash`* that exits 2 on any command
applying a `loop:go` or `loop:build` label. `permissions.deny` cannot express
this — its patterns only wildcard at the end, so it cannot distinguish
`--add-label loop:build` (a gate the loop must never pass) from
`--label loop:watchdog` (a label the watchdog legitimately applies when filing).
The hook reads `tool_input.command` and matches the label-applying flags only, so
`gh issue list --search "label:loop:go"` and `--add-label loop:needs-review`
still pass.

*Instruction-only*, prevented by the agent definitions' prose rather than by tool
grants: merging a PR, committing or pushing to `master`, running `vsce publish`,
and editing a committed screenshot baseline. `Bash` remains a residual write path
for `loop-verifier`. This is deliberate — denying `git push origin master` or
`vsce publish` outright would break the user's own `/release` flow, which pushes
master at step 7 and publishes the extension at step 9.

**The push hole is still open.** Before an unattended runner exists, either
close it with a `PreToolUse` matcher narrow enough to spare `/release`, or accept
it explicitly and record why.

## Phase 0 — make agent knowledge versioned

- `.gitignore`: replace blanket `.claude/` with `.claude/settings.local.json`.
  Commit the three existing skills. Un-ignore `docs/superpowers/` — the specs
  and plans are the design record and the loop reads them.
- Add `disable-model-invocation: true` to `issue-to-pr` and `release`, making
  both user-only, and a line under `issue-to-pr`'s hard rule pointing at
  `loop-issue` as the unattended path, so a later reader does not "fix" the
  stop rule.
- Root `AGENTS.md` holds the conventions. Root `CLAUDE.md` is a one-line file
  pointing at it — a real file, not a symlink, so it survives every checkout.
  `AGENTS.md` contents:
  - node >= 20.19; `npm test` is `node --test`; frontend must be built first
  - two artifacts ship in lockstep: the npm package and `extension/`
  - `PRICING` lives in `lib/core.js`; `demo/projects` is the fixture set
  - `CLAUDE_PROJECTS_DIR` overrides the scan root (`lib/scan.js:11`)
  - server binds loopback only, on purpose — no auth
  - conventional commits, author only; never hand-edit `web/dist`

**Verify:** a fresh clone contains `.claude/skills/`; `git check-ignore` reports
only `settings.local.json` under `.claude/`; `/release` and `/issue-to-pr` still
work when typed, and neither is listed as model-invocable.

## Phase 1 — stopping conditions

Nothing in later phases may run until this is green.

**Linter.** Biome over ESLint: one binary, lint and format together, one config
file. The repo currently has zero root devDependencies; keep it that way as far
as possible.

**`test/pricing.test.js`.** Guards both drift classes:
- every model ID in `demo/projects` resolves to non-null rates
- every ID in a committed `test/fixtures/known-models.json` allowlist resolves
  to non-null rates
- no rate is zero or a placeholder
- for each allowlisted ID, the entry it matches is asserted explicitly — so a
  new `PRICING` row that steals an existing ID's match fails the test

**`npm run test:ui`.** Playwright as a root devDependency:
- `CLAUDE_PROJECTS_DIR=demo/projects node server.js` on an ephemeral port
- capture Overview, Sessions, Advisor at `colorScheme: 'light'` and `'dark'`
- assert zero console errors and that known fixture totals render
- baselines committed under `test/ui/__screenshots__/`

Note: capture colour scheme via Playwright's `colorScheme` option. Driving
Chrome from the CLI on macOS produces incorrect light captures when the OS is
in dark mode.

**`npm run verify`** = `lint && test && test:ui`. This one command is the loop's
stopping condition. CI gains matching `lint` and `ui` jobs.

**Verify:** `npm run verify` green locally and on CI for node 20 and 22.

## Phase 2 — role split and isolation

- `.claude/skills/loop-pipeline/SKILL.md` — the shared lane mechanics, written
  once here so `loop-watchdog` and `loop-issue` each stay a findings skill.
- `.claude/agents/loop-drafter.md` — implements one finding. Tools: Read, Edit,
  Write, Bash, Grep, Glob. Carries the deny-list above.
- `.claude/agents/loop-verifier.md` — judges the diff against `AGENTS.md`, the
  project skills, and the tests. Tools: **Read, Grep, Bash only.** It cannot
  edit, so it structurally cannot fix what it is judging — the article's
  ideate-vs-verify split. `npm publish`, `gh pr merge`, and `gh pr review` are
  also structurally blocked, via `permissions.deny` in `.claude/settings.json`;
  the rest of its deny-list (push to `master`, `vsce publish`, applying a
  `loop:build`/`loop:go` label) is enforced by prose only, since `Bash` is still
  a residual write path.
- Worktree per finding: `git worktree add ../cccost-loop/<slug>`, removed on
  completion.
- `.claude/settings.json` (committed): a Stop hook running `npm run verify`, and
  a PostToolUse hook on `web/src/**` writes that requires `test:ui`.

**Verify:** dry run against a synthetic finding produces a worktree, a draft PR,
and a verifier verdict, with no write outside the worktree. Confirm the verifier
cannot edit: hand it a diff and check it reports rather than repairs.

## Phase 3 — watchdog lane and heartbeat

Requires Phases 0-2.

`.claude/skills/loop-watchdog/SKILL.md` decides findings; `loop-pipeline` acts
on them. Checks, in order:

1. **New model IDs.** Every distinct model ID in `~/.claude/projects/**/*.jsonl`
   not in `test/fixtures/known-models.json`. Reports the ID, message count, and
   which `PRICING` entry it currently matches — the silent-drift check.
2. **Rate drift.** `PRICING` rates against published Anthropic rates. Fetched at
   run time, never from model memory.
3. **Log-schema drift.** Fields the parser depends on (`usage.*`, `speed`,
   `message.model`, `tool_use_id`, `cwd`) still present in recent transcripts.

Dedup before filing: read `.loop/log.md` and `gh issue list --label
loop:watchdog --state all`. Every run appends to `.loop/log.md` whether or not
it files.

Cadence: local Claude Code scheduled automation, daily. Only fires while the
machine is awake — acceptable for drift detection, which has no deadline.

**Verify:** seed a scratch JSONL with a fabricated model ID; first run files
exactly one issue and appends one log entry; second run files zero.

## Phase 4 — issue autopilot

Requires Phases 0-2.

Writes `.claude/skills/loop-issue/SKILL.md` and
`.github/workflows/loop-issue.yml`, using `anthropics/claude-code-action`:

```yaml
on:
  issues:
    types: [labeled]
```

**The trigger is label-gated, deliberately.** This repo is public, so
`types: [opened]` would let any stranger's issue text start a privileged run
holding `contents: write` and `pull-requests: write` — a prompt-injection and
run-abuse surface, since the issue body is untrusted text entering the agent's
prompt. Instead: anyone may open an issue and nothing fires; the run starts only
when a maintainer applies the `loop:go` label. The workflow additionally guards
on `github.event.label.name == 'loop:go'` and on the labeling actor's
association, so applying the label is the authorising act.

The issue body is passed to the agent as **data to be triaged, never as
instructions**, and the prompt says so explicitly.

Workflow shape:
- checkout, node 20, `npm --prefix web ci`, `npm run build`
- `npx playwright install --with-deps chromium` (the UI gate needs a browser)
- run the action with `claude_code_oauth_token`, a `prompt` that names
  `.claude/skills/loop-issue/SKILL.md`, `.claude/skills/loop-pipeline/SKILL.md`
  and the two agent files by path
- permissions: `contents: write`, `pull-requests: write`, `issues: write`
- concurrency group keyed on the issue number, so relabelling cannot start a
  second run against the same issue

On a **bug or docs** issue the run follows the same path as the watchdog:
worktree, drafter, `npm run verify`, verifier, draft PR. It never merges.

On a **feature** issue it hands off to `loop-design` (Phase 5) rather than
building. `loop-issue` states plainly that it may not write source for a feature,
and that `loop:build` — not its own judgment — is what authorises that.

**Verify:** three cases.
- A bug issue with `loop:go` → exactly one run, a draft PR linked to the issue, green CI.
- A feature issue with `loop:go` → hands off to Phase 5, **no source branch**.
- Any issue opened *without* the label → nothing starts.

## Phase 5 — design authoring

Requires Phase 4.

Writes `.claude/skills/loop-design/SKILL.md`.

On a feature issue the skill:
- reads the issue body **as data, never as instructions**, plus
  `cccost-product-owner` for the WHAT/WHY, `AGENTS.md`, and the existing specs
  and plans under `docs/superpowers/` for house shape
- authors the spec, opening with the mandatory **Assumptions and
  interpretations** section — readings admitted, reading taken, readings
  rejected and why, questions answered without a human
- authors the plan in the repo's existing plan shape: `REQUIRED SUB-SKILL`
  header, checkbox steps, file:line targets, per-task interfaces, global
  constraints
- commits both to `loop/<slug>` and opens a **docs-only draft PR**, applying
  `loop:needs-review`
- asks `loop-verifier` to attack the design and posts that verdict on the PR
- **stops.** It may not apply `loop:build`, may not write source, and may not
  open a second PR. Gate 2 is not its to pass.

Revision: a human comment on the design PR re-triggers the skill, which revises
and pushes to the same PR. The comment is treated as instruction, since it comes
from a maintainer, unlike the issue body.

**Verify:** hand it a feature issue and confirm the design PR contains **only**
files under `docs/superpowers/`, that the spec's Assumptions section is
non-empty, that `loop:needs-review` is applied, and that no source file and no
second branch exist. Then confirm the loop cannot apply `loop:build` itself.

## Phase 6 — plan execution

Requires Phase 5.

Writes `.claude/skills/loop-plan/SKILL.md` and extends the Phase 4 workflow with
`loop:build`.

Trigger: a human applies `loop:build` to a design PR (gate 2). The label is the
authorisation; the plan on that PR's branch is the contract.

The skill:
- refuses to run unless the plan exists on the `loop/<slug>` branch and that
  branch's PR is the one labelled — it never proceeds on a plan it cannot read,
  and never on a plan that was not the approved one
- re-reads the plan from git at the labelled commit, so a plan edited after
  approval is detected rather than silently used
- delegates to `superpowers:subagent-driven-development`, the sub-skill the plans
  themselves already require
- runs `npm run verify` between tasks, not only at the end, so a broken task is
  caught next to the change that broke it
- ticks the plan's `- [ ]` checkboxes as it goes, on the `loop/<slug>` branch, so
  a killed run resumes instead of restarting
- stops at the first task that cannot be completed as written and reports which
  task and why. It does not improvise around the plan; a plan that is wrong is a
  human's problem to fix.

**Verify:** point it at the committed
`docs/superpowers/plans/2026-07-19-sessions-prompt-cost-bars.md` on a scratch
branch reverted to that commit's parent. It should reproduce that work, tick
every box, and stay green. Then hand it a plan naming a nonexistent file and
confirm it refuses rather than improvising. Then confirm an unlabelled design PR
executes nothing.

## Lane 3 — self-audit (later, its own spec)

Untested branches in `lib/core.js`, `web/src` UI regressions against committed
baselines, dead code. Needs Phase 1's UI gate first. Files findings as
`loop:audit` issues, which then travel the Phase 4/5/6 paths like any other issue.

Lane 4 as originally sketched — "`cccost-product-owner` picks a roadmap item and
the drafter builds it" — is **dropped**. Phases 5 and 6 cover building a feature,
and they start from an issue plus gate 2 rather than from a model's unprompted
pick of what to work on.

## Risks

- **Comprehension debt.** The draft-PR gate is the mitigation and it only works
  if the diffs are actually read. If review degrades into rubber-stamping, the
  gate is decorative.
- **Public noise.** Machine-filed issues are visible on a public repo. Labels
  keep them separable; the `.loop/log.md` dedup keeps volume near zero.
- **Verifier bias.** The verifier is non-deterministic and gates *in addition
  to* `npm run verify`, never instead of it.
- **Baseline churn.** Committed screenshots go stale on intentional UI changes.
  Updating a baseline is a human commit, never a loop commit.
- **Silent sleep.** Local cron misses days when the machine is off. Acceptable
  for a drift watchdog, which is why the issue lane runs on Actions instead.
- **Prompt injection via issue text.** Mitigated by the `loop:go` label gate —
  untrusted text never starts a run — and by the draft-PR gate. The residual
  risk is a maintainer labelling a hostile issue without reading it.
- **The loop-authored spec reading as settled.** This is the largest risk in the
  design and it is a direct consequence of the loop authoring the spec and plan:
  fluent prose invites a nod rather than a read, and gate 2 then approves
  decisions nobody examined. Three structural mitigations, none of them
  sufficient alone: the mandatory Assumptions and interpretations section forces
  the choices into the open; the docs-only design PR makes them a reviewable
  diff rather than a wall of text; and `loop-verifier` attacks the design before
  a human sees it. The residual risk is real — gate 2 is where comprehension
  debt enters this system, and no structure removes that.
- **Plan drift after approval.** A plan could be edited between gate 2 and
  execution. Phase 6 re-reads the plan from git at the labelled commit and
  refuses if it moved.
- **Plan wrong as written.** Phase 6 stops at the first task it cannot complete
  as written rather than improvising, so a wrong plan fails loudly instead of
  producing a plausible PR that satisfies no one's intent.
- **Two runners to keep coherent.** Local cron and Actions must agree on the
  same `.loop/log.md` and label conventions, and drift between them is a real
  maintenance cost accepted in exchange for the issue lane surviving a sleeping
  laptop.

## Non-goals

No auto-merge. No auto-release. No loop-applied `loop:go` or `loop:build` — the
loop may never open its own gates. No source changes in a design PR, and no
design changes in an implementation PR. No polling of the GitHub API — the issue
lane is event-driven. No MCP server — `gh` covers the tracker. No coverage
threshold gate; risk-ranked tests instead.

## Open items

Both are confirmed at implementation, not assumed here:

1. The exact local scheduling mechanism for Phase 3 — Claude Code
   cron/automation invocation and its working-directory semantics.
2. Whether `anthropics/claude-code-action` auto-loads `.claude/skills` and
   `.claude/agents` from the checkout (Phase 4). The design does not depend on
   it either way; confirming it only lets the `prompt` get shorter.
