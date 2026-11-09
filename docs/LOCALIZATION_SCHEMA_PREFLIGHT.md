# Localization schema migration preflight

This is a **read-only inventory**, not an executable schema migration.

## Before writing the migration

1. Back up PostgreSQL and restore it into an isolated environment.
2. Run `psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/constraints/preflight-localization-schema.sql` against the restored copy.
3. Generate a Payload migration against that copy with the **exact installed Payload and Postgres adapter versions**. Inspect the generated SQL/TypeScript rather than guessing table names.
4. Verify the migration only adds optional localized fields and the `translations` collection; it must not drop legacy description/bio, rename existing columns, or alter booking constraints.
5. Apply to the disposable copy; verify existing records, relationship IDs, prices, booking constraints and UK/EN read paths.
6. Re-run the inventory, document the actual generated table names and the verified rollback/restore procedure.
7. Only then approve a production migration. Schema must be deployed before application code that queries the new fields.

## Why the preflight is not a migration

Payload's localized field storage and migration output depend on its installed version and existing schema. A handwritten `ALTER TABLE` based on guessed names is unsafe. The preflight intentionally makes **no changes** and cannot be used to mark migration readiness.

## Release verification

In Payload Admin create a draft UK dictionary and confirm the public page still shows fallback copy. Publish it and verify the public page, navbar, locale switcher and SEO description use the override. Revert to draft and verify fallback returns. Repeat for EN. Confirm non-admin access is denied and malformed dictionary keys are rejected.

The current one-record-per-locale model does not support editing a new draft while keeping an older published snapshot live; switching a published record back to draft immediately disables its overrides. This is an explicit v1 limitation, not a staged publication workflow.
