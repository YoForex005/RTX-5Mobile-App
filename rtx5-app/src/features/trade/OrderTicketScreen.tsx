import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { colors, spacing } from '../../theme';
import { fmt } from '../../utils/format';
import { symbolDisplayName } from './tradeFlow';

const orderTypes = [
  'Market Execution',
  'Buy Limit',
  'Sell Limit',
  'Buy Stop',
  'Sell Stop',
  'Buy Stop Limit',
  'Sell Stop Limit',
];

export function OrderTicketScreen() {
  const { symbol } = useLocalSearchParams<{ symbol?: string }>();
  const [orderType, setOrderType] = useState('Market Execution');
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState('0.01');
  const activeSymbol = symbol ?? 'BTCUSDm';
  const isMarketOrder = orderType === 'Market Execution';
  const requiresPrice = !isMarketOrder;
  const requiresStopLimitPrice = orderType.includes('Stop Limit');

  return (
    <Screen>
      <View style={styles.instrumentCard}>
        <View style={styles.instrumentRow}>
          <Text style={styles.symbol}>{activeSymbol}</Text>
          <Text style={styles.symbolChevron}>▾</Text>
        </View>
        <Text style={styles.subtitle}>{symbolDisplayName(activeSymbol)}</Text>
      </View>

      <View style={styles.orderCard}>
        <Pressable style={styles.typeTrigger} onPress={() => setExpanded((v) => !v)}>
          <Text style={styles.typeLabel}>Order Type</Text>
          <View style={styles.typeRight}>
            <Text style={styles.typeValue}>{orderType}</Text>
            <Text style={styles.typeChevron}>{expanded ? '▴' : '▾'}</Text>
          </View>
        </Pressable>

        {expanded ? (
          <View style={styles.dropdown}>
            {orderTypes.map((opt, index) => {
              const selected = opt === orderType;
              const isSell = opt.includes('Sell');
              return (
                <Pressable
                  key={opt}
                  style={[styles.optionRow, index < orderTypes.length - 1 && styles.optionDivider]}
                  onPress={() => {
                    setOrderType(opt);
                    setExpanded(false);
                  }}
                >
                  <Text style={[styles.optionText, isSell ? styles.optionSell : styles.optionBuy]}>{opt}</Text>
                  <Text style={styles.optionCheck}>{selected ? '✓' : ''}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.stepperRow}>
          {['-0.5', '-0.1', '0.01', '+0.1', '+0.5'].map((stepValue) => {
            const selected = stepValue === step;
            return (
              <Pressable
                key={stepValue}
                onPress={() => setStep(stepValue)}
                style={[styles.stepChip, selected && styles.stepChipActive]}
              >
                <Text style={[styles.stepText, selected && styles.stepTextActive]}>{stepValue}</Text>
              </Pressable>
            );
          })}
        </View>

        {requiresPrice ? <Row label='Price' value='not set' editable /> : null}
        {requiresStopLimitPrice ? <Row label='Stop Limit Price' value='not set' editable /> : null}
        <Row label='Stop Loss' value='not set' editable />
        <Row label='Take Profit' value='not set' editable />
        {isMarketOrder ? (
          <Row label='Fill Policy' value='Fill or Kill' />
        ) : (
          <Row label='Expiration' value='GTC' editable />
        )}
      </View>

      <View style={styles.metaStrip}>
        <MetaChip label='Volume' value={step} />
        <MetaChip label='Spread' value='18.00' />
        <MetaChip label='Policy' value={isMarketOrder ? 'FOK' : 'GTC'} />
      </View>

      <View style={styles.quotePanel}>
        <View style={styles.quoteCell}>
          <Text style={styles.quoteLabel}>Bid</Text>
          <Text style={styles.bid}>{fmt.price(67022.0, 2)}</Text>
        </View>
        <View style={styles.quoteDivider} />
        <View style={styles.quoteCell}>
          <Text style={styles.quoteLabel}>Ask</Text>
          <Text style={styles.ask}>{fmt.price(67040.0, 2)}</Text>
        </View>
      </View>

      <View style={styles.actionsWrap}>
        {isMarketOrder ? (
          <>
            <Pressable style={[styles.actionButton, styles.sellBtn]}>
              <Text style={styles.buttonText}>Sell by Market</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.buyBtn]}>
              <Text style={styles.buttonText}>Buy by Market</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={[styles.actionButton, styles.placeBtn]}>
            <Text style={styles.buttonText}>Place Order</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.warningCard}>
        <Text style={styles.warn}>
          The trade will be executed at market conditions. Execution price may differ from the requested price.
        </Text>
      </View>
    </Screen>
  );
}

function Row({
  label,
  value,
  editable = false,
}: {
  label: string;
  value: string;
  editable?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{value}</Text>
        {editable ? (
          <View style={styles.plusChip}>
            <Text style={styles.plus}>+</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipLabel}>{label}</Text>
      <Text style={styles.metaChipValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  instrumentCard: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222f46',
    backgroundColor: '#0c1627',
  },
  instrumentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  symbol: {
    color: '#eef3fb',
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 32,
  },
  symbolChevron: {
    color: '#90a8cd',
    fontSize: 18,
    marginTop: 2,
  },
  subtitle: {
    textAlign: 'center',
    color: '#8da0bb',
    fontSize: 12,
    marginTop: 4,
  },
  orderCard: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#212f45',
    backgroundColor: '#0a121f',
    overflow: 'hidden',
  },
  typeTrigger: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1c283c',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeLabel: {
    color: '#8ea0bc',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  typeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeValue: {
    color: '#edf3fd',
    fontSize: 15,
    fontWeight: '600',
  },
  typeChevron: {
    color: '#7e90ac',
    fontSize: 14,
  },
  dropdown: {
    backgroundColor: '#0f1a2b',
    borderBottomWidth: 1,
    borderBottomColor: '#1d2c42',
  },
  optionRow: {
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#203048',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionBuy: {
    color: colors.positive,
  },
  optionSell: {
    color: colors.negative,
  },
  optionCheck: {
    color: '#e8eef9',
    fontSize: 17,
    minWidth: 14,
    textAlign: 'right',
  },
  stepperRow: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1b273b',
  },
  stepChip: {
    minWidth: 58,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#24334b',
    backgroundColor: '#101a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepChipActive: {
    borderColor: '#3269ae',
    backgroundColor: '#163560',
  },
  stepText: {
    color: '#78a9e8',
    fontSize: 13,
    fontWeight: '600',
  },
  stepTextActive: {
    color: '#b9d5ff',
  },
  row: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#1b273b',
  },
  rowLabel: {
    color: '#d5deeb',
    fontSize: 14,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowValue: {
    color: '#8b97ab',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  plusChip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c4366',
    backgroundColor: '#11223a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 16,
  },
  metaStrip: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metaChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#25344f',
    backgroundColor: '#0f1a2b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  metaChipLabel: {
    color: '#8095b5',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  metaChipValue: {
    marginTop: 2,
    color: '#e2ecfa',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  quotePanel: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2f47',
    backgroundColor: '#0b1627',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  quoteCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  quoteLabel: {
    color: '#7f93b0',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  quoteDivider: {
    width: 1,
    backgroundColor: '#1f2d43',
  },
  bid: {
    color: colors.negative,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  ask: {
    color: colors.positive,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  actionsWrap: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellBtn: {
    backgroundColor: '#cf4036',
  },
  buyBtn: {
    backgroundColor: '#1d77cf',
  },
  placeBtn: {
    backgroundColor: '#50607a',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
  },
  warningCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: '#101928',
    borderWidth: 1,
    borderColor: '#25344c',
  },
  warn: {
    textAlign: 'center',
    color: '#8797b0',
    fontSize: 12,
    lineHeight: 17,
  },
});
