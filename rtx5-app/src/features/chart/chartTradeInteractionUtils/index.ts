/**
 * Public entry for chart trade interaction utilities. Split for the 500-line
 * ceiling into:
 *   - `footerLotPicker.ts`  — lot picker quick-adjustments and grid values
 *   - `chartTradeSheet.ts`  — trade sheet visibility/height resolvers
 *   - `keyboardLayout.ts`   — keyboard offset / Android host-resize helpers
 */
export {
  resolveFooterLotCommitDraft,
  resolveFooterLotChevronState,
  resolveFooterLotChevronPressBehavior,
  buildFooterLotPickerQuickAdjustments,
  buildFooterLotPickerValues,
  type FooterLotPickerMode,
  type FooterLotPickerQuickAdjustment,
  type FooterLotPickerValueOption,
} from './footerLotPicker';
export {
  resolveFooterTradeRowState,
  shouldHideChartTabBarForTradeInput,
  shouldShowChartTradePreviewOnChart,
  shouldSuppressChartTapMenu,
  resolveChartTradeSheetMaxHeight,
  resolveChartTradeSheetHeaderLift,
  resolveChartTradeSheetHostHeight,
  resolveChartTradeSheetFrameHeight,
  shouldShowChartTradeSheetHeader,
  shouldShowChartTradeSheetHandle,
  shouldRenderChartTradeSheetBody,
  shouldShowChartTradeSheetMarketExecutionButtons,
} from './chartTradeSheet';
export {
  resolveKeyboardDockOffset,
  resolveKeyboardResizesHost,
} from './keyboardLayout';
