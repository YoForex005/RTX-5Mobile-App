/**
 * Static metadata for chart drawing tools — labels, descriptions, icon
 * components, and accent colors. Drives both the Add Object sheet and the
 * Current Objects list.
 */
import {
  TvBrush,
  TvFib,
  TvMeasure,
  TvPatterns,
  TvPitchfork,
  TvPrediction,
  TvSmiley,
  TvText,
  TvTrendLine,
} from '../components/ChartToolbarIcons';
import type { ChartDrawingKind } from '../drawingPersistence';

export type DrawingIconComponent = typeof TvTrendLine;

export type DrawingToolMeta = {
  key: ChartDrawingKind;
  label: string;
  description: string;
  Icon: DrawingIconComponent;
  accent: string;
};

export type DisplayDrawing = {
  id: string;
  label: string;
  description: string;
  hidden: boolean;
  kind: ChartDrawingKind | null;
  text?: string;
  supportsVisibility: boolean;
};

export const DRAWING_TOOL_META: Record<ChartDrawingKind, DrawingToolMeta> = {
  trendline: { key: 'trendline', label: 'Trend line', description: 'Two-point line', Icon: TvTrendLine, accent: '#2563EB' },
  fib: { key: 'fib', label: 'Fib zone', description: 'Retracement area', Icon: TvFib, accent: '#D97706' },
  brush: { key: 'brush', label: 'Highlight', description: 'Marked area', Icon: TvBrush, accent: '#2563EB' },
  text: { key: 'text', label: 'Text', description: 'Chart label', Icon: TvText, accent: '#1D4ED8' },
  textLevel: { key: 'textLevel', label: 'Text level', description: 'Text price level', Icon: TvText, accent: '#2962FF' },
  patterns: { key: 'patterns', label: 'Pattern', description: 'Polyline pattern', Icon: TvPatterns, accent: '#9333EA' },
  prediction: { key: 'prediction', label: 'Long position', description: 'Risk / reward box', Icon: TvPrediction, accent: '#059669' },
  pitchfork: { key: 'pitchfork', label: 'Pitchfork', description: 'Three-point fork', Icon: TvPitchfork, accent: '#7C3AED' },
  smiley: { key: 'smiley', label: 'Sticker', description: 'Chart sticker', Icon: TvSmiley, accent: '#D97706' },
  measure: { key: 'measure', label: 'Measure', description: 'Price / time range', Icon: TvMeasure, accent: '#475569' },
};

export const ADD_OBJECT_TOOLS: ChartDrawingKind[] = [
  'trendline',
  'fib',
  'brush',
  'textLevel',
  'patterns',
  'prediction',
  'pitchfork',
  'measure',
  'smiley',
];

export function buildLegacyDrawingDescription(label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return 'Chart object';
  }

  const knownMeta = Object.values(DRAWING_TOOL_META).find((item) =>
    normalized.toLowerCase().startsWith(item.label.toLowerCase()),
  );

  return knownMeta?.description ?? 'Chart object';
}
