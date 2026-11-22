# API du dashboard HICPxT. Contexte de build = RACINE du dépôt (l'API importe le moteur euroinfl/) :
#   docker build -f backend/Dockerfile -t inflation-api .
#   docker run -p 8000:8000 -e FRONTEND_ORIGINS=http://localhost:5173 inflation-api
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dépendances d'abord (couche mise en cache tant que requirements.txt ne change pas)
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

# Moteur et ses sorties (out/), base brute (explorateur des séries), puis l'API
COPY euroinfl/ euroinfl/
COPY data/raw/ data/raw/
COPY backend/app/ backend/app/

RUN useradd --create-home --uid 10001 api && chown -R api /app
USER api

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/health', timeout=4)"

# Railway fournit $PORT ; 8000 en local
CMD ["sh", "-c", "uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
