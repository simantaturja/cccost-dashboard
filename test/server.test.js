'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
// Requiring server.js does not start a listener (guarded by require.main).
const { sessionKeyFor, resolveAssetPath, server, HOST } = require('../server');

test('sessionKeyFor: main file vs nested subagent file share one key', () => {
  const main = sessionKeyFor('proj-dir', 'abc123.jsonl');
  assert.deepStrictEqual(main, { sessionId: 'abc123', key: 'proj-dir/abc123', isMain: true });

  const sub = sessionKeyFor('proj-dir', path.join('abc123', 'subagents', 'agent-x.jsonl'));
  assert.strictEqual(sub.sessionId, 'abc123');
  assert.strictEqual(sub.key, 'proj-dir/abc123');
  assert.strictEqual(sub.isMain, false);
});

test('resolveAssetPath: serves under assets, rejects traversal', () => {
  const ok = resolveAssetPath('/assets/index-abc.js');
  assert.ok(ok && ok.endsWith(path.join('web', 'dist', 'assets', 'index-abc.js')));

  assert.strictEqual(resolveAssetPath('/assets/../../server.js'), null);
  assert.strictEqual(resolveAssetPath('/assets/../secret'), null);
  assert.strictEqual(resolveAssetPath('/assets/../../../etc/passwd'), null);
});

test('server binds to loopback only, not every interface', () => new Promise((resolve) => {
  assert.strictEqual(HOST, '127.0.0.1');
  server.listen(0, HOST, () => {
    assert.strictEqual(server.address().address, '127.0.0.1');
    server.close(resolve);
  });
}));
