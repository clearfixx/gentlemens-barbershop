# Shared booking limiter: PostgreSQL prototype

`db/booking-rate-limit/disposable-limiter.sql` provides a **disposable CI-only** shared fixed-window counter, and `test-disposable-limiter.sql` verifies two accepted requests, a rejected third request, independent keys and the next window.

Atomic `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE hits < limit` uses PostgreSQL row locking so separate app instances cannot both consume the last slot. This is a foundation, **not yet a production rate limiter**.

Before use: add an approved production migration, a bounded retention/cleanup policy, an authenticated/trusted identity strategy, explicit fail-closed handling for database outages, tests for parallel database connections, and wire the actual booking POST/PATCH handlers. The existing production write guard must remain enabled until those steps are complete. Do not install the CI schema in production.

CI also runs `scripts/test-concurrent-booking-rate-limit.sh`, which starts twelve independent PostgreSQL sessions against one budget of three and asserts exactly three successes, nine rejections and a persisted count of three. This checks concurrent database connections, not production HTTP wiring or multiple deployed application instances.

## Managed storage migration

Migration `20261112_060000_booking_shared_rate_limit` creates the production-named table `booking_rate_limit_buckets`, an atomic `booking_rate_limit_consume` function, a window-start index and `booking_rate_limit_prune` cleanup function. No production endpoint calls these functions yet.

Retention is **not automatically scheduled**: a deployment operator must configure a recurring cleanup job using a cutoff safely older than all supported rate-limit windows (for example, retaining at least 24 hours). Do not prune active windows. The table and function must be monitored for failures and growth. Production booking writes remain blocked.
