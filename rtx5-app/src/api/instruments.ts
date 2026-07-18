import { apiJsonClient, commitApiJson } from './apiClient';
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

export async function fetchInstrumentMeta(
  symbol: string,
  cacheNamespace: string,
): Promise<InstrumentMetaDTO> {
  if (!cacheNamespace) {
    throw new Error('Instrument metadata requires an active session cache namespace.');
  }
  const exactSymbol = normalizeQuoteSymbolKey(symbol);
  const normalizedSymbol = normalizeSymbol(symbol);
  const candidates = Array.from(new Set([exactSymbol, normalizedSymbol].filter(Boolean)));
  let firstError: Error | null = null;

  for (const candidate of candidates) {
    const result = await apiJsonClient<unknown>(`/instruments/${encodeURIComponent(candidate)}`);
    if (!result.ok) {
      firstError ??= new Error(`Failed to fetch metadata for ${candidate}`);
      continue;
    }

    return commitApiJson(result, cacheNamespace, (data) => {
      const meta = normalizeInstrumentMetaPayload(data, candidate);
      cacheInstrumentMeta(meta, cacheNamespace);
      return meta;
    });
  }

  const catalogResult = await apiJsonClient<unknown>('/instruments');
  if (catalogResult.ok) {
    const catalogMeta = commitApiJson(catalogResult, cacheNamespace, (catalog) => {
      primeInstrumentMetaCacheFromCatalogPayload(catalog, cacheNamespace);
      const meta = findInstrumentMetaInCatalogPayload(catalog, symbol);
      if (meta) cacheInstrumentMeta(meta, cacheNamespace);
      return meta;
    });
    if (catalogMeta) return catalogMeta;
  }

  throw firstError ?? new Error(`Failed to fetch metadata for ${normalizedSymbol || exactSymbol || symbol}`);
}
