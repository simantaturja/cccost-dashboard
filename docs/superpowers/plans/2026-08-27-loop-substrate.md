# Loop Substrate (Phases 0-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the loop's substrate in place — versioned agent knowledge, a single `npm run verify` gate that is trustworthy enough to let an unattended agent write code, and the drafter/verifier agent split — so Phases 3-6 have something safe to run on.

**Architecture:** Three groups of change, no runtime code touched. (1) Un-ignore `.claude/` so skills and agents become versioned repo artifacts, and add a root `AGENTS.md`. (2) Add the missing verification: Biome for lint/format, a pricing-drift test, and a Playwright UI check — composed into one `npm run verify` that CI also runs. (3) Write the `loop-pipeline` skill, the `loop-drafter`/`loop-verifier` agents, and the settings hooks. `lib/`, `server.js`, and `web/src/` behaviour is unchanged throughout; the only source edits are two lint fixes and a one-time formatting pass.

**Tech Stack:** Node >= 20.19 (CommonJS in `lib/`, `server.js`), React 19 + Vite 8 + Tailwind v4 in `web/`, `node --test` for unit tests, Biome 2.5.10 (new), @playwright/test 1.62.1 (new), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-27-loop-engineering-design.md`

## Global Constraints

- Node engine floor is `>=20.19`. CI matrix is node 20 and 22. Do not raise either.
- `lib/`, `server.js` and `test/` are CommonJS (`require`); `web/src/` is ESM. Do not convert either.
- Repo style is 2-space indent, single quotes, ~100 column lines. Biome must be configured to match, never the reverse.
- No behaviour change to `lib/core.js`, `lib/scan.js`, `server.js`, or any `web/src/` component in this plan. The only source edits permitted are the two lint fixes in Task 3 and the mechanical format pass in Task 4.
- Two artifacts ship from this repo and their versions move in lockstep: the npm package and `extension/`. This plan changes neither version.
- Never hand-edit `web/dist` — it is build output and is gitignored.
- Conventional commit messages, author only.
- **`node --test` executes every `.js` file under `test/`**, verified empirically — so Playwright specs must NOT live under `test/`. They go in `e2e/`.

---

### Task 1: Version the agent knowledge

**Files:**
- Modify: `.gitignore:7-8`
- Modify: `.claude/skills/issue-to-pr/SKILL.md:1-10` (frontmatter)
- Modify: `.claude/skills/release/SKILL.md:1-4` (frontmatter)

**Interfaces:**
- Consumes: nothing.
- Produces: `.claude/skills/` and `docs/superpowers/` become tracked. Every later task's new skill/agent file is committed as a matter of course.

- [ ] **Step 1: Confirm what is currently ignored**

Run: `git check-ignore -v .claude/skills/release/SKILL.md docs/superpowers/plans/2026-08-27-loop-substrate.md`
Expected: both report a match against `.gitignore`.

- [ ] **Step 2: Narrow the ignore rules**

In `.gitignore`, replace these two lines:

```
docs/superpowers/
.claude/
```

with:

```
.claude/settings.local.json
```

- [ ] **Step 3: Verify the narrowing worked**

Run: `git check-ignore -v .claude/skills/release/SKILL.md ; git status --short .claude docs/superpowers | head`
Expected: `git check-ignore` exits non-zero with no output (no longer ignored), and `git status` lists the skill files and the specs/plans as untracked.

- [ ] **Step 4: Make `release` and `issue-to-pr` user-only**

In `.claude/skills/release/SKILL.md`, the frontmatter currently ends with the `description:` line followed by `---`. Add one line before the closing `---`:

```yaml
disable-model-invocation: true
```

Do the same in `.claude/skills/issue-to-pr/SKILL.md` — its frontmatter is a multi-line `description: >-` block, so the new line goes after that block ends and before the closing `---`, at zero indentation.

- [ ] **Step 5: Add the unattended-path pointer to `issue-to-pr`**

`.claude/skills/issue-to-pr/SKILL.md` contains this line:

```
Hard rule: **the verdict table is a stop.** Never move from triage into
implementation without the user naming the issue to build.
```

Immediately after it, add:

```
This skill is user-only (`disable-model-invocation: true`) and the rule above is
load-bearing — do not relax it to enable automation. The unattended path is the
separate `loop-issue` skill, where applying the `loop:go` label is the
maintainer's naming act.
```

- [ ] **Step 6: Confirm both skills still work when typed**

Run: `head -6 .claude/skills/release/SKILL.md`
Expected: valid YAML frontmatter containing `disable-model-invocation: true`. In a Claude Code session, `/release` and `/issue-to-pr` still appear; neither is listed as model-invocable.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .claude docs/superpowers
git commit -m "chore: version agent skills and make release/issue-to-pr user-only"
```

