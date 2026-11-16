# PROJECT_STATE — Gentlemen's Barbershop

> Last verified: 2026-11-16 (Europe/Kyiv). Living handoff for continuing development after chat/context interruption.
> **This file records verified repository state, not an assertion that every feature is production-ready.**
> Re-check GitHub HEAD, PRs, CI and code before resuming; update this document after each accepted package.

## Repository and verified checkpoint

- Repository: https://github.com/clearfixx/gentlemens-barbershop
- Default branch: `main`, verified merge HEAD `ea2412782ee53dfa7b0d4a886011c3b45c8730dd` (PR #37 merged, 2026-11-16 checkpoint).
- Last merged product package: PR #37, **Reviews System v1.0** (merged, merge commit `ea2412782ee53dfa7b0d4a886011c3b45c8730dd`). Earlier integrations: PR #33 booking management; PR #34 Hero/Navbar/parallax; PR #35 Auth & Customer Cabinet; PR #36 lockfile integrity.
- PR #37 feature head `eb885be86cbc2105d3c8d2c25b207a04f42e1c68` passed [GitHub Actions run #43834261565](https://github.com/clearfixx/gentlemens-barbershop/actions/runs/43834261565), **5/5 jobs successful**; reviewed and merged into `main`. No post-merge production rollout is implied.
- This document was prepared after the previous chat hit its context limit during work on Reviews System v1.0. No lost/uncommitted work can be inferred from GitHub; inspect any local working tree separately.

## Approved technology and development rules

- Single Next.js App Router + TypeScript application; Payload CMS for auth, CMS and admin, PostgreSQL as transactional source of truth. No NestJS/independent API or Supabase backend for v1.
- Verified `main/package.json`: Next.js `^16.3.3`, React `^19.0.0`, Payload `^3.0.0`, `@payloadcms/db-postgres`, `lucide-react@1.72.0`, pnpm `11.9.0`, Node `>=24.22.1`. Do not assume every planned library is installed merely because it is approved in documentation.
- Architectural choices in `docs/ARCHITECTURE.md`: Tailwind/shadcn, Zustand only for shared UI state, TanStack Query for justified client caching, React Hook Form/Zod where appropriate, Motion/Embla when needed, PostgreSQL-authenticated server-side business rules.
- Branch per logical medium/large package; keep `main` stable; review PR, run `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` plus targeted database/browser tests before integration. Never report green checks without real run evidence.
- Respect existing approved UI/UX and user mockups; do not redesign unrelated surfaces. UA + EN, responsive layout, flat cream/chocolate palette, Inter, dark/light themes, restrained borders and motion. Hero/Navbar and account layout have received user acceptance.

## Completed and integrated in main (verified via merged PRs)

### Booking domain — PR #33
- Five-step responsive UA/EN booking workflow with authoritative multi-service duration/pricing and availability.
- Guest and signed-in bookings, ownership-scoped booking history, status lifecycle and admin/barber operations.
- Verified guest cancellation by email challenge and audit trail; publicly exposed production writes/cancellations remain **fail-closed unless configured**.
- PostgreSQL booking integrity, idempotency, migrations, staging/browser tests are included in the merged package.
- Operational integrations (notably real Resend production delivery and production enablement) are **not implicitly deployed**.

### Website and account — PRs #34 and #35
- Hero/Navbar/auth entry/parallax merged into main.
- UA/EN registration, sign-in/out, password recovery, customer sessions.
- Three-column desktop customer dashboard with **center column as primary continuous content**, left anchor navigation and a compact right profile area; right sidebar hidden on phone, navigation available through mobile slide-out drawer.
- Sections include overview, profile, booking history, reviews, loyalty etc.; features not yet backed by business logic remain truthful placeholders.
- Anchor scrolling and active scroll-spy corrected, including near page bottom; responsive and regression tests added.
- Editable profile display name/phone, avatar upload/removal, Navbar synchronization, upcoming/past bookings, filtered/paginated history and cancellation.
- PR #35 reported green CI run `43695242795` covering checks, migrations, DB tests and Chromium E2E. This is **historical PR evidence**, not a new test run performed for this document.
- Durable object storage for production media and required provider settings still need operational configuration.

## Completed: Reviews System v1.0 — merged PR #37

- Verified owner-only customer submission for completed/elapsed appointments with server-authoritative booking/customer/barber relation and one review per booking (PostgreSQL UNIQUE).
- Payload Reviews collection with pending/published/rejected moderation, admin-only status updates, immutable original identity/rating/comment.
- Customer dashboard UA/EN review form/list with eligible completed visits and moderation state.
- Public landing-page cards display genuine **published-only** reviews; server-side barber filter, responsive cards, rating/comment/publication date and empty state. No synthetic reviews or fabricated authors.
- Published timestamp controlled server-side. Pending/rejected comments are not public.
- API request body bounded to 4 KiB while streaming; malformed JSON/oversize handled as 400/413.
- Verified CI: **5/5 successful** at feature head `eb885be` — [run #43834261565](https://github.com/clearfixx/gentlemens-barbershop/actions/runs/43834261565). Includes lint/build/tests, browser UA/EN, mobile/desktop and themes, PostgreSQL moderation and both migration paths.
- Actual merge: [PR #37](https://github.com/clearfixx/gentlemens-barbershop/pull/37), `ea2412782ee53dfa7b0d4a886011c3b45c8730dd`. This is code integration, **not proof of production deployment or real mail/storage configuration**.
- V1 excludes customer review editing/appeals and custom review moderation UI; Payload CMS administration provides moderation.

## Planned, not yet implemented or not verified complete

- Loyalty engine (XP separate from spendable bonuses, levels, immutable ledger, configurable rules); do not invent balances, tiers or rewards.
- Favorites, persistent notifications, store/catalog-cart-checkout/order fulfillment (shop pickup and delivery in Ukraine approved; payments and carrier details not finalized), news/CMS content management, extended operational dashboards.
- Public verified reviews and barber filtering are integrated by PR #37; a dedicated barber profile/review page and richer pagination are future scope.
- Some public UI sections and account links may be placeholders; distinguish presentation from real backend capability.
- Planned and approved stack components are not proof of implemented feature behavior.

## Immediate next steps

1. Confirm local clone is synchronized with current `main` (merge `ea241278`) and inspect any local uncommitted changes; GitHub alone cannot verify a developer's working tree.
2. Finalize and integrate this `PROJECT_STATE.md` documentation PR (#38) without reverting product changes introduced by PR #37.
3. Begin next medium/large feature on a fresh branch. Priorities are **admin operations/content management** and **loyalty**; choose scope based on P0 dependency and approved business rules, without reworking accepted Navbar/Hero/account visuals.
4. For admin: audit which Payload collections/forms already support locations, barbers, offerings, shifts, bookings, customers, reviews and content; implement the missing management actions and security checks, not duplicate already working CMS UI.
5. Before enabling production booking/email/media/reviews, verify DB migrations, protected admin access, Resend provider/domain setup, durable media storage and operational deployment configuration. PR CI success alone is insufficient.

## Context handoff protocol

At the end of each development package update:
- Date; merged/active branch; PR number; exact commit SHA and CI run URL/result.
- What is **implemented**, what is **verified**, what is only **planned**, and any production configuration blockers.
- Last user-approved visual/functional decisions; next precise action.
- If work is interrupted, **do not assume commits or test results**; re-read GitHub and the local working tree.

## Canonical context

- `README.md` — setup and overview (check for stale instructions: it mentions pnpm 10 although the verified package manager in `package.json` is pnpm 11.9.0).
- `docs/PRODUCT.md` — product scope and unapproved operational rules.
- `docs/ARCHITECTURE.md` — domain boundaries and security requirements.
- GitHub PRs #33–#38 — actual scope, review and validation record.
- User-approved mockups and discussion — source of truth for visual details. This document is an operational snapshot, not permission to redesign them.
