'use strict';
// Pin TZ to +06 (Asia/Dhaka) BEFORE requires so local-date assertions are
// deterministic on any machine/CI, independent of the host timezone.
process.env.TZ = 'Asia/Dhaka';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseSession, buildResponse, mergeSessionAggregates, getRates,
  buildReport, DEFAULT_CONFIG, parseTurns, attributeSubagentTurns, classifyErrorReason,
  redactSecrets,
} = require('../lib/core');

const opusLine = JSON.stringify({
  type: 'assistant',
  timestamp: '2026-07-01T10:00:00.000Z',
  cwd: '/Users/x/proj',
  message: {
    id: 'msg_1',
    model: 'claude-opus-4-8',
    usage: {
      input_tokens: 100,
      output_tokens: 200,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 5000,
      cache_creation: { ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 600 },
    },
  },
});

const fableLine = JSON.stringify({
  type: 'assistant',
  timestamp: '2026-07-02T11:00:00.000Z',
  message: {
    id: 'msg_2',
    model: 'claude-fable-5',
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 30,
      cache_read_input_tokens: 40,
    },
  },
});

const unknownLine = JSON.stringify({
  type: 'assistant',
  timestamp: '2026-07-02T12:00:00.000Z',
  message: { id: 'msg_3', model: 'weird-model', usage: { input_tokens: 999 } },
});

const fixture = [
  opusLine,
  opusLine, // duplicate message id — must count once
  fableLine,
  unknownLine,
  'not json {{{',
  JSON.stringify({ type: 'user', message: {} }), // no usage — ignored
].join('\n');

// Expected costs:
// msg_1 (opus $5/$25, w5m 6.25, w1h 10, read 0.5):
//   100*5 + 200*25 + 400*6.25 + 600*10 + 5000*0.5 = 500+5000+2500+6000+2500 = 16500 /1e6 = 0.0165
// msg_2 (fable $10/$50, w5m 12.5, read 1) — no breakdown, 30 treated as 5m:
//   10*10 + 20*50 + 30*12.5 + 40*1 = 100+1000+375+40 = 1515 /1e6 = 0.001515
// msg_3: unknown model → $0
const EXPECTED_COST = 0.0165 + 0.001515;

test('getRates matches by substring', () => {
  assert.strictEqual(getRates('claude-opus-4-8').input, 5);
  assert.strictEqual(getRates('claude-fable-5').output, 50);
  assert.strictEqual(getRates('sonnet').input, 3);
  assert.strictEqual(getRates('weird-model'), null);
  assert.strictEqual(getRates(null), null);
});

test('parseSession dedups, prices, and counts diagnostics', () => {
  const s = parseSession(fixture, { sessionId: 'sess-1', project: 'dir-name' });
  assert.strictEqual(s.messages, 3);
  assert.strictEqual(s.malformedLines, 1);
  assert.strictEqual(s.unknownModelMessages, 1);
  assert.strictEqual(s.project, '/Users/x/proj'); // cwd overrides dir name
  assert.strictEqual(s.firstTimestamp, '2026-07-01T10:00:00.000Z');
  assert.strictEqual(s.lastTimestamp, '2026-07-02T12:00:00.000Z');
  assert.deepStrictEqual(s.tokens, {
    input: 1109, output: 220, cacheWrite5m: 430, cacheWrite1h: 600, cacheRead: 5040,
  });
  assert.ok(Math.abs(s.costUSD - EXPECTED_COST) < 1e-9, `got ${s.costUSD}`);
  assert.ok(Math.abs(s.models['claude-opus-4-8'].costUSD - 0.0165) < 1e-9);
  assert.strictEqual(s.models['claude-opus-4-8'].messages, 1);
  assert.deepStrictEqual(Object.keys(s.daily).sort(), ['2026-07-01', '2026-07-02']);
  assert.ok(Math.abs(s.daily['2026-07-01'].costUSD - 0.0165) < 1e-9);
});

test('parseSession dedup keeps the LAST occurrence when duplicates differ (streaming partials)', () => {
  // External invariant: Claude Code streams the same message.id repeatedly with growing usage
  // and writes the COMPLETE message last — so last-wins is correct. If this breaks, check
  // whether the JSONL write order changed before touching parseSession's dedup.
  const partial = JSON.stringify({
    type: 'assistant', timestamp: '2026-07-01T10:00:00.000Z',
    message: { id: 'msg_dup', model: 'claude-opus-4-8', usage: { input_tokens: 100, output_tokens: 4 } },
  });
  const complete = JSON.stringify({
    type: 'assistant', timestamp: '2026-07-01T10:00:00.000Z',
    message: { id: 'msg_dup', model: 'claude-opus-4-8', usage: { input_tokens: 100, output_tokens: 378 } },
  });
  const s = parseSession([partial, complete].join('\n'), { sessionId: 'sess-dup', project: 'p' });
  assert.strictEqual(s.messages, 1);
  assert.strictEqual(s.tokens.output, 378); // last-wins: not 4 (partial), not 382 (summed)
  assert.ok(Math.abs(s.costUSD - (100 * 5 + 378 * 25) / 1e6) < 1e-9, `got ${s.costUSD}`);
});

test('parseSession buckets daily/monthly by LOCAL date across a UTC month boundary', () => {
  // 2026-06-30T20:00:00Z is 2026-07-01 02:00 local (+06) — must land in July, not June.
  const late = JSON.stringify({
    type: 'assistant', timestamp: '2026-06-30T20:00:00.000Z',
    message: { id: 'msg_late', model: 'claude-opus-4-8', usage: { input_tokens: 1e6 } },
  });
  const s = parseSession(late, { sessionId: 'sess-boundary', project: 'p' });
  assert.deepStrictEqual(Object.keys(s.daily), ['2026-07-01']);
  const r = buildResponse([s]);
  assert.deepStrictEqual(r.monthly.map((m) => m.month), ['2026-07']);
});

