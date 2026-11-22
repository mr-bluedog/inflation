# euroinfl — moteur de prévision HICPxT (EA, IT, FR, DE, ES)

Lire d'abord **MODELES.md** (explications, élasticités, backtest, limites).

    pip install pandas numpy
    python run_all.py            # prévisions, scénarios, sensibilités → out/   (≈ 15 s)
    python run_backtest.py       # backtest 2019-2025 (≈ 3 min)
    python summarize_backtest.py # RMSE + poids de combinaison BU/STAT

Entrées à mettre à jour : `data/market_inputs.json` (courbes ICE, EUR/USD, moyennes mensuelles récentes),
`data/hicp_*_I25.csv` (Eurostat prc_hicp_minr, unité I25), `data/weights_2026.csv` (prc_hicp_iw).
Le simulateur web est dans `site/` (copier out/dashboard_data.json dans site/ après un recalcul).
