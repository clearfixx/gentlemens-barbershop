# Loyalty accounting domain (initial package)

XP is a nonspendable measure of customer progress. Bonus points are a separate
spendable balance. `src/lib/loyalty/ledger.ts` implements a deterministic
projection over an ordered event stream; no customer can gain points by repeating
an event ID or idempotency key. Compensating events reference earlier entries;
a redeemed reward cannot be reversed if its points have already been spent.

**Not yet wired to production:** this package does not create tables, update
customer accounts, award XP for bookings, determine levels, establish conversion
rates, or offer a checkout discount. Before exposing loyalty APIs, persist events
in an append-only PostgreSQL ledger with unique constraints, per-customer
transaction locking and atomic balance checks. Business rules for levels,
rewards and discount caps require product approval.
