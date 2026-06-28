'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = 'hermes-theme';

const lightThemeVars: Record<string, string> = {
  '--bg': '#F8FAFC',
  '--bg2': '#FFFFFF',
  '--bg3': '#F1F5F9',
  '--bg4': '#E2E8F0',
  '--bg5': '#F8FAFC',
  '--border': '#CBD5E1',
  '--border2': '#94A3B8',
  '--cyan': '#0D9488',
  '--ind': '#6366F1',
  '--amb': '#D97706',
  '--red': '#DC2626',
  '--grn': '#16A34A',
  '--orn': '#EA580C',
  '--txt': '#1E293B',
  '--txt2': '#475569',
  '--txt3': '#94A3B8',
};

const darkThemeVars: Record<string, string> = {
  '--bg': '#07090F',
  '--bg2': '#0B0F1A',
  '--bg3': '#0F1520',
  '--bg4': '#131B28',
  '--bg5': '#050709',
  '--border': '#16233A',
  '--border2': '#1E3050',
  '--cyan': '#00D4AA',
  '--ind': '#6366F1',
  '--amb': '#F59E0B',
  '--red': '#EF4444',
  '--grn': '#22C55E',
  '--orn': '#F97316',
  '--txt': '#C8D6F0',
  '--txt2': '#8a9bb5',
  '--txt3': '#6f829f',
};

function applyThemeVars(vars: Record<string, string>) {
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setThemeState(initial);
    applyThemeVars(initial === 'light' ? lightThemeVars : darkThemeVars);
    setMounted(true);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    applyThemeVars(newTheme === 'light' ? lightThemeVars : darkThemeVars);
    document.documentElement.setAttribute('data-theme', newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

  // Prevent flash of wrong theme
  if (!mounted) {
    return (
      <ThemeContext.Provider value={value}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { ThemeContext };
