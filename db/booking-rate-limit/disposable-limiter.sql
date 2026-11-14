-- Prototype shared budget for booking writes. Disposable CI schema only.
-- NOT a production migration and NOT wired to HTTP endpoints.
CREATE SCHEMA IF NOT EXISTS booking_rate_limit_ci;
CREATE TABLE IF NOT EXISTS booking_rate_limit_ci.buckets (
  identity text NOT NULL,
  window_start bigint NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY (identity, window_start)
);
CREATE OR REPLACE FUNCTION booking_rate_limit_ci.consume(
  p_identity text, p_now_ms bigint, p_window_ms bigint, p_limit integer
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  current_hits integer;
BEGIN
  IF p_identity IS NULL OR length(p_identity) = 0 OR length(p_identity) > 200
     OR p_now_ms < 0 OR p_window_ms < 1000 OR p_limit < 1 THEN
    RAISE EXCEPTION 'Invalid limiter input';
  END IF;
  INSERT INTO booking_rate_limit_ci.buckets(identity, window_start, hits)
  VALUES (p_identity, (p_now_ms / p_window_ms) * p_window_ms, 1)
  ON CONFLICT (identity, window_start)
  DO UPDATE SET hits = booking_rate_limit_ci.buckets.hits + 1
    WHERE booking_rate_limit_ci.buckets.hits < p_limit
  RETURNING hits INTO current_hits;
  RETURN current_hits IS NOT NULL;
END $$;
