-- Run against the target database before enabling booking writes.
-- This verifies the actual PostgreSQL catalog, not just migration filenames.
DO $$
DECLARE
  column_name text;
BEGIN
  FOREACH column_name IN ARRAY ARRAY['idempotency_scope', 'idempotency_key', 'idempotency_request_hash'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'bookings'::regclass
        AND attname = column_name AND NOT attisdropped
        AND atttypid IN ('text'::regtype, 'character varying'::regtype)
    ) THEN
      RAISE EXCEPTION 'Missing or incompatible booking column: %', column_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_valid_time_range'
      AND contype = 'c'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'Missing validated bookings_valid_time_range constraint';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_no_active_overlap'
      AND contype = 'x'
      AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%barber_id WITH =%'
      AND pg_get_constraintdef(oid) LIKE '%tstzrange(starts_at, ends_at%'
      AND pg_get_constraintdef(oid) LIKE '%status%'
      AND pg_get_constraintdef(oid) LIKE '%pending%'
      AND pg_get_constraintdef(oid) LIKE '%confirmed%'
  ) THEN
    RAISE EXCEPTION 'Missing bookings_no_active_overlap exclusion constraint';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_idempotency_fields_together'
      AND contype = 'c'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'Missing validated idempotency field constraint';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    WHERE i.indrelid = 'bookings'::regclass
      AND idx.relname = 'bookings_idempotency_unique'
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indpred IS NOT NULL
      AND pg_get_indexdef(i.indexrelid) LIKE '%idempotency_scope%'
      AND pg_get_indexdef(i.indexrelid) LIKE '%idempotency_key%'
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%idempotency_scope IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'Missing valid partial idempotency unique index';
  END IF;
END $$;
