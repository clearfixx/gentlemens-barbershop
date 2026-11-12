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

## Ledger integrity and privilege boundary

The disposable prototype now rejects UPDATE and DELETE on ledger entries
through database triggers and revokes the function's default PUBLIC execute
privilege. CI tests attempt ledger mutation and cross-customer reversal.
This is defense in depth, **not** production authorization: the database owner
can still change tables, and the application currently has no separate
restricted database role. Before migration activation, provision a non-owner
runtime role, grant only the required SELECT and EXECUTE privileges, and test
that direct balance writes and ledger INSERT/UPDATE/DELETE are denied.

## Restricted-role rehearsal

The prototype function now runs as `SECURITY DEFINER` with an explicit
`pg_catalog, public, pg_temp` search path. The disposable CI fixture creates a
non-login runtime role, grants read access and narrowly scoped function
execution, then proves that earning works while direct account updates,
ledger inserts/deletes and overspending are refused. The entire fixture is
rolled back. The role is **not** a deployed production identity. The function
owner must be a dedicated trusted owner in production; no untrusted user may
create objects in schemas in the function search path.
