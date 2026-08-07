/**
 * Summary header for the Trade screen.
 *
 * Shows live floating Profit/Loss, balance/equity/margin breakdown, and a Bulk-action
 * launcher. Memoized so it does not re-render on every position-row tick.
 */
import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useShallow } from 'zustand/shallow';
import { useTranslation } from '../../../i18n/useTranslation';
import { PositionItem } from '../../../dev/mock/tradingData';
import { useUserPreferences } from '../../../state/userPreferences';
import { useLiveAccountState } from '../../../state/liveAccountState';
import { useTradingState } from '../../../state/tradingState';
import { fmt } from '../../../utils/format';
import { FastPressable } from '../../../ui/components/FastPressable';
import { useLiveSymbolQuotes } from '../../../query/websocket';
import {
  buildTradeAccountSummary,
  resolveRenderableTradeAccountSummary,
  resolveTradeFloatingPnl,
} from '../accountSummary';
import type { ThemeColors } from '../../../ui/theme/glass';
import type { TradeScreenStyles } from './styles';
import type { AccountSummary as ApiAccountSummary } from '../../../api/account';

const EMPTY_TRADE_LIVE_ACCOUNT = Object.freeze({
  balance: 0,
  floating: 0,
  equity: 0,
  margin: 0,
  margin_free: 0,
  margin_level: 0,
});

function SummaryMetricRow({
  label,
  currency,
  value,
  s,
  T,
}: {
  label: string;
  currency?: string;
  value: string;
  s: TradeScreenStyles;
  T: ThemeColors;
}) {
  return (
    <View style={s.summaryMetricRow}>
      <Text style={[s.summaryMetricLabel, { color: T.textMuted }]}>
        {label}
        {currency ? <Text style={[s.summaryMetricCurrency, { color: T.textFaint }]}> ({currency})</Text> : null}
      </Text>
      <View style={s.summaryMetricLeader} />
      <Text style={[s.summaryMetricValue, { color: T.text }]}>
        {value}
      </Text>
    </View>
  );
}

