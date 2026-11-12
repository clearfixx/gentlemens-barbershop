#!/usr/bin/env bash
# Exercise managed migration storage, then roll back every test write.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql -X -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL" \
  -f "$root/db/booking-rate-limit/test-managed-limiter.sql" \
  -c 'ROLLBACK'
echo "Managed shared booking limiter and retention checks passed"
