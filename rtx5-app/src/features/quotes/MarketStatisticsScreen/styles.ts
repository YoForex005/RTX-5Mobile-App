import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../../ui/theme/glass';

export function makeMarketStatisticsStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : T.glass2;
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : T.border;

  return StyleSheet.create({
    root: { flex: 1 },
    headerContainer: {
      backgroundColor: T.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: borderColor,
    },
    headerRow: {
      height: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    backButton: {
      width: 46,
      alignItems: 'flex-start',
      padding: 4,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: T.text,
      letterSpacing: -0.3,
    },
    headerRight: {
      width: 46,
      alignItems: 'flex-end',
      paddingRight: 4,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      shadowOpacity: 0.8,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingTop: 8 },

    // ── Stat Rows ──
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 20,
      minHeight: 52,
    },
    statRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: borderColor,
    },
    statLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    directionIcon: { width: 16, textAlign: 'center' },
    neutralDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4 },
    statLabel: {
      fontSize: 16, fontWeight: '500', color: T.text, letterSpacing: -0.2,
    },
    statValue: {
      fontSize: 16, fontWeight: '500', color: T.text,
      fontVariant: ['tabular-nums'], letterSpacing: -0.3,
    },

    // ── Additional Stats Card ──
    additionalCard: {
      marginTop: 20, marginHorizontal: 16, backgroundColor: cardBg,
      borderRadius: 16, borderWidth: 1, borderColor: borderColor,
      padding: 16, overflow: 'hidden',
    },
    additionalTitle: {
      fontSize: 11, fontWeight: '800', color: T.textMuted,
      letterSpacing: 1.2, marginBottom: 14,
    },
    additionalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    additionalGridItem: {
      flex: 1, minWidth: '40%' as any,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      borderRadius: 12, borderWidth: 1, borderColor: borderColor,
      paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center',
    },
    additionalGridLabel: {
      fontSize: 10, fontWeight: '700', color: T.textMuted,
      letterSpacing: 1, marginBottom: 6,
    },
    additionalGridValue: {
      fontSize: 17, fontWeight: '700', color: T.text,
      fontVariant: ['tabular-nums'],
    },

    // ── Day Range ──
    rangeCard: {
      marginTop: 12, marginHorizontal: 16, backgroundColor: cardBg,
      borderRadius: 16, borderWidth: 1, borderColor: borderColor,
      padding: 16, overflow: 'hidden',
    },
    rangeTitle: {
      fontSize: 11, fontWeight: '800', color: T.textMuted,
      letterSpacing: 1.2, marginBottom: 16,
    },
    rangeBar: { paddingHorizontal: 4 },
    rangeTrack: {
      height: 4,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      borderRadius: 2, position: 'relative',
    },
    rangeFill: {
      position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2,
    },
    rangeKnob: {
      position: 'absolute', top: -6, width: 16, height: 16,
      borderRadius: 8, borderWidth: 2.5, marginLeft: -8,
      backgroundColor: T.bg,
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    rangeLabels: {
      flexDirection: 'row', justifyContent: 'space-between', marginTop: 10,
    },
    rangeLabelValue: {
      fontSize: 13, fontWeight: '600', color: T.text,
      fontVariant: ['tabular-nums'],
    },
    rangeLabelSmall: {
      fontSize: 10, fontWeight: '700', color: T.textMuted,
      letterSpacing: 1, marginTop: 2,
    },

    // ── Sentiment ──
    sentimentCard: {
      marginTop: 12, marginHorizontal: 16, backgroundColor: cardBg,
      borderRadius: 16, borderWidth: 1, borderColor: borderColor,
      padding: 16, overflow: 'hidden',
    },
    sentimentTitle: {
      fontSize: 11, fontWeight: '800', color: T.textMuted,
      letterSpacing: 1.2, marginBottom: 14,
    },
    sentimentBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sentimentPct: {
      fontSize: 14, fontWeight: '900',
      fontVariant: ['tabular-nums'], width: 42,
    },
    sentimentTrack: {
      flex: 1, height: 6, borderRadius: 3, flexDirection: 'row',
      overflow: 'hidden', backgroundColor: T.border,
    },
    sentimentFillLeft: { height: 6 },
    sentimentFillRight: { height: 6 },
    sentimentLabels: {
      flexDirection: 'row', justifyContent: 'space-between',
      marginTop: 8, paddingHorizontal: 52,
    },
    sentimentLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  });
}
