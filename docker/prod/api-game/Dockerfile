FROM python:3.12-slim

RUN mkdir /api
WORKDIR /api

# Copy requirements first for better caching (changes least often)
COPY api-game/requirements.txt .
RUN pip install --upgrade pip && pip install --upgrade -r requirements.txt
RUN pip install pyyaml

# Install shared contracts package (changes more often than requirements)
COPY rollplay-shared-contracts /rollplay-shared-contracts
RUN pip install /rollplay-shared-contracts

# Copy source code last (changes most often)
COPY api-game /api

# Health check — python probe (no curl in slim image); runs in-container,
# /health is not routed by nginx so it has no public exposure
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8081/health')"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081", "--log-config", "./config/log_conf.yaml"]