import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
} from 'react-native';
import { ActionSheet } from '../../components/ActionSheet';
import { Screen } from '../../components/Screen';
import { quotes } from '../../mock/tradingData';
import { useUserPreferences } from '../../state/userPreferences';
import { colors, spacing } from '../../theme';
import { fmt } from '../../utils/format';

export function QuotesScreen() {
  const [search, setSearch] = useState('');
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const {
    quoteSymbols,
    quoteViewMode,
    setQuoteViewMode,
    addQuoteSymbol,
    removeQuoteSymbol,
    setChartSymbol,
  } = useUserPreferences();

  const filtered = useMemo(
    () =>
      quotes
        .filter((q) => quoteSymbols.includes(q.symbol))
        .filter((q) => q.symbol.toLowerCase().includes(search.trim().toLowerCase())),
    [quoteSymbols, search]
  );
  const nextSymbol = useMemo(
    () => quotes.find((q) => !quoteSymbols.includes(q.symbol)),
    [quoteSymbols]
  );
  const gainers = useMemo(
    () => filtered.filter((item) => item.changePct > 0).length,
    [filtered]
  );
  const losers = useMemo(
    () => filtered.filter((item) => item.changePct < 0).length,
    [filtered]
  );

  const mode = quoteViewMode;
  const cycleMode = () => {
    if (mode === 'list') {
      setQuoteViewMode('table');
      return;
    }
    if (mode === 'table') {
      setQuoteViewMode('edit');
      return;
    }
    setQuoteViewMode('list');
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={styles.iconShell}>
          <Ionicons
            name={mode === 'table' ? 'grid-outline' : mode === 'edit' ? 'reorder-three-outline' : 'menu-outline'}
            size={18}
            color='#9eb0cd'
          />
        </View>
        <Text style={styles.title}>Quotes</Text>
        <Pressable style={styles.iconShell} onPress={cycleMode}>
          <Ionicons
            name={mode === 'edit' ? 'checkmark' : 'create-outline'}
            size={17}
            color='#9eb0cd'
          />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name='search' size={16} color='#72839d' />
        <TextInput
          style={styles.search}
          placeholder='enter symbol for search'
          placeholderTextColor='#717784'
          value={search}
          onChangeText={setSearch}
          autoCapitalize='characters'
        />
      </View>

      <View style={styles.statsRow}>
        <StatChip label='Symbols' value={String(filtered.length)} />
        <StatChip label='Up' value={String(gainers)} positive />
        <StatChip label='Down' value={String(losers)} negative />
      </View>

      {mode === 'table' ? (
        <View style={styles.tableHeader}>
          <Text style={[styles.col, styles.symbolCol]}>Symbol</Text>
          <Text style={styles.col}>Bid</Text>
          <Text style={styles.col}>Ask</Text>
          <Text style={styles.col}>Day %</Text>
          <Text style={styles.col}>Spread</Text>
        </View>
      ) : null}

      {mode === 'edit' ? (
        <Pressable
          style={[styles.addButton, !nextSymbol && styles.addButtonDisabled]}
          disabled={!nextSymbol}
          onPress={() => {
            if (nextSymbol) {
              addQuoteSymbol(nextSymbol.symbol);
            }
          }}
        >
          <Text style={styles.addButtonText}>
            {nextSymbol ? `Add ${nextSymbol.symbol}` : 'All symbols already added'}
          </Text>
        </Pressable>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.symbol}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.emptyText}>No symbols match your search.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => setActiveSymbol(item.symbol)}
            delayLongPress={150}
            onPress={() => {
              setChartSymbol(item.symbol);
              router.push({ pathname: '/quotes/details', params: { symbol: item.symbol } });
            }}
            style={mode === 'table' ? styles.tableRow : styles.quoteRow}
          >
            {mode === 'table' ? (
              <>
                <Text style={[styles.tableSymbol, styles.symbolCol]}>{item.symbol}</Text>
                <Text style={[styles.tablePrice, item.changePct >= 0 ? styles.trendPositive : styles.trendNegative]}>{fmt.price(item.bid, 4)}</Text>
                <Text style={[styles.tablePrice, item.changePct >= 0 ? styles.trendPositive : styles.trendNegative]}>{fmt.price(item.ask, 4)}</Text>
                <Text style={[styles.tablePrice, item.changePct >= 0 ? styles.blue : styles.red]}>{fmt.pct(item.changePct)}</Text>
                <Text style={styles.tableMeta}>{item.spread}</Text>
              </>
            ) : (
              <>
                <View style={styles.quoteLeft}>
                  <View style={styles.symbolRow}>
                    <Text style={styles.symbol}>{item.symbol}</Text>
                    <View style={[styles.changePill, item.changePct >= 0 ? styles.pillUp : styles.pillDown]}>
                      <Text style={[styles.change, item.changePct >= 0 ? styles.changeUp : styles.changeDown]}>
                        {fmt.pct(item.changePct)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>L {fmt.price(item.low, 4)}   H {fmt.price(item.high, 4)}</Text>
                  <Text style={styles.metaSecondary}>Spread {item.spread}</Text>
                </View>
                <View style={styles.quoteRight}>
                  <PriceCell
                    label='Bid'
                    value={fmt.price(item.bid, 4)}
                    positive={item.changePct >= 0}
                  />
                  <PriceCell
                    label='Ask'
                    value={fmt.price(item.ask, 4)}
                    positive={item.changePct >= 0}
                  />
                </View>
              </>
            )}
          </Pressable>
        )}
      />

      <ActionSheet
        visible={Boolean(activeSymbol)}
        title={activeSymbol ? `${activeSymbol}: actions` : ''}
        onClose={() => setActiveSymbol(null)}
        actions={[
          {
            label: 'Chart',
            onPress: () => {
              if (activeSymbol) {
                setChartSymbol(activeSymbol);
              }
              router.push('/(tabs)/chart');
            },
          },
          { label: 'Details', onPress: () => router.push({ pathname: '/quotes/details', params: { symbol: activeSymbol || 'BTCUSDm' } }) },
          { label: 'Statistics' },
          {
            label: 'Delete',
            danger: true,
            onPress: () => {
              if (activeSymbol) {
                removeQuoteSymbol(activeSymbol);
              }
            },
          },
        ]}
      />
    </Screen>
  );
}

