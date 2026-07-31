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
  captureActiveBrokerSessionOwnerStamp,
  isActiveBrokerSessionOwnerStampCurrent,
} from '../../state/activeBrokerSession';
import { usePositionsState } from '../../state/positionsState';
import { getApiLatencyNow, recordApiLatency } from '../../utils/apiLatency';
import { resolveBrokerSymbol, resolveBrokerSymbolFromCache } from './symbolResolver';
import { buildMarketOrderSymbolCandidates, getAcceptedSymbolCacheKey } from './placeMarketOrderCandidates';
import type { PlaceOrderPayload, PlaceOrderResponse } from './types';
import { redactDiagnosticValue } from '../../utils/securityRedaction';
import { assertActiveMarketProtectionAllowed } from '../sltpCapabilityGuard';
import { createTradeIdempotencyKey } from '../tradeIdempotency';
import { positionsApi } from '../positions';
import { beginProtectedPositionsMutation } from '../../state/positionsMutationBarrier';
import { reconcileMarketOrderPositions } from './marketPositionReconciliation';

const acceptedOrderSymbolCache = new Map<string, string>();
let marketOrderReconciliationGeneration = 0;
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

const toCanonicalDecimalString = (
  value: number | string,
  label: string,
): string => {
  const numeric = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: `${label} must be a positive decimal.`,
    });
  }
  const normalized = numeric.toFixed(8).replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
  if (!normalized || Number(normalized) !== numeric) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: `${label} supports at most 8 fractional digits.`,
    });
  }
  return normalized;
};

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f
      ? 1
      : codePoint <= 0x7ff
        ? 2
        : codePoint <= 0xffff
          ? 3
          : 4;
  }
  return bytes;
};

const normalizeMarketOrderSymbol = (value: unknown): string => {
  const symbol = String(value ?? '').trim().toUpperCase();
  if (!symbol) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: 'Order symbol is required.',
    });
  }
  if (utf8ByteLength(symbol) > 20) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: 'Order symbol must not exceed 20 bytes.',
    });
  }
  return symbol;
};

const createPayloadBoundIdempotencyKeyResolver = (action: string) => {
  const keysBySerializedBody = new Map<string, string>();
  return (serializedBody: string): string => {
    const existing = keysBySerializedBody.get(serializedBody);
    if (existing) return existing;
    const created = createTradeIdempotencyKey(action);
    keysBySerializedBody.set(serializedBody, created);
    return created;
  };
};

