import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline, G } from 'react-native-svg';

export const TvCrosshair = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M14 6v16M6 14h16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="14" r="2" fill={color} />
  </Svg>
);

export const TvTrendLine = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Line x1="7" y1="21" x2="21" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="7" cy="21" r="2" fill={color} />
    <Circle cx="21" cy="7" r="2" fill={color} />
  </Svg>
);

export const TvFib = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Line x1="6" y1="8" x2="22" y2="8" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    <Line x1="6" y1="14" x2="22" y2="14" stroke={color} strokeWidth="1.5" />
    <Line x1="6" y1="20" x2="22" y2="20" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    <Circle cx="14" cy="8" r="1.5" fill={color} />
    <Circle cx="14" cy="20" r="1.5" fill={color} />
    <Line x1="14" y1="8" x2="14" y2="20" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity={0.5} />
  </Svg>
);

export const TvBrush = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M19 6c1.5 1.5 1.5 4 0 5.5l-6 6c-2 2-5 3.5-7 3.5 0-2 1.5-5 3.5-7l6-6c1.5-1.5 4-1.5 5.5 0z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M13 11l4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M6 22l2-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvText = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M6 7h16M14 7v15M11 22h6M6 7v3M22 7v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvMeasure = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Rect x="5" y="8" width="18" height="12" rx="2" transform="rotate(-30 5 8)" stroke={color} strokeWidth="1.5" />
    <Line x1="10" y1="7" x2="11" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="14" y1="5" x2="16" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="19" y1="2" x2="20" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvZoom = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.5" />
    <Line x1="17" y1="17" x2="22" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="9" y1="12" x2="15" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="12" y1="9" x2="12" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvMagnet = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M7 14v4c0 3.866 3.134 7 7 7s7-3.134 7-7v-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Rect x="5" y="8" width="4" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="19" y="8" width="4" height="6" rx="1" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvPencil = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M19.5 5.5l3 3-13 13-4.5 1 1-4.5 13-13z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M16 9l3 3" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
  </Svg>
);

export const TvLock = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Rect x="7" y="12" width="14" height="10" rx="2" stroke={color} strokeWidth="1.5" />
    <Path d="M10 12V8c0-2.209 1.791-4 4-4s4 1.791 4 4v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="17" r="1.5" fill={color} />
  </Svg>
);

export const TvHide = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M4 14c0 0 4-7 10-7s10 7 10 7-4 7-10 7-10-7-10-7z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Circle cx="14" cy="14" r="3" stroke={color} strokeWidth="1.5" />
    <Line x1="4" y1="4" x2="24" y2="24" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvTrash = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M5 8h18M11 5h6M8 8v14a2 2 0 002 2h8a2 2 0 002-2V8M12 12v6M16 12v6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvLayers = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M14 6l-8 4 8 4 8-4-8-4z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M6 14l8 4 8-4M6 19l8 4 8-4" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
  </Svg>
);

export const TvCandles = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Rect x="8" y="10" width="4" height="8" rx="0.5" stroke={color} strokeWidth="1.5" />
    <Line x1="10" y1="6" x2="10" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="10" y1="18" x2="10" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Rect x="16" y="8" width="4" height="6" rx="0.5" stroke={color} strokeWidth="1.5" />
    <Line x1="18" y1="4" x2="18" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="18" y1="14" x2="18" y2="20" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvFx = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M9 20V14M9 14h3M9 14C9 8 13 8 13 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14 20l5-6m-5 0l5 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvGrid4 = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Rect x="6" y="6" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="16" y="6" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="6" y="16" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="16" y="16" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvUndo = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M10 10l-4 4 4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M6 14h8c4.418 0 8 3.582 8 8v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvRedo = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Path d="M18 10l4 4-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M22 14h-8c-4.418 0-8 3.582-8 8v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvSaveSquare = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <Rect x="7" y="7" width="14" height="14" rx="2" stroke={color} strokeWidth="1.5" />
  </Svg>
);
