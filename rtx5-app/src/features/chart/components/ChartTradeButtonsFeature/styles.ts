import { StyleSheet } from 'react-native';

export const COMPACT_TRADE_FOOTER_ROW_HEIGHT = 40;

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
    paddingVertical: 0, minHeight: COMPACT_TRADE_FOOTER_ROW_HEIGHT,
    overflow: 'visible',
    borderTopWidth: 1, borderBottomWidth: 0, borderColor: '#9E9E9E',
  },
  actionButtonSlot: {
    flex: 1, minWidth: 0, alignItems: 'stretch', alignSelf: 'stretch',
    height: COMPACT_TRADE_FOOTER_ROW_HEIGHT, overflow: 'hidden',
  },
  actionBtn: {
    width: '100%', height: '100%', alignSelf: 'stretch', borderRadius: 0, minHeight: COMPACT_TRADE_FOOTER_ROW_HEIGHT, minWidth: 0,
    paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  actionLotSlot: {
    width: 164, minWidth: 156, maxWidth: 176, flexShrink: 0,
    alignSelf: 'stretch', height: COMPACT_TRADE_FOOTER_ROW_HEIGHT, overflow: 'hidden',
  },
  actionLotControl: {
    flexDirection: 'row', alignItems: 'center', width: '100%', height: '100%',
    borderRadius: 0, borderWidth: 1, overflow: 'hidden',
  },
  actionLotControlEditing: { borderBottomWidth: 0, borderBottomColor: 'transparent' },
  actionLotPill: {
    flex: 1, minWidth: 0, height: '100%', paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
    position: 'relative', zIndex: 3, elevation: 3,
  },
  actionLotAdjustButton: {
    width: 26, height: '100%', alignItems: 'center', justifyContent: 'center',
    position: 'relative', zIndex: 2, elevation: 2,
  },
  actionLotAdjustButtonDisabled: { opacity: 0.35 },
  actionLotUnderlayIconHidden: { opacity: 0 },
  actionLotCommittedOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
    backgroundColor: 'transparent',
  },
  actionLotCommittedIconBox: {
    width: 26,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLotCommittedValue: {
    flex: 1,
    minWidth: 0,
  },
  actionLotDisplayGhost: {
    opacity: 0,
  },
  actionLotInputWrap: {
    flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    position: 'relative', zIndex: 3, elevation: 3,
  },
  actionBtnHeader: {
    position: 'absolute', top: 2, left: 6, zIndex: 1,
    flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center',
  },
  actionBtnLabelTitle: { color: '#FFFFFF', fontSize: 8, fontWeight: '700', letterSpacing: 0.2 },
  actionBtnPriceText: {
    width: '100%', color: 'rgba(255,255,255,0.85)', fontSize: 17, lineHeight: 20,
    fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right',
    paddingRight: 6, includeFontPadding: false,
  },
});

export const lightStyles = StyleSheet.create({
  actionLotSlot: { backgroundColor: '#FFFFFF' },
  actionLotControl: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
  actionLotControlPicker: { borderColor: '#CBD5E1' },
  actionLotValue: { color: '#0F172A' },
  actionLotAdjustIcon: { color: '#475569' },
  actionLotAdjustIconDisabled: { color: '#94A3B8' },
  actionLotInput: { color: '#0F172A' },
});

export const darkStyles = StyleSheet.create({
  actionLotSlot: { backgroundColor: '#FFFFFF' },
  actionLotControl: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
  actionLotControlPicker: { borderColor: '#CBD5E1' },
  actionLotValue: { color: '#0F172A' },
  actionLotAdjustIcon: { color: '#475569' },
  actionLotAdjustIconDisabled: { color: '#94A3B8' },
  actionLotInput: { color: '#0F172A' },
});

export const textBaseStyles = StyleSheet.create({
  actionLotValue: {
    minWidth: 52,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    includeFontPadding: false,
    position: 'relative',
    zIndex: 4,
    elevation: 4,
  },
  actionLotInput: {
    width: '100%', fontSize: 15, lineHeight: 20, fontWeight: '700',
    fontVariant: ['tabular-nums'], textAlign: 'center', paddingVertical: 0,
    includeFontPadding: false,
  },
});