---

### Task 2: Root AGENTS.md

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `AGENTS.md` at the repo root. Task 8's `loop-verifier` judges diffs against it by path, and Task 9's hooks reference it.

- [ ] **Step 1: Write `AGENTS.md`**

```markdown
# Repo conventions for agents

Local, zero-setup cost dashboard for Claude Code. Reads Claude Code's own JSONL
transcripts and reports cost per project, model, session, and prompt.

## Layout

- `lib/core.js` — parsing, pricing, aggregation, the advisor. CommonJS. The
  `PRICING` table lives at the top of this file.
- `lib/scan.js` — filesystem layer: scans the projects dir, caches by mtime,
  merges session files. Shared by the server and the VS Code extension.
- `server.js` — loopback-only HTTP server. Binds `127.0.0.1` deliberately: the
  dashboard has no auth, and project paths and prompts must not reach the LAN.
- `web/src/` — React 19 + Tailwind v4 frontend. ESM.
- `extension/` — VS Code extension. Ships in lockstep with the npm package.
- `demo/projects/` — committed fixture transcripts.
- `e2e/` — Playwright specs. Must not live under `test/`.

## Commands

- `npm run build` — builds the frontend into `web/dist`. Required before tests
  that boot the server, and before `npm start`.
- `npm test` — `node --test`. Note it executes **every** `.js` file under
  `test/`, not only `*.test.js`.
- `npm run lint` / `npm run format` — Biome.
- `npm run test:ui` — Playwright.
- `npm run verify` — lint + test + test:ui. This is the gate.

## Rules

- Node `>=20.19`. CI runs node 20 and 22; both must pass.
- 2-space indent, single quotes, ~100 columns. Biome enforces this.
- `lib/`, `server.js`, `test/` are CommonJS. `web/src/` is ESM. Do not convert.
- Never hand-edit `web/dist` — build output.
- `CLAUDE_PROJECTS_DIR` overrides the scan root (`lib/scan.js:11`). Use it to
  point the server at `demo/projects` instead of real user data.
- Pricing changes: update `PRICING` in `lib/core.js` **and**
  `test/fixtures/known-models.json`. A model ID that matches no entry is priced
  at $0 and counted in `unknownModelMessages`; a model ID that substring-matches
  an older entry is priced at that older model's rates with no warning at all.
- Conventional commits, author only.
- Releases are human-only: `/release` is `disable-model-invocation: true`.
```

- [ ] **Step 2: Write `CLAUDE.md` as a pointer**

```markdown
See [AGENTS.md](AGENTS.md) for this repo's conventions.
```

- [ ] **Step 3: Verify**

Run: `test -f AGENTS.md && test -f CLAUDE.md && grep -c . AGENTS.md`
Expected: exits 0 and prints a non-zero line count.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: add AGENTS.md repo conventions for agents"
```

---

### Task 3: Biome lint gate

**Files:**
- Create: `biome.json`
- Modify: `package.json` (devDependencies, scripts)
- Modify: `test/core.test.js:9`
- Modify: `web/src/api.js:18`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run lint` (check, no writes) and `npm run format` (write). Task 6 composes `lint` into `verify`.

- [ ] **Step 1: Install Biome**

```bash
npm install --save-dev --save-exact @biomejs/biome@2.5.10
```

- [ ] **Step 2: Write `biome.json`**

