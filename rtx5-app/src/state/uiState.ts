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
  /** Optional secondary line below the main label */
  subtitle?: string;
  /** If true, styles the current choice with the active brand color */
  selected?: boolean;
  /** If true, styles the button as a destructive/danger action */
  danger?: boolean;
  /** If true, the action appears greyed-out and is not interactive */
  disabled?: boolean;
  /** If true, fires on press-in for tiny non-scroll action groups */
  activateOnPressIn?: boolean;
  /** Callback fired when the user taps this action */
  onPress?: () => void;
  /** Optional leading icon element */
  icon?: React.ReactNode;
};

/** Configuration object for triggering the global ActionSheet component */
export type ActionSheetConfig = {
  /** Optional title to display at the top of the sheet */
  title?: string;
  /** List of buttons to render */
  actions: ActionSheetAction[];
  /** Enable search filtering in the sheet */
  searchable?: boolean;
  /** Optional placeholder for searchable sheets */
  searchPlaceholder?: string;
  /** Sheet sizing detent */
  detent?: 'auto' | 'adaptive' | 'large';
  /** Minimum distance from the top of the screen */
  minimumTopInset?: number;
  /** If true, mounts the sheet visible immediately without the entry delay */
  instantOpen?: boolean;
  /** If true, defers action execution until after sheet dismiss animation */
  runActionAfterClose?: boolean;
  /** Android keyboard avoidance mode for searchable sheets */
  androidKeyboardAvoidance?: 'event' | 'resize';
};

export type ActionSheetScope =
  | 'quotes'
  | 'chart'
  | 'trade'
  | 'history'
  | 'settingsNews'
  | 'settingsAccounts'
  | 'settingsBrokerDetail';
type ScopedActionSheetState = Record<ActionSheetScope, ActionSheetConfig | null>;

const ACTION_SHEET_SCOPES: ActionSheetScope[] = [
  'quotes',
  'chart',
  'trade',
  'history',
  'settingsNews',
  'settingsAccounts',
  'settingsBrokerDetail',
];

const createEmptyScopedActionSheets = (): ScopedActionSheetState => ({
  quotes: null,
  chart: null,
  trade: null,
  history: null,
  settingsNews: null,
  settingsAccounts: null,
  settingsBrokerDetail: null,
});

const hasScopedActionSheet = (sheets: ScopedActionSheetState) =>
  ACTION_SHEET_SCOPES.some((scope) => sheets[scope] !== null);

const openScopedActionSheet = (
  sheets: ScopedActionSheetState,
  scope: ActionSheetScope,
  config: ActionSheetConfig,
): ScopedActionSheetState => ({
  ...sheets,
  [scope]: { ...config, instantOpen: true },
});

const hideScopedActionSheetState = (
  sheets: ScopedActionSheetState,
  scope: ActionSheetScope,
): ScopedActionSheetState => (
  sheets[scope] === null ? sheets : { ...sheets, [scope]: null }
);

const closeScopedActionSheet = (
  state: {
    actionSheetScope: ActionSheetScope | null;
    scopedActionSheets: ScopedActionSheetState;
  },
  scope: ActionSheetScope,
) => {
  const nextSheets = hideScopedActionSheetState(state.scopedActionSheets, scope);
  const nextScope = state.actionSheetScope === scope ? null : state.actionSheetScope;
  if (nextSheets === state.scopedActionSheets && nextScope === state.actionSheetScope) {
    return state;
  }

  return {
    actionSheetScope: nextScope,
    scopedActionSheets: nextSheets,
  };
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

  /** Tracks whether the chart is running an inline text-entry flow */
  isChartInlineInputActive: boolean;
  setChartInlineInputActive: (active: boolean) => void;

  /** Lifts the chart tab bar above Android keyboards when the host app does not resize */
  chartTabBarKeyboardLift: number;
  setChartTabBarKeyboardLift: (height: number) => void;

  /** Tool selection requested from the objects screen and consumed by the chart */
  pendingChartDrawingTool: ChartDrawingKind | null;
  queueChartDrawingTool: (tool: ChartDrawingKind) => void;
  clearPendingChartDrawingTool: () => void;

  /** Current active action sheet config. Null means closed. */
  actionSheet: ActionSheetConfig | null;
  /** Action sheet config to render invisibly in the background to pre-warm the layout engine */
  preloadedActionSheet: ActionSheetConfig | null;
  /** Independent action sheet configs for feature-owned dropdowns. */
  scopedActionSheets: ScopedActionSheetState;
  /** Feature-owned preloaded configs for local dropdown warmup. */
  preloadedScopedActionSheets: ScopedActionSheetState;
  /** Scope currently rendered by the shared host. */
  actionSheetScope: ActionSheetScope | null;
  /** Opens the global action sheet with the provided config */
  showActionSheet: (config: ActionSheetConfig) => void;
  /** Pre-loads a config into the hidden action sheet to trigger Native UI measurement */
  preloadActionSheet: (config: ActionSheetConfig) => void;
  /** Closes/hides the active action sheet */
  hideActionSheet: () => void;
  showScopedActionSheet: (scope: ActionSheetScope, config: ActionSheetConfig) => void;
  preloadScopedActionSheet: (scope: ActionSheetScope, config: ActionSheetConfig) => void;
  hideScopedActionSheet: (scope: ActionSheetScope) => void;
  showQuotesActionSheet: (config: ActionSheetConfig) => void;
  preloadQuotesActionSheet: (config: ActionSheetConfig) => void;
  hideQuotesActionSheet: () => void;
  showChartActionSheet: (config: ActionSheetConfig) => void;
  hideChartActionSheet: () => void;
  showTradeActionSheet: (config: ActionSheetConfig) => void;
  hideTradeActionSheet: () => void;
  showHistoryActionSheet: (config: ActionSheetConfig) => void;
  hideHistoryActionSheet: () => void;
  showNewsActionSheet: (config: ActionSheetConfig) => void;
  hideNewsActionSheet: () => void;
  showAccountsActionSheet: (config: ActionSheetConfig) => void;
  hideAccountsActionSheet: () => void;
  showBrokerDetailActionSheet: (config: ActionSheetConfig) => void;
  hideBrokerDetailActionSheet: () => void;
};

