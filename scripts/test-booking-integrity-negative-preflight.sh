#!/usr/bin/env bash
# Negative test against a disposable, fully migrated PostgreSQL database.
# Each deliberate schema mutation is wrapped in a transaction that MUST roll
# back when the integrity verifier raises an expected exception.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
verify="$root/db/constraints/verify-booking-integrity.sql"

# Start with a valid database; the test must not mask a broken installation.
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$verify" >/dev/null

assert_rejected() {
  local name="$1" mutation="$2" expected="$3"
  local output
  # --single-transaction guarantees the deliberate DDL cannot persist when
  # verification fails; ON_ERROR_STOP causes psql to exit nonzero.
  if output="$(psql -X -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL" \
    -c "$mutation" -f "$verify" 2>&1)"; then
    echo "FAIL: verifier accepted missing $name" >&2
    exit 1
  fi
  if [[ "$output" != *"$expected"* ]]; then
    echo "FAIL: $name was rejected for an unexpected reason" >&2
    echo "$output" >&2
    exit 1
  fi
  # Confirm rollback after each negative case, not just at the end.
  psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$verify" >/dev/null
  echo "PASS: verifier rejects missing $name and schema rolls back"
}

assert_rejected "active-overlap exclusion" \
  "ALTER TABLE public.bookings DROP CONSTRAINT bookings_no_active_overlap" \
  "Missing bookings_no_active_overlap exclusion constraint"

assert_rejected "valid-time check" \
  "ALTER TABLE public.bookings DROP CONSTRAINT bookings_valid_time_range" \
  "Missing validated bookings_valid_time_range constraint"

assert_rejected "idempotency completeness check" \
  "ALTER TABLE public.bookings DROP CONSTRAINT bookings_idempotency_fields_together" \
  "Missing validated idempotency field constraint"

assert_rejected "idempotency unique index" \
  "DROP INDEX public.bookings_idempotency_unique" \
  "Missing valid partial idempotency unique index"

echo "Booking integrity negative preflight tests passed (no lasting DDL)"
