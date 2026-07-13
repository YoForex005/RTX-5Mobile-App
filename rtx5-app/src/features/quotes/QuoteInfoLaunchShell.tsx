import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeSymbol } from '../../domain/symbols';
import { useTranslation } from '../../i18n/useTranslation';
import { useUserPreferences } from '../../state/userPreferences';
import { FastPressable } from '../../ui/components/FastPressable';
import { useTheme, type ThemeColors } from '../../ui/theme/useTheme';
import type { QuoteInfoLaunchDestination } from './quoteInfoLaunchController';
import { getMeta } from './SymbolDetailsScreen/instrumentMeta';
import { makeSymbolDetailsStyles } from './SymbolDetailsScreen/styles';

type QuoteInfoLaunchShellProps = Readonly<{
  backLatencyLabel?: string;
  destination: QuoteInfoLaunchDestination;
  onBack: () => void;
  symbol: string;
}>;

/**
 * Query-free first frame for the quote Properties and Market Statistics
 * routes. Both variants stay pre-mounted in QuoteInfoLaunchHost so the chosen
 * layer can be revealed on the UI runtime in the option's touch frame.
 */
export const QuoteInfoLaunchShell = memo(function QuoteInfoLaunchShell({
  backLatencyLabel = 'quoteInfo.shell.back',
  destination,
  onBack,
  symbol,
}: QuoteInfoLaunchShellProps) {
  const normalizedSymbol = normalizeSymbol(symbol || 'EURUSD');
  const displaySymbol = normalizedSymbol.replace(/\//g, '');
  const insets = useSafeAreaInsets();
  const themeMode = useUserPreferences((state) => state.themeMode);
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = themeMode === 'dark';
  const styles = useMemo(
    () => makeStyles(T, isDark),
    [T, isDark],
  );
  const isProperties = destination === 'properties';
  const title = isProperties ? t('Quote Details') : t('Market Statistics');
  const instrumentName = useMemo(
    () => getMeta(normalizedSymbol).name,
    [normalizedSymbol],
  );

  return (
    <View
      style={styles.root}
      testID={'quote-info-launch-shell-' + destination}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <FastPressable
          onPress={onBack}
          activateOnPressIn
          activateOnTouchStart
          latencyLabel={backLatencyLabel}
          latencyBudgetMs={50}
          unstable_pressDelay={0}
          hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isProperties ? (
        <PropertiesLaunchViewport
          displaySymbol={displaySymbol}
          instrumentName={instrumentName}
          isDark={isDark}
          T={T}
        />
      ) : (
        <View style={styles.body}>
          <View style={styles.hero}>
            <View style={styles.instrumentRow}>
              <View style={styles.symbolMark}>
                <Ionicons
                  name="stats-chart-outline"
                  size={20}
                  color={T.trading.buy.primary}
                />
              </View>
              <View style={styles.instrumentCopy}>
                <Text style={styles.symbol}>{displaySymbol}</Text>
                <Text style={styles.instrumentName}>{t('Market instrument')}</Text>
              </View>
              <View style={styles.marketChip}>
                <View style={[styles.marketDot, { backgroundColor: T.up }]} />
                <Text style={[styles.marketChipText, { color: T.up }]}>{t('Open')}</Text>
              </View>
            </View>

            <View style={styles.quoteBand}>
              <View style={styles.quoteSide}>
                <Text style={[styles.quoteLabel, { color: T.down }]}>{t('BID')}</Text>
                <Text style={styles.quoteValue}>--</Text>
              </View>
              <View style={styles.quoteDivider} />
              <View style={styles.quoteSide}>
                <Text style={[styles.quoteLabel, { color: T.trading.buy.primary }]}>{t('ASK')}</Text>
                <Text style={styles.quoteValue}>--</Text>
              </View>
            </View>
          </View>

          <View style={styles.changeStrip}>
            <LaunchMetric label={t('Change')} value="--" styles={styles} />
            <LaunchMetric label={t('Points')} value="--" styles={styles} />
            <LaunchMetric label={t('Spread')} value="--" styles={styles} />
          </View>
          <LaunchSection title={t('Session Statistics')} styles={styles}>
            <LaunchRow label={t('Bid high')} value="--" styles={styles} />
            <LaunchRow label={t('Bid low')} value="--" styles={styles} />
            <LaunchRow label={t('Ask high')} value="--" styles={styles} />
            <LaunchRow label={t('Ask low')} value="--" styles={styles} />
            <LaunchRow label={t('Open price')} value="--" styles={styles} last />
          </LaunchSection>
        </View>
      )}
    </View>
  );
});

