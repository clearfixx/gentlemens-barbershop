-- Disposable SQL smoke test for the booking constraint contract.
-- Requires PostgreSQL with btree_gist available. Runs in a transaction and
-- rolls back all test data/objects. Does NOT test the real Payload migration.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TEMP TABLE booking_integrity_probe (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id integer NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL,
  idempotency_scope text,
  idempotency_key text,
  idempotency_request_hash text
);
ALTER TABLE booking_integrity_probe
  ADD CONSTRAINT probe_valid_interval CHECK (ends_at > starts_at),
  ADD CONSTRAINT probe_idempotency_complete CHECK (
    num_nonnulls(idempotency_scope, idempotency_key, idempotency_request_hash) = 0
    OR (
      num_nonnulls(idempotency_scope, idempotency_key, idempotency_request_hash) = 3
      AND length(idempotency_scope) BETWEEN 1 AND 160
      AND length(idempotency_key) BETWEEN 1 AND 160
      AND idempotency_request_hash ~ '^[a-f0-9]{64}$'
    )
  );
CREATE UNIQUE INDEX probe_idempotency_unique
  ON booking_integrity_probe (idempotency_scope, idempotency_key)
  WHERE idempotency_scope IS NOT NULL;
ALTER TABLE booking_integrity_probe
  ADD CONSTRAINT probe_no_active_overlap EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));

CREATE FUNCTION pg_temp.assert_sqlstate(statement text, expected text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'Expected SQLSTATE %, but statement succeeded: %', expected, statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> expected THEN
    RAISE EXCEPTION 'Expected SQLSTATE %, got %: %', expected, SQLSTATE, SQLERRM;
  END IF;
END;
$$;

INSERT INTO booking_integrity_probe (barber_id, starts_at, ends_at, status)
VALUES (1, '2030-01-01 09:00+00', '2030-01-01 10:00+00', 'pending');
-- Adjacent interval and another barber are both valid.
INSERT INTO booking_integrity_probe (barber_id, starts_at, ends_at, status)
VALUES (1, '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'confirmed'),
       (2, '2030-01-01 09:00+00', '2030-01-01 10:00+00', 'pending');
-- Cancelled records do not reserve time.
INSERT INTO booking_integrity_probe (barber_id, starts_at, ends_at, status)
VALUES (1, '2030-01-01 09:15+00', '2030-01-01 09:45+00', 'cancelled');

SELECT pg_temp.assert_sqlstate($q$
  INSERT INTO booking_integrity_probe (barber_id, starts_at, ends_at, status)
  VALUES (1, '2030-01-01 09:30+00', '2030-01-01 10:30+00', 'pending')
$q$, '23P01');
SELECT pg_temp.assert_sqlstate($q$
  INSERT INTO booking_integrity_probe (barber_id, starts_at, ends_at, status)
  VALUES (1, '2030-01-01 09:00+00', '2030-01-01 09:00+00', 'pending')
$q$, '23514');
SELECT pg_temp.assert_sqlstate($q$
  INSERT INTO booking_integrity_probe
    (barber_id, starts_at, ends_at, status, idempotency_scope, idempotency_request_hash)
  VALUES (3, '2030-01-01 12:00+00', '2030-01-01 13:00+00', 'pending',
    'customer:3', repeat('a', 64))
$q$, '23514');

INSERT INTO booking_integrity_probe
  (barber_id, starts_at, ends_at, status, idempotency_scope, idempotency_key, idempotency_request_hash)
VALUES (3, '2030-01-01 12:00+00', '2030-01-01 13:00+00', 'pending',
  'customer:3', 'retry_1', repeat('a', 64));
SELECT pg_temp.assert_sqlstate($q$
  INSERT INTO booking_integrity_probe
    (barber_id, starts_at, ends_at, status, idempotency_scope, idempotency_key, idempotency_request_hash)
  VALUES (4, '2030-01-01 12:00+00', '2030-01-01 13:00+00', 'pending',
    'customer:3', 'retry_1', repeat('a', 64))
$q$, '23505');
ROLLBACK;
