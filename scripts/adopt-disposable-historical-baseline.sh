#!/usr/bin/env bash
# Deliberately restricted to disposable CI/restored rehearsal databases.
# Production baseline adoption requires a separately approved runbook.
set -euo pipefail

if [[ "${CONFIRM_DISPOSABLE_BASELINE_ADOPTION:-}" != "apply" ]]; then
  echo "Refused: set CONFIRM_DISPOSABLE_BASELINE_ADOPTION=apply on an isolated rehearsal database" >&2
  exit 2
fi
if [[ -z "${DATABASE_URL:-}" || -z "${BASELINE_REFERENCE_URL:-}" ]]; then
  echo "Both DATABASE_URL and BASELINE_REFERENCE_URL are required" >&2
  exit 2
fi
db_name="$(psql -XAt -v ON_ERROR_STOP=1 "$DATABASE_URL" -c 'SELECT current_database()')"
if [[ "$db_name" != gentlemens_legacy_adoption_ci ]]; then
  echo "Refused: this command may write ONLY to gentlemens_legacy_adoption_ci" >&2
  exit 2
fi

# Never create the ledger until the target matches the reviewed baseline.
bash scripts/review-historical-baseline.sh

# Stop all application traffic to the disposable target before registration.
# This check is defensive; it does not replace isolation of the CI database.
sessions="$(psql -XAt -v ON_ERROR_STOP=1 "$DATABASE_URL" -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")"
if [[ "$sessions" != 0 ]]; then
  echo "Refused: concurrent database sessions exist" >&2
  exit 1
fi

# A single PostgreSQL transaction either registers the exact historical
# baseline or leaves no ledger behind. This command never runs DDL from the
# baseline migration over existing business tables.
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(781141, 20261110);
DO $$
BEGIN
  IF to_regclass('public.payload_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'Baseline already registered or ledger exists';
  END IF;
  IF to_regclass('public.users') IS NULL OR to_regclass('public.bookings') IS NULL THEN
    RAISE EXCEPTION 'Legacy schema is missing';
  END IF;
END $$;
CREATE TABLE public.payload_migrations (
  id serial PRIMARY KEY NOT NULL,
  name varchar,
  batch numeric,
  updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
  created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);
CREATE INDEX payload_migrations_updated_at_idx ON public.payload_migrations USING btree (updated_at);
CREATE INDEX payload_migrations_created_at_idx ON public.payload_migrations USING btree (created_at);
INSERT INTO public.payload_migrations (name, batch)
VALUES ('20261110_050350', 1);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.payload_migrations) <> 1
    OR (SELECT name FROM public.payload_migrations LIMIT 1) <> '20261110_050350' THEN
    RAISE EXCEPTION 'Unexpected baseline registration result';
  END IF;
END $$;
COMMIT;
SQL
echo "Disposable legacy baseline registered; run incremental migration and data fingerprint checks."