test('buildResponse rolls up summary, projects, models, daily', () => {
  const s = parseSession(fixture, { sessionId: 'sess-1', project: 'dir-name' });
  const r = buildResponse([s]);
  assert.strictEqual(r.summary.sessionCount, 1);
  assert.strictEqual(r.summary.projectCount, 1);
  assert.ok(Math.abs(r.summary.totalCostUSD - EXPECTED_COST) < 1e-9);
  assert.strictEqual(r.summary.totalTokens, 1109 + 220 + 430 + 600 + 5040);
  assert.strictEqual(r.summary.cacheReadTokens, 5040);
  // savings: opus 5000*(5-0.5)/1e6 + fable 40*(10-1)/1e6 = 0.0225 + 0.00036
  assert.ok(Math.abs(r.summary.cacheSavingsUSD - (0.0225 + 0.00036)) < 1e-9);
  assert.strictEqual(r.byProject[0].project, '/Users/x/proj');
  assert.strictEqual(r.byModel.length, 3);
  assert.strictEqual(r.daily.length, 2);
  assert.strictEqual(r.daily[0].date, '2026-07-01'); // ascending
  assert.strictEqual(r.sessions.length, 1);
});

test('mergeSessionAggregates combines a session file with its subagent files', () => {
  const main = parseSession(opusLine, { sessionId: 'sess-1', project: 'dir-name' });
  const sub = parseSession(fableLine, { sessionId: 'sess-1', project: 'dir-name' });
  const merged = mergeSessionAggregates([main, sub]);
  assert.strictEqual(merged.sessionId, 'sess-1');
  assert.strictEqual(merged.project, '/Users/x/proj'); // cwd from main file wins
  assert.strictEqual(merged.messages, 2);
  assert.ok(Math.abs(merged.costUSD - (0.0165 + 0.001515)) < 1e-9);
  assert.deepStrictEqual(merged.tokens, {
    input: 110, output: 220, cacheWrite5m: 430, cacheWrite1h: 600, cacheRead: 5040,
  });
  assert.strictEqual(merged.firstTimestamp, '2026-07-01T10:00:00.000Z');
  assert.strictEqual(merged.lastTimestamp, '2026-07-02T11:00:00.000Z');
  assert.strictEqual(Object.keys(merged.models).length, 2);
  assert.strictEqual(Object.keys(merged.daily).length, 2);
});

test('buildResponse skips sessions with zero usage messages', () => {
  const empty = parseSession('', { sessionId: 'e', project: 'p' });
  const r = buildResponse([empty]);
  assert.strictEqual(r.summary.sessionCount, 0);
});

const line = (o) => JSON.stringify({
  type: 'assistant',
  timestamp: o.ts,
  cwd: o.cwd,
  message: { id: o.id, model: o.model || 'claude-opus-4-8', usage: { input_tokens: o.input } },
});

// opus input rate $5/1M, so input N*1e6 → cost $5N
const TEST_CONFIG = { subscriptionUSDPerMonth: 200 };
const acme1 = parseSession(line({ ts: '2026-06-30T10:00:00.000Z', cwd: '/work/acme/app', id: 'd1', input: 1e6 }), { sessionId: 'a1', project: 'p' });
const acme2 = parseSession(line({ ts: '2026-07-01T10:00:00.000Z', cwd: '/work/acme/app', id: 'd2', input: 2e6 }), { sessionId: 'a2', project: 'p' });
const globex = parseSession(line({ ts: '2026-07-05T10:00:00.000Z', cwd: '/work/globex/x', id: 'c1', input: 4e6 }), { sessionId: 'gx', project: 'p' });
const personal = parseSession(line({ ts: '2026-07-02T10:00:00.000Z', cwd: '/home/me/thing', id: 'o1', input: 1e6 }), { sessionId: 'per', project: 'p' });

test('buildResponse monthly rolls up across a month boundary (local time)', () => {
  const r = buildResponse([acme1, acme2, globex, personal], TEST_CONFIG);
  // no client rollup any more
  assert.strictEqual(r.byClient, undefined);
  // monthly ascending; acme1 (Jun 30 16:00 local) → June, rest → July
  assert.deepStrictEqual(r.monthly, [
    { month: '2026-06', costUSD: 5, tokens: 1e6 },
    { month: '2026-07', costUSD: 35, tokens: 7e6 },
  ]);
});

test('buildReport renders a total-only monthly summary', () => {
  const r = buildResponse([acme1, acme2, globex, personal], TEST_CONFIG);
  assert.strictEqual(buildReport(r.monthly, '2026-07', '2026-07-14'), [
    '# Claude Code usage — 2026-07',
    '',
    'Total: $35.00 · 7,000,000 tokens',
    '',
    'Generated 2026-07-14 · API-equivalent value at current Anthropic pricing.',
    '',
  ].join('\n'));
  // a month with no data → zeros
  assert.strictEqual(buildReport(r.monthly, '2026-05', '2026-07-14'), [
    '# Claude Code usage — 2026-05',
    '',
    'Total: $0.00 · 0 tokens',
    '',
    'Generated 2026-07-14 · API-equivalent value at current Anthropic pricing.',
    '',
  ].join('\n'));
});

