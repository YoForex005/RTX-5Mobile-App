import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../../ui/theme/glass';

export function makeObjectsScreenStyles(_T: ThemeColors, isDark: boolean) {
  const screenBg = isDark ? '#121212' : '#F3F4F6';
  const surface = isDark ? '#1E1E1E' : '#FFFFFF';
  const border = isDark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)';
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const divider = isDark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)';

  return StyleSheet.create({
    screen: { backgroundColor: screenBg },
    header: { paddingHorizontal: 16, paddingBottom: 14, backgroundColor: screenBg },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: {
      flex: 1, textAlign: 'center',
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17, fontWeight: '700', paddingHorizontal: 8,
    },
    headerSubtitle: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 4,
    },
    sectionLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12, fontWeight: '700',
      letterSpacing: 0.7, textTransform: 'uppercase',
      marginTop: 20, marginBottom: 8, paddingHorizontal: 16,
    },
    panel: {
      marginHorizontal: 16, backgroundColor: surface,
      borderRadius: 14, borderWidth: 1, borderColor: border, overflow: 'hidden',
    },
    panelDivider: {
      height: StyleSheet.hairlineWidth, backgroundColor: divider, marginLeft: 64,
    },
    actionRow: {
      minHeight: 68, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    objectRow: {
      minHeight: 70, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    toggleRow: {
      minHeight: 64, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    },
    rowPressed: { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)' },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
    rowIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.08)',
    },
    rowCopy: { flex: 1, minWidth: 0 },
    rowTitle: { color: primaryText, fontSize: 15, fontWeight: '600' },
    rowSubtitle: { color: secondaryText, fontSize: 12, marginTop: 2 },
    objectsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
    countBadge: {
      minWidth: 24, height: 24, paddingHorizontal: 8, borderRadius: 12,
      backgroundColor: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.12)',
      alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    countText: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
    objectRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 12 },
    hiddenPill: {
      paddingHorizontal: 8, height: 22, borderRadius: 11,
      backgroundColor: isDark ? 'rgba(100,116,139,0.18)' : 'rgba(100,116,139,0.12)',
      alignItems: 'center', justifyContent: 'center',
    },
    hiddenPillText: { color: secondaryText, fontSize: 11, fontWeight: '600' },
    emptyPanel: {
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 32, paddingHorizontal: 24,
      backgroundColor: surface,
    },
    emptyTitle: { color: primaryText, fontSize: 16, fontWeight: '700', marginTop: 12 },
    emptySubtitle: {
      color: secondaryText, fontSize: 13,
      textAlign: 'center', marginTop: 6, lineHeight: 18,
    },
    footerHint: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 12, textAlign: 'center',
      paddingHorizontal: 24, marginTop: 12,
    },
  });
}

export type ObjectsScreenStyles = ReturnType<typeof makeObjectsScreenStyles>;
