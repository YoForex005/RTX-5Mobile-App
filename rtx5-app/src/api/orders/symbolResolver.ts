/**
 * Broker symbol resolver.
 *
 * The trading endpoint (POST /orders) keys live market data on the EXACT
 * symbol the broker's instrument catalog uses — e.g. "XAUUSDm" or "EURUSD.pro"
 * — but the rest of the client normalises to a base form (e.g. "XAUUSD").
 * Sending the base form to a broker that uses a suffixed form returns
 * "market data not available". The catalog itself tells us the exact string,
 * so we fetch GET /instruments once and resolve our symbol against it.
 */
import { apiClient } from '../apiClient';
import { normalizeSymbol } from '../../domain/symbols';

let instrumentCache: string[] | null = null;
let instrumentCacheAt = 0;
const INSTRUMENT_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchInstrumentsCached(): Promise<string[]> {
  const now = Date.now();
  if (instrumentCache && now - instrumentCacheAt < INSTRUMENT_CACHE_TTL_MS) {
    return instrumentCache;
  }
  try {
    const res = await apiClient('/instruments');
    if (res.ok) {
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data : data?.instruments ?? [];
      const symbols = list
        .map((it) => (typeof it === 'string' ? it : it?.symbol))
        .filter((s): s is string => typeof s === 'string' && s.length > 0);
      instrumentCache = Array.from(new Set(symbols));
      instrumentCacheAt = now;
      return instrumentCache;
    }
  } catch (err) {
    console.warn('[RTX5 Order] instruments fetch failed:', err instanceof Error ? err.message : err);
  }
  return instrumentCache ?? [];
}

/**
 * Resolve the caller's symbol to the exact string the backend recognises.
 * Priority:
 *   1. Exact match (already valid).
 *   2. Any instrument whose base form (normalizeSymbol) equals the caller's
 *      base form — returns the catalog's exact string (including broker suffix).
 *   3. Falls back to the caller's original symbol if the catalog is empty
 *      or the symbol isn't in it.
 */
export async function resolveBrokerSymbol(symbol: string): Promise<string> {
  const raw = (symbol ?? '').trim();
  if (!raw) return raw;
  const instruments = await fetchInstrumentsCached();
  if (instruments.length === 0) return raw;
  if (instruments.includes(raw)) return raw;
  const targetBase = normalizeSymbol(raw);
  const match = instruments.find((inst) => normalizeSymbol(inst) === targetBase);
  if (match) {
    console.log('[RTX5 Order] symbol resolved via /instruments:', raw, '→', match);
    return match;
  }
  return raw;
}
