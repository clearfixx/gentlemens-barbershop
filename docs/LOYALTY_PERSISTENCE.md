# Loyalty persistence — disposable PostgreSQL rehearsal

The domain ledger projection is now complemented by an isolated PostgreSQL
prototype in `db/loyalty/disposable-schema.sql` and transactional regression
fixtures in `db/loyalty/test-disposable-ledger.sql`.

Each customer has a row-locked balance. A stored PostgreSQL function validates
earning, redemption and compensation, then updates the balance and inserts an
immutable-history entry in the **same statement transaction**. Database unique
constraints reject duplicate idempotency keys and double reversal. Negative
balances and negative XP are forbidden.

**Not production-ready:** SQL is intentionally excluded from committed Payload
migrations, so no production schema is changed. Before production use:
- Review roles, revoke direct table writes, restrict function execution and
  define ownership/security boundaries.
- Implement application-level authenticated customer binding and idempotent
  response replay with request-hash validation.
- Add reviewed migration, data backfill, concurrency tests, and operational
  rollback plan; do not deploy prototype SQL directly.
- Approve XP rates, bonus earning rules, levels and discounts separately.
