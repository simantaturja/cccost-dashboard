'use strict';
// Filesystem layer shared by the HTTP server (server.js) and the VS Code
// extension. Owns the on-disk scan of ~/.claude/projects/, a per-file mtime
// cache, and the roll-up of session files into merged aggregates. Pure of any
// transport concern (no http, no vscode) so both frontends can reuse it.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parseSession, mergeSessionAggregates } = require('./core');

function defaultProjectsDir() {
  return process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
}

// Config is the user's, not the package's — look in the working directory first,
// then ~/.config/cccost-dashboard/.
function loadConfig() {
  const candidates = [
    path.join(process.cwd(), 'config.json'),
    path.join(os.homedir(), '.config', 'cccost-dashboard', 'config.json'),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      // try next candidate
    }
  }
  return null;
}

// Layout: <project>/<sessionId>.jsonl is the main session file;
// <project>/<sessionId>/subagents/**/agent-*.jsonl belong to that session.
function sessionKeyFor(projectDir, relPath) {
  const segments = relPath.split(path.sep);
  const sessionId = segments.length === 1 ? path.basename(segments[0], '.jsonl') : segments[0];
  return { sessionId, key: `${projectDir}/${sessionId}`, isMain: segments.length === 1 };
}

// A store owns one projects directory and its file cache. Callers drive it with
// refresh() (rescan changed files), then read sessions() / sessionFilesFor().
function createStore(projectsDir = defaultProjectsDir()) {
  // filePath -> { mtimeMs, size, sessionKey, isMain, aggregate }
  const fileCache = new Map();

  function refresh() {
    const seen = new Set();
    let dirs = [];
    try {
      dirs = fs.readdirSync(projectsDir);
    } catch (err) {
      console.error(`Cannot read ${projectsDir}: ${err.message}`);
      return;
    }
    for (const dir of dirs) {
      const dirPath = path.join(projectsDir, dir);
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
        aggregate.isMain = isMain;
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
    return [...byKey.entries()].map(([key, group]) => {
      const merged = mergeSessionAggregates(group);
      merged.key = key; // pass-through link for the per-session endpoint
      return merged;
    });
  }

  // Resolve a session's on-disk files by matching the cached sessionKey. The
  // caller-supplied key is only ever compared for equality — never joined into a
  // path — so it cannot escape projectsDir.
  function sessionFilesFor(key) {
    let mainPath = null;
    const subPaths = [];
    let sessionId = null;
    let project = null;
    for (const [filePath, entry] of fileCache) {
      if (entry.sessionKey !== key) continue;
      sessionId = entry.aggregate.sessionId;
      if (entry.isMain) {
        mainPath = filePath;
        project = entry.aggregate.project;
      } else {
        subPaths.push(filePath);
        if (project == null) project = entry.aggregate.project;
      }
    }
    if (mainPath === null && subPaths.length === 0) return null;
    return { mainPath, subPaths, sessionId, project };
  }

  return {
    refresh,
    sessions,
    sessionFilesFor,
    projectsDir,
    get size() {
      return fileCache.size;
    },
  };
}

module.exports = { createStore, loadConfig, sessionKeyFor, defaultProjectsDir };
