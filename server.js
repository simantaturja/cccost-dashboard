'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parseSession, buildResponse, mergeSessionAggregates, buildReport } = require('./lib/core');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const PORT = process.env.PORT || 3456;
const INDEX_HTML = path.join(__dirname, 'public', 'index.html');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  } catch {
    return null;
  }
}
const config = loadConfig();

// filePath -> { mtimeMs, size, sessionKey, aggregate }
const fileCache = new Map();

// Layout: <project>/<sessionId>.jsonl is the main session file;
// <project>/<sessionId>/subagents/**/agent-*.jsonl belong to that session.
function sessionKeyFor(projectDir, relPath) {
  const segments = relPath.split(path.sep);
  const sessionId = segments.length === 1 ? path.basename(segments[0], '.jsonl') : segments[0];
  return { sessionId, key: `${projectDir}/${sessionId}`, isMain: segments.length === 1 };
}

function refresh() {
  const seen = new Set();
  let dirs = [];
  try {
    dirs = fs.readdirSync(PROJECTS_DIR);
  } catch (err) {
    console.error(`Cannot read ${PROJECTS_DIR}: ${err.message}`);
    return;
  }
  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { recursive: true });
    } catch {
      continue;
    }
    for (const rel of entries) {
      if (!rel.endsWith('.jsonl')) continue;
      const filePath = path.join(dirPath, rel);
      seen.add(filePath);
      let st;
      try {
        st = fs.statSync(filePath);
      } catch {
        continue;
      }
      const cached = fileCache.get(filePath);
      if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) continue;
      let text;
      try {
        text = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
      const { sessionId, key, isMain } = sessionKeyFor(dir, rel);
      const aggregate = parseSession(text, { sessionId, project: dir });
      fileCache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, sessionKey: key, isMain, aggregate });
    }
  }
  for (const key of fileCache.keys()) {
    if (!seen.has(key)) fileCache.delete(key);
  }
}

function sessions() {
  const byKey = new Map();
  for (const entry of fileCache.values()) {
    let group = byKey.get(entry.sessionKey);
    if (!group) byKey.set(entry.sessionKey, (group = []));
    // main session file first so its cwd/project label wins
    if (entry.isMain) group.unshift(entry.aggregate);
    else group.push(entry.aggregate);
  }
  return [...byKey.values()].map(mergeSessionAggregates);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/data') {
    refresh();
    const payload = buildResponse(sessions(), config);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }
  if (url.pathname === '/api/report') {
    refresh();
    const payload = buildResponse(sessions(), config);
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const md = buildReport(payload.byClient, month, new Date().toISOString().slice(0, 10));
    res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
    res.end(md);
    return;
  }
  if (url.pathname === '/') {
    fs.readFile(INDEX_HTML, (err, buf) => {
      if (err) {
        res.writeHead(500);
        res.end('index.html missing');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

console.time('initial scan');
refresh();
console.timeEnd('initial scan');
server.listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT} (${fileCache.size} session files)`);
});
