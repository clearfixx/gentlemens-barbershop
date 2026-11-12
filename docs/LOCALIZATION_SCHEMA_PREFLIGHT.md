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

The review artifact also includes `localization-columns.csv` (actual column types and nullability) and `localization-constraints.csv` (constraint names and types) for the catalog and `%_locales` tables. These inventories are read-only and are intended for human review alongside the SQL dump; they are not a substitute for a populated-database migration rehearsal.

## Legacy data preservation fingerprints

Run `psql -X -v ON_ERROR_STOP=1 -At -F '|' "$DATABASE_URL" -f db/constraints/fingerprint-localization-legacy-data.sql > before.txt` on a **restored isolated database**, apply the reviewed localization migration, then run the same command into `after.txt` and compare with `diff -u before.txt after.txt`. The query hashes legacy catalog fields and all booking rows, excluding new localized columns. This detects changed or missing legacy values without exporting raw booking data. It does **not** cover all dependent tables, so also verify relationship IDs and booking constraints. CI smoke-tests repeatability on its disposable database, but the actual before/after migration comparison remains pending until a pre-localization database snapshot is available.

## Observed Payload schema (CI run 42622056412)

The downloaded `localization-initialized-schema` artifact was inspected. It was generated by **Payload 3.93.0** and **@payloadcms/db-postgres 3.93.0** against PostgreSQL 17. The actual localized field storage is:

| Collection | Localized table | Localized column | Relationship fields |
| --- | --- | --- | --- |
| services | `services_locales` | `localized_description` | `_locale`, `_parent_id` |
| locations | `locations_locales` | `localized_description` | `_locale`, `_parent_id` |
| barbers | `barbers_locales` | `localized_bio` | `_locale`, `_parent_id` |

These are **observations**, not instructions to handwrite migration DDL. Confirm indexes, foreign keys, column defaults and migration output against the actual schema artifact before approving a migration. This initialized schema does not represent the pre-localization baseline.

## Reproducible source baseline

Git commit `78bcb938bd5265cf19425ad701de6fa608863829` is the parent of the first localization-config commit `95d277fd215e4461b103aeb74e5145fcd1e3e449`. Inspection confirms the baseline `src/payload.config.ts` has no `localization` configuration or `Translations` collection, and baseline `Services` has only the legacy `description` field. This is the **pre-localization source baseline**, not a backup of any deployed database.

For the migration rehearsal, initialize a separate disposable PostgreSQL 17 database using that exact baseline commit and a reproducible dependency lockfile. Populate representative services, locations, barbers, bookings and relationships. Capture the legacy-data fingerprints and a schema-only dump. Then check out the migration branch, run the version-matched Payload migration against the *same* database (without schema auto-push), verify fingerprints and booking integrity, and compare the two schema dumps. Never run this against production or treat a fresh empty schema as proof of preservation of populated records.

## Isolated baseline CI job

The separate `prelocalization-baseline` job checks out the exact source commit `78bcb938` with its frozen lockfile, initializes its Payload schema on a **separate disposable PostgreSQL 17 service**, and exports a schema-only `prelocalization-baseline-schema` artifact with the exact dependency versions. It rejects unexpectedly present localized tables. Compare this artifact with `localization-initialized-schema` from the current branch. These jobs use separate databases: comparing their dumps identifies schema changes but **does not** yet demonstrate an in-place migration with preserved records. The baseline job must pass CI before relying on its artifact.

## Verified baseline/current artifact comparison (CI run 42624883836)

Downloaded and compared both schema-only artifacts from the same workflow run. Both environments resolved **Payload 3.93.0** and **@payloadcms/db-postgres 3.93.0**. The baseline contains **18** PostgreSQL tables; the current initialized schema contains **22**. The four additional tables are `barbers_locales`, `locations_locales`, `services_locales` and `translations`. No existing table disappeared from the table-name inventory. This is a table-name comparison, **not** a complete diff of indexes, columns, constraints or foreign keys. The two databases were initialized separately, so this does not validate a populated-data migration or rollback.

## Automated baseline-to-current structural gate

The `compare-localization-schemas` CI job downloads both independently generated schema artifacts and runs `scripts/compare-localization-schemas.py`. It fails if a legacy table/column disappears or the expected localized storage is missing. It reports added tables. This does not prove the safety of changes to types, defaults, indexes or constraints, and does not execute a migration on populated data.

## Fingerprint negative regression test

CI now inserts a disposable service, verifies the legacy fingerprint changes, edits its description, verifies the fingerprint changes again, deletes the test service, and verifies the original fingerprint is restored. This tests detection of inserted and mutated catalog data on the isolated CI database. It does not yet exercise an actual Payload migration or existing production records.

## Populated database upgrade rehearsal

The `populated-localization-rehearsal` CI job initializes the exact pre-localization source on PostgreSQL 17, inserts representative legacy catalog and booking records, fingerprints all four collections, then starts the current Payload config **against that same database** and asserts the fingerprints match byte-for-byte. It also checks that localized tables exist. This tests Payload's schema initialization behavior on populated legacy storage; it is **not** an explicit, reviewed Payload migration file and does not constitute production migration approval.

## Booking constraints discovered in actual schema diff

The current schema also adds `btree_gist`, booking time-range and idempotency CHECK constraints, a partial unique idempotency index, and an active-booking GiST exclusion constraint. These are not merely localization tables. Before initializing the current config against a populated baseline, CI runs `db/constraints/preflight-booking-migration.sql` read-only to reject incompatible existing bookings (invalid time ranges, malformed/duplicate idempotency data, overlapping active appointments). Production migration planning must account for these constraints explicitly.

## Negative booking compatibility checks

The populated-database rehearsal now deliberately inserts a second overlapping active booking, confirms the read-only migration preflight rejects it, deletes the conflicting fixture, and confirms the preflight passes again. It separately changes the existing fixture to a zero-length booking interval, confirms rejection, restores the original end time, and confirms success. These negative checks run on the legacy schema before current Payload initialization. They do not exercise the eventual versioned migration file.

## Idempotency compatibility negative tests

The populated legacy-schema rehearsal now verifies that incomplete idempotency triplets and duplicate (scope, key) pairs are rejected by the read-only preflight. Each negative fixture is removed or restored, then the preflight must pass again before Payload schema initialization. This specifically guards the newly introduced booking idempotency CHECK and partial unique index.
