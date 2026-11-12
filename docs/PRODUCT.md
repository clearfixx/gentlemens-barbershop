# Gentlemen's Barbershop — Product Specification (initial)

Status: foundation draft, based on user-supplied requirements and reference mockups. Reference images remain the visual source of truth; this document does not supersede them.

## Brand and visual direction

Premium Gentleman Club: vintage/barbershop heritage aesthetics, parchment texture, warm creams, dark chocolate, muted gold, premium editorial layout. Light and dark theme (designed palettes, not literal CSS inversion). Initial palette: cream `#F2E9DC`, chocolate `#2A1D16`, gold `#C8A86B`. Body text: Inter; decorative/editorial headings may use a compatible serif face to reproduce the references. Responsive mobile/tablet/desktop; keyboard navigation, reduced-motion support, accessible contrast. Glass effects should be subtle, readable and efficient rather than indiscriminate.

## Public website

- Hero: photographic split slide/text layout, premium transitions, slide progress/timer, pause/play, previous/next, CTA; scroll-down button to the next section. Navbar may reveal on scroll rather than obscuring first hero.
- Navbar: section anchors with smooth scroll + active-section indication; account/notifications/hamburger; mobile navigation and dropdown states.
- Why choose us; team/barbers; reviews; featured products; locations with three map pins; contact form; social links/feeds (provider API constraints must be respected); large two-part footer and newsletter signup.
- Additional pages: services, product catalog and detail, news listing and article, FAQ, shop locations, legal/policy.
- Shop v1.0: small first-party barbershop store with product catalog/detail, persistent cart, full checkout and order creation. Fulfillment supports **pickup at a selected barbershop location** and **delivery within Ukraine**. No online payment integration in v1.0; payment method and fulfillment rules require configuration before release.

## Authentication and customer

Register/login/logout. A unified customer dashboard includes editable profile and contacts, upcoming/past bookings, saved products, cart, order history/status, and loyalty level/XP/bonus balance and transaction history. Post-visit ratings and moderated reviews remain planned. Gift certificates require separate approval.

## Customer loyalty v1.0 — approved module, rules pending

- Separate **non-spendable XP** (progress/level) from **spendable bonus points** (discount value). XP is never deducted when bonuses are redeemed.
- Levels may unlock benefits and discounts; all thresholds, earn/redeem rates, expiration, stacking and caps must be approved and configurable before enabling rewards. No example tier values are approved.
- Persist an append-only transaction ledger for XP and bonus changes, with source event, order/booking reference, idempotency key and audit metadata. Balances are derived or transactionally maintained from the ledger; no silent direct balance edits.
- Award for completed/eligible bookings and fulfilled/eligible orders only; handle cancellations, refunds and reversals explicitly. Never reward mere booking/order creation.
- The server computes final discounts, enforces limits and prevents duplicate accrual/redemption; clients cannot submit authoritative point balances or discount amounts.

## Shop v1.0 — approved checkout and fulfillment

- First-party shop, **not** a multi-vendor marketplace. Product catalog with photos, prices in UAH, availability, cart quantities and checkout; authenticated customers see order history in their account.
- Customer selects **pickup at a specific barbershop** or **delivery to an address in Ukraine**. Pickup location and delivery destination are recorded on each order; never infer a pickup branch from an unrelated appointment.
- Delivery provider, geographic exceptions, shipping fee calculation, payment-on-receipt arrangements and return policy remain operational decisions to confirm before launch. Do not claim a courier integration is implemented.
- At checkout the server revalidates product prices, availability, quantity, shipping cost and discounts, then stores immutable order-item price/name snapshots and totals. Reserve/release stock atomically with order state transitions, and use an idempotency key to prevent duplicate orders.
- Store customer and delivery contact details with least-privilege access and defined retention. Never trust client-supplied order totals. No online payment gateway in v1.0; payment at pickup or delivery is subject to operational confirmation.

## Booking (five steps)

1. Choose shop/location.
2. Choose a barber working at that location (show closest genuinely available slot).
3. Select service(s), with per-barber price and duration.
4. Choose a free date/time matching total duration, schedule, breaks, exceptions and reservations.
5. Contact details and final confirmation. Prefill for authenticated customer; guest flow allowed.

After confirmation, a logged-in customer's account shows location, barber, service(s), date/time and status. Booking statuses and notifications must remain consistent.

## Barber workspace

Day/calendar bookings; accept/decline with proper status transitions; client details with least-privilege access; work hours and blocked slots; review feed; service demand, occupancy and earnings metrics (where data is available). Price editing only when explicitly granted by admin.

## Administration

Premium custom admin interface based on approved mockup. User and role management; shops; barber roster and grades; service catalog and barber-specific price/duration overrides; schedules and bookings; moderated reviews; products/inventory/carts/orders, pickup and delivery fulfillment; loyalty rules and auditable adjustments; news; hero/section/SEO/media/footer content; notifications and settings. Payload Admin can supply CMS management internally; custom operational dashboards must not assume Payload default UI matches the references.

## Roles

Visitor, customer, barber, admin. Additional permissions based on specific actions, not on hidden UI links. Backend checks every protected operation. Authorization, uploads, content moderation and data minimization are mandatory.

## Out-of-scope until individually approved

Online payments, SMS/push provider integrations, real social-feed syncing without API credentials, gift-card redemption, external loyalty provider integrations, external calendar sync. Mockups may illustrate these features but do not constitute ready integrations.

## Core acceptance boundaries

No double booking even under concurrent requests. Server calculates price, duration and available slots. All appointment transitions are validated. User sees only allowed appointments; barber only their own; admin according to scope. Forms validate on client and server. Mobile first, accessibility and performance checks before production.
