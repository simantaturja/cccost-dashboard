# Sessions / Per-Prompt Cost Magnitude Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add magnitude bars (track + fill, same pattern as `BreakdownBars.jsx`) to all three cost levels rendered by the Sessions tab — outer session rows, per-model table, per-prompt timeline — so relative cost reads visually instead of requiring digit-scanning.

**Architecture:** Pure frontend change confined to one file, `web/src/components/SessionsTable.jsx`. Each of the three tables/lists already renders the numeric cost; each task adds a `useMemo`-computed local max and a track/fill `<div>` pair styled with existing Tailwind utility classes (no new CSS, no new component file).

**Tech Stack:** React 19, Tailwind CSS v4 (utility classes only, no new `@layer` rules).

## Global Constraints

- Single file touched: `web/src/components/SessionsTable.jsx`. No changes to `lib/core.js`, `lib/scan.js`, `server.js`, or `web/src/styles.css`.
- No new npm dependencies.
- Reuse the existing bar visual language: track = `bg-surface-2` rounded box, fill = `bg-chart` (or `bg-accent` for the subagent-cost stack segment), same as `BreakdownBars.jsx`.
- Every bar's max is a **local** scale (relative to the currently visible set), floored with `Math.max(..., 0.01)` so an all-zero set still renders a visible sliver instead of `NaN%`.
- No automated tests exist for React components in this repo (only `test/core.test.js` and `test/server.test.js`, which cover `lib/`). Verification is manual: run the dashboard against the bundled demo fixtures and check in a browser.
- Demo fixture data lives at `demo/projects`. To point the server at it instead of real `~/.claude/projects` usage:
  ```bash
  CLAUDE_PROJECTS_DIR="$(pwd)/demo/projects" node server.js
  ```
  Leave that running in one terminal; in another terminal run `cd web && npm run dev` and open the printed Vite URL (proxies `/api` to `localhost:3456`). Go to the Sessions tab.

---

### Task 1: Outer session-row cost bars

**Files:**
- Modify: `web/src/components/SessionsTable.jsx:126-224` (the `SessionsTable` component — `rows` memo and the Cost `<td>` in the row map)

**Interfaces:**
- Consumes: `sessions` prop (array of session aggregates, each with `.costUSD`), already passed in from `App.jsx` as `data.sessions` — unchanged.
- Produces: no new exports; this task only changes what's rendered inside `SessionsTable`.

- [ ] **Step 1: Add a `maxRowCost` memo derived from the already-sorted/filtered `rows`**

In `web/src/components/SessionsTable.jsx`, immediately after the existing `rows` memo (currently ends at line 148 with `}, [sessions, sort, project]);`), add:

```jsx
  const maxRowCost = useMemo(() => Math.max(...rows.map((s) => s.costUSD), 0.01), [rows]);
```

- [ ] **Step 2: Replace the Cost `<td>` in the row map with a bar + number**

Find this block (currently lines 202-207):

```jsx
                    <td title={s.project}>{shortProject(s.project)}</td>
                    <td className="mono">{s.sessionId.slice(0, 8)}</td>
                    <td className="num">{(s.lastTimestamp || '').slice(0, 10)}</td>
                    <td className="num">{s.messages}</td>
                    <td className="num">{fmtTok(sumTok(s.tokens))}</td>
                    <td className="num">{fmtUSD(s.costUSD)}</td>
```

Replace the last line with:

```jsx
                    <td className="num">
                      <div className="flex items-center justify-end gap-2">
                        <div
                          className="h-[7px] w-14 shrink-0 overflow-hidden rounded-[3px] bg-surface-2"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full min-w-[2px] rounded-[3px] bg-chart"
                            style={{ width: (s.costUSD / maxRowCost) * 100 + '%' }}
                          />
                        </div>
                        {fmtUSD(s.costUSD)}
                      </div>
                    </td>
```

- [ ] **Step 3: Manually verify**

