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
import {
  quoteActionBlockMessage,
  recordBlockedPriceAction,
  resolveSessionQuoteActionAvailability,
  type ExecutableQuoteInput,
} from '../../../../market/quoteIntegrity';
import { buildChartMarketOrderPayload, getChartTradeAction } from '../../chartTradeActions';
import { validateChartTradeProtectionLevels } from '../../chartTradeOrderUtils';
import {
  CHART_TRADE_TAP_RELEASE_DELAY_MS,
  acquireChartTradeButtonSharedLock,
  getChartTradeButtonSharedLockSide,
  releaseChartTradeButtonSharedLock,
} from './sharedLock';
import { resolveChartTradeActionDisabled } from './tradeAvailability';
import {
  hideOrderTicketLaunch,
  scheduleOrderTicketLaunchNavigation,
  showOrderTicketLaunch,
} from '../../../trade/orderTicketLaunchController';
import { redactDiagnosticValue } from '../../../../utils/securityRedaction';
import { resolveBrokerExecutionEvidence } from '../../../../api/orders/executionEvidence';
import { normalizeSymbol } from '../../../../domain/symbols';
import {
  publishChartProtectionDraftSubmission,
  releaseChartProtectionDraftSubmission,
  tryBeginChartProtectionDraftSubmission,
} from '../../chartProtectionDraftLifecycle';
import {
  getActiveSltpUnavailableMessage,
  isNewMarketOrderProtectionBackendLocked,
  SLTP_COMING_SOON_TITLE,
} from '../../../trade/tradeBackendCapabilities';
import type { ChartTradeQueueEvent } from '../ChartTradeReceiptStack';

const CHART_TRADE_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';
const CHART_TRADE_QUEUE_RETRY_MS = 50;
let nextChartTradeQueueId = 1;

const logChartTradeDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (CHART_TRADE_DIAGNOSTICS_ENABLED) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const warnChartTradeDiagnostic = (...args: Parameters<typeof console.warn>) => {
  if (CHART_TRADE_DIAGNOSTICS_ENABLED) {
    console.warn(...args.map(redactDiagnosticValue));
  }
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
  executionConfirmed?: boolean;
  protectionDraftId?: string;
};

type QueuedChartTrade = {
  id: number;
  side: TradeSide;
  symbol: string;
  tradingLogin: string | number;
  volume: number;
  comment: string;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  protectionDraftId?: string;
  queuedAtMs: number;
};

export type TradeHandlerOptions = {
  symbol: string;
  variant?: 'compact' | 'mt5-market';
  comment?: string;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  protectionDraftId?: string;
  pointSize?: number;
  lotSize: number;
  latestBid: number;
  latestAsk: number;
  quoteActionAllowed: boolean;
  quoteActionQuote?: ExecutableQuoteInput;
  onTradeResult?: (feedback: TradeFeedback) => void;
  onTradeQueueEvent?: (event: ChartTradeQueueEvent) => void;
};

