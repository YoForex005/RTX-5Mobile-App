/**
 * Core module: uiState.ts
 */

import { create } from 'zustand';

/** Represents a single interactive button in an ActionSheet */
type ActionSheetAction = { 
  /** Display label for the button */
  label: string; 
  /** If true, styles the button as a destructive/danger action */
  danger?: boolean; 
  /** Callback fired when the user taps this action */
  onPress?: () => void 
};

/** Configuration object for triggering the global ActionSheet component */
type ActionSheetConfig = {
  /** Optional title to display at the top of the sheet */
  title?: string;
  /** List of buttons to render */
  actions: ActionSheetAction[];
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

  actionSheet: null,
  showActionSheet: (config) => set({ actionSheet: config }),
  hideActionSheet: () => set({ actionSheet: null }),
}));

