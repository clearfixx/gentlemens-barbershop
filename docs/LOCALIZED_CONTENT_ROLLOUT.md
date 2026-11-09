# Localized content rollout — UK / EN

## Scope and current state

- Public URLs use `/uk` and `/en`; CMS locales are `uk` (default) and `en`.
- Localized fields currently available: `services.localizedDescription`, `locations.localizedDescription`, `barbers.localizedBio`.
- Legacy `description` and `bio` are retained and remain the fallback for missing localized copy.
- Names, city, address, service identifiers, prices, scheduling and booking relations are **not localized** by this package.
- The public booking UI is still a **read-only preview**. No appointment is submitted.

## Safe database rollout

1. Back up the production PostgreSQL database and verify restore before changing Payload schema.
2. On a disposable copy of production data, run the approved Payload/PostgreSQL migration for the new optional localized fields. **Do not use automatic schema push against production**.
3. Verify legacy records, active filters, relationship IDs, prices and booking constraints are unchanged.
4. Enter Ukrainian and English copy in Payload Admin; verify missing English values display fallback text and do not hide existing content.
5. Run unit tests, typecheck, lint, production build, and test all public routes in both locales.
6. Deploy schema migration **before** deploying code that queries the new columns.
7. Monitor read errors and locale-specific rendering; retain legacy fields until a separately reviewed backfill/removal.

## Release blockers

- A reviewed, repeatable migration and production rollback plan have **not** been added.
- Existing names/cities/addresses need a separate localization and data-backfill design.
- Admin-managed UI dictionaries are implemented with admin-only draft/published records, key validation, and request-time published-only reads (no shared dictionary cache). CI exercises draft/publish/unpublish on a disposable PostgreSQL instance and rejects anonymous CRUD, invalid override shapes, and duplicate locale records. Before release, also verify the admin UI and browser-rendered copy against a deployed instance.
- Array-valued UI messages (for example booking wizard steps) are intentionally not editable through flat string overrides.
- No reviewed migration for the new `translations` collection exists yet; deployment must not depend on automatic production schema push.
- Do not mark localization complete or merge to production until these blockers are addressed.

## Security and UX

- Locale affects display copy, not authorization, service prices, slot availability, or booking identifiers.
- Admin-only collection read and write access must remain enforced. Payload rejects unauthorized collection reads with HTTP 403 rather than returning an empty result.
- Switching language on the booking preview warns before discarding the in-memory draft.
