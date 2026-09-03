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

# Health check - python probe (no curl in slim image); catches the
# "container Up but uvicorn dead" failure mode in docker ps
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8081/health')"

# Websocket ping is api-game's liveness check, and since decision 54 it is the ONLY
# thing that ends a map-token hold left by a browser that vanished without a clean
# close: the ping failure closes the socket, which runs player_disconnect ->
# release_all_for_user. Passed explicitly rather than left to uvicorn's defaults
# because the design depends on the values (worst case ~40s to reclaim a hold).
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081", "--reload", "--ws-ping-interval", "20", "--ws-ping-timeout", "20", "--log-config", "./config/log_conf.yaml"]