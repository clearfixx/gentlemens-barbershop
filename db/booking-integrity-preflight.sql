-- Optional read-only diagnostic before approved booking integrity deployment.
-- The authoritative gate is db/constraints/preflight-booking-integrity.sql.
-- All issue counts must be zero; never automatically delete bookings.
WITH checks AS (
  SELECT 'invalid_interval'::text AS issue, count(*)::bigint AS issue_count
  FROM bookings WHERE ends_at <= starts_at

  UNION ALL
  SELECT 'incomplete_idempotency', count(*)
  FROM bookings
  WHERE NOT (
    num_nonnulls(idempotency_scope, idempotency_key, idempotency_request_hash) = 0
    OR (
      num_nonnulls(idempotency_scope, idempotency_key, idempotency_request_hash) = 3
      AND length(idempotency_scope) BETWEEN 1 AND 160
      AND length(idempotency_key) BETWEEN 1 AND 160
      AND length(idempotency_request_hash) = 64
    )
  )

  UNION ALL
  SELECT 'duplicate_idempotency_pairs', count(*)
  FROM (
    SELECT idempotency_scope, idempotency_key
    FROM bookings WHERE idempotency_scope IS NOT NULL
    GROUP BY idempotency_scope, idempotency_key HAVING count(*) > 1
  ) AS duplicates

  UNION ALL
  SELECT 'overlapping_active_pairs', count(*)
  FROM bookings AS a
  JOIN bookings AS b ON a.id < b.id AND a.barber_id = b.barber_id
    AND a.status IN ('pending', 'confirmed')
    AND b.status IN ('pending', 'confirmed')
    AND a.starts_at < b.ends_at AND b.starts_at < a.ends_at
)
SELECT issue, issue_count FROM checks ORDER BY issue;

SELECT a.id AS booking_a, b.id AS booking_b, a.barber_id
FROM bookings AS a
JOIN bookings AS b ON a.id < b.id AND a.barber_id = b.barber_id
  AND a.status IN ('pending', 'confirmed')
  AND b.status IN ('pending', 'confirmed')
  AND a.starts_at < b.ends_at AND b.starts_at < a.ends_at
ORDER BY a.id, b.id LIMIT 100;

SELECT idempotency_scope, idempotency_key, array_agg(id ORDER BY id) AS booking_ids
FROM bookings
WHERE idempotency_scope IS NOT NULL
GROUP BY idempotency_scope, idempotency_key
HAVING count(*) > 1
ORDER BY idempotency_scope, idempotency_key LIMIT 100;
