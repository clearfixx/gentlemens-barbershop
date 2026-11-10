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
