/**
 * Trade Feature UI: OrderTicketScreen
 * 
 * Core order entry interface. Provides an interactive ticket configured for 
 * both Market Execution and Pending Orders, integrating live pricing from
 * quotes Websocket and immediate order submission to the trading backend.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ActivityIndicator, Animated, Platform, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useUserPreferences } from '../../state/userPreferences';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLogin, resolveTradingLoginString } from '../../state/tradingLogin';
import { ordersApi } from '../../api/orders';
import { useAccountSummary } from '../../query/account';
import { useInstrumentMeta } from '../../query/instruments';
import { useTheme, ThemeColors } from '../../ui/theme/useTheme';
import { fmt } from '../../utils/format';
import { safeRouterBack } from '../../utils/navigation';
import { useLiveTick } from '../../domain/candles/hooks/useLiveCandles';
import { normalizeSymbol } from '../../domain/symbols';
import { assertTradeSide, normalizeTradeSide, TRADE_SIDE, type TradeSide } from '../../domain/tradeSide';
import { classifyTradingError, createFrontendTradingError } from '../../api/tradingErrors';
import { TradeFeedbackModal } from '../../ui/components/TradeFeedbackModal';
import { FastPressable } from '../../ui/components/FastPressable';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS } from '../../utils/actionLatency';
import { useTranslation } from '../../i18n/useTranslation';
import {
  formatTradeVolume,
  incrementTradeVolume,
  normalizeTradeVolume,
  sanitizeTradeVolumeDraft,
} from '../../utils/tradeVolume';
import {
  CHART_ORDER_TYPES,
  getChartOrderSide,
  isPendingChartOrderType,
  isStopLimitChartOrderType,
  resolveDefaultStopLimitPrice,
  type ChartOrderType,
} from '../chart/chartTradeOrderUtils';
import { LiveOrderTickExecutionGraph } from './OrderTickExecutionGraph';
import {
  resolveOrderTicketDefaultPendingPrice,
  resolveOrderTicketPendingOffset,
  resolveOrderTicketPriceDecimals,
  resolveOrderTicketStopLimitOffset,
  roundOrderTicketPrice,
} from './orderTicketPreviewUtils';

/* Main screen */
// A single action model keeps BUY and SELL button behavior consistent across
// the top price panel and the lower execution buttons.
type OrderTicketTradeAction = {
  side: TradeSide;
  displayLabel: 'BUY' | 'SELL';
  marketLabel: 'BUY BY MARKET' | 'SELL BY MARKET';
  priceLabel: 'ASK' | 'BID';
  price: number;
  color: string;
  backgroundColor: string;
  execStyle: object;
  priceTestID: string;
  execTestID: string;
};

