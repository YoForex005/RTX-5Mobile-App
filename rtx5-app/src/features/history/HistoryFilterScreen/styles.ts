import { StyleSheet } from 'react-native';
import { spacing } from '../../../ui/theme/index';
import type { ThemeColors } from '../../../ui/theme/glass';

export function makeHistoryFilterStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: isDark ? T.bg : T.bg },
    header: {
      backgroundColor: isDark ? T.bg : T.bg,
      paddingBottom: 10,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerBackButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    headerTitleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
    headerTitle: { color: T.text, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
    scrollContent: { paddingBottom: spacing.xl },
    symbolRow: {
      margin: spacing.md,
      backgroundColor: isDark ? T.glass2 : T.glass1,
      borderRadius: 12, padding: spacing.md,
      flexDirection: 'row', justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: isDark ? T.border : T.border,
    },
    label: { color: T.textSub, fontSize: 16 },
    value: { color: T.textMuted, fontSize: 16 },
    card: {
      marginHorizontal: spacing.md,
      backgroundColor: isDark ? T.glass2 : T.glass1,
      borderRadius: 14, overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? T.border : T.borderMedium,
    },
    option: {
      paddingHorizontal: spacing.md, paddingVertical: 11,
      borderBottomColor: isDark ? T.borderSubtle : T.borderMedium,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    optionText: { color: T.text, fontSize: 16, fontWeight: '500' },
    check: { color: T.accent, fontSize: 20 },
    reportBtn: {
      margin: spacing.md, marginTop: spacing.sm,
      backgroundColor: isDark ? T.glass2 : T.glass1,
      borderRadius: 12, padding: spacing.md,
      borderWidth: 1,
      borderColor: isDark ? T.border : T.border,
    },
    reportTitle: { color: T.text, fontSize: 18 },
    reportSub: { color: T.textMuted, marginTop: 4 },

    /* ── Calendar ── */
    calendarCard: {
      marginHorizontal: spacing.md, marginTop: spacing.md,
      backgroundColor: isDark ? T.glass2 : T.glass1,
      borderRadius: 16, borderWidth: 1,
      borderColor: isDark ? T.border : T.border,
      padding: spacing.md,
      shadowColor: isDark ? '#000000' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 8 },
      shadowOpacity: isDark ? 0.25 : 0.08,
      shadowRadius: isDark ? 12 : 24, elevation: 4,
    },

    /* Mode pills */
    modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
    modePill: {
      paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20,
      borderWidth: 1, borderColor: T.border, backgroundColor: 'transparent',
    },
    modePillActive: { backgroundColor: T.accent, borderColor: T.accent },
    modePillText: {
      fontSize: 13, fontWeight: '700',
      color: isDark ? 'rgba(148,163,184,0.7)' : T.textSub,
      letterSpacing: 0.3,
    },
    modePillTextActive: { color: '#FFFFFF' },

    /* Month nav */
    monthNav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12, paddingHorizontal: 4,
    },
    monthLabel: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: 0 },

    /* Day header */
    dayHeaderRow: { flexDirection: 'row', marginBottom: 6 },
    dayHeaderText: {
      flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600',
      color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted,
      letterSpacing: 0.5, textTransform: 'uppercase',
    },

    /* Calendar grid */
    calRow: { flexDirection: 'row' },
    calCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
    calCellInRange: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
    },
    calCellRangeStart: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
      borderTopLeftRadius: 20, borderBottomLeftRadius: 20,
    },
    calCellRangeEnd: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
      borderTopRightRadius: 20, borderBottomRightRadius: 20,
    },

    /* Day circle */
    calDayCircle: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },
    calDaySelected: { backgroundColor: T.accent },
    calDayToday: { borderWidth: 1.5, borderColor: T.accent },
    calDayText: {
      fontSize: 14, fontWeight: '600', color: T.text,
      fontVariant: ['tabular-nums'],
    },
    calDayTextSelected: { color: '#FFFFFF', fontWeight: '600' },
    calDayTextToday: { color: T.accent, fontWeight: '600' },
    calDayTextInRange: { color: T.accent, fontWeight: '700' },

    /* Selection info */
    selectionInfo: { marginTop: 12, alignItems: 'center' },
    selectionLabel: {
      fontSize: 13, fontWeight: '600', color: T.textSub,
      fontVariant: ['tabular-nums'], letterSpacing: 0.2,
    },

    /* Apply button */
    applyBtn: {
      marginTop: 12, backgroundColor: T.accent,
      borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    },
    applyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  });
}
