# Shared booking limiter: PostgreSQL prototype

`db/booking-rate-limit/disposable-limiter.sql` provides a **disposable CI-only** shared fixed-window counter, and `test-disposable-limiter.sql` verifies two accepted requests, a rejected third request, independent keys and the next window.

Atomic `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE hits < limit` uses PostgreSQL row locking so separate app instances cannot both consume the last slot. This is a foundation, **not yet a production rate limiter**.

Before use: add an approved production migration, a bounded retention/cleanup policy, an authenticated/trusted identity strategy, explicit fail-closed handling for database outages, tests for parallel database connections, and wire the actual booking POST/PATCH handlers. The existing production write guard must remain enabled until those steps are complete. Do not install the CI schema in production.

CI also runs `scripts/test-concurrent-booking-rate-limit.sh`, which starts twelve independent PostgreSQL sessions against one budget of three and asserts exactly three successes, nine rejections and a persisted count of three. This checks concurrent database connections, not production HTTP wiring or multiple deployed application instances.

## Managed storage migration

Migration `20261112_060000_booking_shared_rate_limit` creates the production-named table `booking_rate_limit_buckets`, an atomic `booking_rate_limit_consume` function, a window-start index and `booking_rate_limit_prune` cleanup function. No production endpoint calls these functions yet.

Retention is **not automatically scheduled**: a deployment operator must configure a recurring cleanup job using a cutoff safely older than all supported rate-limit windows (for example, retaining at least 24 hours). Do not prune active windows. The table and function must be monitored for failures and growth. Production booking writes remain blocked.

## HTTP integration

Both booking POST and status PATCH now consume a global, PostgreSQL-backed budget after the existing local defense-in-depth budget. The SQL call uses Payload's database adapter and never reads untrusted forwarded identity headers. A missing migration or database error fails closed before authentication/business mutation. The existing production write gate remains closed; shared limiter use is currently exercised only by explicitly enabled non-production HTTP writes. Global budget: 20 requests per fixed minute across all application instances, shared between both endpoints. This is deliberately conservative and should be revisited before production activation.

## Scheduled retention cleanup

Run `CONFIRM_BOOKING_RATE_LIMIT_CLEANUP=prune bash scripts/prune-booking-rate-limit.sh` with a trusted `DATABASE_URL` after the managed migration is installed. This **mutates the database**, so the explicit approval variable is required. The script uses PostgreSQL's clock and preserves the last 24 hours of fixed-minute windows; it applies a 30-second statement timeout and stops on SQL errors. Schedule it with the deployment's trusted cron/scheduler (for example, hourly), monitor failures and table growth. The script does **not** register a scheduler by itself. Never run against an unreviewed database.

## Failure-path tests

`booking-write-guard.test.ts` exercises the application-level SQL adapter using a fake Payload database connection: successful allowance, rejection and retry interval, database exception propagation, invalid response shapes and invalid clock values. This does not replace full HTTP integration testing; production writes remain disabled.

## Local HTTP throttle regression

The isolated `scripts/test-booking-management-http.ts` test now fills the shared global budget and checks both POST and PATCH return 429 with Retry-After, while existing booking status and audit events remain unchanged. It runs only against the explicit loopback test server and isolated integration database; it is **not** currently a CI step. Database-outage behavior is covered at the shared adapter level, not yet end-to-end HTTP.

## Shared limiter outage HTTP contract

Both booking write routes return HTTP 503 with `Cache-Control: no-store` and `Retry-After: 60` if the shared limiter SQL call throws or its response is malformed. The failure is handled before authentication and booking mutations, and no process-local fallback is allowed. The response body does not disclose database details. A database initialization failure before reaching the limiter remains handled by the outer route error handler. This behavior still requires an isolated HTTP failure-injection integration test.

## Isolated HTTP limiter outage regression

The local loopback-only `scripts/test-booking-management-http.ts` temporarily renames the limiter SQL function on the **strictly pinned disposable integration database**, requests both booking write endpoints, asserts HTTP 503, Retry-After, no-store and unchanged booking/audit state, and restores the SQL function in a `finally` block. Do not run the script against a shared or production database. This regression is not yet part of GitHub Actions; the CI suite currently covers the SQL adapter failure path and production-disabled HTTP routes separately.
