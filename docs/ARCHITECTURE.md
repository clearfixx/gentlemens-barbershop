# Architecture Decision Record — Initial foundation

## Decision

Single Next.js App Router application, TypeScript, Payload CMS, PostgreSQL. No independent Express or NestJS service initially. Payload is the content/auth/admin backend; dedicated server-side booking domain functions handle business rules. Deployment architecture is deliberately simple.

## Package approach

One application repository, not a premature monorepo. Feature-oriented folders when implementation begins:

```
src/
  app/
    (site)/
    (account)/
    (barber)/
    (admin)/
    (payload)/
  components/
    ui/
    layout/
  features/
    booking/
    barbers/
    shops/
    shop/
    loyalty/
    customer-account/
    reviews/
    notifications/
  lib/
    auth/
    db/
    validation/
  payload/
    collections/
    globals/
    access/
```

This is a conceptual target; actual Payload route directories must follow the official starter/template of the selected compatible package versions.

## Libraries / responsibilities

- Tailwind CSS + shadcn/ui for accessible reusable primitives; custom premium design tokens and application layouts.
- Zustand only for state crossing component boundaries such as unfinished booking flow or global overlays.
- TanStack Query where browser-side caching/refetch/polling is genuinely needed. Prefer Next.js server components and Payload Local API for direct server reads; avoid client-side fetching by default.
- React Hook Form + Zod for interactive forms. Server validation is authoritative.
- Motion for React for subtle intentional animation; Embla for interactive carousel if needed.
- MapLibre or custom vector illustration for locations, after data and licensing are settled.
- PostgreSQL holds transactional data and is the source of truth; no parallel Supabase database/auth source at launch.

## Booking domain — mandatory rules

- Shops, barbers, services and `barber_services` (barber, service, duration, price, availability).
- Barber-to-shop assignments are dated or otherwise explicitly modeled if staff can move between branches.
- Time in UTC in persistence; shop timezone determines displayed local schedules and DST transitions.
- Schedule rules, breaks, days off, exceptions and existing appointments all affect availability.
- Selecting several services means a contiguous slot for their *combined* duration; do not sum displayed product prices on the client as authoritative.
- Transactional creation with a DB-backed non-overlap guarantee for active bookings (for example Postgres exclusion constraint on barber_id + tstzrange using GiST) and idempotency key. Availability read alone is not a concurrency guarantee.
- Cancellation/decline and reschedule are server-validated state transitions with clear ownership and notifications.
- Explicitly decide whether new requests *hold* slots while awaiting barber acceptance; recommended default is yes, otherwise double bookings are possible.
- Do not rely exclusively on Payload collection hooks for conflict protection.

## Customer account, shop and loyalty — v1.0 boundaries

- **Customer account** is a read/write facade over the authenticated user's permitted profile, bookings, orders, favorites and loyalty summaries. It does not own booking, inventory, order or bonus business rules. Customer IDs link domains; authorization is checked independently in each domain.
- **Shop** owns `Products`, optional `ProductVariants`, `Inventory` / `StockMovements`, `Carts` / `CartItems`, `Orders`, `OrderItems`, and fulfillment details. An order stores a price/name snapshot and a fulfillment discriminator `pickup | delivery`. Pickup requires a valid `Location` reference; delivery requires a Ukrainian delivery address and recipient contact. The shipping provider integration is an adapter, not a dependency of core order creation.
- **Loyalty** owns `LoyaltyAccounts`, `LoyaltyLevels`, `LoyaltyRules` and immutable `LoyaltyTransactions` with separate XP and bonus units. Unique source-event IDs prevent duplicate awards; reversals are new ledger entries. Rule changes are versioned and audited. The user profile never directly writes balances.
- A server-side **checkout service** validates cart, stock, discounts, delivery method, totals and authorization in one authoritative flow. Order creation, stock reservation and any bonus reservation/debit must be transactionally consistent in PostgreSQL; retries use idempotency. Order cancellation/refund reverses stock/bonus effects exactly once.
- Award XP/bonus after an eligible completed booking or fulfilled order, not on request creation. Event processing must be idempotent; if asynchronous delivery is introduced, use a durable outbox or equivalent rather than relying on a best-effort hook.
- No online payment gateway or multi-vendor marketplace in v1.0. Delivery across Ukraine and pickup at a selected barbershop are approved. Carrier, fees, payment-on-receipt and loyalty numeric policies are **not yet approved**.
- Domain writes should use explicit service functions and database transactions; Payload collections are content/admin storage and access controls, not a substitute for stock/ledger transactional integrity.

## Security

Least-privilege role/permission checks server-side; Payload collection access configuration and specific business authorization. Protected routes and API endpoints independently enforce access. No user-editable role escalation or trusting the browser for prices. Rate-limit booking/auth/contact; abuse protection for guest requests. Secrets never committed; separate development and production env. Audit sensitive actions. GDPR/Ukraine privacy requirements and retention policies to be reviewed before deployment.

## Media

The reference mockups are visual directions, not permission to reuse third-party logos, portraits or product images. Store approved or newly created licensed assets in an organized media library.

## Version compatibility

Pin and verify compatible Next.js, Payload, React, TypeScript and Node.js versions when scaffolding; current Payload docs list specific Next and Node ranges. Use the official Payload starter rather than hand-assembling undocumented framework routes. Test locally and in CI before claiming builds pass.

## Quality gate

`pnpm lint`, `pnpm typecheck`, `pnpm build`, and focused tests, once scripts exist. GitHub Actions should perform the same checks. Never merge a failing foundation. Each logical feature is developed in a branch and proposed via PR.
