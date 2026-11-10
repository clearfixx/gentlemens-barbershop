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

## Authoritative booking integrity deployment

Booking constraints are installed through the existing reviewed SQL deployment path:
`scripts/apply-booking-integrity.sh`, which runs
`db/constraints/preflight-booking-integrity.sql`,
`db/constraints/booking-no-overlap.sql`,
`db/constraints/booking-idempotency.sql`, and
`db/constraints/verify-booking-integrity.sql` within a single transaction, after explicit approval.

The authoritative PostgreSQL objects are:
- `bookings_valid_time_range` (interval order),
- `bookings_idempotency_fields_together` (retry metadata completeness),
- `bookings_idempotency_unique` (scope/key uniqueness), and
- `bookings_no_active_overlap` (same-barber active slot exclusion).

A redundant third Payload migration was removed after GitHub Actions run 42790890318 exposed a hard requirement that the two reviewed Payload migrations remain unchanged. That extra migration also contained malformed duplicated SQL and conflicting object definitions. Do not restore it. Production application of the existing SQL deployment path still requires a backup, maintenance window and real database verification.

**Limitations:** Database constraints are only one component. The public booking write path must remain restricted until transaction, replay and live database concurrency tests pass.

## Read-only migration preflight

For an additional read-only diagnostic on the target database, run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/booking-integrity-preflight.sql
```

The query reports counts for invalid intervals, incomplete idempotency metadata, duplicate scope/key groups and overlapping active-booking pairs. **All four counts must be zero** before running the controlled SQL deployment. The two subsequent queries show up to 100 conflicting booking pairs and duplicate retry-key groups for manual investigation. Do not automatically delete customer bookings to make migration pass.

This is a point-in-time preflight, not a concurrency barrier. Stop booking writes during migration or otherwise guarantee no new conflicting records can be inserted between preflight and constraint creation. Execute in a controlled maintenance window with a database backup and a reviewed rollback plan. The preflight does not apply the constraints and does not establish that the database concurrency tests have passed.

## Disposable SQL smoke test

After preparing a disposable PostgreSQL database, run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/booking-integrity-smoke.sql
```

This script creates a temporary table with similar constraint expressions, tests accepted adjacent slots, different barbers, cancelled slots, and expected SQLSTATEs for overlap (`23P01`), invalid intervals/incomplete retry metadata (`23514`) and duplicate retry keys (`23505`). It rolls back its test transaction.

**Important:** This is a constraint-expression smoke test, not a migration integration test and not a two-connection concurrency test. It requires permission to install or use `btree_gist`. Do not run it against production; use a disposable database. The probe uses a `num_nonnulls` formulation equivalent to the expected all-or-none metadata rule, but it is not proof that the installed database has the identical constraint definition.

## Idempotent persistence boundary

`src/lib/booking/persist-idempotently.ts` provides an internal replay algorithm with injected `readExisting` and `insert` callbacks. It checks scope, key and request hash before returning an existing row. On the exact `23505` error for `bookings_idempotency_unique`, it re-reads the committed row; missing rows and unrelated errors are propagated.

**Required integration contract:** `insert` must atomically persist the booking and all retry metadata. The first failed insert transaction must be rolled back before `readExisting` runs again. That read must be a fresh query with visibility of the winning committed transaction, under the trusted scope/key, and must not return records belonging to another principal. Do not invoke the helper from a public endpoint until these conditions are enforced by the concrete Payload/PostgreSQL adapter. Unit tests use in-memory callbacks; they do not validate transaction isolation or database connectivity.

## Installed integrity verification

After applying the approved booking SQL deployment on a **disposable** database, verify the actual PostgreSQL schema (rather than only a temporary copy of the constraint expressions):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/booking-integrity-verify.sql
```

This read-only check inspects `pg_constraint` and `pg_indexes` for the installed booking overlap exclusion, interval check, retry metadata check, and unique retry index. It raises an error if a required object is missing or has an unexpected broad shape. It does not prove all predicates are semantically correct, nor does it replace two-connection concurrency testing.

The idempotent persistence helper additionally checks the retry identity on a newly inserted row. A concrete database adapter must ensure that a failed identity check cannot leave a committed incorrect row; validation after commit is only a defensive assertion, **not** a transaction guarantee.
