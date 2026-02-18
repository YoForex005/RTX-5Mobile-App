import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { quotes } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { colors, spacing } from '../../theme';
import { fmt } from '../../utils/format';

type InstrumentMeta = {
  name: string;
  category: string;
  sector: string;
  industry: string;
  digits: number;
  contractSize: string;
  spreadMode: string;
  stopsLevel: string;
  marginCurrency: string;
  profitCurrency: string;
  calculation: string;
  chartMode: string;
  trade: 'Enabled' | 'Disabled';
  sessions: Array<[string, string]>;
};

const META_BY_SYMBOL: Record<string, InstrumentMeta> = {
  USDARS: {
    name: 'US Dollar vs Argentine Peso',
    category: 'Exotic',
    sector: 'Currency',
    industry: 'Undefined',
    digits: 4,
    contractSize: '100 000 USD',
    spreadMode: 'Floating',
    stopsLevel: '0',
    marginCurrency: 'USD',
    profitCurrency: 'ARS',
    calculation: 'Forex',
    chartMode: 'By bid price',
    trade: 'Disabled',
    sessions: [
      ['Sunday', '23:05-24:00'],
      ['Monday', '00:00-24:00'],
      ['Tuesday', '00:00-24:00'],
      ['Wednesday', '00:00-24:00'],
      ['Thursday', '00:00-24:00'],
      ['Friday', '00:00-22:59'],
    ],
  },
};

const DEFAULT_SESSIONS: Array<[string, string]> = [
  ['Sunday', '23:05-24:00'],
  ['Monday', '00:00-24:00'],
  ['Tuesday', '00:00-24:00'],
  ['Wednesday', '00:00-24:00'],
  ['Thursday', '00:00-24:00'],
  ['Friday', '00:00-22:59'],
];

const NAME_BY_SYMBOL: Record<string, string> = {
  MBTUSD: 'Micro Bitcoin vs US Dollar',
  MBTUSDm: 'Micro Bitcoin vs US Dollar',
  USDAED: 'US Dollar vs UAE Dirham',
  USDAMD: 'US Dollar vs Armenian Dram',
  USDARS: 'US Dollar vs Argentine Peso',
  USDAZN: 'US Dollar vs Azerbaijani Manat',
  USDBDT: 'US Dollar vs Bangladeshi Taka',
  USDBGN: 'US Dollar vs Bulgarian Lev',
  USDBHD: 'US Dollar vs Bahraini Dinar',
  USDBND: 'US Dollar vs Brunei Dollar',
  XAUUSDm: 'Gold vs US Dollar',
  BTCUSDm: 'Bitcoin vs US Dollar',
};

function fallbackMeta(symbol: string): InstrumentMeta {
  return {
    name: NAME_BY_SYMBOL[symbol] ?? symbol,
    category: 'Major',
    sector: 'Currency',
    industry: 'Undefined',
    digits: 4,
    contractSize: '100 000',
    spreadMode: 'Floating',
    stopsLevel: '0',
    marginCurrency: symbol.slice(0, 3) || 'USD',
    profitCurrency: symbol.slice(3, 6) || 'USD',
    calculation: 'Forex',
    chartMode: 'By bid price',
    trade: 'Enabled',
    sessions: DEFAULT_SESSIONS,
  };
}

