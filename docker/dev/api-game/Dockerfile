FROM python:3.12-slim

# Install shared contracts package (editable for dev hot-reload)
COPY rollplay-shared-contracts /rollplay-shared-contracts
RUN pip install -e /rollplay-shared-contracts

RUN mkdir /api
COPY api-game /api

WORKDIR /api
RUN pip install --upgrade pip
RUN pip install --upgrade -r requirements.txt
RUN pip install pyyaml

# Health check — python probe (no curl in slim image); catches the
# "container Up but uvicorn dead" failure mode in docker ps
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8081/health')"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081", "--reload", "--log-config", "./config/log_conf.yaml"]