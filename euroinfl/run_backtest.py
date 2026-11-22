import sys, warnings, time; sys.path.insert(0,'.'); warnings.filterwarnings('ignore')
import pandas as pd
from euroinfl.data import load_user_db, load_hicp, load_weights
from euroinfl import backtest as B
db=load_user_db('data/euro_inflation_database_long.csv'); H=load_hicp(); W=load_weights()
orig=pd.period_range('2019-01','2025-10',freq='M')
items=('TOT_X_TBC','NRG','FOOD_P_X_TBC','FOOD_NP','IGD_NNRG','SERV')
t=time.time()
res={}
res['BU']=B.run(db,H,W,orig,'rw',items=items); print('BU',time.time()-t,flush=True)
res['BU_perfect']=B.run(db,H,W,orig,'perfect',items=items); print('BUp',time.time()-t,flush=True)
res['STAT']=B.run(db,H,W,orig,'rw',model_cls=B.StatModel,items=items); print('STAT',time.time()-t,flush=True)
res['NAIF']=B.naive(H,orig,items)
all_=pd.concat([d.assign(model=k) for k,d in res.items()])
all_.to_csv('out/backtest_errors.csv',index=False)
