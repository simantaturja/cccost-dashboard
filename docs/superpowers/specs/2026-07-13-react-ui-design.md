# React UI Migration — Design

**Date:** 2026-07-13
**Status:** Approved (chat). Supersedes the frontend portion of earlier specs;
backend/API unchanged.

## Decision

Replace `public/index.html` (vanilla JS) with a React SPA. Rationale: UI has grown
to 4 tabs / 7 views with interactions; user requested React + better visual design.
This intentionally drops the "zero dependencies / no build step" constraint **for
the frontend only**. Backend stays dependency-free.

## Stack

- Vite + React (JSX, no TypeScript — keep ceremony low).
- Frontend lives in `web/` with its own `package.json`.
- Charting: hand-rolled SVG in React components or Recharts — implementer's choice,
  but must follow the dataviz skill rules (validated palette, hover tooltips,
  thin marks, no dual axes).
- Styling: implementer's choice (hand-rolled CSS or Tailwind), guided by the
  frontend-design skill. Must support light + dark (`prefers-color-scheme`).
  Avoid generic AI-slop aesthetics per that skill.

## Serving

- `web/` builds to `web/dist/`. `server.js` gains a small static handler:
  `/` → `web/dist/index.html`, `/assets/*` → `web/dist/assets/*` with correct
  content types. No other server changes; `/api/data` and `/api/report` unchanged.
- Dev flow: `vite` dev server in `web/` proxies `/api` → `http://localhost:3456`.
- Root scripts: `npm run build` → builds web; `npm start` unchanged.
- `public/` (old vanilla page) is deleted once parity verified — replaced, not kept.

## Feature parity checklist (all must survive)

1. Tab navigation: Overview / Breakdown / Advisor / Sessions, hash-routed,
   bookmarkable, back/forward works.
2. Overview: summary tiles (total cost, tokens, sessions/projects, cache savings,
   cache-read %, ROI multiple), daily spend chart (last 90 days, hover tooltip
   per bar), By client table with per-month columns, monthly report month
   `<select>` + download link (`/api/report?month=`).
3. Breakdown: By project table, By model table (cache read % column).
4. Advisor: flagged sessions table with reasons + est. savings; empty state.
5. Sessions: sortable (cost, date), click row → expandable per-model detail.
6. Diagnostics footnote visible on all tabs.
7. Light/dark theme.

## Non-goals

- No router lib (hash handling is a few lines).
- No state management lib.
- No backend changes beyond static serving.
- No frontend test suite in this pass (backend's 14 tests must keep passing).

## Verification

- `cd web && npm run build` succeeds.
- Server serves built app; all four tabs render with real data.
- `npm test` (root) still 14 pass.
