#!/usr/bin/env bash
# Fail closed before Payload can replay a historical bootstrap over an
# installation created by automatic schema push without migration history.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Migration refused: DATABASE_URL is required" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "Migration refused: PostgreSQL psql client is required" >&2
  exit 1
fi

# The preflight is read-only and runs before Payload obtains any write access.
# Any connection failure, absent table, or unexpected SQL error stops migration.
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  -f db/constraints/preflight-unversioned-payload.sql

exec pnpm exec payload migrate --disable-transpile "$@"