test('buildResponse roi: multiple = monthly value / subscription, ascending', () => {
  const r = buildResponse([acme1, acme2, globex, personal], TEST_CONFIG);
  assert.strictEqual(r.roi.subscriptionUSDPerMonth, 200);
  assert.deepStrictEqual(r.roi.months, [
    { month: '2026-06', valueUSD: 5, multiple: 5 / 200 },
    { month: '2026-07', valueUSD: 35, multiple: 35 / 200 },
  ]);
  const r2 = buildResponse([acme1, acme2, globex, personal], { subscriptionUSDPerMonth: 100 });
  assert.strictEqual(r2.roi.subscriptionUSDPerMonth, 100);
  assert.strictEqual(r2.roi.months[1].multiple, 35 / 100);
});

test('buildResponse roi: configured flag reflects whether the user set a plan price', () => {
  const sessions = [acme1, acme2, globex, personal];
  // no config → $200 default, flagged as NOT user-configured
  const rDefault = buildResponse(sessions);
  assert.strictEqual(rDefault.roi.subscriptionUSDPerMonth, 200);
  assert.strictEqual(rDefault.roi.configured, false);
  // config object without the key → still a default, not configured
  assert.strictEqual(buildResponse(sessions, {}).roi.configured, false);
  // explicit plan price → configured; the Pro ($20) case that was silently 10x off
  const rSet = buildResponse(sessions, { subscriptionUSDPerMonth: 20 });
  assert.strictEqual(rSet.roi.configured, true);
  assert.strictEqual(rSet.roi.months[1].multiple, 35 / 20);
});

test('mergeSessionAggregates sums subagentCostUSD from non-main files', () => {
  const main = Object.assign(parseSession(opusLine, { sessionId: 'sess-1', project: 'p' }), { isMain: true });
  const sub1 = Object.assign(parseSession(fableLine, { sessionId: 'sess-1', project: 'p' }), { isMain: false });
  const sub2 = Object.assign(parseSession(fableLine, { sessionId: 'sess-1', project: 'p' }), { isMain: false });
  const merged = mergeSessionAggregates([main, sub1, sub2]);
  assert.ok(Math.abs(merged.subagentCostUSD - 0.001515 * 2) < 1e-9);
  // no subagents → 0
  const solo = mergeSessionAggregates([Object.assign(parseSession(opusLine, { sessionId: 's', project: 'p' }), { isMain: true })]);
  assert.strictEqual(solo.subagentCostUSD, 0);
});

const emptyTok = () => ({ input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 });
function fakeSession(o) {
  return {
    sessionId: o.sessionId, project: '/p',
    firstTimestamp: '2026-07-01T00:00:00.000Z', lastTimestamp: '2026-07-01T00:00:00.000Z',
    messages: o.messages != null ? o.messages : 10,
    tokens: o.tokens || emptyTok(),
    costUSD: o.costUSD || 0,
    models: o.models || {},
    daily: {}, malformedLines: 0, unknownModelMessages: 0,
    subagentCostUSD: o.subagentCostUSD || 0,
  };
}
const advisorById = (r) => Object.fromEntries(r.advisor.map((a) => [a.sessionId, a]));

test('advisor rule 1: low cache ratio fires below 0.5 with non-trivial volume, not at threshold', () => {
  // denom = input + cacheWrite5m + cacheWrite1h + cacheRead; guard requires denom >= 200000.
  const fire = fakeSession({ sessionId: 'r1-fire', costUSD: 2, tokens: { ...emptyTok(), input: 190000, cacheRead: 10000 } });
  const thresh = fakeSession({ sessionId: 'r1-thresh', costUSD: 2, tokens: { ...emptyTok(), input: 100000, cacheRead: 100000 } });
  const nocost = fakeSession({ sessionId: 'r1-cost', costUSD: 0.5, tokens: { ...emptyTok(), input: 190000, cacheRead: 10000 } });
  const small = fakeSession({ sessionId: 'r1-small', costUSD: 2, tokens: { ...emptyTok(), input: 19000, cacheRead: 1000 } });
  const a = advisorById(buildResponse([fire, thresh, nocost, small]));
  assert.deepStrictEqual(a['r1-fire'].reasons, [{
    rule: 'low-cache-hit',
    text: 'Low cache hit ratio (5%) — context likely rebuilt repeatedly',
    action: 'Run /clear between unrelated tasks so context is served from cache instead of rebuilt.',
  }]);
  assert.strictEqual(a['r1-fire'].estSavingUSD, 0);
  assert.ok(!a['r1-thresh']); // ratio == 0.5, not below
  assert.ok(!a['r1-cost']);   // cost < 1
  assert.ok(!a['r1-small']);  // same 5% ratio but denom < 200000 — precision guard
});

test('advisor rule 2: any top-tier model on a short session flags; est saving = premiumCost * 0.7', () => {
  const MSG = {
    rule: 'premium-model-short-session',
    text: 'Premium model on a short session — a cheaper model likely sufficient (est. save $3.50)',
    action: 'Route short or simple tasks to a cheaper model (Sonnet) via /model.',
  };
  const fableModels = { 'claude-fable-5': { costUSD: 5, messages: 5, tokens: emptyTok() } };
  const mythosModels = { 'claude-mythos-5': { costUSD: 5, messages: 5, tokens: emptyTok() } };
  const opusModels = { 'claude-opus-4-8': { costUSD: 5, messages: 5, tokens: emptyTok() } };
  const fable = fakeSession({ sessionId: 'r2-fable', costUSD: 5, messages: 10, models: fableModels });
  const mythos = fakeSession({ sessionId: 'r2-mythos', costUSD: 5, messages: 10, models: mythosModels });
  const long = fakeSession({ sessionId: 'r2-long', costUSD: 5, messages: 20, models: fableModels });
  const opus = fakeSession({ sessionId: 'r2-opus', costUSD: 5, messages: 10, models: opusModels });
  const a = advisorById(buildResponse([fable, mythos, long, opus]));
  // both top-tier models (fable-5 and mythos-5 share the max input rate) fire
  assert.deepStrictEqual(a['r2-fable'].reasons, [MSG]);
  assert.deepStrictEqual(a['r2-mythos'].reasons, [MSG]);
  assert.ok(Math.abs(a['r2-fable'].estSavingUSD - 3.5) < 1e-9);
  // a longer session doesn't fire; a cheaper tier (opus) doesn't fire this rule
  assert.ok(!a['r2-long']);
  assert.ok(!a['r2-opus']);
});

