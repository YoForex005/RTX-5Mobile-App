"use strict";
/**
 * Core HTTP Interceptor & API Client
 *
 * Centralized fetch wrapper responsible for communicating with the V2 REST Backend.
 * Handles three automatic recovery flows transparently:
 *
 *   1. 401 Unauthorized   → silent token refresh (cyclic refresh_token renewal)
 *   2. Token refresh loses broker_id claim → immediate silent re-login to restore it
 *   3. 403 "broker context" → silent re-login + one retry (handles long sessions where
 *                              the refreshed JWT silently lost its broker_id claim)
 *
 * The server resolves broker context EXCLUSIVELY from the JWT claim `broker_id`.
 * Query params and request headers are NOT checked by the V2 backend for broker routing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiClient = exports.resolveBrokerId = exports.decodeBrokerIdFromToken = exports.API_BASE_URL = void 0;
const secureStorage_1 = require("../utils/secureStorage");
const userPreferences_1 = require("../state/userPreferences");
// V2 API base URL — resolved from environment variable, falls back to direct IP
exports.API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://backend.orrnn.com/api/v2';
// ─────────────────────────────────────────────────────────────────────────────
// JWT helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Decode the broker_id claim from a JWT without any external dependency.
 * The V2 backend embeds broker context into the token payload so we can always
 * recover the active broker even if Zustand state was cleared (e.g. after logout).
 * Returns null if the token is missing, malformed, or has no broker claim. Never throws.
 */
const decodeBrokerIdFromToken = (token) => {
    if (!token)
        return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const decoded = typeof atob === 'function'
            ? atob(padded)
            : Buffer.from(padded, 'base64').toString('utf-8');
        const claims = JSON.parse(decoded);
        return (claims.broker_id ||
            claims.brokerId ||
            claims.broker ||
            claims['broker-id'] ||
            null);
    }
    catch {
        return null;
    }
};
exports.decodeBrokerIdFromToken = decodeBrokerIdFromToken;
/**
 * Resolve the active broker ID from JWT claim first, then persisted state.
 * The JWT is always canonical; the state fallback covers the window between
 * a refresh that strips the claim and the next silent re-login.
 */
