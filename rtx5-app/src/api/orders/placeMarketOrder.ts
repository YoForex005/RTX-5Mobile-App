/**
 * Place a market order on the trading server.
 *
 * POST /api/v2/orders
 *
 * Rate limited by the active broker gateway.
 * Uses a DB transaction for atomicity. Rejected if market data returns
 * zero or negative prices. SL/TP values are validated server-side.
 */
import { apiClient } from '../apiClient';
import { StaleBrokerSessionError } from '../brokerApi';
import { assertTradeSide } from '../../domain/tradeSide';
import { createTradingApiError } from '../tradingErrors';
import {
  recordMarketOrderJournalFailure,
  recordMarketOrderJournalRequest,
  recordMarketOrderJournalSuccess,
} from '../../state/terminalJournalState';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
} from '../../state/activeBrokerSession';
import { getApiLatencyNow, recordApiLatency } from '../../utils/apiLatency';
import { resolveBrokerSymbol, resolveBrokerSymbolFromCache } from './symbolResolver';
import { buildMarketOrderSymbolCandidates, getAcceptedSymbolCacheKey } from './placeMarketOrderCandidates';
import type { PlaceOrderPayload, PlaceOrderResponse } from './types';
import { redactDiagnosticValue } from '../../utils/securityRedaction';

const acceptedOrderSymbolCache = new Map<string, string>();
const ORDER_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';

const logOrderDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (ORDER_DIAGNOSTICS_ENABLED) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const warnOrderDiagnostic = (...args: Parameters<typeof console.warn>) => {
  if (ORDER_DIAGNOSTICS_ENABLED) {
    console.warn(...args.map(redactDiagnosticValue));
  }
};

