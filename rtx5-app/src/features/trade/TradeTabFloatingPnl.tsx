/**
 * Live floating-P/L readout for the BOTTOM tab bar's Trade item.
 *
 * MT5-style: while any position is open, the Trade tab's LABEL (the word
 * "Trade") is replaced by the account's live floating profit/loss, colored
 * green/red, so the trader sees it from every tab. The trade icon stays in
 * the icon slot. With no open positions the normal "Trade" label returns.
 *
 * The tab bar is always mounted, so the quote commit interval is throttled —
 * this badge must never become a background churn source for the Chart tab.
 */
import React, { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
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
  fallbackLabel,
  fallbackColor,
  labelStyle,
}: {
  /** The normal tab label text ("Trade") shown when no positions are open. */
  fallbackLabel: string;
  /** Tab tint used for the fallback label. */
  fallbackColor: string;
  /** Base tab-label typography so both states align with the other tabs. */
  labelStyle?: StyleProp<TextStyle>;
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
    return (
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[labelStyle, { color: fallbackColor }]}
      >
        {fallbackLabel}
      </Text>
    );
  }

  const floating = Number.isFinite(account.floating) ? account.floating : 0;
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[
        labelStyle,
        {
          color: floating >= 0 ? TAB_PNL_UP_COLOR : TAB_PNL_DOWN_COLOR,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
        },
      ]}
    >
      {fmt.pnlPrecise(floating)}
    </Text>
  );
});
