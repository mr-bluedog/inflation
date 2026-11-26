"""Résume le backtest et calcule les poids de combinaison BU/STAT par pays et horizon."""
import json, numpy as np, pandas as pd
from pathlib import Path
OUT=Path(__file__).parent/'out'
d=pd.read_csv(OUT/'backtest_errors.csv')
rm=lambda e: float(np.sqrt(np.mean(np.square(e))))
summary={'origins':f"{d.origin.min()}..{d.origin.max()}",'n_origins':int(d.origin.nunique()),'rmse':{},'rmse_post2023':{},'bias_post2023':{}}
for lab,sub,key in [('all',d,'rmse'),('post',d[d.origin>='2023-01'],'rmse_post2023')]:
    t=sub.groupby(['item','geo','model','h'])['err'].apply(rm).unstack('h')
    for (it,g,m),row in t.iterrows():
        summary[key].setdefault(it,{}).setdefault(g,{})[m]=[round(v,3) for v in row.values]
b=d[d.origin>='2023-01'].groupby(['item','geo','model','h'])['err'].mean().unstack('h')
for (it,g,m),row in b.iterrows():
    summary['bias_post2023'].setdefault(it,{}).setdefault(g,{})[m]=[round(v,3) for v in row.values]
# poids de combinaison (minimisation de l'erreur quadratique de w*BU+(1-w)*STAT), lissés sur l'horizon
x=d[d.item=='TOT_X_TBC'].pivot_table(index=['geo','origin','h'],columns='model',values='err')
def wopt(e):
    eb,es=e['BU'].values,e['STAT'].values
    num=np.mean(es*es)-np.mean(eb*es); den=np.mean((eb-es)**2)
    return float(np.clip(num/den if den>0 else 0.5,0.0,1.0))
w={}; summary['combo_detail']={}
for g in x.index.get_level_values(0).unique():
    w[g]={}
    raw=[]; det=[]
    for h in range(1,13):
        e=x.loc[(g,slice(None),h)].dropna()
        ep=e[e.index.get_level_values('origin')>='2023-01']
        wa,wp=wopt(e),wopt(ep)
        det.append([round(wa,3),round(wp,3)])
        raw.append(np.clip(0.5*(wa+wp),0.2,1.0))   # moyenne « toute période » / « depuis 2023 »
    summary['combo_detail'][g]=det
    sm=pd.Series(raw).rolling(3,center=True,min_periods=1).mean()
    for h in range(1,13): w[g][str(h)]=round(float(sm[h-1]),3)
    comb=[]
    for h in range(1,13):
        e=x.loc[(g,slice(None),h)].dropna(); ww=w[g][str(h)]
        comb.append(round(rm(ww*e['BU']+(1-ww)*e['STAT']),3))
    summary['rmse'].setdefault('TOT_X_TBC',{}).setdefault(g,{})['COMBINE']=comb
summary['combo_weights_BU']=w
# Scores de prédiction par sous-composante, pays et horizon (h1 = nowcast du fixing du mois) :
#  - skill : 1 − RMSE(modèle) / RMSE(naïf), le naïf gardant le glissement annuel de l'origine (1 = parfait,
#    0 = pas mieux que le naïf, < 0 = moins bien) ;
#  - hit : part des origines où le modèle prévoit le bon SENS de variation du glissement annuel par rapport
#    à l'origine (variations réalisées de moins de 0,05 pp exclues : sens indéterminé) ;
#  - mae : erreur absolue moyenne du glissement annuel prévu par rapport au fixing réalisé (pp).
nv=d[d.model=='NAIF'].set_index(['origin','geo','item','h'])['fc'].rename('y0')
summary['scores']={}
for lab,sub in [('all',d),('post2023',d[d.origin>='2023-01'])]:
    nrm=sub[sub.model=='NAIF'].groupby(['item','geo','h'])['err'].apply(rm)
    for m in ['BU','STAT']:
        e=sub[sub.model==m].join(nv,on=['origin','geo','item','h'])
        e=e.assign(dfc=e.fc-e.y0,dac=e.act-e.y0)
        g_=e.groupby(['item','geo','h'])
        mr=g_['err'].apply(rm)
        mae=g_['err'].apply(lambda e: float(np.mean(np.abs(e))))
        dd=e[e.dac.abs()>=0.05]
        hit=dd.assign(ok=(np.sign(dd.dfc)==np.sign(dd.dac)).astype(float)).groupby(['item','geo','h'])['ok'].mean()
        n=g_.size()
        for (it,g,h),v in mr.items():
            r=summary['scores'].setdefault(lab,{}).setdefault(it,{}).setdefault(g,{}).setdefault(m,{'skill':[None]*12,'hit':[None]*12,'mae':[None]*12,'n':[0]*12})
            base=nrm.get((it,g,h))
            r['skill'][h-1]=round(1-v/base,3) if base else None
            r['hit'][h-1]=round(float(hit.get((it,g,h))),3) if (it,g,h) in hit.index else None
            r['mae'][h-1]=round(float(mae[(it,g,h)]),4)
            r['n'][h-1]=int(n[(it,g,h)])
(OUT/'combo_weights.json').write_text(json.dumps(w,indent=1),encoding='utf-8')
(OUT/'backtest_summary.json').write_text(json.dumps(summary,indent=1,ensure_ascii=False),encoding='utf-8')
pd.set_option('display.width',250)
for g in ['EA','IT','FR','DE','ES']:
    print(g,'w_BU',[w[g][str(h)] for h in range(1,13)])
    for m,v in summary['rmse']['TOT_X_TBC'][g].items(): print('   ',f'{m:12s}',[round(float(a),2) for a in v])
    
