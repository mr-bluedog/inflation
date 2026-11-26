"""Moteur d'équations « bottom-up » en variations mensuelles.

Toute équation a la même forme lisible :

    y_t = s_{mois(t)} + rho * y_{t-1} + sum_b  beta_b * moyenne(x^b_{t-a_b} ... x^b_{t-z_b})
                                        + sum_b gamma_b * D_t * moyenne(...)   (option régime)
                                        + delta * Pâques_t                     (option services)
    avec y_t = 100 * dlog(indice de détail) et x = 100 * dlog(driver).

- s_m : effet saisonnier du mois (12 indicatrices, la tendance moyenne y est incluse).
- beta_b : élasticité « par fenêtre de retard ». Une hausse unique de 1 % du driver se transmet
  au total de beta_b % sur la fenêtre b (beta_b / n chaque mois de la fenêtre).
- Pass-through cumulé de long terme = sum(beta_b [+ gamma_b]) / (1 - rho).
- D_t (régime) = 1 à partir d'une date (ex. fin des tarifs réglementés) : gamma mesure le
  CHANGEMENT de transmission depuis cette date.
- Terme « révision » (kind='reset', gaz et électricité) : les contrats des clients finals ne sont
  révisés qu'à des dates fixes (ex. janvier en Allemagne, chaque trimestre en Italie). Le terme vaut
      R_t = 1{mois(t) ∈ calendrier} × 100·log( A_t / A_t' ),  A_t = moyenne du prix de gros sur les retards [a..z],
  t' = révision précédente : à chaque révision, le prix de détail rattrape une part beta de la variation
  du prix de gros moyen depuis la révision précédente ; entre deux révisions, R_t = 0.
Estimation : moindres carrés robustes (Huber, IRLS) + petite pénalité ridge sur les drivers.
"""
from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np
import pandas as pd


def easter(year: int) -> pd.Timestamp:
    a = year % 19; b = year // 100; c = year % 100; d = b // 4; e = b % 4
    f = (b + 8) // 25; g = (b - f + 1) // 3; h = (19 * a + b - d - g + 15) % 30
    i = c // 4; k = c % 4; l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451; month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return pd.Timestamp(year, month, day)


def easter_regressor(idx: pd.PeriodIndex) -> pd.Series:
    """+1 en mars et -1 en avril quand Pâques tombe en mars (sinon 0) : déplace le pic de prix
    des services de tourisme entre mars et avril sans changer leur niveau annuel."""
    out = []
    for p in idx:
        em = easter(p.year).month
        out.append(1.0 if (p.month == 3 and em == 3) else (-1.0 if (p.month == 4 and em == 3) else 0.0))
    return pd.Series(out, index=idx)


@dataclass
class Bucket:
    driver: str          # nom du driver (colonne de X)
    lo: int              # premier retard (mois)
    hi: int              # dernier retard (mois)
    regime: bool = False # ajoute un terme d'interaction avec l'indicatrice de régime
    kind: str = "dlog"   # 'dlog' (variation %), 'level' (niveau, ex. salaires a/a / 12) ou 'reset' (révision)
    months: tuple = ()   # kind='reset' : mois civils de révision des contrats (1 = janvier)

    @property
    def label(self):
        if self.kind == "reset":
            return f"{self.driver}[révision {'/'.join(map(str, self.months))} · moy. {self.lo}-{self.hi}]"
        return f"{self.driver}[{self.lo}-{self.hi}]"


def reset_term(level: pd.Series, months: tuple, lo: int, hi: int) -> pd.Series:
    """R_t = 100·log(A_t / A_t') aux mois de révision (t' = révision précédente), 0 sinon ;
    A_t = moyenne du niveau sur les retards lo..hi."""
    A = sum(level.shift(j) for j in range(lo, hi + 1)) / (hi - lo + 1)
    vals = np.zeros(len(A))
    prev = None
    a = A.to_numpy(dtype=float)
    for i, p in enumerate(A.index):
        if p.month in months:
            if not np.isfinite(a[i]):
                vals[i] = np.nan                      # prix de gros inconnu : observation exclue
            elif prev is not None and np.isfinite(a[prev]):
                vals[i] = 100 * np.log(a[i] / a[prev])
            prev = i
    return pd.Series(vals, index=A.index)


