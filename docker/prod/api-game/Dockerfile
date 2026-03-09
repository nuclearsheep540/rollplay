FROM python:3.12-slim

# Install shared contracts package
COPY rollplay-shared-contracts /rollplay-shared-contracts
RUN pip install /rollplay-shared-contracts

RUN mkdir /api
COPY api-game /api

WORKDIR /api
RUN pip install --upgrade pip
RUN pip install --upgrade -r requirements.txt
RUN pip install pyyaml

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081", "--log-config", "./config/log_conf.yaml"]