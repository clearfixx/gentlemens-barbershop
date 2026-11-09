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

## Automated legacy-schema regression gate

CI runs `db/constraints/verify-localization-legacy-schema.sql` against the initialized disposable PostgreSQL database. It asserts that core legacy catalog columns and the booking table still exist alongside the new translations table. This is deliberately read-only and catches accidental column removals, but **does not** prove a migration from a populated production snapshot is safe. Production rollout still requires a generated/reviewed Payload migration, restored-data rehearsal, and rollback plan.

The CI gate also has two negative tests: temporarily remove `services.description` or the `translations` table (with dependent foreign keys via `CASCADE`) inside a single PostgreSQL transaction, demand a verifier failure, then confirm the transaction rolled back and the original schema still passes. These tests do not modify production data.

## CI schema review artifact

The CI workflow exports a **schema-only** `pg_dump` of its disposable, initialized PostgreSQL database and records the actual PostgreSQL, Payload and adapter versions. The `localization-initialized-schema` artifact is retained for seven days for migration review. It contains no rows, but is **not** a baseline of the pre-localization production schema: do not use it alone to generate or approve a production migration. Compare it with a separately captured schema-only dump of a restored pre-localization database. Do not upload production data or credentials as workflow artifacts.

CI runs the schema-only dump with the `postgres:17-alpine` client image so its `pg_dump` major version matches the PostgreSQL 17 service; the runner's default PostgreSQL 16 client cannot dump a newer server.
