-- Run against the target database before enabling booking writes.
-- This verifies the actual PostgreSQL catalog, not just migration filenames.
DO $$
BEGIN
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
  ) THEN
    RAISE EXCEPTION 'Missing valid partial idempotency unique index';
  END IF;
END $$;
