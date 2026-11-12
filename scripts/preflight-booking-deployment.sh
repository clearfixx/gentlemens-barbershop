#!/usr/bin/env bash
# Read-only deployment gate. Does NOT enable booking writes or apply migrations.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "PostgreSQL psql client is required" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# A single read-only transaction prevents accidental writes if a future
# verification SQL file is modified to include DDL or DML.
psql -X -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL" \
  -c 'SET TRANSACTION READ ONLY' \
  -f "$root/db/constraints/verify-booking-integrity.sql" \
  -c "DO \$\$ BEGIN
    IF to_regclass('public.payload_migrations') IS NULL THEN
      RAISE EXCEPTION 'Missing Payload migration ledger';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM payload_migrations
      WHERE name = '20261111_123000_booking_fk_integrity'
    ) THEN
      RAISE EXCEPTION 'Booking FK integrity migration is not recorded';
    END IF;
  END \$\$;"

echo "Read-only booking database preflight passed; production writes remain disabled"
