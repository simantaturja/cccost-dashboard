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

**The loop stops at a draft PR.** It may create issues, worktrees, commits on a
`loop/<slug>` branch, push that branch, and open a draft PR against master. It
may not merge, commit or push to master, publish to npm, or release the
extension. Every line that ships is read by a human first.

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
- **GitHub Issues** labeled `loop:watchdog` / `loop:audit` / `loop:triage` —
  the actionable queue. Survives machine loss, triageable from a phone, and it
  fills the empty queue the autopilot needs. A separate `loop:go` label is the
  autopilot's trigger (see Phase 4).

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
| `loop-issue` | **new** | 4 | Lane 2's unattended single-issue path. |
| `issue-to-pr` | exists, **frontmatter edit** | 0 | Committed, plus `disable-model-invocation: true`. User-only. |
| `cccost-product-owner` | exists, unchanged | 0 | Committed. Lane 4 will use it later. |
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

The three `loop-*` skills stay invocable by both, deliberately: you need to be
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

The verifier's lack of Edit/Write is the enforcement, not a suggestion: it
structurally cannot fix what it is judging, so it cannot launder its own
approval.

**Deny-list, stated in both agent definitions.** Neither agent may: merge a PR,
commit or push to master, run `npm publish` or `vsce publish`, or edit a
committed screenshot baseline. `release` is already unreachable via
`disable-model-invocation`; the deny-list covers the shell commands that field
does not, since an agent with Bash could run `npm publish` without touching the
skill at all.

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
  edit, so it structurally cannot fix what it is judging. This is the article's
  ideate-vs-verify split, enforced by tool grants rather than by instruction.
  Carries the deny-list above.
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

The run follows the same path as the watchdog: worktree, drafter, `npm run
verify`, verifier, draft PR. It never merges.

**Verify:** open a test issue, apply `loop:go`, confirm exactly one run starts,
a draft PR appears linked to the issue, and CI is green on it. Confirm that
opening an issue *without* the label starts nothing.

## Lanes 3-4 (later, one spec each)

- **Self-audit** — untested branches in `lib/core.js`, `web/src` UI regressions
  against committed baselines, dead code. Needs Phase 1's UI gate first.
- **Feature engine** — `cccost-product-owner` picks the next roadmap item; the
  drafter builds it. Highest comprehension-debt risk; last on purpose.

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
- **Two runners to keep coherent.** Local cron and Actions must agree on the
  same `.loop/log.md` and label conventions, and drift between them is a real
  maintenance cost accepted in exchange for the issue lane surviving a sleeping
  laptop.

## Non-goals

No auto-merge. No auto-release. No polling of the GitHub API — the issue lane is
event-driven. No MCP server — `gh` covers the tracker. No coverage threshold
gate; risk-ranked tests instead.

## Open items

Both are confirmed at implementation, not assumed here:

1. The exact local scheduling mechanism for Phase 3 — Claude Code
   cron/automation invocation and its working-directory semantics.
2. Whether `anthropics/claude-code-action` auto-loads `.claude/skills` and
   `.claude/agents` from the checkout (Phase 4). The design does not depend on
   it either way; confirming it only lets the `prompt` get shorter.