const LiveUnrealizedPnLHeader = React.memo(({ positions, account, s, T, isDark, totalVolume, onBulkPress }: any) => {
  const { t } = useTranslation();
  const safeBalance = Number.isFinite(account.balance) ? account.balance : 0;
  const safeFloating = Number.isFinite(account.floating) ? account.floating : 0;
  const safeEquity = Number.isFinite(account.equity) ? account.equity : 0;
  const safeMargin = Number.isFinite(account.margin) ? account.margin : 0;
  const safeFreeMargin = Number.isFinite(account.freeMargin) ? account.freeMargin : 0;
  const safeMarginLevel = Number.isFinite(account.marginLevel) ? account.marginLevel : 0;
  const tradeSummaryDetailsVisible = useUserPreferences((state) => state.tradeSummaryDetailsVisible);
  const setTradeSummaryDetailsVisible = useUserPreferences((state) => state.setTradeSummaryDetailsVisible);
  const accountCurrency = account.currency || 'USD';

  const totalSwap = useMemo(() => {
    return positions.reduce((sum: number, pos: any) => sum + (Number.isFinite(pos.swap) ? pos.swap : 0), 0);
  }, [positions]);

  const toggleTradeSummaryDetails = useCallback(() => {
    setTradeSummaryDetailsVisible(!tradeSummaryDetailsVisible);
  }, [setTradeSummaryDetailsVisible, tradeSummaryDetailsVisible]);

  return (
    <>
      <View style={[s.summaryBlock, { borderLeftWidth: 1, borderLeftColor: isDark ? 'rgba(255,255,255,0.06)' : T.border }]}>
        <FastPressable
          onPress={toggleTradeSummaryDetails}
          latencyLabel="trade.summary.toggle"
          accessibilityRole="button"
          accessibilityLabel="Toggle trade summary details"
          accessibilityState={{ expanded: tradeSummaryDetailsVisible }}
          style={[
            s.summaryTop,
            tradeSummaryDetailsVisible && {
              marginBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
            },
          ]}
        >
          {/* The Hero: Unrealized P/L */}
          <View style={s.summaryHeadlineRow}>
            <Text style={[s.summaryHeadlineLabel, { color: T.textSub }]}>
              {t('Floating Profit/Loss')}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[s.summaryHeadlineValue, { color: safeFloating >= 0 ? T.up : T.down }]}>
              {fmt.pnlPrecise(safeFloating)} {accountCurrency}
            </Text>
          </View>
        </FastPressable>
        {tradeSummaryDetailsVisible ? (
          <View style={s.summaryMetrics}>
            {/* Keep Floating P/L as the collapsed headline; equity belongs in the expanded account breakdown. */}
            <SummaryMetricRow label={t('Balance')} currency={accountCurrency} value={fmt.decimal(safeBalance)} s={s} T={T} />
            <SummaryMetricRow label={t('Equity')} value={fmt.decimal(safeEquity)} s={s} T={T} />
            <SummaryMetricRow label={t('Margin')} value={fmt.decimal(safeMargin)} s={s} T={T} />
            <SummaryMetricRow label={t('Free Margin')} value={fmt.decimal(safeFreeMargin)} s={s} T={T} />
            <SummaryMetricRow label={t('Margin Level')} value={`${fmt.decimal(safeMarginLevel)}%`} s={s} T={T} />
            <SummaryMetricRow label={t('Swap')} value={fmt.pnl(totalSwap)} s={s} T={T} />

            {account.credit > 0 ? (
              <SummaryMetricRow
                label={t('Credit')}
                value={fmt.decimal(Number.isFinite(account.credit) ? account.credit : 0)}
                s={s}
                T={T}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[s.positionsHeader, { borderBottomColor: T.border }]}>
        <View style={s.positionsHeaderLeft}>
          <View style={[s.positionsAccentBar, { backgroundColor: T.accent }]} />
          <View>
            <View style={s.positionsTitleRow}>
              <Text style={[s.positionsTitle, { color: T.text }]}>{t('Positions')}</Text>
            </View>
            <Text style={[s.positionsMeta, { color: T.textMuted }]}>
              {positions.length} {t('open')} • {(totalVolume || 0).toFixed(2)} {t('lots')}
            </Text>
          </View>
        </View>
        <FastPressable
          latencyLabel="trade.bulk.open"
          onPress={onBulkPress}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          style={({ pressed }) => [s.bulkButton, { borderColor: T.border, backgroundColor: T.glass1 }, pressed && { backgroundColor: T.glass3 }]}
        >
          <Text style={[s.bulkButtonText, { color: T.textMuted }]}>{t('Bulk')}</Text>
        </FastPressable>
      </View>
    </>
  );
});

/**
 * Live account summary shared by the Trade summary block and the Trade
 * menubar floating-P/L readout. Subscriptions stay gated by `active` so a
 * retained offscreen Trade tab keeps its last values without observing the
 * high-frequency account stores.
 */
export const useTradeLiveAccountSummary = ({
  positions,
  hydratedLogin,
  resolvedLogin,
  active,
  restAccountSummary,
  quoteCommitIntervalMs = 0,
}: {
  positions: PositionItem[];
  hydratedLogin: string | null;
  resolvedLogin: number | undefined;
  active: boolean;
  restAccountSummary?: ApiAccountSummary;
  /** Live-quote commit throttle; the always-mounted tab-bar badge slows this down. */
  quoteCommitIntervalMs?: number;
}) => {
  // The Trade tab is retained offscreen. Keep its last rendered account values,
  // but stop observing high-frequency account stores while another tab owns the
  // screen. Those hidden summary renders were saturating the JS thread and could
  // delay the real Chart/Trade navigation callback for minutes.
  const selectedTradingAccount = useTradingState((state: any) => (
    active ? state.account : null
  ));
  const restTradingAccount = useMemo(() => restAccountSummary ? ({
    balance: restAccountSummary.balance,
    credit: restAccountSummary.credit,
    floating: restAccountSummary.profit,
    equity: restAccountSummary.equity,
    margin: restAccountSummary.margin,
    freeMargin: restAccountSummary.freeMargin,
    marginLevel: restAccountSummary.marginLevel,
    currency: restAccountSummary.currency,
  }) : null, [restAccountSummary]);
  const selectedFallbackAccount = active
    ? restTradingAccount ?? selectedTradingAccount
    : null;
  const retainedTradingAccountRef = React.useRef(selectedFallbackAccount);
  if (active) {
    retainedTradingAccountRef.current = selectedFallbackAccount;
  }
  const tradingAccount = active
    ? selectedFallbackAccount
    : retainedTradingAccountRef.current;

  const selectedLiveAcc = useLiveAccountState(
    useShallow((state) => active ? ({
      balance: state.balance,
      floating: state.floating,
      equity: state.equity,
      margin: state.margin,
      margin_free: state.margin_free,
      margin_level: state.margin_level,
      metricFlags: state.metricFlags,
    }) : null),
  );
  const retainedLiveAccRef = React.useRef(selectedLiveAcc);
  if (active && selectedLiveAcc) {
    retainedLiveAccRef.current = selectedLiveAcc;
  }
  const liveAcc = selectedLiveAcc
    ?? retainedLiveAccRef.current
    ?? EMPTY_TRADE_LIVE_ACCOUNT;
  const liveQuoteSymbols = useMemo(
    () => Array.from(new Set(positions.map((position) => position.symbol))),
    [positions],
  );
  const liveQuotes = useLiveSymbolQuotes(liveQuoteSymbols, active, quoteCommitIntervalMs);
  const account = useMemo(() => {
    const summary = buildTradeAccountSummary(liveAcc, tradingAccount);
    const floating = resolveTradeFloatingPnl(summary.floating, positions, hydratedLogin, resolvedLogin, liveQuotes);
    return resolveRenderableTradeAccountSummary(summary, floating);
  }, [hydratedLogin, liveAcc, liveQuotes, positions, resolvedLogin, tradingAccount]);

  return account;
};

export const TradeSummaryHeader = React.memo(({
  positions,
  hydratedLogin,
  resolvedLogin,
  s,
  T,
  isDark,
  totalVolume,
  onBulkPress,
  active,
  restAccountSummary,
}: {
  positions: PositionItem[];
  hydratedLogin: string | null;
  resolvedLogin: number | undefined;
  s: TradeScreenStyles;
  T: ThemeColors;
  isDark: boolean;
  totalVolume: number;
  onBulkPress: () => void;
  active: boolean;
  restAccountSummary?: ApiAccountSummary;
}) => {
  const account = useTradeLiveAccountSummary({
    positions,
    hydratedLogin,
    resolvedLogin,
    active,
    restAccountSummary,
  });

  return (
    <LiveUnrealizedPnLHeader
      positions={positions}
      account={account}
      s={s}
      T={T}
      isDark={isDark}
      totalVolume={totalVolume}
      onBulkPress={onBulkPress}
    />
  );
});
