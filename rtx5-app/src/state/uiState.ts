/**
 * Core module: uiState.ts
 */

import React from 'react';
import { create } from 'zustand';
import type { ChartDrawingKind } from '../features/chart/drawingPersistence';

/** Represents a single interactive button in an ActionSheet */
type ActionSheetAction = {
  /** Display label for the button */
  label: string;
  /** If true, styles the button as a destructive/danger action */
  danger?: boolean;
  /** If true, the action appears greyed-out and is not interactive */
  disabled?: boolean;
  /** Callback fired when the user taps this action */
  onPress?: () => void;
  /** Optional leading icon element */
  icon?: React.ReactNode;
};

/** Configuration object for triggering the global ActionSheet component */
type ActionSheetConfig = {
  /** Optional title to display at the top of the sheet */
  title?: string;
  /** List of buttons to render */
  actions: ActionSheetAction[];
  /** Enable search filtering in the sheet */
  searchable?: boolean;
  /** Sheet sizing detent */
  detent?: 'auto' | 'adaptive' | 'large';
  /** Minimum distance from the top of the screen */
  minimumTopInset?: number;
  /** If true, defers action execution until after sheet dismiss animation */
  runActionAfterClose?: boolean;
};

/**
 * Zustand interface for ephemereal, pure UI states that don't need persistence.
 */
type UIState = {
  /** Controls visibility of the main app sidebar/drawer */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  /** Controls whether the chart view is expanded to conceal the trade panels */
  isChartFullscreen: boolean;
  setChartFullscreen: (open: boolean) => void;

  /** Tracks if a global search modal/input is active */
  isSearchActive: boolean;
  setSearchActive: (active: boolean) => void;

  /** Tracks whether the chart is running an inline text-entry flow that should hide the tab bar */
  isChartInlineInputActive: boolean;
  setChartInlineInputActive: (active: boolean) => void;

  /** Tool selection requested from the objects screen and consumed by the chart */
  pendingChartDrawingTool: ChartDrawingKind | null;
  queueChartDrawingTool: (tool: ChartDrawingKind) => void;
  clearPendingChartDrawingTool: () => void;

  /** Current active action sheet config. Null means closed. */
  actionSheet: ActionSheetConfig | null;
  /** Opens the global action sheet with the provided config */
  showActionSheet: (config: ActionSheetConfig) => void;
  /** Closes/hides the active action sheet */
  hideActionSheet: () => void;
};

/**
 * Global store for ephemeral UI state (modals, overlays, toggles).
 * State is not persisted between app launches.
 */
export const useUIState = create<UIState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  isChartFullscreen: false,
  setChartFullscreen: (open) => set({ isChartFullscreen: open }),

  isSearchActive: false,
  setSearchActive: (active) => set({ isSearchActive: active }),

  isChartInlineInputActive: false,
  setChartInlineInputActive: (active) => set({ isChartInlineInputActive: active }),

  pendingChartDrawingTool: null,
  queueChartDrawingTool: (tool) => set({ pendingChartDrawingTool: tool }),
  clearPendingChartDrawingTool: () => set({ pendingChartDrawingTool: null }),

  actionSheet: null,
  showActionSheet: (config) => set({ actionSheet: config }),
  hideActionSheet: () => set({ actionSheet: null }),
}));
