/**
 * Summary header for the Trade screen.
 *
 * Shows live floating P/L, balance/equity/margin breakdown, and a Bulk-action
 * launcher. Memoized so it does not re-render on every position-row tick.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { useShallow } from 'zustand/shallow';
import { useTranslation } from '../../../i18n/useTranslation';
import { PositionItem } from '../../../dev/mock/tradingData';
import { useUserPreferences } from '../../../state/userPreferences';
import { useLiveAccountState } from '../../../state/liveAccountState';
import { useTradingState } from '../../../state/tradingState';
import { fmt } from '../../../utils/format';
import { useMarketData } from '../../../query/websocket';
import { FastPressable } from '../../../ui/components/FastPressable';
import {
  buildTradeAccountSummary,
  resolveRenderableTradeAccountSummary,
  resolveTradeFloatingPnl,
} from '../accountSummary';
import type { ThemeColors } from '../../../ui/theme/glass';
import type { TradeScreenStyles } from './styles';

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

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.82, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: T.textSub, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              {t('Floating P/L')}
            </Text>
            <Animated.Text
              style={{
                fontSize: 24,
                fontWeight: '700',
                color: safeFloating >= 0 ? T.up : T.down,
                opacity: pulseAnim,
                letterSpacing: -0.2,
                fontVariant: ['tabular-nums'],
                textAlign: 'right',
              }}>
              {fmt.pnlPrecise(safeFloating)} {account.currency || 'USD'}
            </Animated.Text>
          </View>
        </FastPressable>
        {tradeSummaryDetailsVisible ? (
          <View style={s.summaryMetrics}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Balance')} <Text style={{ fontSize: 10, color: T.textFaint }}>({account.currency || 'USD'})</Text>
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeBalance)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Equity')}
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeEquity)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Margin')}
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeMargin)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Free Margin')}
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeFreeMargin)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('Margin Level')}
              </Text>
              <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                  ....................................................................................................
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                {fmt.decimal(safeMarginLevel)}%
              </Text>
            </View>

            {account.credit > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('Credit')}
                </Text>
                <View style={{ flex: 1, marginHorizontal: 8, overflow: 'hidden', height: 16, justifyContent: 'flex-end', opacity: 0.35, transform: [{ translateY: -3 }] }}>
                  <Text style={{ color: T.text, fontSize: 13, letterSpacing: 2, fontWeight: '900' }} numberOfLines={1} ellipsizeMode="clip">
                    ....................................................................................................
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: T.text, opacity: 0.85, fontWeight: '700', letterSpacing: -0.2, fontVariant: ['tabular-nums'] }}>
                  {fmt.decimal(Number.isFinite(account.credit) ? account.credit : 0)}
                </Text>
              </View>
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
          style={({ pressed }) => [s.bulkButton, { borderColor: T.border, backgroundColor: T.glass1 }, pressed && { backgroundColor: T.glass3 }]}
        >
          <Text style={[s.bulkButtonText, { color: T.textMuted }]}>{t('Bulk')}</Text>
        </FastPressable>
      </View>
    </>
  );
});

export const TradeSummaryHeader = React.memo(({
  positions,
  hydratedLogin,
  resolvedLogin,
  s,
  T,
  isDark,
  totalVolume,
  onBulkPress,
}: {
  positions: PositionItem[];
  hydratedLogin: string | null;
  resolvedLogin: number | undefined;
  s: TradeScreenStyles;
  T: ThemeColors;
  isDark: boolean;
  totalVolume: number;
  onBulkPress: () => void;
}) => {
  const tradingAccount = useTradingState((state: any) => state.account);
  const liveAcc = useLiveAccountState(
    useShallow((state) => ({
      balance: state.balance,
      floating: state.floating,
      equity: state.equity,
      margin: state.margin,
      margin_free: state.margin_free,
      margin_level: state.margin_level,
    })),
  );
  const liveQuoteSymbols = useMemo(
    () => Array.from(new Set(positions.map((position) => position.symbol))),
    [positions],
  );
  const liveQuotes = useMarketData(liveQuoteSymbols);
  const account = useMemo(() => {
    const summary = buildTradeAccountSummary(liveAcc, tradingAccount);
    const floating = resolveTradeFloatingPnl(summary.floating, positions, hydratedLogin, resolvedLogin, liveQuotes);
    return resolveRenderableTradeAccountSummary(summary, floating);
  }, [hydratedLogin, liveAcc, liveQuotes, positions, resolvedLogin, tradingAccount]);

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
