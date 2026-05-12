import { StyleSheet } from 'react-native';

export const baseStyles = StyleSheet.create({
  chartTradeMarketActionRow: { flexDirection: 'row', direction: 'ltr', gap: 12, marginTop: 2 },
  chartTradeMarketActionButton: {
    flex: 1, minHeight: 48, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  chartTradeMarketActionButtonBusy: { opacity: 0.5 },
  chartTradeMarketActionTitle: {
    color: '#FFFFFF', fontSize: 12, fontWeight: '800',
    letterSpacing: 0.2, textTransform: 'uppercase', textAlign: 'center',
  },
  chartTradeMarketActionMeta: {
    color: 'rgba(255,255,255,0.88)', fontSize: 10, fontWeight: '600',
    marginTop: 1, fontVariant: ['tabular-nums'], textAlign: 'center',
  },
  tradeControlsRow: {
    flexDirection: 'row', direction: 'ltr', alignItems: 'stretch',
    marginBottom: 0, gap: 0, paddingLeft: 0, paddingRight: 0,
    paddingVertical: 0,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9E9E9E',
  },
  actionButtonSlot: { flex: 1, minWidth: 0, alignItems: 'stretch', marginVertical: -1 },
  actionBtn: {
    width: '100%', borderRadius: 0, minHeight: 32, minWidth: 0,
    paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, justifyContent: 'space-between',
  },
  actionLotSlot: { width: 164, minWidth: 156, maxWidth: 176, flexShrink: 0 },
  actionLotControl: {
    flexDirection: 'row', alignItems: 'center', width: '100%', height: 34,
    borderRadius: 0, borderWidth: 1, overflow: 'hidden',
  },
  actionLotControlEditing: { borderBottomWidth: 0, borderBottomColor: 'transparent' },
  actionLotPill: {
    flex: 1, minWidth: 0, height: '100%', paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  actionLotAdjustButton: {
    width: 26, height: '100%', alignItems: 'center', justifyContent: 'center',
  },
  actionLotAdjustButtonDisabled: { opacity: 0.35 },
  actionLotInputWrap: {
    flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  actionBtnHeader: {
    flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 0,
  },
  actionBtnLabelTitle: { color: '#FFFFFF', fontSize: 8, fontWeight: '700', letterSpacing: 0.2 },
  actionBtnPriceText: {
    color: 'rgba(255,255,255,0.85)', fontSize: 17, fontWeight: '700',
    fontVariant: ['tabular-nums'], textAlign: 'center',
  },
});

export const lightStyles = StyleSheet.create({
  actionLotControl: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  actionLotControlPicker: { borderColor: 'transparent' },
  actionLotValue: { color: '#0F172A' },
  actionLotAdjustIcon: { color: '#475569' },
  actionLotAdjustIconDisabled: { color: '#94A3B8' },
  actionLotInput: { color: '#0F172A' },
});

export const darkStyles = StyleSheet.create({
  actionLotControl: { backgroundColor: '#1F2937', borderColor: '#FFFFFF' },
  actionLotControlPicker: { borderColor: 'transparent' },
  actionLotValue: { color: '#F8FAFC' },
  actionLotAdjustIcon: { color: '#E2E8F0' },
  actionLotAdjustIconDisabled: { color: '#64748B' },
  actionLotInput: { color: '#F8FAFC' },
});

export const textBaseStyles = StyleSheet.create({
  actionLotValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  actionLotInput: {
    width: '100%', fontSize: 15, fontWeight: '600',
    fontVariant: ['tabular-nums'], textAlign: 'center', paddingVertical: 0,
  },
});
