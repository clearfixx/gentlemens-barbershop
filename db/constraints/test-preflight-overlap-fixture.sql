-- CI-only negative fixture. Must run with --single-transaction and ON_ERROR_STOP=1.
-- The caller expects the preflight to fail, rolling back all fixture changes.
ALTER TABLE bookings DROP CONSTRAINT bookings_no_active_overlap;

INSERT INTO bookings (
  location_id, barber_id, customer_name, customer_phone,
  starts_at, ends_at, total_price, status, created_at, updated_at
)
SELECT location_id, id, 'Preflight fixture A', '+380000000000',
  '2038-03-01 09:00:00+00', '2038-03-01 10:00:00+00', 500,
  'confirmed', now(), now()
FROM barbers
LIMIT 1;

INSERT INTO bookings (
  location_id, barber_id, customer_name, customer_phone,
  starts_at, ends_at, total_price, status, created_at, updated_at
)
SELECT location_id, id, 'Preflight fixture B', '+380000000000',
  '2038-03-01 09:30:00+00', '2038-03-01 10:30:00+00', 500,
  'pending', now(), now()
FROM barbers
LIMIT 1;
