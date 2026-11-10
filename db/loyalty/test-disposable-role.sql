-- Disposable CI-only role rehearsal. Requires prototype schema installed.
-- All grants and fixture rows are rolled back.
BEGIN;
CREATE ROLE ci_loyalty_runtime NOLOGIN;
GRANT USAGE ON SCHEMA public TO ci_loyalty_runtime;
GRANT SELECT ON loyalty_accounts, loyalty_entries TO ci_loyalty_runtime;
GRANT EXECUTE ON FUNCTION loyalty_apply(bigint, varchar, varchar, varchar, bigint, bigint, bigint)
  TO ci_loyalty_runtime;

DO $$
DECLARE
  customer bigint;
BEGIN
  INSERT INTO users (email, salt, hash, created_at, updated_at, role)
  VALUES ('loyalty-role-fixture@example.invalid', 'fixture', 'fixture', now(), now(), 'customer')
  RETURNING id INTO customer;
  INSERT INTO loyalty_accounts(customer_id) VALUES (customer);
  PERFORM set_config('loyalty.role_fixture_customer', customer::text, true);
END $$;

SET LOCAL ROLE ci_loyalty_runtime;

DO $$
DECLARE
  customer bigint := current_setting('loyalty.role_fixture_customer')::bigint;
  event_id bigint;
BEGIN
  IF (SELECT count(*) FROM loyalty_accounts WHERE customer_id = customer) <> 1 THEN
    RAISE EXCEPTION 'Runtime role cannot read its account';
  END IF;
  event_id := loyalty_apply(customer, 'role-booking', 'earn', 'completed-booking', 100, 25);
  IF event_id IS NULL OR
    (SELECT bonus FROM loyalty_accounts WHERE customer_id = customer) <> 25 THEN
    RAISE EXCEPTION 'Runtime role cannot execute authorized function';
  END IF;

  BEGIN
    UPDATE loyalty_accounts SET bonus = 999 WHERE customer_id = customer;
    RAISE EXCEPTION 'Direct balance update permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO loyalty_entries(customer_id, idempotency_key, kind, source, xp_delta, bonus_delta)
    VALUES (customer, 'forged', 'earn', 'forged', 0, 100);
    RAISE EXCEPTION 'Direct ledger insert permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM loyalty_entries WHERE id = event_id;
    RAISE EXCEPTION 'Direct ledger delete permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM loyalty_apply(customer, 'overspend', 'redeem', 'order', 0, 26);
    RAISE EXCEPTION 'Overspending accepted by function';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Overspending accepted by function' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM loyalty_entries WHERE customer_id = customer) <> 1 THEN
    RAISE EXCEPTION 'Denied operations altered the ledger';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