Start the server and dev proxy as described in Global Constraints, open the Sessions tab. Confirm:
- Every row's Cost cell shows a small bar before the dollar figure.
- The most expensive visible row's bar is full width; cheaper rows are proportionally shorter.
- Switching the Project filter rescales the bars (the most expensive row *within that filter* becomes full width).
- A session with `$0.00` cost (if present in the demo fixtures) still shows a thin visible sliver, not a blank or broken bar.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/SessionsTable.jsx
git commit -m "feat(sessions): add relative cost bar to session rows"
```

---

### Task 2: Per-model share bars in the session drill-down

**Files:**
- Modify: `web/src/components/SessionsTable.jsx:81-124` (the `SessionDetail` component)

**Interfaces:**
- Consumes: `s.models` (object keyed by model name, each entry `{ tokens, costUSD, messages }`) — unchanged shape, already destructured into the sorted `models` array on the existing line `const models = Object.entries(s.models).sort((a, b) => b[1].costUSD - a[1].costUSD);`.
- Produces: no new exports.

- [ ] **Step 1: Add a `maxModelCost` local constant**

Immediately after the existing `models` line in `SessionDetail` (currently line 82):

```jsx
  const models = Object.entries(s.models).sort((a, b) => b[1].costUSD - a[1].costUSD);
  const maxModelCost = Math.max(...models.map(([, m]) => m.costUSD), 0.01);
```

- [ ] **Step 2: Add a "Share" column header**

Find the table header (currently lines 89-98):

```jsx
        <thead>
          <tr>
            <th>Model</th>
            <th className="num">Msgs</th>
            <th className="num">Input</th>
            <th className="num">Output</th>
            <th className="num">Cache write</th>
            <th className="num">Cache read</th>
            <th className="num">Cost</th>
          </tr>
        </thead>
```

Add a `Share` column after `Cost`:

```jsx
        <thead>
          <tr>
            <th>Model</th>
            <th className="num">Msgs</th>
            <th className="num">Input</th>
            <th className="num">Output</th>
            <th className="num">Cache write</th>
            <th className="num">Cache read</th>
            <th className="num">Cost</th>
            <th className="num">Share</th>
          </tr>
        </thead>
```

- [ ] **Step 3: Add the bar cell to each model row**

Find the row map (currently lines 101-111):

```jsx
          {models.map(([model, m]) => (
            <tr key={model}>
              <td className="mono">{model}</td>
              <td className="num">{m.messages}</td>
              <td className="num">{fmtTok(m.tokens.input)}</td>
              <td className="num">{fmtTok(m.tokens.output)}</td>
              <td className="num">{fmtTok(m.tokens.cacheWrite5m + m.tokens.cacheWrite1h)}</td>
              <td className="num">{fmtTok(m.tokens.cacheRead)}</td>
              <td className="num">{fmtUSD(m.costUSD)}</td>
            </tr>
          ))}
```

Add a `Share` cell after the Cost cell:

```jsx
          {models.map(([model, m]) => (
            <tr key={model}>
              <td className="mono">{model}</td>
              <td className="num">{m.messages}</td>
              <td className="num">{fmtTok(m.tokens.input)}</td>
              <td className="num">{fmtTok(m.tokens.output)}</td>
              <td className="num">{fmtTok(m.tokens.cacheWrite5m + m.tokens.cacheWrite1h)}</td>
              <td className="num">{fmtTok(m.tokens.cacheRead)}</td>
              <td className="num">{fmtUSD(m.costUSD)}</td>
              <td className="num">
                <div
                  className="ml-auto h-[7px] w-16 overflow-hidden rounded-[3px] bg-surface-2"
                  aria-hidden="true"
                >
                  <div
                    className="h-full min-w-[2px] rounded-[3px] bg-chart"
                    style={{ width: (m.costUSD / maxModelCost) * 100 + '%' }}
                  />
                </div>
              </td>
            </tr>
          ))}
```

- [ ] **Step 4: Manually verify**

With the server/dev proxy running, open the Sessions tab, click a session with 2+ models. Confirm:
- A "Share" column appears after "Cost", right-aligned, containing a bar per model row.
- The model with the highest cost has a full-width bar; others are proportionally shorter.
- A session with only one model shows that model's bar at full width (100%), not empty.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/SessionsTable.jsx
git commit -m "feat(sessions): add per-model cost share bar to session drill-down"
```

---

