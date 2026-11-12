# Shared booking limiter: PostgreSQL prototype

`db/booking-rate-limit/disposable-limiter.sql` provides a **disposable CI-only** shared fixed-window counter, and `test-disposable-limiter.sql` verifies two accepted requests, a rejected third request, independent keys and the next window.

Atomic `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE hits < limit` uses PostgreSQL row locking so separate app instances cannot both consume the last slot. This is a foundation, **not yet a production rate limiter**.

Before use: add an approved production migration, a bounded retention/cleanup policy, an authenticated/trusted identity strategy, explicit fail-closed handling for database outages, tests for parallel database connections, and wire the actual booking POST/PATCH handlers. The existing production write guard must remain enabled until those steps are complete. Do not install the CI schema in production.
