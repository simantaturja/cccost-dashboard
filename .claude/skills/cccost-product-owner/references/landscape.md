# Competitive landscape (compiled 15 Jul 2026)

The field cccost-dashboard competes in. Use it for competitive teardowns, gap
scans, and positioning. **It goes stale fast** — the category and Anthropic's
limits/pricing move monthly. Re-verify any fact that decides something, and fold
updates back in. Confidence is flagged; distrust the flagged items.

> Fuller, cited version: the research artifact
> `https://claude.ai/code/artifact/3837aa6b-0742-4f3d-88e6-a1aac3027219` and source
> HTML at `scratchpad/cccost-landscape.html`. Sources are inline below too.

Contents: 1) Executive read · 2) Competitor table · 3) Feature matrix · 4) Top-10
gaps · 5) Differentiated vs commodity · 6) Time-sensitive facts · 7) Confidence.

## 1. Executive read

1. **ccusage owns the category.** ryoppippi's CLI (~17k★, MIT, reads local JSONL,
   prices from the LiteLLM sheet). Almost every other local tool wraps or copies
   it; expanded to ~15 agent CLIs (Codex, Gemini CLI, Copilot CLI — **not Cursor**).
2. **The loudest unmet need is subscription ROI, not raw cost.** Pro/Max users
   aren't billed per token, so the API-equivalent dollar figure every tool shows is,
   in users' words, *"mathematically true but economically misleading."* Translating
   tokens into **plan-relative value** is the clearest open lane — and it's cccost's
   whole premise, so this is validation, not just an idea.
3. **Proxies don't serve subscription users — and now can't.** LiteLLM / Helicone /
   Portkey / Requesty are API-key/BYOK. Routing Pro/Max OAuth through a third-party
   proxy **violates Anthropic ToS, enforced since Jan 2026**. The only ToS-clean
   subscription paths are **local-log parsing and built-in OpenTelemetry** — exactly
   cccost's lane. This is a moat by regulation, not just by design.
4. **Anthropic is encroaching from below.** Built-in `/usage` (absorbed `/cost`)
   now shows plan bars and attributes usage to **skills / subagents / plugins / MCP**
   as %. Free, zero-install, improving — **the single biggest strategic risk**. But
   it is single-machine, point-in-time, terminal-only, with no history, trends,
   advisor, or plan-ROI. Anything that merely duplicates `/usage` loses to the
   default.
5. **The defensible bundle:** per-prompt attribution + efficiency advisor + subagent
   cost accounting in a GUI + plan-ROI framing, as one local, subscription-aware
   dashboard. The commodity parts (daily/monthly totals, 5-hr blocks,
   per-project/model, statusline, being local) are already saturated.

## 2. Competitor table

Grouped by **data-source type** — the category's sharpest differentiator.
`LOG` = local JSONL · `API` = Anthropic endpoint · `PROXY` = inline gateway ·
`OTEL` = telemetry export.

### Local-log tools — the direct peer set

