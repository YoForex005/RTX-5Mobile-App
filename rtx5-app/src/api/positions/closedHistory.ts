/**
 * Closed-position history loader.
 *
 * The backend paginates `/positions/{login}/history` and the field shapes vary
 * across broker integrations, so we normalise each row, dedupe across pages,
 * and stop walking when a page repeats or returns a partial fill.
 */
import { apiClient } from '../apiClient';
import { createTradingApiError } from '../tradingErrors';
import {
  assignNumberAlias,
  assignTimestampAlias,
  isJsonRecord,
  pickArrayPayload,
  pickString,
} from './payloadHelpers';
import type { ClosedPosition, JsonRecord } from './types';

const MAX_CLOSED_HISTORY_PAGES = 50;

function normalizeClosedHistoryRecord(record: unknown): ClosedPosition | null {
  if (!isJsonRecord(record)) {
    return null;
  }

  const normalized: JsonRecord = { ...record };
  const symbol = pickString(record, ['symbol', 'Symbol', 'instrument', 'name']);
  const side = pickString(record, ['side', 'type', 'order_type', 'action', 'cmd']);
  const comment = pickString(record, ['comment', 'reason', 'description']);

  if (symbol) {
    normalized.symbol = symbol;
  }
  if (side) {
    const sideLower = side.toLowerCase();
    if (sideLower.includes('sell')) {
      normalized.side = 'sell';
    } else if (sideLower.includes('buy')) {
      normalized.side = 'buy';
    }
  }
  if (comment) {
    normalized.comment = comment;
  }

  assignNumberAlias(normalized, record, 'ticket', ['ticket', 'position_ticket', 'positionTicket', 'order_ticket', 'orderTicket', 'deal_ticket', 'dealTicket', 'id']);
  assignNumberAlias(normalized, record, 'account_login', ['account_login', 'accountLogin', 'login', 'account']);
  assignNumberAlias(normalized, record, 'volume', ['volume', 'lots', 'lot', 'volume_closed', 'volumeClosed']);
  assignNumberAlias(normalized, record, 'price_open', ['price_open', 'priceOpen', 'open_price', 'openPrice', 'open']);
  assignNumberAlias(normalized, record, 'price_close', ['price_close', 'priceClose', 'close_price', 'closePrice', 'close']);
  assignNumberAlias(normalized, record, 'price_current', ['price_current', 'priceCurrent', 'current_price', 'currentPrice', 'price']);
  assignNumberAlias(normalized, record, 'profit', ['profit', 'pnl', 'pl', 'close_profit', 'closed_profit']);
  assignNumberAlias(normalized, record, 'swap', ['swap', 'swaps']);
  assignNumberAlias(normalized, record, 'commission', ['commission', 'commissions']);
  assignNumberAlias(normalized, record, 'fee', ['fee', 'fees']);
  assignTimestampAlias(normalized, record, 'time_create', ['time_create', 'timeCreate', 'open_time', 'openTime', 'time_open', 'timeOpen', 'created_at']);
  assignTimestampAlias(normalized, record, 'time_update', ['time_update', 'timeUpdate', 'updated_at']);
  assignTimestampAlias(normalized, record, 'time_close', ['time_close', 'timeClose', 'close_time', 'closeTime', 'time_done', 'timeDone', 'closed_at', 'time']);

  return normalized as unknown as ClosedPosition;
}

function buildClosedHistoryRecordKey(record: ClosedPosition, fallbackIndex: number): string {
  const source = record as unknown as JsonRecord;
  const parts = [
    source.ticket,
    source.position_ticket,
    source.order_ticket,
    source.deal_ticket,
    source.id,
    source.symbol,
    source.side,
    source.time_close,
    source.time_done,
    source.closed_at,
    source.time_update,
    source.time_create,
    source.volume,
    source.price_open,
    source.price_close,
    source.profit,
  ]
    .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .filter(Boolean);

  return parts.length > 0 ? parts.join('|') : `closed-history-${fallbackIndex}`;
}

async function fetchClosedHistoryPage(
  login: number,
  limit: number,
  offset: number,
): Promise<ClosedPosition[]> {
  const response = await apiClient(
    `/positions/${login}/history?limit=${limit}&offset=${offset}`,
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.warn('[ClosedHistory] Request failed with status', response.status);
    const headers: Record<string, string> = {};
    if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
    throw createTradingApiError(response.status, errorData, headers);
  }

  const json = await response.json();
  const rows = pickArrayPayload(json);
  if (!rows) return [];
  return rows
    .map(normalizeClosedHistoryRecord)
    .filter((record): record is ClosedPosition => record !== null);
}

export async function getPositionHistory(
  login: number,
  limit = 1000,
  offset = 0,
  maxPages = MAX_CLOSED_HISTORY_PAGES,
): Promise<ClosedPosition[]> {
  const pageSize = Math.max(1, Math.floor(limit));
  const finiteMaxPages = Number.isFinite(maxPages)
    ? Math.floor(maxPages)
    : MAX_CLOSED_HISTORY_PAGES;
  const pageCount = Math.max(1, Math.min(MAX_CLOSED_HISTORY_PAGES, finiteMaxPages));
  const records: ClosedPosition[] = [];
  const seenKeys = new Set<string>();
  const seenPageSignatures = new Set<string>();
  let nextOffset = Math.max(0, Math.floor(offset));

  for (let page = 0; page < pageCount; page += 1) {
    const pageRows = await fetchClosedHistoryPage(login, pageSize, nextOffset);
    if (pageRows.length === 0) {
      break;
    }
    const pageSignature = pageRows
      .map((record, index) => buildClosedHistoryRecordKey(record, index))
      .join('\n');
    if (seenPageSignatures.has(pageSignature)) {
      break;
    }
    seenPageSignatures.add(pageSignature);

    let appendedCount = 0;
    pageRows.forEach((record, index) => {
      const key = buildClosedHistoryRecordKey(record, nextOffset + index);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        records.push(record);
        appendedCount += 1;
      }
    });

    if (appendedCount === 0) {
      break;
    }

    // Some broker gateways silently cap a requested page (for example, a
    // requested 1000 rows may return only 50). A short page is therefore not
    // proof that history ended. Advance by the rows the server actually
    // returned and let an empty or repeated next page terminate the walk.
    nextOffset += pageRows.length;
  }

  return records;
}
