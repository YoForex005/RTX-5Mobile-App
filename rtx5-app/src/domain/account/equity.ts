import type { PositionItem } from '../../dev/mock/tradingData';

export type EquityTick = {
  symbol: string;
  price: number;
};

export type InstrumentContractSpec = {
  symbol: string;
  contractSize?: number | null;
};

export const DEFAULT_CONTRACT_SIZE = 100_000;

const normalizeSymbolKey = (symbol: string) => symbol.trim().toUpperCase();

export function buildContractSizeMap(
  instruments: InstrumentContractSpec[] = [],
): Record<string, number> {
  return instruments.reduce<Record<string, number>>((acc, instrument) => {
    const key = normalizeSymbolKey(instrument.symbol);
    const size = Number(instrument.contractSize);
    if (key && Number.isFinite(size) && size > 0) {
      acc[key] = size;
    }
    return acc;
  }, {});
}

export function calculateFloatingPnlFromTick({
  positions,
  tick,
  contractSizes,
}: {
  positions: PositionItem[];
  tick: EquityTick;
  contractSizes?: Record<string, number>;
}): number {
  const tickSymbol = normalizeSymbolKey(tick.symbol);
  const currentPrice = Number(tick.price);
  if (!tickSymbol || !Number.isFinite(currentPrice)) {
    return positions.reduce((sum, position) => sum + (Number(position.pnl) || 0), 0);
  }

  return positions.reduce((sum, position) => {
    const positionSymbol = normalizeSymbolKey(position.symbol);
    if (positionSymbol !== tickSymbol) {
      return sum + (Number(position.pnl) || 0);
    }

    const openPrice = Number(position.openPrice);
    const volume = Number(position.volume);
    if (!Number.isFinite(openPrice) || !Number.isFinite(volume)) {
      return sum + (Number(position.pnl) || 0);
    }

    const direction = position.side === 'sell' ? -1 : 1;
    const contractSize = contractSizes?.[positionSymbol] ?? DEFAULT_CONTRACT_SIZE;
    return sum + ((currentPrice - openPrice) * direction * volume * contractSize);
  }, 0);
}

export function calculateEquityFromTick({
  balance,
  positions,
  tick,
  contractSizes,
}: {
  balance: number;
  positions: PositionItem[];
  tick: EquityTick;
  contractSizes?: Record<string, number>;
}): { equity: number; floating: number } {
  const numericBalance = Number.isFinite(balance) ? balance : 0;
  const floating = calculateFloatingPnlFromTick({ positions, tick, contractSizes });
  return {
    floating,
    equity: numericBalance + floating,
  };
}
