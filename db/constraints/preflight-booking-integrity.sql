-- Fail before installing constraints if legacy data would violate them.
-- This script is read-only and is run inside the deployment transaction.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE starts_at >= ends_at
  ) THEN
    RAISE EXCEPTION 'Booking integrity preflight: invalid appointment time range';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM bookings a
    JOIN bookings b
      ON a.id < b.id
     AND a.barber_id = b.barber_id
     AND a.starts_at < b.ends_at
     AND b.starts_at < a.ends_at
    WHERE a.status IN ('pending', 'confirmed')
      AND b.status IN ('pending', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'Booking integrity preflight: overlapping active appointments';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM bookings
    WHERE idempotency_scope IS NOT NULL
    GROUP BY idempotency_scope, idempotency_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Booking integrity preflight: duplicate idempotency tokens';
  END IF;
END $$;
