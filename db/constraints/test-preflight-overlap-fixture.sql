-- CI-only negative fixture. Must run with --single-transaction and ON_ERROR_STOP=1.
-- The caller expects the preflight to fail, rolling back all fixture changes.
-- The CI database has no catalog rows at this stage. Seed disposable
-- parent records so the two booking INSERTs cannot silently insert zero rows.
INSERT INTO locations (name, slug, city, address, time_zone, is_active, created_at, updated_at)
VALUES ('CI preflight location', 'ci-preflight-location', 'Kyiv', 'Test address',
  'Europe/Kyiv', true, now(), now());

INSERT INTO barbers (name, slug, location_id, is_active, created_at, updated_at)
SELECT 'CI preflight barber', 'ci-preflight-barber', id, true, now(), now()
FROM locations WHERE slug = 'ci-preflight-location';

ALTER TABLE bookings DROP CONSTRAINT bookings_no_active_overlap;

INSERT INTO bookings (
  location_id, barber_id, customer_name, customer_phone,
  starts_at, ends_at, total_price, status, created_at, updated_at
)
SELECT location_id, id, 'Preflight fixture A', '+380000000000',
  '2038-03-01 09:00:00+00', '2038-03-01 10:00:00+00', 500,
  'confirmed', now(), now()
FROM barbers WHERE slug = 'ci-preflight-barber';

INSERT INTO bookings (
  location_id, barber_id, customer_name, customer_phone,
  starts_at, ends_at, total_price, status, created_at, updated_at
)
SELECT location_id, id, 'Preflight fixture B', '+380000000000',
  '2038-03-01 09:30:00+00', '2038-03-01 10:30:00+00', 500,
  'pending', now(), now()
FROM barbers
LIMIT 1;
