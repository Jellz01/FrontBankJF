#!/bin/bash

# Run the original PostgreSQL entrypoint in the background
docker-entrypoint.sh postgres & 

# Wait for PostgreSQL to start accepting connections
until pg_isready -h localhost -p 5432 -U $POSTGRES_USER;
do
  echo "Waiting for primary PostgreSQL to start..."
  sleep 1
done

echo "Primary PostgreSQL started. Configuring pg_hba.conf for replication..."

# Append replication entry to pg_hba.conf
# Using 0.0.0.0/0 for simplicity, in production use specific subnet of jbs_network
echo "host    replication     user            0.0.0.0/0               md5" >> "$PGDATA/pg_hba.conf"

# Reload PostgreSQL configuration
pg_ctl reload

echo "pg_hba.conf updated and reloaded. Primary ready for replication."

# Keep the script running to keep the container alive (original entrypoint is in background)
wait $!
