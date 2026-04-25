import type { EnhancedDrawingToolRuntime } from '../types';
import { crosshairEnhancedDrawingToolRuntime } from './crosshairRuntime';
import { fibZoneEnhancedDrawingToolRuntime } from './fibZoneRuntime';
import { highlightBoxEnhancedDrawingToolRuntime } from './highlightBoxRuntime';
import { longPositionEnhancedDrawingToolRuntime } from './longPositionRuntime';
import { measureRangeEnhancedDrawingToolRuntime } from './measureRangeRuntime';
import { patternPathEnhancedDrawingToolRuntime } from './patternPathRuntime';
import { pitchforkEnhancedDrawingToolRuntime } from './pitchforkRuntime';
import { stickerEnhancedDrawingToolRuntime } from './stickerRuntime';
import { textLabelEnhancedDrawingToolRuntime } from './textLabelRuntime';
import { trendLineEnhancedDrawingToolRuntime } from './trendLineRuntime';

export { crosshairEnhancedDrawingToolRuntime } from './crosshairRuntime';
export { fibZoneEnhancedDrawingToolRuntime } from './fibZoneRuntime';
export { highlightBoxEnhancedDrawingToolRuntime } from './highlightBoxRuntime';
export { longPositionEnhancedDrawingToolRuntime } from './longPositionRuntime';
export { measureRangeEnhancedDrawingToolRuntime } from './measureRangeRuntime';
export { patternPathEnhancedDrawingToolRuntime } from './patternPathRuntime';
export { pitchforkEnhancedDrawingToolRuntime } from './pitchforkRuntime';
export { stickerEnhancedDrawingToolRuntime } from './stickerRuntime';
export { textLabelEnhancedDrawingToolRuntime } from './textLabelRuntime';
export { trendLineEnhancedDrawingToolRuntime } from './trendLineRuntime';

export const ENHANCED_DRAWING_TOOL_RUNTIMES: EnhancedDrawingToolRuntime[] = [
  crosshairEnhancedDrawingToolRuntime,
  trendLineEnhancedDrawingToolRuntime,
  fibZoneEnhancedDrawingToolRuntime,
  highlightBoxEnhancedDrawingToolRuntime,
  textLabelEnhancedDrawingToolRuntime,
  patternPathEnhancedDrawingToolRuntime,
  longPositionEnhancedDrawingToolRuntime,
  pitchforkEnhancedDrawingToolRuntime,
  stickerEnhancedDrawingToolRuntime,
  measureRangeEnhancedDrawingToolRuntime,
];

export const ENHANCED_DRAWING_TOOLS_RUNTIME_JS = ENHANCED_DRAWING_TOOL_RUNTIMES
  .map((runtime) => runtime.script)
  .filter((script) => script.trim().length > 0)
  .join('\n');
