import { apiClient } from './apiClient';
import { normalizeSymbol } from '../domain/symbols';

export interface InstrumentMetaDTO {
  symbol: string;
  name?: string;
  category?: string;
  sector?: string;
  spreadMode?: string;
  stopsLevel?: string;
  calculation?: string;
  chartMode?: string;
  contractSize?: number;
  minVolume?: number;
  maxVolume?: number;
  stepVolume?: number;
  tickSize?: number;
  tickValue?: number;
  marginInitial?: number;
  marginMaintenance?: number;
  swapLong?: number;
  swapShort?: number;
  baseCurrency?: string;
  profitCurrency?: string;
  sessions?: Array<[string, string]>;
}

export async function fetchInstrumentMeta(symbol: string): Promise<InstrumentMetaDTO> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const res = await apiClient(`/instruments/${encodeURIComponent(normalizedSymbol)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch metadata for ${normalizedSymbol}`);
  }
  return res.json();
}
