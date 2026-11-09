#!/usr/bin/env bash
set -euo pipefail

# Requires the booking exclusion constraint and catalog fixtures.
# Two independent PostgreSQL connections race to reserve the same barber slot.
# The first transaction holds its row/constraint lock until commit.
: "${DATABASE_URL:?DATABASE_URL is required}"
location_id="${LOCATION_ID:?LOCATION_ID is required}"
barber_id="${BARBER_ID:?BARBER_ID is required}"

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

cat > "$tmp_dir/first.sql" <<SQL
BEGIN;
INSERT INTO bookings (location_id, barber_id, customer_name, customer_phone,
  starts_at, ends_at, total_price, status, created_at, updated_at)
VALUES ($location_id, $barber_id, 'CI concurrent first', '+380671234567',
  '2032-01-02 09:00:00+00', '2032-01-02 10:00:00+00', 500, 'pending', now(), now());
SELECT pg_sleep(4);
COMMIT;
SQL

cat > "$tmp_dir/second.sql" <<SQL
BEGIN;
INSERT INTO bookings (location_id, barber_id, customer_name, customer_phone,
  starts_at, ends_at, total_price, status, created_at, updated_at)
VALUES ($location_id, $barber_id, 'CI concurrent second', '+380671234568',
  '2032-01-02 09:30:00+00', '2032-01-02 10:30:00+00', 500, 'confirmed', now(), now());
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
  echo "First concurrent transaction failed unexpectedly"
  cat "$tmp_dir/first.log"
  exit 1
fi
if [ "$second_status" -eq 0 ]; then
  echo "Second concurrent transaction incorrectly reserved an overlapping slot"
  cat "$tmp_dir/second.log"
  exit 1
fi
if ! grep -q 'conflicting key value violates exclusion constraint "bookings_no_active_overlap"' "$tmp_dir/second.log"; then
  echo "Second transaction failed for an unexpected reason"
  cat "$tmp_dir/second.log"
  exit 1
fi

count=$(psql -X -At -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "
  SELECT count(*) FROM bookings
  WHERE barber_id = $barber_id
    AND starts_at < '2032-01-02 10:30:00+00'
    AND ends_at > '2032-01-02 09:00:00+00'
    AND status IN ('pending', 'confirmed');
")
if [ "$count" != "1" ]; then
  echo "Expected exactly one active reservation after concurrent inserts; found $count"
  exit 1
fi
echo "Concurrent overlap correctly rejected; exactly one active booking persisted"
