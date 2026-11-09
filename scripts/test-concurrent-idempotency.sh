#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
location_id="${LOCATION_ID:?LOCATION_ID is required}"
barber_id="${BARBER_ID:?BARBER_ID is required}"

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

# Use a future fixture date distinct from other CI booking tests. The two
# bookings do not overlap in time: only the idempotency index can reject one.
cat > "$tmp_dir/first.sql" <<SQL
BEGIN;
INSERT INTO bookings (location_id, barber_id, customer_name, customer_phone,
  starts_at, ends_at, total_price, status, created_at, updated_at,
  idempotency_scope, idempotency_key, idempotency_request_hash)
VALUES ($location_id, $barber_id, 'CI retry first', '+380671234567',
  '2034-01-02 09:00:00+00', '2034-01-02 10:00:00+00', 500, 'pending', now(), now(),
  'ci:customer:1', 'same-request', repeat('a', 64));
SELECT pg_sleep(4);
COMMIT;
SQL

cat > "$tmp_dir/second.sql" <<SQL
BEGIN;
INSERT INTO bookings (location_id, barber_id, customer_name, customer_phone,
  starts_at, ends_at, total_price, status, created_at, updated_at,
  idempotency_scope, idempotency_key, idempotency_request_hash)
VALUES ($location_id, $barber_id, 'CI retry second', '+380671234567',
  '2034-01-02 11:00:00+00', '2034-01-02 12:00:00+00', 500, 'pending', now(), now(),
  'ci:customer:1', 'same-request', repeat('b', 64));
COMMIT;
SQL

psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$tmp_dir/first.sql" > "$tmp_dir/first.log" 2>&1 &
first_pid=$!
sleep 1
set +e
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$tmp_dir/second.sql" > "$tmp_dir/second.log" 2>&1
second_status=$?
wait "$first_pid"
first_status=$?
set -e

if [ "$first_status" -ne 0 ]; then
  echo "First idempotency transaction unexpectedly failed"
  cat "$tmp_dir/first.log"
  exit 1
fi
if [ "$second_status" -eq 0 ]; then
  echo "Second transaction incorrectly reused the same idempotency key"
  cat "$tmp_dir/second.log"
  exit 1
fi
if ! grep -q 'duplicate key value violates unique constraint "bookings_idempotency_unique"' "$tmp_dir/second.log"; then
  echo "Second transaction failed for an unexpected reason"
  cat "$tmp_dir/second.log"
  exit 1
fi

count=$(psql -X -At -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "
  SELECT count(*) FROM bookings
  WHERE idempotency_scope = 'ci:customer:1'
    AND idempotency_key = 'same-request';
")
if [ "$count" != "1" ]; then
  echo "Expected exactly one booking for idempotency key; found $count"
  exit 1
fi

hash=$(psql -X -At -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "
  SELECT idempotency_request_hash FROM bookings
  WHERE idempotency_scope = 'ci:customer:1'
    AND idempotency_key = 'same-request';
")
if [ "$hash" != "$(printf 'a%.0s' {1..64})" ]; then
  echo "Committed request fingerprint was not preserved"
  exit 1
fi
echo "Concurrent duplicate key rejected; exactly one original booking persisted"
