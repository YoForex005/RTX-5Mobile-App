import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Trade Feature UI: ModifyPositionScreen
 * 
 * Screen used to adjust the Stop Loss (SL) and Take Profit (TP) parameters
 * of an already active position or pending order.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TextInput, View,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path, Text as SvgText, Rect, G } from 'react-native-svg';

import { positionsApi } from '../../api/positions';
import { appQueryClient } from '../../state/providers/AppProviders';
import { useLiveTick, useLiveCandles } from '../../domain/candles/hooks/useLiveCandles';
import { normalizeSymbol } from '../../domain/symbols';
import { useInstrumentMeta } from '../../query/instruments';
import { useMarketSymbols } from '../../query/market';
import { DEFAULT_CHART_SYMBOLS, resolveChartSymbolFullName } from '../chart/chartSymbolMetadata';
import { normalizePriceDigits, resolveDecimalsFromPriceStep } from '../../utils/pricePrecision';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { useUserPreferences } from '../../state/userPreferences';
import { useTheme, ThemeColors } from '../../ui/theme/useTheme';
import { ActionSheet } from '../../ui/components/ActionSheet';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';
import { findPositionById } from './tradeFlow';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS, runImmediateAction } from '../../utils/actionLatency';
import { fmt } from '../../utils/format';
import { safeRouterBack } from '../../utils/navigation';
import { resolveModifyPositionMarkerYPositions } from './modifyPositionChartLayout';
import {
  classifyTradingError,
  createFrontendTradingError,
  formatTradingErrorFeedback,
} from '../../api/tradingErrors';

const SETTINGS_DARK_BACKGROUND = '#121212';
const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E';
const MIN_STOP_DISTANCE_POINTS = 5;

