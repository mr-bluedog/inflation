# Dictionnaire de données — `data/raw/euro_inflation_database_long.csv`

Format long : 29 501 observations  97 séries  périodes 1986-04 → 2026-Q2.

Colonnes : `date`, `period`, `frequency`, `indicator_code`, `indicator_label`, `component`, `transmission_role`, `geo`, `unit`, `seasonal_adjustment`, `value`, `source_dataset`, `source_file`, `source_url`, `source_key`, `source_update`, `quality_flag`, `model_use`

Clé de pivot conseillée : `df.pivot_table(index='period', columns='indicator_code', values='value', aggfunc='first')` (fréquence M ; les séries A/Q sont à traiter à part).

Les séries `legacy_*` sont les prix de gros utilisés par le moteur (gaz TTF, électricité FR/DE, gasoil, Brent, EUR/USD).

| code | libellé | composante | rôle | geo | fréq | unité | début | fin | n | source | usage |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `legacy_core` | Euro-area core HICP | Core | Model target | EA | M | % y/y | 2001-08 | 2026-06 | 299 | Database_inflation | existing_BU_V3_input |
| `legacy_core_bbg` | Euro-area core inflation, legacy | Core | Legacy model input | EA | M | % y/y | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `us_core_cpi_index` | US CPI excluding food and energy | Core | External underlying inflation | US | M | index 1982-84=100 | 1990-01 | 2026-07 | 438 | FRED | qrf_predictor |
| `es_ppi_energy_index` | Energy producer price index | Energy | QRF producer-price predictor | EA21 | M | index 2021=100 | 2000-01 | 2026-06 | 318 | sts_inpp_m | qrf_exact_predictor |
| `es_ppi_energy_yoy` | Energy producer prices | Energy | Energy shock | EA21 | M | % y/y | 2001-01 | 2026-06 | 306 | sts_inpp_m | candidate_driver |
| `legacy_energy` | Euro-area HICP energy | Energy | Model target | EA | M | % y/y | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `ecb_commodity_import_food_index` | ECB import-weighted food commodity price index | Food | Imported commodity cost pressure | EA21 | M | index | 2006-01 | 2026-07 | 247 | ECB_NEC | qrf_close_definition |
| `es_food_production_yoy` | Food manufacturing production | Food | Food supply context | EA21 | M | % y/y | 1993-01 | 2026-06 | 402 | sts_inpr_m | candidate_driver |
| `es_import_food_yoy` | Food manufacturing import prices | Food | Imported food pipeline | EA21 | M | % y/y | 2006-01 | 2026-06 | 246 | sts_inpi_m | candidate_driver |
| `es_ppi_food_yoy` | Food manufacturing producer prices | Food | Food pipeline | EA21 | M | % y/y | 2001-01 | 2026-06 | 306 | sts_inpp_m | candidate_driver |
| `legacy_food` | Euro-area HICP food | Food | Model target | EA | M | % y/y | 1997-01 | 2026-07 | 355 | Database_inflation | existing_BU_V3_input |
| `legacy_food_ppi` | Food PPI, legacy | Food | Legacy BU driver | EA | M | index | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `ecb_commodity_import_nonenergy_index` | ECB import-weighted non-energy commodity price index | Goods | Imported commodity cost pressure | EA21 | M | index | 2006-01 | 2026-07 | 247 | ECB_NEC | qrf_close_definition |
| `ecb_commodity_import_nonfood_index` | ECB import-weighted non-food commodity price index | Goods | Imported commodity cost pressure | EA21 | M | index | 1986-04 | 2026-07 | 484 | ECB_NEC | qrf_close_definition |
| `ecb_eer12_nominal` | Nominal effective exchange rate, EER-12 | Goods | Imported cost pressure | EA | M | index | 1990-01 | 2026-08 | 440 | EXR | qrf_predictor |
| `ecfin_consumer_goods_price_expectations` | Consumer-goods selling-price expectations | Goods | Selling-price gate | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_consumer_major_purchases_expectations` | Major purchases expectations | Goods | Durable-goods demand expectations | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_industry_employment_expectations` | Industry employment expectations | Goods | Labour-demand context | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_industry_production_expectations` | Industry production expectations | Goods | Demand and production pipeline | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_industry_selling_price_expectations` | Industry selling-price expectations | Goods | Selling-price gate | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_intermediate_goods_price_expectations` | Intermediate-goods selling-price expectations | Goods | Upstream selling-price gate | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_retail_business_expectations` | Retail business activity expectations | Goods | Retail demand expectations | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `es_import_ex_energy_yoy` | Import prices excluding energy | Goods | Imported cost pressure | EA21 | M | % y/y | 2006-01 | 2026-06 | 246 | sts_inpi_m | candidate_driver |
| `es_import_manufacturing_yoy` | Manufacturing import prices | Goods | Imported cost pressure | EA21 | M | % y/y | 2006-01 | 2026-06 | 246 | sts_inpi_m | candidate_driver |
| `es_industrial_production_yoy` | Manufacturing production | Goods | Demand and margin context | EA21 | M | % y/y | 1992-01 | 2026-06 | 414 | sts_inpr_m | candidate_driver |
| `es_ppi_capital_goods_index` | Capital-goods producer price index | Goods | QRF producer-price predictor | EA21 | M | index 2021=100 | 2000-01 | 2026-06 | 318 | sts_inpp_m | qrf_exact_predictor |
| `es_ppi_consumer_goods_index` | Consumer-goods producer price index | Goods | QRF producer-price predictor | EA21 | M | index 2021=100 | 2000-01 | 2026-06 | 318 | sts_inpp_m | qrf_exact_predictor |
| `es_ppi_durable_consumer_goods_index` | Durable consumer-goods producer price index | Goods | QRF producer-price predictor | EA21 | M | index 2021=100 | 2000-01 | 2026-06 | 318 | sts_inpp_m | qrf_exact_predictor |
| `es_ppi_ex_energy_yoy` | Industrial producer prices excluding energy | Goods | Underlying cost pressure | EA21 | M | % y/y | 2001-01 | 2026-06 | 306 | sts_inpp_m | candidate_driver |
| `es_ppi_industry_index` | Industrial producer price index | Goods | QRF producer-price predictor | EA21 | M | index 2021=100 | 2000-01 | 2026-06 | 318 | sts_inpp_m | qrf_exact_predictor |
| `es_ppi_industry_yoy` | Industrial producer prices | Goods | Cost pressure | EA21 | M | % y/y | 2001-01 | 2026-06 | 306 | sts_inpp_m | candidate_driver |
| `es_ppi_intermediate_goods_index` | Intermediate-goods producer price index | Goods | QRF producer-price predictor | EA21 | M | index 2021=100 | 2000-01 | 2026-06 | 318 | sts_inpp_m | qrf_exact_predictor |
| `es_ppi_manufacturing_index` | Manufacturing producer price index | Goods | QRF producer-price predictor | EA21 | M | index 2021=100 | 2000-01 | 2026-06 | 318 | sts_inpp_m | qrf_exact_predictor |
| `es_ppi_manufacturing_yoy` | Manufacturing producer prices | Goods | Cost pressure | EA21 | M | % y/y | 2001-01 | 2026-06 | 306 | sts_inpp_m | candidate_driver |
| `es_ppi_non_durable_consumer_goods_index` | Non-durable consumer-goods producer price index | Goods | QRF producer-price predictor | EA21 | M | index 2021=100 | 2000-01 | 2026-06 | 318 | sts_inpp_m | qrf_exact_predictor |
| `legacy_goods` | Euro-area HICP non-energy industrial goods | Goods | Model target | EA | M | % y/y | 1997-01 | 2026-07 | 355 | Database_inflation | existing_BU_V3_input |
| `legacy_goods_bbg` | Euro-area HICP goods, legacy | Goods | Legacy model input | EA | M | % y/y | 2001-08 | 2026-06 | 299 | Database_inflation | existing_BU_V3_input |
| `legacy_import_prices` | Euro-area import prices, legacy | Goods | Legacy BU driver | EA | M | % y/y | 2001-08 | 2026-05 | 298 | Database_inflation | existing_BU_V3_input |
| `legacy_pmi_manufacturing` | Euro-area manufacturing PMI | Goods | Goods activity context | EA | M | index | 2023-08 | 2026-06 | 35 | Database_inflation | existing_BU_V3_input |
| `legacy_pmi_manufacturing_long` | Euro-area manufacturing PMI, long history | Goods | Goods activity context | EA | M | index | 2003-12 | 2026-04 | 269 | Database_inflation | existing_BU_V3_input |
| `legacy_ppi` | Euro-area PPI, legacy | Goods | Legacy BU driver | EA | M | % y/y | 2001-08 | 2026-05 | 298 | Database_inflation | existing_BU_V3_input |
| `legacy_ppi_ea` | Euro-area producer prices, legacy | Goods | Legacy BU driver | EA | M | % y/y | 2001-08 | 2026-05 | 298 | Database_inflation | existing_BU_V3_input |
| `ecfin_consumer_price_expectations` | Consumer price expectations | Headline | Household inflation expectations | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `legacy_headline` | Euro-area headline HICP | Headline | Model target | EA | M | % y/y | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `ecb_ea_10y_yield` | Euro-area 10-year government benchmark yield | Macro | Interest-rate conditions | EA | M | % p.a. | 1990-01 | 2026-08 | 440 | FM | qrf_predictor |
| `ecb_euribor_3m` | 3-month Euribor | Macro | Interest-rate conditions | EA | M | % p.a. | 1994-01 | 2026-08 | 391 | FM | qrf_predictor |
| `ecb_euro_stoxx_50` | EURO STOXX 50 | Macro | Market and wealth conditions | EA | M | index points | 1990-01 | 2026-08 | 440 | FM | qrf_predictor |
| `ecb_loans_non_mfi_stock` | Loans to euro-area non-MFIs | Macro | Credit conditions | EA | M | EUR millions | 1997-09 | 2026-07 | 347 | BSI | qrf_predictor |
| `ecb_m1_stock` | Euro-area M1 stock | Macro | Money and liquidity | EA | M | EUR millions | 1990-01 | 2026-07 | 439 | BSI | qrf_predictor |
| `ecb_m2_stock` | Euro-area M2 stock | Macro | Money and liquidity | EA | M | EUR millions | 1990-01 | 2026-07 | 439 | BSI | qrf_predictor |
| `ecb_m3_stock` | Euro-area M3 stock | Macro | Money and liquidity | EA | M | EUR millions | 1990-01 | 2026-07 | 439 | BSI | qrf_predictor |
| `ecfin_business_climate` | Business climate indicator | Macro | Industrial cycle indicator | EA | M | standard deviations | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_consumer_confidence` | Consumer confidence indicator | Macro | Household demand context | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_consumer_economy_expectations` | General economic situation expectations | Macro | Household macro expectations | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_consumer_financial_expectations` | Household financial situation expectations | Macro | Household demand expectations | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_consumer_savings_expectations` | Savings expectations | Macro | Household saving expectations | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_consumer_unemployment_expectations` | Unemployment expectations | Macro | Labour-market expectations | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `ecfin_economic_sentiment` | Economic sentiment indicator | Macro | Broad cycle indicator | EA | M | balance, percentage points | 1990-01 | 2026-08 | 440 | DG_ECFIN_BCS | qrf_exact_predictor |
| `legacy_agri_food` | Agri Food | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `legacy_carbon` | Carbon | Macro | Legacy BU driver | EA | M | level | 2005-04 | 2026-07 | 256 | Database_inflation | existing_BU_V3_input |
| `legacy_commodity` | Commodity | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `legacy_crude_1m` | Crude 1M | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `legacy_crude_6m` | Crude 6M | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `legacy_crude_vol` | Crude Vol | Macro | Legacy BU driver | EA | M | level | 2007-05 | 2026-07 | 231 | Database_inflation | existing_BU_V3_input |
| `legacy_eurcnh` | Eurcnh | Macro | Legacy BU driver | EA | M | level | 2010-08 | 2026-07 | 192 | Database_inflation | existing_BU_V3_input |
| `legacy_eurusd` | Eurusd | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `legacy_expectations` | Expectations | Macro | Legacy BU driver | EA | M | level | 2001-10 | 2026-07 | 298 | Database_inflation | existing_BU_V3_input |
| `legacy_fao_food` | Fao Food | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-06 | 299 | Database_inflation | existing_BU_V3_input |
| `legacy_gas_1m` | Gas 1M | Macro | Legacy BU driver | EA | M | level | 2005-06 | 2026-07 | 254 | Database_inflation | existing_BU_V3_input |
| `legacy_gas_6m` | Gas 6M | Macro | Legacy BU driver | EA | M | level | 2012-10 | 2026-07 | 166 | Database_inflation | existing_BU_V3_input |
| `legacy_gasoil_1m` | Gasoil 1M | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `legacy_gasoil_6m` | Gasoil 6M | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `legacy_jet_fuel` | Jet Fuel | Macro | Legacy BU driver | EA | M | level | 2008-01 | 2026-07 | 223 | Database_inflation | existing_BU_V3_input |
| `legacy_metal` | Metal | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `legacy_pmi_composite` | Euro-area composite PMI | Macro | Cycle context | EA | M | index | 2023-07 | 2026-07 | 37 | Database_inflation | existing_BU_V3_input |
| `legacy_pmi_composite_long` | Euro-area composite PMI, long history | Macro | Cycle context | EA | M | index | 2009-10 | 2026-05 | 200 | Database_inflation | existing_BU_V3_input |
| `legacy_power_de` | Power De | Macro | Legacy BU driver | EA | M | level | 2007-09 | 2026-07 | 227 | Database_inflation | existing_BU_V3_input |
| `legacy_power_fr` | Power Fr | Macro | Legacy BU driver | EA | M | level | 2007-09 | 2026-07 | 227 | Database_inflation | existing_BU_V3_input |
| `legacy_unemployment` | Unemployment | Macro | Legacy BU driver | EA | M | level | 2001-08 | 2026-06 | 299 | Database_inflation | existing_BU_V3_input |
| `oecd_ea19_cli` | OECD composite leading indicator, euro area 19 | Macro | Leading cycle indicator | EA19 | M | index | 1990-01 | 2022-11 | 395 | FRED | qrf_predictor |
| `us_cpi_index` | US CPI all items | Macro | External inflation | US | M | index 1982-84=100 | 1990-01 | 2026-07 | 438 | FRED | qrf_predictor |
| `us_unemployment_rate` | US unemployment rate | Macro | External cycle | US | M | % labour force | 1990-01 | 2026-08 | 439 | FRED | qrf_predictor |
| `ecb_negotiated_wages_yoy_current_vintage` | ECB negotiated wages | Services | Wage persistence gate | EA21 | M | % y/y | 1992-Q1 | 2026-Q2 | 414 | ECB_INW | qrf_exact_definition_current_vintage |
| `es_construction_production_yoy` | Construction production | Services | Domestic-cycle context | EA21 | M | % y/y | 1996-01 | 2026-06 | 366 | sts_copr_m | candidate_driver |
| `es_services_ppi_annual_yoy` | Services producer prices, annual series | Services | Annual cross-check | EA21 | A | % y/y | 2022 | 2025 | 4 | sts_sepp_a | candidate_driver |
| `es_services_ppi_index` | Services producer price index | Services | Services cost pressure | EA21 | Q | index 2021=100 | 2021-Q1 | 2026-Q1 | 21 | sts_sepp_q | services_persistence_gate_only |
| `es_services_ppi_yoy` | Services producer prices | Services | Services cost-pressure gate | EA21 | Q | % y/y | 2022-Q1 | 2026-Q1 | 17 | sts_sepp_q | services_persistence_gate_only |
| `es_services_production_yoy` | Services production | Services | Services activity gate | EA21 | M | % y/y | 2016-01 | 2026-05 | 125 | sts_sepr_m | candidate_driver |
| `es_services_turnover_yoy` | Services net turnover | Services | Demand and pricing-power gate | EA21 | M | % y/y | 2016-01 | 2026-05 | 125 | sts_setu_m | candidate_driver |
| `es_tourism_nights_yoy` | Tourism nights in accommodation | Services | Hospitality demand gate | EA20 | M | % y/y | 2024-01 | 2026-05 | 29 | tour_occ_nim | candidate_driver |
| `legacy_pmi_prices` | Euro-area PMI prices | Services | Selling-price survey gate | EA | M | index | 2023-08 | 2026-07 | 36 | Database_inflation | existing_BU_V3_input |
| `legacy_pmi_services` | Euro-area services PMI | Services | Services activity context | EA | M | index | 2023-07 | 2026-07 | 37 | Database_inflation | existing_BU_V3_input |
| `legacy_pmi_services_long` | Euro-area services PMI, long history | Services | Services activity context | EA | M | index | 2013-02 | 2026-06 | 161 | Database_inflation | existing_BU_V3_input |
| `legacy_services` | Euro-area HICP services | Services | Model target | EA | M | % y/y | 2001-08 | 2026-07 | 300 | Database_inflation | existing_BU_V3_input |
| `legacy_ulc` | Euro-area unit labour costs | Services | Services persistence gate | EA | M | % y/y | 2001-09 | 2026-03 | 99 | Database_inflation | existing_BU_V3_input |
| `legacy_wage_tracker` | ECB negotiated wage tracker | Services | Services persistence gate | EA | M | % y/y | 2013-01 | 2026-07 | 163 | Database_inflation | existing_BU_V3_input |
| `legacy_wages` | Negotiated wages, legacy | Services | Services persistence gate | EA | M | % y/y | 2001-08 | 2026-05 | 298 | Database_inflation | existing_BU_V3_input |
