import { apiClient } from './apiClient';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../domain/symbols';
import {
  cacheInstrumentMeta,
  findInstrumentMetaInCatalogPayload,
  getCachedInstrumentMeta,
  normalizeInstrumentMetaPayload,
  primeInstrumentMetaCacheFromCatalogPayload,
  type InstrumentMetaDTO,
} from './instrumentMeta';

export type { InstrumentMetaDTO };
export {
  getCachedInstrumentMeta,
  normalizeInstrumentMetaPayload,
  primeInstrumentMetaCacheFromCatalogPayload,
};

export async function fetchInstrumentMeta(symbol: string, cacheScope?: string): Promise<InstrumentMetaDTO> {
  const exactSymbol = normalizeQuoteSymbolKey(symbol);
  const normalizedSymbol = normalizeSymbol(symbol);
  const candidates = Array.from(new Set([exactSymbol, normalizedSymbol].filter(Boolean)));
  let firstError: Error | null = null;

  for (const candidate of candidates) {
    const res = await apiClient(`/instruments/${encodeURIComponent(candidate)}`);
    if (!res.ok) {
      firstError ??= new Error(`Failed to fetch metadata for ${candidate}`);
      continue;
    }

    const data = await res.json();
    const meta = normalizeInstrumentMetaPayload(data, candidate);
    cacheInstrumentMeta(meta, cacheScope);
    return meta;
  }

  const catalogRes = await apiClient('/instruments');
  if (catalogRes.ok) {
    const catalog = await catalogRes.json();
    primeInstrumentMetaCacheFromCatalogPayload(catalog, cacheScope);
    const catalogMeta = findInstrumentMetaInCatalogPayload(catalog, symbol);
    if (catalogMeta) {
      cacheInstrumentMeta(catalogMeta, cacheScope);
      return catalogMeta;
    }
  }

  throw firstError ?? new Error(`Failed to fetch metadata for ${normalizedSymbol || exactSymbol || symbol}`);
}
