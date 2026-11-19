import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

export type ColorPalette =
  | 'classic'
  | 'white_rose'
  | 'white_sage'
  | 'ethereal_glass'
  | 'warm_sand'
  | 'arctic_blue'
  | 'midnight'
  | 'slate_grey'
  | 'slate_emerald'
  | 'oled_black'
  | 'obsidian';

export interface ThemeConfig {
  mode: ThemeMode;
  colorPalette: ColorPalette;
}

export interface ThemeMeta {
  id: ColorPalette;
  name: string;
  category: 'dark' | 'light';
  supportsBothModes?: boolean;
  isGlass?: boolean;
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
  // Light & Minimalist Themes
  {
    id: 'classic',
    name: 'Classic',
    category: 'light',
    description: 'Clean neutral canvas, crisp white cards, high-contrast slate text, Indigo accent.',
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
    id: 'white_rose',
    name: 'White / Rose',
    category: 'light',
    description: 'Clean white surfaces with soft, refined non-neon Rose accents.',
    accentLabel: 'Soft Rose',
    colors: {
      bg: '#fdfbfc',
      surface: '#ffffff',
      text: '#18181b',
      accent: '#be4b69',
      border: '#f0e5e8',
    },
  },
  {
    id: 'white_sage',
    name: 'White / Sage',
    category: 'light',
    description: 'Crisp white background paired with calm, natural Sage green accents.',
    accentLabel: 'Sage',
    colors: {
      bg: '#fafcfb',
      surface: '#ffffff',
      text: '#18181b',
      accent: '#4b7a5e',
      border: '#e2ebe5',
    },
  },
  {
    id: 'ethereal_glass',
    name: 'Ethereal Glass',
    category: 'light',
    supportsBothModes: true,
    isGlass: true,
    description: 'Translucent frosted glass cards and sidebars with backdrop blur and crisp opaque text.',
    accentLabel: 'Frosted Indigo',
    colors: {
      bg: '#e9eef6',
      surface: 'rgba(255, 255, 255, 0.6)',
      text: '#0f172a',
      accent: '#4f46e5',
      border: 'rgba(148, 163, 184, 0.35)',
    },
  },
  {
    id: 'warm_sand',
    name: 'Warm Sand',
    category: 'light',
    description: 'Soft off-white #FAFAF7 background, warm stone surfaces, terracotta accent.',
    accentLabel: 'Terracotta',
    colors: {
      bg: '#fafaf7',
      surface: '#ffffff',
      text: '#292524',
      accent: '#c2410c',
      border: '#e7e5dc',
    },
  },
  {
    id: 'arctic_blue',
    name: 'Arctic Blue',
    category: 'light',
    description: 'Pale sky canvas, clean white surfaces, slate text, cool blue accent.',
    accentLabel: 'Cool Blue',
    colors: {
      bg: '#f0f7ff',
      surface: '#ffffff',
      text: '#0f172a',
      accent: '#0284c7',
      border: '#d0e4ff',
    },
  },
  // Dark & Comfort Themes
  {
    id: 'oled_black',
    name: 'Pure Black (OLED)',
    category: 'dark',
    description: 'True #000000 OLED canvas, #111111 elevated cards, and crisp white text.',
    accentLabel: 'Pure White / Indigo',
    colors: {
      bg: '#000000',
      surface: '#111111',
      text: '#ffffff',
      accent: '#6366f1',
      border: '#242424',
    },
  },
  {
    id: 'slate_grey',
    name: 'Slate Grey',
    category: 'dark',
    description: 'Muted, low-glare neutral grey workspace engineered for long working hours.',
    accentLabel: 'Muted Slate',
    colors: {
      bg: '#1f2228',
      surface: '#282c34',
      text: '#e6e8ec',
      accent: '#6b8afd',
      border: '#383d47',
    },
  },
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
    description: 'Dark blue-gray background with muted teal and emerald accents.',
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
    name: 'Obsidian Violet',
    category: 'dark',
    description: 'Deep #000000 canvas, dark charcoal cards, bright white text, violet accent.',
    accentLabel: 'Violet',
    colors: {
      bg: '#000000',
      surface: '#111113',
      text: '#ffffff',
      accent: '#8b5cf6',
      border: '#222226',
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

    const legacyConfig = localStorage.getItem('rentflow_theme_config');
    if (legacyConfig) {
      const parsed = JSON.parse(legacyConfig);
      if (parsed && (parsed.mode === 'light' || parsed.mode === 'dark')) {
        const validPalette = THEME_PALETTES.some((p) => p.id === parsed.colorPalette)
          ? parsed.colorPalette
          : parsed.mode === 'dark'
          ? 'midnight'
          : 'classic';
        return { mode: parsed.mode, colorPalette: validPalette };
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
      if (currentMeta && !currentMeta.supportsBothModes && currentMeta.category !== mode) {
        nextPalette = mode === 'dark' ? 'oled_black' : 'classic';
      }
      const nextConfig: ThemeConfig = { mode, colorPalette: nextPalette };
      persistAndApply(nextConfig);
      return { theme: nextConfig };
    });
  },

  setColorPalette: (palette: ColorPalette) => {
    set((state) => {
      const paletteMeta = THEME_PALETTES.find((p) => p.id === palette);
      const nextMode = paletteMeta
        ? paletteMeta.supportsBothModes
          ? state.theme.mode
          : paletteMeta.category
        : state.theme.mode;
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
      if (currentMeta && !currentMeta.supportsBothModes && currentMeta.category !== nextMode) {
        nextPalette = nextMode === 'dark' ? 'oled_black' : 'classic';
      }
      const nextConfig: ThemeConfig = { mode: nextMode, colorPalette: nextPalette };
      persistAndApply(nextConfig);
      return { theme: nextConfig };
    });
  },
}));
