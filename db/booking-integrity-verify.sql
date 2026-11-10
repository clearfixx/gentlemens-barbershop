-- Read-only verification of the ACTUAL migrated public.bookings schema.
-- Run AFTER applying Payload migrations, against a disposable database.
-- Any missing or unexpectedly defined constraint raises an exception.
\set ON_ERROR_STOP on

DO $$
DECLARE
  overlap_definition text;
  idempotency_index_definition text;
  interval_definition text;
  completeness_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO overlap_definition
  FROM pg_constraint
  WHERE conrelid = 'public.bookings'::regclass
    AND conname = 'bookings_no_active_overlap' AND contype = 'x';
  IF overlap_definition IS NULL
    OR overlap_definition NOT LIKE '%EXCLUDE USING gist%'
    OR overlap_definition NOT LIKE '%barber_id WITH =%'
    OR overlap_definition NOT LIKE '%tstzrange%'
    OR overlap_definition NOT LIKE '%pending%'
    OR overlap_definition NOT LIKE '%confirmed%' THEN
    RAISE EXCEPTION 'Booking overlap exclusion constraint missing or unexpected: %', overlap_definition;
  END IF;

  SELECT indexdef INTO idempotency_index_definition
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'bookings'
    AND indexname = 'bookings_idempotency_scope_key_unique';
  IF idempotency_index_definition IS NULL
    OR idempotency_index_definition NOT LIKE '%CREATE UNIQUE INDEX%'
    OR idempotency_index_definition NOT LIKE '%idempotency_scope%'
    OR idempotency_index_definition NOT LIKE '%idempotency_key%' THEN
    RAISE EXCEPTION 'Booking idempotency unique index missing or unexpected: %', idempotency_index_definition;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO interval_definition
  FROM pg_constraint
  WHERE conrelid = 'public.bookings'::regclass
    AND conname = 'bookings_valid_interval' AND contype = 'c';
  IF interval_definition IS NULL OR interval_definition NOT LIKE '%ends_at%'
    OR interval_definition NOT LIKE '%starts_at%' THEN
    RAISE EXCEPTION 'Booking interval constraint missing or unexpected: %', interval_definition;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO completeness_definition
  FROM pg_constraint
  WHERE conrelid = 'public.bookings'::regclass
    AND conname = 'bookings_idempotency_complete' AND contype = 'c';
  IF completeness_definition IS NULL OR completeness_definition NOT LIKE '%num_nonnulls%' THEN
    RAISE EXCEPTION 'Booking retry completeness constraint missing or unexpected: %', completeness_definition;
  END IF;

  RAISE NOTICE 'Booking integrity constraints and retry unique index are present';
END;
$$;
