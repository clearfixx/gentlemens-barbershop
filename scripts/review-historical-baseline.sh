#!/usr/bin/env bash
# Review-only exact schema gate for legacy Payload databases.
# Both databases MUST be PostgreSQL 17, and the reference must have been
# initialized with the committed historical baseline migration only.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" || -z "${BASELINE_REFERENCE_URL:-}" ]]; then
  echo "Required: DATABASE_URL (legacy target), BASELINE_REFERENCE_URL (disposable reference)" >&2
  exit 2
fi
if [[ "$DATABASE_URL" == "$BASELINE_REFERENCE_URL" ]]; then
  echo "Reference and target must be different databases" >&2
  exit 2
fi
for tool in psql pg_dump; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing $tool" >&2; exit 2; }
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
psql -XAt -v ON_ERROR_STOP=1 "$BASELINE_REFERENCE_URL" -c \
  "SELECT name FROM payload_migrations ORDER BY id" > "$work/reference-ledger"
if [[ "$(cat "$work/reference-ledger")" != '20261110_050350' ]]; then
  echo "Reference must contain exactly the reviewed historical baseline migration" >&2
  exit 1
fi
psql -XAt -v ON_ERROR_STOP=1 "$DATABASE_URL" -c \
  "SELECT to_regclass('public.payload_migrations') IS NULL" | grep -qx t || {
  echo "Target already has a migration ledger; refusing adoption review" >&2
  exit 1
}
psql -XAt -v ON_ERROR_STOP=1 "$DATABASE_URL" -c \
  "SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public.bookings') IS NOT NULL" | grep -qx t || {
  echo "Target is not a populated-schema legacy installation" >&2
  exit 1
}

# Compare the complete schema DDL: tables, columns, indexes, constraints,
# sequences, enum types, foreign keys and defaults. Exclude only the ledger.
# Both exports use the same pg_dump binary and flags to avoid formatting drift.
for role in reference target; do
  if [[ "$role" == reference ]]; then url="$BASELINE_REFERENCE_URL"; else url="$DATABASE_URL"; fi
  # Use PostgreSQL 17's client for both dumps, regardless of runner OS.
  # The CI runner may otherwise default to an older incompatible pg_dump.
  if pg_dump --version | grep -Eq 'PostgreSQL\\) 17\\.'; then
    pg_dump "$url" --schema-only --no-owner --no-privileges \
      --exclude-table=public.payload_migrations > "$work/$role.sql"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm --network host -e DATABASE_URL="$url" postgres:17-alpine \
      sh -c 'pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges --exclude-table=public.payload_migrations' \
      > "$work/$role.sql"
  else
    echo "PostgreSQL 17 pg_dump or Docker is required" >&2
    exit 2
  fi
done
# pg_dump 17 emits a different random psql guard token on each invocation.
# These two lines are not database DDL; normalize only their opaque token,
# leaving every SQL statement and schema object byte-for-byte comparable.
for role in reference target; do
  sed -E -i \
    -e 's/^\\restrict [[:alnum:]]+$/\\restrict <random-guard>/' \
    -e 's/^\\unrestrict [[:alnum:]]+$/\\unrestrict <random-guard>/' \
    "$work/$role.sql"
done
if ! diff -u "$work/reference.sql" "$work/target.sql"; then
  echo "REFUSED: historical database differs from reviewed baseline schema" >&2
  exit 1
fi
echo "PASS: complete schema DDL matches baseline, excluding only payload_migrations."
echo "READ-ONLY: no ledger was registered. Preserve backup and review data/constraints before adoption."
