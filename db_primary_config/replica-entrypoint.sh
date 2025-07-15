#!/bin/bash

set -e

# Function to wait for the primary database to be ready
wait_for_primary() {
  echo "Waiting for primary database (db_primary) to be ready..."
  until pg_isready -h db_primary -p 5432 -U $POSTGRES_USER;
  do
    echo "Primary not ready yet. Retrying in 1 second..."
    sleep 1
  done
  echo "Primary database is ready."
}

# Check if the data directory is empty
if [ -z "$(ls -A /var/lib/postgresql/data)" ]; then
  echo "Data directory is empty. Performing base backup from primary..."
  wait_for_primary

  # Perform base backup
  PGPASSWORD=$POSTGRES_PASSWORD pg_basebackup -h db_primary -D /var/lib/postgresql/data -U $POSTGRES_USER -v -P -w

  echo "Base backup complete. Creating standby.signal..."
  touch /var/lib/postgresql/data/standby.signal

  # Ensure primary_conninfo is set in postgresql.conf for recovery
  echo "primary_conninfo = 'host=db_primary port=5432 user=$POSTGRES_USER password=$POSTGRES_PASSWORD application_name=$PGPRIMARYAPPNAME'" >> /var/lib/postgresql/data/postgresql.conf
  echo "hot_standby = on" >> /var/lib/postgresql/data/postgresql.conf
else
  echo "Data directory is not empty. Skipping base backup."
fi

# Execute the original PostgreSQL entrypoint command
exec docker-entrypoint.sh postgres