test('advisor rule 3: subagent-heavy fires above 0.6 and cost >= 5, not at threshold', () => {
  const fire = fakeSession({ sessionId: 'r3-fire', costUSD: 6, subagentCostUSD: 4 });
  const nofire = fakeSession({ sessionId: 'r3-thresh', costUSD: 5, subagentCostUSD: 3 });
  const nocost = fakeSession({ sessionId: 'r3-cost', costUSD: 4, subagentCostUSD: 4 });
  const a = advisorById(buildResponse([fire, nofire, nocost]));
  assert.deepStrictEqual(a['r3-fire'].reasons, [{
    rule: 'subagent-heavy',
    text: '67% of cost from subagents ($4.00) — check delegation value',
    action: 'Check the fan-out earned its cost — try fewer subagents or a single-agent pass.',
  }]);
  assert.ok(!a['r3-thresh']);
  assert.ok(!a['r3-cost']);
});

test('advisor sorts by cost desc and caps at 25', () => {
  const many = [];
  for (let i = 1; i <= 30; i++) {
    // input >= 200000 with cacheRead 0 → passes the rule-1 precision guard so each session flags
    many.push(fakeSession({ sessionId: `s${i}`, costUSD: i, tokens: { ...emptyTok(), input: 200000 } }));
  }
  const r = buildResponse(many);
  assert.strictEqual(r.advisor.length, 25);
  assert.strictEqual(r.advisor[0].costUSD, 30);
  assert.strictEqual(r.advisor[24].costUSD, 6);
});

// ---- parseTurns / attributeSubagentTurns ----
// opus input rate is $5/1M, so input N*1e6 tokens → cost $5N (easy arithmetic).
const aLine = (o) => JSON.stringify({
  type: 'assistant',
  timestamp: o.ts,
  message: { id: o.id, model: o.model || 'claude-opus-4-8', usage: { input_tokens: o.input } },
});
const uLine = (o) => JSON.stringify({
  type: 'user',
  timestamp: o.ts,
  isMeta: o.isMeta,
  isSidechain: o.isSidechain,
  message: { content: o.content },
});

test('parseTurns: synthetic first turn, prompt filters (command/tool_result/meta), dedup, cost accumulation', () => {
  const text = [
    aLine({ ts: '2026-07-01T10:00:00.000Z', id: 'pre', input: 1e6 }), // before first prompt → synthetic turn
    uLine({ ts: '2026-07-01T10:01:00.000Z', content: 'First real prompt' }),
    aLine({ ts: '2026-07-01T10:02:00.000Z', id: 'A', input: 2e6 }),
    aLine({ ts: '2026-07-01T10:02:00.000Z', id: 'A', input: 2e6 }), // dup id → counts once
    uLine({ ts: '2026-07-01T10:03:00.000Z', content: [{ type: 'tool_result', content: 'ok' }] }), // tool_result-only → skip
    uLine({ ts: '2026-07-01T10:04:00.000Z', content: '<command-name>/clear</command-name>' }), // command wrapper → skip
    uLine({ ts: '2026-07-01T10:05:00.000Z', content: 'meta blob', isMeta: true }), // meta → skip
    uLine({ ts: '2026-07-01T10:05:30.000Z', content: 'sidechain blob', isSidechain: true }), // sidechain → skip
    aLine({ ts: '2026-07-01T10:06:00.000Z', id: 'A2', input: 1e6 }), // still belongs to first real prompt
    uLine({ ts: '2026-07-01T10:07:00.000Z', content: [{ type: 'text', text: 'Second prompt' }] }), // text block prompt
    aLine({ ts: '2026-07-01T10:08:00.000Z', id: 'B', input: 3e6 }),
  ].join('\n');

  const turns = parseTurns(text);
  assert.strictEqual(turns.length, 3);

  // synthetic first turn
  assert.strictEqual(turns[0].flagged, true);
  assert.strictEqual(turns[0].prompt, '(session continuation)');
  assert.ok(Math.abs(turns[0].costUSD - 5) < 1e-9); // pre: 1e6 * 5 / 1e6

  // first real prompt: A (2e6, deduped) + A2 (1e6) = 3e6 → $15
  assert.strictEqual(turns[1].flagged, false);
  assert.strictEqual(turns[1].prompt, 'First real prompt');
  assert.strictEqual(turns[1].timestamp, '2026-07-01T10:01:00.000Z');
  assert.strictEqual(turns[1].tokens.input, 3e6);
  assert.ok(Math.abs(turns[1].costUSD - 15) < 1e-9);
  assert.deepStrictEqual(turns[1].models, ['claude-opus-4-8']);

  // second prompt (from text block): B (3e6) → $15
  assert.strictEqual(turns[2].flagged, false);
  assert.strictEqual(turns[2].prompt, 'Second prompt');
  assert.ok(Math.abs(turns[2].costUSD - 15) < 1e-9);
  assert.strictEqual(turns[2].subagentCostUSD, 0);
});

