// Transport shim. The same SPA bundle runs two ways:
//   • served by server.js in a browser  → talk to the HTTP API with fetch()
//   • hosted in a VS Code webview        → talk to the extension host via postMessage
// The webview cannot fetch localhost (CSP), so requests are RPC messages keyed
// by an incrementing id and resolved when the host posts a reply back.
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
export const IN_WEBVIEW = !!vscode;

let seq = 0;
const pending = new Map();
const dataChangedSubs = new Set();

if (IN_WEBVIEW) {
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || msg.__cccost !== true) return;
    if (msg.type === 'dataChanged') {
      dataChangedSubs.forEach((cb) => cb());
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.payload);
  });
}

function rpc(type, params) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    vscode.postMessage({ __cccost: true, id, type, params });
  });
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const api = {
  data() {
    return IN_WEBVIEW ? rpc('data') : getJSON('/api/data');
  },
  session(key) {
    return IN_WEBVIEW
      ? rpc('session', { key })
      : getJSON(`/api/session?key=${encodeURIComponent(key)}`);
  },
  // Browser downloads via the anchor href; the webview asks the host to write
  // the markdown to disk through a native save dialog.
  report(month) {
    if (IN_WEBVIEW) return rpc('report', { month });
    window.location.href = `/api/report?month=${month}`;
    return Promise.resolve();
  },
  reportHref(month) {
    return IN_WEBVIEW ? null : `/api/report?month=${month}`;
  },
  onDataChanged(cb) {
    if (!IN_WEBVIEW) return () => {};
    dataChangedSubs.add(cb);
    return () => dataChangedSubs.delete(cb);
  },
};
