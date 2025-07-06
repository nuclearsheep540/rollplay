FROM python:3.8.12

RUN mkdir /api
COPY . /api

WORKDIR /api
RUN pip install --upgrade pip
RUN pip install --upgrade -r requirements.txt
RUN pip install pyyaml

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8082", "--reload", "--log-config", "./config/log_conf.yaml"]