import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChartMarketOrderPayload,
  CHART_TRADE_ACTIONS,
} from '../../src/features/chart/chartTradeActions.ts';
import {
  assertTradeSide,
  normalizeTradeSide,
} from '../../src/domain/tradeSide.ts';

const repoRoot = process.cwd();

const readSource = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), 'utf8');

test('chart trade buttons keep buy and sell press handlers mapped to the matching side', () => {
  const source = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const actionSource = readSource('src/features/chart/chartTradeActions.ts');

  assert.match(source, /onPress=\{\(\) => handleTrade\('sell'\)\}/);
  assert.equal(CHART_TRADE_ACTIONS.sell.side, 'sell');
  assert.equal(CHART_TRADE_ACTIONS.sell.buttonPressed, 'sell');
  assert.equal(CHART_TRADE_ACTIONS.sell.displayLabel, 'SELL');
  assert.equal(CHART_TRADE_ACTIONS.sell.priceSource, 'bid');
  assert.match(actionSource, /marketTestID: 'chart-trade-sell-market-button'/);

  assert.match(source, /onPress=\{\(\) => handleTrade\('buy'\)\}/);
  assert.equal(CHART_TRADE_ACTIONS.buy.side, 'buy');
  assert.equal(CHART_TRADE_ACTIONS.buy.buttonPressed, 'buy');
  assert.equal(CHART_TRADE_ACTIONS.buy.displayLabel, 'BUY');
  assert.equal(CHART_TRADE_ACTIONS.buy.priceSource, 'ask');
  assert.match(actionSource, /marketTestID: 'chart-trade-buy-market-button'/);

  assert.match(actionSource, /testID: 'chart-trade-sell-button'/);
  assert.match(actionSource, /testID: 'chart-trade-buy-button'/);
  assert.match(source, /side: action\.side/);
  assert.match(source, /const payload = buildChartMarketOrderPayload\(/);
  assert.match(source, /tradeTapLockRef\.current \|\| sharedLockSide !== null \|\| isPending/);
  assert.match(source, /const currentChartSymbol = useUserPreferences\(\(s\) => s\.chartSymbol\)/);
  assert.match(source, /const stateChartSymbol = useUserPreferences\.getState\(\)\.chartSymbol/);
  assert.match(source, /reason: 'stale-symbol'/);
  assert.match(source, /disabled=\{isPending \|\| !isCurrentChartSymbol\}/);
});

test('chart market order payload keeps the pressed side on first trades and symbol switches', () => {
  assert.equal(normalizeTradeSide('BUY'), 'buy');
  assert.equal(normalizeTradeSide(' sell '), 'sell');
  assert.equal(assertTradeSide('Sell'), 'sell');

  assert.equal(buildChartMarketOrderPayload({
    accountLogin: 1001,
    symbol: 'EURUSD',
    side: 'buy',
    volume: 0.1,
  }).side, 'buy');

  assert.equal(buildChartMarketOrderPayload({
    accountLogin: 1001,
    symbol: 'EURUSD',
    side: 'sell',
    volume: 0.1,
  }).side, 'sell');

  for (const symbol of ['XAUUSD', 'BTCUSD']) {
    assert.deepEqual(
      buildChartMarketOrderPayload({
        accountLogin: 1001,
        symbol,
        side: 'buy',
        volume: 0.1,
      }),
      {
        account_login: 1001,
        symbol,
        side: 'buy',
        volume: 0.1,
      },
    );
  }
});

test('chart trade diagnostics log pressed side, payload side, and response side', () => {
  const buttonSource = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const querySource = readSource('src/query/orders.ts');
  const apiSource = readSource('src/api/orders.ts');

  assert.match(buttonSource, /\[TRADE-BUTTON-PRESS\]/);
  assert.match(buttonSource, /sidePassedToHandler: action\.side/);
  assert.match(buttonSource, /\[TRADE-PAYLOAD\]/);
  assert.match(querySource, /\[TRADE-PAYLOAD\]/);
  assert.match(apiSource, /const requestedSide = assertTradeSide\(restWithoutBroker\.side\)/);
  assert.match(apiSource, /side: requestedSide/);
  assert.match(apiSource, /\[TRADE-RESPONSE\]/);
});

test('chart trade button rows use ltr layout so buy and sell touch targets cannot mirror', () => {
  const source = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');

  assert.match(source, /chartTradeMarketActionRow:\s*\{[\s\S]*?direction:\s*'ltr'/);
  assert.match(source, /tradeControlsRow:\s*\{[\s\S]*?direction:\s*'ltr'/);
  assert.match(source, /setActiveSide\(null\);[\s\S]*?\}, \[symbol\]\);/);
  assert.doesNotMatch(
    source.slice(source.indexOf('actionButtonSlot:'), source.indexOf('actionLotSlot:')),
    /position:\s*'absolute'/,
  );
});

test('order ticket buy and sell execution buttons call the matching side', () => {
  const source = readSource('src/features/trade/OrderTicketScreen.tsx');

  assert.match(source, /side: TRADE_SIDE\.sell[\s\S]*displayLabel: 'SELL'[\s\S]*marketLabel: 'SELL BY MARKET'[\s\S]*priceLabel: 'BID'/);
  assert.match(source, /side: TRADE_SIDE\.buy[\s\S]*displayLabel: 'BUY'[\s\S]*marketLabel: 'BUY BY MARKET'[\s\S]*priceLabel: 'ASK'/);
  assert.match(source, /onPress=\{\(\) => \{ void handlePlaceOrder\(sellTradeAction\.side\); \}\}/);
  assert.match(source, /onPress=\{\(\) => \{ void handlePlaceOrder\(buyTradeAction\.side\); \}\}/);
  assert.match(source, /onPress=\{\(\) => \{ void handlePlaceOrder\(action\.side\); \}\}/);
  assert.match(source, /routeSide: routeSide \?\? null/);
  assert.match(source, /const tradeTapLockSideRef = useRef<TradeSide \| null>\(null\)/);
  assert.match(source, /lockSide: tradeTapLockSideRef\.current \?\? pendingSide/);
  assert.match(source, /reason: tradeTapLockRef\.current[\s\S]*\? 'tap-lock'/);
  assert.match(source, /pricePanel:\s*\{[\s\S]*?direction:\s*'ltr'/);
  assert.match(source, /execRow:\s*\{[\s\S]*?direction:\s*'ltr'/);
});

test('web chart trade buttons keep labels, prices, and payload side aligned', () => {
  const source = readSource('src/features/chart/ChartScreen.web.tsx');

  assert.match(source, /const action = getChartTradeAction\(side\)/);
  assert.match(source, /const payload = buildChartMarketOrderPayload\(/);
  assert.match(source, /side: action\.side/);
  assert.match(source, /router\.push\(\{ pathname: '\/trade\/order-ticket', params: \{ symbol, side: action\.side \} \}\)/);
  assert.match(source, /sellAction\.displayLabel[\s\S]*@ \{\(latestBid \|\| 0\)\.toFixed\(displayDecimals\)\}/);
  assert.match(source, /buyAction\.displayLabel[\s\S]*@ \{\(latestAsk \|\| 0\)\.toFixed\(displayDecimals\)\}/);
});

test('chart trade rows are remounted by symbol so first trade after symbol switch uses fresh responders', () => {
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const featureSource = readSource('src/features/chart/components/ChartTradeFeature.tsx');
  const buttonSource = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');

  assert.match(chartSource, /key=\{`chart-trade-hidden-sheet-\$\{chartSymbol\}`\}/);
  assert.match(chartSource, /key=\{`chart-trade-inline-host-\$\{chartSymbol\}`\}/);
  assert.match(chartSource, /key=\{`chart-trade-inline-sheet-host-\$\{chartSymbol\}`\}/);
  assert.match(featureSource, /key=\{`chart-trade-sheet-market-\$\{sheet\.chartSymbol\}`\}/);
  assert.match(featureSource, /key=\{`chart-trade-footer-dock-\$\{sheet\.chartSymbol\}`\}/);
  assert.match(featureSource, /key=\{`chart-trade-inline-footer-\$\{chartSymbol\}`\}/);
  assert.match(featureSource, /sheet\.showHiddenInlineTradeSheet \? \(\s*<Animated\.View\s+pointerEvents="none"/);
  assert.match(featureSource, /pointerEvents=\{tradeFooterDockVisible \? 'auto' : 'none'\}/);
  assert.match(featureSource, /const inlineFooterReceivesTouches = !showFloatingFooterTradeRow && !hideInlineTradeRow;/);
  assert.match(featureSource, /pointerEvents=\{inlineFooterReceivesTouches \? 'auto' : 'none'\}/);
  assert.match(buttonSource, /let chartTradeButtonSharedLockSide: TradeSide \| null = null;/);
  assert.match(buttonSource, /acquireChartTradeButtonSharedLock\(action\.side\)/);
  assert.match(buttonSource, /reason: tradeTapLockRef\.current \? 'tap-lock' : sharedLockSide !== null \? 'shared-tap-lock' : 'mutation-pending'/);
  assert.match(buttonSource, /releaseChartTradeButtonSharedLock\(tradeTapLockSideRef\.current\);[\s\S]*?\}, \[symbol\]\);/);
  assert.match(buttonSource, /currentChartSymbol: stateChartSymbol/);
});
