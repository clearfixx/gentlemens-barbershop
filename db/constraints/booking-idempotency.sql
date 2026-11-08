-- Apply after Payload has created the bookings table.
-- Idempotency keys are scoped to a caller identity and are never reused for
-- a different request payload. A unique index makes concurrent retries safe.
-- This is schema groundwork; the public booking API is not enabled yet.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS idempotency_scope text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_request_hash text;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_idempotency_fields_together
  CHECK (
    (idempotency_scope IS NULL AND idempotency_key IS NULL AND idempotency_request_hash IS NULL)
    OR
    (idempotency_scope IS NOT NULL AND length(idempotency_scope) BETWEEN 1 AND 160
     AND idempotency_key IS NOT NULL AND length(idempotency_key) BETWEEN 1 AND 160
     AND idempotency_request_hash IS NOT NULL AND length(idempotency_request_hash) = 64)
  );

CREATE UNIQUE INDEX bookings_idempotency_unique
  ON bookings (idempotency_scope, idempotency_key)
  WHERE idempotency_scope IS NOT NULL;
