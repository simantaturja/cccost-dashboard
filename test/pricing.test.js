'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { getRates } = require('../lib/core');

const known = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'known-models.json'), 'utf8'),
);

// The rate each known model ID must resolve to. Written out per ID rather than
// derived, so a new PRICING entry that steals an existing ID's substring match
// fails here instead of silently repricing it.
const EXPECTED_INPUT = {
  'claude-opus-5': 5,
  'claude-opus-4-8': 5,
  'claude-fable-5': 10,
  'claude-sonnet-5': 2,
  'claude-haiku-4-5-20251001': 1,
  opus: 5,
  sonnet: 3,
  haiku: 1,
};

test('every known model ID resolves to a rate', () => {
  for (const id of known.priced) {
    const rates = getRates(id);
    assert.ok(rates, `${id} resolved to no pricing entry`);
    for (const key of ['input', 'output', 'write5m', 'write1h', 'read']) {
      assert.ok(rates[key] > 0, `${id}.${key} is not a positive rate`);
    }
  }
});

test('known model IDs resolve to the expected input rate', () => {
  for (const [id, expected] of Object.entries(EXPECTED_INPUT)) {
    assert.strictEqual(getRates(id).input, expected, `${id} input rate moved`);
  }
});

test('intentionally unpriced IDs stay unpriced', () => {
  for (const id of known.intentionallyUnpriced) {
    assert.strictEqual(getRates(id), null, `${id} unexpectedly resolved to a rate`);
  }
});

// Anthropic's cache rates are fixed multiples of the input rate. Asserting the
// multiples catches a typo in a single cache field, which no other test would.
test('cache rates hold their multiples of the input rate', () => {
  for (const id of known.priced) {
    const r = getRates(id);
    assert.strictEqual(r.write5m, r.input * 1.25, `${id} 5m cache-write multiple`);
    assert.strictEqual(r.write1h, r.input * 2, `${id} 1h cache-write multiple`);
    assert.ok(Math.abs(r.read - r.input * 0.1) < 1e-9, `${id} cache-read multiple`);
  }
});

test('every model ID in the demo fixtures is a known model', () => {
  const demoDir = path.join(__dirname, '..', 'demo', 'projects');
  const ids = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.jsonl')) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/"model":"([^"]*)"/g)) {
          ids.add(m[1]);
        }
      }
    }
  };
  walk(demoDir);
  assert.ok(ids.size > 0, 'no model IDs found in demo fixtures');
  for (const id of ids) {
    assert.ok(
      known.priced.includes(id) || known.intentionallyUnpriced.includes(id),
      `demo fixture uses unknown model ID ${id} — add it to known-models.json`,
    );
  }
});
