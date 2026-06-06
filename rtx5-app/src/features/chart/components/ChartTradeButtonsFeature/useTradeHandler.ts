/**
 * Trade handling for ChartTradeButtons — owns the trade-tap lock, the
 * "active side" visual lock, and the actual placeOrder mutation flow.
 */
import React from 'react';
import { router } from 'expo-router';
import { classifyTradingError } from '../../../../api/tradingErrors';
import { usePlaceOrderExecutor } from '../../../../query/orders';
import { resolveTradingLogin } from '../../../../state/tradingLogin';
import { useUserPreferences } from '../../../../state/userPreferences';
import { runCriticalTradeAction } from '../../../../utils/actionLatency';
import { getApiLatencyNow } from '../../../../utils/apiLatency';
import type { TradeSide } from '../../../../domain/tradeSide';
import { buildChartMarketOrderPayload, getChartTradeAction } from '../../chartTradeActions';
import {
  CHART_TRADE_TAP_RELEASE_DELAY_MS,
  acquireChartTradeButtonSharedLock,
  getChartTradeButtonSharedLockSide,
  releaseChartTradeButtonSharedLock,
} from './sharedLock';

const CHART_TRADE_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';
const CHART_TRADE_QUEUE_LIMIT = 10;
const CHART_TRADE_QUEUE_RETRY_MS = 50;

const logChartTradeDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (CHART_TRADE_DIAGNOSTICS_ENABLED) {
    console.log(...args);
  }
};

const warnChartTradeDiagnostic = (...args: Parameters<typeof console.warn>) => {
  if (CHART_TRADE_DIAGNOSTICS_ENABLED) {
    console.warn(...args);
  }
};

const runAfterChartTradeTapPaint = (work: () => void) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => {
      setTimeout(work, 0);
    });
    return;
  }

  setTimeout(work, 0);
};

type TradeFeedback = {
  visible: boolean;
  type: 'success' | 'error';
  title?: string;
  message?: string;
  side?: TradeSide;
  symbol?: string;
  ticket?: string;
  price?: number;
  volume?: number;
  executedAt?: string;
};

type QueuedChartTrade = {
  id: number;
  side: TradeSide;
  symbol: string;
  tradingLogin: string | number;
  volume: number;
  comment: string;
  latestBid: number;
  latestAsk: number;
  queuedAtMs: number;
};

export type TradeHandlerOptions = {
  symbol: string;
  variant?: 'compact' | 'mt5-market';
  comment?: string;
  lotSize: number;
  latestBid: number;
  latestAsk: number;
  onTradeResult?: (feedback: TradeFeedback) => void;
};

