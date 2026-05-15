import { normalizeSymbol } from '../../domain/symbols';

export const getAcceptedSymbolCacheKey = (brokerId: string | null | undefined, symbol: string) =>
  `${brokerId || 'unknown'}:${normalizeSymbol(symbol) || symbol.trim().toUpperCase()}`;

const pushUniqueSymbol = (candidates: string[], symbol: string | null | undefined) => {
  const clean = (symbol ?? '').trim();
  if (clean && !candidates.includes(clean)) {
    candidates.push(clean);
  }
};

export function buildMarketOrderSymbolCandidates({
  callerSymbol,
  acceptedSymbol,
  cachedCatalogSymbol,
}: {
  callerSymbol: string;
  acceptedSymbol?: string | null;
  cachedCatalogSymbol?: string | null;
}): string[] {
  const candidates: string[] = [];
  const baseSymbol = normalizeSymbol(callerSymbol);

  pushUniqueSymbol(candidates, acceptedSymbol);
  pushUniqueSymbol(candidates, callerSymbol);
  pushUniqueSymbol(candidates, cachedCatalogSymbol);
  pushUniqueSymbol(candidates, baseSymbol);

  return candidates;
}