/**
 * Global store for ephemeral UI state (modals, overlays, toggles).
 * State is not persisted between app launches.
 */
export const useUIState = create<UIState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set((state) => (state.sidebarOpen === open ? state : { sidebarOpen: open })),

  isChartFullscreen: false,
  setChartFullscreen: (open) => set({ isChartFullscreen: open }),

  isSearchActive: false,
  setSearchActive: (active) => set({ isSearchActive: active }),

  isChartInlineInputActive: false,
  setChartInlineInputActive: (active) => set({ isChartInlineInputActive: active }),

  chartTabBarKeyboardLift: 0,
  setChartTabBarKeyboardLift: (height) => set({ chartTabBarKeyboardLift: Math.max(0, Math.round(height)) }),

  pendingChartDrawingTool: null,
  queueChartDrawingTool: (tool) => set({ pendingChartDrawingTool: tool }),
  clearPendingChartDrawingTool: () => set({ pendingChartDrawingTool: null }),

  actionSheet: null,
  preloadedActionSheet: null,
  scopedActionSheets: createEmptyScopedActionSheets(),
  preloadedScopedActionSheets: createEmptyScopedActionSheets(),
  actionSheetScope: null,
  showActionSheet: (config) => set({ actionSheet: { ...config, instantOpen: true } }),
  preloadActionSheet: (config) => set({ preloadedActionSheet: { ...config, instantOpen: true } }),
  hideActionSheet: () => set((state) => {
    if (
      state.actionSheet === null &&
      state.actionSheetScope === null &&
      !hasScopedActionSheet(state.scopedActionSheets)
    ) {
      return state;
    }

    return {
      actionSheet: null,
      actionSheetScope: null,
      scopedActionSheets: createEmptyScopedActionSheets(),
    };
  }),
  showScopedActionSheet: (scope, config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: scope,
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, scope, config),
  })),
  preloadScopedActionSheet: (scope, config) => set((state) => ({
    actionSheetScope: state.actionSheetScope ?? scope,
    preloadedScopedActionSheets: openScopedActionSheet(
      state.preloadedScopedActionSheets,
      scope,
      config,
    ),
  })),
  hideScopedActionSheet: (scope) => set((state) => closeScopedActionSheet(state, scope)),
  showQuotesActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'quotes',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'quotes', config),
  })),
  preloadQuotesActionSheet: (config) => set((state) => ({
    actionSheetScope: state.actionSheetScope ?? 'quotes',
    preloadedScopedActionSheets: openScopedActionSheet(
      state.preloadedScopedActionSheets,
      'quotes',
      config,
    ),
  })),
  hideQuotesActionSheet: () => set((state) => closeScopedActionSheet(state, 'quotes')),
  showChartActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'chart',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'chart', config),
  })),
  hideChartActionSheet: () => set((state) => closeScopedActionSheet(state, 'chart')),
  showTradeActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'trade',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'trade', config),
  })),
  hideTradeActionSheet: () => set((state) => closeScopedActionSheet(state, 'trade')),
  showHistoryActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'history',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'history', config),
  })),
  hideHistoryActionSheet: () => set((state) => closeScopedActionSheet(state, 'history')),
  showNewsActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'settingsNews',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'settingsNews', config),
  })),
  hideNewsActionSheet: () => set((state) => closeScopedActionSheet(state, 'settingsNews')),
  showAccountsActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'settingsAccounts',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'settingsAccounts', config),
  })),
  hideAccountsActionSheet: () => set((state) => closeScopedActionSheet(state, 'settingsAccounts')),
  showBrokerDetailActionSheet: (config) => set((state) => ({
    actionSheet: null,
    actionSheetScope: 'settingsBrokerDetail',
    scopedActionSheets: openScopedActionSheet(state.scopedActionSheets, 'settingsBrokerDetail', config),
  })),
  hideBrokerDetailActionSheet: () => set((state) => closeScopedActionSheet(state, 'settingsBrokerDetail')),
}));
