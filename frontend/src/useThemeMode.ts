import { useEffect, useState } from 'react';
import { useApp } from './store';
import type { Mode } from './theme';

function systemMode(): Mode {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Mode effectif (préférence utilisateur ou système) ; applique data-theme sur <html>. */
export function useThemeMode(): Mode {
  const pref = useApp((s) => s.theme);
  const [sys, setSys] = useState<Mode>(systemMode);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setSys(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const mode: Mode = pref === 'system' ? sys : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);
  return mode;
}
