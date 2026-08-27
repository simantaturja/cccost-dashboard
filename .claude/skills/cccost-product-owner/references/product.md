# The product, as it is today

Ground truth for `cccost-dashboard`. Read this before proposing anything so ideas
land on the real product, not an imagined one. When the code changes, update this
file — a product owner reasoning from a stale map ships bad calls.

## One line

A local, zero-setup dashboard that shows a Claude Code user **where their tokens
and money go** — per project, per model, and **per prompt**, over time — plus an
efficiency advisor that flags likely overspend.

## Who it is for (the wedge)

The **solo developer or consultant on a Claude subscription** (Pro / Max), not an
org buying raw API credits.

Why this matters more than any feature: on a subscription you are **not billed per
token**. Cost is invisible. You cannot tell whether you are getting your money's
worth, which project or client is eating your quota, or which prompts are wasteful.
The dashboard's whole reason to exist is to make that invisible value **visible and
attributable** — and to advise where it is being wasted.

## The value figure is not invoice money (the central credibility tension)

Costs shown are **API-equivalent value** at current Anthropic pricing. On a
subscription they are **not what you are billed and not what you saved** — nobody
paid per token. A skeptic can fairly call the headline "$X,000 of value" and the
plan-ROI multiple a rationalization engine, and call the advisor's "$12 wasted"
doubly fake (the money was neither spent nor saved).

The honest position the product must hold: the number is valid for **relative**
decisions — which client/project ate my capacity, which prompts are heavy, should I
move Pro→Max — and **invalid** for absolute "savings" or bragging. Any feature that
leans on the dollar figure (advisor, ROI, reports) has to reconcile with this or it
erodes trust. When the user hasn't set `config.json`, `roi` falls back to a
**default $200** plan price — so the multiple is only right for a Max-$200 user. The
payload now marks this (`roi.configured: false`) and the Overview labels the plan
price "(default)" with a hint to set it, so an unconfigured Pro ($20) user isn't
shown a silently-10×-off number as if it were authoritative. Still: the multiple is
default-based until the user configures their real plan.

## What it does today

Data source: Claude Code already writes one JSONL file per session under
`~/.claude/projects/`. The tool reads those files. **No API key, no proxy, no
account, no telemetry, no outbound network.** There is no cost field in the logs —
cost is *computed* from each assistant message's `usage` and a pricing table.

| Surface | Shows |
|---|---|
| **Overview** | Total cost, total tokens, cache savings, **plan-ROI multiple** (value ÷ subscription price), a spend chart with Day/Week/Month toggle, downloadable monthly total report. |
| **Breakdown** | Cost by project and by model (with cache-read %). |
| **Advisor** | Sessions flagged for likely overspend (rules below). |
| **Sessions** | Sortable session list; expand a row for a **per-prompt timeline** and per-model split; filter by project. |
| **VS Code extension** | The dashboard in a panel + a status-bar item showing today's spend. Desktop VS Code only (needs local filesystem). |
| **JSON/MD API** | `/api/data` (full aggregate, no prompt text), `/api/report?month=` (markdown total), `/api/session?key=` (per-prompt timeline, read on demand). |

### The efficiency advisor (three hand-picked heuristics)

Treat these as a "look here first" signal, not a verdict. Rules, from `lib/core.js`:

| Rule | Fires when | Meaning |
|---|---|---|
| Low cache hit ratio | cost ≥ $1 **and** cache-read < 50% of input-side tokens | Context rebuilt instead of served from cache (reads ~10× cheaper). |
| Premium model, short session | used a top-tier model **and** < 20 messages | Short task rarely needs the priciest model. Est. saving = `premiumCost × 0.7`. |
| Subagent-heavy | cost ≥ $5 **and** subagents > 60% of cost | Fan-out overhead — did the delegation earn its cost? |

Known weaknesses (a good PO does not pretend these away): a low cache ratio is
often not the user's fault (5-min cache TTL, `/clear`, idle gaps); the saving
estimate assumes the task would have succeeded on a cheaper model; the cutoffs
produce false positives. The premium-model rule flags any model priced at the top
input rate in `PRICING` (currently `fable-5` / `mythos-5`), matched against the
table rather than a hard-coded name. Improving the advisor's *precision and
trustworthiness* — and reframing its dollars as "quota/capacity waste" rather than
"$ saved" given the flat subscription — is itself a product surface.

## What signal actually exists in the logs (the feasibility gate)