test('attributeSubagentTurns: window attribution incl. before-first and after-last boundaries, dedup', () => {
  const main = [
    uLine({ ts: '2026-07-01T10:00:00.000Z', content: 'P1' }),
    aLine({ ts: '2026-07-01T10:01:00.000Z', id: 'm1', input: 1e6 }),
    uLine({ ts: '2026-07-01T11:00:00.000Z', content: 'P2' }),
    aLine({ ts: '2026-07-01T11:01:00.000Z', id: 'm2', input: 1e6 }),
  ].join('\n');
  const turns = parseTurns(main);
  assert.strictEqual(turns.length, 2);

  const sub = [
    aLine({ ts: '2026-07-01T09:00:00.000Z', id: 's0', input: 1e6 }), // before first window → turn 0
    aLine({ ts: '2026-07-01T10:30:00.000Z', id: 's1', input: 2e6 }), // inside turn 0 window [10:00,11:00)
    aLine({ ts: '2026-07-01T11:30:00.000Z', id: 's2', input: 3e6 }), // after last turn ts → turn 1
    aLine({ ts: '2026-07-01T11:30:00.000Z', id: 's2', input: 3e6 }), // dup → once
    aLine({ ts: '2026-07-01T11:00:00.000Z', id: 's3', input: 1e6, model: 'claude-fable-5' }), // == turn1 ts → turn 1
  ].join('\n');

  const out = attributeSubagentTurns(turns, sub);
  assert.strictEqual(out, turns); // mutates + returns

  // turn 0: main m1 (1e6→$5) + sub s0 (1e6→$5) + s1 (2e6→$10) = $20; subagent share $15
  assert.strictEqual(turns[0].tokens.input, 4e6);
  assert.ok(Math.abs(turns[0].subagentCostUSD - 15) < 1e-9);
  assert.ok(Math.abs(turns[0].costUSD - 20) < 1e-9);

  // turn 1: main m2 (1e6→$5) + s2 (3e6→$15) + s3 fable (1e6 input * $10 = $10) = $30; subagent share $25
  assert.strictEqual(turns[1].tokens.input, 5e6);
  assert.ok(Math.abs(turns[1].subagentCostUSD - 25) < 1e-9);
  assert.ok(Math.abs(turns[1].costUSD - 30) < 1e-9);
  assert.ok(turns[1].models.includes('claude-fable-5'));
});

// ---- waste: tool_use / tool_result parsing + duplicate reads ----
const asstTools = (o) => JSON.stringify({
  type: 'assistant',
  timestamp: o.ts || '2026-07-01T10:00:00.000Z',
  cwd: o.cwd,
  message: { id: o.id, model: 'claude-opus-4-8', usage: { input_tokens: 1 }, content: o.blocks },
});
const userResults = (o) => JSON.stringify({
  type: 'user',
  timestamp: o.ts || '2026-07-01T10:01:00.000Z',
  message: { content: o.blocks },
});

test('waste: counts tool_use calls and attributes errored tool_result to its tool name, only when retried', () => {
  const text = [
    asstTools({ id: 'm1', cwd: '/w/proj', blocks: [
      { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
      { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/w/a.js' } },
      { type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'boom' } },
    ] }),
    userResults({ blocks: [
      { type: 'tool_result', tool_use_id: 't3', is_error: true },
      { type: 'tool_result', tool_use_id: 't2' }, // success — ignored
    ] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 't4', name: 'Bash', input: { command: 'boom' } }] }), // retry of t3
  ].join('\n');
  const s = parseSession(text, { sessionId: 'w1', project: 'p' });
  assert.strictEqual(s.waste.toolCallCount, 4);
  assert.strictEqual(s.waste.erroredToolCalls, 1);
  assert.deepStrictEqual(s.waste.erroredByTool, { Bash: 1 });
  assert.strictEqual(s.waste.redundantReads, 0);
});

test('waste: an unrelated later call of the same tool does not falsely confirm a different call\'s error', () => {
  const text = [
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'rm -rf /tmp/A' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'File does not exist' }] }),
    // A different, unrelated Bash command — not a retry of t1 — that also happens to error.
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'curl https://x' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'connection refused' }] }),
  ].join('\n');
  const s = parseSession(text, { sessionId: 'w-falseretry', project: 'p' });
  assert.strictEqual(s.waste.erroredToolCalls, 0);
  assert.deepStrictEqual(s.waste.errorSamples, {});
});

test('waste: two different WebFetch errors never falsely confirm each other (no shared empty target)', () => {
  const text = [
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 't1', name: 'WebFetch', input: { url: 'https://a.example' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 't2', name: 'WebFetch', input: { url: 'https://totally-different.example' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't2', is_error: true }] }),
  ].join('\n');
  const s = parseSession(text, { sessionId: 'w-webfetch-nomatch', project: 'p' });
  assert.strictEqual(s.waste.erroredToolCalls, 0);
});

test('waste: a genuine WebFetch retry of the SAME url is still counted (url is now a target)', () => {
  const text = [
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 't1', name: 'WebFetch', input: { url: 'https://a.example' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 't2', name: 'WebFetch', input: { url: 'https://a.example' } }] }), // retry
  ].join('\n');
  const s = parseSession(text, { sessionId: 'w-webfetch-match', project: 'p' });
  assert.strictEqual(s.waste.erroredToolCalls, 1);
});

test('waste: an errored tool call with no later retry of the same tool is not counted', () => {
  const text = [
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'git diff --exit-code' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] }),
  ].join('\n');
  const s = parseSession(text, { sessionId: 'w-nonretry', project: 'p' });
  assert.strictEqual(s.waste.erroredToolCalls, 0);
  assert.deepStrictEqual(s.waste.erroredByTool, {});
});