const hasOwn = (source: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(source, key);

const normalizeModifiedStopValue = (value: unknown): number => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const readModifiedStopValue = (
  response: unknown,
  keys: string[],
  fallback: number,
): { value: number; confirmed: boolean } => {
  if (!response || typeof response !== 'object') {
    return { value: fallback, confirmed: false };
  }

  const record = response as Record<string, unknown>;
  for (const key of keys) {
    if (hasOwn(record, key)) {
      return { value: normalizeModifiedStopValue(record[key]), confirmed: true };
    }
  }

  return { value: fallback, confirmed: false };
};

function formatModifyPrice(val: number, decimals: number) {
  const str = val.toFixed(decimals);
  // Splitting off the exact last two digits that the user circled
  return {
    main: str.slice(0, -2),
    huge: str.slice(-2)
  };
}

/**
 * Screen used to adjust the Stop Loss (SL) and Take Profit (TP) parameters for an active, open position.
 */
export function ModifyPositionScreen() {
  const { positionId } = useLocalSearchParams<{ positionId?: string }>();
  const insets = useSafeAreaInsets();
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const screenBg = isDark ? SETTINGS_DARK_BACKGROUND : T.bg;
  const SL_COLOR = T.trading.loss;
  const TP_COLOR = T.trading.profit;
  const isScreenFocused = useIsFocused();

  const positions = usePositionsState((s) => s.positions);
  const primedPosition = usePositionsState((s) =>
    positionId ? s.positionSnapshots[Array.isArray(positionId) ? positionId[0] : positionId] : undefined
  );
  const position = useMemo(
    () => findPositionById(positions, positionId) ?? primedPosition,
    [positions, positionId, primedPosition]
  );

  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [takeProfit, setTakeProfit] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modifySubmittingRef = useRef(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const [positionPickerOpen, setPositionPickerOpen] = useState(false);
  // Symbol being VIEWED on this sheet (live bid/ask + tick chart). Defaults to
  // the modified position's symbol; the top-right picker can point it at any
  // market symbol without touching the chart tab's symbol. SL/TP editing only
  // renders while the viewed symbol matches the position being modified.
  const [viewSymbolOverride, setViewSymbolOverride] = useState<string | null>(null);
  const positionSymbol = normalizeSymbol(position?.symbol ?? '');
  const viewSymbol = viewSymbolOverride ?? positionSymbol;
  const symbolsMatch = viewSymbol === positionSymbol;
  useEffect(() => {
    // Switching the modified position re-anchors the view to its symbol.
    setViewSymbolOverride(null);
  }, [positionSymbol]);
  const resolvedLogin = resolveTradingLoginString();

  // Fetch position if not natively loaded in cache (e.g. direct deep link or cold start)
  useEffect(() => {
    if (isScreenFocused && !position && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [isScreenFocused, position, resolvedLogin]);

  // Tick History State for Chart — all live market data follows the VIEWED
  // symbol so the picker can browse any instrument's backend feed in place.
  const latestTick = useLiveTick(viewSymbol || 'EURUSD', undefined, isScreenFocused);
  const latestClose = latestTick?.close || (symbolsMatch ? position?.currentPrice : 0) || 0;

  const isJpy = viewSymbol.includes('JPY');
  // The route is a transparentModal with animation:'none', so nothing paints
  // until the whole tree commits — every mount cost lands on the tap path.
  // Mount the sheet shell first and defer the body by a couple of frames;
  // the decorative tick chart (and its candle subscription) comes in last.
  const sheetBodyReady = useDeferredRouteContentReady(0);
  const tickChartReady = useDeferredRouteContentReady(450);
  // Fallbacks if bid/ask not provided directly
  const { candles } = useLiveCandles(viewSymbol, '1', isScreenFocused && tickChartReady); // Fetch REAL 1M histories!
  const syntheticAsk = latestClose + (isJpy ? 0.015 : 0.00015);
  const BID = (latestTick as any)?.bid || latestClose;
  const ASK = (latestTick as any)?.ask || syntheticAsk;

  // Symbol precision comes from the backend instrument meta (digits/point);
  // fall back to the app-wide JPY heuristic when the endpoint has no record.
  // A hardcoded precision breaks 5-decimal symbols: pip steps round away to
  // nothing and SL/TP would be submitted as coarse 2-decimal prices.
  const { data: instrumentMeta } = useInstrumentMeta(viewSymbol, isScreenFocused);
  const decimals = useMemo(() => {
    const metaDigits = normalizePriceDigits(instrumentMeta?.digits);
    if (metaDigits !== undefined && metaDigits > 0) return metaDigits;
    const stepDigits = resolveDecimalsFromPriceStep(instrumentMeta?.point ?? instrumentMeta?.tickSize);
    if (stepDigits !== undefined && stepDigits > 0) return stepDigits;
    return isJpy ? 3 : 5;
  }, [instrumentMeta?.digits, instrumentMeta?.point, instrumentMeta?.tickSize, isJpy]);
  const point = useMemo(() => {
    const metaPoint = instrumentMeta?.point;
    if (typeof metaPoint === 'number' && metaPoint > 0) return metaPoint;
    return Math.pow(10, -decimals);
  }, [instrumentMeta?.point, decimals]);
  const pipSize = point * 10;
  const minStopDistance = point * MIN_STOP_DISTANCE_POINTS;
  // Header open-price precision always follows the POSITION's symbol, even
  // while the live view is pointed at another instrument.
  const positionHeaderDecimals = symbolsMatch
    ? decimals
    : (positionSymbol.includes('JPY') ? 3 : 5);

  const [ticks, setTicks] = useState<{ bid: number; ask: number }[]>([]);

  useEffect(() => {
    if (!tickChartReady) return;
    if (BID > 0 && ASK > 0) {
      // If we have actual historical candles from the live WebSocket, map them perfectly!
      if (candles && candles.length > 0) {
        const slice = candles.slice(-40);
        const spread = ASK - BID;
        const histPath = slice.map(c => ({ bid: c.close, ask: c.close + spread }));

        // Pad to ensure full chart width if we don't have exactly 40 minutes of history yet
        while (histPath.length < 40) {
          histPath.unshift({ bid: histPath[0].bid, ask: histPath[0].ask });
        }

        // Ensure the absolute final active tick is precisely the live, sub-minute WebSocket tick!
        histPath[histPath.length - 1] = { bid: BID, ask: ASK };

        setTicks(histPath);
      } else {
        // Fallback tick accumulator if history hasn't loaded yet
        setTicks((prev) => {
          if (prev.length === 0) return Array(40).fill({ bid: BID, ask: ASK });

          const next = [...prev, { bid: BID, ask: ASK }];
          if (next.length > 40) next.shift();
          return next;
        });
      }
    }
  }, [BID, ASK, candles, tickChartReady]);

  // Init S/L and T/P from existing
  useEffect(() => {
    if (!position) return;
    setStopLoss(position.sl && position.sl > 0 ? position.sl : null);
    setTakeProfit(position.tp && position.tp > 0 ? position.tp : null);
  }, [position?.id, position?.sl, position?.tp]);


  /**
   * Navigates back to the previous screen (usually the Trade tab or Chart).
   */
  const handleBack = useCallback(() => {
    safeRouterBack(router, '/(tabs)/trade');
  }, []);

  // Same elements as the order ticket's top-right symbol picker: the full
  // market symbol list. An open position's symbol is fixed, so choosing a
  // symbol re-targets this sheet to an open position on that symbol (tapping
  // the same symbol again cycles through its positions); symbols without an
  // open position are listed but disabled.
  const { data: marketSymbols = [], isFetching: marketSymbolsFetching } =
    useMarketSymbols(isScreenFocused || positionPickerOpen);

  /**
   * Opens a modal allowing the user to select a different open position to modify.
   */
  const handleOpenPositionPicker = useCallback(() => {
    runImmediateAction('modifyPosition.positionPicker.open', () => {
      setPositionPickerOpen(true);
    });
  }, []);

  /**
   * Callback fired when a new position is selected from the picker, updating the screen to modify the chosen position.
   */
  const handlePickPosition = useCallback((nextPositionId: string) => {
    setPositionPickerOpen(false);
    setViewSymbolOverride(null);
    if (!nextPositionId || nextPositionId === String(position?.id ?? '')) {
      return;
    }
    router.setParams({ positionId: nextPositionId });
  }, [position?.id]);

  /**
   * Navigates the user to the Chart screen to view the price action of the currently selected position's symbol.
   */
  const handlePickViewSymbol = useCallback((candidate: string) => {
    setPositionPickerOpen(false);
    const normalized = normalizeSymbol(candidate);
    setViewSymbolOverride(normalized && normalized !== positionSymbol ? normalized : null);
  }, [positionSymbol]);

  const positionPickerActions = useMemo(() => {
    const currentPositionId = String(position?.id ?? '');
    const positionsBySymbol = new Map<string, typeof positions>();
    for (const p of positions) {
      const key = normalizeSymbol(p.symbol);
      if (!key) continue;
      const list = positionsBySymbol.get(key);
      if (list) {
        list.push(p);
      } else {
        positionsBySymbol.set(key, [p]);
      }
    }

    const seen = new Set<string>();
    const symbolOptions: string[] = [];
    const addSymbol = (candidate: string) => {
      const next = normalizeSymbol(candidate || '');
      if (!next || seen.has(next)) {
        return;
      }
      seen.add(next);
      symbolOptions.push(next);
    };

    if (position?.symbol) addSymbol(position.symbol);
    positions.forEach((p) => addSymbol(p.symbol));
    marketSymbols
      .map((candidate) => normalizeSymbol(candidate))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .forEach(addSymbol);
    DEFAULT_CHART_SYMBOLS.forEach(addSymbol);

    if (!symbolOptions.length) {
      return [{
        label: marketSymbolsFetching ? 'Loading symbols...' : 'No symbols available',
        disabled: true,
      }];
    }

    return symbolOptions.map((candidate) => {
      const symbolPositions = positionsBySymbol.get(candidate) ?? [];
      if (!symbolPositions.length) {
        const isViewing = !symbolsMatch && candidate === viewSymbol;
        return {
          label: candidate,
          subtitle: isViewing
            ? `Viewing - ${resolveChartSymbolFullName(candidate)}`
            : `${resolveChartSymbolFullName(candidate)} - No open position`,
          onPress: () => handlePickViewSymbol(candidate),
        };
      }

      const currentIndex = symbolPositions.findIndex((p) => String(p.id) === currentPositionId);
      const target = symbolPositions[(currentIndex + 1) % symbolPositions.length];
      const targetLabel = `${target.side} ${(target.volume || 0).toFixed(2)} #${String(target.id)}`;
      return {
        label: candidate,
        subtitle: currentIndex >= 0 && symbolPositions.length === 1
          ? `Selected - ${targetLabel}`
          : targetLabel,
        onPress: () => handlePickPosition(String(target.id)),
      };
    });
  }, [handlePickPosition, handlePickViewSymbol, marketSymbols, marketSymbolsFetching, position?.id, position?.symbol, positions, symbolsMatch, viewSymbol]);

  // A viewed-symbol switch changes the price scale; drop the old symbol's
  // tick trail so the chart never mixes scales.
  useEffect(() => {
    setTicks([]);
  }, [viewSymbol]);

  // A buy closes at the Bid and a sell closes at the Ask — the broker validates
  // SL/TP against that closing price. Stepping clamps to at least five points
  // on the valid side so chips/steppers can never build a value the server rejects.
  const closingMarketPrice = position ? (position.side === 'buy' ? BID : ASK) : 0;

  const clampStopTarget = (value: number, kind: 'sl' | 'tp') => {
    if (!position || !(closingMarketPrice > 0)) return value;
    const mustStayBelow = (position.side === 'buy') === (kind === 'sl');
    return mustStayBelow
      ? Math.min(value, closingMarketPrice - minStopDistance)
      : Math.max(value, closingMarketPrice + minStopDistance);
  };

  const validateStopTargets = (): string | null => {
    if (!position || !(closingMarketPrice > 0)) return null;
    const priceLabel = closingMarketPrice.toFixed(decimals);
    const minDistanceLabel = `${MIN_STOP_DISTANCE_POINTS} points`;
    const isBuySide = position.side === 'buy';
    if (stopLoss !== null) {
      const slLimit = isBuySide
        ? closingMarketPrice - minStopDistance
        : closingMarketPrice + minStopDistance;
      if (isBuySide && stopLoss > slLimit) {
        return `Stop Loss must be at least ${minDistanceLabel} below the current Bid (${priceLabel}) for a buy position.`;
      }
      if (!isBuySide && stopLoss < slLimit) {
        return `Stop Loss must be at least ${minDistanceLabel} above the current Ask (${priceLabel}) for a sell position.`;
      }
    }
    if (takeProfit !== null) {
      const tpLimit = isBuySide
        ? closingMarketPrice + minStopDistance
        : closingMarketPrice - minStopDistance;
      if (isBuySide && takeProfit < tpLimit) {
        return `Take Profit must be at least ${minDistanceLabel} above the current Bid (${priceLabel}) for a buy position.`;
      }
      if (!isBuySide && takeProfit > tpLimit) {
        return `Take Profit must be at least ${minDistanceLabel} below the current Ask (${priceLabel}) for a sell position.`;
      }
    }
    return null;
  };

  /**
   * Incrementally steps the Stop Loss value up or down by a predefined point amount when tapping the +/- buttons.
   */
  const handleStepSl = (delta: number) => {
    if (!position) return;
    setStopLoss((prev) => {
      // If setting for the first time, bias it directly against the live matching price for the position side
      const livePrice = closingMarketPrice;
      let base = prev;
      if (!base) {
        // Auto offset properly based on side
        base = position.side === 'buy' ? livePrice - (pipSize * 100) : livePrice + (pipSize * 100);
      }
      const val = clampStopTarget((base as number) + delta, 'sl');
      return parseFloat(val.toFixed(decimals));
    });
  };

  /**
   * Incrementally steps the Take Profit value up or down by a predefined point amount when tapping the +/- buttons.
   */
  const handleStepTp = (delta: number) => {
    if (!position) return;
    setTakeProfit((prev) => {
      const livePrice = closingMarketPrice;
      let base = prev;
      if (!base) {
        // Auto offset properly based on side
        base = position.side === 'buy' ? livePrice + (pipSize * 100) : livePrice - (pipSize * 100);
      }
      const val = clampStopTarget((base as number) + delta, 'tp');
      return parseFloat(val.toFixed(decimals));
    });
  };

  /**
   * Callback fired when the user manually types a new Stop Loss price into the input field.
   */
  const handleSlChange = (text: string) => {
    const val = parseFloat(text);
    if (!isNaN(val)) setStopLoss(val);
    if (text === '') setStopLoss(null);
  };

  /**
   * Callback fired when the user manually types a new Take Profit price into the input field.
   */
  const handleTpChange = (text: string) => {
    const val = parseFloat(text);
    if (!isNaN(val)) setTakeProfit(val);
    if (text === '') setTakeProfit(null);
  };

  /**
   * Submits the requested SL/TP modifications to the trade server and displays a success or error confirmation alert.
   */
  const handleModify = async () => {
    if (modifySubmittingRef.current) {
      return;
    }
    if (!position || !symbolsMatch) {
      return;
    }

    if (!accountDetails?.credentials?.accessToken) {
      setSubmitMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            'Authentication Error',
            'The app does not have a valid local trading session. Log in again before modifying the position.',
          ),
        ),
      );
      return;
    }

    // Typed values bypass the stepper clamp, so re-validate before submitting.
    const stopValidationError = validateStopTargets();
    if (stopValidationError) {
      setSubmitMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError('Invalid Stop Levels', stopValidationError),
        ),
      );
      return;
    }

    modifySubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitMessage(null);
    try {
      const requestedSl = stopLoss || 0;
      const requestedTp = takeProfit || 0;
      const modifyResult = await positionsApi.modifyPosition(position.id, {
        price_sl: requestedSl,
        price_tp: requestedTp,
      });

      const slResult = readModifiedStopValue(modifyResult, ['price_sl', 'sl'], requestedSl);
      const tpResult = readModifiedStopValue(modifyResult, ['price_tp', 'tp'], requestedTp);
      const newSl = slResult.value;
      const newTp = tpResult.value;

      if ((requestedSl > 0 && slResult.confirmed && newSl <= 0) || (requestedTp > 0 && tpResult.confirmed && newTp <= 0)) {
        setSubmitMessage(
          formatTradingErrorFeedback(
            createFrontendTradingError(
              'SL/TP Not Applied',
              'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.',
            ),
          ),
        );
        return;
      }

      // Optimistic update
      const modifiedAt = Date.now();
      usePositionsState.setState((state) => {
        const positionKey = String(position.id);
        const patch = { sl: newSl, tp: newTp, clientModifiedAt: modifiedAt };
        return {
          positions: state.positions.map((p) =>
            String(p.id) === positionKey
              ? { ...p, ...patch }
              : p
          ),
          positionSnapshots: {
            ...state.positionSnapshots,
            [positionKey]: {
              ...(state.positionSnapshots[positionKey] ?? position),
              ...patch,
            },
          },
        };
      });

      appQueryClient.invalidateQueries({ queryKey: ['positions'] });
      appQueryClient.invalidateQueries({ queryKey: ['positionHistory'] });
      appQueryClient.invalidateQueries({ queryKey: ['deals'] });
      appQueryClient.invalidateQueries({ queryKey: ['accountSummary'] });
      appQueryClient.invalidateQueries({ queryKey: ['exposure'] });
      appQueryClient.invalidateQueries({ queryKey: ['transactions'] });

      handleBack();
    } catch (error: any) {
      setSubmitMessage(
        formatTradingErrorFeedback(
          classifyTradingError(error, { action: 'modify-position' }),
        ),
      );
    } finally {
      modifySubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!position) {
    return (
      <View style={styles.screen}>
        <View style={{ height: insets.top, backgroundColor: screenBg }} />
        <View style={[styles.header, { paddingTop: 6 }]}>
          <View style={styles.headerTopRow}>
            <Pressable
              onPress={handleBack}
              hitSlop={20}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color={T.text} />
            </Pressable>
            <View style={styles.headerTitleWrap} pointerEvents="none">
              <Text style={styles.headerActionLabel} numberOfLines={1} adjustsFontSizeToFit>
                MODIFY POSITION
              </Text>
            </View>
            <View style={styles.backBtn} />
          </View>
        </View>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={T.accent} />
          <Text style={[styles.loaderText, { color: T.textMuted }]}>Loading position...</Text>
        </View>
      </View>
    );
  }

  const slDisplay = stopLoss ? stopLoss.toFixed(decimals) : 'SL';
  const tpDisplay = takeProfit ? takeProfit.toFixed(decimals) : 'TP';
  const isBuy = position.side === 'buy';
  const chartHeight = Math.max(220, Math.min(Dimensions.get('window').height * 0.32, 340));

  const bidFmt = formatModifyPrice(BID, decimals);
  const askFmt = formatModifyPrice(ASK, decimals);

  // Chart Rendering calculations
  const w = chartLayout.width;
  const h = chartLayout.height;

  // Find min and max values to dynamically scale tick chart
  let minPrice = Math.min(BID, ASK);
  let maxPrice = Math.max(BID, ASK);
  ticks.forEach(t => {
    minPrice = Math.min(minPrice, t.bid, t.ask);
    maxPrice = Math.max(maxPrice, t.bid, t.ask);
  });

  // Stretch bounds gently so active stop constraints visibly sit on the chart
  if (stopLoss !== null && Number.isFinite(stopLoss)) {
    minPrice = Math.min(minPrice, stopLoss);
    maxPrice = Math.max(maxPrice, stopLoss);
  }
  if (takeProfit !== null && Number.isFinite(takeProfit)) {
    minPrice = Math.min(minPrice, takeProfit);
    maxPrice = Math.max(maxPrice, takeProfit);
  }

  // padding
  const padding = (maxPrice - minPrice) * 0.2;
  const chartMin = minPrice - padding;
  const chartMax = maxPrice + padding;
  const priceRange = chartMax - chartMin || 0.001;

  const yPos = (val: number) => {
    if (h === 0) return 0;
    return h - ((val - chartMin) / priceRange) * h;
  };

  const xPos = (idx: number, total: number) => {
    if (w === 0 || total <= 1) return 0;
    // Map points across width minus 50 right padding for labels
    return (idx / (total - 1)) * (w - 70);
  };

  let bidPath = '';
  let askPath = '';
  if (ticks.length > 0 && w > 0 && h > 0) {
    bidPath = ticks.map((t, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i, ticks.length)} ${yPos(t.bid)}`).join(' ');
    askPath = ticks.map((t, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i, ticks.length)} ${yPos(t.ask)}`).join(' ');

    // Mathematically anchor the end of the history path directly to the live nanosecond Bid/Ask box coordinates
    // This perfectly closes the frame gap and guarantees the stroke touches the bounding box!
    bidPath += ` L ${w - 60} ${yPos(BID)}`;
    askPath += ` L ${w - 60} ${yPos(ASK)}`;
  }

  const markerYPositions = resolveModifyPositionMarkerYPositions(
    [
      { key: 'ask', value: ASK, y: yPos(ASK) },
      { key: 'bid', value: BID, y: yPos(BID) },
      ...(symbolsMatch && stopLoss !== null ? [{ key: 'sl' as const, value: stopLoss, y: yPos(stopLoss) }] : []),
      ...(symbolsMatch && takeProfit !== null ? [{ key: 'tp' as const, value: takeProfit, y: yPos(takeProfit) }] : []),
    ],
    {
      chartHeight: h,
      sameValueEpsilon: Math.max(point / 2, Number.EPSILON),
    },
  );

  const lineY = (key: 'ask' | 'bid' | 'sl' | 'tp', fallbackValue: number) => markerYPositions[key] ?? yPos(fallbackValue);

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: 6 }]}>
        <View style={styles.headerTopRow}>
          <Pressable
            onPress={handleBack}
            hitSlop={20}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>

          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerActionLabel} numberOfLines={1} adjustsFontSizeToFit>
              MODIFY POSITION
            </Text>
            <Text style={styles.headerTicketLabel} numberOfLines={1}>
              #{position.id}
            </Text>
          </View>

          <Pressable
            style={styles.positionPickerBtn}
            onPress={handleOpenPositionPicker}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            unstable_pressDelay={0}
            accessibilityRole="button"
            accessibilityLabel="Select Symbol"
          >
            <Ionicons name="logo-usd" size={20} color={T.accent} />
          </Pressable>
        </View>

        <View style={styles.headerSubRow}>
          <Text style={[styles.headerSide, { color: position.side === 'buy' ? T.trading.buy.primary : T.trading.sell.primary }]}>
            {position.side.toUpperCase()}
          </Text>
          <Text style={styles.headerVol}>{position.volume.toFixed(2)}</Text>
          <Text style={styles.headerSymbol}>{position.symbol.replace(/\//g, '')}</Text>
          <Text style={styles.headerAt}>at</Text>
          <Text style={styles.headerPrice}>{position.openPrice.toFixed(positionHeaderDecimals)}</Text>
        </View>
      </View>

      {!sheetBodyReady ? (
            <View style={styles.bodyLoadingWrap}>
              <ActivityIndicator color={T.accent} />
            </View>
          ) : (
          <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 20) + 8 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
      >

        {/* Viewed-symbol banner — shown while browsing a symbol other than the
            modified position's; live prices below come from that symbol. */}
        {!symbolsMatch && (
          <View style={[styles.viewSymbolBanner, { borderColor: T.border }]}>
            <Ionicons name="eye-outline" size={14} color={T.accent} />
            <Text style={[styles.viewSymbolBannerText, { color: T.text }]}>
              {viewSymbol} — live view. No open position on this symbol.
            </Text>
          </View>
        )}

        {/* Big Prices */}
        <View style={styles.priceHero}>
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>BID</Text>
            <Text style={[styles.priceNormal, { color: isBuy ? T.trading.sell.primary : T.trading.buy.primary }]}>
              {bidFmt.main}<Text style={styles.priceHuge}>{bidFmt.huge}</Text>
            </Text>
          </View>
          <View style={styles.priceCardDivider} />
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>ASK</Text>
            <Text style={[styles.priceNormal, { color: isBuy ? T.trading.buy.primary : T.trading.sell.primary }]}>
              {askFmt.main}<Text style={styles.priceHuge}>{askFmt.huge}</Text>
            </Text>
          </View>
        </View>

        {/* SL / TP Adjusters — enterprise premium card design. Only rendered
            while viewing the modified position's own symbol: the stepper math
            (clamping, estimates) is anchored to that symbol's live prices. */}
        {symbolsMatch && (() => {
          const PRESET_PIPS = [10, 25, 50, 100];
          const contractSize =
            typeof instrumentMeta?.contractSize === 'number' && instrumentMeta.contractSize > 0
              ? instrumentMeta.contractSize
              : 100000;
          const metaTickSize = instrumentMeta?.tickSize;
          const metaTickValue = instrumentMeta?.tickValue;
          const lots = position.volume || 0;

          const computeImpact = (target: number | null, kind: 'sl' | 'tp') => {
            if (!target) return null;
            const distance = Math.abs(target - position.openPrice);
            const pips = Math.round(distance / pipSize);
            // Prefer the broker's tick economics (exact, in account currency).
            // Fallback: contract-size math gives the quote-currency amount; for
            // JPY-quoted symbols convert by the live rate instead of assuming 100.
            let usd: number;
            if (
              typeof metaTickSize === 'number' && metaTickSize > 0 &&
              typeof metaTickValue === 'number' && metaTickValue > 0
            ) {
              usd = (distance / metaTickSize) * metaTickValue * lots;
            } else {
              const quoteCurrencyAmount = distance * contractSize * lots;
              usd = isJpy && closingMarketPrice > 0
                ? quoteCurrencyAmount / closingMarketPrice
                : quoteCurrencyAmount;
            }
            const sign = kind === 'sl' ? '−' : '+';
            return { pips, usd, sign };
          };
          const slImpact = computeImpact(stopLoss, 'sl');
          const tpImpact = computeImpact(takeProfit, 'tp');

          const splitPrice = (val: number | null) => {
            if (val === null) return { main: '—', huge: '' };
            const str = val.toFixed(decimals);
            return { main: str.slice(0, -2), huge: str.slice(-2) };
          };
          const slParts = splitPrice(stopLoss);
          const tpParts = splitPrice(takeProfit);

          const renderCard = (
            kind: 'sl' | 'tp',
            color: string,
            title: string,
            parts: { main: string; huge: string },
            impact: { pips: number; usd: number; sign: string } | null,
            onStep: (delta: number) => void,
            onChangeText: (text: string) => void,
            onClear: () => void,
            rawValue: number | null,
          ) => (
            <View style={[styles.stepperCard, { borderColor: T.border }]}>
              <View style={[styles.stepperAccent, { backgroundColor: color }]} />

              {/* Header */}
              <View style={styles.stepperHead}>
                <View style={styles.stepperHeadLeft}>
                  <View style={[styles.stepperBadge, { backgroundColor: color }]}>
                    <Text style={styles.stepperBadgeText}>{kind.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.stepperLabel}>{title}</Text>
                </View>
                {rawValue !== null ? (
                  <Pressable onPress={onClear} hitSlop={10} style={styles.stepperClear}>
                    <Ionicons name="close-circle" size={16} color={T.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              {/* Hero Price Row */}
              <View style={styles.stepperPriceRow}>
                <Pressable onPress={() => onStep(-pipSize * 10)} hitSlop={12} style={[styles.stepperSquareBtn, { borderColor: T.border }]}>
                  <Ionicons name="remove" size={18} color={color} />
                </Pressable>

                <View style={styles.stepperPriceWrap}>
                  {rawValue !== null ? (
                    <Text style={styles.stepperPriceMain} numberOfLines={1} adjustsFontSizeToFit>
                      {parts.main}
                      <Text style={[styles.stepperPriceHuge, { color }]}>{parts.huge}</Text>
                    </Text>
                  ) : (
                    <Text style={styles.stepperPriceEmpty}>Not set</Text>
                  )}
                  <TextInput
                    style={styles.stepperHiddenInput}
                    keyboardType="numeric"
                    value={rawValue !== null ? rawValue.toString() : ''}
                    onChangeText={onChangeText}
                    placeholder="0"
                    placeholderTextColor="transparent"
                  />
                </View>

                <Pressable onPress={() => onStep(pipSize * 10)} hitSlop={12} style={[styles.stepperSquareBtn, { borderColor: T.border }]}>
                  <Ionicons name="add" size={18} color={color} />
                </Pressable>
              </View>

              {/* Quick preset chips */}
              <View style={styles.stepperChipRow}>
                {PRESET_PIPS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => onStep(pipSize * p * (kind === 'sl' ? -1 : 1))}
                    style={[styles.stepperChip, { borderColor: T.border }]}
                    hitSlop={6}
                  >
                    <Text style={[styles.stepperChipText, { color }]}>
                      {kind === 'sl' ? '−' : '+'}{p}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Footer: pip distance + $ impact */}
              <View style={styles.stepperFootRow}>
                <Text style={styles.stepperFootLabel}>Distance</Text>
                <Text style={[styles.stepperFootValue, impact && { color: T.text }]}>
                  {impact ? `${impact.pips} pts` : '—'}
                </Text>
              </View>
              <View style={styles.stepperFootRow}>
                <Text style={styles.stepperFootLabel}>Est. {kind === 'sl' ? 'Loss' : 'Profit'}</Text>
                <Text style={[styles.stepperFootValue, impact && { color }]}>
                  {impact ? `${impact.sign}$${impact.usd.toFixed(2)}` : '—'}
                </Text>
              </View>
            </View>
          );

          return (
            <View style={styles.stepperRow}>
              {renderCard('sl', SL_COLOR, 'Stop Loss', slParts, slImpact, handleStepSl, handleSlChange, () => setStopLoss(null), stopLoss)}
              {renderCard('tp', TP_COLOR, 'Take Profit', tpParts, tpImpact, handleStepTp, handleTpChange, () => setTakeProfit(null), takeProfit)}
            </View>
          );
        })()}

        {/* SVG Tick Chart Area */}
        <View
          style={[styles.chartContainer, { height: chartHeight }]}
          onLayout={(e) => setChartLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
          {tickChartReady && w > 0 && h > 0 && (
            <Svg width={w} height={h}>
              {/* Horizontal Grid lines */}
              <Line x1="0" y1={yPos(maxPrice)} x2={w} y2={yPos(maxPrice)} stroke={T.border} strokeDasharray="4 4" strokeWidth="1" />
              <Line x1="0" y1={yPos((maxPrice + minPrice) / 2)} x2={w} y2={yPos((maxPrice + minPrice) / 2)} stroke={T.border} strokeDasharray="4 4" strokeWidth="1" />
              <Line x1="0" y1={yPos(minPrice)} x2={w} y2={yPos(minPrice)} stroke={T.border} strokeDasharray="4 4" strokeWidth="1" />

              {/* Historical Point Paths (The actual Signal) */}
              {bidPath ? <Path d={bidPath} stroke={T.trading.buy.primary} strokeWidth="1.5" fill="none" /> : null}
              {askPath ? <Path d={askPath} stroke={T.trading.sell.primary} strokeWidth="1.5" fill="none" /> : null}

              {/* Stop Loss & Take Profit Visual Overlays — only meaningful on
                  the position's own price scale */}
              {symbolsMatch && stopLoss !== null ? (
                <G>
                  <Line x1="0" y1={lineY('sl', stopLoss)} x2={w} y2={lineY('sl', stopLoss)} stroke={SL_COLOR} strokeDasharray="6 6" strokeWidth="1" />
                  <G x={w - 60} y={lineY('sl', stopLoss) - 10}>
                    <Rect width={60} height={20} fill={SL_COLOR} />
                    <SvgText x={30} y={14} fill="#FFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                      SL
                    </SvgText>
                  </G>
                </G>
              ) : null}

              {symbolsMatch && takeProfit !== null ? (
                <G>
                  <Line x1="0" y1={lineY('tp', takeProfit)} x2={w} y2={lineY('tp', takeProfit)} stroke={TP_COLOR} strokeDasharray="6 6" strokeWidth="1" />
                  <G x={w - 60} y={lineY('tp', takeProfit) - 10}>
                    <Rect width={60} height={20} fill={TP_COLOR} />
                    <SvgText x={30} y={14} fill="#FFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                      TP
                    </SvgText>
                  </G>
                </G>
              ) : null}

              {/* Active Live Price Lines */}
              <Line x1="0" y1={lineY('ask', ASK)} x2={w - 60} y2={lineY('ask', ASK)} stroke={T.trading.sell.primary} strokeWidth="1" />
              <Line x1="0" y1={lineY('bid', BID)} x2={w - 60} y2={lineY('bid', BID)} stroke={T.trading.buy.primary} strokeWidth="1" />

              {/* Price Tags on Right Axis */}
              <G x={w - 60} y={lineY('ask', ASK) - 10}>
                <Rect width={60} height={20} fill={T.trading.sell.primary} />
                <SvgText x={30} y={14} fill="#FFF" fontSize="11" fontWeight="bold" textAnchor="middle">
                  {ASK.toFixed(decimals)}
                </SvgText>
              </G>

              <G x={w - 60} y={lineY('bid', BID) - 10}>
                <Rect width={60} height={20} fill={T.trading.buy.primary} />
                <SvgText x={30} y={14} fill="#FFF" fontSize="11" fontWeight="bold" textAnchor="middle">
                  {BID.toFixed(decimals)}
                </SvgText>
              </G>
            </Svg>
          )}
        </View>

        {/* Footer / Controls — submitting SL/TP only applies to the position's
            own symbol view */}
        {symbolsMatch && (
        <View style={styles.footer}>
          <View style={styles.disclaimerBox}>
            <Ionicons name="information-circle-outline" size={16} color={T.textMuted} style={styles.disclaimerIcon} />
            <Text style={styles.disclaimer}>
              SL/TP must be at least {MIN_STOP_DISTANCE_POINTS} points away from the market price. Orders are executed by the broker.
            </Text>
          </View>

          {submitMessage && (
            <Text style={styles.validationText}>{submitMessage}</Text>
          )}
          {!submitMessage && !positionsApi && (
            <Text style={styles.validationText}>No connection</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.modifyBtn,
              pressed && { opacity: 0.8 },
              isSubmitting && { opacity: 0.5 }
            ]}
            disabled={isSubmitting}
            onPress={handleModify}
            activateOnPressIn
            unstable_pressDelay={0}
            hitSlop={12}
            latencyLabel="modifyPosition.submit"
            latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.modifyText}>MODIFY POSITION</Text>
            )}
          </Pressable>
        </View>
        )}
          </ScrollView>
      )}

      <ActionSheet
        visible={positionPickerOpen}
        onClose={() => setPositionPickerOpen(false)}
        title="Select Symbol"
        searchable
        compactText
        searchPlaceholder="Search symbols..."
        detent="large"
        instantOpen
        runActionAfterClose={false}
        // Keep the sheet fixed when the search keyboard opens (no rise/jump);
        // the keyboard just overlays the lower part of the list. Mirrors the
        // chart symbol picker fix (ChartScreen.native handleOpenSymbolPicker).
        keepFullHeightOnKeyboard
        actions={positionPickerActions}
      />
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean) => {
  const screenBg = isDark ? SETTINGS_DARK_BACKGROUND : T.bg;
  const cardBg = isDark ? SETTINGS_DARK_CARD_BACKGROUND : T.glass2;
  const insetCardBg = isDark ? SETTINGS_DARK_CARD_BACKGROUND : T.glass1;

  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: screenBg,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  loaderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    backgroundColor: screenBg,
  },
  bodyLoadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  positionPickerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.08)',
    borderWidth: 1,
    borderColor: T.border,
  },
  viewSymbolBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: insetCardBg,
  },
  viewSymbolBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  headerTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerActionLabel: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  headerTicketLabel: {
    color: T.textMuted,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  headerSide: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  headerVol: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  headerSymbol: {
    color: T.text,
    fontSize: 16,
    fontWeight: '600',
  },
  headerAt: {
    color: T.textMuted,
    fontSize: 14,
  },
  headerPrice: {
    color: T.text,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  priceHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cardBg,
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  priceCard: {
    flex: 1,
    alignItems: 'center',
  },
  priceCardDivider: {
    width: 1,
    height: 40,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.06)',
  },
  priceLabel: {
    color: T.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: -8,
    includeFontPadding: false,
  },
  priceNormal: {
    fontSize: 24,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  priceHuge: {
    fontSize: 34,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    gap: 10,
    marginBottom: 12,
  },
  stepperCard: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 8,
    paddingLeft: 11,
    paddingRight: 9,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: cardBg,
    overflow: 'hidden',
    position: 'relative',
  },
  stepperAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  stepperHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepperHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  stepperBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  stepperBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepperClear: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  stepperPriceWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 26,
  },
  stepperPriceMain: {
    color: T.text,
    fontSize: 19,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
    textAlign: 'center',
  },
  stepperPriceHuge: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  stepperPriceEmpty: {
    color: T.textMuted,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  stepperHiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
    fontSize: 1,
  },
  stepperSquareBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: insetCardBg,
  },
  stepperChipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 8,
  },
  stepperChip: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: insetCardBg,
  },
  stepperChipText: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
  stepperFootRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
  },
  stepperFootLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stepperFootValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: T.textMuted,
  },
  chartContainer: {
    marginVertical: 10,
    overflow: 'hidden',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cardBg,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.05)',
  },
  disclaimerIcon: {
    marginRight: 8,
  },
  disclaimer: {
    flexShrink: 1,
    color: T.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
  },
  validationText: {
    color: T.trading.sell.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  modifyBtn: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  modifyText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  });
};
