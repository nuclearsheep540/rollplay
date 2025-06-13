  FROM mongo:7.0

  # Install envsubst (part of gettext package)
  RUN apt-get update && apt-get install -y gettext-base && rm -rf /var/lib/apt/lists/*

  # substitute env vars for the mongo db init script
  COPY dev/db/mongo-init.js /tmp/
  RUN envsubst < /tmp/mongo-init.js > /docker-entrypoint-initdb.d/mongo-init.js

  CMD ["--auth"]