test('waste: streaming re-writes of the same tool_use/result are counted once', () => {
  const line = asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'boom' } }] });
  const res = userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] });
  const retry = asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'boom' } }] });
  const s = parseSession([line, line, res, res, retry, retry].join('\n'), { sessionId: 'w-dup', project: 'p' });
  assert.strictEqual(s.waste.toolCallCount, 2);
  assert.strictEqual(s.waste.erroredToolCalls, 1);
});

test('waste: duplicate Read is redundant; a Read after an Edit is not', () => {
  const dup = parseSession([
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/w/a.js' } }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: '/w/a.js' } }] }),
  ].join('\n'), { sessionId: 'w2', project: 'p' });
  assert.strictEqual(dup.waste.redundantReads, 1);
  assert.deepStrictEqual(dup.waste.duplicateFiles, { '/w/a.js': 1 });

  const reset = parseSession([
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/w/a.js' } }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: '/w/a.js' } }] }),
    asstTools({ id: 'm3', blocks: [{ type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: '/w/a.js' } }] }),
  ].join('\n'), { sessionId: 'w3', project: 'p' });
  assert.strictEqual(reset.waste.redundantReads, 0);
  assert.deepStrictEqual(reset.waste.duplicateFiles, {});
});

test('waste: a Read after a MultiEdit is not redundant (the file genuinely changed)', () => {
  const s = parseSession([
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/w/a.js' } }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 'e1', name: 'MultiEdit', input: { file_path: '/w/a.js' } }] }),
    asstTools({ id: 'm3', blocks: [{ type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: '/w/a.js' } }] }),
  ].join('\n'), { sessionId: 'w-multiedit-reset', project: 'p' });
  assert.strictEqual(s.waste.redundantReads, 0);
});

test('waste: a Read after a NotebookEdit on the same notebook path is not redundant', () => {
  const s = parseSession([
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/w/nb.ipynb' } }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 'e1', name: 'NotebookEdit', input: { notebook_path: '/w/nb.ipynb' } }] }),
    asstTools({ id: 'm3', blocks: [{ type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: '/w/nb.ipynb' } }] }),
  ].join('\n'), { sessionId: 'w-notebookedit-reset', project: 'p' });
  assert.strictEqual(s.waste.redundantReads, 0);
});

test('waste: reads with offset/limit (pagination) are never flagged redundant', () => {
  const s = parseSession([
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/w/big.log', offset: 0, limit: 2000 } }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: '/w/big.log', offset: 2000, limit: 2000 } }] }),
    asstTools({ id: 'm3', blocks: [{ type: 'tool_use', id: 'r3', name: 'Read', input: { file_path: '/w/big.log', offset: 0, limit: 2000 } }] }), // exact repeat of r1's range
  ].join('\n'), { sessionId: 'w-paginated', project: 'p' });
  assert.strictEqual(s.waste.redundantReads, 0);
  assert.deepStrictEqual(s.waste.duplicateFiles, {});
});

test('waste: a Bash call between two whole-file reads clears redundancy (file may have been mutated)', () => {
  const s = parseSession([
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/w/a.js' } }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'sed -i s/x/y/ /w/a.js' } }] }),
    asstTools({ id: 'm3', blocks: [{ type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: '/w/a.js' } }] }),
  ].join('\n'), { sessionId: 'w-bash-reset', project: 'p' });
  assert.strictEqual(s.waste.redundantReads, 0);
});

test('waste: sessions with no tool blocks get a zeroed waste object', () => {
  const s = parseSession(opusLine, { sessionId: 'w-none', project: 'p' });
  assert.deepStrictEqual(s.waste, {
    toolCallCount: 0, erroredToolCalls: 0, erroredByTool: {}, erroredByReason: {},
    errorSamples: {}, redundantReads: 0, duplicateFiles: {}, daily: {},
  });
});

test('waste: a retried errored call keeps a sample with its command and error text', () => {
  const text = [
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm run boom' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'File does not exist' }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm run boom' } }] }), // retry
  ].join('\n');
  const s = parseSession(text, { sessionId: 'w-sample', project: 'p' });
  assert.deepStrictEqual(s.waste.errorSamples, {
    'Bash file-not-found': [{ tool: 'Bash', reason: 'file-not-found', target: 'npm run boom', text: 'File does not exist' }],
  });
});

test('waste: no sample is kept for an errored call that is never retried', () => {
  const text = [
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls /nope' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'File does not exist' }] }),
  ].join('\n');
  const s = parseSession(text, { sessionId: 'w-nosample', project: 'p' });
  assert.deepStrictEqual(s.waste.errorSamples, {});
});

test('waste: error samples redact credentials and cap at 3 distinct per tool+reason', () => {
  const lines = [];
  // 4 distinct failing commands of the same tool+reason; only 3 should be kept.
  // The secret is masked; the trailing tag keeps each command distinct.
  for (let i = 0; i < 4; i++) {
    lines.push(asstTools({ id: `a${i}`, blocks: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: { command: `curl --token deadbeef${i} tag${i}` } }] }));
    lines.push(userResults({ blocks: [{ type: 'tool_result', tool_use_id: `t${i}`, is_error: true, content: 'boom' }] }));
    lines.push(asstTools({ id: `r${i}`, blocks: [{ type: 'tool_use', id: `x${i}`, name: 'Bash', input: { command: `curl --token deadbeef${i} tag${i}` } }] }));
  }
  const s = parseSession(lines.join('\n'), { sessionId: 'w-cap', project: 'p' });
  const arr = s.waste.errorSamples['Bash other'];
  assert.strictEqual(arr.length, 3);
  for (const smp of arr) {
    assert.ok(!/deadbeef/.test(smp.target), `token leaked: ${smp.target}`);
    assert.ok(smp.target.includes('«redacted»'));
  }
});

