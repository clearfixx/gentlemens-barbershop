# Customer Account, Loyalty and Shop — v1.0 domain contracts

Status: **architecture approved in principle; implementation and numerical policies pending**. This document does not create database tables, activate discounts, or change the booking API.

## Domain ownership and dependencies

- `customer-account` aggregates the authenticated user's own profile, appointments, orders, favorites and loyalty summary. It is not a source of truth for bookings, orders, stock or bonus balances.
- `shop` owns product catalog, price/variant, inventory, carts, checkout, orders and fulfillment. It depends on customer identity and calls loyalty through a server-side pricing/redemption contract.
- `loyalty` owns level definitions, versioned earning/redemption rules, XP and bonus ledger. It consumes validated eligible booking-completion and order-fulfillment events.
- All three share a PostgreSQL database and stable user IDs. Use server-side services, not cross-domain writes from client components or unrestricted Payload CRUD.
- Existing `Locations` is the authoritative pickup branch catalog. Existing `Bookings` remains the booking domain's source of truth.

## Proposed persistence model (not migrated)

| Entity | Essential fields / invariant |
| --- | --- |
| `CustomerProfiles` | unique user ID; optional phone/contact preferences; account-scoped access |
| `CustomerFavorites` | unique (user ID, product ID); no duplicate favorites |
| `Products` | SKU/slug, localized title and description, published state, media, price currency UAH, price minor units; archived rather than silently removed from historic orders |
| `ProductVariants` | optional unique SKU, product ID, purchasable state, price override |
| `Inventory` | stock by SKU/variant and location or fulfillment pool, reserved/available quantities, nonnegative invariant |
| `StockMovements` | append-only movement reason, quantity, order reference, idempotency key and actor |
| `Carts` / `CartItems` | user or opaque guest session; SKU/variant, quantity, updated timestamp; server revalidates prices |
| `Orders` / `OrderItems` | immutable customer/recipient and line snapshots, amounts in UAH minor units, shipping/discount totals, idempotency key, payment and fulfillment states |
| `OrderFulfillment` | discriminator `pickup | delivery`; pickup location ID **or** Ukrainian delivery address and recipient data; shipping carrier/tracking nullable |
| `LoyaltyAccounts` | unique user ID; read model for current XP, level and available bonus points, never client-writable |
| `LoyaltyLevels` / `LoyaltyRules` | effective dates, thresholds, eligibility, stacking/caps, version and admin audit; no rates or thresholds assumed |
| `LoyaltyTransactions` | immutable user, `xp | bonus`, signed amount, source type/reference, unique event key, rule version, reversal reference and timestamp |

Identifiers are illustrative entity names, not promises of specific Payload collection slugs. Resolve variant and multi-location stock complexity before migrations; do not introduce speculative tables if v1 inventory can be represented more simply.

## Checkout invariants

1. Authenticate the customer or validate a guest checkout session (guest checkout policy is still open). Never trust client identity or order totals.
2. Validate nonempty cart, positive integer quantities, active SKUs, stock, price snapshots, delivery eligibility, recipient details and applicable loyalty policy on the server.
3. Pickup requires an existing active barbershop location. Delivery requires a complete address in Ukraine; calculate shipping only from an approved configured tariff/carrier adapter.
4. Use one PostgreSQL transaction to create an order and item snapshots, reserve stock, and reserve/debit any redeemed bonuses. Lock or conditionally update inventory rows to prevent overselling; ensure `available >= 0`.
5. Require a unique checkout idempotency key scoped to the actor/session and request fingerprint. Same key + same request returns the original order; same key + different request is a conflict.
6. Order lifecycle transitions, stock release and bonus reversals must be authorized, idempotent and auditable. A failed checkout must not create an order, consume stock or debit points.
7. A customer's order reads only their own orders; staff/admin permissions are explicit. Store no payment card data.

Suggested order states: `placed -> confirmed -> preparing -> ready_for_pickup | shipped -> completed`; cancellation/refund paths are explicit and constrained. Payment state is separate from order/fulfillment state. Do not infer that `completed` means paid.

## Loyalty invariants

- XP tracks lifetime progress and cannot be spent. Bonus points are spendable under approved rules. Both have separate transaction types and balances.
- Award only on eligible confirmed service completion or eligible fulfilled purchase. Duplicate event delivery must not award twice.
- Cancel/refund creates a compensating ledger transaction; never edit/delete prior financial ledger entries. Handle partially refunded orders proportionally only under approved policy.
- A level discount and bonus redemption must be composed by a single authoritative pricing service; no double discounts or negative payable totals. Exact stacking, caps, expiry and accrual policy remain unapproved.
- Admin adjustments require an authorized actor, reason and audit trail. A user cannot submit XP or bonus balances directly.

## Account read contracts

- `GET /account/overview` (conceptual): own profile summary, upcoming bookings, order counts/status and loyalty read model; no private records from other users.
- `GET /account/orders`: paginated own orders; filters and details server-authorized.
- `GET /account/loyalty`: current XP/level, spendable bonuses, paginated ledger and next-tier progress if configured.
- `GET /shop/cart` and `POST /shop/checkout` (conceptual): authenticated or approved guest session; server-owned totals and checkout state.

These paths are **illustrative contracts**, not implemented routes; choose actual Next.js route names after the database model is reviewed.

## Open decisions before implementation

- Bonus earning/redemption rates, level thresholds, stacking, caps, expiration and eligibility.
- Guest checkout versus mandatory login.
- Whether stock is tracked per barbershop, in a shared warehouse, or both; pickup stock allocation.
- Carrier integration, delivery tariffs, payment-on-receipt process, refunds and return policy.
- Reservation expiry and handling abandoned/unpaid orders.
- Data retention and deletion/anonymization rules for order contacts and ledger records.

## Acceptance tests required

- Two concurrent checkouts cannot reserve the last item twice.
- Retried checkout with the same idempotency key cannot duplicate an order or bonus debit.
- Failed checkout leaves stock and bonus balances unchanged.
- Cancel/refund reverses stock/bonus effects exactly once.
- Fulfillment choice validates pickup branch or Ukrainian delivery address.
- A customer cannot read or change another customer's orders, favorites or loyalty ledger.
- Duplicate booking-completion or order-fulfillment events award XP/bonuses once.
- Existing bookings and legacy records survive migrations unchanged.
