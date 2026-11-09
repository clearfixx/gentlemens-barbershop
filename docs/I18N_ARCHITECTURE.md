# Gentlemen's Barbershop — Canonical i18n Architecture

**Status:** APPROVED / FROZEN for v1.0  
**Decision date:** 2026-11-09  
**Scope:** Public site, booking, customer-facing interface and localized CMS content  
**Related:** `docs/UI_UX_CANON.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`

## 1. Decision

Internationalization is an architectural requirement **before active frontend development**, not a post-release retrofit. v1.0 supports exactly two configured languages:

| Code | Language | Role |
| --- | --- | --- |
| `uk` | Українська | Default, source language, guaranteed fallback |
| `en` | English | Additional fully supported language |

A visible, accessible language switcher belongs in the global navbar, including mobile navigation. The admin can edit translations and localized content in v1.0, **but cannot add/remove languages**. Dynamic language lifecycle management is deferred until after v1.0. Both languages are published at launch, subject to completeness checks.

## 2. Responsibility boundaries

- **Next.js App Router + next-intl:** locale-aware routing, locale context, ICU-style messages, formatting and server/client rendering.
- **Payload CMS localization:** editable localized content fields (e.g. service/product names and descriptions, news, landing content, SEO metadata). Use Payload's official localization mechanisms.
- **Payload-managed UI dictionary:** a narrowly scoped custom admin collection/editor for approved translation keys and their `uk`/`en` values. This is not a new translation framework.
- **Versioned fallback dictionaries in source control:** complete critical interface and booking/auth/error messages, available even when CMS-provided overrides fail.
- **PostgreSQL:** persistent source for published CMS content and approved UI message overrides.
- **Cache/revalidation:** resolve published dictionary server-side and cache appropriately; publication invalidates the affected cache. Avoid per-component/per-render database calls.

Payload and next-intl do different jobs. Do not duplicate localized content fields into UI dictionaries or move domain validation into translation code.

## 3. Locale-aware routes

Use locale prefixes, e.g. `/uk/services`, `/en/services`, `/uk/booking`, `/en/booking`. Default language is explicit in URLs for predictable SEO and routing. Root redirects or resolves to the selected/default locale.

Preserve the logical page when switching languages where an equivalent route exists; otherwise navigate to that locale's safe landing page. The locale preference may be persisted via a cookie with appropriate consent/privacy handling; URL locale is authoritative for the current page. Avoid locale-dependent hydration mismatches.

Provide localized document language, metadata, canonical URLs and `hreflang` alternates for indexable pages. Non-indexable account/booking steps must not accidentally become public SEO duplicates.

## 4. Translation data model

### UI dictionary entries

Suggested minimal logical schema (exact Payload fields finalized during implementation):

- `key`: immutable, unique namespaced identifier such as `nav.home`, `booking.confirm`, `errors.slotUnavailable`.
- `values.uk`, `values.en`: translations; support ICU placeholders/plurals where needed.
- `status`: draft/published (or Payload-native drafts/versions if enabled and appropriate).
- `description` / `context`: optional guidance for translators.
- `updatedAt`, `updatedBy`: editorial audit metadata.

Only admins or specifically authorized editors can publish/edit dictionary entries. Users cannot submit arbitrary dictionary keys. Validate uniqueness, payload size, placeholder compatibility and ICU syntax; avoid interpreting translations as trusted HTML. Missing keys/values should be reported in admin and build/CI checks.

### CMS content

Use Payload's `localized: true` for content that needs translation. Keep identifiers, relations, media references, prices, durations, booking statuses, stock, scheduling and authorization data **locale-neutral**. Localize only display fields, SEO fields and applicable editorial content. Admin-entered customer free text is not automatically translated.

## 5. Resolution and fallback strategy

1. Resolve requested locale from URL and validate against the fixed allowlist `['uk','en']`.
2. Load the versioned base dictionary for that locale.
3. Overlay only **published, schema-valid** CMS dictionary overrides for the same locale.
4. If an override is absent/invalid/unavailable, use the versioned base value for that locale.
5. If a noncritical locale key is missing from the base dictionary, fall back to Ukrainian; record a diagnostic, not a blank button.
6. Critical booking/auth/security/error strings must exist in versioned dictionaries in **both languages** and pass automated completeness tests.

