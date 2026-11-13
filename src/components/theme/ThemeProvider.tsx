import React, { createContext, useContext, useEffect } from 'react';
import { useThemeStore, ThemeMode, ColorPalette, ThemeConfig, applyThemeToDOM } from '../../stores/themeStore';

interface ThemeContextType {
  theme: ThemeMode;
  mode: ThemeMode;
  colorPalette: ColorPalette;
  themeConfig: ThemeConfig;
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  setMode: (mode: ThemeMode) => void;
  setColorPalette: (palette: ColorPalette) => void;
  setFullTheme: (config: ThemeConfig) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, setMode, setColorPalette, setTheme, toggleMode } = useThemeStore();

  // On mount and state change, ensure class="dark" and data-theme="[palette]" are applied
  useEffect(() => {
    applyThemeToDOM(theme.mode, theme.colorPalette);
  }, [theme.mode, theme.colorPalette]);

  const value: ThemeContextType = {
    theme: theme.mode,
    mode: theme.mode,
    colorPalette: theme.colorPalette,
    themeConfig: theme,
    isDarkMode: theme.mode === 'dark',
    toggleTheme: toggleMode,
    setTheme: (newMode: ThemeMode) => setMode(newMode),
    setMode,
    setColorPalette,
    setFullTheme: setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    // Graceful fallback to store directly if used outside provider
    const store = useThemeStore.getState();
    return {
      theme: store.theme.mode,
      mode: store.theme.mode,
      colorPalette: store.theme.colorPalette,
      themeConfig: store.theme,
      isDarkMode: store.theme.mode === 'dark',
      toggleTheme: store.toggleMode,
      setTheme: (m) => store.setMode(m),
      setMode: store.setMode,
      setColorPalette: store.setColorPalette,
      setFullTheme: store.setTheme,
    };
  }
  return context;
};