export function useTradeHandler({
  symbol,
  variant = 'compact',
  comment,
  stopLossPrice,
  takeProfitPrice,
  protectionDraftId,
  pointSize = 0.00001,
  lotSize,
  latestBid,
  latestAsk,
  quoteActionAllowed,
  quoteActionQuote,
  onTradeResult,
  onTradeQueueEvent,
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
  const onTradeQueueEventRef = React.useRef(onTradeQueueEvent);
  onTradeQueueEventRef.current = onTradeQueueEvent;
  const quoteActionQuoteRef = React.useRef<ExecutableQuoteInput | undefined>(quoteActionQuote);
  quoteActionQuoteRef.current = quoteActionQuote;
  const isCurrentChartSymbol =
    normalizeSymbol(currentChartSymbol) === normalizeSymbol(symbol);
  const emitTradeQueueEvent = React.useCallback((
    queuedTrade: QueuedChartTrade,
    status: ChartTradeQueueEvent['status'],
    feedback?: TradeFeedback,
  ) => {
    onTradeQueueEventRef.current?.({
      queueId: queuedTrade.id,
      status,
      side: queuedTrade.side,
      symbol: queuedTrade.symbol,
      volume: queuedTrade.volume,
      ...(feedback ? { feedback } : {}),
    });
  }, []);
  const reportQueuedTradeResult = (
    queuedTrade: QueuedChartTrade,
    status: Extract<ChartTradeQueueEvent['status'], 'confirmed' | 'failed' | 'unconfirmed'>,
    feedback: TradeFeedback,
  ) => {
    if (onTradeQueueEventRef.current) {
      emitTradeQueueEvent(queuedTrade, status, feedback);
      return;
    }
    // Backward-compatible fallback for any chart button host that has not yet
    // mounted the independent MT5-style receipt stack.
    onTradeResult?.(feedback);
  };
  const clearQueuedTrades = React.useCallback((
    receiptStatus?: Extract<ChartTradeQueueEvent['status'], 'failed' | 'cancelled'>,
  ) => {
    const queuedTrades = tradeQueueRef.current;
    tradeQueueRef.current = [];
    queuedTrades.forEach((queuedTrade) => {
      if (queuedTrade.protectionDraftId) {
        releaseChartProtectionDraftSubmission(queuedTrade.protectionDraftId);
      }
      if (receiptStatus) {
        emitTradeQueueEvent(queuedTrade, receiptStatus);
      }
    });
  }, [emitTradeQueueEvent]);

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
    clearQueuedTrades('cancelled');
    if (tradeQueueDrainTimerRef.current) {
      clearTimeout(tradeQueueDrainTimerRef.current);
      tradeQueueDrainTimerRef.current = null;
    }
  }, [clearQueuedTrades]);

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
    clearQueuedTrades('cancelled');
    if (tradeQueueDrainTimerRef.current) {
      clearTimeout(tradeQueueDrainTimerRef.current);
      tradeQueueDrainTimerRef.current = null;
    }
  }, [clearQueuedTrades, symbol]);

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

  function processNextQueuedTrade(options?: { skipQuoteRecheck?: boolean }) {
    if (tradeTapLockRef.current || tradeQueueRef.current.length === 0) {
      return;
    }

    // Same-turn enqueue already validated the quote; recheck only for drains
    // that waited behind an in-flight order.
    if (!options?.skipQuoteRecheck) {
      const currentQuoteAvailability = resolveSessionQuoteActionAvailability(quoteActionQuoteRef.current);
      if (!currentQuoteAvailability.allowed) {
        recordBlockedPriceAction('chart_queued_trade', currentQuoteAvailability);
        clearQueuedTrades('failed');
        onTradeResult?.({
          visible: true,
          type: 'error',
          title: 'Market Data Unavailable',
          message: quoteActionBlockMessage(currentQuoteAvailability),
        });
        return;
      }
    }

    const queuedTrade = tradeQueueRef.current.shift();
    if (!queuedTrade) {
      return;
    }
    if (
      (queuedTrade.stopLossPrice !== undefined || queuedTrade.takeProfitPrice !== undefined) &&
      isNewMarketOrderProtectionBackendLocked()
    ) {
      if (queuedTrade.protectionDraftId) {
        releaseChartProtectionDraftSubmission(queuedTrade.protectionDraftId);
      }
      reportQueuedTradeResult(queuedTrade, 'failed', {
        visible: true,
        type: 'error',
        title: SLTP_COMING_SOON_TITLE,
        message: getActiveSltpUnavailableMessage(),
        side: queuedTrade.side,
      });
      scheduleProcessNextQueuedTrade();
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
    // Visual busy state after placeOrder starts — keep the POST on the critical path.
    const payload = buildChartMarketOrderPayload({
      accountLogin: queuedTrade.tradingLogin,
      symbol: queuedTrade.symbol,
      side: action.side,
      volume: queuedTrade.volume,
      comment: queuedTrade.comment,
      stopLossPrice: queuedTrade.stopLossPrice,
      takeProfitPrice: queuedTrade.takeProfitPrice,
    });
    const requestStartedAtMs = getApiLatencyNow();
    const queueWaitMs = Math.max(0, Math.round(requestStartedAtMs - queuedTrade.queuedAtMs));

    markActiveTradeSide(action.side);

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

    if (queuedTrade.protectionDraftId) {
      publishChartProtectionDraftSubmission(queuedTrade.protectionDraftId);
    }
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
        const responseStatus = String(data?.status ?? '').trim().toLowerCase();
        if (['rejected', 'failed', 'error'].includes(responseStatus)) {
          const feedback = classifyTradingError(
            {
              status: 400,
              data: {
                message: data?.comment || `Server returned status: ${data?.status}`,
              },
            },
            { action: 'place-order' },
          );
          const rejectedFeedback: TradeFeedback = {
            visible: true,
            type: 'error',
            title: feedback.title,
            message: feedback.message,
            side: action.side,
          };
          reportQueuedTradeResult(queuedTrade, 'failed', rejectedFeedback);
          if (queuedTrade.protectionDraftId) {
            releaseChartProtectionDraftSubmission(queuedTrade.protectionDraftId);
          }
          releaseTradeTapLock();
          scheduleProcessNextQueuedTrade();
          return;
        }
        const executionEvidence = resolveBrokerExecutionEvidence(data);
        const executionFeedback: TradeFeedback = executionEvidence.confirmed
          ? {
            visible: true,
            type: 'success',
            executionConfirmed: true,
            title: 'Order Executed',
            side: action.side,
            symbol: queuedTrade.symbol,
            ticket: String(executionEvidence.ticket),
            price: executionEvidence.executionPrice,
            volume: queuedTrade.volume,
            executedAt: new Date().toLocaleTimeString(),
            ...(queuedTrade.protectionDraftId
              ? { protectionDraftId: queuedTrade.protectionDraftId }
              : {}),
          }
          : {
            visible: true,
            type: 'success',
            executionConfirmed: false,
            title: 'Order Submitted — Confirmation Pending',
            message: 'The broker accepted the request but did not return both a ticket and execution price. Verify it in Positions or Orders before acting on it.',
            side: action.side,
            symbol: queuedTrade.symbol,
            ...(executionEvidence.ticket !== undefined
              ? { ticket: String(executionEvidence.ticket) }
              : {}),
            ...(executionEvidence.executionPrice !== undefined
              ? { price: executionEvidence.executionPrice }
              : {}),
            volume: queuedTrade.volume,
            ...(queuedTrade.protectionDraftId
              ? { protectionDraftId: queuedTrade.protectionDraftId }
              : {}),
          };
        reportQueuedTradeResult(
          queuedTrade,
          executionEvidence.confirmed ? 'confirmed' : 'unconfirmed',
          executionFeedback,
        );
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
        const rejectedFeedback: TradeFeedback = {
          visible: true,
          type: 'error',
          title: feedback.title,
          message: feedback.message,
          side: action.side,
        };
        reportQueuedTradeResult(queuedTrade, 'failed', rejectedFeedback);
        if (queuedTrade.protectionDraftId) {
          releaseChartProtectionDraftSubmission(queuedTrade.protectionDraftId);
        }
        releaseTradeTapLock();
        if (feedback.kind === 'session-expired' || feedback.kind === 'rate-limit' || feedback.kind === 'backend-unavailable') {
          clearQueuedTrades('failed');
          return;
        }
        scheduleProcessNextQueuedTrade();
      },
    });
  }

  const executeTrade = (side: TradeSide) => {
    const action = getChartTradeAction(side);
    const stateChartSymbol = useUserPreferences.getState().chartSymbol;
    // Normalize once — hot path used to normalize both sides twice.
    if (normalizeSymbol(stateChartSymbol) !== normalizeSymbol(symbol)) {
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

    // ── One-click OFF: open New Order as a sidebar-class retained handoff ──
    // Shell first (UI thread), then lock + route — no heavy validation.
    // The SL/TP trade sheet (mt5-market variant) IS the explicit order form:
    // its Buy/Sell always place the market order directly, exactly like MT5's
    // New Order screen, regardless of the one-click preference.
    if (!oneClickAccepted && variant !== 'mt5-market') {
      if (tradeTapLockRef.current) {
        logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
          side,
          buttonPressed: action.buttonPressed,
          symbol,
          displayedLabel: action.displayLabel,
          sidePassedToHandler: action.side,
          ignored: true,
          lockSide: getChartTradeButtonSharedLockSide(),
          reason: 'tap-lock',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (!acquireChartTradeButtonSharedLock(action.side)) {
        logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
          side,
          buttonPressed: action.buttonPressed,
          symbol,
          displayedLabel: action.displayLabel,
          sidePassedToHandler: action.side,
          ignored: true,
          lockSide: getChartTradeButtonSharedLockSide(),
          reason: 'shared-tap-lock',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Paint retained New Order shell in this touch turn before any setState.
      const launchRevision = showOrderTicketLaunch(symbol, 'chart');

      tradeTapLockRef.current = true;
      tradeTapLockSideRef.current = action.side;

      const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
      const normalizedStopLossPrice = Number(stopLossPrice);
      const normalizedTakeProfitPrice = Number(takeProfitPrice);
      const hasStopLossPrice = Number.isFinite(normalizedStopLossPrice) && normalizedStopLossPrice > 0;
      const hasTakeProfitPrice = Number.isFinite(normalizedTakeProfitPrice) && normalizedTakeProfitPrice > 0;

      // Busy chrome after shell is visible so it does not compete with first paint.
      markActiveTradeSide(action.side);

      logChartTradeDiagnostic('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        displayedLabel: action.displayLabel,
        sidePassedToHandler: action.side,
        timestamp: new Date().toISOString(),
      });

      const releaseOpenPathLock = () => {
        releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      };

      // Real ticket mounts after one paint frame (see scheduler).
      scheduleOrderTicketLaunchNavigation(
        launchRevision,
        () => {
          try {
            router.push({
              pathname: '/trade/order-ticket',
              params: {
                symbol,
                origin: 'chart',
                side: action.side,
                ...(hasStopLossPrice ? { sl: String(normalizedStopLossPrice) } : {}),
                ...(hasTakeProfitPrice ? { tp: String(normalizedTakeProfitPrice) } : {}),
                ...(protectionDraftId ? { protectionDraftId } : {}),
                ...(trimmedComment ? { comment: trimmedComment } : {}),
              },
            });
          } catch (navErr: any) {
            hideOrderTicketLaunch(launchRevision);
            warnChartTradeDiagnostic('[Trade] navigation failed', navErr);
            onTradeResult?.({
              visible: true, type: 'error',
              title: 'Navigation Error',
              message: navErr?.message || 'Could not open the order ticket screen.',
              side: action.side,
            });
          } finally {
            releaseOpenPathLock();
          }
        },
        () => {
          hideOrderTicketLaunch(launchRevision);
          releaseOpenPathLock();
        },
      );
      return;
    }

    // ── One-click ON: place market order (validation required) ───────────
    // Re-resolve at the actual tap time. A render-time allowed flag can outlive
    // the final websocket tick and must not authorize an order after it turns
    // stale.
    const currentQuoteAvailability = resolveSessionQuoteActionAvailability(
      quoteActionQuoteRef.current,
      Date.now(),
    );
    if (!currentQuoteAvailability.allowed) {
      recordBlockedPriceAction('chart_quick_trade', currentQuoteAvailability);
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'Market Data Unavailable',
        message: quoteActionBlockMessage(currentQuoteAvailability),
        side: action.side,
      });
      return;
    }

    const volume = Number(lotSize);
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    const normalizedStopLossPrice = Number(stopLossPrice);
    const normalizedTakeProfitPrice = Number(takeProfitPrice);
    const hasStopLossPrice = Number.isFinite(normalizedStopLossPrice) && normalizedStopLossPrice > 0;
    const hasTakeProfitPrice = Number.isFinite(normalizedTakeProfitPrice) && normalizedTakeProfitPrice > 0;
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
      return;
    }

    if (!tradingLogin) {
      onTradeResult?.({
        visible: true, type: 'error',
        title: 'No Trading Account',
        message: 'No active trading account is selected. Open the account menu and choose one, then try again.',
        side: action.side,
      });
      return;
    }

    if (!Number.isFinite(volume) || volume <= 0) {
      onTradeResult?.({
        visible: true, type: 'error',
        title: 'Invalid Lot Size',
        message: `Volume must be greater than 0. Current: ${lotSize}`,
        side: action.side,
      });
      return;
    }

    if (
      (hasStopLossPrice || hasTakeProfitPrice) &&
      isNewMarketOrderProtectionBackendLocked()
    ) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: SLTP_COMING_SOON_TITLE,
        message: getActiveSltpUnavailableMessage(),
        side: action.side,
      });
      return;
    }

    // Skip SL/TP math when neither protection is set (common one-click path).
    if (hasStopLossPrice || hasTakeProfitPrice) {
      const protectionValidation = validateChartTradeProtectionLevels({
        side: action.side,
        entryPrice: action.side === 'buy' ? latestAsk : latestBid,
        slEnabled: hasStopLossPrice,
        slPrice: hasStopLossPrice ? normalizedStopLossPrice : 0,
        tpEnabled: hasTakeProfitPrice,
        tpPrice: hasTakeProfitPrice ? normalizedTakeProfitPrice : 0,
        pointSize,
      });

      if (!protectionValidation.valid) {
        onTradeResult?.({
          visible: true,
          type: 'error',
          title: 'Invalid SL/TP',
          message: protectionValidation.message,
          side: action.side,
        });
        return;
      }
    }

    logChartTradeDiagnostic('[Trade] one-click path, login=', tradingLogin);
    const queuedTrade: QueuedChartTrade = {
      id: nextChartTradeQueueId,
      side: action.side,
      symbol,
      tradingLogin,
      volume,
      comment: trimmedComment,
      ...(hasStopLossPrice ? { stopLossPrice: normalizedStopLossPrice } : {}),
      ...(hasTakeProfitPrice ? { takeProfitPrice: normalizedTakeProfitPrice } : {}),
      ...(protectionDraftId ? { protectionDraftId } : {}),
      queuedAtMs: getApiLatencyNow(),
    };
    if (
      queuedTrade.protectionDraftId &&
      !tryBeginChartProtectionDraftSubmission(queuedTrade.protectionDraftId)
    ) {
      onTradeResult?.({
        visible: true,
        type: 'error',
        title: 'Order Already Submitted',
        message: 'Wait for this protected Market Execution order to reconcile before submitting it again.',
        side: action.side,
      });
      return;
    }
    nextChartTradeQueueId += 1;
    tradeQueueRef.current.push(queuedTrade);
    emitTradeQueueEvent(queuedTrade, 'pending');
    logChartTradeDiagnostic('[TRADE-QUEUE-ENQUEUE]', {
      queueId: queuedTrade.id,
      side: action.side,
      symbol,
      volume,
      queueLength: tradeQueueRef.current.length,
      activeInFlight: tradeTapLockRef.current,
      sharedLockSide: getChartTradeButtonSharedLockSide(),
      timestamp: new Date().toISOString(),
    });
    // Same-turn drain: skip a second quote integrity pass.
    processNextQueuedTrade({ skipQuoteRecheck: true });
  };

  const handleTrade = (side: TradeSide) =>
    runCriticalTradeAction(`chart.${variant}.trade.${side}`, () => executeTrade(side));

  const isChartTradeActionBusy = (side: TradeSide) => activeSide === side && tradeTapLockRef.current;
  const chartTradeActionDisabled = resolveChartTradeActionDisabled({
    isCurrentChartSymbol,
    oneClickAccepted,
    quoteActionAllowed,
  });
  // This side-specific signal is reserved for in-flight feedback. Quote
  // readiness disables and dims both controls through chartTradeActionDisabled.
  const isChartTradeActionVisuallyLocked = (side: TradeSide) => isChartTradeActionBusy(side);

  return {
    handleTrade,
    isChartTradeActionBusy,
    isChartTradeActionVisuallyLocked,
    chartTradeActionDisabled,
    isCurrentChartSymbol,
  };
}

export type { TradeFeedback };
