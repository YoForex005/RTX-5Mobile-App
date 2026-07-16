import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

// Reads either a single .ts file (legacy) or concatenates every .ts file in a
// folder of the same name (post 500-line refactor — e.g. `api/orders.ts` was
// split into `api/orders/` with multiple files).
const readSource = (relativePath: string): string => {
  const filePath = join(repoRoot, relativePath);
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf8');
  }
  const folderPath = filePath.replace(/\.tsx?$/, '');
  if (existsSync(folderPath) && statSync(folderPath).isDirectory()) {
    return readdirSync(folderPath)
      .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
      .map((entry) => readFileSync(join(folderPath, entry), 'utf8'))
      .join('\n');
  }
  throw new Error(`source not found: ${relativePath}`);
};

test('chart trade buttons keep buy and sell press handlers mapped to the matching side', () => {
  const source = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const handlerSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');
  const actionSource = readSource('src/features/chart/chartTradeActions.ts');

  assert.match(source, /onPressIn=\{\(\) => handleTrade\('sell'\)\}/);
  assert.match(
    source,
    /onPressIn=\{\(\) => handleTrade\('sell'\)\}[\s\S]*unstable_pressDelay=\{0\}[\s\S]*accessibilityLabel=\{sellAction\.marketAccessibilityLabel\}[\s\S]*testID=\{sellAction\.marketTestID\}/,
  );
  assert.equal(CHART_TRADE_ACTIONS.sell.side, 'sell');
  assert.equal(CHART_TRADE_ACTIONS.sell.buttonPressed, 'sell');
  assert.equal(CHART_TRADE_ACTIONS.sell.displayLabel, 'SELL');
  assert.equal(CHART_TRADE_ACTIONS.sell.priceSource, 'bid');
  assert.match(actionSource, /marketTestID: 'chart-trade-sell-market-button'/);

  assert.match(source, /onPressIn=\{\(\) => handleTrade\('buy'\)\}/);
  assert.match(
    source,
    /onPressIn=\{\(\) => handleTrade\('buy'\)\}[\s\S]*unstable_pressDelay=\{0\}[\s\S]*accessibilityLabel=\{buyAction\.marketAccessibilityLabel\}[\s\S]*testID=\{buyAction\.marketTestID\}/,
  );
  assert.equal(CHART_TRADE_ACTIONS.buy.side, 'buy');
  assert.equal(CHART_TRADE_ACTIONS.buy.buttonPressed, 'buy');
  assert.equal(CHART_TRADE_ACTIONS.buy.displayLabel, 'BUY');
  assert.equal(CHART_TRADE_ACTIONS.buy.priceSource, 'ask');
  assert.match(actionSource, /marketTestID: 'chart-trade-buy-market-button'/);

  assert.match(actionSource, /testID: 'chart-trade-sell-button'/);
  assert.match(actionSource, /testID: 'chart-trade-buy-button'/);
  assert.match(handlerSource, /side: action\.side/);
  assert.match(handlerSource, /const payload = buildChartMarketOrderPayload\(/);
  assert.match(handlerSource, /const placeOrder = usePlaceOrderExecutor\(\);/);
  assert.match(handlerSource, /tradeTapLockRef\.current \|\| sharedLockSide !== null/);
  assert.doesNotMatch(handlerSource, /sharedLockSide !== null \|\| isPending/);
  assert.doesNotMatch(handlerSource, /usePlaceOrderMutation/);
  assert.match(handlerSource, /const currentChartSymbol = useUserPreferences\(\(s\) => s\.chartSymbol\)/);
  assert.match(handlerSource, /const stateChartSymbol = useUserPreferences\.getState\(\)\.chartSymbol/);
  assert.match(handlerSource, /reason: 'stale-symbol'/);
  assert.match(handlerSource, /const chartTradeActionDisabled = !isCurrentChartSymbol;/);
  assert.match(
    handlerSource,
    /placeOrder\(payload,[\s\S]*?\}\);\s*releaseTradeTapLock\(CHART_TRADE_TAP_RELEASE_DELAY_MS\);/,
  );
  assert.match(source, /const tradeBlocked = chartTradeActionDisabled \|\| lotInvalid/);
  assert.match(source, /disabled=\{tradeBlocked\}/);
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
  assert.match(buttonSource, /EXPO_PUBLIC_DEBUG_CHART_TRADE/);
  assert.match(buttonSource, /logChartTradeDiagnostic\('\[TRADE-BUTTON-PRESS\]'/);
  assert.match(buttonSource, /sidePassedToHandler: action\.side/);
  assert.match(buttonSource, /\[TRADE-PAYLOAD\]/);
  assert.match(querySource, /EXPO_PUBLIC_DEBUG_CHART_TRADE/);
  assert.match(querySource, /logOrderDiagnostic\('\[TRADE-PAYLOAD\]'/);
  assert.match(querySource, /\[TRADE-PAYLOAD\]/);
  assert.match(apiSource, /const requestedSide = assertTradeSide\(restWithoutBroker\.side\)/);
  assert.match(apiSource, /side: requestedSide/);
  assert.match(apiSource, /EXPO_PUBLIC_DEBUG_CHART_TRADE/);
  assert.match(apiSource, /logOrderDiagnostic\('\[TRADE-RESPONSE\]'/);
  assert.match(apiSource, /\[TRADE-RESPONSE\]/);
  assert.doesNotMatch(querySource, /console\.log\('\[TRADE-PAYLOAD\]'/);
  assert.doesNotMatch(apiSource, /console\.log\('\[TRADE-PAYLOAD\]'/);
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

test('compact footer lot chevrons open range picker without opening manual lot edit', () => {
  const buttonSource = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const stylesSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/styles.ts');
  const increaseButtonIndex = buttonSource.indexOf('testID="chart-trade-lot-increase-button"');
  const editButtonIndex = buttonSource.indexOf('testID="chart-trade-lot-edit-button"');
  const decreaseButtonIndex = buttonSource.indexOf('testID="chart-trade-lot-decrease-button"');

  assert.match(
    buttonSource,
    /const LOT_ADJUST_HIT_SLOP = \{ top: 8, bottom: 8, left: 6, right: 6 \} as const;/,
  );
  assert.match(
    buttonSource,
    /const LOT_VALUE_HIT_SLOP = \{ top: 8, bottom: 8, left: 0, right: 0 \} as const;/,
  );
  assert.match(
    buttonSource,
    /onPress=\{handleDecreaseLotPress\}[\s\S]*testID="chart-trade-lot-decrease-button"[\s\S]*hitSlop=\{LOT_ADJUST_HIT_SLOP\}[\s\S]*activateOnPressIn/,
  );
  assert.match(buttonSource, /return \(\) => lotPickerAction\('decrease'\);/);
  assert.match(
    buttonSource,
    /onPress=\{handleIncreaseLotPress\}[\s\S]*testID="chart-trade-lot-increase-button"[\s\S]*hitSlop=\{LOT_ADJUST_HIT_SLOP\}[\s\S]*activateOnPressIn/,
  );
  assert.match(buttonSource, /return \(\) => lotPickerAction\('increase'\);/);
  assert.match(
    buttonSource,
    /onPress=\{handleLotCenterPress\}[\s\S]*hitSlop=\{LOT_VALUE_HIT_SLOP\}[\s\S]*testID="chart-trade-lot-edit-button"/,
  );
  assert.doesNotMatch(
    buttonSource,
    /style=\{baseStyles\.actionLotPill\}[\s\S]{0,260}hitSlop=\{8\}/,
  );
  assert.match(
    stylesSource,
    /actionLotAdjustButton:\s*\{[\s\S]*zIndex:\s*2[\s\S]*elevation:\s*2/,
  );
  assert.ok(increaseButtonIndex >= 0, 'increase lot button should render in compact footer');
  assert.ok(editButtonIndex >= 0, 'lot edit button should render in compact footer');
  assert.ok(decreaseButtonIndex >= 0, 'decrease lot button should render in compact footer');
  assert.ok(
    decreaseButtonIndex < editButtonIndex && editButtonIndex < increaseButtonIndex,
    'compact footer lot controls should render decrease-left, value-center, increase-right',
  );
});

test('compact footer lot slot paints the full center area in dark theme', () => {
  const buttonSource = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const stylesSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/styles.ts');

  assert.match(
    buttonSource,
    /<View style=\{\[baseStyles\.tradeControlsRow, themeStyles\.tradeControlsRow\]\}>/,
  );
  assert.match(
    buttonSource,
    /<View style=\{\[baseStyles\.actionLotSlot, themeStyles\.actionLotSlot\]\}>/,
  );
  assert.match(
    stylesSource,
    /actionLotSlot:\s*\{[\s\S]*alignSelf:\s*'stretch'[\s\S]*height:\s*COMPACT_TRADE_FOOTER_ROW_HEIGHT[\s\S]*overflow:\s*'hidden'/,
  );
  assert.match(
    stylesSource,
    /export const darkStyles[\s\S]*actionLotSlot:\s*\{ backgroundColor: '#1F2937' \}/,
  );
  assert.match(
    stylesSource,
    /export const lightStyles[\s\S]*actionLotControl:\s*\{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' \}[\s\S]*actionLotControlPicker:\s*\{ borderColor: '#CBD5E1' \}/,
  );
  assert.match(
    stylesSource,
    /export const darkStyles[\s\S]*tradeControlsRow:\s*\{ borderColor: '#334155' \}[\s\S]*actionLotControl:\s*\{ backgroundColor: '#1F2937', borderColor: '#334155' \}[\s\S]*actionLotControlPicker:\s*\{ borderColor: '#334155' \}/,
  );
  assert.doesNotMatch(
    stylesSource,
    /actionLotControlPicker:\s*\{ borderColor: 'transparent' \}/,
  );
});

test('compact footer buy and sell prices stay right aligned independently from labels', () => {
  const buttonSource = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const stylesSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/styles.ts');

  assert.doesNotMatch(buttonSource, /TRADE_BUTTON_PRICE_FLASH|ChartTradeButtonPriceFlash|Animated\.View/);
  assert.match(buttonSource, /const TRADE_BUTTON_PRICE_REPAINT_MS = 160/);
  assert.match(buttonSource, /const TRADE_BUTTON_PRICE_TEXT_COLOR = '#FFFFFF'/);
  assert.match(buttonSource, /const TRADE_BUTTON_VALUE_GLOW_RADIUS = 8/);
  assert.match(buttonSource, /const ChartTradeButtonPriceText = React\.memo/);
  assert.match(buttonSource, /previousTextRef\.current = text/);
  assert.match(buttonSource, /Animated\.timing\(flashProgress/);
  assert.match(buttonSource, /useNativeDriver: false/);
  assert.match(buttonSource, /flashProgress\.interpolate/);
  assert.match(buttonSource, /textShadowRadius: flashShadowRadius/);
  assert.match(buttonSource, /opacity: 1/);
  assert.match(
    stylesSource,
    /actionBtn:\s*\{[\s\S]*justifyContent:\s*'center'[\s\S]*alignItems:\s*'center'[\s\S]*position:\s*'relative'/,
  );
  assert.match(
    stylesSource,
    /actionBtnHeader:\s*\{[\s\S]*position:\s*'absolute'[\s\S]*top:\s*2[\s\S]*left:\s*6/,
  );
  assert.match(
    stylesSource,
    /actionBtnPriceText:\s*\{[\s\S]*width:\s*'100%'[\s\S]*textAlign:\s*'right'[\s\S]*paddingRight:\s*6[\s\S]*includeFontPadding:\s*false/,
  );
  assert.match(
    buttonSource,
    /<Animated\.Text[\s\S]*color: TRADE_BUTTON_PRICE_TEXT_COLOR[\s\S]*opacity: 1[\s\S]*textShadowRadius: flashShadowRadius[\s\S]*testID=\{testID\}/,
  );
});

test('compact footer buy and sell backgrounds cover the full button slots', () => {
  const stylesSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/styles.ts');
  const buttonSource = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const chartStylesSource = readSource('src/features/chart/ChartScreen.styles.ts');

  assert.match(
    stylesSource,
    /export const COMPACT_TRADE_FOOTER_ROW_HEIGHT = 40;/,
  );
  assert.match(
    chartStylesSource,
    /bottomArea:\s*\{[\s\S]*paddingBottom:\s*0/,
  );
  assert.match(
    stylesSource,
    /tradeControlsRow:\s*\{[\s\S]*borderTopWidth:\s*1,\s*borderBottomWidth:\s*1/,
  );
  assert.match(
    stylesSource,
    /actionButtonSlot:\s*\{[\s\S]*alignItems:\s*'stretch'[\s\S]*alignSelf:\s*'stretch'[\s\S]*height:\s*COMPACT_TRADE_FOOTER_ROW_HEIGHT[\s\S]*overflow:\s*'hidden'/,
  );
  assert.match(
    stylesSource,
    /actionBtn:\s*\{[\s\S]*width:\s*'100%'[\s\S]*height:\s*'100%'[\s\S]*alignSelf:\s*'stretch'[\s\S]*minHeight:\s*COMPACT_TRADE_FOOTER_ROW_HEIGHT/,
  );
  assert.match(
    buttonSource,
    /<View style=\{\[baseStyles\.actionButtonSlot, \{ backgroundColor: sellTileColor \}\]\}>/,
  );
  assert.match(
    buttonSource,
    /<View style=\{\[baseStyles\.actionButtonSlot, \{ backgroundColor: buyTileColor \}\]\}>/,
  );
  assert.match(
    buttonSource,
    /\{ backgroundColor: sellTileColor,[\s\S]*?testID=\{sellAction\.testID\}/,
  );
  assert.match(
    buttonSource,
    /\{ backgroundColor: buyTileColor,[\s\S]*?testID=\{buyAction\.testID\}/,
  );
});

test('compact footer buy and sell tile colors stay fixed to their side', () => {
  const buttonSource = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const quoteSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/quoteFallback.ts');

  assert.match(
    buttonSource,
    /const sellTileColor = sellColor;/,
  );
  assert.match(
    buttonSource,
    /const buyTileColor = buyColor;/,
  );
  assert.doesNotMatch(buttonSource, /previousBidRef|previousAskRef|sellTileVisual|buyTileVisual/);
  assert.doesNotMatch(quoteSource, /resolveChartTradeButtonPriceColor|direction = 'up'|direction = 'down'/);
  assert.match(buttonSource, /const formattedBid = hasLiveBid \? latestBid\.toFixed\(displayDecimals\) : '---'/);
  assert.match(buttonSource, /const formattedAsk = hasLiveAsk \? latestAsk\.toFixed\(displayDecimals\) : '---'/);
  assert.match(
    buttonSource,
    /<ChartTradeButtonPriceText text=\{formattedBid\} testID="chart-trade-sell-price-text" \/>/,
  );
  assert.match(
    buttonSource,
    /<ChartTradeButtonPriceText text=\{formattedAsk\} testID="chart-trade-buy-price-text" \/>/,
  );
  assert.doesNotMatch(
    buttonSource,
    /chart-trade-sell-price-text"[\s\S]{0,120}formattedAsk|chart-trade-buy-price-text"[\s\S]{0,120}formattedBid/,
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

test('trade buttons keep the busy visual state on only the pressed side', () => {
  const chartSource = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const handlerSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');
  const ticketSource = readSource('src/features/trade/OrderTicketScreen.tsx');

  assert.match(
    handlerSource,
    /const isChartTradeActionBusy = \(side: TradeSide\) => activeSide === side && tradeTapLockRef\.current;/,
  );
  assert.match(
    handlerSource,
    /const isChartTradeActionVisuallyLocked = \(side: TradeSide\) =>[\s\S]*!isCurrentChartSymbol \|\| activeSide === side;/,
  );
  assert.match(handlerSource, /clearActiveTradeSide\(lockedSide, delayMs\);/);
  assert.match(chartSource, /busy: isChartTradeActionBusy\('sell'\)/);
  assert.match(chartSource, /busy: isChartTradeActionBusy\('buy'\)/);
  assert.doesNotMatch(handlerSource, /isPending \|\| tradeTapLockRef\.current/);
  assert.doesNotMatch(chartSource, /isPending/);

  assert.match(
    ticketSource,
    /const getPricePanelActionOpacity = \(side: TradeSide\) =>[\s\S]*pricePanelActionUnavailable \|\| isTradeActionPending\(side\) \? 0\.5 : 1;/,
  );
  assert.match(ticketSource, /opacity: getPricePanelActionOpacity\(sellTradeAction\.side\)/);
  assert.match(ticketSource, /opacity: getPricePanelActionOpacity\(buyTradeAction\.side\)/);
  assert.match(ticketSource, /busy: isTradeActionPending\(sellTradeAction\.side\)/);
  assert.match(ticketSource, /busy: isTradeActionPending\(buyTradeAction\.side\)/);
  assert.match(ticketSource, /isTradeActionPending\(action\.side\) && styles\.execBtnBusy/);
  assert.doesNotMatch(ticketSource, /pricePanelActionDisabled \? 0\.5 : 1/);
});

test('trade feedback modal clearly differentiates buy and sell success popups', () => {
  const source = readSource('src/ui/components/TradeFeedbackModal.tsx');

  assert.match(source, /const sideLabel = state\.side === 'buy' \? 'BUY' : state\.side === 'sell' \? 'SELL' : '';/);
  assert.match(source, /const successTitle = sideLabel \? `\$\{sideLabel\} Order Executed` : 'Order Executed';/);
  assert.match(source, /const BUY_HEX = '#2563EB';/);
  assert.match(source, /const SELL_HEX = '#DC2626';/);
  assert.match(source, /const accent = isSuccess \? \(isBuy \? BUY_HEX : isSell \? SELL_HEX : SUCCESS_HEX\) : ERR_HEX;/);
  assert.match(source, /\{isSuccess \? successTitle : \(state\.title \|\| 'Order Rejected'\)\}/);
  assert.match(source, /const successSummaryText = \[state\.symbol, volumeLabel\]\.filter\(Boolean\)\.join\(' - '\);/);
  assert.match(source, /const executionLabel = sideLabel \? `\$\{sideLabel\} price` : 'Execution price';/);
  assert.match(source, /tfmStyles\.successSummary[\s\S]*tfmStyles\.executionRow[\s\S]*tfmStyles\.executionPrice/);
  assert.doesNotMatch(source, /successBadgeLabel|tfmStyles\.detailsGrid|View Position/);
  assert.doesNotMatch(source, /successful[\s\S]*share the exact same professional Green success theme/);
});

test('web chart trade buttons keep labels, prices, and payload side aligned', () => {
  const source = readSource('src/features/chart/ChartScreen.web.tsx');

  assert.match(source, /const action = getChartTradeAction\(side\)/);
  assert.match(source, /const payload = buildChartMarketOrderPayload\(/);
  assert.match(source, /side: action\.side/);
  assert.match(source, /router\.push\(\{ pathname: '\/trade\/order-ticket', params: \{ symbol, side: action\.side, origin: 'chart' \} \}\)/);
  assert.match(source, /onPressIn=\{\(\) => runCriticalTradeAction\('chart\.web\.trade\.sell', \(\) => handleTrade\('sell'\)\)\}/);
  assert.match(source, /onPressIn=\{\(\) => runCriticalTradeAction\('chart\.web\.trade\.buy', \(\) => handleTrade\('buy'\)\)\}/);
  assert.match(source, /sellAction\.displayLabel[\s\S]*@ \{\(latestBid \|\| 0\)\.toFixed\(displayDecimals\)\}/);
  assert.match(source, /buyAction\.displayLabel[\s\S]*@ \{\(latestAsk \|\| 0\)\.toFixed\(displayDecimals\)\}/);
});

test('chart trade rows are remounted by symbol so first trade after symbol switch uses fresh responders', () => {
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const featureSource = readSource('src/features/chart/components/ChartTradeFeature.tsx');
  const buttonSource = readSource('src/features/chart/components/ChartTradeButtonsFeature.tsx');
  const handlerSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');
  const sharedLockSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/sharedLock.ts');

  assert.match(chartSource, /<ChartTradeOverlayLayer[\s\S]*showHiddenInlineTradeSheet: !isChartExpanded && showChartTradeSheet/);
  assert.match(chartSource, /<ChartTradeInlineFooter[\s\S]*chartSymbol=\{chartSymbol\}/);
  assert.match(featureSource, /key=\{`chart-trade-sheet-market-\$\{sheet\.chartSymbol\}`\}/);
  assert.match(featureSource, /key=\{`chart-trade-footer-dock-\$\{sheet\.chartSymbol\}`\}/);
  assert.match(featureSource, /key=\{`chart-trade-inline-footer-\$\{chartSymbol\}`\}/);
  assert.match(featureSource, /sheet\.showHiddenInlineTradeSheet \? \(\s*<Animated\.View\s+pointerEvents="none"/);
  assert.match(featureSource, /pointerEvents=\{tradeFooterDockVisible \? 'auto' : 'none'\}/);
  assert.match(featureSource, /const inlineFooterReceivesTouches = !showFloatingFooterTradeRow && !hideInlineTradeRow;/);
  assert.match(featureSource, /pointerEvents=\{inlineFooterReceivesTouches \? 'auto' : 'none'\}/);
  assert.match(sharedLockSource, /let chartTradeButtonSharedLockSide: TradeSide \| null = null;/);
  assert.match(handlerSource, /acquireChartTradeButtonSharedLock\(action\.side\)/);
  assert.match(handlerSource, /reason: tradeTapLockRef\.current \? 'tap-lock' : 'shared-tap-lock'/);
  assert.match(handlerSource, /releaseChartTradeButtonSharedLock\(tradeTapLockSideRef\.current\);[\s\S]*?\}, \[symbol\]\);/);
  assert.match(handlerSource, /currentChartSymbol: stateChartSymbol/);
});
