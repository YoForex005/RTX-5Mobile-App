import { create } from 'zustand';

type ActionSheetAction = { label: string; danger?: boolean; onPress?: () => void };

type ActionSheetConfig = {
  title?: string;
  actions: ActionSheetAction[];
};

type UIState = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  actionSheet: ActionSheetConfig | null;
  showActionSheet: (config: ActionSheetConfig) => void;
  hideActionSheet: () => void;
};

export const useUIState = create<UIState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  actionSheet: null,
  showActionSheet: (config) => set({ actionSheet: config }),
  hideActionSheet: () => set({ actionSheet: null }),
}));