Tuned to this repo's actual style — Biome's own `init` defaults to tabs and
double quotes, which this repo does not use. `tailwindDirectives` is required or
`web/src/styles.css` fails to parse on its `@theme inline` block.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.10/schema.json",
  "files": {
    "includes": ["**", "!**/web/dist", "!**/demo", "!**/extension/out", "!**/node_modules"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "suspicious": {
        "noRedundantUseStrict": "off"
      },
      "complexity": {
        "noAssignInExpressions": "off"
      }
    }
  },
  "javascript": {
    "formatter": { "quoteStyle": "single" }
  },
  "css": {
    "parser": { "tailwindDirectives": true }
  }
}
```

Two rules are deliberately off. `noRedundantUseStrict` fires on the `'use strict'`
at the top of each CommonJS file, which is this repo's convention.
`noAssignInExpressions` fires on deliberate idioms such as
`byKey.set(entry.sessionKey, (group = []))` in `lib/scan.js`. Turning working
code inside out to satisfy either is out of scope.

If Biome reports `noAssignInExpressions` under a different group than
`complexity`, move the key to the group the error message names — do not invent
a group.

- [ ] **Step 3: Add the scripts**

In `package.json`, in `"scripts"`, add:

```json
    "lint": "biome check .",
    "format": "biome check --write .",
```

- [ ] **Step 4: Run the linter and see it fail**

Run: `npm run lint`
Expected: FAIL. Among the diagnostics, exactly two are substantive:
`test/core.test.js:9 lint/correctness/noUnusedVariables` and
`web/src/api.js:18 lint/suspicious/useIterableCallbackReturn`. The rest are
formatting differences, fixed in Task 4.

- [ ] **Step 5: Fix the unused import**

In `test/core.test.js`, the destructuring at lines 7-11 currently reads:

```javascript
const {
  parseSession, buildResponse, mergeSessionAggregates, getRates,
  buildReport, DEFAULT_CONFIG, parseTurns, attributeSubagentTurns, classifyErrorReason,
  redactSecrets,
} = require('../lib/core');
```

Remove `DEFAULT_CONFIG,` from line 9. It is imported and never used.

- [ ] **Step 6: Fix the forEach return**

In `web/src/api.js:18`, change:

```javascript
      dataChangedSubs.forEach((cb) => cb());
```

to:

```javascript
      dataChangedSubs.forEach((cb) => {
        cb();
      });
```

The arrow's expression body returned `cb()`'s value into `forEach`, which
ignores it. Behaviour is identical; the intent is now explicit.

- [ ] **Step 7: Confirm the two substantive findings are gone**

Run: `npx biome lint --only=correctness/noUnusedVariables --only=suspicious/useIterableCallbackReturn .`
Expected: PASS, no diagnostics.

- [ ] **Step 8: Run the unit tests to prove no behaviour changed**

Run: `npm test`
Expected: PASS, same count as before the edits.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json biome.json test/core.test.js web/src/api.js
git commit -m "build: add Biome lint gate and fix its two substantive findings"
```

---

### Task 4: One-time formatting pass

**Files:**
- Modify: every `.js`/`.jsx`/`.json`/`.css` file Biome's formatter touches (~24 files)

**Interfaces:**
- Consumes: `biome.json` from Task 3.
- Produces: a codebase where `npm run lint` exits 0, so Task 6's `verify` can depend on it.

This is deliberately its own commit. It is a large mechanical diff with no
behaviour change, and mixing it into a functional commit would bury real changes
and pollute `git blame` for every file at once.

- [ ] **Step 1: Record the current test result as the baseline**

Run: `npm test 2>&1 | tail -5`
Expected: PASS. Write down the pass/fail counts — they must be identical in Step 4.

- [ ] **Step 2: Apply the formatter and safe autofixes**

Run: `npm run format`
Expected: Biome rewrites files and reports what it fixed. `useTemplate` and
`useOptionalChain` are safe autofixes and are applied here.

- [ ] **Step 3: Confirm the gate is now clean**

Run: `npm run lint`
Expected: PASS, exit 0.

If `complexity/noImportantStyles` still fires on `web/src/styles.css`, inspect
the `!important` it names. If it is deliberate, add a `/* biome-ignore
lint/complexity/noImportantStyles: <reason> */` comment on the line above rather
than changing the CSS.

