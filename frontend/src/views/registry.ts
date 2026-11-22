/** Les 8 vues du plan §2 (navigation latérale). */
export interface ViewDef {
  path: string;
  label: string;
  description: string;
  phase: number;
  sources: string[];
}

export const VIEWS: ViewDef[] = [
  {
    path: '/',
    label: "Vue d'ensemble",
    description: 'Prochain fixing, trajectoire BU / STAT / COMBINE / marché, tableau 14 fixings × 5 pays.',
    phase: 3,
    sources: ['/api/headline', '/api/history'],
  },
  {
    path: '/pays',
    label: 'Pays',
    description: 'Contributions par composante (pp), détail énergie, pont comptable d’un fixing.',
    phase: 3,
    sources: ['/api/components'],
  },
  {
    path: '/simulateur',
    label: 'Simulateur de chocs',
    description: 'TTF, gasoil, EUR/USD, électricité, matières premières, salaires → impact en bp.',
    phase: 5,
    sources: ['/api/sensitivities', 'POST /api/simulate'],
  },
  {
    path: '/pass-through',
    label: 'Pass-through',
    description: 'Profils de transmission, élasticités, explorateur d’équations, zoom Italie gaz.',
    phase: 4,
    sources: ['/api/passthrough', '/api/elasticities', '/api/equations'],
  },
  {
    path: '/scenarios',
    label: 'Scénarios énergie',
    description: 'Les 6 scénarios de courbe gasoil et leurs effets sur HICPxT, énergie, carburants.',
    phase: 3,
    sources: ['/api/scenarios'],
  },
  {
    path: '/backtest',
    label: 'Backtest',
    description:
      'RMSE par horizon (BU, STAT, naïf, prix parfaits), erreurs par origine, poids de combinaison.',
    phase: 6,
    sources: ['/api/backtest', '/api/backtest/errors'],
  },
  {
    path: '/inputs',
    label: 'Inputs',
    description: 'Courbes à terme, mois estimés, explorateur des 97 séries de la base.',
    phase: 6,
    sources: ['/api/inputs/market', '/api/inputs/series'],
  },
  {
    path: '/methodologie',
    label: 'Méthodologie',
    description: 'Le modèle (MODELES.md), ses limites et la date des données.',
    phase: 3,
    sources: ['/api/methodology'],
  },
];