test('redactSecrets masks values but keeps surrounding text', () => {
  assert.strictEqual(redactSecrets('export API_KEY=abc123def'), 'export API_KEY=«redacted»');
  assert.strictEqual(redactSecrets('curl --token deadbeef https://x'), 'curl --token «redacted» https://x');
  assert.strictEqual(redactSecrets('-H "Authorization: Bearer xyz"'), '-H "Authorization: «redacted»"');
  assert.strictEqual(redactSecrets('psql postgres://u:p4ss@db'), 'psql postgres://u:«redacted»@db');
  assert.strictEqual(redactSecrets('plain command with no secret'), 'plain command with no secret');
});

test('redactSecrets catches env-var style names where the keyword is glued to a prefix by _', () => {
  assert.strictEqual(redactSecrets('export DB_PASSWORD=hunter22222'), 'export DB_PASSWORD=«redacted»');
  assert.strictEqual(redactSecrets('export STRIPE_SECRET_KEY=sk_live_abcdefgh'), 'export STRIPE_SECRET_KEY=«redacted»');
  assert.strictEqual(redactSecrets('export MY_TOKEN=abcdefghijklmnop'), 'export MY_TOKEN=«redacted»');
  assert.strictEqual(
    redactSecrets('export ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890'),
    'export ANTHROPIC_API_KEY=«redacted»',
  );
});

test('redactSecrets masks glued mysql/psql-style -p<password> (no space, no keyword)', () => {
  assert.strictEqual(redactSecrets('mysql -uroot -phunter2 db'), 'mysql -uroot -p«redacted» db');
});

test('redactSecrets keeps a bare quote intact when the secret sits inside an already-quoted arg', () => {
  assert.strictEqual(
    redactSecrets('curl -H "x-api-key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890"'),
    'curl -H "x-api-key: «redacted»"',
  );
});

test('buildResponse flattens error samples across sessions', () => {
  const s = parseSession([
    asstTools({ id: 'm1', cwd: '/w/proj', blocks: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'boom' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'File does not exist' }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'boom' } }] }),
  ].join('\n'), { sessionId: 'w-br', project: 'p' });
  const r = buildResponse([s]);
  assert.deepStrictEqual(r.waste.errorSamples, [
    { tool: 'Bash', reason: 'file-not-found', target: 'boom', text: 'File does not exist' },
  ]);
});

test('mergeSessionAggregates merges waste across a main and a subagent file', () => {
  const main = parseSession([
    asstTools({ id: 'm1', cwd: '/w/proj', blocks: [
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/w/a.js' } },
      { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/w/a.js' } }, // redundant
      { type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'boom' } },
    ] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't3', is_error: true }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 't4', name: 'Bash', input: { command: 'boom' } }] }), // retry of t3
  ].join('\n'), { sessionId: 's', project: 'p' });
  const sub = parseSession([
    asstTools({ id: 's1', blocks: [{ type: 'tool_use', id: 'u1', name: 'Bash', input: { command: 'boom' } }] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 'u1', is_error: true }] }),
    asstTools({ id: 's2', blocks: [{ type: 'tool_use', id: 'u2', name: 'Bash', input: { command: 'boom' } }] }), // retry of u1
  ].join('\n'), { sessionId: 's', project: 'p' });
  const merged = mergeSessionAggregates([main, sub]);
  assert.strictEqual(merged.waste.toolCallCount, 6);
  assert.strictEqual(merged.waste.erroredToolCalls, 2);
  assert.deepStrictEqual(merged.waste.erroredByTool, { Bash: 2 });
  assert.strictEqual(merged.waste.redundantReads, 1);
  assert.deepStrictEqual(merged.waste.duplicateFiles, { '/w/a.js': 1 });
});

test('buildResponse aggregates waste and byProject across sessions in different projects', () => {
  const projA = parseSession([
    asstTools({ id: 'a1', cwd: '/w/alpha', blocks: [
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/w/alpha/x.js' } },
      { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/w/alpha/x.js' } }, // redundant
      { type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'boom' } },
    ] }),
    userResults({ blocks: [{ type: 'tool_result', tool_use_id: 't3', is_error: true }] }),
    asstTools({ id: 'a2', blocks: [{ type: 'tool_use', id: 't4', name: 'Bash', input: { command: 'boom' } }] }), // retry of t3
  ].join('\n'), { sessionId: 'A', project: 'p' });
  const projB = parseSession([
    asstTools({ id: 'b1', cwd: '/w/beta', blocks: [
      { type: 'tool_use', id: 'u1', name: 'Edit', input: { file_path: '/w/beta/y.js' } },
      { type: 'tool_use', id: 'u2', name: 'Bash', input: { command: 'boom' } },
    ] }),
    userResults({ blocks: [
      { type: 'tool_result', tool_use_id: 'u1', is_error: true },
      { type: 'tool_result', tool_use_id: 'u2', is_error: true },
    ] }),
    asstTools({ id: 'b2', blocks: [
      { type: 'tool_use', id: 'u3', name: 'Edit', input: { file_path: '/w/beta/y.js' } }, // retry of u1
      { type: 'tool_use', id: 'u4', name: 'Bash', input: { command: 'boom' } }, // retry of u2
    ] }),
  ].join('\n'), { sessionId: 'B', project: 'p' });

  const r = buildResponse([projA, projB]);
  assert.strictEqual(r.waste.erroredToolCalls, 3); // 1 + 2
  assert.strictEqual(r.waste.redundantReads, 1);
  assert.strictEqual(r.waste.duplicateFileCount, 1);
  assert.deepStrictEqual(r.waste.erroredByTool, [{ name: 'Bash', count: 2 }, { name: 'Edit', count: 1 }]);
  assert.deepStrictEqual(r.waste.topDuplicateFiles, [{ path: '/w/alpha/x.js', extraReads: 1 }]);
  // byProject sorted by (errored + redundant) desc: beta has 2, alpha has 1+1=2 → tie, both present
  assert.strictEqual(r.waste.byProject.length, 2);
  const beta = r.waste.byProject.find((p) => p.project === '/w/beta');
  const alpha = r.waste.byProject.find((p) => p.project === '/w/alpha');
  assert.deepStrictEqual(beta, { project: '/w/beta', erroredToolCalls: 2, redundantReads: 0 });
  assert.deepStrictEqual(alpha, { project: '/w/alpha', erroredToolCalls: 1, redundantReads: 1 });
});