- [ ] **Step 4: Confirm nothing changed behaviourally**

Run: `npm test 2>&1 | tail -5 && npm run build`
Expected: identical pass/fail counts to Step 1, and a clean build.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: apply Biome formatting across the repo"
```

---

### Task 5: Pricing drift test

**Files:**
- Create: `test/fixtures/known-models.json`
- Create: `test/pricing.test.js`

**Interfaces:**
- Consumes: `getRates(model, speed)` exported from `lib/core.js` — returns a
  `{input, output, write5m, write1h, read}` object, or `null` when the model ID
  matches no `PRICING` entry.
- Produces: `test/fixtures/known-models.json` with shape
  `{ priced: string[], intentionallyUnpriced: string[] }`. Phase 3's
  `loop-watchdog` reads this file to decide whether an observed model ID is new.

- [ ] **Step 1: Write the fixture**

These are the model IDs actually observed in real transcripts plus the two in
`demo/projects`. `<synthetic>` is Claude Code's marker for messages with no
model and no cost — it must stay unpriced, so it is listed separately rather
than omitted, or the watchdog would report it as a new ID forever.

```json
{
  "priced": [
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-fable-5",
    "claude-sonnet-5",
    "claude-haiku-4-5-20251001",
    "opus",
    "sonnet",
    "haiku"
  ],
  "intentionallyUnpriced": [
    "<synthetic>"
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `test/pricing.test.js`:

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { getRates } = require('../lib/core');

const known = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'known-models.json'), 'utf8')
);

// The rate each known model ID must resolve to. Written out per ID rather than
// derived, so a new PRICING entry that steals an existing ID's substring match
// fails here instead of silently repricing it.
const EXPECTED_INPUT = {
  'claude-opus-5': 5,
  'claude-opus-4-8': 5,
  'claude-fable-5': 10,
  'claude-sonnet-5': 2,
  'claude-haiku-4-5-20251001': 1,
  opus: 5,
  sonnet: 3,
  haiku: 1,
};

test('every known model ID resolves to a rate', () => {
  for (const id of known.priced) {
    const rates = getRates(id);
    assert.ok(rates, `${id} resolved to no pricing entry`);
    for (const key of ['input', 'output', 'write5m', 'write1h', 'read']) {
      assert.ok(rates[key] > 0, `${id}.${key} is not a positive rate`);
    }
  }
});

test('known model IDs resolve to the expected input rate', () => {
  for (const [id, expected] of Object.entries(EXPECTED_INPUT)) {
    assert.strictEqual(getRates(id).input, expected, `${id} input rate moved`);
  }
});

test('intentionally unpriced IDs stay unpriced', () => {
  for (const id of known.intentionallyUnpriced) {
    assert.strictEqual(getRates(id), null, `${id} unexpectedly resolved to a rate`);
  }
});

// Anthropic's cache rates are fixed multiples of the input rate. Asserting the
// multiples catches a typo in a single cache field, which no other test would.
test('cache rates hold their multiples of the input rate', () => {
  for (const id of known.priced) {
    const r = getRates(id);
    assert.strictEqual(r.write5m, r.input * 1.25, `${id} 5m cache-write multiple`);
    assert.strictEqual(r.write1h, r.input * 2, `${id} 1h cache-write multiple`);
    assert.ok(Math.abs(r.read - r.input * 0.1) < 1e-9, `${id} cache-read multiple`);
  }
});

