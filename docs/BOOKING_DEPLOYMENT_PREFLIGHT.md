# Booking deployment read-only preflight

Run `DATABASE_URL=... bash scripts/preflight-booking-deployment.sh` against the intended deployment database **after** reviewed migrations and integrity constraints have been installed.

The script uses a read-only PostgreSQL transaction and checks:

- Existing validated booking time-range, overlap and idempotency constraints.
- Presence of the booking idempotency unique index.
- Presence of the Payload migration ledger and the booking FK integrity migration record.

This gate **does not** verify the edge/proxy rate limit, identity/session policy, deployment topology, backup quality or browser behavior. It **does not** apply migrations, mutate data, or enable booking writes. Production `POST /api/bookings` and `PATCH /api/bookings/:id/status` remain intentionally blocked with HTTP 503.

Before a production launch, separately verify shared rate limiting across instances, trusted client identity, migration and backup/restore procedures, and an authenticated/guest booking acceptance test. Do not interpret a passing preflight as authorization to remove the write guard.