export function useTradeHandler({
  symbol,
  variant = 'compact',
  comment,
  lotSize,
  latestBid,
  latestAsk,
  onTradeResult,
}: TradeHandlerOptions) {
  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const currentChartSymbol = useUserPreferences((s) => s.chartSymbol);
  const placeOrder = usePlaceOrderExecutor();
  const [activeSide, setActiveSide] = React.useState<TradeSide | null>(null);
  const activeSideResetTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tradeTapLockRef = React.useRef(false);
  const tradeTapLockSideRef = React.useRef<TradeSide | null>(null);
  const tradeQueueRef = React.useRef<QueuedChartTrade[]>([]);
  const tradeQueueDrainTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTradeQueueIdRef = React.useRef(1);
  const isCurrentChartSymbol = currentChartSymbol === symbol;

  React.useEffect(() => () => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
      activeSideResetTimeoutRef.current = null;
    }
    tradeTapLockRef.current = false;
    if (tradeTapLockSideRef.current) {
      releaseChartTradeButtonSharedLock(tradeTapLockSideRef.current);
      tradeTapLockSideRef.current = null;
    }
    tradeQueueRef.current = [];
    if (tradeQueueDrainTimerRef.current) {
      clearTimeout(tradeQueueDrainTimerRef.current);
      tradeQueueDrainTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
      activeSideResetTimeoutRef.current = null;
    }
    setActiveSide(null);
    tradeTapLockRef.current = false;
    if (tradeTapLockSideRef.current) {
      releaseChartTradeButtonSharedLock(tradeTapLockSideRef.current);
      tradeTapLockSideRef.current = null;
    }
    tradeQueueRef.current = [];
    if (tradeQueueDrainTimerRef.current) {
      clearTimeout(tradeQueueDrainTimerRef.current);
      tradeQueueDrainTimerRef.current = null;
    }
  }, [symbol]);

  const clearActiveTradeSide = (side: TradeSide, delayMs = 0) => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
      activeSideResetTimeoutRef.current = null;
    }

    const clearSide = () => {
      setActiveSide((currentSide) => (currentSide === side ? null : currentSide));
      activeSideResetTimeoutRef.current = null;
    };

    if (delayMs > 0) {
      activeSideResetTimeoutRef.current = setTimeout(clearSide, delayMs);
      return;
    }

    clearSide();
  };

  const markActiveTradeSide = (side: TradeSide) => {
    if (activeSideResetTimeoutRef.current) {
      clearTimeout(activeSideResetTimeoutRef.current);
      activeSideResetTimeoutRef.current = null;
    }
    setActiveSide(side);
  };

  const releaseTradeTapLock = (delayMs = 0) => {
    const lockedSide = tradeTapLockSideRef.current;
    tradeTapLockRef.current = false;
    tradeTapLockSideRef.current = null;
    if (lockedSide) {
      releaseChartTradeButtonSharedLock(lockedSide, delayMs);
      clearActiveTradeSide(lockedSide, delayMs);
    }
  };

  const scheduleProcessNextQueuedTrade = (delayMs = 0) => {
    if (tradeQueueDrainTimerRef.current) {
      return;
    }

    tradeQueueDrainTimerRef.current = setTimeout(() => {
      tradeQueueDrainTimerRef.current = null;
      processNextQueuedTrade();
    }, delayMs);
  };

  function processNextQueuedTrade() {
    if (tradeTapLockRef.current || tradeQueueRef.current.length === 0) {
      return;
    }

    const queuedTrade = tradeQueueRef.current.shift();
    if (!queuedTrade) {
      return;
    }

    const action = getChartTradeAction(queuedTrade.side);
    if (!acquireChartTradeButtonSharedLock(action.side)) {
      tradeQueueRef.current.unshift(queuedTrade);
      scheduleProcessNextQueuedTrade(CHART_TRADE_QUEUE_RETRY_MS);
      return;
    }

    tradeTapLockRef.current = true;
    tradeTapLockSideRef.current = action.side;
    markActiveTradeSide(action.side);

    const payload = buildChartMarketOrderPayload({
      accountLogin: queuedTrade.tradingLogin,
      symbol: queuedTrade.symbol,
      side: action.side,
      volume: queuedTrade.volume,
      comment: queuedTrade.comment,
    });
    const requestStartedAtMs = getApiLatencyNow();
    const queueWaitMs = Math.max(0, Math.round(requestStartedAtMs - queuedTrade.queuedAtMs));

    logChartTradeDiagnostic('[TRADE-QUEUE-START]', {
      queueId: queuedTrade.id,
      side: action.side,
      symbol: queuedTrade.symbol,
      volume: queuedTrade.volume,
      queueWaitMs,
      remainingQueue: tradeQueueRef.current.length,
      timestamp: new Date().toISOString(),
    });
    logChartTradeDiagnostic('[TRADE-PAYLOAD]', {
      queueId: queuedTrade.id,
      symbol: payload.symbol,
      side: payload.side,
      action: payload.side,
      orderType: action.orderType,
      command: payload.side,
      tradeType: action.orderType,
      volume: queuedTrade.volume,
      priceSource: action.priceSource,
      rawPayload: payload,
    });

    placeOrder(payload, {
      onSuccess: (data: any) => {
        const backendMs = Math.max(0, Math.round(getApiLatencyNow() - requestStartedAtMs));
        logChartTradeDiagnostic('[TRADE-RESPONSE]', {
          queueId: queuedTrade.id,
          requestSide: action.side,
          result: data?.status ?? 'success',
          backendSide: data?.side ?? null,
          queueWaitMs,
          backendMs,
          remainingQueue: tradeQueueRef.current.length,
          rawResponse: data,
        });
        const ticket = data?.position_ticket || data?.order_ticket || data?.ticket || 'Confirmed';
        const execPrice = action.side === 'buy' ? queuedTrade.latestAsk : queuedTrade.latestBid;
        onTradeResult?.({
          visible: true,
          type: 'success',
          side: action.side,
          symbol: queuedTrade.symbol,
          ticket: String(ticket),
          price: execPrice,
          volume: queuedTrade.volume,
          executedAt: new Date().toLocaleTimeString(),
        });
        releaseTradeTapLock();
        scheduleProcessNextQueuedTrade();
      },
      onError: (err: any) => {
        const backendMs = Math.max(0, Math.round(getApiLatencyNow() - requestStartedAtMs));
        const feedback = classifyTradingError(err, { action: 'place-order' });
        warnChartTradeDiagnostic('[TRADE-RESPONSE]', {
          queueId: queuedTrade.id,
          requestSide: action.side,
          result: 'error',
          backendSide: err?.response?.data?.side ?? err?.data?.side ?? null,
          queueWaitMs,
          backendMs,
          remainingQueue: tradeQueueRef.current.length,
          rawResponse: err?.response?.data ?? err?.data ?? err,
        });
        warnChartTradeDiagnostic('[Trade] error', feedback.kind, feedback.title, '|', feedback.detail ?? feedback.message);
        onTradeResult?.({
          visible: true,
          type: 'error',
          title: feedback.title,
          message: feedback.message,
          side: action.side,
        });
        releaseTradeTapLock();
        if (feedback.kind === 'session-expired' || feedback.kind === 'rate-limit' || feedback.kind === 'backend-unavailable') {
          tradeQueueRef.current = [];
          return;
        }
        scheduleProcessNextQueuedTrade();
      },
    });
  }

  const executeTrade = (side: TradeSide) => {
    const action = getChartTradeAction(side);
    const stateChartSymbol = useUserPreferences.getState().chartSymbol;
    if (stateChartSymbol !== symbol) {
      logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        currentChartSymbol: stateChartSymbol,
        displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
        sidePassedToHandler: action.side,
        ignored: true,
        reason: 'stale-symbol',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const sharedLockSide = getChartTradeButtonSharedLockSide();
    if (!oneClickAccepted && (tradeTapLockRef.current || sharedLockSide !== null)) {
      logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
        sidePassedToHandler: action.side,
        ignored: true,
        lockSide: sharedLockSide,
        reason: tradeTapLockRef.current ? 'tap-lock' : 'shared-tap-lock',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (!oneClickAccepted && !acquireChartTradeButtonSharedLock(action.side)) {
      logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
        sidePassedToHandler: action.side,
        ignored: true,
        lockSide: getChartTradeButtonSharedLockSide(),
        reason: 'shared-tap-lock',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (!oneClickAccepted) {
      tradeTapLockRef.current = true;
      tradeTapLockSideRef.current = action.side;
      markActiveTradeSide(action.side);
    }
    const volume = Number(lotSize);
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    const authState = useUserPreferences.getState();
    const authToken = authState.accountDetails?.credentials?.accessToken;
    const tradingLogin = resolveTradingLogin();

    logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
      side,
      buttonPressed: action.buttonPressed,
      symbol,
      displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
      sidePassedToHandler: action.side,
      timestamp: new Date().toISOString(),
    });

    if (!authToken) {
      onTradeResult?.({
        visible: true, type: 'error',
        title: 'Sign In Required',
        message: 'Please sign in to your trading account before placing orders.',
        side: action.side,
      });
      releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      return;
    }

    if (!tradingLogin) {
      onTradeResult?.({
        visible: true, type: 'error',
        title: 'No Trading Account',
        message: 'No active trading account is selected. Open the account menu and choose one, then try again.',
        side: action.side,
      });
      releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      return;
    }

    if (!Number.isFinite(volume) || volume <= 0) {
      onTradeResult?.({
        visible: true, type: 'error',
        title: 'Invalid Lot Size',
        message: `Volume must be greater than 0. Current: ${lotSize}`,
        side: action.side,
      });
      releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      return;
    }

    if (oneClickAccepted) {
      logChartTradeDiagnostic('[Trade] one-click path, login=', tradingLogin);
      const queuedTrade: QueuedChartTrade = {
        id: nextTradeQueueIdRef.current,
        side: action.side,
        symbol,
        tradingLogin,
        volume,
        comment: trimmedComment,
        latestBid,
        latestAsk,
        queuedAtMs: getApiLatencyNow(),
      };
      const pendingTradeCount = tradeQueueRef.current.length + (tradeTapLockRef.current ? 1 : 0);
      if (pendingTradeCount >= CHART_TRADE_QUEUE_LIMIT) {
        warnChartTradeDiagnostic('[TRADE-QUEUE-FULL]', {
          side: action.side,
          symbol,
          pendingTradeCount,
          limit: CHART_TRADE_QUEUE_LIMIT,
          timestamp: new Date().toISOString(),
        });
        onTradeResult?.({
          visible: true,
          type: 'error',
          title: 'Trade Queue Full',
          message: `Wait for the current orders to finish before sending more than ${CHART_TRADE_QUEUE_LIMIT} rapid trades.`,
          side: action.side,
        });
        return;
      }
      nextTradeQueueIdRef.current += 1;
      tradeQueueRef.current.push(queuedTrade);
      logChartTradeDiagnostic('[TRADE-QUEUE-ENQUEUE]', {
        queueId: queuedTrade.id,
        side: action.side,
        symbol,
        volume,
        queueLength: tradeQueueRef.current.length,
        activeInFlight: tradeTapLockRef.current,
        sharedLockSide,
        timestamp: new Date().toISOString(),
      });
      processNextQueuedTrade();
    } else {
      logChartTradeDiagnostic('[Trade] navigate path → /trade/order-ticket');
      runAfterChartTradeTapPaint(() => {
        try {
          router.push({
            pathname: '/trade/order-ticket',
            params: {
              symbol,
              side: action.side,
              ...(trimmedComment ? { comment: trimmedComment } : {}),
            },
          });
          releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
        } catch (navErr: any) {
          warnChartTradeDiagnostic('[Trade] navigation failed', navErr);
          onTradeResult?.({
            visible: true, type: 'error',
            title: 'Navigation Error',
            message: navErr?.message || 'Could not open the order ticket screen.',
            side: action.side,
          });
          releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
        }
      });
    }
  };

  const handleTrade = (side: TradeSide) =>
    runCriticalTradeAction(`chart.${variant}.trade.${side}`, () => executeTrade(side));

  const isChartTradeActionBusy = (side: TradeSide) => activeSide === side && tradeTapLockRef.current;
  const isChartTradeActionVisuallyLocked = (side: TradeSide) =>
    !isCurrentChartSymbol || activeSide === side;
  const chartTradeActionDisabled = !isCurrentChartSymbol;

  return {
    handleTrade,
    isChartTradeActionBusy,
    isChartTradeActionVisuallyLocked,
    chartTradeActionDisabled,
    isCurrentChartSymbol,
  };
}

export type { TradeFeedback };
