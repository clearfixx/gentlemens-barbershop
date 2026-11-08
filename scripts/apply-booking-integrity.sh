#!/usr/bin/env bash
# Controlled deployment migration. Never run this on every app startup.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi
if [[ "${CONFIRM_BOOKING_MIGRATION:-}" != "apply" ]]; then
  echo "Refusing to modify database: set CONFIRM_BOOKING_MIGRATION=apply after backup and preflight review" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "PostgreSQL psql client is required" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Single transaction: do not leave only half the integrity rules installed.
# psql -1 wraps all -f inputs in BEGIN/COMMIT and rolls back on SQL errors.
psql -X -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL" \
  -f "$root/db/constraints/booking-no-overlap.sql" \
  -f "$root/db/constraints/booking-idempotency.sql" \
  -f "$root/db/constraints/verify-booking-integrity.sql"
echo "Booking integrity constraints installed and verified"
