/**
 * Chart Feature UI: ChartToolbarIcons
 * 
 * A collection of reusable, scalable SVG vector icons specifically designed
 * for the various drawing tools and indicators in the chart's sidebar toolbar.
 */

import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline, G } from 'react-native-svg';

export const TvCrosshair = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M14 6v16M6 14h16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="14" r="2" fill={color} />
  </Svg>
);

export const TvTrendLine = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="7" y1="21" x2="21" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="7" cy="21" r="2" fill={color} />
    <Circle cx="21" cy="7" r="2" fill={color} />
  </Svg>
);

export const TvFib = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Line x1="6" y1="8" x2="22" y2="8" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    <Line x1="6" y1="14" x2="22" y2="14" stroke={color} strokeWidth="1.5" />
    <Line x1="6" y1="20" x2="22" y2="20" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    <Circle cx="14" cy="8" r="1.5" fill={color} />
    <Circle cx="14" cy="20" r="1.5" fill={color} />
    <Line x1="14" y1="8" x2="14" y2="20" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity={0.5} />
  </Svg>
);

export const TvBrush = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M18.5 5.5c1 1 2.5 3.5 1 5l-5.5 5.5c-2 2-5 3.5-7.5 3.5 0-2 1.5-5 3.5-7.5l5.5-5.5c1.5-1.5 4-2 5-1z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M12 13l3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvPatterns = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Polyline points="7,21 11,8 14,18 18,10 21,21" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Circle cx="7" cy="21" r="1.5" fill={color} />
    <Circle cx="11" cy="8" r="1.5" fill={color} />
    <Circle cx="14" cy="18" r="1.5" fill={color} />
    <Circle cx="18" cy="10" r="1.5" fill={color} />
    <Circle cx="21" cy="21" r="1.5" fill={color} />
  </Svg>
);

export const TvPrediction = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="9" y="7" width="10" height="14" rx="1" stroke={color} strokeWidth="1.5" />
    <Line x1="9" y1="14" x2="19" y2="14" stroke={color} strokeWidth="1.5" />
    <Path d="M14 11v6" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvTpSl = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M8 9h10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M8 19h10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M14 6v16" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="2 2" opacity="0.35" />
    <Circle cx="8" cy="9" r="1.6" fill="#2962FF" />
    <Circle cx="8" cy="19" r="1.6" fill="#F23645" />
    <Path d="M20 12V6M20 6l-2.5 2.5M20 6l2.5 2.5" stroke="#2962FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M20 16v6M20 22l-2.5-2.5M20 22l2.5-2.5" stroke="#F23645" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvSmiley = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Circle cx="14" cy="14" r="8" stroke={color} strokeWidth="1.5" />
    <Path d="M10 16.5a4.5 4.5 0 008 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="10.5" cy="11.5" r="1" fill={color} />
    <Circle cx="17.5" cy="11.5" r="1" fill={color} />
  </Svg>
);

export const TvText = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M6 7h16M14 7v15M11 22h6M6 7v3M22 7v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvMeasure = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="5" y="8" width="18" height="12" rx="2" transform="rotate(-30 5 8)" stroke={color} strokeWidth="1.5" />
    <Line x1="10" y1="7" x2="11" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="14" y1="5" x2="16" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="19" y1="2" x2="20" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvZoom = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.5" />
    <Line x1="17" y1="17" x2="22" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="9" y1="12" x2="15" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="12" y1="9" x2="12" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvMagnet = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M7 14v4c0 3.866 3.134 7 7 7s7-3.134 7-7v-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Rect x="5" y="8" width="4" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="19" y="8" width="4" height="6" rx="1" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvPencil = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M19.5 5.5l3 3-13 13-4.5 1 1-4.5 13-13z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M16 9l3 3" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
  </Svg>
);

export const TvLock = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="7" y="12" width="14" height="10" rx="2" stroke={color} strokeWidth="1.5" />
    <Path d="M10 12V8c0-2.209 1.791-4 4-4s4 1.791 4 4v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="17" r="1.5" fill={color} />
  </Svg>
);

export const TvStayInDrawingMode = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M16 5l4 4-8 8-4 1 1-4 8-8z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M14 7l4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Rect x="15" y="16" width="7" height="5" rx="1" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.2" />
    <Path d="M16.5 16v-1.5a2 2 0 014 0v1.5" stroke={color} strokeWidth="1" />
  </Svg>
);