function PropertiesLaunchViewport({
  displaySymbol,
  instrumentName,
  isDark,
  T,
}: {
  displaySymbol: string;
  instrumentName: string;
  isDark: boolean;
  T: ThemeColors;
}) {
  const { t } = useTranslation();
  const s = useMemo(() => makeSymbolDetailsStyles(T, isDark), [T, isDark]);
  const metrics = [
    { icon: 'analytics-outline', label: t('Mid').toUpperCase() },
    { icon: 'time-outline', label: t('Open').toUpperCase() },
    { icon: 'calendar-outline', label: t('PREV') },
    { icon: 'bar-chart-outline', label: t('Vol').toUpperCase() },
  ] as const;

  return (
    <ScrollView
      scrollEnabled={false}
      pointerEvents="none"
      keyboardShouldPersistTaps="always"
      canCancelContentTouches={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 60, paddingTop: 6 }}
    >
      <View style={s.glassHero.container}>
        {isDark ? <View style={s.glassHero.borderHighlight} /> : null}

        <View style={[s.glassHero.header, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.hero.sym}>{displaySymbol}</Text>
            <Text style={s.hero.name}>{instrumentName}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6, marginRight: -8 }}>
            <View style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
              <Ionicons name="notifications-outline" size={22} color={T.textSub} />
            </View>
            <View style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
              <Ionicons name="share-outline" size={22} color={T.textSub} />
            </View>
          </View>
        </View>

        <View style={s.glassHero.priceRow}>
          <Text style={[s.glassHero.bigPrice, { color: T.text }]}>--.-----</Text>
          <View style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
            <View style={s.hero.changePill}>
              <Ionicons name="caret-up" size={14} color={T.textSub} />
              <Text style={[s.hero.changeTxt, { color: T.textSub }]}>--.--%</Text>
            </View>
            <Text style={s.glassHero.ptsTxt}>-- {t('pts today')}</Text>
          </View>
        </View>

        <View style={s.ticker.container}>
          <View style={s.ticker.spreadBadge}>
            <Text style={s.ticker.spreadVal}>--</Text>
            <Text style={s.ticker.spreadLbl}>{t('Spread').toUpperCase()}</Text>
          </View>
          <View style={s.ticker.inner}>
            <View style={s.ticker.side}>
              <View style={s.ticker.sideHeader}>
                <Text style={[s.ticker.sideLabel, { color: T.down }]}>{t('SELL')}</Text>
                <View style={s.ticker.arrowWrap}>
                  <Ionicons name="caret-down" size={10} color={T.down} />
                </View>
              </View>
              <View style={s.ticker.priceWrap}>
                <Text style={s.ticker.priceBase}>--.</Text>
                <Text style={[s.ticker.pipHighlight, { color: T.down }]}>--</Text>
              </View>
            </View>

            <View style={s.ticker.dividerCol}>
              <View style={s.ticker.dividerLine} />
              <View style={s.ticker.pipBadge}>
                <Text style={s.ticker.pipVal}>--</Text>
                <Text style={s.ticker.pipUnit}>{t('PIP')}</Text>
              </View>
            </View>

            <View style={s.ticker.side}>
              <View style={s.ticker.sideHeader}>
                <Text style={[s.ticker.sideLabel, { color: T.up }]}>{t('BUY')}</Text>
                <View style={s.ticker.arrowWrap}>
                  <Ionicons name="caret-up" size={10} color={T.up} />
                </View>
              </View>
              <View style={s.ticker.priceWrap}>
                <Text style={s.ticker.priceBase}>--.</Text>
                <Text style={[s.ticker.pipHighlight, { color: T.up }]}>--</Text>
              </View>
            </View>
          </View>

          <View style={[s.ticker.infoStrip, { justifyContent: 'center' }]}>
            <View style={s.ticker.infoItem}>
              <View style={[s.nav.liveDot, { marginRight: 2 }]} />
              <Text style={[s.ticker.infoTxt, { fontSize: 11, textTransform: 'uppercase' }]}>
                {t('Live Market Data')}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.glassHero.metricsRow}>
          {metrics.map((metric) => (
            <View key={metric.label} style={s.mp.chip}>
              <View style={s.mp.iconRow}>
                <Ionicons name={metric.icon} size={14} color={T.textSub} />
                <Text style={s.mp.lbl}>{metric.label}</Text>
              </View>
              <Text style={s.mp.val}>--</Text>
            </View>
          ))}
        </View>

        <View style={s.glassHero.rangeCard}>
          <View style={s.glassHero.rangeTop}>
            <View>
              <Text style={s.glassHero.rangeLbl}>{t('LOW')}</Text>
              <Text style={s.glassHero.rangeVal}>--</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={s.glassHero.rangeLbl}>{t('Day Range').toUpperCase()}</Text>
              <Text style={s.glassHero.rangeVal}>--.--%</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.glassHero.rangeLbl}>{t('HIGH')}</Text>
              <Text style={s.glassHero.rangeVal}>--</Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 14, paddingTop: 6 }}>
            <View style={s.rangeB.track}>
              <View style={[s.rangeB.fill, { width: '50%', backgroundColor: T.textMuted }]} />
              <View style={[s.rangeB.knob, { left: '50%', borderColor: T.textMuted }]} />
            </View>
          </View>
        </View>

        <View style={s.mom.container}>
          <View style={s.mom.header}>
            <Text style={s.mom.title}>{t('Market Sentiment').toUpperCase()}</Text>
          </View>
          <View style={s.mom.barRow}>
            <Text style={[s.mom.pctText, { color: T.up }]}>--%</Text>
            <View style={s.mom.barTrack}>
              <View style={[s.mom.barFillLeft, { width: '50%', backgroundColor: T.up }]} />
              <View style={[s.mom.barFillRight, { width: '50%', backgroundColor: T.down }]} />
            </View>
            <Text style={[s.mom.pctText, { color: T.down }]}>--%</Text>
          </View>
          <View style={s.mom.labelRow}>
            <Text style={[s.mom.label, { color: T.up }]}>{t('BUYERS')}</Text>
            <Text style={[s.mom.label, { color: T.down }]}>{t('SELLERS')}</Text>
          </View>
        </View>
      </View>

      <View style={s.act.row}>
        <View style={[s.act.btn, s.act.buyBtn, { backgroundColor: '#2563EB' }]}>
          <Ionicons name="flash" size={15} color="#fff" />
          <Text style={s.act.buyTxt}>{t('Trade Now')}</Text>
        </View>
        <View style={[s.act.btn, s.act.chartBtn]}>
          <Ionicons name="stats-chart-outline" size={15} color={T.textSub} />
          <Text style={s.act.chartTxt}>{t('Full Chart')}</Text>
        </View>
      </View>

      <View style={s.sec.card}>
        <View style={s.sec.headerGrad}>
          <View style={s.sec.iconBox}>
            <Ionicons name="reader-outline" size={13} color={T.trading.buy.primary} />
          </View>
          <Text style={s.sec.title}>{t('Contract Specification')}</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-up" size={14} color={T.textMuted} />
        </View>
        <View style={s.rw.row}>
          <Text style={s.rw.key}>{t('Contract Size')}</Text>
          <Text style={s.rw.val}>--</Text>
        </View>
        <View style={[s.rw.row, { borderBottomWidth: 0 }]}>
          <Text style={s.rw.key}>{t('Min Volume')}</Text>
          <Text style={s.rw.val}>--</Text>
        </View>
      </View>
    </ScrollView>
  );
}