export const placeMarketOrder = async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
  const owner = captureActiveBrokerSessionOwnerStamp();
  if (!owner) throw new StaleBrokerSessionError();
  assertActiveMarketProtectionAllowed(payload as unknown as Record<string, unknown>);
  const cacheNamespace = owner.cacheNamespace;
  const assertOrderSessionCurrent = () => {
    if (!isActiveBrokerSessionOwnerStampCurrent(owner)) {
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
  if (String(loginInt) !== owner.accountLogin) {
    throw createTradingApiError(403, {
      error: 'BROKER_REQUIRED',
      message: 'Order account does not match the active broker session.',
    });
  }

  // Symbol routing must stay out of the tap-to-POST critical path. The first
  // attempt uses already-known local data. A network /instruments lookup is
  // only performed after the server reports a market-data/symbol miss.
  const callerSymbol = normalizeMarketOrderSymbol(payload.symbol);

  // Remove broker_id from the body. The server resolves broker context from
  // the JWT claim; apiClient owns token refresh and broker-context recovery.
  const { broker_id: _ignored, ...restWithoutBroker } = rest;

  const requestedSide = assertTradeSide(restWithoutBroker.side);
  const orderBody: Record<string, unknown> = {
    account_login: loginInt,
    symbol: callerSymbol,
    side: requestedSide,
    volume: toCanonicalDecimalString(restWithoutBroker.volume, 'Order volume'),
    type: 'market',
  };

  // Caller-facing legacy names are translated into the gateway's one
  // canonical field family. The API-level capability guard above prevents
  // these fields from reaching transport while the broker runtime is locked.
  for (const family of [
    ['sl', 'price_sl', 'Stop Loss'],
    ['tp', 'price_tp', 'Take Profit'],
  ] as const) {
    const [canonicalKey, legacyKey, label] = family;
    if (hasOwn(restWithoutBroker, canonicalKey) && hasOwn(restWithoutBroker, legacyKey)) {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: `Use only the canonical market ${label} field.`,
      });
    }
    const usesCanonical = hasOwn(restWithoutBroker, canonicalKey);
    const value = usesCanonical
      ? restWithoutBroker[canonicalKey]
      : restWithoutBroker[legacyKey];
    if (value === undefined || value === null) continue;
    // Compatibility-only price_sl/price_tp historically use literal zero as
    // "unset". Canonical sl/tp zero is submitted input and remains invalid.
    if (!usesCanonical && Number(value) === 0) continue;
    orderBody[canonicalKey] = toCanonicalDecimalString(
      value as number | string,
      label,
    );
  }
  if (restWithoutBroker.fill_mode !== undefined) {
    if (
      restWithoutBroker.fill_mode !== 'return' &&
      restWithoutBroker.fill_mode !== 'fok'
    ) {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: 'Order fill mode must be return or fok.',
      });
    }
    orderBody.fill_mode = restWithoutBroker.fill_mode;
  }
  if (typeof restWithoutBroker.comment === 'string' && restWithoutBroker.comment.length > 0) {
    if (utf8ByteLength(restWithoutBroker.comment) > 1024) {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: 'Order comment must not exceed 1024 bytes.',
      });
    }
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

  logOrderDiagnostic('[RTX5 Order] active broker session:', owner.brokerId);
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
  const resolveIdempotencyKey = createPayloadBoundIdempotencyKeyResolver('order');
  let createRequestStarted = false;
  let reconciliationResponse: PlaceOrderResponse | null = null;

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
    const canonicalSymbol = normalizeMarketOrderSymbol(symbolToSend);
    const body = { ...orderBody, symbol: canonicalSymbol };
    const serializedBody = JSON.stringify(body);
    const idempotencyKey = resolveIdempotencyKey(serializedBody);
    logOrderDiagnostic('[RTX5 Order] POST /orders body:', serializedBody);
    const startedAtMs = getApiLatencyNow();
    let response: Response | null = null;

    try {
      createRequestStarted = true;
      response = await apiClient('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: serializedBody,
      });
      const raw = await response.json().catch(() => ({}));
      assertOrderSessionCurrent();
      const inner = unwrap(raw);
      const bodyStatus = typeof inner?.status === 'string' ? inner.status.toLowerCase() : '';
      const graceful = response.status === 200 && ['rejected', 'failed', 'error'].includes(bodyStatus);
      const ok = response.status === 200 && !graceful;
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
        symbol: canonicalSymbol,
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
  // Block unrelated full-ledger polls before the first POST. The matching
  // reconciliation releases this barrier after broker state converges.
  const reconciliationGeneration = ++marketOrderReconciliationGeneration;
  const releasePositionsMutation = beginProtectedPositionsMutation();

  try {
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
    const finalData = unwrap(accepted.body) as PlaceOrderResponse;

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
    reconciliationResponse = finalData;
    return finalData;
  } finally {
    // A market POST can have an unknown result after timeout, abort, or a
    // network break. Start an authoritative read for the immutable owner on
    // every transport outcome, but never let reconciliation replace the
    // primary response/error and never query whichever broker is selected now.
    if (createRequestStarted) {
      // Fetch immediately, but hold a stale/empty pre-commit candidate off the
      // screen. Only the full ledger that agrees with the returned execution
      // ticket is allowed to replace visible positions.
      void reconcileMarketOrderPositions(reconciliationResponse, {
        readPositions: () => positionsApi.getPositionsForReconciliation(owner.accountLogin),
        isOwnerCurrent: () => isActiveBrokerSessionOwnerStampCurrent(owner),
        commitPositions: (positions) => {
          if (!isActiveBrokerSessionOwnerStampCurrent(owner)) return;
          // If a newer rapid one-click order has already started, this older
          // full read may not contain it yet. It can add/update confirmed rows,
          // but only the newest market mutation may remove missing rows.
          const preserveMissingExisting =
            reconciliationGeneration !== marketOrderReconciliationGeneration;
          usePositionsState.getState().applyPositionsSnapshot(
            positions,
            owner.accountLogin,
            preserveMissingExisting ? { preserveMissingExisting: true } : undefined,
          );
        },
      })
        .catch((error) => {
          warnOrderDiagnostic('[RTX5 Order] captured-owner reconciliation failed', error);
        })
        .finally(releasePositionsMutation);
    } else {
      releasePositionsMutation();
    }
  }
};

export function resetAcceptedMarketOrderSymbolCache(): void {
  acceptedOrderSymbolCache.clear();
  marketOrderReconciliationGeneration = 0;
}
