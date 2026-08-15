'use client';

import { resolveTheme, themeStyle, type BuiltInThemeId } from '@fog-of-lore/ui';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type ThemeContextValue = {
  theme: BuiltInThemeId;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = 'fog-of-lore-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<BuiltInThemeId>('tavern');

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'daylight' || saved === 'tavern') setTheme(saved);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    for (const [property, value] of Object.entries(themeStyle(resolveTheme(theme)))) {
      root.style.setProperty(property, String(value));
    }
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme: () => setTheme((current) => (current === 'tavern' ? 'daylight' : 'tavern')),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
