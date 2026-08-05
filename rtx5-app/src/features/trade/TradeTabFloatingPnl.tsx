/**
 * Live floating-P/L readout for the BOTTOM tab bar's Trade item.
 *
 * MT5-style: while any position is open, the Trade tab shows the account's
 * live floating profit/loss (green/red) in place of the trending-up icon, so
 * the trader sees it from every tab. With no open positions the normal icon
 * returns.
 *
 * The tab bar is always mounted, so the quote commit interval is throttled —
 * this badge must never become a background churn source for the Chart tab.
 */
import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/shallow';
import { usePositionsState } from '../../state/positionsState';
import { dedupePositionsById } from '../../state/positionsState.helpers';
import { isRenderablePositionSymbol } from '../../state/positionsMapper';
import { useResolvedTradingLogin } from '../../state/tradingLogin';
import { fmt } from '../../utils/format';
import { useTradeLiveAccountSummary } from './TradeScreen/SummaryHeader';

const TAB_PNL_UP_COLOR = '#089981';
const TAB_PNL_DOWN_COLOR = '#F23645';
const TAB_PNL_QUOTE_COMMIT_INTERVAL_MS = 500;

export const TradeTabFloatingPnl = React.memo(({
  fallbackColor,
}: {
  /** Tab tint used for the plain icon when no positions are open. */
  fallbackColor: string;
}) => {
  const { positions, hydratedLogin } = usePositionsState(
    useShallow((state) => ({
      positions: state.positions,
      hydratedLogin: state.hydratedLogin,
    })),
  );
  const resolvedLogin = useResolvedTradingLogin();
  const renderablePositions = useMemo(
    () => dedupePositionsById(positions.filter((position) => isRenderablePositionSymbol(position.symbol))),
    [positions],
  );
  const account = useTradeLiveAccountSummary({
    positions: renderablePositions,
    hydratedLogin,
    resolvedLogin,
    active: true,
    quoteCommitIntervalMs: TAB_PNL_QUOTE_COMMIT_INTERVAL_MS,
  });

  if (renderablePositions.length === 0) {
    return <Ionicons name="trending-up-outline" size={25} color={fallbackColor} />;
  }

  const floating = Number.isFinite(account.floating) ? account.floating : 0;
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      adjustsFontSizeToFit
      style={{
        color: floating >= 0 ? TAB_PNL_UP_COLOR : TAB_PNL_DOWN_COLOR,
        fontSize: 13,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
        maxWidth: 92,
        textAlign: 'center',
      }}
    >
      {fmt.pnlPrecise(floating)}
    </Text>
  );
});
