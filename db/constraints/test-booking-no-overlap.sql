-- Execute after booking-no-overlap.sql, inside a rollback-only transaction.
-- Tests PostgreSQL's real concurrency-independent overlap enforcement.
BEGIN;

DO $$
DECLARE
  test_location bigint;
  test_barber bigint;
  test_service bigint;
  test_booking bigint;
BEGIN
  SELECT id INTO test_location FROM locations LIMIT 1;
  SELECT id INTO test_barber FROM barbers LIMIT 1;
  SELECT id INTO test_service FROM services LIMIT 1;
  IF test_location IS NULL OR test_barber IS NULL OR test_service IS NULL THEN
    RAISE EXCEPTION 'Catalog fixtures must exist before booking constraint tests';
  END IF;

  INSERT INTO bookings (location_id, barber_id, customer_name, customer_phone,
    starts_at, ends_at, total_price, status, created_at, updated_at)
  VALUES (test_location, test_barber, 'CI constraint test', '+380000000000',
    '2030-01-02 09:00:00+00', '2030-01-02 10:00:00+00', 500, 'confirmed', now(), now())
  RETURNING id INTO test_booking;

  -- Adjacent appointments are valid.
  INSERT INTO bookings (location_id, barber_id, customer_name, customer_phone,
    starts_at, ends_at, total_price, status, created_at, updated_at)
  VALUES (test_location, test_barber, 'CI adjacent test', '+380000000000',
    '2030-01-02 10:00:00+00', '2030-01-02 10:30:00+00', 500, 'pending', now(), now());

  -- An overlapping confirmed appointment must be rejected by the database.
  BEGIN
    INSERT INTO bookings (location_id, barber_id, customer_name, customer_phone,
      starts_at, ends_at, total_price, status, created_at, updated_at)
    VALUES (test_location, test_barber, 'CI overlap test', '+380000000000',
      '2030-01-02 09:30:00+00', '2030-01-02 10:30:00+00', 500, 'confirmed', now(), now());
    RAISE EXCEPTION 'Overlapping booking was incorrectly accepted';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;

  -- Cancelled bookings must not reserve a slot.
  INSERT INTO bookings (location_id, barber_id, customer_name, customer_phone,
    starts_at, ends_at, total_price, status, created_at, updated_at)
  VALUES (test_location, test_barber, 'CI cancelled test', '+380000000000',
    '2030-01-02 09:30:00+00', '2030-01-02 09:45:00+00', 500, 'cancelled', now(), now());
END $$;

ROLLBACK;
