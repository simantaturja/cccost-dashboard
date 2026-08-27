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
2. **Self-audit** — UI regressions, untested branches, dead code
3. **Issue autopilot** — GitHub issues to draft PRs
4. **Feature engine** — roadmap item to draft PR

This spec covers the substrate (Phases 0-3) and lane 1 in full. Lanes 2-4 are
sketched; each gets its own spec when its turn comes.

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
  fills the empty queue that lane 3 needs.

## Phase 0 — make agent knowledge versioned

~0.5 agentic hours.

- `.gitignore`: replace blanket `.claude/` with `.claude/settings.local.json`.
  Commit the three existing skills. Un-ignore `docs/superpowers/` — the specs
  and plans are the design record and the loop reads them.
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
only `settings.local.json` under `.claude/`.

## Phase 1 — stopping conditions

~2 agentic hours. Nothing in later phases may run until this is green.

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

~1.5 agentic hours.

- `.claude/agents/loop-drafter.md` — implements one finding. Tools: Read, Edit,
  Write, Bash, Grep, Glob.
- `.claude/agents/loop-verifier.md` — judges the diff against `AGENTS.md`, the
  project skills, and the tests. Tools: **Read, Grep, Bash only.** It cannot
  edit, so it structurally cannot fix what it is judging. This is the article's
  ideate-vs-verify split, enforced by tool grants rather than by instruction.
- Worktree per finding: `git worktree add ../cccost-loop/<slug>`, removed on
  completion.
- `.claude/settings.json` (committed): a Stop hook running `npm run verify`, and
  a PostToolUse hook on `web/src/**` writes that requires `test:ui`.

**Verify:** dry run against a synthetic finding produces a worktree, a draft PR,
and a verifier verdict, with no write outside the worktree.

## Phase 3 — watchdog lane and heartbeat

~1.5 agentic hours.

`.claude/skills/loop-watchdog/SKILL.md` checks, in order:

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

Cadence: local Claude Code scheduled automation, daily. Chosen over GitHub
Actions because checks 1 and 3 need real `~/.claude` transcripts, which CI never
sees; it also runs on the existing subscription rather than API credits. Cost:
it only fires while the machine is awake.

**Verify:** seed a scratch JSONL with a fabricated model ID; first run files
exactly one issue and appends one log entry; second run files zero.

## Lanes 2-4 (later, one spec each)

- **Self-audit** — untested branches in `lib/core.js`, `web/src` UI regressions
  against committed baselines, dead code. Needs Phase 1's UI gate first.
- **Issue autopilot** — extend the existing `issue-to-pr` skill to run
  unattended under the drafter/verifier split. Its queue is fed by lanes 1-2.
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
  for a drift watchdog; not acceptable later for lane 3.

## Non-goals

No auto-merge. No auto-release. No cloud runner in this phase. No MCP server —
`gh` covers the tracker. No coverage threshold gate; risk-ranked tests instead.

## Open item

The exact local scheduling mechanism (Claude Code cron/automation invocation and
its working-directory semantics) is confirmed at Phase 3 implementation, not
assumed here.
