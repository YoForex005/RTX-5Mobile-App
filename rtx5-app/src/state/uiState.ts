import { create } from 'zustand';

type ActionSheetAction = { label: string; danger?: boolean; onPress?: () => void };

type ActionSheetConfig = {
  title?: string;
  actions: ActionSheetAction[];
};

type UIState = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  isChartFullscreen: boolean;
  setChartFullscreen: (open: boolean) => void;

  isSearchActive: boolean;
  setSearchActive: (active: boolean) => void;

  actionSheet: ActionSheetConfig | null;
  showActionSheet: (config: ActionSheetConfig) => void;
  hideActionSheet: () => void;
};

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
