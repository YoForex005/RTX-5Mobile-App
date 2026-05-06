/**
 * Trade handling for ChartTradeButtons — owns the trade-tap lock, the
 * "active side" visual lock, and the actual placeOrder mutation flow.
 */
import React from 'react';
import { router } from 'expo-router';
import { classifyTradingError } from '../../../../api/tradingErrors';
import { usePlaceOrderMutation } from '../../../../query/orders';
import { resolveTradingLogin } from '../../../../state/tradingLogin';
import { useUserPreferences } from '../../../../state/userPreferences';
import type { TradeSide } from '../../../../domain/tradeSide';
import { buildChartMarketOrderPayload, getChartTradeAction } from '../../chartTradeActions';
import {
  CHART_TRADE_TAP_RELEASE_DELAY_MS,
  acquireChartTradeButtonSharedLock,
  getChartTradeButtonSharedLockSide,
  releaseChartTradeButtonSharedLock,
} from './sharedLock';

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
  const { mutate: placeOrder, isPending } = usePlaceOrderMutation();
  const [activeSide, setActiveSide] = React.useState<TradeSide | null>(null);
  const activeSideResetTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tradeTapLockRef = React.useRef(false);
  const tradeTapLockSideRef = React.useRef<TradeSide | null>(null);
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

  const handleTrade = (side: TradeSide) => {
    const action = getChartTradeAction(side);
    const stateChartSymbol = useUserPreferences.getState().chartSymbol;
    if (stateChartSymbol !== symbol) {
      console.log('[TRADE-BUTTON-PRESS]', {
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
    if (tradeTapLockRef.current || sharedLockSide !== null || isPending) {
      console.log('[TRADE-BUTTON-PRESS]', {
        side,
        buttonPressed: action.buttonPressed,
        symbol,
        displayedLabel: variant === 'mt5-market' ? action.marketLabel : action.displayLabel,
        sidePassedToHandler: action.side,
        ignored: true,
        lockSide: sharedLockSide,
        reason: tradeTapLockRef.current ? 'tap-lock' : sharedLockSide !== null ? 'shared-tap-lock' : 'mutation-pending',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (!acquireChartTradeButtonSharedLock(action.side)) {
      console.log('[TRADE-BUTTON-PRESS]', {
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
    tradeTapLockRef.current = true;
    tradeTapLockSideRef.current = action.side;
    const releaseTradeTapLock = (delayMs = 0) => {
      const lockedSide = tradeTapLockSideRef.current;
      tradeTapLockRef.current = false;
      tradeTapLockSideRef.current = null;
      if (lockedSide) {
        releaseChartTradeButtonSharedLock(lockedSide, delayMs);
        clearActiveTradeSide(lockedSide, delayMs);
      }
    };
    markActiveTradeSide(action.side);
    const volume = Number(lotSize);
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    const authState = useUserPreferences.getState();
    const authToken = authState.accountDetails?.credentials?.accessToken;
    const tradingLogin = resolveTradingLogin();

    console.log('[TRADE-BUTTON-PRESS]', {
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
      console.log('[Trade] one-click path, login=', tradingLogin);
      const payload = buildChartMarketOrderPayload({
        accountLogin: tradingLogin,
        symbol,
        side: action.side,
        volume,
        comment: trimmedComment,
      });
      console.log('[TRADE-PAYLOAD]', {
        symbol: payload.symbol,
        side: payload.side,
        action: payload.side,
        orderType: action.orderType,
        command: payload.side,
        tradeType: action.orderType,
        volume,
        priceSource: action.priceSource,
        rawPayload: payload,
      });

      placeOrder(payload, {
        onSuccess: (data: any) => {
          console.log('[TRADE-RESPONSE]', {
            requestSide: action.side,
            result: data?.status ?? 'success',
            backendSide: data?.side ?? null,
            rawResponse: data,
          });
          const ticket = data?.position_ticket || data?.order_ticket || data?.ticket || 'Confirmed';
          const execPrice = action.side === 'buy' ? latestAsk : latestBid;
          onTradeResult?.({
            visible: true, type: 'success',
            side: action.side, symbol,
            ticket: String(ticket),
            price: execPrice, volume,
            executedAt: new Date().toLocaleTimeString(),
          });
          releaseTradeTapLock();
        },
        onError: (err: any) => {
          const feedback = classifyTradingError(err, { action: 'place-order' });
          console.warn('[TRADE-RESPONSE]', {
            requestSide: action.side,
            result: 'error',
            backendSide: err?.response?.data?.side ?? err?.data?.side ?? null,
            rawResponse: err?.response?.data ?? err?.data ?? err,
          });
          console.warn('[Trade] error', feedback.kind, feedback.title, '|', feedback.detail ?? feedback.message);
          onTradeResult?.({
            visible: true, type: 'error',
            title: feedback.title,
            message: feedback.message,
            side: action.side,
          });
          releaseTradeTapLock();
        },
      });
    } else {
      console.log('[Trade] navigate path → /trade/order-ticket');
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
        console.warn('[Trade] navigation failed', navErr);
        onTradeResult?.({
          visible: true, type: 'error',
          title: 'Navigation Error',
          message: navErr?.message || 'Could not open the order ticket screen.',
          side: action.side,
        });
        releaseTradeTapLock(CHART_TRADE_TAP_RELEASE_DELAY_MS);
      }
    }
  };

  const isChartTradeActionBusy = (side: TradeSide) => activeSide === side && isPending;
  const isChartTradeActionVisuallyLocked = (side: TradeSide) =>
    !isCurrentChartSymbol || activeSide === side;
  const chartTradeActionDisabled = isPending || !isCurrentChartSymbol;

  return {
    handleTrade,
    isChartTradeActionBusy,
    isChartTradeActionVisuallyLocked,
    chartTradeActionDisabled,
    isCurrentChartSymbol,
    isPending,
  };
}

export type { TradeFeedback };
