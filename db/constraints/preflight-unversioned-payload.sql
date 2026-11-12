-- Read-only guard before invoking Payload's versioned migrate command.
-- Existing installations created via automatic schema push may have business
-- tables but no payload_migrations ledger. Never replay bootstrap over them.
BEGIN READ ONLY;
DO $$
DECLARE
  legacy_count integer;
  ledger_empty boolean;
BEGIN
  SELECT count(*) INTO legacy_count
  FROM (VALUES ('users'), ('services'), ('locations'), ('barbers'), ('bookings')) AS legacy(name)
  WHERE to_regclass(format('%I.%I', current_schema(), legacy.name)) IS NOT NULL;

  IF legacy_count > 0 AND to_regclass(format('%I.%I', current_schema(), 'payload_migrations')) IS NULL THEN
    RAISE EXCEPTION 'UNVERSIONED_PAYLOAD_SCHEMA: existing tables without payload_migrations; stop, back up, validate historical schema, then register baseline explicitly';
  END IF;

  -- Static SQL referencing an absent relation fails during planning even when
  -- the Boolean branch is false. Resolve ledger existence before dynamic SQL.
  IF legacy_count > 0 AND to_regclass(format('%I.%I', current_schema(), 'payload_migrations')) IS NOT NULL THEN
    EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM %I.payload_migrations)', current_schema())
      INTO ledger_empty;
    IF ledger_empty THEN
      RAISE EXCEPTION 'UNVERSIONED_PAYLOAD_SCHEMA: existing tables with empty payload_migrations; baseline registration requires verified schema';
    END IF;
  END IF;
END $$;
COMMIT;
