/**
 * Derives synthetic ClosedPosition records from the deals stream.
 *
 * Why: some broker backends (the orrnn demo broker is the case in point)
 * populate the deals table (entry_in / entry_out) the moment a trade is
 * closed, but lag — or never populate at all — the dedicated
 * `/positions/{login}/history` endpoint. By rebuilding closed positions
 * from the deals stream we guarantee the History tab still shows
 * freshly-closed trades even when the history endpoint is empty.
 *
 * For partial closes, each entry_out deal becomes a separate synthetic
 * record (matching the broker's per-execution view). The earliest
 * matching entry_in deal supplies the open price, side, and open time.
 */
import type { Deal } from '../../api/deals';
import type { ClosedPosition } from '../../api/positions';

export function deriveClosedPositionsFromDeals(deals: Deal[] | undefined | null): ClosedPosition[] {
  if (!Array.isArray(deals) || deals.length === 0) {
    return [];
  }

  // Earliest entry_in per position holds the open price/side/time.
  const openByPosition = new Map<number, Deal>();
  for (const deal of deals) {
    if (deal.entry !== 'entry_in') continue;
    const existing = openByPosition.get(deal.position_ticket);
    if (!existing || (typeof deal.time === 'number' && deal.time < existing.time)) {
      openByPosition.set(deal.position_ticket, deal);
    }
  }

  const synthesized: ClosedPosition[] = [];
  for (const deal of deals) {
    if (deal.entry !== 'entry_out') continue;
    const open = openByPosition.get(deal.position_ticket);

    // The entry_in deal's action determines the position direction:
    //   entry_in deal_buy  → position is BUY
    //   entry_in deal_sell → position is SELL
    // If we don't have the matching entry_in (history truncated, etc.)
    // we infer the inverse from the entry_out deal: closing a BUY is
    // a deal_sell, closing a SELL is a deal_buy.
    const side: 'buy' | 'sell' = open
      ? (open.action === 'deal_sell' ? 'sell' : 'buy')
      : (deal.action === 'deal_sell' ? 'buy' : 'sell');

    // `fee` is propagated even though it is not in ClosedPosition's type —
    // resolveClosedPositionNetProfit() on the screen reads it via duck-typing,
    // so dropping it would understate Net P/L by the broker fee component.
    synthesized.push({
      ticket: deal.position_ticket,
      account_login: deal.account_login,
      symbol: deal.symbol,
      side,
      volume: deal.volume,
      price_open: open?.price ?? 0,
      price_close: deal.price,
      profit: deal.profit,
      swap: deal.swap,
      commission: deal.commission,
      fee: deal.fee,
      comment: deal.comment?.trim() || undefined,
      time_create: open?.time ?? deal.time,
      time_update: deal.time,
      time_close: deal.time,
    } as ClosedPosition);
  }

  return synthesized;
}

/**
 * Normalises any positive Unix-style timestamp (seconds, milliseconds, or
 * microseconds) down to whole seconds. Backends sometimes return time_close
 * in ms while deals.time is in seconds — without this normalisation the
 * dedupe key would miss collisions and we'd double-count the same close.
 */
function normalizeTimestampToSeconds(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num > 4.2e16) return Math.floor(num / 1_000_000_000); // nanoseconds
  if (num > 4.2e13) return Math.floor(num / 1_000_000);     // microseconds
  if (num > 4.2e10) return Math.floor(num / 1_000);          // milliseconds
  return Math.floor(num);                                    // seconds
}

/**
 * Builds a stable dedup key combining the position ticket with the close
 * time normalised to whole seconds. Partial closes on the same position
 * produce separate keys, which matches what the dedicated history endpoint
 * returns. Unit normalisation prevents ms-vs-seconds mismatches between
 * the two sources from leaking through as duplicate rows.
 */
function closedPositionDedupKey(record: ClosedPosition): string {
  const ticket = record.ticket ?? '';
  const rawCloseTime = record.time_close ?? record.time_update ?? '';
  const closeTime = normalizeTimestampToSeconds(rawCloseTime) ?? rawCloseTime;
  return `${ticket}|${closeTime}`;
}

/**
 * Merges authoritative closed-history records with deals-derived records.
 * History records win on collisions — the dedicated endpoint is the source
 * of truth when it does return data; the derived stream just fills the gap.
 */
export function mergeClosedPositionSources(
  historyRecords: ClosedPosition[],
  derivedRecords: ClosedPosition[],
): ClosedPosition[] {
  const byKey = new Map<string, ClosedPosition>();
  for (const record of derivedRecords) {
    byKey.set(closedPositionDedupKey(record), record);
  }
  for (const record of historyRecords) {
    byKey.set(closedPositionDedupKey(record), record);
  }
  return Array.from(byKey.values());
}
