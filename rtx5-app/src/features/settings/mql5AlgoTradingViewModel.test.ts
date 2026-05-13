import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MQL5_ALGO_PREVIEW_DATA,
  filterStrategiesByCategory,
  getActiveBotCount,
  hasConnectedAlgoAccount,
  selectAlgoCategories,
} from './mql5AlgoTradingViewModel';

test('MQL5 algo preview data exposes the requested dynamic screen objects', () => {
  assert.ok(MQL5_ALGO_PREVIEW_DATA.account);
  assert.ok(MQL5_ALGO_PREVIEW_DATA.performance);
  assert.ok(MQL5_ALGO_PREVIEW_DATA.riskSettings);
  assert.equal(MQL5_ALGO_PREVIEW_DATA.categories.length > 0, true);
  assert.equal(MQL5_ALGO_PREVIEW_DATA.featuredStrategies.length > 0, true);
  assert.equal(MQL5_ALGO_PREVIEW_DATA.activeBots.length > 0, true);
  assert.equal(MQL5_ALGO_PREVIEW_DATA.recentActivity.length > 0, true);
});

test('MQL5 algo category selection is data driven', () => {
  const selected = selectAlgoCategories(MQL5_ALGO_PREVIEW_DATA.categories, 'news');

  assert.equal(selected.find((category) => category.category_id === 'news')?.is_selected, true);
  assert.equal(selected.filter((category) => category.is_selected).length, 1);
});

test('MQL5 algo strategies filter by category, risk, and supported symbols', () => {
  const goldStrategies = filterStrategiesByCategory(MQL5_ALGO_PREVIEW_DATA.featuredStrategies, 'gold');
  const lowRiskStrategies = filterStrategiesByCategory(MQL5_ALGO_PREVIEW_DATA.featuredStrategies, 'low-risk');

  assert.equal(goldStrategies.every((strategy) => strategy.supported_symbols.join(' ').toLowerCase().includes('xau')), true);
  assert.equal(lowRiskStrategies.every((strategy) => strategy.risk_level === 'Low'), true);
});

test('MQL5 algo helpers derive account and bot state without fixed UI values', () => {
  assert.equal(hasConnectedAlgoAccount(MQL5_ALGO_PREVIEW_DATA.account), true);
  assert.equal(getActiveBotCount(MQL5_ALGO_PREVIEW_DATA.activeBots), 1);
});

test('MQL5 algo strategy copy avoids guaranteed performance language', () => {
  const combinedStrategyText = MQL5_ALGO_PREVIEW_DATA.featuredStrategies
    .flatMap((strategy) => [strategy.strategy_name, strategy.performance_summary ?? ''])
    .join(' ');

  assert.equal(/guaranteed|risk-free|sure profit/i.test(combinedStrategyText), false);
});