### Task 3: Per-prompt (turn) stacked cost bars in the timeline

**Files:**
- Modify: `web/src/components/SessionsTable.jsx:12-79` (the `Turn` and `PromptTimeline` components)

**Interfaces:**
- Consumes: `t.costUSD`, `t.subagentCostUSD` on each turn object returned by `api.session(sessionKey)` — both fields already exist on the payload (`lib/core.js` `newTurn`/`accrue`), no backend change needed.
- Produces: `Turn` gains a new required prop `maxCost: number`. `PromptTimeline` is the only caller of `Turn` and is updated in the same task, so no other file needs to change.

- [ ] **Step 1: Compute `maxCost` in `PromptTimeline` and pass it to `Turn`**

Find `PromptTimeline` (currently lines 51-79):

```jsx
function PromptTimeline({ sessionKey }) {
  const [state, setState] = useState({ status: 'loading', turns: null, error: null });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading', turns: null, error: null });
    api
      .session(sessionKey)
      .then((d) => live && setState({ status: 'ready', turns: d.turns, error: null }))
      .catch((e) => live && setState({ status: 'error', turns: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [sessionKey]);

  const noteCls = 'py-3 text-[12.5px] text-muted';
  if (state.status === 'loading') return <div className={noteCls}>Loading prompts…</div>;
  if (state.status === 'error') {
    return <div className={noteCls}>Could not load prompts: {state.error}</div>;
  }
  if (!state.turns.length) return <div className={noteCls}>No prompts recorded.</div>;
  return (
    <ol className="m-0 list-none p-0">
      {state.turns.map((t, i) => (
        <Turn key={i} t={t} />
      ))}
    </ol>
  );
}
```

Replace it with (adds one `useMemo` line before the early returns, and passes `maxCost` to `Turn`):

```jsx
function PromptTimeline({ sessionKey }) {
  const [state, setState] = useState({ status: 'loading', turns: null, error: null });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading', turns: null, error: null });
    api
      .session(sessionKey)
      .then((d) => live && setState({ status: 'ready', turns: d.turns, error: null }))
      .catch((e) => live && setState({ status: 'error', turns: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [sessionKey]);

  const maxCost = useMemo(
    () => Math.max(...(state.turns || []).map((t) => t.costUSD), 0.01),
    [state.turns]
  );

  const noteCls = 'py-3 text-[12.5px] text-muted';
  if (state.status === 'loading') return <div className={noteCls}>Loading prompts…</div>;
  if (state.status === 'error') {
    return <div className={noteCls}>Could not load prompts: {state.error}</div>;
  }
  if (!state.turns.length) return <div className={noteCls}>No prompts recorded.</div>;
  return (
    <ol className="m-0 list-none p-0">
      {state.turns.map((t, i) => (
        <Turn key={i} t={t} maxCost={maxCost} />
      ))}
    </ol>
  );
}
```

(`useMemo` is already imported at the top of the file — no import change needed.)

- [ ] **Step 2: Add the stacked bar to `Turn`**

Find `Turn` (currently lines 12-49):

```jsx
function Turn({ t }) {
  const [full, setFull] = useState(false);
  const long = t.prompt.length > TRUNCATE;
  const text = full || !long ? t.prompt : t.prompt.slice(0, TRUNCATE) + '…';
  return (
    <li className={'border-t border-line pb-[11px] pt-2.5 first:border-t-0' + (t.flagged ? ' opacity-80' : '')}>
      <div className="mb-1 flex items-baseline gap-2.5">
        <span className="font-mono text-[11.5px] tracking-[0.02em] text-faint">{fmtTurnTime(t.timestamp)}</span>
        {t.flagged && (
          <span className="rounded-[4px] bg-soft px-1.5 py-[3px] font-mono text-[9.5px] font-semibold uppercase leading-none tracking-[0.06em] text-accent">
            continuation
          </span>
        )}
        <span className="ml-auto font-mono text-[12.5px] font-medium text-ink">{fmtUSD(t.costUSD)}</span>
      </div>
      <div
        className={
          'whitespace-pre-wrap break-words text-[12.5px] text-ink' +
          (long ? ' cursor-pointer hover:text-accent' : '')
        }
        onClick={long ? () => setFull((v) => !v) : undefined}
        title={long ? (full ? 'Click to collapse' : 'Click to expand') : undefined}
      >
        {text}
      </div>
      <div className="mt-[5px] flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-muted tabular-nums">
        <span>in {fmtTok(t.tokens.input)}</span>
        <span>out {fmtTok(t.tokens.output)}</span>
        {t.subagentCostUSD > 0 && (
          <span className="text-accent">subagent {fmtUSD(t.subagentCostUSD)}</span>
        )}
        {t.models.length > 0 && (
          <span className="font-mono text-[11px] text-faint">{t.models.join(', ')}</span>
        )}
      </div>
    </li>
  );
}
```

