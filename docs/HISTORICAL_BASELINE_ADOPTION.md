# Historical Payload baseline adoption — read-only review

Some pre-localization installations were created with Payload's automatic schema
push, and have business tables but no `payload_migrations` ledger. Running the
historical bootstrap migration on these databases would attempt to recreate
existing tables. **Never bypass the migration guard or insert ledger rows blindly.**

## Reproducible review

1. Stop application writes and take a restorable backup of the legacy database.
2. On a **separate disposable PostgreSQL 17 database**, apply **only** the
   committed migration `20261110_050350` (not the localization delta).
   Confirm the reference ledger has exactly this migration.
3. Set `DATABASE_URL` to a restored copy of the pre-localization database,
   and `BASELINE_REFERENCE_URL` to the isolated baseline-only database.
4. Run `bash scripts/review-historical-baseline.sh`. The script compares full
   schema DDL, including indexes, sequences, foreign keys, enum definitions and
   defaults, excluding only `payload_migrations`. It refuses mismatches and
   makes **no writes**.
5. Independently review data integrity, current Payload version, PostgreSQL
   extensions, backup restore, booking overlap/idempotency preflight, and any
   operational schema customizations. The DDL comparison does not establish
   business-data correctness.

A successful review is **not authorization to write the ledger**. Baseline
registration and the subsequent incremental migration require a separate
reviewed transactional procedure. No production migration is executed here.

Do not use the application's live production database as the reference.

## Disposable rehearsal of baseline registration

The command `scripts/adopt-disposable-historical-baseline.sh` is intentionally
restricted to the exact database name `gentlemens_legacy_adoption_ci` and requires
`CONFIRM_DISPOSABLE_BASELINE_ADOPTION=apply`. It repeats the full read-only DDL
comparison, checks for concurrent sessions, and registers the historical ledger
in one PostgreSQL transaction using a transaction-scoped advisory lock.
The CI scenario seeds legacy records, fingerprints them, registers the baseline,
applies the localization delta, verifies the fingerprints and ledger count, and
rejects replay. **This is a rehearsal-only mechanism, not a production adoption
command.** Do not rename or remove the database restriction to run it in production.
