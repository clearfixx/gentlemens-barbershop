-- The upsert serializes concurrent consumers on the same unique key.
BEGIN;
DO $$
DECLARE
  result boolean;
  hits integer;
BEGIN
  IF NOT booking_rate_limit_ci.consume('booking:ci', 120000, 60000, 2) THEN
    RAISE EXCEPTION 'First request rejected';
  END IF;
  IF NOT booking_rate_limit_ci.consume('booking:ci', 120001, 60000, 2) THEN
    RAISE EXCEPTION 'Second request rejected';
  END IF;
  IF booking_rate_limit_ci.consume('booking:ci', 120002, 60000, 2) THEN
    RAISE EXCEPTION 'Over-budget request accepted';
  END IF;
  SELECT b.hits INTO hits FROM booking_rate_limit_ci.buckets b
    WHERE b.identity = 'booking:ci' AND b.window_start = 120000;
  IF hits <> 2 THEN RAISE EXCEPTION 'Denied request incremented budget'; END IF;
  IF NOT booking_rate_limit_ci.consume('booking:ci', 180000, 60000, 2) THEN
    RAISE EXCEPTION 'Next window rejected';
  END IF;
  IF NOT booking_rate_limit_ci.consume('booking:other', 120000, 60000, 2) THEN
    RAISE EXCEPTION 'Independent key rejected';
  END IF;
END $$;
ROLLBACK;
