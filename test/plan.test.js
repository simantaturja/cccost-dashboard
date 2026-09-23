'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { planFromAccount, buildResponse, PLAN_PRICES } = require('../lib/core');
const { loadConfig } = require('../lib/scan');

test('planFromAccount: maps Claude Code account tiers to a plan', () => {
  const pro = planFromAccount({ organizationType: 'claude_pro', userRateLimitTier: 'default' });
  assert.deepStrictEqual(pro, { label: 'Pro', subscriptionUSDPerMonth: PLAN_PRICES.pro });

  const max5 = planFromAccount({
    organizationType: 'claude_max',
    userRateLimitTier: 'default_claude_max_5x',
  });
  assert.deepStrictEqual(max5, { label: 'Max 5x', subscriptionUSDPerMonth: PLAN_PRICES.max5x });

  const max20 = planFromAccount({
    organizationType: 'claude_max',
    userRateLimitTier: 'default_claude_max_20x',
  });
  assert.deepStrictEqual(max20, {
    label: 'Max 20x',
    subscriptionUSDPerMonth: PLAN_PRICES.max20x,
  });
});

test('planFromAccount: a Team seat is priced as Team even with Max-level limits', () => {
  const premium = planFromAccount({
    organizationType: 'claude_team',
    seatTier: 'team_tier_1',
    userRateLimitTier: 'default_claude_max_5x',
  });
  assert.deepStrictEqual(premium, {
    label: 'Team Premium',
    subscriptionUSDPerMonth: PLAN_PRICES.teamPremium,
  });

  // seatTier is ignored: its naming isn't documented.
  const standard = planFromAccount({
    organizationType: 'claude_team',
    seatTier: 'team_tier_1',
    userRateLimitTier: 'default',
  });
  assert.deepStrictEqual(standard, {
    label: 'Team Standard',
    subscriptionUSDPerMonth: PLAN_PRICES.teamStandard,
  });
});

test('planFromAccount: unknown or custom-priced accounts return null', () => {
  assert.strictEqual(planFromAccount(null), null);
  assert.strictEqual(planFromAccount({}), null);
  assert.strictEqual(planFromAccount({ organizationType: 'claude_enterprise' }), null);
  assert.strictEqual(planFromAccount({ organizationType: 'something_new' }), null);
});

test('buildResponse roi.source: config beats detected beats default', () => {
  const detectedPlan = { label: 'Max 5x', subscriptionUSDPerMonth: 100 };

  const def = buildResponse([]).roi;
  assert.strictEqual(def.source, 'default');
  assert.strictEqual(def.subscriptionUSDPerMonth, 200);

  const det = buildResponse([], { detectedPlan }).roi;
  assert.strictEqual(det.source, 'detected');
  assert.strictEqual(det.planLabel, 'Max 5x');
  assert.strictEqual(det.subscriptionUSDPerMonth, 100);
  assert.strictEqual(det.configured, false);

  const cfg = buildResponse([], { subscriptionUSDPerMonth: 20, detectedPlan }).roi;
  assert.strictEqual(cfg.source, 'config');
  assert.strictEqual(cfg.subscriptionUSDPerMonth, 20);
  assert.strictEqual(cfg.planLabel, null);
});

test('loadConfig: detects the plan from CLAUDE_CONFIG_DIR/.claude.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cccost-plan-'));
  const cwd = process.cwd();
  const prev = { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR, HOME: process.env.HOME };
  try {
    // Empty cwd and HOME so no real config.json is picked up.
    process.chdir(dir);
    process.env.HOME = dir;
    process.env.CLAUDE_CONFIG_DIR = dir;
    assert.strictEqual(loadConfig(), null);

    fs.writeFileSync(
      path.join(dir, '.claude.json'),
      JSON.stringify({
        oauthAccount: {
          organizationType: 'claude_max',
          userRateLimitTier: 'default_claude_max_20x',
        },
      }),
    );
    assert.deepStrictEqual(loadConfig(), {
      detectedPlan: { label: 'Max 20x', subscriptionUSDPerMonth: PLAN_PRICES.max20x },
    });

    // An explicit price in config.json skips detection entirely.
    fs.writeFileSync(path.join(dir, 'config.json'), '{"subscriptionUSDPerMonth": 20}');
    assert.deepStrictEqual(loadConfig(), { subscriptionUSDPerMonth: 20 });
  } finally {
    process.chdir(cwd);
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
