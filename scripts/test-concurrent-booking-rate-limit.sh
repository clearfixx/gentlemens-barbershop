#!/usr/bin/env bash
# Independent PostgreSQL sessions race to consume the same shared budget.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
command -v psql >/dev/null || { echo 'psql is required' >&2; exit 1; }

limit=3
workers=12
key="booking:parallel:${GITHUB_RUN_ID:-manual}:${GITHUB_RUN_ATTEMPT:-1}"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# A dedicated key makes this test safe to re-run without changing other cases.
for ((i=1; i<=workers; i++)); do
  (
    psql -X -qAt -v ON_ERROR_STOP=1 "$DATABASE_URL" \
      -c "SELECT booking_rate_limit_ci.consume('${key}', 240000, 60000, ${limit})" \
      > "$workdir/$i"
  ) &
done
wait

allowed="$(grep -lFx 't' "$workdir"/* | wc -l | tr -d ' ')"
denied="$(grep -lFx 'f' "$workdir"/* | wc -l | tr -d ' ')"
if [[ "$allowed" -ne "$limit" || "$denied" -ne "$((workers-limit))" ]]; then
  echo "Concurrent limiter failed: allowed=$allowed denied=$denied expected=$limit/$((workers-limit))" >&2
  exit 1
fi
stored="$(psql -X -qAt -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  -c "SELECT hits FROM booking_rate_limit_ci.buckets WHERE identity = '${key}' AND window_start = 240000")"
if [[ "$stored" != "$limit" ]]; then
  echo "Unexpected persisted counter: $stored" >&2
  exit 1
fi
echo "Concurrent limiter verified: $allowed accepted, $denied rejected across $workers sessions"
