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
one parameterized SQL statement returning only the customer's balance. The customer ID comes from
the authenticated principal; numeric IDs and bigint balances are validated
before being returned. This adapter is not exposed through HTTP until the
loyalty schema is installed through a reviewed migration and role permissions
are restricted. The full-history query must be paginated before high-volume use.

## Bounded history pagination

`getOwnLoyaltyHistoryPage` reads only the authenticated customer's entries,
newest first, using keyset pagination (`id < before`). The limit is 1–50
(default 20); the cursor is an opaque-to-the-UI numeric ledger ID. The query
requests one extra row to determine whether another page exists. The cursor
and page size are validated before any database access. This is an internal
server-only module, not yet a public route.

## Bounded reads by design

The balance snapshot deliberately returns an empty `history` array for
backward compatibility with the read contract. Ledger history must be loaded
separately using `getOwnLoyaltyHistoryPage` (maximum 50 entries). This
prevents an unbounded aggregate of every historical event on each dashboard
refresh. Before exposing HTTP APIs, consider separating balance and history
into distinct response types rather than retaining the empty compatibility
field.
