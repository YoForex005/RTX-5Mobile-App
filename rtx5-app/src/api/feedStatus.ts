import { timedFetch } from '../utils/apiLatency';
import {
  isBrokerServiceBaseUrl,
  normalizeBrokerServerUrl,
} from './brokerRouting';

export const FEED_STATUS_LIVE_MAX_AGE_SEC = 90;

type FeedStatusRow = Record<string, unknown>;

const asRecord = (value: unknown): FeedStatusRow | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as FeedStatusRow)
    : null;

const cleanString = (value: unknown): string => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  return String(value).trim();
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getSymbol = (row: FeedStatusRow, fallback?: string): string =>
  cleanString(row.symbol ?? row.Symbol ?? row.SYMBOL ?? row.instrument ?? fallback);

const getLastTickAgeSec = (row: FeedStatusRow): number | null =>
  toFiniteNumber(
    row.last_tick_age_sec ??
      row.lastTickAgeSec ??
      row.age_sec ??
      row.ageSec ??
      row.tick_age_sec ??
      row.tickAgeSec,
  );

const hasPositiveQuote = (row: FeedStatusRow): boolean => {
  const bid = toFiniteNumber(row.last_bid ?? row.lastBid ?? row.bid ?? row.Bid);
  const ask = toFiniteNumber(row.last_ask ?? row.lastAsk ?? row.ask ?? row.Ask);
  return Boolean((bid !== null && bid > 0) || (ask !== null && ask > 0));
};

const isTruthyFlag = (value: unknown): boolean =>
  value === true || value === 1 || String(value).trim().toLowerCase() === 'true';

const isSilentRow = (row: FeedStatusRow): boolean => {
  const status = cleanString(row.status).toLowerCase();
  return isTruthyFlag(row.silent) || status === 'silent' || status === 'stale';
};

const isFreshRow = (row: FeedStatusRow): boolean => {
  const ageSec = getLastTickAgeSec(row);
  return ageSec === null || (ageSec >= 0 && ageSec <= FEED_STATUS_LIVE_MAX_AGE_SEC);
};

const isLiveRow = (row: FeedStatusRow): boolean => {
  const status = cleanString(row.status).toLowerCase();
  const hasLiveEvidence =
    status === 'live' ||
    status === 'ok' ||
    isTruthyFlag(row.has_data) ||
    isTruthyFlag(row.hasData) ||
    isTruthyFlag(row.has_quote) ||
    isTruthyFlag(row.hasQuote) ||
    hasPositiveQuote(row);

  return hasLiveEvidence && isFreshRow(row) && (!isSilentRow(row) || hasPositiveQuote(row));
};

const uniqueCleanSymbols = (symbols: Iterable<string>): string[] =>
  Array.from(new Set(Array.from(symbols).map((symbol) => cleanString(symbol)).filter(Boolean)));

const extractRowsFromSymbolStatus = (symbolStatus: unknown): Array<{ row: FeedStatusRow; fallback?: string }> => {
  if (Array.isArray(symbolStatus)) {
    return symbolStatus
      .map((entry) => asRecord(entry))
      .filter((entry): entry is FeedStatusRow => entry !== null)
      .map((row) => ({ row }));
  }

  const statusRecord = asRecord(symbolStatus);
  if (!statusRecord) {
    return [];
  }

  const rows: Array<{ row: FeedStatusRow; fallback?: string }> = [];
  for (const [symbol, value] of Object.entries(statusRecord)) {
    const row = asRecord(value);
    if (row) {
      rows.push({ row, fallback: symbol });
    }
  }
  return rows;
};

const extractSymbolsFromArrayRows = (rows: unknown): string[] => {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((entry) => {
      if (typeof entry === 'string' || typeof entry === 'number') {
        return cleanString(entry);
      }
      const row = asRecord(entry);
      return row && isLiveRow(row) ? getSymbol(row) : '';
    })
    .filter(Boolean);
};

const extractSilentSymbols = (payload: FeedStatusRow): Set<string> =>
  new Set(
    Array.isArray(payload.silent_symbols)
      ? payload.silent_symbols.map(cleanString).filter(Boolean)
      : [],
  );

export const extractActiveFeedSymbols = (payload: unknown): string[] => {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const active = new Set<string>();
  for (const { row, fallback } of extractRowsFromSymbolStatus(root.symbol_status ?? root.symbolStatus)) {
    if (isLiveRow(row)) {
      const symbol = getSymbol(row, fallback);
      if (symbol) {
        active.add(symbol);
      }
    }
  }

  for (const symbol of extractSymbolsFromArrayRows(root.active_symbols ?? root.activeSymbols)) {
    active.add(symbol);
  }

  if (active.size > 0) {
    return uniqueCleanSymbols(active);
  }

  const silentSymbols = extractSilentSymbols(root);
  const availableSymbols = Array.isArray(root.available_symbols)
    ? root.available_symbols.map(cleanString).filter(Boolean)
    : Array.isArray(root.availableSymbols)
      ? root.availableSymbols.map(cleanString).filter(Boolean)
      : [];

  if (availableSymbols.length > 0 && silentSymbols.size > 0) {
    return uniqueCleanSymbols(availableSymbols.filter((symbol) => !silentSymbols.has(symbol)));
  }

  return [];
};

export const buildBrokerFeedStatusUrl = (
  serverUrl?: string | null,
  brokerId?: string | null,
): string => {
  const brokerRoot = normalizeBrokerServerUrl(serverUrl);
  const normalizedBrokerId = cleanString(brokerId);
  if (!normalizedBrokerId || !isBrokerServiceBaseUrl(brokerRoot)) {
    return '';
  }

  return `${brokerRoot}/ws/feed/status?broker_id=${encodeURIComponent(normalizedBrokerId)}`;
};

export async function fetchBrokerFeedStatusActiveSymbols(options: {
  serverUrl?: string | null;
  brokerId?: string | null;
  signal?: AbortSignal;
}): Promise<string[]> {
  const url = buildBrokerFeedStatusUrl(options.serverUrl, options.brokerId);
  if (!url) {
    return [];
  }

  const response = await timedFetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: options.signal,
  }, {
    label: 'feed.status',
    method: 'GET',
    endpoint: url,
    source: 'broker',
    timeoutMs: 4000,
  });

  if (!response.ok) {
    throw new Error(`Feed status failed with status ${response.status}`);
  }

  return extractActiveFeedSymbols(await response.json());
}