Every feature is bounded by what the JSONL files contain. Before proposing a
feature, ask "is the signal there?" — but classify honestly into **three** buckets,
because the richest opportunities sit in the middle one.

**(a) Surfaced today** — already parsed and shown: per-message `model` and token
`usage` (`input`, `output`, `cache_creation` split 5m/1h when present,
`cache_read`); `timestamp`; `message.id` (streaming rewrites the same id — last
wins); `cwd` → project; user **prompt text** (per-prompt timeline only, never
priced, never in `/api/data`); subagent/workflow transcripts merged into the parent
session with a `subagentCostUSD` share.

**(b) In the logs but currently unparsed** (the untapped seam — the parser reads
only `usage` today, so these are *feasible from the existing data source*, not new
data):
- **`tool_use` / `tool_result` blocks**, including `is_error` — cost per tool,
  token waste from failed/retried tool calls, read-vs-write tool mix. (Proof they
  exist: `promptTextOf` explicitly filters "tool_result-only" user messages.)
- **Per-turn / per-session timing** — session *span*, time-of-day patterns, gaps
  and cadence between prompts (from `firstTimestamp`/`lastTimestamp` and per-turn
  timestamps). Enables "cost per working hour," "when do I burn the most."
- Edit/file targets referenced inside tool_use content.

**(c) Genuinely absent** — needs a new data source; features here require a pivot or
must be cut: real invoice / subscription-usage / rate-limit / quota state;
active-vs-idle time *within* a session; task success/failure labels; git diffs;
anything about other tools (Cursor, Copilot, Codex).

A feature that needs (c) needs a new source — say so explicitly. A feature that
needs only (b) is buildable now; do not mistake it for (c).

## Non-goals — two tiers (know which you are touching)

Not everything the product "doesn't do" is equally sacred. Separate them:

**Strategic commitments — product law. Bending one is a deliberate repositioning,
argued on its own merits, not a feature:**
- **Privacy / no telemetry / no silent network.** Binds to localhost; reads local
  files; nothing phones home. (A *user-initiated* export or report leaving the
  machine is not a violation — telemetry is.)
- **No account, no login, no cloud backend.**
- **Personal tool** — serves one user's own data, zero-setup. (Merging a few
  people's *local* logs into one view for a consultant is a real adjacent question,
  not automatically off-limits — see the wedge discussion in SKILL.md.)

**Implementation stances — current engineering defaults. The PO does NOT own these
and may question them freely when they block a wedge-serving idea:**
- **No database** (everything derived from JSONL per request). A local cache for
  speed would not betray the wedge.
- **No live streaming** (refresh to update). A near-live status-bar gauge already
  ships as "today's spend," so "more live" is a design question, not heresy.
- **No historical pricing** (one current table; old months restated at today's
  rates).

## First-party platform risk (the durability lens)

The product is a parasite on Claude Code's log format and Anthropic's pricing, and
Anthropic **already ships `/cost` and `/usage`**. Two consequences a PO must hold:

- **Durable features are the ones the first party structurally won't build** —
  opinionated advice, consultant/client attribution, privacy-maximal local-only,
  cross-project rollups. Basic totals are dead on arrival; Anthropic will fold them
  into `/cost`.
- **Data-source fragility is a standing risk** — a JSONL schema change or usage
  obfuscation can break the product overnight. Weigh how exposed each feature is.

## Delivery, sustainability & how success is even measured

Small OSS project, effectively a solo maintainer. Distribution: `npx
cccost-dashboard`, global npm, and a VS Code Marketplace extension. Stack: zero-dep
Node backend (`lib/core.js` pure + tested, `server.js` built-ins only) + a Vite 8 /
React 19 SPA. Node ≥ 20.19.

Consequences the PO cannot ignore:
- **Surface area is expensive and forever.** Polish and a tight, trustworthy
  feature set beat a broad one. Prefer deepening the advisor/attribution moat over
  widening the product.
- **Success is not measurable in-product** — no telemetry, by design. The only real
  signals are **npm downloads, GitHub stars/issues/PRs, and Marketplace
  installs/ratings**, plus the maintainer dogfooding their own data. Bets are
  validated by community feedback, not analytics.
- **Sustainability is a human decision, not a silent PO call.** Options (goodwill,
  sponsors, a paid tier that would fight the no-account ethos, a consulting funnel,
  an MCP server as distribution into other agents) should be *surfaced* for the
  maintainer to choose — default stance: optimize for adoption + low maintenance
  unless the maintainer decides otherwise.
