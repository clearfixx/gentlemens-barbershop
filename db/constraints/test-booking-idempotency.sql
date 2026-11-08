-- Run after booking-idempotency.sql and catalog fixtures, rollback only.
BEGIN;
DO $$
DECLARE
  location_id bigint;
  barber_id bigint;
BEGIN
  SELECT id INTO location_id FROM locations LIMIT 1;
  SELECT id INTO barber_id FROM barbers LIMIT 1;
  IF location_id IS NULL OR barber_id IS NULL THEN
    RAISE EXCEPTION 'Catalog fixtures required';
  END IF;

  INSERT INTO bookings (
    location_id, barber_id, customer_name, customer_phone, starts_at, ends_at,
    total_price, status, created_at, updated_at,
    idempotency_scope, idempotency_key, idempotency_request_hash
  ) VALUES (
    location_id, barber_id, 'CI idempotency', '+380671234567',
    '2033-01-02 09:00:00+00', '2033-01-02 10:00:00+00',
    500, 'pending', now(), now(),
    'customer:1', 'request-1', repeat('a', 64)
  );

  -- Same key cannot create a second booking, even at a different time.
  BEGIN
    INSERT INTO bookings (
      location_id, barber_id, customer_name, customer_phone, starts_at, ends_at,
      total_price, status, created_at, updated_at,
      idempotency_scope, idempotency_key, idempotency_request_hash
    ) VALUES (
      location_id, barber_id, 'CI duplicate', '+380671234567',
      '2033-01-02 11:00:00+00', '2033-01-02 12:00:00+00',
      500, 'pending', now(), now(),
      'customer:1', 'request-1', repeat('a', 64)
    );
    RAISE EXCEPTION 'Duplicate idempotency key incorrectly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Different scopes may use the same key.
  INSERT INTO bookings (
    location_id, barber_id, customer_name, customer_phone, starts_at, ends_at,
    total_price, status, created_at, updated_at,
    idempotency_scope, idempotency_key, idempotency_request_hash
  ) VALUES (
    location_id, barber_id, 'CI other customer', '+380671234568',
    '2033-01-02 11:00:00+00', '2033-01-02 12:00:00+00',
    500, 'pending', now(), now(),
    'customer:2', 'request-1', repeat('b', 64)
  );
END $$;
ROLLBACK;
