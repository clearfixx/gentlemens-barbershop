#!/usr/bin/env bash
# End-to-end retention test on CI's disposable production-migrated database.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cleanup="$root/scripts/prune-booking-rate-limit.sh"
if env -u CONFIRM_BOOKING_RATE_LIMIT_CLEANUP bash "$cleanup"; then
  echo "Cleanup accepted a missing approval" >&2
  exit 1
fi
if env -u DATABASE_URL CONFIRM_BOOKING_RATE_LIMIT_CLEANUP=prune bash "$cleanup"; then
  echo "Cleanup accepted a missing connection string" >&2
  exit 1
fi

# Real clock in PostgreSQL, using windows clearly inside/outside retention.
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "
  INSERT INTO booking_rate_limit_buckets(identity, window_start, hits)
  VALUES
    ('cleanup-ci:expired', (floor(extract(epoch FROM clock_timestamp()) / 60)::bigint - 1500) * 60000, 1),
    ('cleanup-ci:recent', (floor(extract(epoch FROM clock_timestamp()) / 60)::bigint - 5) * 60000, 1)
  ON CONFLICT (identity, window_start) DO UPDATE SET hits = EXCLUDED.hits;
"
CONFIRM_BOOKING_RATE_LIMIT_CLEANUP=prune bash "$cleanup"
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "
  DO \$\$ BEGIN
    IF EXISTS (SELECT 1 FROM booking_rate_limit_buckets WHERE identity = 'cleanup-ci:expired') THEN
      RAISE EXCEPTION 'Expired rate-limit bucket survived cleanup';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM booking_rate_limit_buckets WHERE identity = 'cleanup-ci:recent') THEN
      RAISE EXCEPTION 'Recent rate-limit bucket was deleted';
    END IF;
  END \$\$;
"
echo "Booking rate-limit cleanup approval and retention verified"
