#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: RESTORE_CONFIRM=daykeep $0 /path/to/daykeep_TIMESTAMP.dump" >&2
  exit 1
fi
if [ "${RESTORE_CONFIRM:-}" != "daykeep" ]; then
  echo "Restore replaces current database contents. Set RESTORE_CONFIRM=daykeep to continue." >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE=${ENV_FILE:-"$SCRIPT_DIR/.env.server"}
COMPOSE_FILE="$SCRIPT_DIR/compose.yml"
BACKUP_FILE=$1

if [ ! -f "$ENV_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Environment file or backup file does not exist." >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

services_stopped=0
restart_services() {
  if [ "$services_stopped" -eq 1 ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" start api worker >/dev/null 2>&1 || true
  fi
}
trap restart_services EXIT INT TERM

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop api worker
services_stopped=1
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$BACKUP_FILE"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" start api worker
services_stopped=0
trap - EXIT INT TERM
echo "Restore completed from: $BACKUP_FILE"