Replace it with (adds `maxCost` param, a `mainPct`/`subPct` calc, and a stacked bar between the header row and the prompt text):

```jsx
function Turn({ t, maxCost }) {
  const [full, setFull] = useState(false);
  const long = t.prompt.length > TRUNCATE;
  const text = full || !long ? t.prompt : t.prompt.slice(0, TRUNCATE) + '…';
  const mainCost = Math.max(t.costUSD - t.subagentCostUSD, 0);
  const mainPct = Math.min(100, (mainCost / maxCost) * 100);
  const subPct = Math.max(0, Math.min(100 - mainPct, (t.subagentCostUSD / maxCost) * 100));
  return (
    <li className={'border-t border-line pb-[11px] pt-2.5 first:border-t-0' + (t.flagged ? ' opacity-80' : '')}>
      <div className="mb-1 flex items-baseline gap-2.5">
        <span className="font-mono text-[11.5px] tracking-[0.02em] text-faint">{fmtTurnTime(t.timestamp)}</span>
        {t.flagged && (
          <span className="rounded-[4px] bg-soft px-1.5 py-[3px] font-mono text-[9.5px] font-semibold uppercase leading-none tracking-[0.06em] text-accent">
            continuation
          </span>
        )}
        <span className="ml-auto font-mono text-[12.5px] font-medium text-ink">{fmtUSD(t.costUSD)}</span>
      </div>
      <div
        className="mb-2 flex h-1 w-full overflow-hidden rounded-[2px] bg-surface-2"
        aria-hidden="true"
        title={
          t.subagentCostUSD > 0
            ? `${fmtUSD(mainCost)} direct + ${fmtUSD(t.subagentCostUSD)} subagent`
            : fmtUSD(t.costUSD)
        }
      >
        <div className="h-full bg-chart" style={{ width: mainPct + '%' }} />
        {t.subagentCostUSD > 0 && <div className="h-full bg-accent" style={{ width: subPct + '%' }} />}
      </div>
      <div
        className={
          'whitespace-pre-wrap break-words text-[12.5px] text-ink' +
          (long ? ' cursor-pointer hover:text-accent' : '')
        }
        onClick={long ? () => setFull((v) => !v) : undefined}
        title={long ? (full ? 'Click to collapse' : 'Click to expand') : undefined}
      >
        {text}
      </div>
      <div className="mt-[5px] flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-muted tabular-nums">
        <span>in {fmtTok(t.tokens.input)}</span>
        <span>out {fmtTok(t.tokens.output)}</span>
        {t.subagentCostUSD > 0 && (
          <span className="text-accent">subagent {fmtUSD(t.subagentCostUSD)}</span>
        )}
        {t.models.length > 0 && (
          <span className="font-mono text-[11px] text-faint">{t.models.join(', ')}</span>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 3: Manually verify**

With the server/dev proxy running, open the Sessions tab, click into a session with multiple prompts. Confirm:
- Each turn shows a thin bar under its timestamp/cost header row.
- The most expensive turn in that session has a full-width bar.
- A turn with subagent cost shows two visibly distinct colored segments (main + subagent) that together never exceed the bar's full width.
- A turn with zero cost still shows a thin visible sliver, not a blank/broken bar.
- Hovering the bar shows a tooltip with the cost breakdown.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/SessionsTable.jsx
git commit -m "feat(sessions): add stacked cost bar to the per-prompt timeline"
```