test('every model ID in the demo fixtures is a known model', () => {
  const demoDir = path.join(__dirname, '..', 'demo', 'projects');
  const ids = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.jsonl')) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/"model":"([^"]*)"/g)) {
          ids.add(m[1]);
        }
      }
    }
  };
  walk(demoDir);
  assert.ok(ids.size > 0, 'no model IDs found in demo fixtures');
  for (const id of ids) {
    assert.ok(
      known.priced.includes(id) || known.intentionallyUnpriced.includes(id),
      `demo fixture uses unknown model ID ${id} — add it to known-models.json`
    );
  }
});
```

- [ ] **Step 3: Run it and confirm it passes against current pricing**

Run: `node --test test/pricing.test.js`
Expected: PASS, 5 tests.

If `claude-sonnet-5` fails on the input rate, that is the test doing its job —
see Step 4.

- [ ] **Step 4: Prove the test actually detects drift**

Temporarily change the `sonnet-5` entry in `lib/core.js:16` from `input: 2` to
`input: 3`.

Run: `node --test test/pricing.test.js`
Expected: FAIL on `claude-sonnet-5 input rate moved`.

Revert the change and re-run; expected PASS. **Do not commit the temporary edit.**

- [ ] **Step 5: Commit**

```bash
git add test/pricing.test.js test/fixtures/known-models.json
git commit -m "test: pin model pricing and cache-rate multiples against drift"
```

---

### Task 6: Playwright UI gate

**Files:**
- Create: `playwright.config.js`
- Create: `e2e/dashboard.spec.js`
- Modify: `package.json` (devDependencies, scripts)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `server.js` honouring `CLAUDE_PROJECTS_DIR` and `PORT`; `web/dist`
  built by `npm run build`.
- Produces: `npm run test:ui`. Task 7 composes it into `verify`.

The specs live in `e2e/`, not `test/ui/`, because `node --test` executes every
`.js` file under `test/` — a Playwright spec placed there is run by `npm test`
and fails. This was verified empirically before writing this plan.

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev --save-exact @playwright/test@1.62.1
npx playwright install chromium
```

- [ ] **Step 2: Write `playwright.config.js`**

```javascript
const { defineConfig, devices } = require('@playwright/test');

const PORT = 3457; // not 3456 — avoid colliding with a dashboard the dev is already running

module.exports = defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    {
      name: 'light',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
    },
    {
      name: 'dark',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
  ],
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      CLAUDE_PROJECTS_DIR: require('node:path').join(__dirname, 'demo', 'projects'),
    },
  },
});
```

`colorScheme` is set here rather than by driving the browser from the CLI: on
macOS a CLI-launched Chrome inherits the OS appearance and produces incorrect
light captures while the OS is in dark mode.

- [ ] **Step 3: Write the failing spec**

Create `e2e/dashboard.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');

const TABS = ['Overview', 'Breakdown', 'Advisor', 'Waste', 'Sessions'];

// Collect page errors and console errors for the whole test, then assert at the
// end — asserting eagerly inside the handler would report the failure against
// whichever step happened to be running.
function watchForErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test('dashboard renders against the demo fixtures', async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Claude Code Cost Dashboard' })).toBeVisible();

  // The demo fixtures contain priced messages, so a dollar amount must render.
  await expect(page.getByText(/\$\d/).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('every tab renders without errors', async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto('/');
  for (const label of TABS) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
  }

  expect(errors).toEqual([]);
});
```

- [ ] **Step 4: Add the script**

In `package.json`, in `"scripts"`, add:

```json
    "test:ui": "playwright test",
```

- [ ] **Step 5: Run it**

Run: `npm run build && npm run test:ui`
Expected: PASS, 4 tests (2 specs x light and dark).

If it fails because `web/dist/index.html` is missing, the build step was skipped
— `server.js` serves the built bundle, it does not build it.

- [ ] **Step 6: Prove the gate actually catches a UI regression**

In `web/src/App.jsx`, temporarily change the `<h1>` text
`Claude Code Cost Dashboard` to `Broken`.

Run: `npm run build && npm run test:ui`
Expected: FAIL on the heading assertion, in both the light and dark projects.

Revert the change, rebuild, re-run; expected PASS. **Do not commit the temporary edit.**

- [ ] **Step 7: Ignore Playwright's output directories**

Append to `.gitignore`:

```
test-results
playwright-report
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json playwright.config.js e2e .gitignore
git commit -m "test: add Playwright UI gate over the demo fixtures"
```

---

### Task 7: Compose `npm run verify` and wire CI

**Files:**
- Modify: `package.json` (scripts)
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `lint` (Task 3), `test` (existing), `test:ui` (Task 6).
- Produces: `npm run verify` — the single command the loop's Stop hook, the
  drafter, and CI all run. Phases 3-6 refer to it by name.

- [ ] **Step 1: Add the composed script**

