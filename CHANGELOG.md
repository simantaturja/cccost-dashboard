# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versioning follows
[SemVer](https://semver.org/).

## [2.3.1] - 2026-09-08

### Fixed
- Claude Fable 5.1 sessions are now priced. The model matched no pricing entry,
  so every Fable 5.1 message was counted at $0 and listed under unknown models.
  It bills at the Fable 5 rates, with the cheaper 0.025x cache-read rate that
  Fable 5.1 actually charges.

## [2.3.0] - 2026-08-25

### Fixed
- Claude Sonnet 5 usage was billed at $3/$15 per million tokens. The correct
  rate is $2/$10 — the launch pricing is now the standard price — so every
  Sonnet 5 figure in the dashboard was 1.5x too high. Sonnet 4.6 and 4.5 were
  always correct and are unchanged.
- Fast-mode messages are now priced at the premium fast-mode rate ($10/$50 per
  million tokens for Opus) instead of the standard rate, so a session run with
  `/fast` is no longer undercounted by half.

### Added
- A token mix bar on the overview, splitting your total token volume into
  input, output, cache writes, and cache reads — so the cheap bulk (cache
  reads) is separated from the fresh context you pay full rate for.

### Changed
- The JSON API returns `summary.tokenMix` (input / output / cacheWrite /
  cacheRead) in place of `summary.cacheReadTokens`.

## [2.2.0] - 2026-07-19

### Changed
- Visual redesign — "The Instrument" direction. Moved to Tailwind CSS v4;
  IBM Plex Sans/Mono type, a signature graticule tick ruler, and categorical
  dataviz colors (validated for light and dark) replace the prior statement
  palette.

### Added
- Sessions tab now shows cost as a magnitude bar (not just a number) at every
  level: the session list, the per-model breakdown in a session's detail, and
  the per-prompt timeline — so the expensive session, model, or prompt jumps
  out visually instead of requiring digit-scanning. The per-prompt bar is
  stacked to show subagent cost separately from direct cost.

## [2.1.0] - 2026-07-17

### Changed
- Visual redesign — "The Statement" direction. The Overview now leads with the
  ROI multiple as the headline: a gold API-equivalent-value figure beside a
  value-bar showing return on your plan against a break-even marker. Deeper
  surfaces, layered shadows, and a warm statement palette (gold reserved for
  value, emerald for money saved) replace the flat single-accent look. Light
  and dark are both hand-tuned.

### Added
- Breakdown charts — the tab now leads with visuals before the detail tables:
  a horizontal "by project" bar chart (top spenders + a rolled-up "Other") and
  a 100%-stacked "by model" share bar with legend. Both have hover detail; the
  model ramp is validated for colorblind-safe contrast in light and dark.
- Plain-language helper line under every section explaining what it shows and
  how to use it.

## [2.0.2] - 2026-07-17

### Security
- Dashboard server now binds to `127.0.0.1` only (previously listened on all
  network interfaces). The dashboard has no auth, so the old default exposed
  project paths, prompts, and error samples to anyone on the same LAN.

### Fixed
- Waste "retry" detection no longer false-positives when two unrelated calls
  to a tool with no identifiable target (WebFetch, WebSearch, Task,
  TodoWrite) both errored — they no longer collide and falsely confirm each
  other.
- Redundant-read detection now recognizes `MultiEdit` and `NotebookEdit` as
  legitimate file mutations, matching `Edit`/`Write` — a re-read after either
  is no longer flagged as waste.
- Credential redaction now catches glued single-dash password flags (e.g.
  `mysql -pSECRET`).

### Changed
- Softened the Waste tab's redaction copy ("credentials are redacted" →
  "recognizable credentials... review before sharing"), since keyword-less
  secrets can still slip through.

### Added
- Advisor v2: actionable findings, capacity-based framing instead of raw
  dollar "savings," a precision guard on the low-cache-hit rule, and each
  reason tagged with its rule id.
- Cross-session waste patterns: errored tool calls and redundant reads
  tracked and surfaced, with error-reason classification, a plain-language
  explainer, and a daily trend chart.

## [2.0.1]

### Added
- VS Code extension — the dashboard in a panel plus a status-bar item
  showing today's spend. Published to the VS Code Marketplace.

### Fixed
- Broadened the advisor's premium-model rule to match by pricing tier
  instead of a hard-coded model name.
- Plan-ROI multiple now flags when it's using the default $200 subscription
  price instead of one you've configured.

## [2.0.0] - 2026-07-14

### Added
- Day/Week/Month toggle on the Overview spend chart.

### Removed
- **Breaking:** client attribution — `/api/report` is now a monthly total
  only.

## [1.1.0] - 2026-07-14

### Added
- Packaged for npm as `cccost-dashboard`, installable via `npx`.

## [1.0.0] - 2026-07-13

Initial public release.

### Added
- Core JSONL aggregation with per-model pricing and message dedup.
- HTTP server with recursive session scanner, subagent merge, and an
  incremental cache.
- React dashboard: Overview, per-project/per-model breakdown, sessions list.
- Per-prompt timeline with project filter; turn parsing with subagent cost
  attribution.
- Plan-ROI tile, client attribution, and a monthly report.
- Efficiency advisor (three heuristics) in a tabbed layout.
- Demo dataset, screenshots, and a `CLAUDE_PROJECTS_DIR` override for trying
  it without real data.

### Fixed
- Daily chart bucketing switched from UTC to local calendar date, with
  calendar-gap filling.

[2.1.0]: https://github.com/simantaturja/cccost-dashboard/compare/v2.0.2...v2.1.0
[2.0.2]: https://github.com/simantaturja/cccost-dashboard/compare/v2.0.0...v2.0.2
[2.0.0]: https://github.com/simantaturja/cccost-dashboard/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/simantaturja/cccost-dashboard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/simantaturja/cccost-dashboard/releases/tag/v1.0.0
