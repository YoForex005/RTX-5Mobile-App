export type ChartDrawingKind =
  | 'trendline'
  | 'fib'
  | 'brush'
  | 'text'
  | 'patterns'
  | 'prediction'
  | 'pitchfork'
  | 'smiley'
  | 'measure';

export type SerializedChartTime =
  | number
  | string
  | {
      year: number;
      month: number;
      day: number;
    };

export type PersistedChartDrawingPoint = {
  time: SerializedChartTime;
  price: number;
};

export type PersistedChartDrawing = {
  id: string;
  kind: ChartDrawingKind;
  label: string;
  hidden: boolean;
  points: PersistedChartDrawingPoint[];
  text?: string;
};

export type PersistedChartDrawingsBySymbol = Record<string, PersistedChartDrawing[]>;

export const CHART_DRAWING_KINDS: ChartDrawingKind[] = [
  'trendline',
  'fib',
  'brush',
  'text',
  'patterns',
  'prediction',
  'pitchfork',
  'smiley',
  'measure',
];

const REQUIRED_POINT_COUNT: Record<ChartDrawingKind, number> = {
  trendline: 2,
  fib: 2,
  brush: 2,
  text: 1,
  patterns: 3,
  prediction: 2,
  pitchfork: 3,
  smiley: 1,
  measure: 2,
};

const DEFAULT_DRAWING_LABELS: Record<ChartDrawingKind, string> = {
  trendline: 'Trend Line',
  fib: 'Fib Zone',
  brush: 'Highlight',
  text: 'Text',
  patterns: 'Pattern',
  prediction: 'Long Position',
  pitchfork: 'Pitchfork',
  smiley: 'Sticker',
  measure: 'Measure',
};

function isChartDrawingKind(value: unknown): value is ChartDrawingKind {
  return typeof value === 'string' && CHART_DRAWING_KINDS.includes(value as ChartDrawingKind);
}

function isSerializedChartTime(value: unknown): value is SerializedChartTime {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<'year' | 'month' | 'day', unknown>>;
  return (
    Number.isInteger(candidate.year) &&
    Number.isInteger(candidate.month) &&
    Number.isInteger(candidate.day)
  );
}

function sanitizeDrawingPoint(value: unknown): PersistedChartDrawingPoint | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PersistedChartDrawingPoint>;
  if (!isSerializedChartTime(candidate.time) || typeof candidate.price !== 'number' || !Number.isFinite(candidate.price)) {
    return null;
  }

  return {
    time: candidate.time,
    price: candidate.price,
  };
}

export function getChartDrawingBucketKey(symbol: string): string {
  const trimmed = normalizeSymbol(symbol);
  return trimmed.length > 0 ? trimmed : 'DEFAULT';
}

export function getDefaultChartDrawingLabel(kind: ChartDrawingKind, index: number): string {
  const baseLabel = DEFAULT_DRAWING_LABELS[kind];
  const safeIndex = Number.isInteger(index) && index > 0 ? index : 1;
  return `${baseLabel} ${safeIndex}`;
}

export function getChartDrawingLabels(drawings: PersistedChartDrawing[]): string[] {
  return drawings.map((drawing) => drawing.label);
}

function sanitizePersistedChartDrawing(
  value: unknown,
  index: number,
): PersistedChartDrawing | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PersistedChartDrawing>;
  if (!isChartDrawingKind(candidate.kind)) {
    return null;
  }

  const requiredPointCount = REQUIRED_POINT_COUNT[candidate.kind];
  const points = Array.isArray(candidate.points)
    ? candidate.points
        .map((point) => sanitizeDrawingPoint(point))
        .filter((point): point is PersistedChartDrawingPoint => point !== null)
        .slice(0, requiredPointCount)
    : [];

  if (points.length < requiredPointCount) {
    return null;
  }

  const label = typeof candidate.label === 'string' && candidate.label.trim().length > 0
    ? candidate.label.trim()
    : getDefaultChartDrawingLabel(candidate.kind, index + 1);

  const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0
    ? candidate.id.trim()
    : `${candidate.kind}_${index + 1}`;

  return {
    id,
    kind: candidate.kind,
    label,
    hidden: Boolean(candidate.hidden),
    points,
    text: typeof candidate.text === 'string' ? candidate.text : undefined,
  };
}

export function sanitizePersistedChartDrawings(value: unknown): PersistedChartDrawing[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => sanitizePersistedChartDrawing(item, index))
    .filter((item): item is PersistedChartDrawing => item !== null);
}
import { normalizeSymbol } from '../../domain/symbols.ts';