In `package.json`, in `"scripts"`, add:

```json
    "verify": "npm run lint && npm test && npm run test:ui",
```

`build` is not part of `verify`: `test:ui` needs a built `web/dist`, and callers
build first. CI builds explicitly in Step 2.

- [ ] **Step 2: Wire CI**

In `.github/workflows/ci.yml`, replace the `Run tests` step:

```yaml
      - name: Run tests
        run: npm test
```

with:

```yaml
      - name: Install root dev dependencies
        run: npm ci

      - name: Install Playwright browser
        run: npx playwright install --with-deps chromium

      - name: Verify
        run: npm run verify
```

The existing `Install frontend deps` and `Build frontend` steps stay and stay
ahead of these — `test:ui` boots `server.js`, which serves `web/dist`.

- [ ] **Step 3: Run the whole gate locally**

Run: `npm run build && npm run verify`
Expected: PASS — lint clean, `node --test` green, 4 Playwright tests green.

- [ ] **Step 4: Commit and confirm CI is green**

```bash
git add package.json .github/workflows/ci.yml
git commit -m "ci: run lint, unit tests, and the UI gate as npm run verify"
```

Push the branch and confirm the CI run passes on both node 20 and node 22 before
starting Task 8. This is the gate everything after it depends on.

---

### Task 8: The `loop-pipeline` skill

**Files:**
- Create: `.claude/skills/loop-pipeline/SKILL.md`

**Interfaces:**
- Consumes: `npm run verify` (Task 7), `AGENTS.md` (Task 2), and the two agents
  from Task 9 by name (`loop-drafter`, `loop-verifier`).
- Produces: the shared lane mechanics. Phase 3's `loop-watchdog` and Phase 4's
  `loop-issue` call this instead of restating the pipeline.

- [ ] **Step 1: Write the skill**

Create `.claude/skills/loop-pipeline/SKILL.md`:

```markdown
---
name: loop-pipeline
description: >-
  The shared mechanics every loop lane repeats: dedup a finding, open an
  isolated worktree, hand the work to loop-drafter, run npm run verify, hand
  the diff to loop-verifier, open a draft PR, and append to .loop/log.md. Use
  when a loop lane skill (loop-watchdog, loop-issue) has decided a finding is
  real and needs it carried to a draft PR. Not a triage skill — it does not
  decide what is worth doing, only what happens next.
---

# Loop pipeline

You are carrying **one** finding from "decided" to "draft PR waiting for a
human". You do not decide whether the finding is worth doing — the calling lane
skill already did.

## Hard stops

- Never merge a PR. Never commit or push to `master`.
- Never run `npm publish` or `vsce publish`, and never invoke `/release`.
- Open exactly one PR, as a **draft**.
- If `npm run verify` cannot be made green, stop and report. Do not weaken a
  test, disable a lint rule, or edit a screenshot baseline to pass.

## Steps

1. **Dedup.** Read `.loop/log.md` and run
   `gh issue list --label loop:watchdog --label loop:audit --state all --json number,title`.
   If this finding was already filed or already judged not worth filing, append
   a one-line note to `.loop/log.md` saying so and stop.

2. **Isolate.** `git worktree add ../cccost-loop/<slug> -b loop/<slug>` from
   the current `master`. All work happens in that worktree.

3. **Draft.** Hand the finding to the `loop-drafter` agent with: the finding,
   the acceptance criteria, and the path to `AGENTS.md`. For a bug, the criteria
   must include a test that fails before the fix and passes after.

4. **Verify.** Run `npm run build && npm run verify` in the worktree. If it
   fails, hand the failure back to `loop-drafter` once. If it fails again, stop
   and report — two failed attempts means the finding is not as understood.

5. **Review.** Hand the diff (`git diff master...HEAD`) to the `loop-verifier`
   agent along with `AGENTS.md`. Record its verdict; it cannot edit anything.

6. **Publish.** `gh pr create --draft`, with the verifier's verdict in the body
   and a link to the originating issue.

7. **Log.** Append to `.loop/log.md`: the date, the finding, what was done, the
   verifier's verdict, and the PR number. Commit that on the `loop/<slug>`
   branch — never on `master`.

8. **Clean up.** `git worktree remove ../cccost-loop/<slug>` once the branch is
   pushed.

## `.loop/log.md` entry format

```
## YYYY-MM-DD <lane>

