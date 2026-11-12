-- Read-only schema inventory before a Payload localization migration.
-- Does not assume Payload's generated table names for localized fields.
-- Run against a restored production copy before generating/reviewing migrations.
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_schema() AS active_schema;
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND (
    table_name IN ('services', 'locations', 'barbers', 'translations')
    OR table_name LIKE '%_locales'
  )
ORDER BY table_name, ordinal_position;
SELECT c.relname AS table_name, con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = current_schema()
  AND (c.relname IN ('services', 'locations', 'barbers', 'translations')
       OR c.relname LIKE '%_locales')
ORDER BY c.relname, con.conname;
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = current_schema()
  AND (tablename IN ('services', 'locations', 'barbers', 'translations')
       OR tablename LIKE '%_locales')
ORDER BY tablename, indexname;
COMMIT;
