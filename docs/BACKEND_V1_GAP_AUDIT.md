# Backend v1.0 — implementation gap audit

Status: repository inspection at commit `5ffc736`. This is a source-level inventory, **not** a claim of production readiness. GitHub Actions run 43159974513 passed all five jobs. Browser UX, production deployment and operational acceptance are separate gates.

## Confirmed implemented foundations

- Next.js, Payload CMS, PostgreSQL, UA/EN localization, versioned migrations and CI.
- Payload collections: Users, Media, Locations, Services, Barbers, Bookings, BookingEvents, BarberSchedules, BarberTimeOff and Translations.
- User roles `customer`, `barber`, `admin`, account-scoped user reads and restricted Payload administration.
- Public catalog and availability routes; booking wizard page/component exists (its full UX is **not** signed off).
- Booking core: availability and schedule helpers, per-barber offerings, SQL overlap/idempotency protections, trusted server-side booking persistence, status policy, cancellation policy, audit events, and history/status HTTP routes.
- Integration tests exercise concurrent slot conflicts, retry behavior, trusted booking creation and schema migration paths.

## Critical limitations / not production-ready

1. **Production booking writes are intentionally disabled.** `src/lib/booking/booking-write-guard.ts` requires non-production `NODE_ENV` and `BOOKING_WRITE_TEST_MODE=enabled`. Both booking POST and status PATCH return 503 in production. Do not remove this guard without shared/edge rate limiting, deployment preflight and security review.
2. Guest booking is not a complete released path: the POST route uses `submitAuthenticatedBooking`. Validate the approved guest-contact/identity policy before activation.
3. CI success is not an end-to-end browser or deployment acceptance test. Verify admin operations, user onboarding, booking wizard and accessibility in a real environment.
4. `docs/IMPLEMENTATION-STATUS.md` describes an earlier scaffold and is not a current completion ledger; do not interpret its old status as the state of this branch.

## Domain gaps against approved v1.0 roadmap

| Domain | Source-level status | Remaining acceptance scope |
| --- | --- | --- |
| Foundation, localization, database | Implemented and CI-verified | Deployment, backups, restore, observability, production configuration |
| Catalog, locations, barbers, schedules | Core collections and services present | Full admin workflows, real content, media storage and operational UX |
| Booking | Substantial domain logic, APIs and wizard scaffold | Secure production write activation, guest policy, browser E2E, booking notifications |
| Customer account | Payload user identity and booking history API present | Profile UI, account dashboard, own orders, favorites, notifications |
| Barber workspace | Role and management API present | Calendar/workspace UI, operational metrics and staff acceptance |
| Site CMS | Translations and basic catalog collections present | Editable hero/sections, news, FAQ, contacts, SEO settings and publishing workflow |
| Shop / fulfillment | Architecture documented; no Products, Carts, Orders, Inventory collections registered in Payload | Product/stock models, cart, transactional checkout, pickup and Ukraine delivery, order lifecycle |
| Loyalty | Ledger/read helpers and tests present; architecture describes pending persistence | Versioned rules, persisted ledger/accounts, earn/redeem/reverse, admin controls, approved numerical policy |
| Reviews / engagement | Not evidenced by registered Payload collections or routes | Reviews/moderation, notifications, contact form, reliable email provider |
| Release readiness | CI and migration checks pass | E2E, a11y, SEO, performance, threat review, backup/restore, production smoke |

## Next implementation packages (medium/large, one branch per block)

1. **Booking production-readiness:** shared rate limit, authenticated/guest identity decision, migration preflight, operational security tests, real HTTP/browser E2E. Keep fail-closed until all gates pass.
2. **Content and account backend:** CMS-managed page sections/news/FAQ/SEO and user profile/read models; explicit authorization and migrations.
3. **Shop and order domain:** agree inventory ownership, guest checkout and delivery tariff first; then implement product, stock, cart, order, fulfillment and transaction/integrity tests.
4. **Loyalty and engagement:** approve thresholds/rates and implement persisted event ledger, account reads, reversals, reviews and notification workflows.
5. **Frontend and release:** implement approved premium responsive UX against stable contracts, then production E2E/a11y/SEO/performance and deployment rehearsal.

## Decisions still required

- Guest booking and guest shop checkout identity/verification.
- Inventory location model, shipping carrier/tariff, payment-on-receipt and returns.
- Loyalty XP/bonus rates, levels, stacking, expiry and redemption rules.
- Provider choices and credentials for email, storage and operational monitoring.

Do not mark a domain complete merely because a helper, route, test or architectural document exists.
