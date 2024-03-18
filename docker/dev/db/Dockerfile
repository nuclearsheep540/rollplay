FROM mongo:7.0

COPY dev/db/mongo-init.js /docker-entrypoint-initdb.d

CMD ["--auth"]