test('buildResponse aggregates waste into a per-day trend, merged across projects', () => {
  const projA = parseSession([
    asstTools({ id: 'a1', ts: '2026-07-01T10:00:00.000Z', cwd: '/w/alpha', blocks: [
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/w/alpha/x.js' } },
      { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/w/alpha/x.js' } }, // redundant, day 1
    ] }),
  ].join('\n'), { sessionId: 'A', project: 'p' });
  const projB = parseSession([
    asstTools({ id: 'b1', ts: '2026-07-01T11:00:00.000Z', cwd: '/w/beta', blocks: [
      { type: 'tool_use', id: 'u1', name: 'Bash', input: { command: 'boom' } },
    ] }),
    userResults({ ts: '2026-07-01T11:01:00.000Z', blocks: [{ type: 'tool_result', tool_use_id: 'u1', is_error: true }] }),
    asstTools({ id: 'b2', ts: '2026-07-02T09:00:00.000Z', blocks: [
      { type: 'tool_use', id: 'u2', name: 'Bash', input: { command: 'boom' } }, // retry, day 2 — waste attributed to retry's day
    ] }),
  ].join('\n'), { sessionId: 'B', project: 'p' });

  const r = buildResponse([projA, projB]);
  assert.deepStrictEqual(r.waste.trend, [
    { date: '2026-07-01', erroredToolCalls: 0, redundantReads: 1 },
    { date: '2026-07-02', erroredToolCalls: 1, redundantReads: 0 },
  ]);
});

// ---- waste: error-reason classification ----
// Verbatim (truncated) strings pulled from real Claude Code session logs, so
// the matcher is proven against actual message shapes, not invented ones.
test('classifyErrorReason: known Claude Code error strings map to specific reasons', () => {
  assert.strictEqual(
    classifyErrorReason('<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>'),
    'edit-before-read',
  );
  assert.strictEqual(
    classifyErrorReason("The user doesn't want to proceed with this tool use. The tool use was rejected"),
    'user-rejected',
  );
  assert.strictEqual(
    classifyErrorReason('<tool_use_error>String to replace not found in file.\nString: def foo():'),
    'edit-string-not-found',
  );
  assert.strictEqual(
    classifyErrorReason('<tool_use_error>File has been modified since read, either by the user or by a linter.'),
    'stale-read',
  );
  assert.strictEqual(
    classifyErrorReason('File does not exist. Note: your current working directory is /Users/x/proj.'),
    'file-not-found',
  );
  assert.strictEqual(
    classifyErrorReason('Permission for this action was denied by the Claude Code auto mode classifier. Reason: ...'),
    'auto-mode-denied',
  );
  assert.strictEqual(
    classifyErrorReason('claude-opus-4-8[1m] is temporarily unavailable, so auto mode cannot determine the safety'),
    'model-unavailable',
  );
  assert.strictEqual(
    classifyErrorReason('Working directory "/x" was deleted; shell cwd recovered to "/Users/x"'),
    'cwd-deleted',
  );
});

test('classifyErrorReason: unrecognized text (e.g. a bare shell exit code) is "other", not guessed', () => {
  assert.strictEqual(classifyErrorReason('Exit code 1\nsome command output here'), 'other');
  assert.strictEqual(classifyErrorReason(''), 'other');
  assert.strictEqual(classifyErrorReason(undefined), 'other');
});

test('classifyErrorReason: handles array-of-text-block content shape, not just plain strings', () => {
  const content = [{ type: 'text', text: 'File does not exist. Note: cwd is /x' }];
  assert.strictEqual(classifyErrorReason(content), 'file-not-found');
});

test('waste: erroredByReason is attributed at retry time and aggregated in buildResponse', () => {
  const s = parseSession([
    asstTools({ id: 'm1', blocks: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/w/a.js' } }] }),
    userResults({ blocks: [{
      type: 'tool_result', tool_use_id: 't1', is_error: true,
      content: '<tool_use_error>String to replace not found in file.</tool_use_error>',
    }] }),
    asstTools({ id: 'm2', blocks: [{ type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: '/w/a.js' } }] }), // retry
  ].join('\n'), { sessionId: 'w-reason', project: 'p' });
  assert.deepStrictEqual(s.waste.erroredByReason, { 'edit-string-not-found': 1 });

  const r = buildResponse([s]);
  assert.deepStrictEqual(r.waste.erroredByReason, [{ reason: 'edit-string-not-found', count: 1 }]);
});
