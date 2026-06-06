import { apiClient } from './apiClient';
import { normalizeSymbol } from '../domain/symbols';
import {
  cacheInstrumentMeta,
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
  const normalizedSymbol = normalizeSymbol(symbol);
  const res = await apiClient(`/instruments/${encodeURIComponent(normalizedSymbol)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch metadata for ${normalizedSymbol}`);
  }
  const data = await res.json();
  const meta = normalizeInstrumentMetaPayload(data, normalizedSymbol);
  cacheInstrumentMeta(meta, cacheScope);
  return meta;
}
