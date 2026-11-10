# Customer loyalty read boundary

`src/lib/loyalty/read-own-loyalty.ts` introduces the authenticated customer-only
read boundary. The caller must provide a trusted server-side Payload principal.
Customer IDs are never accepted from user-controlled query parameters or bodies.
Guests, barbers and admins cannot use this customer-specific path. A repository
response with another customer's ID is rejected.

The repository interface deliberately has no concrete production implementation
yet: the PostgreSQL ledger remains a disposable prototype, not a reviewed Payload
migration. Do **not** expose an HTTP route that reads the prototype tables.
After production schema and database permissions are approved, implement a
server-only repository, bind it to Payload's verified session and add API
integration tests for cross-account access.

## PostgreSQL read adapter

`src/lib/loyalty/sql-read-repository.ts` implements the read contract using
one parameterized SQL statement, returning the balance and ordered ledger
history from the same PostgreSQL MVCC snapshot. The customer ID comes from
the authenticated principal; numeric IDs and bigint balances are validated
before being returned. This adapter is not exposed through HTTP until the
loyalty schema is installed through a reviewed migration and role permissions
are restricted. The full-history query must be paginated before high-volume use.
