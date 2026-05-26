/**
 * Place a pending order on the trading server.
 *
 * POST /api/v2/orders/pending
 */
import { apiClient, decodeBrokerIdFromToken } from '../apiClient';
import { assertTradeSide } from '../../domain/tradeSide';
import { createTradingApiError } from '../tradingErrors';
import { useUserPreferences } from '../../state/userPreferences';
import { getApiLatencyNow, recordApiLatency } from '../../utils/apiLatency';
import { resolveBrokerSymbol, resolveBrokerSymbolFromCache } from './symbolResolver';
import { buildMarketOrderSymbolCandidates, getAcceptedSymbolCacheKey } from './placeMarketOrderCandidates';
import {
  PendingOrderPayloadError,
  buildPendingOrderRequestBody,
} from './pendingOrderPayload';
import type { PlacePendingOrderPayload, PlacePendingOrderResponse } from './types';

const acceptedPendingOrderSymbolCache = new Map<string, string>();
const ORDER_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';

const logOrderDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (ORDER_DIAGNOSTICS_ENABLED) {
    console.log(...args);
  }
};

export const placePendingOrder = async (
  payload: PlacePendingOrderPayload,
): Promise<PlacePendingOrderResponse> => {
  const requestedSide = assertTradeSide(payload.side);
  let orderBody: Record<string, unknown>;
  try {
    orderBody = buildPendingOrderRequestBody(payload);
  } catch (error) {
    if (error instanceof PendingOrderPayloadError) {
      throw createTradingApiError(400, { message: error.message });
    }
    throw error;
  }

  const callerSymbol = String(orderBody.symbol ?? '').trim();
  const state = useUserPreferences.getState();
  const currentToken = state.accountDetails?.credentials?.accessToken;
  const jwtBrokerId = decodeBrokerIdFromToken(currentToken);

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
    const body = { ...orderBody, symbol: symbolToSend };
    logOrderDiagnostic('[RTX5 Pending Order] POST /orders/pending body:', JSON.stringify(body));
    const startedAtMs = getApiLatencyNow();
    let response: Response | null = null;

    try {
      response = await apiClient('/orders/pending', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const raw = await response.json().catch(() => ({}));
      const inner = unwrap(raw);
      const bodyStatus = typeof inner?.status === 'string' ? inner.status.toLowerCase() : '';
      const graceful = response.ok && ['rejected', 'failed', 'error'].includes(bodyStatus);
      const ok = response.ok && !graceful;
      recordApiLatency({
        label: `trade.placePendingOrder.${requestedSide}`,
        method: 'POST',
        endpoint: '/orders/pending',
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
        label: `trade.placePendingOrder.${requestedSide}`,
        method: 'POST',
        endpoint: '/orders/pending',
        source: 'trade',
        status: response?.status ?? null,
        ok: false,
        durationMs: getApiLatencyNow() - startedAtMs,
        error,
      });
      throw error;
    }
  };

  const isSymbolMiss = (attempt: Attempt): boolean => {
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
      msg.includes('instrument not found') ||
      msg.includes('not available')
    );
  };

  const brokerCacheKey = getAcceptedSymbolCacheKey(jwtBrokerId || state.brokerId, callerSymbol);
  const candidates = buildMarketOrderSymbolCandidates({
    callerSymbol,
    acceptedSymbol: acceptedPendingOrderSymbolCache.get(brokerCacheKey) ?? null,
    cachedCatalogSymbol: resolveBrokerSymbolFromCache(callerSymbol),
  });

  let accepted: Attempt | null = null;
  let lastBad: Attempt | null = null;

  for (const candidate of candidates) {
    const attempt = await sendOrder(candidate);
    if (attempt.ok) {
      accepted = attempt;
      break;
    }
    lastBad = attempt;
    if (!isSymbolMiss(attempt)) break;
  }

  if (!accepted && lastBad && isSymbolMiss(lastBad)) {
    const catalogSymbol = await resolveBrokerSymbol(callerSymbol);
    if (catalogSymbol && !candidates.includes(catalogSymbol)) {
      const attempt = await sendOrder(catalogSymbol);
      if (attempt.ok) {
        accepted = attempt;
      } else {
        lastBad = attempt;
      }
    }
  }

  if (!accepted) {
    const status = lastBad?.status ?? 400;
    const body = lastBad?.graceful
      ? {
        message: unwrap(lastBad.body)?.comment
          || unwrap(lastBad.body)?.message
          || 'Pending order rejected by the trading server.',
      }
      : (lastBad?.body ?? { message: 'Pending order rejected before a valid symbol candidate was available.' });
    const headers: Record<string, string> = {};
    if (status === 429 && lastBad?.response) {
      headers['retry-after'] = lastBad.response.headers.get('retry-after') || '';
    }
    throw createTradingApiError(lastBad?.graceful ? 400 : status, body, headers);
  }

  acceptedPendingOrderSymbolCache.set(brokerCacheKey, accepted.symbol);
  const finalData = unwrap(accepted.body);
  if (finalData && typeof finalData === 'object' && finalData.price_open == null && finalData.price != null) {
    finalData.price_open = finalData.price;
  }
  return finalData;
};
