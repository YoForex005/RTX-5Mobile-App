import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type TradeNotificationsState = {
  enabledKeys: Record<string, true>;
  setEnabled: (key: string, enabled: boolean) => void;
};

const STORAGE_KEY = 'tradeNotifications';

export const useTradeNotifications = create<TradeNotificationsState>()(
  persist(
    (set) => ({
      enabledKeys: {},
      setEnabled: (key, enabled) =>
        set((state) => {
          if (enabled) {
            if (state.enabledKeys[key]) return state;
            return { enabledKeys: { ...state.enabledKeys, [key]: true } };
          }
          if (!state.enabledKeys[key]) return state;
          const next = { ...state.enabledKeys };
          delete next[key];
          return { enabledKeys: next };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export function buildTradeNotificationKey(brokerId: string, login: string) {
  return `${brokerId}:${login}`;
}
