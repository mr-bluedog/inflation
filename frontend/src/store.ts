/** État global (Zustand) : pays, modèle, fixing sélectionné, thème. Pays, modèle et thème sont mémorisés
 * localement (confort par navigateur ; l'appli fonctionne sans stockage). */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Geo, ModelKey } from './api/types';

export type ThemePref = 'system' | 'light' | 'dark';

interface AppState {
  geo: Geo;
  model: ModelKey;
  fixing: string | null;
  theme: ThemePref;
  /** dernière configuration du simulateur (query string), pour y revenir depuis l'en-tête */
  simSearch: string;
  recalcTick: number;
  setSimSearch: (s: string) => void;
  bumpRecalc: () => void;
  setGeo: (g: Geo) => void;
  setModel: (m: ModelKey) => void;
  setFixing: (f: string | null) => void;
  setTheme: (t: ThemePref) => void;
}

/** localStorage peut être indisponible (navigation privée, aperçu) : on l'enveloppe. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* ignoré */
    }
  },
  removeItem: (k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignoré */
    }
  },
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      geo: 'EA',
      model: 'COMBINE',
      fixing: null,
      theme: 'system',
      simSearch: '',
      recalcTick: 0,
      setSimSearch: (simSearch) => set({ simSearch }),
      bumpRecalc: () => set((s) => ({ recalcTick: s.recalcTick + 1 })),
      setGeo: (geo) => set({ geo }),
      setModel: (model) => set({ model }),
      setFixing: (fixing) => set({ fixing }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'inflation-dashboard',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ geo: s.geo, model: s.model, theme: s.theme, simSearch: s.simSearch }),
    },
  ),
);