function StatChip({
  label,
  value,
  positive = false,
  negative = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, positive && styles.blue, negative && styles.red]}>{value}</Text>
    </View>
  );
}

function PriceCell({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <View style={styles.priceCell}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={[styles.price, positive ? styles.trendPositive : styles.trendNegative]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#edf3fc',
    fontSize: 34,
    fontWeight: '700',
  },
  iconShell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#25364f',
    backgroundColor: '#101a2c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: '#101a2c',
    borderWidth: 1,
    borderColor: '#25364f',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  search: {
    flex: 1,
    color: '#f0f5fc',
    fontSize: 15,
  },
  statsRow: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22324a',
    backgroundColor: '#0f1829',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    color: '#7f92af',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  statValue: {
    marginTop: 1,
    color: '#dfebfb',
    fontSize: 14,
    fontWeight: '700',
  },
  addButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: '#0f1a2b',
    borderWidth: 1,
    borderColor: '#25364f',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.45,
  },
  addButtonText: {
    color: '#9fc2f9',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  quoteRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#1f2e44',
    backgroundColor: '#0b1422',
    gap: spacing.sm,
  },
  quoteLeft: {
    flex: 1,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quoteRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  symbol: {
    color: '#f1f6fd',
    fontSize: 17,
    fontWeight: '700',
  },
  changePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  pillUp: {
    borderColor: '#1f5d9c',
    backgroundColor: '#13263f',
  },
  pillDown: {
    borderColor: '#6a302d',
    backgroundColor: '#351816',
  },
  change: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  changeUp: {
    color: '#71b7ff',
  },
  changeDown: {
    color: '#ff7c73',
  },
  meta: {
    marginTop: 4,
    color: '#9aabc3',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  metaSecondary: {
    marginTop: 2,
    color: '#7d8fa9',
    fontSize: 11,
  },
  priceCell: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    color: '#7d90ad',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  price: {
    fontSize: 26,
    fontWeight: '700',
    minWidth: 124,
    textAlign: 'right',
    lineHeight: 27,
    fontVariant: ['tabular-nums'],
  },
  trendPositive: {
    color: colors.positive,
  },
  trendNegative: {
    color: colors.negative,
  },
  tableHeader: {
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#11141d',
    paddingBottom: spacing.sm,
  },
  col: {
    color: '#8f97a6',
    fontSize: 12,
    flex: 1,
  },
  symbolCol: {
    flex: 1.2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2435',
    marginHorizontal: spacing.md,
    backgroundColor: '#0b1422',
  },
  tableSymbol: {
    color: '#f2f4f8',
    fontWeight: '700',
    fontSize: 15,
  },
  tablePrice: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
  },
  tableMeta: {
    flex: 1,
    textAlign: 'right',
    color: '#aab1be',
    fontSize: 12,
  },
  blue: {
    color: colors.positive,
  },
  red: {
    color: colors.negative,
  },
  emptyText: {
    marginTop: spacing.lg,
    color: '#7f8ea6',
    textAlign: 'center',
    fontSize: 13,
  },
});
