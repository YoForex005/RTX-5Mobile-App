import { StyleSheet, Platform } from 'react-native';
import type { ThemeColors } from '../../../ui/theme/glass';

export function makeJournalStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? '#111827' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const subtleText = isDark ? '#64748B' : '#94A3B8';
  const accent = '#007ACC'; // Custom VS Code Blue accent

  return StyleSheet.create({
    screen: { backgroundColor: isDark ? '#080B11' : '#F1F5F9' },
    container: { flex: 1 },
    content: { paddingHorizontal: 8, paddingTop: 20, paddingBottom: 40 },
    
    // Header & Stats
    heroGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -6,
      marginBottom: 20,
    },
    statCardWrap: {
      width: '50%',
      padding: 6,
      ...(Platform.OS === 'web' ? { minWidth: 200, width: '25%' } as any : {})
    },
    statCard: {
      flex: 1,
      backgroundColor: cardBg,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.4 : 0.05,
      shadowRadius: 10,
    },
    statTitle: { color: subtleText, fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 },
    statValue: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
    statSub: { color: subtleText, fontSize: 11, fontWeight: '600', marginTop: 4 },
    statPos: { color: '#10B981' },
    statNeg: { color: '#EF4444' },

    // Actions & Filters
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    addBtn: {
      backgroundColor: accent,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      gap: 6,
    },
    addBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    filterBtn: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: cardBorder,
      padding: 10,
      borderRadius: 12,
    },

    // Table List
    tableCard: {
      backgroundColor: cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      overflow: 'hidden',
    },
    tableHeader: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#F8FAFC',
      borderBottomWidth: 1,
      borderBottomColor: cardBorder,
    },
    colDate: { flex: 2 },
    colSymbol: { flex: 2 },
    colPnl: { flex: 2, alignItems: 'flex-end' },
    colResult: { flex: 1.5, alignItems: 'center' },
    headerText: { color: subtleText, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: cardBorder,
    },
    cellText: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
    cellSub: { color: subtleText, fontSize: 11, fontWeight: '500', marginTop: 2 },
    
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    badgeWin: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
    badgeLoss: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
    badgeTextWin: { color: '#10B981', fontSize: 10, fontWeight: '800' },
    badgeTextLoss: { color: '#EF4444', fontSize: 10, fontWeight: '800' },
    
    pnlPos: { color: '#10B981', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
    pnlNeg: { color: '#EF4444', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
    
    // Trade Modal
    modalOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: {
      backgroundColor: isDark ? '#0F1724' : '#FFFFFF',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 40,
      maxHeight: '90%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 18, fontWeight: '800' },
    formGroup: { marginBottom: 16 },
    label: { color: subtleText, fontSize: 12, fontWeight: '700', marginBottom: 6 },
    input: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 14,
      fontWeight: '500',
    },
    inputMultiline: {
      height: 80,
      textAlignVertical: 'top',
    },
    saveBtn: {
      backgroundColor: accent,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 20,
    },
    saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    
    emptyState: { padding: 40, alignItems: 'center' },
    emptyIconWrap: {
      width: 60, height: 60, borderRadius: 30,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 16,
    },
    emptyText: { color: subtleText, fontSize: 14, fontWeight: '600' }
  });
}

export type JournalStyles = ReturnType<typeof makeJournalStyles>;
