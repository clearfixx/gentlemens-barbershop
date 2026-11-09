-- Read-only compatibility preflight for constraints present in the current schema
-- but absent from the exact pre-localization baseline. Run on the same restored
-- production snapshot before applying any DDL. No customer rows are emitted.
BEGIN READ ONLY;
DO $$
DECLARE
  invalid_time bigint;
  invalid_idempotency bigint;
  duplicate_idempotency bigint;
  overlapping_active bigint;
BEGIN
  SELECT count(*) INTO invalid_time FROM bookings WHERE starts_at >= ends_at;
  SELECT count(*) INTO invalid_idempotency FROM bookings
  WHERE NOT (
    (idempotency_scope IS NULL AND idempotency_key IS NULL AND idempotency_request_hash IS NULL)
    OR
    (idempotency_scope IS NOT NULL
      AND length(idempotency_scope) BETWEEN 1 AND 160
      AND idempotency_key IS NOT NULL
      AND length(idempotency_key) BETWEEN 1 AND 160
      AND idempotency_request_hash IS NOT NULL
      AND length(idempotency_request_hash) = 64)
  );
  SELECT count(*) INTO duplicate_idempotency FROM (
    SELECT 1 FROM bookings WHERE idempotency_scope IS NOT NULL
    GROUP BY idempotency_scope, idempotency_key HAVING count(*) > 1
  ) conflicts;
  SELECT count(*) INTO overlapping_active FROM bookings a
  JOIN bookings b ON a.id < b.id AND a.barber_id = b.barber_id
    AND a.status IN ('pending', 'confirmed')
    AND b.status IN ('pending', 'confirmed')
    AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)');
  RAISE NOTICE 'Booking migration preflight: invalid_time=%, invalid_idempotency=%, duplicate_idempotency=%, overlapping_active=%',
    invalid_time, invalid_idempotency, duplicate_idempotency, overlapping_active;
  IF invalid_time + invalid_idempotency + duplicate_idempotency + overlapping_active > 0 THEN
    RAISE EXCEPTION 'Existing booking records violate target database constraints; migration blocked';
  END IF;
END $$;
COMMIT;
