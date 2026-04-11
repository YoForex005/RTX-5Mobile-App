import type { PositionItem } from '../mock/tradingData';

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function resolveOpenTime(dto: Record<string, unknown>, existing?: PositionItem): string {
  const rawTime = dto.time_create ?? dto.openTime;

  if (typeof rawTime === 'number' && Number.isFinite(rawTime)) {
    return new Date(rawTime * 1000).toISOString();
  }

  if (typeof rawTime === 'string' && rawTime.trim() !== '') {
    const parsed = new Date(rawTime);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return existing?.openTime ?? new Date().toISOString();
}

function buildStableFallbackId(dto: Record<string, unknown>, existing?: PositionItem): string {
  if (existing?.id) {
    return existing.id;
  }

  return `pos_${dto.symbol || 'unknown'}_${dto.side || 'na'}_${dto.time_create || dto.openTime || 0}_${dto.volume || 0}_${dto.price_open || dto.openPrice || 0}`;
}

export function mapPositionToItem(dto: unknown, existing?: PositionItem): PositionItem {
  const source =
    dto && typeof dto === 'object'
      ? (dto as Record<string, unknown>)
      : {};

  const swap = toFiniteNumber(source.swap) ?? existing?.swap ?? 0;
  const commission = toFiniteNumber(source.commission) ?? existing?.commission ?? 0;
  const existingBaseProfit = existing
    ? existing.pnl - (existing.swap ?? 0) - (existing.commission ?? 0)
    : 0;
  const baseProfit = toFiniteNumber(source.profit) ?? existingBaseProfit;

  const openPrice =
    toFiniteNumber(source.price_open ?? source.openPrice) ??
    existing?.openPrice ??
    0;

  const currentPrice =
    toFiniteNumber(source.price_current ?? source.currentPrice ?? source.price) ??
    existing?.currentPrice ??
    openPrice;

  const id = String(source.ticket ?? source.id ?? buildStableFallbackId(source, existing));
  const side = source.side === 'sell' ? 'sell' : source.side === 'buy' ? 'buy' : (existing?.side ?? 'buy');

  return {
    id,
    symbol: String(source.symbol ?? existing?.symbol ?? 'UNKNOWN'),
    side,
    volume: toFiniteNumber(source.volume) ?? existing?.volume ?? 0,
    openPrice,
    currentPrice,
    pnl: baseProfit + swap + commission,
    swap,
    commission,
    openTime: resolveOpenTime(source, existing),
    sl: toFiniteNumber(source.price_sl ?? source.sl) ?? existing?.sl ?? 0,
    tp: toFiniteNumber(source.price_tp ?? source.tp) ?? existing?.tp ?? 0,
    clientCreatedAt: existing?.clientCreatedAt,
    clientModifiedAt: existing?.clientModifiedAt,
  };
}
