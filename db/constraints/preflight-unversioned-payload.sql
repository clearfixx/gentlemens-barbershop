-- Read-only guard before invoking Payload's versioned migrate command.
-- Existing installations created via automatic schema push may have business
-- tables but no payload_migrations ledger. Never replay bootstrap over them.
BEGIN READ ONLY;
DO $$
DECLARE
  legacy_count integer;
BEGIN
  SELECT count(*) INTO legacy_count
  FROM (VALUES ('users'), ('services'), ('locations'), ('barbers'), ('bookings')) AS legacy(name)
  WHERE to_regclass(format('%I.%I', current_schema(), legacy.name)) IS NOT NULL;

  IF legacy_count > 0 AND to_regclass(format('%I.%I', current_schema(), 'payload_migrations')) IS NULL THEN
    RAISE EXCEPTION 'UNVERSIONED_PAYLOAD_SCHEMA: existing tables without payload_migrations; stop, back up, validate historical schema, then register baseline explicitly';
  END IF;

  IF legacy_count > 0 AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'payload_migrations'
  ) AND NOT EXISTS (SELECT 1 FROM payload_migrations) THEN
    RAISE EXCEPTION 'UNVERSIONED_PAYLOAD_SCHEMA: existing tables with empty payload_migrations; baseline registration requires verified schema';
  END IF;
END $$;
COMMIT;
