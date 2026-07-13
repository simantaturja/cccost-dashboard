'use strict';

// USD per 1M tokens. First substring match wins.
const PRICING = [
  { match: 'fable-5', rates: { input: 10, output: 50, write5m: 12.5, write1h: 20, read: 1 } },
  { match: 'mythos-5', rates: { input: 10, output: 50, write5m: 12.5, write1h: 20, read: 1 } },
  { match: 'opus', rates: { input: 5, output: 25, write5m: 6.25, write1h: 10, read: 0.5 } },
  { match: 'sonnet', rates: { input: 3, output: 15, write5m: 3.75, write1h: 6, read: 0.3 } },
  { match: 'haiku', rates: { input: 1, output: 5, write5m: 1.25, write1h: 2, read: 0.1 } },
];

function getRates(model) {
  if (!model) return null;
  const entry = PRICING.find((p) => model.includes(p.match));
  return entry ? entry.rates : null;
}

function emptyTokens() {
  return { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
}

function addTokens(target, src) {
  for (const k of Object.keys(target)) target[k] += src[k];
}

function sumTokens(t) {
  return t.input + t.output + t.cacheWrite5m + t.cacheWrite1h + t.cacheRead;
}

function tokensOf(usage) {
  const cc = usage.cache_creation;
  let write5m;
  let write1h;
  if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
    write5m = cc.ephemeral_5m_input_tokens || 0;
    write1h = cc.ephemeral_1h_input_tokens || 0;
  } else {
    write5m = usage.cache_creation_input_tokens || 0;
    write1h = 0;
  }
  return {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheWrite5m: write5m,
    cacheWrite1h: write1h,
    cacheRead: usage.cache_read_input_tokens || 0,
  };
}

function costOf(tokens, rates) {
  if (!rates) return 0;
  return (
    tokens.input * rates.input +
    tokens.output * rates.output +
    tokens.cacheWrite5m * rates.write5m +
    tokens.cacheWrite1h * rates.write1h +
    tokens.cacheRead * rates.read
  ) / 1e6;
}

function parseSession(text, { sessionId, project }) {
  const byMsgId = new Map();
  let malformedLines = 0;
  let cwd = null;

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      malformedLines++;
      continue;
    }
    if (!cwd && obj.cwd) cwd = obj.cwd;
    if (obj.type !== 'assistant' || !obj.message || !obj.message.usage) continue;
    const msg = obj.message;
    const id = msg.id || obj.uuid;
    byMsgId.set(id, {
      model: msg.model || 'unknown',
      tokens: tokensOf(msg.usage),
      timestamp: obj.timestamp || null,
    });
  }

  const totals = emptyTokens();
  const models = {};
  const daily = {};
  let costUSD = 0;
  let unknownModelMessages = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;

  for (const { model, tokens, timestamp } of byMsgId.values()) {
    const rates = getRates(model);
    const cost = costOf(tokens, rates);
    if (!rates) unknownModelMessages++;
    addTokens(totals, tokens);
    costUSD += cost;

    if (!models[model]) models[model] = { tokens: emptyTokens(), costUSD: 0, messages: 0 };
    addTokens(models[model].tokens, tokens);
    models[model].costUSD += cost;
    models[model].messages++;

    if (timestamp) {
      if (!firstTimestamp || timestamp < firstTimestamp) firstTimestamp = timestamp;
      if (!lastTimestamp || timestamp > lastTimestamp) lastTimestamp = timestamp;
      const date = timestamp.slice(0, 10);
      if (!daily[date]) daily[date] = { costUSD: 0, tokens: 0 };
      daily[date].costUSD += cost;
      daily[date].tokens += sumTokens(tokens);
    }
  }

  return {
    sessionId,
    project: cwd || project,
    firstTimestamp,
    lastTimestamp,
    messages: byMsgId.size,
    tokens: totals,
    costUSD,
    models,
    daily,
    malformedLines,
    unknownModelMessages,
  };
}

function buildResponse(sessionAggregates) {
  const summary = {
    totalCostUSD: 0,
    totalTokens: 0,
    sessionCount: 0,
    projectCount: 0,
    cacheReadTokens: 0,
    cacheSavingsUSD: 0,
    unknownModelMessages: 0,
    malformedLines: 0,
  };
  const byProject = new Map();
  const byModel = new Map();
  const dailyMap = new Map();
  const sessions = [];

  for (const s of sessionAggregates) {
    summary.malformedLines += s.malformedLines;
    if (s.messages === 0) continue;
    sessions.push(s);
    summary.sessionCount++;
    summary.totalCostUSD += s.costUSD;
    summary.totalTokens += sumTokens(s.tokens);
    summary.cacheReadTokens += s.tokens.cacheRead;
    summary.unknownModelMessages += s.unknownModelMessages;

    let p = byProject.get(s.project);
    if (!p) byProject.set(s.project, (p = { project: s.project, costUSD: 0, tokens: 0, sessionCount: 0 }));
    p.costUSD += s.costUSD;
    p.tokens += sumTokens(s.tokens);
    p.sessionCount++;

    for (const [model, m] of Object.entries(s.models)) {
      let e = byModel.get(model);
      if (!e) byModel.set(model, (e = { model, costUSD: 0, tokens: 0, cacheRead: 0, messages: 0 }));
      e.costUSD += m.costUSD;
      e.tokens += sumTokens(m.tokens);
      e.cacheRead += m.tokens.cacheRead;
      e.messages += m.messages;
      const rates = getRates(model);
      if (rates) summary.cacheSavingsUSD += (m.tokens.cacheRead * (rates.input - rates.read)) / 1e6;
    }

    for (const [date, d] of Object.entries(s.daily)) {
      let e = dailyMap.get(date);
      if (!e) dailyMap.set(date, (e = { date, costUSD: 0, tokens: 0 }));
      e.costUSD += d.costUSD;
      e.tokens += d.tokens;
    }
  }

  summary.projectCount = byProject.size;
  sessions.sort((a, b) => b.costUSD - a.costUSD);

  return {
    generatedAt: new Date().toISOString(),
    summary,
    byProject: [...byProject.values()].sort((a, b) => b.costUSD - a.costUSD),
    byModel: [...byModel.values()].sort((a, b) => b.costUSD - a.costUSD),
    daily: [...dailyMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    sessions,
  };
}

module.exports = { getRates, parseSession, buildResponse, sumTokens };