export const placeMarketOrder = async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
  const sessionCapture = captureActiveBrokerSession();
  if (!sessionCapture) throw new StaleBrokerSessionError();
  const sessionIdentity = getActiveBrokerSessionIdentity(sessionCapture.session);
  const cacheNamespace = sessionCapture.session.cacheNamespace;
  const assertOrderSessionCurrent = () => {
    if (!isActiveBrokerSessionCurrent(sessionIdentity)) {
      throw new StaleBrokerSessionError();
    }
  };

  // The gateway's canonical market-order field is `account_login`. Keep the
  // caller-facing value flexible for persisted sessions, but put an integer on
  // the wire and never send both account aliases.
  const { account_login, ...rest } = payload;
  const loginInt =
    typeof account_login === 'string' ? Number(account_login.trim()) : account_login;
  if (!Number.isSafeInteger(loginInt) || loginInt <= 0) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: 'A valid trading account login is required to place an order.',
    });
  }
  if (String(loginInt) !== sessionCapture.session.accountLogin) {
    throw createTradingApiError(403, {
      error: 'BROKER_REQUIRED',
      message: 'Order account does not match the active broker session.',
    });
  }

  // Symbol routing must stay out of the tap-to-POST critical path. The first
  // attempt uses already-known local data. A network /instruments lookup is
  // only performed after the server reports a market-data/symbol miss.
  const callerSymbol = (payload.symbol ?? '').trim();

  // Remove broker_id from the body. The server resolves broker context from
  // the JWT claim; apiClient owns token refresh and broker-context recovery.
  const { broker_id: _ignored, ...restWithoutBroker } = rest;

  const requestedSide = assertTradeSide(restWithoutBroker.side);
  const orderBody: Record<string, unknown> = {
    account_login: loginInt,
    symbol: callerSymbol,
    side: requestedSide,
    volume: restWithoutBroker.volume,
    type: 'market',
  };

  // Optional order fields are omitted when disabled. Sending zero can make
  // some bridges validate against a real zero price and reject the trade.
  if (typeof restWithoutBroker.price_sl === 'number' && restWithoutBroker.price_sl > 0) {
    orderBody.price_sl = restWithoutBroker.price_sl;
  }
  if (typeof restWithoutBroker.price_tp === 'number' && restWithoutBroker.price_tp > 0) {
    orderBody.price_tp = restWithoutBroker.price_tp;
  }
  if (typeof restWithoutBroker.comment === 'string' && restWithoutBroker.comment.length > 0) {
    orderBody.comment = restWithoutBroker.comment;
  }
  if (typeof restWithoutBroker.trailing_stop === 'number' && restWithoutBroker.trailing_stop > 0) {
    orderBody.trailing_stop = restWithoutBroker.trailing_stop;
  }
  if (typeof restWithoutBroker.trailing_step === 'number' && restWithoutBroker.trailing_step > 0) {
    orderBody.trailing_step = restWithoutBroker.trailing_step;
  }
  // `magic` is intentionally never copied. The trader gateway strictly
  // rejects that manager/EA-only field as unknown input.

  logOrderDiagnostic('[RTX5 Order] active broker session:', sessionCapture.session.brokerId);
  logOrderDiagnostic('[TRADE-PAYLOAD]', {
    symbol: callerSymbol,
    side: requestedSide,
    action: requestedSide,
    orderType: 'market',
    command: requestedSide,
    tradeType: 'market',
    volume: restWithoutBroker.volume,
    priceSource: requestedSide === 'buy' ? 'ask' : 'bid',
    rawPayload: orderBody,
  });
  const journalPayload = {
    account_login: loginInt,
    symbol: callerSymbol,
    side: requestedSide,
    volume: restWithoutBroker.volume,
    price_sl: restWithoutBroker.price_sl,
    price_tp: restWithoutBroker.price_tp,
  };
  recordMarketOrderJournalRequest(journalPayload);

  type Attempt = {
    symbol: string;
    status: number;
    body: any;
    response: Response;
    ok: boolean;
    graceful: boolean;
  };

  const unwrap = (json: any): any => {
    if (!json || typeof json !== 'object') return json;
    if (json.data && !Array.isArray(json.data)) return json.data;
    if (json.result && !Array.isArray(json.result)) return json.result;
    if (Array.isArray(json) && json.length > 0) return json[0];
    if (Array.isArray(json.data) && json.data.length > 0) return json.data[0];
    return json;
  };

  const sendOrder = async (symbolToSend: string): Promise<Attempt> => {
    assertOrderSessionCurrent();
    const body = { ...orderBody, symbol: symbolToSend };
    logOrderDiagnostic('[RTX5 Order] POST /orders body:', JSON.stringify(body));
    const startedAtMs = getApiLatencyNow();
    let response: Response | null = null;

    try {
      response = await apiClient('/orders', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const raw = await response.json().catch(() => ({}));
      assertOrderSessionCurrent();
      const inner = unwrap(raw);
      const bodyStatus = typeof inner?.status === 'string' ? inner.status.toLowerCase() : '';
      const graceful = response.ok && ['rejected', 'failed', 'error'].includes(bodyStatus);
      const ok = response.ok && !graceful;
      recordApiLatency({
        label: `trade.placeMarketOrder.${requestedSide}`,
        method: 'POST',
        endpoint: '/orders',
        source: 'trade',
        status: response.status,
        ok,
        durationMs: getApiLatencyNow() - startedAtMs,
      });
      return {
        symbol: symbolToSend,
        status: response.status,
        body: raw,
        response,
        ok,
        graceful,
      };
    } catch (error) {
      recordApiLatency({
        label: `trade.placeMarketOrder.${requestedSide}`,
        method: 'POST',
        endpoint: '/orders',
        source: 'trade',
        status: response?.status ?? null,
        ok: false,
        durationMs: getApiLatencyNow() - startedAtMs,
        error,
      });
      recordMarketOrderJournalFailure(journalPayload, error);
      throw error;
    }
  };

  const isMarketDataMiss = (attempt: Attempt): boolean => {
    const isHttpError = attempt.status === 400 || attempt.status === 404;
    if (!isHttpError && !attempt.graceful) return false;
    const inner = unwrap(attempt.body);
    const msg = String(
      inner?.message ?? inner?.comment ?? inner?.error ?? attempt.body?.message ?? '',
    ).toLowerCase();
    return (
      msg.includes('market data') ||
      msg.includes('no quote') ||
      msg.includes('symbol not found') ||
      msg.includes('unknown symbol') ||
      msg.includes('not available') ||
      msg.includes('zero or negative market price') ||
      msg.includes('zero market price')
    );
  };

  const brokerCacheKey = getAcceptedSymbolCacheKey(cacheNamespace, callerSymbol);
  const candidates = buildMarketOrderSymbolCandidates({
    callerSymbol,
    acceptedSymbol: acceptedOrderSymbolCache.get(brokerCacheKey) ?? null,
    cachedCatalogSymbol: resolveBrokerSymbolFromCache(callerSymbol, cacheNamespace),
  });

  let accepted: Attempt | null = null;
  let lastBad: Attempt | null = null;

  for (const candidate of candidates) {
    const attempt = await sendOrder(candidate);
    if (attempt.ok) {
      accepted = attempt;
      if (candidate !== callerSymbol) {
        logOrderDiagnostic('[RTX5 Order] symbol accepted after fallback:', candidate);
      }
      break;
    }

    logOrderDiagnostic(
      '[RTX5 Order] attempt failed',
      JSON.stringify({
        symbol: candidate,
        status: attempt.status,
        graceful: attempt.graceful,
        body: attempt.body,
      }),
    );
    lastBad = attempt;

    // Auth, ownership, rate-limit, and SL/TP errors are real failures; retrying
    // another symbol would only hide the actual rejection reason.
    if (!isMarketDataMiss(attempt)) break;
  }

  if (!accepted && lastBad && isMarketDataMiss(lastBad)) {
    const catalogSymbol = await resolveBrokerSymbol(callerSymbol, cacheNamespace);
    assertOrderSessionCurrent();
    if (catalogSymbol && !candidates.includes(catalogSymbol)) {
      const attempt = await sendOrder(catalogSymbol);
      if (attempt.ok) {
        accepted = attempt;
        logOrderDiagnostic('[RTX5 Order] symbol accepted after /instruments fallback:', catalogSymbol);
      } else {
        logOrderDiagnostic(
          '[RTX5 Order] /instruments fallback failed',
          JSON.stringify({
            symbol: catalogSymbol,
            status: attempt.status,
            graceful: attempt.graceful,
            body: attempt.body,
          }),
        );
        lastBad = attempt;
      }
    }
  }

  if (!accepted) {
    const status = lastBad?.status ?? 400;
    const rejectedBody = lastBad ? unwrap(lastBad.body) : null;
    const body = lastBad?.graceful
      ? {
        ...(typeof rejectedBody?.error === 'string' ? { error: rejectedBody.error } : {}),
        message: rejectedBody?.comment
          || rejectedBody?.message
          || 'Order rejected by the trading server.',
      }
      : (lastBad?.body ?? { message: 'Order rejected before a valid symbol candidate was available.' });
    const headers: Record<string, string> = {};
    if (status === 429 && lastBad?.response) {
      headers['retry-after'] = lastBad.response.headers.get('retry-after') || '';
    }
    const error = createTradingApiError(lastBad?.graceful ? 400 : status, body, headers);
    recordMarketOrderJournalFailure(journalPayload, error);
    throw error;
  }

  assertOrderSessionCurrent();
  acceptedOrderSymbolCache.set(brokerCacheKey, accepted.symbol);
  const finalData = unwrap(accepted.body);

  // The handler's canonical execution response already contains
  // order_ticket, position_ticket, and price. Preserve only safe aliases for
  // older Position-shaped broker deployments: a legacy `ticket` can identify
  // a position, but an order ticket must never be promoted to position ID.
  if (finalData && typeof finalData === 'object') {
    if (finalData.position_ticket == null && finalData.ticket != null) {
      finalData.position_ticket = finalData.ticket;
    }
    if (finalData.price == null && finalData.price_open != null) {
      finalData.price = finalData.price_open;
    }
  }

  logOrderDiagnostic('[TRADE-RESPONSE]', {
    requestSide: requestedSide,
    result: finalData?.status ?? accepted.status,
    backendSide: finalData?.side ?? null,
    rawResponse: finalData,
  });
  if (finalData?.side && finalData.side !== requestedSide) {
    warnOrderDiagnostic('[TRADE-RESPONSE] backend side differs from request', {
      requestSide: requestedSide,
      backendSide: finalData.side,
      symbol: finalData.symbol ?? accepted.symbol ?? callerSymbol,
    });
  }

  recordMarketOrderJournalSuccess(
    { ...journalPayload, symbol: accepted.symbol || callerSymbol },
    finalData,
  );
  return finalData;
};

export function resetAcceptedMarketOrderSymbolCache(): void {
  acceptedOrderSymbolCache.clear();
}
