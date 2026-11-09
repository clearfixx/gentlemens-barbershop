# Public availability endpoint

GET /api/availability?barber=1&service=2&date=YYYY-MM-DD

- Returns only UTC start/end instants, location timezone, and trusted service pricing/duration. Never exposes customer, booking, or time-off records.
- Only active barber, location, service and an explicitly offered service are eligible.
- Rejects duplicate/unknown parameters, malformed IDs/dates and dates beyond the near-term window (400). Unknown/inactive catalog entities return 404.
- A bounded, **worker-wide** in-memory budget allows 120 valid requests per minute per Next.js worker. Excess requests return 429 and Retry-After. Invalid requests are rejected before database access.
- **This is not distributed abuse protection.** Every production deployment MUST enforce an additional trusted edge/reverse-proxy rate limit across all workers and instances. The worker-wide budget can reject legitimate visitors during heavy traffic; it is intentionally a safety fallback, not per-client fairness.
- No-store responses prevent a stale slot list from being served by a shared HTTP cache. Availability is informational only: PostgreSQL overlap constraints remain the final concurrency authority at booking creation.
- Public booking writes remain disabled until the database integrity migration is applied and the booking route has been reviewed and tested.

Run the GitHub validation workflow for TypeScript, lint, build, route smoke tests and request-budget unit tests.
