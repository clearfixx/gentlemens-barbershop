-- Apply after Payload has created the bookings table.
-- Payload defines the camelCase fields, mapped to these snake_case columns.
-- Re-running this script is safe; conflicting existing definitions must be
-- reviewed separately before production rollout.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS idempotency_scope text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_request_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_idempotency_fields_together'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_idempotency_fields_together
      CHECK (
        (idempotency_scope IS NULL AND idempotency_key IS NULL AND idempotency_request_hash IS NULL)
        OR
        (idempotency_scope IS NOT NULL AND length(idempotency_scope) BETWEEN 1 AND 160
         AND idempotency_key IS NOT NULL AND length(idempotency_key) BETWEEN 1 AND 160
         AND idempotency_request_hash IS NOT NULL AND length(idempotency_request_hash) = 64)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_idempotency_unique
  ON bookings (idempotency_scope, idempotency_key)
  WHERE idempotency_scope IS NOT NULL;
