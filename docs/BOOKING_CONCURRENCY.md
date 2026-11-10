# Booking concurrency and persistence contract

The booking domain performs catalog validation, server-side pricing, and an advisory availability check before persistence. This **does not** reserve the slot.

## Required persistence invariants

1. PostgreSQL must enforce non-overlap for active bookings of the same barber with an exclusion constraint using the exact name `bookings_no_active_overlap`. The constraint must account for the full half-open UTC interval `[startsAt, endsAt)` and exclude inactive statuses as defined by the product policy.
2. The booking write and idempotency record must be atomic within one transaction. A unique index on the trusted scope/key pair must ensure that two simultaneous requests cannot create two appointments.
3. A duplicate idempotency key with the **same** normalized request hash must replay the original result; a different hash must fail. Resolve uniqueness conflicts by re-reading the committed row, not by blindly retrying the insert.
4. SQLSTATE `23P01` is translated to `BookingSlotConflictError` **only** when the violated constraint is `bookings_no_active_overlap`. Other database errors remain visible to server diagnostics.
5. Do not expose raw SQL error messages, customer details, or internal idempotency hashes to public clients. Public endpoints must derive identity/scope from a trusted server-side session or a verified guest token.

## Test coverage and limitations

`src/lib/booking/create-booking.test.ts` includes a deterministic two-attempt race where both callers see an available slot and the injected persistence adapter accepts exactly one write. This checks orchestration and error translation only; it **does not** prove that PostgreSQL has the required constraint, isolation level, transaction boundaries, or unique index.

Before enabling public booking writes, run a disposable PostgreSQL integration test with two independent connections and simultaneous inserts for the same barber/interval, plus independent idempotency-key collisions. Verify that exactly one active booking commits, no partial idempotency metadata survives a rollback, and adjacent non-overlapping intervals can both commit. Review migrations and their rollback plan separately.

## Database migration (2026-11-10)

`src/migrations/20261110_110000_booking_integrity.ts` adds:
- `bookings_valid_interval`: end must be after start.
- `bookings_idempotency_complete`: retry metadata must be entirely absent or complete with a 64-character lowercase SHA-256 digest.
- `bookings_idempotency_scope_key_unique`: partial unique index for non-null scope/key pairs.
- `bookings_no_active_overlap`: GiST exclusion for `pending` and `confirmed` appointments of the same barber, using half-open UTC time ranges.

The migration uses `btree_gist` and must be applied by a database role permitted to create that extension. Review existing data for overlapping active bookings, duplicate idempotency pairs, incomplete retry metadata, and invalid time intervals before running it. A failed migration must not be bypassed by disabling the constraints.

**Limitations:** These constraints are not a complete booking transaction implementation. The public write endpoint remains disabled until the persistence adapter, transaction boundaries, replay handling and live PostgreSQL concurrency tests are reviewed. The down migration removes the added constraints/index but deliberately leaves the shared extension installed.

## Read-only migration preflight

Before applying the integrity migration to an existing database, run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/booking-integrity-preflight.sql
```

The query reports counts for invalid intervals, incomplete idempotency metadata, duplicate scope/key groups and overlapping active-booking pairs. **All four counts must be zero** before applying the migration. The two subsequent queries show up to 100 conflicting booking pairs and duplicate retry-key groups for manual investigation. Do not automatically delete customer bookings to make migration pass.

This is a point-in-time preflight, not a concurrency barrier. Stop booking writes during migration or otherwise guarantee no new conflicting records can be inserted between preflight and constraint creation. Execute in a controlled maintenance window with a database backup and a reviewed rollback plan. The preflight does not apply the migration and does not establish that the database concurrency tests have passed.

## Disposable SQL smoke test

After preparing a disposable PostgreSQL database, run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/booking-integrity-smoke.sql
```

This script creates a temporary table with the same constraint expressions, tests accepted adjacent slots, different barbers, cancelled slots, and expected SQLSTATEs for overlap (`23P01`), invalid intervals/incomplete retry metadata (`23514`) and duplicate retry keys (`23505`). It rolls back its test transaction.

**Important:** This is a constraint-expression smoke test, not a migration integration test and not a two-connection concurrency test. It requires permission to install or use `btree_gist`. Do not run it against production; use a disposable database. The idempotency completeness check uses `num_nonnulls` so SQL three-valued NULL logic cannot silently accept partially filled metadata.

## Idempotent persistence boundary

`src/lib/booking/persist-idempotently.ts` provides an internal replay algorithm with injected `readExisting` and `insert` callbacks. It checks scope, key and request hash before returning an existing row. On the exact `23505` error for `bookings_idempotency_scope_key_unique`, it re-reads the committed row; missing rows and unrelated errors are propagated.

**Required integration contract:** `insert` must atomically persist the booking and all retry metadata. The first failed insert transaction must be rolled back before `readExisting` runs again. That read must be a fresh query with visibility of the winning committed transaction, under the trusted scope/key, and must not return records belonging to another principal. Do not invoke the helper from a public endpoint until these conditions are enforced by the concrete Payload/PostgreSQL adapter. Unit tests use in-memory callbacks; they do not validate transaction isolation or database connectivity.
