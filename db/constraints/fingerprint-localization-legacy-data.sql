-- Read-only fingerprints of legacy business data. Capture before and after a migration
-- against the SAME restored database. Never store raw customer rows in artifacts.
-- This intentionally excludes new localized columns.
BEGIN READ ONLY;
SELECT 'services' AS collection, count(*) AS row_count,
       md5(coalesce(string_agg(md5(row_to_json(r)::text), ',' ORDER BY r.id), '')) AS fingerprint
FROM (SELECT id, name, slug, description, duration_minutes, price, is_active FROM services) r
UNION ALL
SELECT 'locations', count(*),
       md5(coalesce(string_agg(md5(row_to_json(r)::text), ',' ORDER BY r.id), ''))
FROM (SELECT id, name, slug, city, address, description, time_zone, is_active FROM locations) r
UNION ALL
SELECT 'barbers', count(*),
       md5(coalesce(string_agg(md5(row_to_json(r)::text), ',' ORDER BY r.id), ''))
FROM (SELECT id, name, slug, bio, location_id, is_active FROM barbers) r
UNION ALL
SELECT 'bookings', count(*),
       md5(coalesce(string_agg(md5(row_to_json(r)::text), ',' ORDER BY r.id), ''))
FROM (SELECT * FROM bookings) r
ORDER BY collection;
COMMIT;