export const TvHide = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M4 13c0 0 4-6 10-6s10 6 10 6-3 5-7.5 5.8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M4 13c0 0 2.5 4.5 7 5.7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Circle cx="14" cy="13" r="3" stroke={color} strokeWidth="1.5" />
    <Path d="M22 17l-3 3-2-2 3-3 2 2zM17 22c-1 1-2 1-2 0s1-2 2-2" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
  </Svg>
);

export const TvTrash = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M5 8h18M11 5h6M8 8v14a2 2 0 002 2h8a2 2 0 002-2V8M12 12v6M16 12v6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvLayers = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M14 6l-8 4 8 4 8-4-8-4z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <Path d="M6 14l8 4 8-4M6 19l8 4 8-4" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
  </Svg>
);

export const TvCandles = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="8" y="10" width="4" height="8" rx="0.5" stroke={color} strokeWidth="1.5" />
    <Line x1="10" y1="6" x2="10" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="10" y1="18" x2="10" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Rect x="16" y="8" width="4" height="6" rx="0.5" stroke={color} strokeWidth="1.5" />
    <Line x1="18" y1="4" x2="18" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Line x1="18" y1="14" x2="18" y2="20" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvFx = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M9 20V14M9 14h3M9 14C9 8 13 8 13 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14 20l5-6m-5 0l5 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TvGrid4 = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="6" y="6" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="16" y="6" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="6" y="16" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    <Rect x="16" y="16" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvUndo = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M10 10l-4 4 4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M6 14h8c4.418 0 8 3.582 8 8v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvRedo = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M18 10l4 4-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M22 14h-8c-4.418 0-8 3.582-8 8v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const TvSaveSquare = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Rect x="7" y="7" width="14" height="14" rx="2" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvPitchfork = ({ color }: { color: string }) => (
  <Svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <Path d="M12 9V8c0-1.1.9-2 2-2s2 .9 2 2v1" stroke={color} strokeWidth="1.5" />
    <Path d="M7 11V6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M21 11V6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M7 11c0 3.866 3.134 7 7 7s7-3.134 7-7" stroke={color} strokeWidth="1.5" />
    <Path d="M14 18v6" stroke={color} strokeWidth="1.5" />
  </Svg>
);

export const TvRadialObjects = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Path
      d="M10 3.6L4.1 6.8L10 10L15.9 6.8L10 3.6Z"
      stroke={color}
      strokeWidth="1.35"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M4.6 10.2L10 13.2L15.4 10.2"
      stroke={color}
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M4.6 13.5L10 16.4L15.4 13.5"
      stroke={color}
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export const TvRadialShapes = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Path
      d="M6 3.5 H2.5 V16.5 H6"
      stroke={color}
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Circle
      cx="13"
      cy="7"
      r="3"
      stroke={color}
      strokeWidth="1.35"
      fill="none"
    />
    <Path
      d="M13 10 L8 17 L18 17 Z"
      stroke={color}
      strokeWidth="1.35"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

export const TvRadialPencil = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Path
      d="M5 13.9L4.2 16L6.3 15.2L14.8 6.7L13.5 5.4L5 13.9Z"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M12.7 4.8L14 3.5C14.5 3 15.2 3 15.7 3.5L16.7 4.5C17.2 5 17.2 5.7 16.7 6.2L15.4 7.5"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M11.9 6.9L15.2 10.2"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const TvRadialSettings = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Line x1="3.5" y1="5.5" x2="16.5" y2="5.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="3.5" y1="10" x2="16.5" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="3.5" y1="14.5" x2="16.5" y2="14.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Circle cx="7.5" cy="5.5" r="1.6" fill="#FFFFFF" stroke={color} strokeWidth="1.3" />
    <Circle cx="12.5" cy="10" r="1.6" fill="#FFFFFF" stroke={color} strokeWidth="1.3" />
    <Circle cx="8.5" cy="14.5" r="1.6" fill="#FFFFFF" stroke={color} strokeWidth="1.3" />
  </Svg>
);

export const TvRadialPlus = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Line x1="10" y1="3.6" x2="10" y2="7.4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="10" y1="12.6" x2="10" y2="16.4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="3.6" y1="10" x2="7.4" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="12.6" y1="10" x2="16.4" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="10" y1="7.9" x2="10" y2="12.1" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <Line x1="7.9" y1="10" x2="12.1" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </Svg>
);

export const TvRadialIndicators = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <Path d="M2.5 12.1H4.9L6.9 8.1L8.9 13.2L11.1 9.6L13.2 10.2L17.5 6.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
