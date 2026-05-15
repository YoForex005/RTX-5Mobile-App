import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTradingAccountBadgeLabel,
  getTradingAccountTypeFromBackend,
  getTradingAccountRibbonLabel,
  getTradingAccountType,
  isDemoTradingAccount,
} from './accountType';

test('detects demo accounts from the backend group name', () => {
  assert.equal(getTradingAccountType('demo_standard'), 'demo');
  assert.equal(getTradingAccountType('Demo\\STD'), 'demo');
  assert.equal(isDemoTradingAccount('demo_standard'), true);
  assert.equal(getTradingAccountRibbonLabel('demo_standard'), 'Demo');
  assert.equal(getTradingAccountBadgeLabel('demo_standard'), 'Demo');
});

test('keeps contest as a distinct type but displays it as real in ribbons', () => {
  assert.equal(getTradingAccountType('contest_round1'), 'contest');
  assert.equal(isDemoTradingAccount('contest_round1'), false);
  assert.equal(getTradingAccountRibbonLabel('contest_round1'), 'Real');
  assert.equal(getTradingAccountBadgeLabel('contest_round1'), 'Live');
});

test('treats non-demo groups as real accounts', () => {
  assert.equal(getTradingAccountType('real_standard'), 'real');
  assert.equal(getTradingAccountType('live\\ecn'), 'real');
  assert.equal(isDemoTradingAccount('real_standard'), false);
  assert.equal(getTradingAccountRibbonLabel('real_standard'), 'Real');
  assert.equal(getTradingAccountBadgeLabel('real_standard'), 'Live');
});

test('detects login account type from backend auth payload aliases', () => {
  assert.equal(getTradingAccountTypeFromBackend({ account_type: 'demo account' }), 'demo');
  assert.equal(getTradingAccountTypeFromBackend({ accountType: 'contest account' }), 'contest');
  assert.equal(getTradingAccountTypeFromBackend({ user: { account: { group: 'Demo\\STD' } } }), 'demo');
  assert.equal(getTradingAccountTypeFromBackend({ account: { is_contest: true } }), 'contest');
  assert.equal(getTradingAccountTypeFromBackend({ is_demo: false, group: 'real_standard' }), 'real');
});