@dataclass
class Equation:
    name: str
    target: str
    buckets: list
    ar: bool = True
    easter: bool = False
    regime_start: str | None = None
    start: str = "2015-02"
    exclude: tuple = ()          # périodes exclues de l'estimation (ex. confinement 2020)
    ridge: float = 0.5
    huber_c: float = 1.5
    half_life: float | None = None   # pondération des observations récentes (mois) ; None = poids égaux
    drift: float | None = None       # si fixé : dérive mensuelle de fond imposée (%/mois), saisonnalité de moyenne nulle
    min_regime_obs: int = 24         # le terme de régime n'est activé qu'avec assez d'observations
    # rempli après estimation
    coef: dict = field(default_factory=dict)
    se: dict = field(default_factory=dict)
    stats: dict = field(default_factory=dict)

    # ---------- construction du design ----------
    def _driver_terms(self, X: pd.DataFrame, t_index) -> pd.DataFrame:
        cols = {}
        for b in self.buckets:
            if b.kind == "reset":
                m = reset_term(X[b.driver], b.months, b.lo, b.hi)
            else:
                x = 100 * np.log(X[b.driver] / X[b.driver].shift(1)) if b.kind == "dlog" else X[b.driver]
                m = sum(x.shift(j) for j in range(b.lo, b.hi + 1)) / (b.hi - b.lo + 1)
            cols[b.label] = m
            if b.regime and self.regime_start and getattr(self, "_regime_on", True):
                D = (m.index >= pd.Period(self.regime_start, "M")).astype(float)
                cols[b.label + "×régime"] = m * D
        return pd.DataFrame(cols).reindex(t_index)

    def design(self, y: pd.Series, X: pd.DataFrame) -> pd.DataFrame:
        idx = y.index
        Z = pd.DataFrame(index=idx)
        for mth in range(1, 13):
            Z[f"m{mth:02d}"] = (idx.month == mth).astype(float)
        if self.drift is not None:   # s_m = drift + a_m, somme des a_m nulle (a_12 = -somme des autres)
            for mth in range(1, 12):
                Z[f"m{mth:02d}"] = Z[f"m{mth:02d}"] - Z["m12"]
            Z = Z.drop(columns="m12")
        if self.ar:
            Z["rho"] = y.shift(1)
        if self.easter:
            Z["easter"] = easter_regressor(idx)
        Z = Z.join(self._driver_terms(X, idx))
        return Z

    # ---------- estimation ----------
    def fit(self, level: pd.Series, X: pd.DataFrame, end: pd.Period | None = None):
        y = 100 * np.log(level / level.shift(1))
        last = end if end is not None else y.last_valid_index()
        self._regime_on = bool(self.regime_start) and (last - pd.Period(self.regime_start, "M")).n + 1 >= self.min_regime_obs
        Z = self.design(y, X)
        df = Z.assign(_y=y - (self.drift or 0.0))
        df = df.loc[pd.Period(self.start, "M"):]
        if end is not None:
            df = df.loc[:end]
        for e in self.exclude:
            a, b = e if isinstance(e, tuple) else (e, e)
            df = df.drop(df.loc[pd.Period(a, "M"):pd.Period(b, "M")].index, errors="ignore")
        df = df.dropna()
        Zm, yv = df.drop(columns="_y").values, df["_y"].values
        names = list(df.columns[:-1])
        pen = np.array([0.0 if (n.startswith("m") and n[1:].isdigit()) else self.ridge for n in names])
        pen[[i for i, n in enumerate(names) if n in ("rho", "easter")]] = self.ridge * 0.2
        w = np.ones(len(yv))
        if self.half_life:
            age = np.array([(df.index[-1] - p).n for p in df.index], dtype=float)
            base_w = 0.5 ** (age / self.half_life)
        else:
            base_w = np.ones(len(yv))
        for _ in range(30):
            Wz = Zm * (w * base_w)[:, None]
            A = Zm.T @ Wz + np.diag(pen)
            beta = np.linalg.solve(A, Wz.T @ yv)
            r = yv - Zm @ beta
            s = 1.4826 * np.median(np.abs(r - np.median(r))) + 1e-9
            u = np.abs(r) / (self.huber_c * s)
            w_new = np.where(u <= 1, 1.0, 1.0 / u)
            if np.max(np.abs(w_new - w)) < 1e-6:
                break
            w = w_new
        dof = max(len(yv) - len(beta), 1)
        sigma2 = np.sum(w * base_w * r ** 2) / np.mean(base_w) / dof
        cov = sigma2 * np.linalg.inv(A)
        self.coef = dict(zip(names, beta))
        self.se = dict(zip(names, np.sqrt(np.diag(cov))))
        self.stats = {"n": len(yv), "sigma": float(np.sqrt(sigma2)),
                      "r2": float(1 - np.sum(r ** 2) / np.sum((yv - yv.mean()) ** 2)),
                      "downweighted": int(np.sum(w < 0.99)),
                      "sample": f"{df.index[0]}..{df.index[-1]}"}
        self._resid = pd.Series(r, index=df.index)
        return self

    # ---------- lecture économique ----------
    def passthrough(self, driver: str, regime: str = "current") -> dict:
        """Élasticités par fenêtre et pass-through cumulé (court terme et long terme avec rho)."""
        rho = self.coef.get("rho", 0.0) if self.ar else 0.0
        rows, tot = [], 0.0
        for b in self.buckets:
            if b.driver != driver or b.kind not in ("dlog", "reset"):
                continue
            v = self.coef[b.label]
            if b.regime and regime == "current" and self.regime_start and getattr(self, "_regime_on", False):
                v += self.coef[b.label + "×régime"]
            rows.append((b.label, v))
            tot += v
        return {"buckets": rows, "sum": tot, "long_run": tot / (1 - rho) if rho < 0.99 else np.nan, "rho": rho}

    # ---------- simulation ----------
    def simulate(self, level: pd.Series, X: pd.DataFrame, start: pd.Period, end: pd.Period,
                 overrides: pd.Series | None = None) -> pd.Series:
        """Prévision récursive des niveaux de start à end. Les drivers X doivent couvrir la période.
        overrides : niveaux observés (si présents, remplacent la prévision — ex. publication)."""
        L = level.copy()
        idx = pd.period_range(min(L.index[0], X.index[0]), end, freq="M")
        L = L.reindex(idx)
        Xr = X.reindex(idx)
        D = self._driver_terms(Xr, idx)
        ez = easter_regressor(idx)
        y = 100 * np.log(L / L.shift(1))
        t = start
        while t <= end:
            if overrides is not None and t in overrides.index and pd.notna(overrides[t]):
                L[t] = overrides[t]
            else:
                v = self.season(t.month)
                if self.ar:
                    v += self.coef["rho"] * y[t - 1]
                if self.easter:
                    v += self.coef["easter"] * ez[t]
                for c in D.columns:
                    v += self.coef[c] * D.at[t, c]
                L[t] = L[t - 1] * np.exp(v / 100)
            y[t] = 100 * np.log(L[t] / L[t - 1])
            t += 1
        return L.loc[:end]

    def season(self, month: int) -> float:
        """Effet du mois (inclut la dérive de fond)."""
        if self.drift is None:
            return self.coef[f"m{month:02d}"]
        a = [self.coef[f"m{j:02d}"] for j in range(1, 12)]
        return self.drift + (a[month - 1] if month < 12 else -sum(a))

    def table(self) -> pd.DataFrame:
        rows = []
        for k, v in self.coef.items():
            if k.startswith("m") and k[1:].isdigit():
                continue
            rows.append({"terme": k, "coef": v, "t": v / self.se[k] if self.se[k] > 0 else np.nan})
        return pd.DataFrame(rows)
