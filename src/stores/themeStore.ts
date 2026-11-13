import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

export type ColorPalette =
  | 'midnight'
  | 'slate_emerald'
  | 'obsidian'
  | 'classic'
  | 'warm_sand'
  | 'arctic_blue';

export interface ThemeConfig {
  mode: ThemeMode;
  colorPalette: ColorPalette;
}

export interface ThemeMeta {
  id: ColorPalette;
  name: string;
  category: 'dark' | 'light';
  description: string;
  accentLabel: string;
  colors: {
    bg: string;
    surface: string;
    text: string;
    accent: string;
    border: string;
  };
}

export const THEME_PALETTES: ThemeMeta[] = [
  // Dark Themes
  {
    id: 'midnight',
    name: 'Midnight',
    category: 'dark',
    description: 'Deep charcoal backgrounds, soft white text, Indigo accent.',
    accentLabel: 'Indigo',
    colors: {
      bg: '#0b0f19',
      surface: '#111827',
      text: '#f9fafb',
      accent: '#6366f1',
      border: '#1f2937',
    },
  },
  {
    id: 'slate_emerald',
    name: 'Slate & Emerald',
    category: 'dark',
    description: 'Dark blue-gray background, muted teal/emerald accents, very professional.',
    accentLabel: 'Emerald',
    colors: {
      bg: '#0b1320',
      surface: '#111d30',
      text: '#f1f5f9',
      accent: '#10b981',
      border: '#1c2d46',
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    category: 'dark',
    description: 'Pure black #000000 background, dark gray cards, bright white text, subtle violet accent.',
    accentLabel: 'Violet',
    colors: {
      bg: '#000000',
      surface: '#111113',
      text: '#ffffff',
      accent: '#8b5cf6',
      border: '#222226',
    },
  },
  // Light Themes
  {
    id: 'classic',
    name: 'Classic',
    category: 'light',
    description: 'Pure white background, light gray surfaces, crisp black text, Indigo accent.',
    accentLabel: 'Indigo',
    colors: {
      bg: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      accent: '#4f46e5',
      border: '#e2e8f0',
    },
  },
  {
    id: 'warm_sand',
    name: 'Warm Sand',
    category: 'light',
    description: 'Soft off-white #FAFAF7 background, light beige cards, dark brown text, terracotta/amber accent.',
    accentLabel: 'Terracotta',
    colors: {
      bg: '#fafaf7',
      surface: '#f5f4ef',
      text: '#292524',
      accent: '#c2410c',
      border: '#e5e2d6',
    },
  },
  {
    id: 'arctic_blue',
    name: 'Arctic Blue',
    category: 'light',
    description: 'Very pale blue background, white cards, dark slate text, cool blue accent.',
    accentLabel: 'Cool Blue',
    colors: {
      bg: '#f0f7ff',
      surface: '#ffffff',
      text: '#0f172a',
      accent: '#0284c7',
      border: '#d0e4ff',
    },
  },
];

const STORAGE_KEY = 'rentflow-theme';

export const applyThemeToDOM = (mode: ThemeMode, colorPalette: ColorPalette) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.setAttribute('data-theme', colorPalette);
  root.setAttribute('data-mode', mode);
};

const getInitialTheme = (): ThemeConfig => {
  if (typeof window === 'undefined') {
    return { mode: 'light', colorPalette: 'classic' };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.mode === 'light' || parsed.mode === 'dark')) {
          const validPalette = THEME_PALETTES.some((p) => p.id === parsed.colorPalette)
            ? parsed.colorPalette
            : parsed.mode === 'dark'
            ? 'midnight'
            : 'classic';
          return { mode: parsed.mode, colorPalette: validPalette };
        }
      } else if (raw === 'dark' || raw === 'light') {
        return {
          mode: raw,
          colorPalette: raw === 'dark' ? 'midnight' : 'classic',
        };
      }
    }

    // Check legacy storage keys if present
    const legacyConfig = localStorage.getItem('rentflow_theme_config');
    if (legacyConfig) {
      const parsed = JSON.parse(legacyConfig);
      if (parsed && (parsed.mode === 'light' || parsed.mode === 'dark')) {
        return { mode: parsed.mode, colorPalette: parsed.colorPalette || (parsed.mode === 'dark' ? 'midnight' : 'classic') };
      }
    }

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const mode: ThemeMode = prefersDark ? 'dark' : 'light';
    const colorPalette: ColorPalette = prefersDark ? 'midnight' : 'classic';
    return { mode, colorPalette };
  } catch (err) {
    console.warn('Failed to read theme from localStorage:', err);
    return { mode: 'light', colorPalette: 'classic' };
  }
};

interface ThemeState {
  theme: ThemeConfig;
  setMode: (mode: ThemeMode) => void;
  setColorPalette: (palette: ColorPalette) => void;
  setTheme: (theme: ThemeConfig) => void;
  toggleMode: () => void;
}

// Synchronously load and apply on startup (no flashing)
const initialTheme = getInitialTheme();
applyThemeToDOM(initialTheme.mode, initialTheme.colorPalette);

const persistAndApply = (config: ThemeConfig) => {
  applyThemeToDOM(config.mode, config.colorPalette);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Could not save theme to localStorage:', e);
  }
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,

  setMode: (mode: ThemeMode) => {
    set((state) => {
      let nextPalette = state.theme.colorPalette;
      const currentMeta = THEME_PALETTES.find((p) => p.id === nextPalette);
      if (currentMeta && currentMeta.category !== mode) {
        nextPalette = mode === 'dark' ? 'midnight' : 'classic';
      }
      const nextConfig: ThemeConfig = { mode, colorPalette: nextPalette };
      persistAndApply(nextConfig);
      return { theme: nextConfig };
    });
  },

  setColorPalette: (palette: ColorPalette) => {
    set((state) => {
      const paletteMeta = THEME_PALETTES.find((p) => p.id === palette);
      const nextMode = paletteMeta ? paletteMeta.category : state.theme.mode;
      const nextConfig: ThemeConfig = { mode: nextMode, colorPalette: palette };
      persistAndApply(nextConfig);
      return { theme: nextConfig };
    });
  },

  setTheme: (themeConfig: ThemeConfig) => {
    persistAndApply(themeConfig);
    set({ theme: themeConfig });
  },

  toggleMode: () => {
    set((state) => {
      const nextMode: ThemeMode = state.theme.mode === 'dark' ? 'light' : 'dark';
      let nextPalette = state.theme.colorPalette;
      const currentMeta = THEME_PALETTES.find((p) => p.id === nextPalette);
      if (currentMeta && currentMeta.category !== nextMode) {
        nextPalette = nextMode === 'dark' ? 'midnight' : 'classic';
      }
      const nextConfig: ThemeConfig = { mode: nextMode, colorPalette: nextPalette };
      persistAndApply(nextConfig);
      return { theme: nextConfig };
    });
  },
}));
