-- Execute inside a read/write transaction that is rolled back by the runner.
DO $$
DECLARE
  hits integer;
  removed bigint;
BEGIN
  IF to_regclass('public.booking_rate_limit_buckets') IS NULL THEN
    RAISE EXCEPTION 'Managed booking limiter table missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'booking_rate_limit_window_idx'
  ) THEN
    RAISE EXCEPTION 'Managed booking limiter retention index missing';
  END IF;
  IF NOT booking_rate_limit_consume('managed-ci:one', 120000, 60000, 2) THEN
    RAISE EXCEPTION 'First request rejected';
  END IF;
  IF NOT booking_rate_limit_consume('managed-ci:one', 120001, 60000, 2) THEN
    RAISE EXCEPTION 'Second request rejected';
  END IF;
  IF booking_rate_limit_consume('managed-ci:one', 120002, 60000, 2) THEN
    RAISE EXCEPTION 'Over-limit request accepted';
  END IF;
  SELECT b.hits INTO hits FROM booking_rate_limit_buckets b
    WHERE b.identity = 'managed-ci:one' AND b.window_start = 120000;
  IF hits <> 2 THEN RAISE EXCEPTION 'Rejected request incremented counter'; END IF;
  IF NOT booking_rate_limit_consume('managed-ci:one', 180000, 60000, 2) THEN
    RAISE EXCEPTION 'New time window rejected';
  END IF;
  IF NOT booking_rate_limit_consume('managed-ci:two', 120000, 60000, 2) THEN
    RAISE EXCEPTION 'Independent identity rejected';
  END IF;
  removed := booking_rate_limit_prune(180000);
  IF removed <> 2 THEN
    RAISE EXCEPTION 'Prune removed % windows instead of 2', removed;
  END IF;
  IF EXISTS (SELECT 1 FROM booking_rate_limit_buckets WHERE window_start < 180000) THEN
    RAISE EXCEPTION 'Expired windows remain after prune';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM booking_rate_limit_buckets
    WHERE identity = 'managed-ci:one' AND window_start = 180000) THEN
    RAISE EXCEPTION 'Prune deleted active window';
  END IF;
END $$;
