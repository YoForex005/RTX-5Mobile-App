import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../../ui/theme/glass';

export function makePriceAlertsStyles(_T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? '#0B0F19' : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0';

  return StyleSheet.create({
    screen: { flex: 1 },
    flex1: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    headerBtn: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },

    scrollContent: { paddingTop: 8 },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: isDark ? '#475569' : '#94A3B8',
    },

    card: {
      backgroundColor: cardBg,
      borderRadius: 14,
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: border,
      overflow: 'hidden',
    },

    /* Form fields */
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      paddingHorizontal: 16,
      minHeight: 52,
    },
    fieldLabel: { fontSize: 15, fontWeight: '500', minWidth: 80 },
    fieldInput: {
      flex: 1,
      textAlign: 'right',
      fontSize: 15,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },

    conditionToggle: { flexDirection: 'row', gap: 8 },
    conditionPill: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: 'transparent',
    },
    conditionPillText: { fontSize: 13, fontWeight: '700' },

    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    errorText: { fontSize: 13, fontWeight: '500' },

    createBtn: {
      margin: 12,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    createBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

    separator: { height: StyleSheet.hairlineWidth, backgroundColor: border, marginLeft: 16 },

    /* Alert list rows */
    alertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 12,
    },
    alertIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    alertBody: { flex: 1, gap: 2 },
    alertTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    alertSymbol: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
    alertCondition: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
    alertMessage: { fontSize: 12, fontWeight: '500' },
    alertTime: { fontSize: 11, fontWeight: '500', fontVariant: ['tabular-nums'], marginTop: 2 },
    deleteBtn: { padding: 6 },

    triggeredBadge: {
      backgroundColor: isDark ? 'rgba(100,116,139,0.2)' : '#F1F5F9',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    triggeredBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#475569' : '#94A3B8',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    /* Empty state */
    emptyCard: {
      marginHorizontal: 16,
      paddingVertical: 32,
      alignItems: 'center',
      gap: 8,
    },
    emptyText: { fontSize: 16, fontWeight: '600', marginTop: 4 },
    emptySubText: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
  });
}

export type PriceAlertsStyles = ReturnType<typeof makePriceAlertsStyles>;
