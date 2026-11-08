-- Apply after Payload has created the bookings table.
-- This constraint is the concurrency-safe source of truth for active reservations.
-- Adjacent intervals are permitted because [) excludes the end timestamp.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_valid_time_range
  CHECK (starts_at < ends_at);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_active_overlap
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status IN ('pending', 'confirmed'));
