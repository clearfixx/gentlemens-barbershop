-- Apply after Payload has created the bookings table.
-- Active appointments must never overlap for the same barber.
-- [) allows back-to-back appointments. Re-running is safe.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass AND conname = 'bookings_valid_time_range'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_valid_time_range
      CHECK (starts_at < ends_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass AND conname = 'bookings_no_active_overlap'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_no_active_overlap
      EXCLUDE USING gist (
        barber_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (status IN ('pending', 'confirmed'));
  END IF;
END $$;