| Tool | Standout | Notable gaps |
|---|---|---|
| **ccusage** (ryoppippi) · LOG · Free/MIT/npx | Daily/weekly/monthly/session; `blocks` (5-hr) w/ burn-rate + projection; statusline; MCP server; JSON out; per-model; ~15 agent CLIs | CLI only (no GUI); cost is an *estimate*; no advisor, no plan-ROI, **no per-prompt (rejected #935)**, no Cursor |
| **Claude-Code-Usage-Monitor** (Maciek-roboblog) · LOG · Free/MIT | Real-time Rich TUI; burn-rate; **P90 ML limit prediction**; plan auto-detect; reads statusline `rate_limits`; v4.0.0, ~8.4k★ | Terminal only; single-machine; no per-project/prompt cost history; excludes Cursor/Desktop |
| **opcode** (getAsterisk, ex-"Claudia") · LOG · AGPL-3.0 | Tauri desktop app; usage dashboard w/ real-time cost + token analytics by model/project/time; ~22k★ | Build-from-source; cost is one feature among many; AGPL |
| **phuryn/claude-usage** · LOG · Free/MIT · **closest direct overlap** | `localhost:8080` dashboard, Chart.js, per-model + per-project, Pro/Max bar, date ranges; **ships as web app AND VS Code ext**; ~1.6k★ | No advisor / per-prompt / subagent / plan-ROI depth; single-machine |
| **VS Code exts** (Clusage, Yahya Shareef ~9k, Claude Status, …) · LOG/API · Free | Status-bar cost/quota; dashboards; budget alerts + heatmap (Claude Status) | Fragmented, thin; none do advisor/ROI |
| **Argus** (yessGlory17) · LOG · Free | Live session debugger; costs every tool call; named rules — `DuplicateReadRule`, `UnusedReadRule`, `RetryLoopRule`, `FailedToolRule`, `ContextPressureRule`, `CompactionDetectedRule` — with per-step/session $ (verified Jul 2026, appears shipped after mid-2026) | **Live/single-session only** — no history, trends, per-project rollup, or advisor/ROI. **Closest competitor to a tool-level "loop tax" feature**; cccost's only opening vs it is *retrospective + cross-session patterns + per-project/client*, not the idea itself |
| **Sniffly** (chiphuyen) · LOG · Free/MIT | Local analytics for mistakes & usage patterns; shareable | **Does not track cost/tokens** as a primary metric |

### Built-in / first-party (Anthropic)

| Tool | Standout | Notable gaps |
|---|---|---|
| **`/usage`** (was `/cost`) · LOG · Included | Plan usage bars (5-hr + 7-day); attributes usage to **skills/subagents/plugins/MCP** as %; 24h/7d toggle; `/usage-credits` cap | Single-machine, point-in-time, terminal only; **no history/trends/export/advisor/plan-ROI**; session $ "intended for API users" |
| **OpenTelemetry** (`CLAUDE_CODE_ENABLE_TELEMETRY`) · OTEL · Included + backend cost | Exports `claude_code.cost.usage` / `.token.usage` + per-user attrs → Prometheus/Grafana/Datadog; **works with subscription auth**; MDM-distributable | Heavy setup; you build the dashboards; imputed estimate, not a real bill |
| **Console Usage & Cost + Admin API** · API · Included for API orgs | Usage/cost by model/workspace/key; CSV; real USD | **API billing only — subscription Claude Code usage never appears**; Admin key; org-only |

### Proxy / gateway — team/org, API-key oriented (ToS-blocked for subscription auth)

LiteLLM (BerriAI) · Helicone · Portkey · Requesty · Bifrost (Maxim AI). Virtual
keys, per-key/user/team budgets, pre-spend enforcement, spend logs. All are
**API-key/BYOK**; the subscription-OAuth-forwarding recipe **now violates ToS**.
Not options for the wedge user — but the reference for what "budgets/alerts/team
rollup done right" looks like.

### FinOps / adjacent / cross-tool

- **Torii** (commercial, launched May 2026) — per-employee/per-model + **overage
  forecasting before the invoice**; enterprise-scale.
- **Mavvrik**, **OpenMeter→Kong Metering** — cost-allocation / metering infra, not
  Claude-Code-specific, no subscription capture.
- **Cursor / Copilot / Codex / Gemini** first-party views — each has a usage view
  (Copilot metrics dashboard+API GA **27 Feb 2026**); single-vendor, seat/credit
  oriented; **none aggregate across vendors**.
- **Cross-tool trackers** (TokenTracker, CodeBurn, codeledger, tokscale) — one
  dashboard across many agents; but for subscriptions show **estimated** cost only;
  newer, breadth-over-depth.
- **viberank** (+ CCWarriors, Straude) — leaderboard fed by `ccusage --json`;
  bragging rights, not personal analytics.

## 3. Feature matrix (● full · ◐ partial · ○ none)

cccost marks = **intended scope**, not necessarily shipped state.

| Dimension | ccusage | `/usage` | OTel | Usage-Monitor | phuryn/opcode | Proxy | **cccost** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Local, zero-setup | ● | ● | ○ | ● | ● | ○ | **●** |
| Per-project rollup | ● | ○ | ◐ | ○ | ● | ◐ | **●** |
| Per-model breakdown | ● | ◐ | ● | ● | ● | ● | **●** |
| **Per-prompt attribution** (ccusage #935 rejected) | ○ | ○ | ◐ | ○ | ○ | ○ | **●** |
| **Subagent cost attribution** | ○ | ◐ | ◐ | ○ | ○ | ○ | **●** |
| Spend-over-time / trends | ◐ | ○ | ● | ◐ | ● | ● | **●** |
| Live burn-rate & limit prediction | ◐ | ◐ | ○ | ● | ○ | ○ | **◐** |
| 5-hour session blocks | ● | ● | ○ | ● | ◐ | ○ | **●** |
| Weekly-cap tracking | ◐ | ● | ○ | ● | ◐ | ○ | **●** |
| Budgets / alerts | ○ | ◐ | ◐ | ◐ | ◐ | ● | **◐** |
| **Efficiency advisor** ("why you burn tokens") | ○ | ○ | ○ | ○ | ○ | ○ | **●** |
| **Model-mix optimization advice** | ○ | ○ | ○ | ○ | ○ | ○ | **●** |
| Cache analytics | ◐ | ○ | ◐ | ◐ | ○ | ◐ | **●** |
| **Plan-ROI framing** | ◐ | ○ | ○ | ○ | ○ | ○ | **●** |
| Team / multi-seat rollup | ○ | ○ | ● | ○ | ○ | ● | **○** |
| Cross-tool aggregation | ● | ○ | ○ | ○ | ○ | ◐ | **○** |
| MCP / statusline / editor integration | ● | ◐ | ○ | ○ | ◐ | ○ | **◐** |
| Export / reporting | ● | ○ | ● | ◐ | ◐ | ● | **◐** |

Read the columns of ○: **the whole field is blank on advisor and model-mix advice**
— nobody automates "why you're burning tokens." That, per-prompt, and plan-ROI are
the rows where cccost is alone. The ○ in cccost's own column (team, cross-tool) are
the open strategic questions, not necessarily gaps to fill.

## 4. Top-10 gaps in the category (ranked by evidence)

1. **Subscription ROI — "am I getting my money's worth?"** *(very strong, but framing
   contested)* API-equivalent figure is ambiguous to subscribers. HN: *"my Claude Code
   spend last month is $131. It cost me $20."* Nobody translates to plan-relative value.
   ⚠ The stronger "the $ figure is *economically misleading*" framing is **NOT
   consensus** — productcompass (Apr 2026) frames API-equiv $ as a *valid* value-demo
   ("15-30× cheaper than API"). So: demand for plan-relative context is real; demand to
   *replace/reframe* the $ as misleading is unverified. Keep the $, add context — don't
   build on the "misleading" premise.
   `news.ycombinator.com/item?id=47701637`, `.../44610925`, `productcompass.pm/p/claude-code-pricing`
2. **Unexpected caps + cross-surface attribution** *(very strong)* `/usage` shows
   "$0.76" yet "session 100% used"; quota drains "without any activity"; users want a
   breakdown **by product surface** (Code vs Desktop vs claude.ai vs Chrome).
   `github.com/anthropics/claude-code/issues/54750`, `/41084`, `/57547`
3. **Per-prompt / per-message cost attribution** *(strong)* Explicitly requested and
   **closed unbuilt**: ccusage #935. Documented demand the leader walked away from.
   `github.com/ryoppippi/ccusage/issues/935`
4. **"Where did it go" — loop vs. work, per-turn** *(strong)* Counters say *what* you
   spent, not *where*: orchestration loop re-reading context vs real work, when cost
   accelerated, whether the last N turns bought anything. One session was "100% loop
   tax." `agenticcontrolplane.com/blog/claude-code-cost-tracking`
5. **Real-time "how close am I to the limit?"** *(strong)* Founding motivation of
   Usage-Monitor (245 pts Show HN). Served only by a terminal tool — no calm,
   always-on GUI. `news.ycombinator.com/item?id=44317012`
6. **Per-dev / per-team / per-project rollup** *(strong)* "Billing shows total spend
   but not by developer, team, or project." Clearest **structural** gap — but a team
   feature, adjacent to the solo wedge. `worklytics.co/blog/tracking-claude-code-usage`
7. **Subagent / parallel-agent cost attribution** *(strong, emerging)* "Ten agents
   in parallel use quota ten times faster"; failed subagents get silently retried —
   you pay for failure + redo. `/usage` shows a % split but no history/GUI.
   `cloudzero.com/blog/claude-code-agents`, `code.claude.com/docs/en/costs`
8. **Cache analytics surfaced as insight** *(medium-strong)* ">90% of tokens in
   heavy sessions are cache reads" — the main reason subscription value is high — yet
   buried in a total. "Is caching working?" is invisible. `buildthisnow.com`, `agenticcontrolplane.com`
9. **Automated efficiency & model-mix advice** *(medium)* Routing is the biggest
   lever ("60-80% cost optimization"); users reason manually. Non-obvious truths
   (thinking tokens 50-70% of spend; Sonnet can exceed Opus past 5-8 steps) surfaced
   by nobody. `mindstudio.ai/blog/claude-code-advisor-strategy`
10. **Cross-tool actual-spend reconciliation** *(medium, synthesis)* Aggregators
    unify usage across agents but show only an *estimate* for subscriptions. The
    local-log × subscription-aware × cross-tool intersection is unserved. `ccusage.com/guide/codex`

Note the pattern: gaps 1, 3, 4, 7, 8, 9 all live in cccost's lane and mostly in log
data cccost already has or can parse. Gaps 6 and 10 are the wedge-challenging ones
(team / cross-tool) — real, but a repositioning.

## 5. Differentiated vs commodity

**Differentiated / defensible — ship the bundle, not the plumbing:**
- **Per-prompt cost attribution** — demand the market leader closed unbuilt.
- **Efficiency advisor** — no tool automates "you're burning tokens because X"
  (Argus flags waste live but doesn't advise or cost it).
- **Plan-ROI framing** — the distrust of the raw $ number *is* the opening: reframe
  as plan-relative value / effective discount / headroom to the cap, not a scary $.
- **Subagent cost accounting in a GUI** — `/usage` shows a live % only; historical,
  per-project GUI view is open.
- **The bundle + the lane** — all of it as one local, zero-setup, subscription-aware
  dashboard: the niche proxies can't touch (ToS) and Console can't see.

**Undifferentiated / commodity — table-stakes, not a selling point:**
- Daily/monthly/session totals, 5-hr blocks (owned by ccusage).
- Per-project / per-model breakdown (ccusage, opcode, phuryn).
- Being local / MIT / reads `~/.claude` (the peer-set default).
- Live burn-rate & P90 prediction (Usage-Monitor leads; match, don't lead).
- A local web GUI (phuryn/claude-usage is near-identical; opcode owns desktop).

**Strategic risk:** built-in `/usage` is free, zero-install, and moving into this
space. Stay ahead only on the advisor / plan-ROI / historical-attribution layer —
exactly what Anthropic has *not* shipped and structurally won't prioritize.

## 6. Time-sensitive facts (verify live via in-product `/usage`)

- **28 Jul 2025 → eff. 28 Aug 2025** — weekly rate limits added for Pro/Max (one
  overall + one model-specific), "<5% of subscribers" affected (official).
- **⚠ Discrepancy** — 2025 announce framed the 2nd weekly cap as **Opus-specific**;
  the 2026 Max help page says **Sonnet-only**. Genuinely conflicting — confirm.
- **6 May 2026** — 5-hour caps **doubled**; peak-hour throttling removed (secondary).
- **⚠ 13 May → "through 13 Jul 2026"** — weekly limits +50% (temporary). Today is
  **15 Jul 2026 → likely just lapsed.** Recheck.
- **Jan 2026 enforced / ~20 Feb clarified** — Anthropic actively enforcing its ban
  on routing Free/Pro/Max OAuth through third-party tools. This is what removes
  proxies for subscription users.
- **27 Feb 2026** — GitHub Copilot usage-metrics dashboard + API went GA.
- **Prices stable 2025→2026: Pro $20 · Max $100 · Max $200.** All churn is in
  *limits*, not price. Benchmark: ~$6/dev/day on Sonnet (90% under $12).

## 7. Confidence

- **High:** ccusage mechanics; subscription usage absent from Console; `/usage` &
  OTel behaviour (Anthropic docs); proxy ToS ban enforced since Jan 2026; weekly-
  limit dates + "<5%".
- **Flagged / distrust:** Reddit was crawler-blocked — sentiment is second-hand (HN
  + GitHub issues substituted); the Opus-vs-Sonnet 2nd-cap wording is unresolved; the
  +50% promo likely lapsed; star/version/install counts are point-in-time; May-2026
  limit changes and LiteLLM enterprise pricing are secondary-sourced.
