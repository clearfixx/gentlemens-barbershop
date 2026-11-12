-- Disposable representative pre-localization data. CI only.
INSERT INTO locations (id, name, slug, city, address, description, is_active)
VALUES (900001, 'Legacy location', 'legacy-location-ci', 'Kyiv', 'Example street 1', 'Original location text', true);
INSERT INTO services (id, name, slug, description, duration_minutes, price, is_active)
VALUES (900001, 'Legacy haircut', 'legacy-service-ci', 'Original service text', 45, 600, true);
INSERT INTO barbers (id, name, slug, bio, location_id, is_active)
VALUES (900001, 'Legacy barber', 'legacy-barber-ci', 'Original barber biography', 900001, true);
INSERT INTO bookings (id, location_id, barber_id, customer_name, customer_phone, starts_at, ends_at, total_price, status)
VALUES (900001, 900001, 900001, 'CI Fixture', '+380000000000', '2027-01-01 10:00:00+00', '2027-01-01 10:45:00+00', 600, 'pending');