const resolveBrokerId = () => {
    const state = userPreferences_1.useUserPreferences.getState();
    const token = state.accountDetails?.credentials?.accessToken;
    return (0, exports.decodeBrokerIdFromToken)(token) || state.brokerId || null;
};
exports.resolveBrokerId = resolveBrokerId;
// ─────────────────────────────────────────────────────────────────────────────
// Silent re-login
// ─────────────────────────────────────────────────────────────────────────────
let isSilentReLogging = false;
function normaliseAuthResponse(auth) {
    const accessToken = auth?.access_token ?? auth?.token ?? null;
    const refreshToken = auth?.refresh_token ?? auth?.refreshToken ?? null;
    let expiresAtIso;
    if (typeof auth?.expires_at === 'number' && auth.expires_at > 0) {
        const ms = auth.expires_at > 1e12 ? auth.expires_at : auth.expires_at * 1000;
        expiresAtIso = new Date(ms).toISOString();
    }
    else {
        const sec = typeof auth?.expires_in === 'number' ? auth.expires_in : 86400;
        expiresAtIso = new Date(Date.now() + sec * 1000).toISOString();
    }
    const brokerId = auth?.broker_id ?? auth?.brokerId ?? null;
    return { accessToken, refreshToken, expiresAtIso, brokerId };
}
async function silentReLogin(state) {
    if (isSilentReLogging)
        return null;
    isSilentReLogging = true;
    try {
        const saved = await (0, secureStorage_1.getSecureItemAsync)('rtx5_saved_login');
        if (!saved)
            return null;
        const { broker, login: savedLogin, pass } = JSON.parse(saved);
        if (!broker || !savedLogin || !pass)
            return null;
        const resp = await fetch(`${exports.API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ username: savedLogin, password: pass, broker_id: broker }),
        });
        if (!resp.ok)
            return null;
        const auth = await resp.json();
        const { accessToken, refreshToken, expiresAtIso, brokerId } = normaliseAuthResponse(auth);
        if (!accessToken) {
            console.warn('[apiClient] Silent re-login: response missing access token. Keys:', Object.keys(auth ?? {}));
            return null;
        }
        state.updateTokens(accessToken, refreshToken ?? '', expiresAtIso);
        if (brokerId)
            state.setBrokerId(brokerId);
        const newBrokerId = (0, exports.decodeBrokerIdFromToken)(accessToken);
        console.log('[apiClient] Silent re-login OK. JWT broker_id:', newBrokerId);
        return accessToken;
    }
    catch (e) {
        console.warn('[apiClient] Silent re-login failed:', e);
        return null;
    }
    finally {
        isSilentReLogging = false;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Token refresh queue
// ─────────────────────────────────────────────────────────────────────────────
let isRefreshing = false;
let failedQueue = [];
const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
        if (error)
            prom.reject(error);
        else
            prom.resolve(token);
    });
    failedQueue = [];
};
/**
 * Core fetch wrapper. Automatically:
 *   • Injects Bearer token + broker headers on every request
 *   • Refreshes expired tokens on 401 and replays the original request
 *   • Passes broker_id in the refresh body to preserve the JWT claim
 *   • After refresh, if the new JWT has no broker_id → silent re-login
 *   • On 403 "No broker context found" → silent re-login → one retry
 */
const apiClient = async (endpoint, options = {}) => {
    const state = userPreferences_1.useUserPreferences.getState();
    const token = state.accountDetails?.credentials?.accessToken;
    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('X-API-Key', token);
    }
    // Content-Type only for requests with a body — GET requests must not have it
    if (!headers.has('Content-Type') && !(options.body instanceof FormData) && options.body) {
        headers.set('Content-Type', 'application/json');
    }
    if (!headers.has('accept')) {
        headers.set('accept', 'application/json');
    }
    const config = { ...options, headers };
    // Cache-bust all GET requests so React Native's aggressive caching doesn't
    // serve stale market data
    let url = `${exports.API_BASE_URL}${endpoint}`;
    if (!config.method || config.method.toUpperCase() === 'GET') {
        url += url.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
    }
    let response = await fetch(url, config);
    // ── 401: Token expired → refresh and replay ───────────────────────────────
    if (response.status === 401 && !options._retry) {
        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            })
                .then((newToken) => {
                headers.set('Authorization', `Bearer ${newToken}`);
                headers.set('X-API-Key', String(newToken));
                return fetch(url, { ...config, headers, _retry: true });
            })
                .catch((err) => Promise.reject(err));
        }
        const originalRequest = { ...config, _retry: true };
        isRefreshing = true;
        try {
            const refreshToken = state.accountDetails?.credentials?.refreshToken;
            if (!refreshToken)
                throw new Error('No refresh token available');
            // Pass broker_id in the refresh body. The V2 backend embeds it in the
            // new JWT claim when provided — without this the refreshed JWT loses the
            // broker_id and all trading requests fail with 403 permanently.
            const knownBrokerId = state.brokerId || (0, exports.decodeBrokerIdFromToken)(token);
            const rs = await fetch(`${exports.API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    refresh_token: refreshToken,
                    ...(knownBrokerId ? { broker_id: knownBrokerId } : {}),
                }),
            });
            if (!rs.ok)
                throw new Error('Refresh token invalid or expired');
            const refreshData = await rs.json();
            const normalised = normaliseAuthResponse(refreshData);
            if (!normalised.accessToken) {
                console.warn('[apiClient] Refresh response missing access token. Keys:', Object.keys(refreshData ?? {}));
                throw new Error('Refresh response did not contain an access token.');
            }
            state.updateTokens(normalised.accessToken, normalised.refreshToken ?? refreshToken, normalised.expiresAtIso);
            // Persist broker_id from refresh response body (the refreshed JWT may or
            // may not contain it depending on the server version).
            if (normalised.brokerId)
                state.setBrokerId(normalised.brokerId);
            // ── Post-refresh broker_id verification ─────────────────────────────
            // If the new JWT still has no broker_id claim, get a completely fresh
            // token via re-login. This handles server versions where the refresh
            // endpoint strips broker_id regardless of the request body.
            let activeToken = normalised.accessToken;
            if (!(0, exports.decodeBrokerIdFromToken)(activeToken)) {
                console.warn('[apiClient] Refreshed JWT has no broker_id — attempting silent re-login');
                const freshToken = await silentReLogin(userPreferences_1.useUserPreferences.getState());
                if (freshToken)
                    activeToken = freshToken;
            }
            const retryHeaders = new Headers(originalRequest.headers);
            retryHeaders.set('Authorization', `Bearer ${activeToken}`);
            retryHeaders.set('X-API-Key', activeToken);
            originalRequest.headers = retryHeaders;
            processQueue(null, activeToken);
            response = await fetch(url, originalRequest);
        }
        catch (_error) {
            processQueue(_error, null);
            state.logout();
            return Promise.reject(_error);
        }
        finally {
            isRefreshing = false;
        }
    }
    // ── 403 "No broker context found" → silent re-login + one retry ──────────
    // This fires when a long-lived session's refreshed JWT silently lost its
    // broker_id claim and the silent re-login inside the refresh flow above
    // either wasn't triggered (no prior 401) or didn't succeed in time.
    // _brokerRetry flag ensures we only attempt this recovery once per request.
    if (response.status === 403 && !options._brokerRetry) {
        const cloned = response.clone();
        const errorBody = await cloned.json().catch(() => ({}));
        const errorMsg = (errorBody.message || errorBody.error || '').toLowerCase();
        if (errorMsg.includes('broker context') || errorMsg.includes('trading is disabled')) {
            console.warn('[apiClient] 403 broker context error — attempting silent re-login and retry');
            const freshToken = await silentReLogin(userPreferences_1.useUserPreferences.getState());
            if (freshToken) {
                const retryHeaders = new Headers(headers);
                retryHeaders.set('Authorization', `Bearer ${freshToken}`);
                retryHeaders.set('X-API-Key', freshToken);
                // One retry only — _brokerRetry prevents any further loops
                return fetch(url, {
                    ...config,
                    headers: retryHeaders,
                    _brokerRetry: true,
                });
            }
            // Silent re-login failed (no saved credentials / network) — fall through
            // and return the original 403 so the UI shows a proper error.
        }
    }
    return response;
};
exports.apiClient = apiClient;
