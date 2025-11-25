FROM python:3.8.12

RUN mkdir /api
COPY . /api

WORKDIR /api
RUN pip install --upgrade pip
RUN pip install --upgrade -r requirements.txt

# Fix for friendlywords package - missing data files
# The PyPI package is missing word list files, so we download them from GitHub
RUN mkdir -p /usr/local/lib/python3.8/site-packages/friendlywords/data && \
    curl -s https://raw.githubusercontent.com/glitchdotcom/friendly-words/main/words/predicates.txt \
         -o /usr/local/lib/python3.8/site-packages/friendlywords/data/predicates.txt && \
    curl -s https://raw.githubusercontent.com/glitchdotcom/friendly-words/main/words/objects.txt \
         -o /usr/local/lib/python3.8/site-packages/friendlywords/data/objects.txt && \
    curl -s https://raw.githubusercontent.com/glitchdotcom/friendly-words/main/words/teams.txt \
         -o /usr/local/lib/python3.8/site-packages/friendlywords/data/teams.txt && \
    curl -s https://raw.githubusercontent.com/glitchdotcom/friendly-words/main/words/collections.txt \
         -o /usr/local/lib/python3.8/site-packages/friendlywords/data/collections.txt

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8082", "--reload"]