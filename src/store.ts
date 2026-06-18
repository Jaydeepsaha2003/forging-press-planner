import { create } from 'zustand';
import type { Settings } from '../shared/types';
import { fp } from './lib/fp';

interface AppState {
  month: string;
  settings: Settings | null;
  setMonth: (m: string) => void;
  reload: () => Promise<void>;
}

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

export const useApp = create<AppState>((set) => ({
  month: currentMonth,
  settings: null,
  setMonth: (m: string) => {
    set({ month: m });
    fp.invoke(fp.channels.SETTINGS_UPDATE, { current_month: m });
  },
  reload: async () => {
    const settings = await fp.invoke<Settings>(fp.channels.SETTINGS_GET);
    set({ settings, month: settings.current_month });
  },
}));
