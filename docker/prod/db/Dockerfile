FROM mongo:7.0

COPY prod/db/mongo-init.js /docker-entrypoint-initdb.d

CMD ["--auth"]