# Booking integrity: deployment and verification

## Database guarantee

The PostgreSQL exclusion constraint in `db/constraints/booking-no-overlap.sql`
prevents overlapping `pending` and `confirmed` appointments for the same barber.
The range uses `[)`, so an appointment ending exactly when the next begins is
allowed. Cancelled, completed and no-show bookings do not reserve time.

This is a **database-level invariant**, not a substitute for availability checks,
service duration validation, customer identity checks, rate limiting or
idempotency. In particular, application-level read-then-insert checks alone
cannot prevent concurrent reservations.

## Installation

1. Back up the database and inspect existing active bookings for overlapping
   intervals. Resolve conflicting records before adding the constraint.
2. Initialize/update Payload's database schema first; the `bookings` table and
   its columns must already exist.
3. Apply `db/constraints/booking-no-overlap.sql` with `psql -v ON_ERROR_STOP=1`
   as a privileged migration step.
4. Verify that `bookings_no_active_overlap` and
   `bookings_valid_time_range` exist in `pg_constraint`.
5. Keep the constraint in place across schema migrations. Review any generated
   Payload/Drizzle migration before production deployment to ensure it does
   not drop or replace the constraint.

The SQL file is **not yet wired into the application's production migration
lifecycle**. GitHub Actions installs it explicitly in its disposable database.
Production deployment must not enable booking writes until the constraint is
installed and verified in the target database.

## Conflict handling

A conflicting concurrent insert or status change is rejected by PostgreSQL
with SQLSTATE `23P01` (`exclusion_violation`). The future booking service
must translate that error into an HTTP 409 response, without exposing SQL
details. Other database errors must not be silently classified as conflicts.
Booking creation must also use a durable idempotency key so retries do not
create duplicate reservations.

## Tests

`db/constraints/test-booking-no-overlap.sql` tests overlapping, adjacent and
cancelled appointments in a rollback-only transaction. CI executes it after
creating catalog fixtures. A separate parallel-transaction integration test
and the booking API are still required before public launch.
