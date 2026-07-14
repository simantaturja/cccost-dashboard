'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildResponse, buildReport, parseTurns, attributeSubagentTurns } = require('../../lib/core');
const { createStore, loadConfig } = require('../../lib/scan');

let panel = null;
let statusItem = null;
let store = null;
let config = null;

function activate(context) {
  config = loadConfig();
  store = createStore();
  store.refresh();

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'cccost.open';
  statusItem.tooltip = "Claude Code — today's cost. Click for the dashboard.";
  statusItem.show();
  updateStatus();
  context.subscriptions.push(statusItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('cccost.open', () => open(context)),
  );

  // One watcher for Claude Code's logs drives both the status bar and any open panel.
  const pattern = new vscode.RelativePattern(store.projectsDir, '**/*.jsonl');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  const onChange = debounce(() => {
    updateStatus();
    post({ __cccost: true, type: 'dataChanged' });
  }, 500);
  watcher.onDidChange(onChange);
  watcher.onDidCreate(onChange);
  watcher.onDidDelete(onChange);
  context.subscriptions.push(watcher);
}

function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function updateStatus() {
  if (!statusItem) return;
  try {
    store.refresh();
    const payload = buildResponse(store.sessions(), config);
    const today = payload.daily.find((d) => d.date === todayKey());
    statusItem.text = `$(graph) $${(today ? today.costUSD : 0).toFixed(2)} today`;
  } catch {
    statusItem.text = '$(graph) cost';
  }
}

function debounce(fn, ms) {
  let t = null;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function open(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Active);
    return;
  }
  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
  panel = vscode.window.createWebviewPanel(
    'cccostDashboard',
    'Claude Code Cost Dashboard',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot],
    },
  );

  panel.webview.html = renderHtml(panel.webview, mediaRoot);

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || msg.__cccost !== true) return;
    try {
      const payload = await handle(msg);
      post({ __cccost: true, id: msg.id, payload });
    } catch (err) {
      post({ __cccost: true, id: msg.id, error: err.message });
    }
  });

  panel.onDidDispose(() => {
    panel = null;
  });
}

function post(message) {
  if (panel) panel.webview.postMessage(message);
}

async function handle(msg) {
  store.refresh();
  if (msg.type === 'data') {
    return buildResponse(store.sessions(), config);
  }
  if (msg.type === 'session') {
    const key = (msg.params && msg.params.key) || '';
    const files = store.sessionFilesFor(key);
    if (!files) throw new Error('unknown session key');
    const mainText = files.mainPath ? fs.readFileSync(files.mainPath, 'utf8') : '';
    const turns = parseTurns(mainText);
    for (const p of files.subPaths) {
      attributeSubagentTurns(turns, fs.readFileSync(p, 'utf8'));
    }
    return { sessionId: files.sessionId, project: files.project, turns };
  }
  if (msg.type === 'report') {
    const payload = buildResponse(store.sessions(), config);
    const month = (msg.params && msg.params.month) || new Date().toISOString().slice(0, 7);
    const md = buildReport(payload.monthly, month, new Date().toISOString().slice(0, 10));
    const uri = await vscode.window.showSaveDialog({
      saveLabel: 'Save report',
      filters: { Markdown: ['md'] },
      defaultUri: vscode.Uri.file(path.join(os.homedir(), `cccost-report-${month}.md`)),
    });
    if (uri) {
      fs.writeFileSync(uri.fsPath, md);
      vscode.window.showInformationMessage(`Saved cost report to ${uri.fsPath}`);
    }
    return { saved: !!uri };
  }
  throw new Error(`unknown message type: ${msg.type}`);
}

// Load the built SPA from disk, rewrite its relative asset URLs to webview URIs,
// and inject a strict CSP (scripts/styles only from the webview resource origin).
function renderHtml(webview, mediaRoot) {
  const indexPath = path.join(mediaRoot.fsPath, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const base = webview.asWebviewUri(mediaRoot).toString().replace(/\/$/, '');
  html = html.replace(/(src|href)="\.\/assets\//g, `$1="${base}/assets/`);
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
  ].join('; ');
  return html.replace(
    '<head>',
    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
