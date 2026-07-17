#!/usr/bin/env node
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { buildResponse, buildReport, parseTurns, attributeSubagentTurns } = require('./lib/core');
const { createStore, loadConfig, sessionKeyFor } = require('./lib/scan');

const PORT = process.env.PORT || 3456;
// Loopback-only: this dashboard has no auth, so binding wider would expose
// project paths, prompts, and error samples to anyone on the LAN.
const HOST = '127.0.0.1';
const DIST_DIR = path.join(__dirname, 'web', 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');
const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
};

const config = loadConfig();
const store = createStore();

// Map a `/assets/...` URL to an absolute path inside web/dist/assets, or null if
// it would escape that directory (path-traversal guard).
function resolveAssetPath(pathname) {
  const rel = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(DIST_DIR, rel);
  return filePath.startsWith(path.join(DIST_DIR, 'assets')) ? filePath : null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/data') {
    store.refresh();
    const payload = buildResponse(store.sessions(), config);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }
  if (url.pathname === '/api/session') {
    store.refresh();
    const key = url.searchParams.get('key') || '';
    const files = store.sessionFilesFor(key);
    if (!files) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unknown session key' }));
      return;
    }
    let turns = [];
    try {
      const mainText = files.mainPath ? fs.readFileSync(files.mainPath, 'utf8') : '';
      turns = parseTurns(mainText);
      for (const p of files.subPaths) {
        attributeSubagentTurns(turns, fs.readFileSync(p, 'utf8'));
      }
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ sessionId: files.sessionId, project: files.project, turns }));
    return;
  }
  if (url.pathname === '/api/report') {
    store.refresh();
    const payload = buildResponse(store.sessions(), config);
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const md = buildReport(payload.monthly, month, new Date().toISOString().slice(0, 10));
    res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
    res.end(md);
    return;
  }
  if (url.pathname === '/') {
    fs.readFile(INDEX_HTML, (err, buf) => {
      if (err) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('web/dist/index.html not found — run `npm run build` first.');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    const filePath = resolveAssetPath(url.pathname);
    if (!filePath) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const type = MIME[path.extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': type });
      res.end(buf);
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

function start() {
  console.time('initial scan');
  store.refresh();
  console.timeEnd('initial scan');
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Start on another port: PORT=4000 npm start`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(PORT, HOST, () => {
    console.log(`Dashboard: http://localhost:${PORT} (${store.size} session files)`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { sessionKeyFor, resolveAssetPath, server, HOST };