- **Finding:** one line
- **Action:** filed #N / PR #N / no action
- **Why:** one line — especially when the action was "no action", since that is
  what stops this finding being re-reported tomorrow
```
```

- [ ] **Step 2: Create the log file the skill depends on**

```bash
mkdir -p .loop
cat > .loop/log.md <<'EOF'
# Loop log

The loop's running memory. Every run appends here, whether or not it filed
anything — the "no action" entries are what stop a finding being re-reported.

Format is defined in `.claude/skills/loop-pipeline/SKILL.md`.
EOF
```

- [ ] **Step 3: Verify**

Run: `head -5 .claude/skills/loop-pipeline/SKILL.md && test -f .loop/log.md && echo ok`
Expected: valid frontmatter with `name: loop-pipeline`, then `ok`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/loop-pipeline .loop/log.md
git commit -m "feat(loop): add loop-pipeline skill and the loop log"
```

---

### Task 9: The drafter and verifier agents

**Files:**
- Create: `.claude/agents/loop-drafter.md`
- Create: `.claude/agents/loop-verifier.md`
- Create: `.claude/settings.json`

**Interfaces:**
- Consumes: `AGENTS.md`, `npm run verify`.
- Produces: agents `loop-drafter` and `loop-verifier`, referenced by name from
  `loop-pipeline` (Task 8) and from Phases 3-6.

Agent frontmatter fields are `name`, `description`, `tools` (comma-separated),
and `model`.

- [ ] **Step 1: Write the drafter**

Create `.claude/agents/loop-drafter.md`:

```markdown
---
name: loop-drafter
description: Implements ONE loop finding in a git worktree against explicit acceptance criteria. Runs unattended — no human will answer questions. Used by the loop-pipeline skill.
tools: Read, Edit, Write, Bash, Grep, Glob
---

You implement one finding, in the worktree you are given, against the acceptance
criteria you are given. You run unattended: no human will answer a question, so
decide with a defensible default, write the assumption into the PR body, and
proceed.

Read `AGENTS.md` before your first edit. It is the contract for this repo.

## Method

For a bug: write the failing test first, run it and watch it fail, then write
the smallest fix that makes it pass. A fix without a test that would have caught
the bug is not finished.

For anything else: make the smallest change that satisfies the criteria.

Run `npm run build && npm run verify` before you report done.

## You may not

- Merge a PR, or commit or push to `master`.
- Run `npm publish` or `vsce publish`.
- Edit a committed screenshot baseline.
- Weaken, skip, or delete a test, or disable a lint rule, to get to green. If
  the gate will not go green honestly, stop and report why.
- Change anything outside the finding's scope. Notice unrelated problems, report
  them, leave them alone.
```

- [ ] **Step 2: Write the verifier**

Create `.claude/agents/loop-verifier.md`:

```markdown
---
name: loop-verifier
description: Adversarially reviews a loop-produced diff, spec, or plan against AGENTS.md and the tests, and returns a verdict. Read-only by construction — it reports, it never repairs. Used by the loop-pipeline skill.
tools: Read, Grep, Bash
---

You judge work you did not do. You have no Edit or Write tool, deliberately: you
cannot fix what you are judging, so you cannot approve your own repair.

Read `AGENTS.md` first. It is the standard you judge against.

## What to attack

- **Correctness.** Find the input that breaks it. A test that passes is not
  evidence the behaviour is right.
- **Scope.** Does the diff do only what the finding asked? Every changed line
  should trace to it.
- **Test quality.** Would this test have failed before the change? If it would
  have passed either way, it proves nothing. Check by reasoning about the diff,
  not by editing.
- **Convention.** Does it violate anything in `AGENTS.md` — CommonJS vs ESM,
  the node floor, hand-edited `web/dist`, a pricing change that did not update
  `test/fixtures/known-models.json`?
- **Gate integrity.** Was a test weakened, skipped, or deleted, or a lint rule
  disabled, to reach green? Say so loudly; that is the worst finding available.

