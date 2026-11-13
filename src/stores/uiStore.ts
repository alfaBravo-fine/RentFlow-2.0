import { create } from 'zustand';

export type UILayout = 'sidebar' | 'top-tabs';

interface UIState {
  uiLayout: UILayout;
  setUILayout: (layout: UILayout) => void;
  toggleLayout: () => void;
}

const STORAGE_LAYOUT_KEY = 'rentflow_ui_layout';

const getInitialLayout = (): UILayout => {
  if (typeof localStorage === 'undefined') return 'sidebar';
  const stored = localStorage.getItem(STORAGE_LAYOUT_KEY);
  if (stored === 'top-tabs' || stored === 'excel') return 'top-tabs';
  return 'sidebar';
};

export const useUIStore = create<UIState>((set) => ({
  uiLayout: getInitialLayout(),
  setUILayout: (layout: UILayout) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_LAYOUT_KEY, layout);
    }
    set({ uiLayout: layout });
  },
  toggleLayout: () => {
    set((state) => {
      const next: UILayout = state.uiLayout === 'sidebar' ? 'top-tabs' : 'sidebar';
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_LAYOUT_KEY, next);
      }
      return { uiLayout: next };
    });
  },
}));
