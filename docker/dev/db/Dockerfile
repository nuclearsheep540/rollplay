  FROM mongo:7.0

  # Install envsubst (part of gettext package)
  RUN apt-get update && apt-get install -y gettext-base && rm -rf /var/lib/apt/lists/*

  # Accept build arguments
  ARG MONGO_INITDB_ROOT_USERNAME
  ARG MONGO_INITDB_ROOT_PASSWORD

  # Export as environment variables for envsubst
  ENV MONGO_INITDB_ROOT_USERNAME=$MONGO_INITDB_ROOT_USERNAME
  ENV MONGO_INITDB_ROOT_PASSWORD=$MONGO_INITDB_ROOT_PASSWORD

  # Copy and substitute env vars in the mongo init script
  COPY dev/db/mongo-init.js /tmp/mongo-init.js
  RUN envsubst < /tmp/mongo-init.js > /docker-entrypoint-initdb.d/mongo-init.js

  CMD ["--auth"]