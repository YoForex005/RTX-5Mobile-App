/**
 * Place a market order on the trading server.
 *
 * POST /api/v2/orders
 *
 * Rate limited: 60 requests per minute per account.
 * Uses a DB transaction for atomicity. Rejected if market data returns
 * zero or negative prices. SL/TP values are validated server-side.
 *
 * Error responses:
 * - 400: Invalid SL/TP, zero/negative market price, or invalid parameters
 * - 404: Account not found
 * - 429: Rate limited — check Retry-After header
 */
import { getSecureItemAsync } from '../../utils/secureStorage';
import { apiClient, decodeBrokerIdFromToken, API_BASE_URL } from '../apiClient';
import { normalizeSymbol } from '../../domain/symbols';
import { assertTradeSide } from '../../domain/tradeSide';
import { createTradingApiError } from '../tradingErrors';
import { useUserPreferences } from '../../state/userPreferences';
import { resolveBrokerSymbol } from './symbolResolver';
import type { PlaceOrderPayload, PlaceOrderResponse } from './types';

export const placeMarketOrder = async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
  // V2 server resolves broker context EXCLUSIVELY from the JWT `broker_id` claim.
  // Query params, headers, and body fields are all ignored by the server (confirmed
  // via Swagger). The three-layer recovery in this function + apiClient ensures the
  // JWT always has a valid broker_id claim before and after the order is sent.
  // V2 contract requires `login` (integer) — NOT `account_login`.
  const { account_login, ...rest } = payload;
  const loginInt =
    typeof account_login === 'string' ? parseInt(account_login, 10) : account_login;

  // Symbol routing: the backend's market-data service keys market prices on
  // the broker-specific symbol (e.g. "XAUUSDm"), but other parts of the
  // client normalise to the base form (e.g. "XAUUSD"). Previously we sent
  // the normalised form here and the server replied with "market data not
  // available" because the backend couldn't find a live price under the
  // stripped key. We now send the symbol AS-IS for the primary attempt —
  // the caller (chart / order ticket) is responsible for passing the
  // tradable symbol. If that 400s with a market-data error, the retry path
  // below tries the normalised base form as a fallback, and vice-versa.
  const callerSymbol = (payload.symbol ?? '').trim();
  // Resolve to the exact symbol the backend's instrument catalog lists.
  // If the catalog is unavailable or has no match, falls back to callerSymbol.
  const rawSymbol = await resolveBrokerSymbol(callerSymbol);
  const baseSymbol = normalizeSymbol(rawSymbol);

  // Remove broker_id from the body — the server resolves it from the JWT
  // claim only (confirmed via Swagger: no query param or body field needed).
  // Sending it in those places doesn't help and can cause unexpected failures.
  const { broker_id: _ignored, ...restWithoutBroker } = rest;

  // CRITICAL: the server's Swagger spec treats price_sl / price_tp as
  // optional, and when provided validates them against the current market
  // price. Sending `price_sl: 0` / `price_tp: 0` causes a 400 "Invalid
  // SL/TP" rejection because 0 is not a valid price. We must omit these
  // fields entirely when the caller wants no SL/TP. Same reasoning for
  // the optional integer fields when they're 0 (their "off" value).
  const requestedSide = assertTradeSide(restWithoutBroker.side);
  const orderBody: Record<string, unknown> = {
    login: loginInt,
    symbol: rawSymbol,
    side: requestedSide,
    volume: restWithoutBroker.volume,
  };
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
  if (typeof restWithoutBroker.magic === 'number' && restWithoutBroker.magic > 0) {
    orderBody.magic = restWithoutBroker.magic;
  }

  // Verify the JWT has broker_id claim. Log so we can diagnose issues.
  const state = useUserPreferences.getState();
  const currentToken = state.accountDetails?.credentials?.accessToken;
  const jwtBrokerId = decodeBrokerIdFromToken(currentToken);
  console.log('[RTX5 Order] JWT broker_id:', jwtBrokerId, '| stored brokerId:', state.brokerId);
  console.log('[TRADE-PAYLOAD]', {
    symbol: rawSymbol,
    side: requestedSide,
    action: requestedSide,
    orderType: 'market',
    command: requestedSide,
    tradeType: 'market',
    volume: restWithoutBroker.volume,
    priceSource: requestedSide === 'buy' ? 'ask' : 'bid',
    rawPayload: orderBody,
  });

  // ── Silent re-login if JWT has lost its broker_id claim ───────────────
  // The V2 refresh endpoint strips broker_id from the new JWT. When this
  // happens all trades fail with 403 "No broker context found" because the
  // server resolves broker context exclusively from the JWT claim. We recover
  // by silently re-logging in with saved credentials to get a fresh JWT.
  if (!jwtBrokerId) {
    console.warn('[RTX5 Order] JWT missing broker_id — attempting silent re-login');
    try {
      const saved = await getSecureItemAsync('rtx5_saved_login');
      if (saved) {
        const { broker, login: savedLogin, pass } = JSON.parse(saved);
        if (broker && savedLogin && pass) {
          const loginData = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ username: savedLogin, password: pass, broker_id: broker }),
          });
          if (loginData.ok) {
            const freshAuth: any = await loginData.json();
            // Accept BOTH legacy {access_token, expires_in} and spec
            // {token, expires_at} shapes. Critical — otherwise the re-login
            // silently stores `undefined` as the access token and every
            // subsequent trade fails with 401.
            const freshToken = freshAuth.access_token ?? freshAuth.token;
            const freshRefresh = freshAuth.refresh_token ?? freshAuth.refreshToken ?? '';
            let freshExpiry: string;
            if (typeof freshAuth.expires_at === 'number' && freshAuth.expires_at > 0) {
              const ms = freshAuth.expires_at > 1e12 ? freshAuth.expires_at : freshAuth.expires_at * 1000;
              freshExpiry = new Date(ms).toISOString();
            } else {
              const sec = typeof freshAuth.expires_in === 'number' ? freshAuth.expires_in : 86400;
              freshExpiry = new Date(Date.now() + sec * 1000).toISOString();
            }
            if (freshToken) {
              state.updateTokens(freshToken, freshRefresh, freshExpiry);
              const responseBrokerId = freshAuth.broker_id ?? freshAuth.brokerId;
              if (responseBrokerId) state.setBrokerId(responseBrokerId);
              console.log('[RTX5 Order] Silent re-login OK. New JWT broker_id:', decodeBrokerIdFromToken(freshToken));
            } else {
              console.warn('[RTX5 Order] Silent re-login: response missing access token. Keys:', Object.keys(freshAuth ?? {}));
            }
          }
        }
      }
    } catch (reLoginErr) {
      console.warn('[RTX5 Order] Silent re-login failed:', reLoginErr);
    }
  }

  // Send helper + parse in one shot so the candidate loop can inspect the
  // body (not just the status) to detect graceful rejections.
  type Attempt = {
    symbol: string;
    status: number;
    body: any;
    response: Response;
    ok: boolean;          // HTTP ok AND not a graceful rejection
    graceful: boolean;    // HTTP ok BUT body says status: rejected/failed/error
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
    console.log('[RTX5 Order] POST /orders body:', JSON.stringify(body));
    const r = await apiClient('/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const raw = await r.json().catch(() => ({}));
    const inner = unwrap(raw);
    const bodyStatus = typeof inner?.status === 'string' ? inner.status.toLowerCase() : '';
    const graceful = r.ok && ['rejected', 'failed', 'error'].includes(bodyStatus);
    return {
      symbol: symbolToSend,
      status: r.status,
      body: raw,
      response: r,
      ok: r.ok && !graceful,
      graceful,
    };
  };

  // Is this attempt's failure a market-data / symbol-lookup issue? Works
  // for both HTTP-error failures (4xx) and graceful 200-with-reject bodies.
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
      msg.includes('zero') // "zero or negative market price"
    );
  };

  // ── Symbol-variant probing ───────────────────────────────────────────
  // The broker's trading server keys quotes on the broker-specific symbol
  // (e.g. "XAUUSDm"), but the client's chart & quote stores normalise to
  // the base form (e.g. "XAUUSD"). We try the caller's symbol first, then
  // walk a list of common broker suffixes applied to both forms until the
  // server accepts one. Each attempt's BODY is inspected — not just the
  // HTTP status — because some servers return 200 with a rejection object
  // instead of 400. If an attempt fails with anything OTHER than a
  // market-data miss (auth, ownership, rate limit, SL/TP) we bail out
  // immediately — retrying would just repeat the same real error.
  const COMMON_BROKER_SUFFIXES = ['m', 'M', '.m', '.M', '.pro', '.PRO', 'pro', 'PRO', '.ecn', '.ECN', 'ecn', 'ECN', '.c', 'c', '.std', '.STD'];
  const candidates: string[] = [];
  const pushCandidate = (s: string) => {
    const clean = (s ?? '').trim();
    if (clean && !candidates.includes(clean)) candidates.push(clean);
  };
  pushCandidate(rawSymbol);
  pushCandidate(baseSymbol);
  for (const suffix of COMMON_BROKER_SUFFIXES) {
    pushCandidate(baseSymbol + suffix);
    pushCandidate(rawSymbol + suffix);
  }

  let accepted: Attempt | null = null;
  let lastBad: Attempt | null = null;

  for (const candidate of candidates) {
    const a = await sendOrder(candidate);
    if (a.ok) {
      accepted = a;
      if (candidate !== rawSymbol) {
        console.log('[RTX5 Order] symbol accepted after fallback:', candidate);
      }
      break;
    }

    console.log(
      '[RTX5 Order] attempt failed',
      JSON.stringify({
        symbol: candidate,
        status: a.status,
        graceful: a.graceful,
        body: a.body,
      }),
    );
    lastBad = a;

    // Only keep walking the suffix list for symbol/market-data misses.
    if (!isMarketDataMiss(a)) break;
  }

  if (!accepted) {
    const status = lastBad?.status ?? 400;
    const body = lastBad?.graceful
      ? {
        message: unwrap(lastBad.body)?.comment
          || unwrap(lastBad.body)?.message
          || 'Order rejected by the trading server.'
      }
      : (lastBad?.body ?? {});
    const headers: Record<string, string> = {};
    if (status === 429 && lastBad?.response) {
      headers['retry-after'] = lastBad.response.headers.get('retry-after') || '';
    }
    // If the final failure is a graceful rejection, throw with 400 so the
    // error classifier treats it as a backend rejection (not server down).
    throw createTradingApiError(lastBad?.graceful ? 400 : status, body, headers);
  }

  // ── Success path ────────────────────────────────────────────────────
  let finalData = unwrap(accepted.body);

  // Normalise the response so existing call-sites that read the legacy
  // `position_ticket` / `order_ticket` / `price` fields keep working —
  // the V2 server returns the `Position` schema with `ticket` / `price_open`.
  if (finalData && typeof finalData === 'object') {
    if (finalData.position_ticket == null && finalData.ticket != null) {
      finalData.position_ticket = finalData.ticket;
    }
    if (finalData.order_ticket == null && finalData.ticket != null) {
      finalData.order_ticket = finalData.ticket;
    }
    if (finalData.price == null && finalData.price_open != null) {
      finalData.price = finalData.price_open;
    }
  }
  console.log('[TRADE-RESPONSE]', {
    requestSide: requestedSide,
    result: finalData?.status ?? accepted.status,
    backendSide: finalData?.side ?? null,
    rawResponse: finalData,
  });
  if (finalData?.side && finalData.side !== requestedSide) {
    console.warn('[TRADE-RESPONSE] backend side differs from request', {
      requestSide: requestedSide,
      backendSide: finalData.side,
      symbol: finalData.symbol ?? rawSymbol,
    });
  }

  return finalData;
};