export function OrderTicketScreen() {
  // Route params let chart and quote screens open the ticket with a specific
  // symbol, initial trade side, or order comment.
  const { symbol: routeSymbol, comment: routeComment, side: routeSideParam } = useLocalSearchParams<{ symbol?: string; comment?: string; side?: string }>();
  const symbol = normalizeSymbol(routeSymbol || 'EURUSD');
  const routeSide = normalizeTradeSide(routeSideParam);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isScreenFocused = useIsFocused();
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const tradeVolume = useUserPreferences((s) => s.tradeVolume);
  const setTradeVolume = useUserPreferences((s) => s.setTradeVolume);
  const themeMode = useUserPreferences((s) => s.themeMode);
  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const brokerId = useUserPreferences((s) => s.brokerId);
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = themeMode === 'dark';
  const styles = makeStyles(T, isDark);

  const SELL_C = T.trading.sell.primary;
  const SELL_BG = isDark ? 'rgba(255,59,48,0.08)' : 'rgba(220,38,38,0.06)';
  const BUY_C = T.trading.buy.primary;
  const BUY_BG = isDark ? 'rgba(52,199,89,0.08)' : 'rgba(5,150,105,0.06)';
  const WHITE = T.text;
  const SUB = T.textSub;

  // The order type decides whether this ticket submits immediately or prepares
  // a pending order with an editable trigger price.
  const [orderType, setOrderType] = useState<ChartOrderType>('Market Execution');
  const orderTypeTabsRef = useRef<ScrollView | null>(null);
  const orderTypeTabsViewportWidthRef = useRef(0);
  const orderTypeTabLayoutsRef = useRef<Partial<Record<ChartOrderType, { x: number; width: number }>>>({});
  const { data: instrumentMeta } = useInstrumentMeta(symbol, isScreenFocused);
  // Broker metadata defines the valid lot range and step size for the symbol.
  const volumeBounds = useMemo(
    () => ({
      minVolume: instrumentMeta?.minVolume,
      maxVolume: instrumentMeta?.maxVolume,
      stepVolume: instrumentMeta?.stepVolume,
    }),
    [instrumentMeta?.maxVolume, instrumentMeta?.minVolume, instrumentMeta?.stepVolume],
  );
  const [volume, setVolume] = useState(() => normalizeTradeVolume(tradeVolume, volumeBounds));
  const [volumeInput, setVolumeInput] = useState(() => formatTradeVolume(tradeVolume, volumeBounds));
  const [slEnabled, setSlEnabled] = useState(false);
  const [slPrice, setSlPrice] = useState(0);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpPrice, setTpPrice] = useState(0);

  // One modal state handles both success and error feedback from trade actions.
  const [modalState, setModalState] = useState<{
    visible: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
    side?: TradeSide;
    ticket?: string;
    symbol?: string;
    volume?: number;
    price?: number;
    executedAt?: string;
  }>({ visible: false, type: 'success', title: '', message: '' });

  const modalScaleAnim = useRef(new Animated.Value(0.85)).current;
  const modalOpacityAnim = useRef(new Animated.Value(0)).current;
  const autoDismissTimer = useRef<NodeJS.Timeout | null>(null);

  // Show feedback with a short animation. Successful orders also vibrate and
  // auto-dismiss after a few seconds.
  const showModal = useCallback((state: typeof modalState) => {
    setModalState(state);
    modalScaleAnim.setValue(0.85);
    modalOpacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(modalScaleAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 8 }),
      Animated.timing(modalOpacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    if (state.type === 'success') {
      Vibration.vibrate([0, 40, 60, 40]);
      autoDismissTimer.current = setTimeout(() => handleModalClose(), 4000);
    }
  }, []);

  // After a successful order, closing the modal returns the user to the
  // previous screen. Errors just close the modal and leave the ticket open.
  const handleModalClose = useCallback(() => {
    if (autoDismissTimer.current) {
      clearTimeout(autoDismissTimer.current);
      autoDismissTimer.current = null;
    }
    const wasSuccess = modalState.type === 'success';
    Animated.parallel([
      Animated.timing(modalScaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
      Animated.timing(modalOpacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setModalState(prev => ({ ...prev, visible: false }));
      if (wasSuccess) {
        safeRouterBack(router, '/(tabs)/trade');
      }
    });
  }, [modalState.type]);

  // Clear any pending auto-dismiss timer when the screen unmounts.
  useEffect(() => {
    return () => {
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
    };
  }, []);

  // Keep the editable volume field aligned with saved preferences and the
  // latest broker volume limits.
  useEffect(() => {
    const normalized = normalizeTradeVolume(tradeVolume, volumeBounds);
    setVolume(normalized);
    setVolumeInput(formatTradeVolume(normalized, volumeBounds));
  }, [tradeVolume, volumeBounds]);

  // Live WebSocket pricing drives the BID/ASK buttons and every price preview.
  const latestTick = useLiveTick(symbol, undefined, isScreenFocused);
  const latestClose = latestTick?.close || 0;
  // Some tick payloads only include close price, so create a conservative ASK
  // fallback until true bid/ask data arrives.
  const syntheticAsk = latestClose + (symbol.includes('XAU') ? 0.30 : symbol.includes('BTC') ? 25 : 0.00015);

  const BID = (latestTick as any)?.bid || latestClose;
  const ASK = (latestTick as any)?.ask || syntheticAsk;
  const tickTimestamp =
    (latestTick as any)?.timestamp
    ?? (latestTick as any)?.time
    ?? (latestTick as any)?.t
    ?? null;
  const isMarketExecution = orderType === 'Market Execution';

  const loginStr = resolveTradingLoginString();
  const { data: accountSummary } = useAccountSummary(loginStr);
  const leverage = accountSummary?.leverage || 100;
  const currency = accountSummary?.currency || 'USD';

  // Estimate margin locally for display only. The backend remains the final
  // authority for real margin and execution validation.
  let contractSize = 100000;
  if (symbol.includes('XAU') || symbol.includes('XAG')) contractSize = 100;
  else if (symbol.includes('BTC') || symbol.includes('ETH')) contractSize = 1;
  else if (symbol.includes('US30') || symbol.includes('SPX') || symbol.includes('NAS') || symbol.includes('GER') || symbol.includes('UK')) contractSize = 10;

  const estimatedMargin = Number.isFinite(ASK) && ASK > 0
    ? (volume * contractSize * ASK) / leverage
    : 0;

  const marginDisplay = currency === 'USD'
    ? `-$${fmt.price(estimatedMargin)}`
    : `-${fmt.price(estimatedMargin)} ${currency}`;

  const baseSymbol = symbol.replace(/[a-z_.-].*$/, '');
  const displayDecimals = 2;
  const pipSize = baseSymbol.includes('JPY') ? 0.01 : baseSymbol.includes('BTC') ? 10 : baseSymbol.includes('XAU') ? 0.1 : 0.0001;
  const priceTickSize = instrumentMeta?.tickSize && instrumentMeta.tickSize > 0 ? instrumentMeta.tickSize : pipSize;
  // Price precision comes from broker tick size when available; otherwise the
  // ticket falls back to a symbol-family pip size.
  const priceDecimals = useMemo(
    () => resolveOrderTicketPriceDecimals(priceTickSize, BID, ASK),
    [ASK, BID, priceTickSize],
  );
  const pricePointSize = useMemo(() => {
    if (priceTickSize > 0) {
      return priceTickSize;
    }
    return Math.pow(10, -Math.max(priceDecimals, 0));
  }, [priceDecimals, priceTickSize]);
  const pendingOffset = useMemo(
    () => resolveOrderTicketPendingOffset(baseSymbol, pricePointSize),
    [baseSymbol, pricePointSize],
  );
  const stopLimitOffset = useMemo(
    () => resolveOrderTicketStopLimitOffset(baseSymbol, pricePointSize, pendingOffset),
    [baseSymbol, pendingOffset, pricePointSize],
  );
  const roundPendingPrice = useCallback(
    (value: number) => roundOrderTicketPrice(value, priceTickSize, priceDecimals),
    [priceDecimals, priceTickSize],
  );
  const resolveDefaultPendingPrice = useCallback(
    (type: ChartOrderType) =>
      resolveOrderTicketDefaultPendingPrice({
        orderType: type,
        bid: BID,
        ask: ASK,
        pendingOffset,
        roundPrice: roundPendingPrice,
      }),
    [ASK, BID, pendingOffset, roundPendingPrice],
  );
  const [pendingEntryPrice, setPendingEntryPrice] = useState(0);
  const [pendingStopLimitPrice, setPendingStopLimitPrice] = useState(0);
  const lastConfiguredPendingOrderTypeRef = useRef<ChartOrderType | null>(null);
  const isPendingOrderType = isPendingChartOrderType(orderType);
  const isStopLimitOrderType = isStopLimitChartOrderType(orderType);

  // When the user switches into a pending order type, seed the trigger and
  // stop-limit prices once. User edits are preserved until the type changes.
  useEffect(() => {
    if (!isPendingOrderType) {
      lastConfiguredPendingOrderTypeRef.current = null;
      return;
    }

    const nextEntry = resolveDefaultPendingPrice(orderType);
    if (!Number.isFinite(nextEntry) || nextEntry <= 0) {
      return;
    }

    const shouldResetPendingDefaults =
      lastConfiguredPendingOrderTypeRef.current !== orderType || pendingEntryPrice <= 0;

    if (!shouldResetPendingDefaults) {
      return;
    }

    setPendingEntryPrice(nextEntry);
    setPendingStopLimitPrice(
      resolveDefaultStopLimitPrice(orderType, nextEntry, stopLimitOffset, roundPendingPrice),
    );
    lastConfiguredPendingOrderTypeRef.current = orderType;
  }, [
    isPendingOrderType,
    orderType,
    pendingEntryPrice,
    resolveDefaultPendingPrice,
    roundPendingPrice,
    stopLimitOffset,
  ]);

  // Stepper changes always round to the valid tick size and keep the stop-limit
  // price aligned with the current trigger.
  const handlePendingEntryPriceChange = useCallback(
    (nextPrice: number) => {
      const roundedEntry = roundPendingPrice(nextPrice);
      if (!Number.isFinite(roundedEntry) || roundedEntry <= 0) {
        return;
      }

      setPendingEntryPrice(roundedEntry);
      setPendingStopLimitPrice(
        resolveDefaultStopLimitPrice(orderType, roundedEntry, stopLimitOffset, roundPendingPrice),
      );
    },
    [orderType, roundPendingPrice, stopLimitOffset],
  );
  // Helper text explains which pending-order line can be moved in the preview.
  const pendingPreviewSummary = useMemo(() => {
    const triggerValue = pendingEntryPrice > 0 ? pendingEntryPrice.toFixed(priceDecimals) : '--';
    if (!isPendingOrderType) {
      return '';
    }

    if (isStopLimitOrderType) {
      const stopLimitValue = pendingStopLimitPrice > 0 ? pendingStopLimitPrice.toFixed(priceDecimals) : '--';
      return `Drag the dotted trigger line in the graph to move the pending price.\nTrigger: ${triggerValue}\nStop Limit: ${stopLimitValue}`;
    }

    return `Drag the dotted trigger line in the graph to move the pending price.\nTrigger: ${triggerValue}`;
  }, [
    isPendingOrderType,
    isStopLimitOrderType,
    pendingEntryPrice,
    pendingStopLimitPrice,
    priceDecimals,
  ]);

  // Keep the selected order type centered in the horizontal tab rail.
  const scrollOrderTypeTabsToSelection = useCallback(
    (selected: ChartOrderType, animated: boolean) => {
      const layout = orderTypeTabLayoutsRef.current[selected];
      const viewportWidth = orderTypeTabsViewportWidthRef.current;

      if (!layout || viewportWidth <= 0) {
        return;
      }

      const targetX = Math.max(0, layout.x - (viewportWidth - layout.width) / 2);
      orderTypeTabsRef.current?.scrollTo({ x: targetX, animated });
    },
    [],
  );

  useEffect(() => {
    scrollOrderTypeTabsToSelection(orderType, false);
  }, [orderType, scrollOrderTypeTabsToSelection]);

  // Synthesize a small depth-of-market preview from live prices. The seed keeps
  // displayed volumes moving gently instead of resetting hard on every tick.
  const domSeed = useRef({
    v1s: Math.floor(Math.random() * 60 + 20), v1b: Math.floor(Math.random() * 20 + 5),
    v2s: Math.floor(Math.random() * 80 + 40), v2b: Math.floor(Math.random() * 80 + 40),
    v3s: Math.floor(Math.random() * 20 + 5), v3b: Math.floor(Math.random() * 60 + 20),
  });

  const domRows = useMemo(() => {
    // Slightly perturb each row so the depth table feels live without large jumps.
    const perturb = (val: number) => {
      const v = val + (Math.random() * 14 - 7);
      return Math.max(5, Math.min(95, v));
    };

    domSeed.current = {
      v1s: perturb(domSeed.current.v1s), v1b: perturb(domSeed.current.v1b),
      v2s: perturb(domSeed.current.v2s), v2b: perturb(domSeed.current.v2b),
      v3s: perturb(domSeed.current.v3s), v3b: perturb(domSeed.current.v3b),
    };

    return [
      { sell: domSeed.current.v1s, price: fmt.price(ASK + pipSize * 3), buy: domSeed.current.v1b },
      { sell: domSeed.current.v2s, price: fmt.price((ASK + BID) / 2), buy: domSeed.current.v2b },
      { sell: domSeed.current.v3s, price: fmt.price(BID - pipSize * 3), buy: domSeed.current.v3b },
    ];
  }, [ASK, BID, pipSize, displayDecimals]);

  const [pendingSide, setPendingSide] = useState<TradeSide | null>(null);
  const [tradeActionLocked, setTradeActionLocked] = useState(false);
  // The tap lock blocks double-submits while a trade request is in flight.
  const tradeTapLockRef = useRef(false);
  const tradeTapLockSideRef = useRef<TradeSide | null>(null);
  const tradeActionDisabled = pendingSide !== null || tradeActionLocked;
  const pricePanelActionUnavailable = !oneClickAccepted || !isMarketExecution;
  const isTradeActionPending = (side: TradeSide) => pendingSide === side;
  const isPricePanelActionDisabled = (_side: TradeSide) => pricePanelActionUnavailable || tradeActionDisabled;
  const getPricePanelActionOpacity = (side: TradeSide) =>
    pricePanelActionUnavailable || isTradeActionPending(side) ? 0.5 : 1;
  const tradeButtonActions: readonly OrderTicketTradeAction[] = [
    {
      side: TRADE_SIDE.sell,
      displayLabel: 'SELL',
      marketLabel: 'SELL BY MARKET',
      priceLabel: 'BID',
      price: BID,
      color: SELL_C,
      backgroundColor: SELL_BG,
      execStyle: styles.execSell,
      priceTestID: 'order-ticket-sell-price-button',
      execTestID: 'order-ticket-sell-market-button',
    },
    {
      side: TRADE_SIDE.buy,
      displayLabel: 'BUY',
      marketLabel: 'BUY BY MARKET',
      priceLabel: 'ASK',
      price: ASK,
      color: BUY_C,
      backgroundColor: BUY_BG,
      execStyle: styles.execBuy,
      priceTestID: 'order-ticket-buy-price-button',
      execTestID: 'order-ticket-buy-market-button',
    },
  ];
  const sellTradeAction = tradeButtonActions[0];
  const buyTradeAction = tradeButtonActions[1];

  // After an optimistic local insert, poll positions briefly so local state
  // converges with the server-created ticket once it is available.
  const syncOpenedPosition = async (login: string, ticketId?: number) => {
    const maxAttempts = 15;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await usePositionsState.getState().refreshPositions(login);

      if (!ticketId) return;

      const exists = usePositionsState.getState().positions.some(
        (position) => String(position.id) === String(ticketId)
      );

      if (exists) return;

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  // Submit a market order. This path validates account context, builds the API
  // payload, handles backend rejection, and updates the positions list.
  const handlePlaceOrder = async (side: TradeSide) => {
    const requestedSide = assertTradeSide(side);
    if (!isMarketExecution) {
      console.log('[TRADE-BUTTON-PRESS]', {
        symbol,
        buttonPressed: requestedSide,
        displayedLabel: requestedSide === 'buy' ? 'BUY' : 'SELL',
        sidePassedToHandler: requestedSide,
        routeSide: routeSide ?? null,
        ignored: true,
        reason: 'order-type-not-market',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (tradeTapLockRef.current || tradeActionLocked || pendingSide !== null) {
      console.log('[TRADE-BUTTON-PRESS]', {
        symbol,
        buttonPressed: requestedSide,
        displayedLabel: requestedSide === 'buy' ? 'BUY' : 'SELL',
        sidePassedToHandler: requestedSide,
        routeSide: routeSide ?? null,
        ignored: true,
        lockSide: tradeTapLockSideRef.current ?? pendingSide,
        reason: tradeTapLockRef.current
          ? 'tap-lock'
          : tradeActionLocked
            ? 'trade-action-locked'
            : 'pending-side',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    tradeTapLockRef.current = true;
    tradeTapLockSideRef.current = requestedSide;
    setTradeActionLocked(true);
    setPendingSide(requestedSide);
    const releaseTradeTapLock = () => {
      tradeTapLockRef.current = false;
      tradeTapLockSideRef.current = null;
      setTradeActionLocked(false);
      setPendingSide(null);
    };

    console.log('[TRADE-BUTTON-PRESS]', {
      symbol,
      buttonPressed: requestedSide,
      displayedLabel: requestedSide === 'buy' ? 'BUY' : 'SELL',
      sidePassedToHandler: requestedSide,
      routeSide: routeSide ?? null,
      timestamp: new Date().toISOString(),
    });

    if (!accountDetails?.id || !accountDetails?.credentials?.accessToken) {
      const feedback = createFrontendTradingError(
        'Authentication Error',
        'The app does not have a valid local trading session. Log in again before placing an order.',
      );
      showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: requestedSide });
      releaseTradeTapLock();
      return;
    }

    const tradingLogin = resolveTradingLogin();
    if (!tradingLogin) {
      const feedback = createFrontendTradingError(
        'Account Error',
        'The app could not resolve the active trading account from local state. Select an account and try again.',
      );
      showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: requestedSide });
      releaseTradeTapLock();
      return;
    }

    try {
      // Live API Integration: POST /api/v2/orders
      // Places a market order via the centralized ordersApi.
      // Rate limited: 60 requests/min per account.
      // Routed through ordersApi -> apiClient which handles:
      //   - Automatic Bearer token injection from Zustand state
      //   - 401 token refresh loops
      //   - DB transaction atomicity on the server side
      //   - Rejection on zero/negative market prices
      //   - SL/TP validation against current market price
      // Read the broker_id that was persisted at login time. The server
      // requires this to route the order to the correct MT5 manager; without
      // it the response is 403 "No broker context found".
      const brokerIdForOrder = brokerId || undefined;

      // Only include SL/TP when explicitly enabled by the user. Sending 0
      // makes some MT5 bridges interpret it as "set price to zero" and the
      // backend rejects the insert. Same for trailing_stop/trailing_step/magic.
      const payload = {
        account_login: tradingLogin,
        broker_id: brokerIdForOrder,
        symbol: symbol,
        side: requestedSide,
        volume: volume,
        ...(slEnabled && slPrice > 0 ? { price_sl: slPrice } : {}),
        ...(tpEnabled && tpPrice > 0 ? { price_tp: tpPrice } : {}),
        comment: routeComment?.trim() || '',
      };
      console.log('[TRADE-PAYLOAD]', {
        symbol: payload.symbol,
        side: payload.side,
        action: payload.side,
        orderType: 'market',
        command: payload.side,
        tradeType: 'market',
        volume: payload.volume,
        priceSource: payload.side === 'buy' ? 'ask' : 'bid',
        rawPayload: payload,
      });

      const data = await ordersApi.placeMarketOrder(payload);
      console.log('[TRADE-RESPONSE]', {
        requestSide: requestedSide,
        result: data?.status ?? 'success',
        backendSide: data?.side ?? null,
        rawResponse: data,
      });

      if (['rejected', 'failed', 'error'].includes((data.status ?? '').toLowerCase())) {
        const feedback = classifyTradingError(
          { status: 400, data: { message: data.comment || `Server returned status: ${data.status}` } },
          { action: 'place-order' },
        );
        showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: requestedSide });
        return;
      }

      const positionTicket = data.position_ticket ?? data.order_ticket;

      // Optimistic update: add the position immediately so the trading UI does
      // not wait for the background positions refresh.
      const state = usePositionsState.getState();
      const newPos = {
        id: String(positionTicket || Math.floor(Math.random() * 10000000)),
        symbol: symbol,
        side: requestedSide,
        volume: volume,
        openPrice: data.price || (requestedSide === 'buy' ? ASK : BID),
        currentPrice: data.price || (requestedSide === 'buy' ? ASK : BID),
        pnl: 0,
        swap: 0,
        openTime: new Date().toISOString(),
        sl: slEnabled ? slPrice : 0,
        tp: tpEnabled ? tpPrice : 0,
        clientCreatedAt: Date.now(),
      };

      state.upsertPosition(newPos);

      // Refresh positions state from the server in the background.
      const mt5Login = resolveTradingLoginString();
      if (mt5Login) {
        void syncOpenedPosition(mt5Login, positionTicket);
      }

      showModal({
        visible: true,
        type: 'success',
        title: 'Order Executed',
        message: `Successfully placed ${requestedSide.toUpperCase()} ${volume} lot(s) on ${symbol?.replace(/\//g, '')}`,
        side: requestedSide,
        ticket: String(positionTicket ?? ''),
        symbol: symbol?.replace(/\//g, ''),
        volume,
        price: data.price || (requestedSide === 'buy' ? ASK : BID),
        executedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
    } catch (error: any) {
      const feedback = classifyTradingError(error, { action: 'place-order' });
      // Extract raw server message so we can see the exact rejection reason
      const rawMsg = (error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || '');
      const displayMsg = rawMsg ? `${feedback.message}\n\nServer: ${rawMsg}` : feedback.message;
      console.warn('[TRADE-RESPONSE]', {
        requestSide: requestedSide,
        result: 'error',
        backendSide: error?.response?.data?.side ?? error?.data?.side ?? null,
        rawResponse: error?.response?.data ?? error?.data ?? error,
      });
      showModal({ visible: true, type: 'error', title: feedback.title, message: displayMsg, side: requestedSide });
    } finally {
      releaseTradeTapLock();
    }
  };

  const queryClient = useQueryClient();

  // All volume changes go through one helper so typed values, stepper presses,
  // quick presets, and persisted preferences stay consistent.
  const updateVolume = useCallback(
    (nextVolume: number | string) => {
      const normalized = normalizeTradeVolume(nextVolume, volumeBounds);
      setVolume(normalized);
      setVolumeInput(formatTradeVolume(normalized, volumeBounds));
      setTradeVolume(normalized);
    },
    [setTradeVolume, volumeBounds],
  );

  const commitVolumeInput = useCallback(() => {
    if (!volumeInput.trim()) {
      setVolumeInput(formatTradeVolume(volume, volumeBounds));
      return;
    }
    updateVolume(volumeInput);
  }, [updateVolume, volume, volumeBounds, volumeInput]);

  const adj = useCallback(
    (direction: -1 | 1) => {
      updateVolume(incrementTradeVolume(volume, direction, volumeBounds));
    },
    [updateVolume, volume, volumeBounds],
  );

  /* Pending order placement */
  // Pending orders share market-order safety checks, then add price_open and
  // type so the backend can create the correct pending order.
  const handlePlacePendingOrder = async () => {
    if (isMarketExecution) return;
    if (tradeTapLockRef.current || tradeActionLocked || pendingSide !== null) return;

    const pendingSideValue = getChartOrderSide(orderType);
    tradeTapLockRef.current = true;
    tradeTapLockSideRef.current = pendingSideValue;
    setTradeActionLocked(true);
    setPendingSide(pendingSideValue);
    const releaseLock = () => {
      tradeTapLockRef.current = false;
      tradeTapLockSideRef.current = null;
      setTradeActionLocked(false);
      setPendingSide(null);
    };

    if (!accountDetails?.id || !accountDetails?.credentials?.accessToken) {
      const feedback = createFrontendTradingError(
        'Authentication Error',
        'Log in again before placing an order.',
      );
      showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: pendingSideValue });
      releaseLock();
      return;
    }

    const tradingLogin = resolveTradingLogin();
    if (!tradingLogin) {
      const feedback = createFrontendTradingError('Account Error', 'Could not resolve the active trading account.');
      showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: pendingSideValue });
      releaseLock();
      return;
    }

    try {
      const brokerIdForOrder = brokerId || undefined;
      const payload = {
        account_login: tradingLogin,
        broker_id: brokerIdForOrder,
        symbol,
        side: pendingSideValue,
        volume,
        ...(pendingEntryPrice > 0 ? { price_open: pendingEntryPrice } : {}),
        ...(slEnabled && slPrice > 0 ? { price_sl: slPrice } : {}),
        ...(tpEnabled && tpPrice > 0 ? { price_tp: tpPrice } : {}),
        comment: routeComment?.trim() || '',
        type: orderType.toLowerCase().replace(/\s+/g, '_'),
      };

      console.log('[PENDING-ORDER-PAYLOAD]', payload);

      // Use the same placeMarketOrder endpoint; the backend differentiates
      // via the `type` field. If not supported, it falls through gracefully.
      const data = await ordersApi.placeMarketOrder(payload as any);

      if (['rejected', 'failed', 'error'].includes((data.status ?? '').toLowerCase())) {
        const feedback = classifyTradingError(
          { status: 400, data: { message: data.comment || `Server returned status: ${data.status}` } },
          { action: 'place-order' },
        );
        showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: pendingSideValue });
        return;
      }

      // Invalidate order queries so the chart overlay can pick up the new order.
      queryClient.invalidateQueries({ queryKey: ['ordersByLogin'] });
      queryClient.invalidateQueries({ queryKey: ['accountOrders'] });

      const orderTicket = data.order_ticket ?? data.position_ticket ?? data.ticket;
      showModal({
        visible: true,
        type: 'success',
        title: 'Pending Order Placed',
        message: `${orderType.toUpperCase()} ${volume.toFixed(2)} lot(s) on ${symbol} at ${pendingEntryPrice > 0 ? pendingEntryPrice.toFixed(priceDecimals) : 'market'}`,
        side: pendingSideValue,
        ticket: String(orderTicket ?? ''),
        symbol: symbol?.replace(/\//g, ''),
        volume,
        price: pendingEntryPrice > 0 ? pendingEntryPrice : (pendingSideValue === 'buy' ? ASK : BID),
        executedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
    } catch (error: any) {
      const feedback = classifyTradingError(error, { action: 'place-order' });
      const rawMsg = error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || '';
      const displayMsg = rawMsg ? `${feedback.message}\n\nServer: ${rawMsg}` : feedback.message;
      showModal({ visible: true, type: 'error', title: feedback.title, message: displayMsg, side: pendingSideValue });
    } finally {
      releaseLock();
    }
  };

  const spread = Math.round((ASK - BID) / 0.01);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Compact header: back button, current symbol, and live status. */}
      <View style={[styles.header, { paddingTop: insets.top + 6, zIndex: 10 }]}>
        <FastPressable
          onPress={() => safeRouterBack(router, '/(tabs)/trade')}
          latencyLabel="orderTicket.back"
          hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </FastPressable>
        <View style={styles.hCenter}>
          <Text style={styles.hSymbol}>{symbol?.replace(/\//g, '')}</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveLabel}>Live</Text>
        </View>
      </View>

      {/* Price panel: large BID/ASK tap targets for one-click market execution. */}
      <View style={styles.pricePanel}>
        <FastPressable
          style={[styles.priceHalf, { backgroundColor: sellTradeAction.backgroundColor, opacity: getPricePanelActionOpacity(sellTradeAction.side) }]}
          disabled={isPricePanelActionDisabled(sellTradeAction.side)}
          accessibilityState={{ disabled: isPricePanelActionDisabled(sellTradeAction.side), busy: isTradeActionPending(sellTradeAction.side) }}
          onPress={() => { void handlePlaceOrder(sellTradeAction.side); }}
          latencyLabel={`orderTicket.pricePanel.${sellTradeAction.side}`}
          latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
          accessibilityRole="button"
          accessibilityLabel={sellTradeAction.displayLabel}
          testID={sellTradeAction.priceTestID}
        >
          <Text style={[styles.priceTag, { color: sellTradeAction.color }]}>{sellTradeAction.displayLabel}</Text>
          <Text style={styles.priceMain}>{fmt.price(sellTradeAction.price)}</Text>
          <Text style={styles.priceLabel}>{sellTradeAction.priceLabel}</Text>
        </FastPressable>

        {/* Spread pillar: shows the current difference between ASK and BID. */}
        <View style={styles.spreadCenter}>
          <Ionicons name="swap-horizontal" size={11} color={T.textSub} />
          <Text style={styles.spreadVal}>{spread}</Text>
          <Text style={styles.spreadUnit}>pts</Text>
        </View>

        <FastPressable
          style={[styles.priceHalf, { backgroundColor: buyTradeAction.backgroundColor, opacity: getPricePanelActionOpacity(buyTradeAction.side) }]}
          disabled={isPricePanelActionDisabled(buyTradeAction.side)}
          accessibilityState={{ disabled: isPricePanelActionDisabled(buyTradeAction.side), busy: isTradeActionPending(buyTradeAction.side) }}
          onPress={() => { void handlePlaceOrder(buyTradeAction.side); }}
          latencyLabel={`orderTicket.pricePanel.${buyTradeAction.side}`}
          latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
          accessibilityRole="button"
          accessibilityLabel={buyTradeAction.displayLabel}
          testID={buyTradeAction.priceTestID}
        >
          <Text style={[styles.priceTag, { color: buyTradeAction.color }]}>{buyTradeAction.displayLabel}</Text>
          <Text style={styles.priceMain}>{fmt.price(buyTradeAction.price)}</Text>
          <Text style={styles.priceLabel}>{buyTradeAction.priceLabel}</Text>
        </FastPressable>
      </View>

      {/* Scrollable form: order type, volume, risk controls, market data, and submit controls. */}
      <ScrollView
        canCancelContentTouches={false}
        style={styles.root}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        {/* Order type tabs: market execution or one of the pending order types. */}
        <Text style={styles.sectionTitle}>ORDER TYPE</Text>
        <ScrollView
          ref={orderTypeTabsRef}
          horizontal
          directionalLockEnabled
          nestedScrollEnabled
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          style={styles.orderTypeTabsScroll}
          contentContainerStyle={styles.orderTypeTabs}
          onLayout={(event) => {
            orderTypeTabsViewportWidthRef.current = event.nativeEvent.layout.width;
            scrollOrderTypeTabsToSelection(orderType, false);
          }}
        >
          {CHART_ORDER_TYPES.map((option) => {
            const active = option === orderType;
            const isSell = option.toLowerCase().startsWith('sell');
            return (
              <FastPressable
                key={option}
                onLayout={(event) => {
                  orderTypeTabLayoutsRef.current[option] = {
                    x: event.nativeEvent.layout.x,
                    width: event.nativeEvent.layout.width,
                  };
                }}
                style={[
                  styles.orderTypeTab,
                  active && styles.orderTypeTabActive,
                  active && { borderColor: isSell ? SELL_C : BUY_C },
                ]}
                onPress={() => {
                  setOrderType(option);
                  scrollOrderTypeTabsToSelection(option, true);
                }}
                latencyLabel={`orderTicket.orderType.${option}`}
              >
                <Text style={[styles.orderTypeTabText, active && styles.orderTypeTabTextActive]}>{option}</Text>
              </FastPressable>
            );
          })}
        </ScrollView>

        {/* Volume controls: typed lot input, plus/minus stepper, and quick presets. */}
        <View style={styles.volSection}>
          <Text style={styles.rowLabel}>Volume</Text>
          <View style={styles.volStepper}>
            <FastPressable style={styles.volBtn} onPress={() => adj(-1)} latencyLabel="orderTicket.volume.decrement" hitSlop={8}>
              <Ionicons name="remove" size={18} color={T.textSub} />
            </FastPressable>
            <View style={styles.volCenter}>
              <TextInput
                style={styles.volInput}
                value={volumeInput}
                onChangeText={(text) => setVolumeInput(sanitizeTradeVolumeDraft(text))}
                onBlur={commitVolumeInput}
                onSubmitEditing={commitVolumeInput}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder={formatTradeVolume(volume, volumeBounds)}
                placeholderTextColor={T.textMuted}
              />
            </View>
            <FastPressable style={styles.volBtn} onPress={() => adj(1)} latencyLabel="orderTicket.volume.increment" hitSlop={8}>
              <Ionicons name="add" size={18} color={T.textSub} />
            </FastPressable>
          </View>
        </View>
        <View style={styles.quickRow}>
          {[0.01, 0.05, 0.10, 0.50, 1.00].map(v => (
            <FastPressable
              key={v}
              style={[styles.quickPill, Math.abs(volume - v) < 0.000001 && styles.quickPillActive]}
              onPress={() => updateVolume(v)}
              latencyLabel={`orderTicket.volume.quick.${v.toFixed(2)}`}
            >
              <Text style={[styles.quickTxt, Math.abs(volume - v) < 0.000001 && styles.quickTxtActive]}>
                {(v || 0).toFixed(2)}
              </Text>
            </FastPressable>
          ))}
        </View>
        <View style={styles.hairline} />

        {/* Risk management: optional stop loss, take profit, and future trailing stop control. */}
        <Text style={styles.sectionTitle}>RISK MANAGEMENT</Text>
        <ToggleRow label="Stop Loss" icon="shield-half-outline" enabled={slEnabled} onToggle={() => {
          if (!slEnabled) setSlPrice(latestClose);
          setSlEnabled(v => !v);
        }} T={T} isDark={isDark} styles={styles} />
        {slEnabled && (
          <View style={styles.riskInputRow}>
            <View style={styles.volStepper}>
              <FastPressable style={styles.volBtn} onPress={() => setSlPrice(p => parseFloat((p - pipSize * 10).toFixed(displayDecimals)))} latencyLabel="orderTicket.sl.decrement" hitSlop={8}>
                <Ionicons name="remove" size={18} color={T.textSub} />
              </FastPressable>
              <View style={[styles.volCenter, { width: 120 }]}>
                <Text style={styles.volNum}>{fmt.price(slPrice)}</Text>
              </View>
              <FastPressable style={styles.volBtn} onPress={() => setSlPrice(p => parseFloat((p + pipSize * 10).toFixed(displayDecimals)))} latencyLabel="orderTicket.sl.increment" hitSlop={8}>
                <Ionicons name="add" size={18} color={T.textSub} />
              </FastPressable>
            </View>
          </View>
        )}
        <View style={styles.hairline} />
        <ToggleRow label="Take Profit" icon="analytics-outline" enabled={tpEnabled} onToggle={() => {
          if (!tpEnabled) setTpPrice(latestClose);
          setTpEnabled(v => !v);
        }} T={T} isDark={isDark} styles={styles} />
        {tpEnabled && (
          <View style={styles.riskInputRow}>
            <View style={styles.volStepper}>
              <FastPressable style={styles.volBtn} onPress={() => setTpPrice(p => parseFloat((p - pipSize * 10).toFixed(displayDecimals)))} latencyLabel="orderTicket.tp.decrement" hitSlop={8}>
                <Ionicons name="remove" size={18} color={T.textSub} />
              </FastPressable>
              <View style={[styles.volCenter, { width: 120 }]}>
                <Text style={styles.volNum}>{fmt.price(tpPrice)}</Text>
              </View>
              <FastPressable style={styles.volBtn} onPress={() => setTpPrice(p => parseFloat((p + pipSize * 10).toFixed(displayDecimals)))} latencyLabel="orderTicket.tp.increment" hitSlop={8}>
                <Ionicons name="add" size={18} color={T.textSub} />
              </FastPressable>
            </View>
          </View>
        )}
        <View style={styles.hairline} />
        <ToggleRow label="Trailing Stop" icon="git-commit-outline" enabled={false} onToggle={() => { }} T={T} isDark={isDark} styles={styles} />
        <View style={styles.hairline} />

        {/* Market data: compact read-only values that affect the order decision. */}
        <Text style={styles.sectionTitle}>{t('MARKET DATA')}</Text>
        <InfoRow label={t('Fill Policy')} value="FOK" styles={styles} />
        <View style={styles.hairline} />
        <InfoRow label={t('Spread')} value={`${spread} ${t('pts')}`} styles={styles} />
        <View style={styles.hairline} />
        <InfoRow label={t('Margin')} value={marginDisplay} styles={styles} />
        <View style={styles.hairline} />
        <InfoRow label={t('Acc. Leverage')} value={`1:${leverage}`} styles={styles} />
        <View style={styles.hairline} />

        {/* Depth of market: compact simulated liquidity rows around current price. */}
        <Text style={styles.sectionTitle}>DEPTH OF MARKET</Text>
        <View style={styles.domTable}>
          {/* Column labels for the depth rows. */}
          <View style={styles.domHeaderRow}>
            <Text style={[styles.domColHead, { textAlign: 'right' }]}>SELL VOL</Text>
            <Text style={styles.domColHead}>PRICE</Text>
            <Text style={styles.domColHead}>BUY VOL</Text>
          </View>
          {/* Depth rows render sell volume, reference price, and buy volume. */}
          {domRows.map((r, i) => (
            <View key={i} style={styles.domRow}>
              <View style={styles.domBarCol}>
                <View style={[styles.domBarSell, { width: `${r.sell}%` }]} />
              </View>
              <Text style={styles.domPrice}>{r.price}</Text>
              <View style={[styles.domBarCol, { alignItems: 'flex-start' }]}>
                <View style={[styles.domBarBuy, { width: `${r.buy}%` }]} />
              </View>
            </View>
          ))}
        </View>

        {/* Execution buttons: market orders submit immediately; pending orders show trigger controls first. */}
        {isMarketExecution ? (
          <View style={styles.execRow}>
            {tradeButtonActions.map((action) => (
              <FastPressable
                key={action.side}
                style={({ pressed }) => [
                  styles.execBtn,
                  action.execStyle,
                  isTradeActionPending(action.side) && styles.execBtnBusy,
                  pressed && { opacity: 0.88 }
                ]}
                onPress={() => { void handlePlaceOrder(action.side); }}
                latencyLabel={`orderTicket.exec.${action.side}`}
                latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
                disabled={tradeActionDisabled}
                accessibilityState={{ disabled: tradeActionDisabled, busy: isTradeActionPending(action.side) }}
                accessibilityRole="button"
                accessibilityLabel={action.marketLabel}
                testID={action.execTestID}
              >
                {isTradeActionPending(action.side) ? (
                  <ActivityIndicator color={T.text} />
                ) : (
                  <>
                    <Text style={styles.execCta}>{action.marketLabel}</Text>
                    <Text style={styles.execLots}>{(volume || 0).toFixed(2)} Lots</Text>
                  </>
                )}
              </FastPressable>
            ))}
          </View>
        ) : (
          <View>
            {/* Pending order info card explains the selected order type and trigger price. */}
            <View style={styles.pendingSubmitPlaceholder}>
              <Ionicons name='analytics-outline' size={18} color={T.accent} />
              <View style={styles.pendingSubmitCopy}>
                <Text style={styles.pendingSubmitTitle}>{orderType}</Text>
                <Text style={styles.pendingSubmitText}>
                  {pendingPreviewSummary}
                </Text>
              </View>
            </View>

            {/* Pending entry price stepper moves the trigger by ten price points. */}
            <View style={[styles.volSection, { marginTop: 10 }]}>
              <Text style={styles.rowLabel}>{t('Price')}</Text>
              <View style={styles.volStepper}>
                <FastPressable
                  style={styles.volBtn}
                  onPress={() => handlePendingEntryPriceChange(pendingEntryPrice - pricePointSize * 10)}
                  latencyLabel="orderTicket.pending.price.decrement"
                  hitSlop={8}
                >
                  <Ionicons name="remove" size={18} color={T.textSub} />
                </FastPressable>
                <View style={[styles.volCenter, { width: 140 }]}>
                  <Text style={styles.volNum}>{pendingEntryPrice > 0 ? pendingEntryPrice.toFixed(priceDecimals) : '--'}</Text>
                </View>
                <FastPressable
                  style={styles.volBtn}
                  onPress={() => handlePendingEntryPriceChange(pendingEntryPrice + pricePointSize * 10)}
                  latencyLabel="orderTicket.pending.price.increment"
                  hitSlop={8}
                >
                  <Ionicons name="add" size={18} color={T.textSub} />
                </FastPressable>
              </View>
            </View>

            {/* Submit button sends the configured pending order. */}
            <View style={[styles.execRow, { marginTop: 8 }]}>
              <FastPressable
                style={({ pressed }) => [
                  styles.execBtn,
                  orderType.toLowerCase().startsWith('sell') ? styles.execSell : styles.execBuy,
                  pressed && { opacity: 0.88 },
                ]}
                onPress={() => { void handlePlacePendingOrder(); }}
                latencyLabel="orderTicket.pending.submit"
                disabled={tradeActionDisabled || pendingEntryPrice <= 0}
                accessibilityRole="button"
                accessibilityLabel={`Place ${orderType}`}
                testID="order-ticket-pending-submit"
              >
                {pendingSide !== null ? (
                  <ActivityIndicator color={T.text} />
                ) : (
                  <>
                    <Text style={styles.execCta}>PLACE {orderType.toUpperCase()}</Text>
                    <Text style={styles.execLots}>{volume.toFixed(2)} Lots @ {pendingEntryPrice > 0 ? pendingEntryPrice.toFixed(priceDecimals) : '--'}</Text>
                  </>
                )}
              </FastPressable>
            </View>
          </View>
        )}

        <View style={styles.executionGraphWrap}>
          <LiveOrderTickExecutionGraph
            symbol={symbol}
            bid={BID}
            ask={ASK}
            timestamp={tickTimestamp}
            priceDecimals={priceDecimals}
            bidColor="#2563EB"
            askColor="#EF4444"
            height={300}
            isDark={isDark}
          />
        </View>

        {/* Disclaimer: reminds users that final market execution can slip. */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTxt}>
            *Final execution price may slightly differ due to market volatility.
          </Text>
        </View>
      </ScrollView>

      {/* Success/error modal overlay for order feedback. */}
      <TradeFeedbackModal
        state={modalState}
        onClose={handleModalClose}
        isDark={isDark}
      />
    </View>
  );
}

/* Toggle row */
// Reusable switch row for simple on/off settings such as Stop Loss.
function ToggleRow({ label, icon, enabled, onToggle, T, isDark, styles }: {
  T: ThemeColors;
  isDark: boolean;
  styles: any;
  label: string; icon: keyof typeof Ionicons.glyphMap;
  enabled: boolean; onToggle: () => void;
}) {
  return (
    <View style={styles.flatRow}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={14} color={T.textSub} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <FastPressable
          onPress={onToggle}
          latencyLabel={`orderTicket.toggle.${label}`}
          style={[styles.track, enabled && styles.trackOn]}
        >
          <View style={[styles.thumb, enabled && styles.thumbOn]} />
        </FastPressable>
        <Text style={[styles.statusTxt, enabled && { color: T.accent }]}>
          {enabled ? 'ON' : 'OFF'}
        </Text>
      </View>
    </View>
  );
}

/* Info row */
// Reusable key-value row used by the market data section.
function InfoRow({ label, value, styles }: {
  label: string;
  value: string;
  styles: any;
}) {
  return (
    <View style={styles.flatRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValueWhite}>{value}</Text>
    </View>
  );
}

/* Styles */
// Local styles live with the screen because this ticket has many compact,
// screen-specific controls that are not shared elsewhere.
function makeStyles(T: ThemeColors, isDark: boolean) {
  const BG = T.bg;
  const SURFACE = T.glass2;
  const ELEVATED = T.glass1;
  const LINE = T.border;
  const WHITE = T.text;
  const SUB = T.textSub;
  const DIM = T.textMuted;
  const ACCENT = T.accent;

  const SELL_C = T.trading.sell.primary;
  const SELL_BG = isDark ? 'rgba(255,59,48,0.08)' : 'rgba(220,38,38,0.06)';
  const BUY_C = T.trading.buy.primary;
  const BUY_BG = isDark ? 'rgba(52,199,89,0.08)' : 'rgba(5,150,105,0.06)';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, zIndex: 10 },
    backBtn: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
    hCenter: { flex: 1, alignItems: 'center' },
    hSymbol: { color: WHITE, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
    livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: BUY_BG },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BUY_C },
    liveLabel: { color: BUY_C, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

    pricePanel: {
      flexDirection: 'row', direction: 'ltr', alignItems: 'center', marginHorizontal: 12, marginBottom: 12, borderRadius: 12, overflow: 'hidden',
      backgroundColor: SURFACE, borderWidth: 1, borderColor: T.border,
      shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 24, elevation: 4
    },
    priceHalf: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    priceTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
    priceMain: { color: WHITE, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'], padding: 8, letterSpacing: -0.5 },
    priceLabel: { color: T.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
    spreadCenter: { width: 40, alignItems: 'center', justifyContent: 'center' },
    spreadVal: { color: WHITE, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1 },
    spreadUnit: { color: T.textSub, fontSize: 8, fontWeight: '700' },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
    sectionTitle: { color: T.textSub, fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },

    flatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowLabel: { color: SUB, fontSize: 14, fontWeight: '500' },
    rowValueWhite: { color: WHITE, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
    hairline: { height: 1, backgroundColor: LINE },

    orderTypeTabsScroll: { marginTop: 2 },
    orderTypeTabs: { gap: 4, paddingTop: 6, paddingBottom: 2, paddingRight: 0 },
    orderTypeTab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: ELEVATED,
      borderWidth: 1,
      borderColor: T.border,
    },
    orderTypeTabActive: {
      backgroundColor: isDark ? 'rgba(34,211,238,0.1)' : T.glass3,
    },
    orderTypeTabText: {
      color: SUB,
      fontSize: 13,
      fontWeight: '600',
    },
    orderTypeTabTextActive: {
      color: WHITE,
    },
    riskInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12, paddingRight: 4 },
    volSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
    volStepper: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 8, backgroundColor: ELEVATED, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
    volBtn: { width: 40, height: '100%', alignItems: 'center', justifyContent: 'center' },
    volCenter: { paddingHorizontal: 16, height: '100%', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: LINE },
    volNum: { color: WHITE, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
    volInput: { color: WHITE, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 72, textAlign: 'center', paddingVertical: 0 },
    quickRow: { flexDirection: 'row', gap: 5, paddingBottom: 4 },
    quickPill: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: ELEVATED, alignItems: 'center', borderWidth: 1, borderColor: T.border },
    quickPillActive: { backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : T.glass3, borderColor: ACCENT },
    quickTxt: { color: SUB, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
    quickTxtActive: { color: ACCENT },

    track: { width: 40, height: 22, borderRadius: 11, backgroundColor: isDark ? '#252C3B' : T.border, justifyContent: 'center', paddingHorizontal: 2 },
    trackOn: { backgroundColor: ACCENT },
    thumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: isDark ? '#A0ABC0' : '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
    thumbOn: { backgroundColor: '#FFFFFF', transform: [{ translateX: 18 }] },
    statusTxt: { color: SUB, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, minWidth: 22 },

    domTable: { marginTop: 4, marginBottom: 6, borderRadius: 8, backgroundColor: SURFACE, overflow: 'hidden', paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: T.border, shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.05, shadowRadius: 12, elevation: 2 },
    domHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    domColHead: { flex: 1, color: SUB, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
    domRow: { flexDirection: 'row', alignItems: 'center', height: 16, marginBottom: 2 },
    domBarCol: { flex: 1, height: 10, alignItems: 'flex-end', justifyContent: 'center' },
    domBarSell: { height: 12, borderRadius: 2, backgroundColor: SELL_C },
    domBarBuy: { height: 12, borderRadius: 2, backgroundColor: BUY_C },
    domPrice: { width: 80, textAlign: 'center', color: WHITE, fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },

    disclaimer: { alignItems: 'center', marginTop: 12, paddingHorizontal: 16 },
    disclaimerTxt: { color: T.textMuted, fontSize: 12, lineHeight: 16, textAlign: 'center' },
    disclaimerIcons: { flexDirection: 'row', gap: 10 },

    execRow: { flexDirection: 'row', direction: 'ltr', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
    execBtn: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    execBtnBusy: { opacity: 0.88 },
    execSell: { backgroundColor: SELL_C, shadowColor: SELL_C },
    execBuy: { backgroundColor: BUY_C, shadowColor: BUY_C },
    execCta: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
    execLots: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
    executionGraphWrap: {
      marginTop: 12,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: isDark ? '#080B11' : '#FFFFFF',
      borderWidth: 1,
      borderColor: T.border,
    },
    pendingSubmitPlaceholder: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginHorizontal: 12,
      marginTop: 4,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: T.border,
    },
    pendingSubmitCopy: {
      flex: 1,
    },
    pendingSubmitTitle: {
      color: WHITE,
      fontSize: 14,
      fontWeight: '700',
    },
    pendingSubmitText: {
      color: SUB,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
    },

    /* Success / Error Modal */
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 28,
      zIndex: 999,
      elevation: 999,
    },
    modalCard: {
      width: '92%',
      maxWidth: 360,
      backgroundColor: SURFACE,
      borderRadius: 28,
      paddingTop: 32,
      paddingBottom: 24,
      paddingHorizontal: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.25,
      shadowRadius: 40,
      elevation: 16,
    },
    modalIconWrap: {
      width: 80,
      height: 80,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    modalIconGlow: {
      position: 'absolute',
      width: 80,
      height: 80,
      borderRadius: 40,
    },
    modalIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalTitle: {
      color: T.text,
      fontSize: 21,
      fontWeight: '700',
      letterSpacing: -0.3,
      marginBottom: 12,
    },
    modalSymbolRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    modalSymbolText: {
      color: T.text,
      fontSize: 16,
      fontWeight: '700',
    },
    modalSidePill: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 6,
    },
    modalSidePillText: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    modalPrice: {
      color: T.text,
      fontSize: 36,
      fontWeight: '800',
      fontVariant: ['tabular-nums'] as any,
      letterSpacing: -1,
      marginTop: 4,
      marginBottom: 20,
    },
    modalDivider: {
      width: '100%',
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      marginBottom: 16,
    },
    modalDetailsRow: {
      flexDirection: 'row',
      width: '100%',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    modalDetailItem: {
      flex: 1,
      alignItems: 'center',
    },
    modalDetailLabel: {
      color: SUB,
      fontSize: 11,
      fontWeight: '500',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    modalDetailValue: {
      color: T.text,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'] as any,
    },
    modalDetailSep: {
      width: 1,
      height: 28,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    },
    modalMessage: {
      color: SUB,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 24,
      paddingHorizontal: 4,
    },
    modalBtn: {
      width: '100%',
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: 'center',
    },
    modalBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