export function SymbolDetailsScreen() {
  const { symbol = 'USDARS' } = useLocalSearchParams<{ symbol?: string }>();
  const { setChartSymbol } = useUserPreferences();
  const [alertEnabled, setAlertEnabled] = useState(false);

  const quote = useMemo(
    () => quotes.find((item) => item.symbol === symbol) ?? quotes[0],
    [symbol]
  );
  const meta = useMemo(
    () => META_BY_SYMBOL[symbol] ?? fallbackMeta(symbol),
    [symbol]
  );

  const range = quote.high - quote.low;
  const mid = (quote.high + quote.low) / 2;
  const volatility = mid > 0 ? (range / mid) * 100 : 0;
  const changeColor = quote.changePct >= 0 ? styles.positive : styles.negative;

  return (
    <Screen scroll>
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.symbol}>{symbol}</Text>
            <Text style={styles.subtitle}>{meta.name}</Text>
          </View>
          <View style={[styles.tradeBadge, meta.trade === 'Enabled' ? styles.tradeEnabled : styles.tradeDisabled]}>
            <Text style={[styles.tradeBadgeText, meta.trade === 'Enabled' ? styles.tradeEnabledText : styles.tradeDisabledText]}>
              {meta.trade}
            </Text>
          </View>
        </View>

        <View style={styles.quoteRow}>
          <View style={styles.quoteCell}>
            <Text style={styles.quoteLabel}>Bid</Text>
            <Text style={[styles.quoteValue, styles.bid]}>{fmt.price(quote.bid, meta.digits)}</Text>
          </View>
          <View style={styles.quoteDivider} />
          <View style={styles.quoteCell}>
            <Text style={styles.quoteLabel}>Ask</Text>
            <Text style={[styles.quoteValue, styles.ask]}>{fmt.price(quote.ask, meta.digits)}</Text>
          </View>
        </View>

        <View style={styles.metricStrip}>
          <MetricChip label='Day %' value={fmt.pct(quote.changePct)} valueStyle={changeColor} />
          <MetricChip label='Spread' value={String(quote.spread)} />
          <MetricChip label='Volatility' value={fmt.pct(volatility)} />
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={() => router.push({ pathname: '/trade/order-ticket', params: { symbol } })}
        >
          <Text style={styles.actionButtonText}>Trade</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={() => {
            setChartSymbol(symbol);
            router.push('/(tabs)/chart');
          }}
        >
          <Text style={styles.actionButtonText}>Chart</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={() => setAlertEnabled((v) => !v)}
        >
          <Text style={styles.actionButtonText}>{alertEnabled ? 'Alert On' : 'Add Alert'}</Text>
        </Pressable>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Trading Conditions</Text>
        <DetailRow label='Contract size' value={meta.contractSize} />
        <DetailRow label='Spread mode' value={meta.spreadMode} />
        <DetailRow label='Stops level' value={meta.stopsLevel} />
        <DetailRow label='Calculation' value={meta.calculation} />
        <DetailRow label='Chart mode' value={meta.chartMode} />
        <DetailRow label='Digits' value={String(meta.digits)} last />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Instrument Profile</Text>
        <DetailRow label='Category' value={meta.category} />
        <DetailRow label='Sector' value={meta.sector} />
        <DetailRow label='Industry' value={meta.industry} />
        <DetailRow label='Margin currency' value={meta.marginCurrency} />
        <DetailRow label='Profit currency' value={meta.profitCurrency} last />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Sessions</Text>
        {meta.sessions.map(([day, hours], index) => (
          <DetailRow key={day} label={day} value={hours} last={index === meta.sessions.length - 1} />
        ))}
      </View>
    </Screen>
  );
}

function MetricChip({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.metricChip}>
      <Text style={styles.metricChipLabel}>{label}</Text>
      <Text style={[styles.metricChipValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.key}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#24334b',
    backgroundColor: '#0b1526',
    overflow: 'hidden',
  },
  heroTop: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  symbol: {
    color: '#edf2fb',
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 36,
  },
  subtitle: {
    color: '#8ea0bc',
    marginTop: 4,
    fontSize: 12,
  },
  tradeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  tradeEnabled: {
    borderColor: '#1f5f4d',
    backgroundColor: '#103229',
  },
  tradeDisabled: {
    borderColor: '#524527',
    backgroundColor: '#2d2614',
  },
  tradeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  tradeEnabledText: {
    color: '#72dcb4',
  },
  tradeDisabledText: {
    color: '#e6ca6b',
  },
  quoteRow: {
    borderTopWidth: 1,
    borderTopColor: '#203049',
    borderBottomWidth: 1,
    borderBottomColor: '#203049',
    flexDirection: 'row',
  },
  quoteCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  quoteDivider: {
    width: 1,
    backgroundColor: '#203049',
  },
  quoteLabel: {
    color: '#8093b2',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  quoteValue: {
    marginTop: 2,
    fontSize: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bid: {
    color: colors.negative,
  },
  ask: {
    color: colors.positive,
  },
  metricStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  metricChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#263751',
    backgroundColor: '#111d30',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  metricChipLabel: {
    color: '#8ba0be',
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  metricChipValue: {
    marginTop: 2,
    color: '#dfe7f5',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  positive: {
    color: colors.positive,
  },
  negative: {
    color: colors.negative,
  },
  actionsRow: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#304561',
    backgroundColor: '#13223a',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  actionButtonPressed: {
    opacity: 0.86,
  },
  actionButtonText: {
    color: '#a8cbff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionCard: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2c42',
    backgroundColor: '#0b121f',
    overflow: 'hidden',
  },
  sectionTitle: {
    color: '#e6ecf8',
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomColor: '#18253a',
    borderBottomWidth: 1,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  key: {
    color: '#d7dfed',
    fontSize: 14,
  },
  value: {
    color: '#9aacc4',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});
