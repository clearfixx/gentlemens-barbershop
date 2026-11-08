# Implementation Roadmap

Each phase is an independently reviewable scope. Completion means implemented and verified, not merely described.

1. **Foundation**: compatible official Next.js + Payload starter, PostgreSQL dev setup, env example, scripts, CI, base theme tokens, shared layout, auth skeleton. Resolve initial Node/version requirements. 
2. **Public site and design system**: premium hero/carousel, scroll-aware navbar, all main landing sections and dual theme, responsive and accessible navigation.
3. **Content model and management**: shops, barbers, services, per-barber price/duration, media, CMS-managed site sections, news.
4. **Auth, permissions and accounts**: customer, barber and admin routes; customer profile, inline editing, notifications skeleton.
5. **Booking core**: five-step UI, schedules and exceptions, server availability, transactional conflict prevention, idempotency, guest bookings, statuses.
6. **Barber workspace**: calendar, accept/decline, block times, client view and metrics.
7. **Admin operations**: custom dashboard, staff, booking, reviews, merchandise and content management.
8. **Catalog and news**: complete browse/detail flows, order inquiries without online payments, publish workflow.
9. **Reviews/notifications/contact/newsletter**: moderation and reliable sends; provider integrations gated on accounts and credentials.
10. **Release readiness**: end-to-end tests, a11y, SEO, perf, backup/restore, error reporting, deployment and documentation.

Potential features held for separate decisions: loyalty tiers, gift certificates, social feed provider integrations, external calendars, SMS reminders and payments.
