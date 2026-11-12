# Implementation Roadmap

Each phase is an independently reviewable scope. Completion means implemented and verified, not merely described.

1. **Foundation**: compatible official Next.js + Payload starter, PostgreSQL dev setup, env example, scripts, CI, base theme tokens, shared layout, auth skeleton. Resolve initial Node/version requirements. 
2. **Public site and design system**: premium hero/carousel, scroll-aware navbar, all main landing sections and dual theme, responsive and accessible navigation.
3. **Content model and management**: shops, barbers, services, per-barber price/duration, media, CMS-managed site sections, news.
4. **Auth, permissions and accounts**: customer, barber and admin routes; unified customer profile, booking/order history, loyalty overview, saved products and notifications skeleton.
5. **Booking core**: five-step UI, schedules and exceptions, server availability, transactional conflict prevention, idempotency, guest bookings, statuses.
6. **Barber workspace**: calendar, accept/decline, block times, client view and metrics.
7. **Admin operations**: custom dashboard, staff, bookings, reviews, merchandise, stock, orders, fulfillment and loyalty policy/audit management.
8. **Shop, checkout and news**: product browse/detail, persistent cart, server-validated order checkout, pickup by location and delivery within Ukraine, order lifecycle and stock integrity; no online payment integration; news publishing.
9. **Loyalty and engagement**: XP, levels, bonus ledger, earned/redeemed/reversed events linked to completed bookings and eligible orders; reviews/notifications/contact/newsletter: moderation and reliable sends; provider integrations gated on accounts and credentials.
10. **Release readiness**: end-to-end tests, a11y, SEO, perf, backup/restore, error reporting, deployment and documentation.

The loyalty module is in v1.0 scope; exact level thresholds, discount/bonus rates, stacking and expiry are pending business approval. Fulfillment provider and delivery tariff rules also remain open. Potential later features: gift certificates, social feed provider integrations, external calendars, SMS reminders and online payments.
