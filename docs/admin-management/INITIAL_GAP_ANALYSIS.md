# Admin Management v1.0 — initial gap analysis

Date: 2026-11-16. Reference: user-provided barber dashboard mockup and ADMIN_MANAGEMENT_V1_TZ.md.

## Role boundary
The mockup is explicitly a **barber dashboard** (personal appointments, roster, earnings, ratings), whereas the P0 specification describes a **network administration console**. Reuse visual design tokens and components, but preserve different navigation/data scopes and server-side permissions. Do not grant barbers Payload admin access.

## Verified in main
- Next.js App Router + Payload 3, PostgreSQL; real versions must be resolved from lockfile (package.json declares ranges).
- Admin CMS uses Payload RootPage; `src/payload.config.ts` defines collections and UA/EN localization.
- `Users.access.admin` enforces role=admin.
- `Locations`, `Services`, `Barbers`, `Bookings`, `Reviews`, `BookingEvents`, `BarberSchedules`, `BarberTimeOff`, `Translations` exist.
- `Barbers.serviceOfferings` already includes priceOverride and durationOverrideMinutes. Do not add a duplicate matrix.
- `getAdminBookings` already has paginated location/barber/date/status filters. `changeAdminBookingStatus` uses atomic SQL and creates BookingEvents.
- `getOwnBarberBookings` and `changeOwnBarberBookingStatus` implement role-scoped barber operations.
- `Reviews` supports pending/published/rejected and immutable client-authored content.

## Observed gaps / risks
1. **Critical:** `Bookings.access.create/update` currently allows direct admin Payload CRUD. Its `beforeChange` hook validates limited status transitions, but does not itself enforce the full atomic audit/time constraints of `changeAdminBookingStatus` nor protected pricing/slot invariants. Design and test a safe write boundary before enabling UI mutations.
2. The existing Payload RootPage is not the bespoke dashboard in the image. Custom admin views/components and styles are needed for visual fidelity; keep CMS collections/backend.
3. Financial cards, net revenue, utilization, client totals, and rating aggregates in the mockup require server-side query definitions. Values from the image are **examples only**, never fixtures or production placeholders.
4. The screenshot shows a single desktop barber screen; it does not establish mobile or dark-theme behavior. Implement responsive views conservatively and verify visually.
5. Review sidebar items include certificates, finances and messaging not in current P0 scope. Do not present dead or fake working actions.

## Planned implementation packages
A. Secure booking write boundary + regression tests (admin and barber); audit existing API routes, Payload hooks, privileged Local API writes.
B. Shared visual primitives: layout, sidebar, header, cards, table, filters, responsive/keyboard interactions, UA/EN and light/dark; pixel comparison against the user's image.
C. Admin operational pages using current Payload collections/services: locations, barbers, offerings matrix, schedules/time-off, bookings, review moderation.
D. Barber-specific dashboard matching supplied mockup with independently scoped reads and mutations. Expose statistics only where backed by approved, correctly defined queries.
E. PostgreSQL integration, browser E2E, visual comparison and CI review. Merge only after acceptance.

## Visual reference
Desktop image: dark charcoal left sidebar (approximately 15% width), black compact top bar; cream/off-white content area with warm brown/gold accents; 2-column center/right dashboard; sidebar includes logo, navigation and quick actions; overview KPIs, appointments list, service donut, revenue plot, calendar, daily schedule, recent reviews. Avoid shadows/gloss/3D.

## Acceptance
- All private reads/actions checked server-side by role and ownership; no direct bypass through CMS REST/Local API.
- No invented financial metrics; real PostgreSQL-backed results only.
- No regression in public site Hero/Navbar or customer account.
- Run available lint/typecheck/tests/build, DB integration tests, E2E and screenshots before PR/merge.
