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
