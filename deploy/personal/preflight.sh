#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE=${ENV_FILE:-"$SCRIPT_DIR/.env.server"}
COMPOSE_FILE="$SCRIPT_DIR/compose.yml"

fail() {
  echo "Preflight failed: $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is not installed"
docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is not installed"
[ -f "$ENV_FILE" ] || fail "missing $ENV_FILE; copy env.server.example first"

set -a
. "$ENV_FILE"
set +a

for name in DOMAIN POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD JWT_SECRET REFRESH_SECRET \
  WX_APPID WX_SECRET COS_SECRET_ID COS_SECRET_KEY COS_BUCKET COS_REGION; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || fail "$name is empty"
  case "$value" in
    replace-with-*) fail "$name still contains the example placeholder" ;;
  esac
done

case "$DOMAIN" in
  http://*|https://*|*/*) fail "DOMAIN must be a hostname only, for example daykeep.cn" ;;
esac
[ "${#POSTGRES_PASSWORD}" -ge 20 ] || fail "POSTGRES_PASSWORD must contain at least 20 characters"
[ "${#JWT_SECRET}" -ge 32 ] || fail "JWT_SECRET must contain at least 32 characters"
[ "${#REFRESH_SECRET}" -ge 32 ] || fail "REFRESH_SECRET must contain at least 32 characters"
[ "$JWT_SECRET" != "$REFRESH_SECRET" ] || fail "JWT_SECRET and REFRESH_SECRET must be different"

mode=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")
[ "$mode" = "600" ] || fail "$ENV_FILE permissions must be 600 (current: $mode)"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet
echo "Preflight passed. No secret values were printed."