## Verdict

End with exactly one of `PASS`, `REVISE`, or `BLOCK`, then the reasons, most
severe first. Cite `file:line`. If you are uncertain whether something is a real
defect, say so rather than padding the list — a verdict nobody trusts is worse
than a short one.

## You may not

Merge a PR, push anything, run `npm publish` or `vsce publish`, or apply a
`loop:go` / `loop:build` label. You report; a human decides.
```

- [ ] **Step 3: Write the hooks**

Create `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npm run lint --silent",
            "timeout": 60
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "in=$(cat); f=$(jq -r '.tool_input.file_path // \"\"' <<<\"$in\"); case \"$f\" in *–/web/src/*) echo 'web/src changed — npm run test:ui must pass before this is done.' ;; esac; exit 0",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Note the shape difference, which is verified rather than assumed: **`Stop` takes
no `matcher`** — only `PostToolUse` and `PermissionRequest` do. A `matcher` key
on a `Stop` entry is wrong. The `PostToolUse` matcher matches **tool names**,
not paths, so the path test happens inside the command by reading the hook's
JSON on stdin.

The Stop hook runs only the cheap half of the gate. `npm run verify` is not used
here — it boots a browser, which is far too slow to run on every stop. The full
gate runs in `loop-pipeline` step 4 and in CI.

- [ ] **Step 3b: Fix the placeholder in the PostToolUse pattern**

The `case` pattern above contains a literal `–` placeholder so it cannot silently
match everything if copied wrong. Replace `*–/web/src/*` with `*/web/src/*`, then
verify the hook fires:

Run: `echo '{"tool_input":{"file_path":"/x/web/src/App.jsx"}}' | jq -r '.tool_input.file_path'`
Expected: `/x/web/src/App.jsx`. Then edit any file under `web/src/` in a session
and confirm the reminder appears; edit a file under `lib/` and confirm it does not.

- [ ] **Step 4: Verify the agents are visible**

Run: `ls .claude/agents && head -5 .claude/agents/loop-verifier.md`
Expected: both files listed, valid frontmatter with `tools: Read, Grep, Bash`.

In a Claude Code session, both agents appear in the available agent types, and
`loop-verifier` shows exactly three tools.

- [ ] **Step 5: Prove the verifier cannot edit**

Dispatch `loop-verifier` against any small diff and ask it to fix what it finds.
Expected: it reports the problem and states it cannot edit — it has no Edit or
Write tool. This is the enforcement the whole design rests on; confirm it rather
than assuming it.

- [ ] **Step 6: Commit**

```bash
git add .claude/agents .claude/settings.json
git commit -m "feat(loop): add loop-drafter and loop-verifier agents"
```

---

## Deviations from the spec

Two, both forced by things found while writing this plan rather than by
preference. Both are worth a look before execution starts.

1. **Playwright specs live in `e2e/`, not `test/ui/`.** The spec put them under
   `test/ui/`. `node --test` executes every `.js` file under `test/` — verified
   empirically — so a spec placed there is run by `npm test`, outside Playwright,
   and fails.

2. **No committed screenshot baselines in this phase.** The spec called for
   baselines under `test/ui/__screenshots__/`. The dashboard renders
   date-dependent views (`localDate` buckets by machine timezone, and the report
   month defaults to the current month), so pixel baselines would drift on a
   calendar boundary and produce failures unrelated to any change. This phase
   gates on DOM assertions plus zero console/page errors in both colour schemes,
   which catches the regressions that matter without the churn. Pixel baselines
   can be added later against a frozen clock.

## Done when

- `npm run build && npm run verify` is green locally and on CI for node 20 and 22.
- A fresh clone contains `.claude/skills/`, `.claude/agents/`, `AGENTS.md`, and
  `.loop/log.md`; only `.claude/settings.local.json` is ignored under `.claude/`.
- `/release` and `/issue-to-pr` still run when typed and cannot be model-invoked.
- `loop-verifier` demonstrably cannot edit.

Phase 3 (`loop-watchdog` + local cron) gets its own plan, written once the local
scheduling mechanism is confirmed rather than assumed.