type LaunchStyles = ReturnType<typeof makeStyles>;

function LaunchSection({
  children,
  styles,
  title,
}: {
  children: ReactNode;
  styles: LaunchStyles;
  title: string;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function LaunchRow({
  label,
  last = false,
  styles,
  value,
}: {
  label: string;
  last?: boolean;
  styles: LaunchStyles;
  value: string;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function LaunchMetric({
  label,
  styles,
  value,
}: {
  label: string;
  styles: LaunchStyles;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    backButton: {
      alignItems: 'flex-start',
      height: 44,
      justifyContent: 'center',
      width: 42,
    },
    body: {
      paddingBottom: 28,
      paddingHorizontal: 14,
      paddingTop: 12,
    },
    changeStrip: {
      backgroundColor: T.glass1,
      borderColor: T.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 12,
      overflow: 'hidden',
    },
    header: {
      alignItems: 'center',
      backgroundColor: T.bg,
      borderBottomColor: T.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      minHeight: 44,
      paddingHorizontal: 10,
    },
    headerSpacer: {
      width: 42,
    },
    headerTitle: {
      color: T.text,
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    hero: {
      backgroundColor: T.glass1,
      borderColor: T.border,
      borderRadius: 20,
      borderWidth: 1,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.22 : 0.07,
      shadowRadius: 20,
    },
    instrumentCopy: {
      flex: 1,
      marginLeft: 10,
    },
    instrumentName: {
      color: T.textSub,
      fontSize: 12,
      marginTop: 2,
    },
    instrumentRow: {
      alignItems: 'center',
      flexDirection: 'row',
      padding: 14,
    },
    marketChip: {
      alignItems: 'center',
      borderColor: T.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    marketChipText: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    marketDot: {
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    metric: {
      alignItems: 'center',
      borderRightColor: T.border,
      borderRightWidth: StyleSheet.hairlineWidth,
      flex: 1,
      paddingVertical: 12,
    },
    metricLabel: {
      color: T.textSub,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    metricValue: {
      color: T.text,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 4,
    },
    quoteBand: {
      backgroundColor: T.glass2,
      borderTopColor: T.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
    },
    quoteDivider: {
      backgroundColor: T.border,
      width: StyleSheet.hairlineWidth,
    },
    quoteLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.9,
    },
    quoteSide: {
      alignItems: 'center',
      flex: 1,
      paddingVertical: 12,
    },
    quoteValue: {
      color: T.text,
      fontSize: 23,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      marginTop: 4,
    },
    root: {
      backgroundColor: T.bg,
      flex: 1,
    },
    row: {
      alignItems: 'center',
      borderBottomColor: T.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 45,
      paddingHorizontal: 14,
    },
    rowLabel: {
      color: T.textSub,
      fontSize: 13,
      fontWeight: '500',
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowValue: {
      color: T.text,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      fontWeight: '600',
    },
    sectionCard: {
      backgroundColor: T.glass1,
      borderColor: T.border,
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
    },
    sectionTitle: {
      color: T.textSub,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      marginBottom: 7,
      textTransform: 'uppercase',
    },
    sectionWrap: {
      marginTop: 16,
    },
    symbol: {
      color: T.text,
      fontSize: 19,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    symbolMark: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(59,130,246,0.14)' : 'rgba(37,99,235,0.08)',
      borderColor: T.border,
      borderRadius: 10,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
  });
}
