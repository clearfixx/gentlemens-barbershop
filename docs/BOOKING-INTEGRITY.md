# Booking integrity: deployment and verification

## Database guarantees

The PostgreSQL exclusion constraint in `db/constraints/booking-no-overlap.sql`
prevents overlapping `pending` and `confirmed` appointments for one barber.
Its `[)` range permits adjacent appointments. Cancelled, completed and no-show
bookings do not reserve time.

`db/constraints/booking-idempotency.sql` adds a unique index for the pair
`(idempotency_scope, idempotency_key)` and a consistency check for all three
retry-metadata fields. Concurrent retries cannot create two rows with the same
scope and key.

These constraints are necessary, but do not replace catalog/availability
validation, customer identity checks, rate limiting, or safe error handling.

## Production rollout (booking writes must remain disabled)

1. Back up the target database. Confirm the deployed Payload schema includes
   the `bookings` table and idempotency columns.
2. The deployment command runs a read-only SQL preflight that rejects invalid
   appointment ranges, overlapping active bookings and duplicate idempotency
   tokens. Resolve legacy data conflicts before attempting the migration.
   This is a safety check, not a substitute for reviewing a backup.
3. During a controlled deployment window, run both scripts against the **target**
   database, using a privileged migration identity:
   ```sh
   CONFIRM_BOOKING_MIGRATION=apply bash scripts/apply-booking-integrity.sh
   ```
4. Confirm the verification script succeeds. Both installation scripts may be
   re-run, but the verification script must also run: `IF NOT EXISTS` alone
   cannot detect a pre-existing constraint with an incorrect definition.
5. Keep the constraints intact across later Payload/Drizzle schema changes.
   Inspect generated migrations before applying them.

**Important:** the preflight, installation and verification run together in
one transaction. The preflight assumes the Payload booking table and retry
metadata columns already exist; deploy that schema first.

The explicit deployment command runs installation and verification
in one PostgreSQL transaction, but is not hooked into the application's deployment
pipeline. It requires operator approval, a backup and a controlled migration window.
It is **not yet a managed production migration lifecycle**. Do not enable public
booking writes merely because CI is green.

## Failure behavior

PostgreSQL `23P01` on `bookings_no_active_overlap` means the requested slot
was taken. The booking service should return HTTP 409 without exposing SQL.
PostgreSQL `23505` on `bookings_idempotency_unique` requires re-reading the
winning booking and checking its request fingerprint. Reusing the same key with
different request data must be rejected. Other database errors must propagate
rather than being mislabeled as conflicts.

## Tests

CI covers SQL constraints, repeatable installation, concurrent SQL inserts,
Payload REST access restrictions, and Payload Local API idempotent create/replay.
The public booking API, production migration integration, authentication and
rate limiting are still required before launch.
