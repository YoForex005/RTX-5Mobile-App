import { StyleSheet } from 'react-native';
import { spacing } from '../../../ui/theme/index';
import type { ThemeColors } from '../../../ui/theme/glass';

export function makeTradeScreenStyles(T: ThemeColors, isDark: boolean) {
  // Premium dark palette: matches the QuotesScreen rotation. Deep slate-black
  // screen background with a subtly elevated card surface for clear depth.
  const cardBg = isDark ? '#0E141F' : T.glass2;
  return StyleSheet.create({
    list: { flex: 1 },
    listContent: { paddingBottom: 32 },
    summaryBlock: {
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 16,
      backgroundColor: cardBg, borderWidth: 1, borderColor: T.border,
      shadowColor: isDark ? '#2563EB' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 8 },
      shadowOpacity: isDark ? 0.08 : 0.08,
      shadowRadius: isDark ? 16 : 24, elevation: 4, overflow: 'hidden',
    },
    summaryTop: {
      paddingHorizontal: spacing.md, paddingVertical: 14,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: 'transparent',
    },
    summaryLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    floating: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5, marginTop: 2 },
    floatingPositive: { color: T.up },
    floatingNegative: { color: T.down },
    summaryHint: { marginTop: 4, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
    summaryMetrics: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
    metricsCard: { borderTopWidth: 1, borderColor: T.borderSubtle, backgroundColor: T.glass1, overflow: 'hidden' },
    gridRow: { flexDirection: 'row' },
    gridCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    gridLabel: { fontSize: 12, fontWeight: '500' },
    gridValue: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0.2 },
    positionsHeader: {
      marginTop: spacing.lg, marginHorizontal: spacing.md, paddingVertical: 8, paddingHorizontal: 2,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1,
    },
    positionsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    positionsAccentBar: { width: 3, height: 32, borderRadius: 2 },
    positionsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    totalPnlBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    totalPnlText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] as any },
    positionsTitle: { fontSize: 18, fontWeight: '600', letterSpacing: -0.5 },
    positionsMeta: { marginTop: 2, fontSize: 12, fontWeight: '500' },
    bulkButton: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    /* Empty state */
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
    emptySub: { fontSize: 13, fontWeight: '500', marginTop: 4 },
    bulkButtonText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
    oneClick: {
      marginTop: spacing.lg, marginHorizontal: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.md,
      borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      shadowColor: isDark ? '#2563EB' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 8 },
      shadowOpacity: isDark ? 0.08 : 0.08,
      shadowRadius: isDark ? 16 : 24, elevation: 4,
    },
    oneClickTitle: { fontSize: 15, fontWeight: '700' },
    oneClickSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
    statusPill: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
    /* Header */
    headerGrad: { paddingBottom: 0 },
    headerRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    },
    menuBtn: {
      width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1,
      alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerIconBtn: {
      width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1,
      borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center',
    },
    newOrderHeaderBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563EB',
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 5,
    },
    newOrderHeaderBtnPressed: { backgroundColor: '#1D4ED8' },
    newOrderHeaderText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    /* P/L Section */
    plSection: { flex: 1 },
    floatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    trendBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    trendUp: { backgroundColor: 'rgba(74,222,128,0.1)' },
    trendDown: { backgroundColor: 'rgba(248,113,113,0.1)' },
    plMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    /* Balance */
    balanceQuick: { alignItems: 'flex-end', justifyContent: 'center' },
    balanceQuickLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    balanceQuickValue: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5, marginTop: 2 },
    balanceQuickCurrency: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
    equityRow: { flexDirection: 'row', alignItems: 'center' },
    equityLabel: { fontSize: 12, fontWeight: '600' },
    equityValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
    /* Exposure */
    exposureSection: {
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: spacing.md, backgroundColor: cardBg,
      shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 24, elevation: 4,
    },
    exposureHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    exposureSectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    exposureCount: { fontSize: 11, fontWeight: '600' },
    exposureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
    exposureSymbol: { width: 50, fontSize: 12, fontWeight: '700' },
    exposureBarWrap: { flex: 1, height: 10, borderRadius: 5, marginHorizontal: 8, overflow: 'hidden', justifyContent: 'center' },
    exposureBar: { height: 10, borderRadius: 5 },
    exposureNet: { width: 80, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right' },
  });
}

export type TradeScreenStyles = ReturnType<typeof makeTradeScreenStyles>;
