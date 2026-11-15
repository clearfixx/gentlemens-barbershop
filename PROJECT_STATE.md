# PROJECT_STATE — Gentlemen's Barbershop

> Last verified: 2026-11-15 (Europe/Kyiv). Living handoff for continuing development after chat/context interruption.
> **This file records verified repository state, not an assertion that every feature is production-ready.**
> Re-check GitHub HEAD, PRs, CI and code before resuming; update this document after each accepted package.

## Repository and verified checkpoint

- Repository: https://github.com/clearfixx/gentlemens-barbershop
- Default branch: `main`, verified HEAD `2e8692e4400e1ffc2b60de0742a67679ddec6a5a` (2026-11-15 09:00 UTC).
- Last merged product package: PR #35, **Auth & Customer Cabinet** (merged 2026-11-15). Earlier integrations: PR #33 booking management; PR #34 Hero/Navbar/parallax; PR #36 pnpm lockfile integrity repair.
- **Current unfinished feature**: PR #37, https://github.com/clearfixx/gentlemens-barbershop/pull/37 — draft, open, branch `feat/verified-reviews`, verified HEAD `4db774678ee0caff902edc6f68d4358fd109f65d`. At inspection, branch is 14 commits ahead and **0 behind** main; 14 changed files. Do not merge until full review, tests and approval.
- This document was prepared after the previous chat hit its context limit during work on Reviews System v1.0. No lost/uncommitted work can be inferred from GitHub; inspect any local working tree separately.

## Approved technology and development rules

- Single Next.js App Router + TypeScript application; Payload CMS for auth, CMS and admin, PostgreSQL as transactional source of truth. No NestJS/independent API or Supabase backend for v1.
- Verified `main/package.json`: Next.js `^16.3.3`, React `^19.0.0`, Payload `^3.0.0`, `@payloadcms/db-postgres`, `lucide-react@1.72.0`, pnpm `11.9.0`, Node `>=24.22.1`. Do not assume every planned library is installed merely because it is approved in documentation.
- Architectural choices in `docs/ARCHITECTURE.md`: Tailwind/shadcn, Zustand only for shared UI state, TanStack Query for justified client caching, React Hook Form/Zod where appropriate, Motion/Embla when needed, PostgreSQL-authenticated server-side business rules.
- Branch per logical medium/large package; keep `main` stable; review PR, run `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` plus targeted database/browser tests before integration. Never report green checks without real run evidence. Do not merge unfinished reviews.
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

## In progress: Reviews System v1.0 — PR #37

Review of actual branch diff (not only the PR description) found:
- `src/payload/collections/Reviews.ts`: review records linked to booking/customer/barber, score/comment/status, unique booking, own-or-published reads, admin moderation, immutable identity/content.
- `src/migrations/20261115_110000_verified_reviews.ts`: database migration for reviews.
- `src/lib/reviews/verified-review.ts` and tests: verified-review domain logic.
- `src/app/(site)/api/account/reviews/route.ts`: authenticated submission route.
- `src/components/account-reviews.tsx`, account page and styles: **a basic customer-facing UA/EN form/list is already implemented**, including eligible completed visits, 1–5 rating, comment, submission and moderation status. The PR description's 'integrate review cards/form' remaining-work line is therefore partially outdated.
- `scripts/ci-review-moderation.ts` and workflow changes: isolated CI moderation rehearsal added; customer populated-browser scenario changed.

**Remaining verification/work (do not mark complete without evidence):**
1. Inspect current #37 CI and logs; fix failures in lint, typecheck, build, migrations, tests and populated browser checks.
2. Verify actual HTTP behavior and database constraints for duplicate, forged and cross-customer submissions; validate race conditions, denied access and completed/ended booking eligibility.
3. End-to-end audit admin moderation permissions and published-only **public** reviews. A Payload public-read rule exists; do not claim the public website's reviews section is connected until confirmed.
4. Validate UA/EN copy, accessibility, mobile layout, screenshots and account scroll navigation in both themes.
5. Verify **production historical/incremental migrations** and deployment prerequisites.
6. Update PR #37 description/checklist to match actual code; review and merge only after acceptance.

## Planned, not yet implemented or not verified complete

- Loyalty engine (XP separate from spendable bonuses, levels, immutable ledger, configurable rules); do not invent balances, tiers or rewards.
- Favorites, persistent notifications, store/catalog-cart-checkout/order fulfillment (shop pickup and delivery in Ukraine approved; payments and carrier details not finalized), news/CMS content management, extended operational dashboards.
- Public reviews display and barber review feed need verification in the current reviews package.
- Some public UI sections and account links may be placeholders; distinguish presentation from real backend capability.
- Planned and approved stack components are not proof of implemented feature behavior.

## Immediate next steps

1. Resume on **`feat/verified-reviews` / PR #37**, not on the old customer-account branch. Fetch remote and check local uncommitted files.
2. Compare branch with `main`; inspect PR checks/run logs and review the 14-file diff.
3. Complete review validation (security + migrations + UI/browser + published public path), then update PR summary.
4. After approved green review, merge to `main`; update this file with the new merge SHA and next active module.
5. Choose next medium-sized feature package after Reviews; preserve existing design and security rules.

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
- GitHub PRs #33–#37 — actual scope, review and validation record.
- User-approved mockups and discussion — source of truth for visual details. This document is an operational snapshot, not permission to redesign them.
