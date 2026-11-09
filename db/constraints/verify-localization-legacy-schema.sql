-- Assert that localization work has not replaced legacy catalog columns.
-- Run against a disposable/restored database after Payload initialization.
-- This is a read-only regression gate, NOT a schema migration.
BEGIN READ ONLY;
DO $$
DECLARE
  required_column record;
BEGIN
  FOR required_column IN
    SELECT * FROM (VALUES
      ('services', 'name'), ('services', 'slug'), ('services', 'description'),
      ('services', 'duration_minutes'), ('services', 'price'), ('services', 'is_active'),
      ('locations', 'name'), ('locations', 'slug'), ('locations', 'city'),
      ('locations', 'address'), ('locations', 'description'), ('locations', 'time_zone'),
      ('barbers', 'name'), ('barbers', 'slug'), ('barbers', 'bio'), ('barbers', 'location_id'),
      ('bookings', 'id')
    ) AS required(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = required_column.table_name
        AND column_name = required_column.column_name
    ) THEN
      RAISE EXCEPTION 'Localization schema regression: missing %.%',
        required_column.table_name, required_column.column_name;
    END IF;
  END LOOP;
  IF to_regclass(format('%I.%I', current_schema(), 'translations')) IS NULL THEN
    RAISE EXCEPTION 'Localization schema regression: translations table missing';
  END IF;
END $$;
COMMIT;
