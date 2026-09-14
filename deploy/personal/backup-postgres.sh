#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE=${ENV_FILE:-"$SCRIPT_DIR/.env.server"}
COMPOSE_FILE="$SCRIPT_DIR/compose.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${COS_SECRET_ID:?COS_SECRET_ID is required}"
: "${COS_SECRET_KEY:?COS_SECRET_KEY is required}"
: "${COS_BUCKET:?COS_BUCKET is required}"
: "${COS_REGION:?COS_REGION is required}"

BACKUP_DIR=${BACKUP_DIR:-backups}
case "$BACKUP_DIR" in
  /*) ;;
  *) BACKUP_DIR="$SCRIPT_DIR/$BACKUP_DIR" ;;
esac
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
COS_PREFIX=${COS_PREFIX:-daykeep}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="daykeep_${STAMP}.dump"

mkdir -p "$BACKUP_DIR"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom > "$BACKUP_DIR/$FILE"

docker run --rm \
  -v "$BACKUP_DIR:/data:ro" \
  -e RCLONE_CONFIG_COS_TYPE=s3 \
  -e RCLONE_CONFIG_COS_PROVIDER=TencentCOS \
  -e RCLONE_CONFIG_COS_ACCESS_KEY_ID="$COS_SECRET_ID" \
  -e RCLONE_CONFIG_COS_SECRET_ACCESS_KEY="$COS_SECRET_KEY" \
  -e RCLONE_CONFIG_COS_ENDPOINT="cos.${COS_REGION}.myqcloud.com" \
  rclone/rclone:1.71 copyto "/data/$FILE" "cos:${COS_BUCKET}/${COS_PREFIX}/backups/postgres/$FILE"

find "$BACKUP_DIR" -type f -name 'daykeep_*.dump' -mtime "+$BACKUP_RETENTION_DAYS" -delete
echo "Backup completed: $BACKUP_DIR/$FILE"
