FROM postgres:15

# Install envsubst (part of gettext package) for environment variable substitution
RUN apt-get update && apt-get install -y gettext-base && rm -rf /var/lib/apt/lists/*

# Accept build arguments
ARG POSTGRES_USER
ARG POSTGRES_PASSWORD
ARG POSTGRES_DB
ARG APP_DB_PASSWORD

# Export as environment variables for envsubst
ENV POSTGRES_USER=$POSTGRES_USER
ENV POSTGRES_PASSWORD=$POSTGRES_PASSWORD
ENV POSTGRES_DB=$POSTGRES_DB
ENV APP_DB_PASSWORD=$APP_DB_PASSWORD

# Copy and substitute env vars in the postgres init script
COPY dev/postgres/postgres-init.sql /tmp/postgres-init.sql
RUN envsubst < /tmp/postgres-init.sql > /docker-entrypoint-initdb.d/postgres-init.sql

# Copy custom pg_hba.conf for network security
COPY dev/postgres/pg_hba.conf /etc/postgresql/pg_hba.conf

# Set PostgreSQL configuration
ENV POSTGRES_INITDB_ARGS="--auth-host=md5 --auth-local=trust"

# Override the default pg_hba.conf
RUN echo "hba_file = '/etc/postgresql/pg_hba.conf'" >> /usr/share/postgresql/postgresql.conf.sample