The fallback mechanism protects UI text; it does **not** make booking operations independent of the primary database. Do not claim bookings work when the transactional backend is unavailable.

Published dictionary snapshots should be cached by locale and invalidated on publish. Never fetch one translation at a time from the browser. Translation editing does not require a full deployment, but changing the supported language allowlist, routing conventions or message schema may require one.

## 6. Admin capabilities in v1.0

- Edit Ukrainian and English UI dictionary values through Payload.
- Edit localized marketing content, service/product descriptions, news and SEO fields.
- See missing/invalid translations, especially for booking and authentication.
- Preview drafts and publish validated changes; only published values appear publicly.
- See clear error feedback for broken placeholders/ICU messages.

Not included in v1.0: adding/removing languages, arbitrary locale codes, automatic AI translation, translation-provider integrations, bulk import/export, complex multi-stage approval workflows or a standalone localization service.

## 7. Business and security rules

- Domain values remain canonical: e.g. `confirmed` is stored as a status code and displayed as localized text, never translated in storage.
- Prices, durations, date/time and number formatting use the selected locale; shop timezone determines booking time, not UI locale. Currency remains the actual configured business currency.
- Never trust localized client labels for booking price, service identity, authorization or slot availability. Existing server-side validation remains authoritative.
- Escape rendered translation content; do not permit arbitrary rich HTML or unsafe interpolation from admin fields.
- Admin dictionary operations must enforce access control, validation and auditability.
- User-facing validation and server error codes should map to localized messages, not leak raw internal exceptions.

## 8. UI/UX and accessibility

- Language switcher is discoverable in navbar on desktop and mobile, keyboard-operable, with visible focus and accessible names.
- Switching locale must not interrupt or silently discard an in-progress booking. Prefer preserving form state when safe; otherwise request confirmation before leaving.
- Support longer English/ Ukrainian strings without clipped controls or layout shifts; avoid fixed-width labels.
- Both languages work in both approved light and dark themes.
- Decorative scroll/parallax effects from `UI_UX_CANON.md` must never block language switching or booking.
- Use `lang` correctly; screen-reader and form labels are translated; preserve reduced-motion support.

## 9. Implementation sequence

1. Establish fixed locale config (`uk`, `en`) and `next-intl` App Router integration **before** mass component implementation.
2. Define namespaced message keys and complete versioned fallback dictionaries; integrate typed key checks where practical.
3. Add locale-aware navigation, theme-compatible switcher and translated global layout.
4. Configure Payload localized fields for content models as they are introduced.
5. Build minimal Payload dictionary editor with access control, draft/publish and validation; wire server-side cache invalidation.
6. Translate booking, auth, forms, errors, transactional notifications and SEO; keep business rules locale-independent.
7. Test both languages end-to-end and prevent incomplete critical translations from shipping.

## 10. Release acceptance criteria

- `/uk` and `/en` public routes work; unsupported locale routes are handled safely.
- Global language switcher works on desktop/mobile and with keyboard.
- Booking flow works in both languages with correct dates/times and no client-authoritative prices.
- Critical UI strings have complete validated `uk` and `en` fallbacks.
- Admin can edit/publish dictionary translations and localized CMS content without a new app deploy.
- Invalid/missing overrides fall back safely; published cache updates correctly.
- Localized SEO and accessible labels are verified; light/dark layouts remain readable.
- No language add/delete controls in v1.0 admin.
- Run lint, typecheck, build and targeted tests once the application/scripts are available; do not claim checks passed without execution.

## 11. Post-release evolution

A future release may introduce admin-managed locale enable/disable/add/remove, language completeness workflows, import/export and assisted translation. Prepare data identifiers and boundaries for future expansion, **but do not build this infrastructure now**. Adding a language will still require validation of routing, content, message fallbacks and SEO; do not promise zero-deploy language onboarding until explicitly designed and tested.

## 12. Change control

This is a **canonical architecture decision**, approved 2026-11-09. The v1.0 fixed two-language scope, Ukrainian fallback, admin-editable published translations, Payload content localization and locale-neutral booking rules are frozen. Changing these requires explicit product approval.
