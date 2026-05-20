import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readPreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function readEffectiveTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyEffective(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

function persistPreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readEffectiveTheme);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next: Theme =
        e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : systemTheme();
      applyEffective(next);
      setThemeState(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    applyEffective(next);
    persistPreference(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(readEffectiveTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggle };
}

export function useThemePreference() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [effective, setEffectiveState] = useState<Theme>(readEffectiveTheme);

  // Re-evaluate effective theme whenever the preference or OS setting changes.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const next: Theme = preference === 'system' ? systemTheme() : preference;
      applyEffective(next);
      setEffectiveState(next);
    };
    sync();
    if (preference === 'system') {
      mql.addEventListener('change', sync);
      return () => mql.removeEventListener('change', sync);
    }
  }, [preference]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setPreferenceState(
        e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : 'system',
      );
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    persistPreference(next);
    setPreferenceState(next);
  }, []);

  return { preference, effective, setPreference };
}
