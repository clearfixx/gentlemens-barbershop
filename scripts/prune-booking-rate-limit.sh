#!/usr/bin/env bash
# Explicit operator/cron job. Retain at least 24 hours of limiter windows.
set -euo pipefail
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Rate-limit cleanup refused: DATABASE_URL is required" >&2
  exit 1
fi
if [[ "${CONFIRM_BOOKING_RATE_LIMIT_CLEANUP:-}" != "prune" ]]; then
  echo "Rate-limit cleanup refused: CONFIRM_BOOKING_RATE_LIMIT_CLEANUP=prune is required" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "Rate-limit cleanup refused: psql is required" >&2
  exit 1
fi
# Calculate cutoff inside PostgreSQL to avoid application-host clock drift.
# Fixed windows are 60s; retaining 24h safely exceeds the active window.
psql -X -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL" \
  -c "SET LOCAL statement_timeout = '30s'" \
  -c "SELECT booking_rate_limit_prune(
    ((floor(extract(epoch FROM clock_timestamp()) / 60)::bigint - 1440) * 60000)
  ) AS pruned_windows"
echo "Booking rate-limit cleanup completed"
