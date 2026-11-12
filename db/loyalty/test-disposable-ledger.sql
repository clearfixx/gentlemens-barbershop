-- Run against a disposable database after the loyalty SQL is installed.
BEGIN;
DO $$
DECLARE
  customer bigint;
  earn_id bigint;
  redeem_id bigint;
BEGIN
  INSERT INTO users (email, salt, hash, created_at, updated_at, role)
  VALUES ('loyalty-fixture@example.invalid', 'fixture', 'fixture', now(), now(), 'customer')
  RETURNING id INTO customer;
  INSERT INTO loyalty_accounts(customer_id) VALUES (customer);
  earn_id := loyalty_apply(customer, 'booking-1', 'earn', 'booking-1', 120, 25);
  redeem_id := loyalty_apply(customer, 'order-1', 'redeem', 'order-1', 0, 10);
  IF (SELECT xp FROM loyalty_accounts WHERE customer_id = customer) <> 120
    OR (SELECT bonus FROM loyalty_accounts WHERE customer_id = customer) <> 15 THEN
    RAISE EXCEPTION 'Incorrect loyalty balance';
  END IF;
  BEGIN
    PERFORM loyalty_apply(customer, 'order-2', 'redeem', 'order-2', 0, 16);
    RAISE EXCEPTION 'Overspending accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Overspending accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM loyalty_apply(customer, 'booking-1', 'earn', 'booking-1', 120, 25);
    RAISE EXCEPTION 'Duplicate key accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM loyalty_apply(customer, 'refund-earn', 'reverse', 'refund', 0, 0, earn_id);
    RAISE EXCEPTION 'Spent earning reversed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Spent earning reversed' THEN RAISE; END IF;
  END;
  PERFORM loyalty_apply(customer, 'refund-order', 'reverse', 'refund', 0, 0, redeem_id);
  PERFORM loyalty_apply(customer, 'refund-earn', 'reverse', 'refund', 0, 0, earn_id);
  IF (SELECT xp FROM loyalty_accounts WHERE customer_id = customer) <> 0
    OR (SELECT bonus FROM loyalty_accounts WHERE customer_id = customer) <> 0 THEN
    RAISE EXCEPTION 'Incorrect reversal balance';
  END IF;
  BEGIN
    PERFORM loyalty_apply(customer, 'refund-again', 'reverse', 'refund', 0, 0, earn_id);
    RAISE EXCEPTION 'Double reversal accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Even a caller with table UPDATE/DELETE privileges must not rewrite
  -- recorded earning, redemption or compensation history.
  BEGIN
    UPDATE loyalty_entries SET source = 'rewritten' WHERE id = earn_id;
    RAISE EXCEPTION 'Ledger update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Ledger update accepted' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM loyalty_entries WHERE id = earn_id;
    RAISE EXCEPTION 'Ledger delete accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Ledger delete accepted' THEN RAISE; END IF;
  END;
  -- No two different customer accounts may reverse one another's events.
  DECLARE
    other_customer bigint;
  BEGIN
    INSERT INTO users (email, salt, hash, created_at, updated_at, role)
    VALUES ('loyalty-other-fixture@example.invalid', 'fixture', 'fixture', now(), now(), 'customer')
    RETURNING id INTO other_customer;
    INSERT INTO loyalty_accounts(customer_id) VALUES (other_customer);
    BEGIN
      PERFORM loyalty_apply(other_customer, 'other-refund', 'reverse', 'refund', 0, 0, earn_id);
      RAISE EXCEPTION 'Cross-customer reversal accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM = 'Cross-customer reversal accepted' THEN RAISE; END IF;
    END;
  END;
  IF (SELECT count(*) FROM loyalty_entries WHERE customer_id = customer) <> 4 THEN
    RAISE EXCEPTION 'Unexpected ledger entry count';
  END IF;
END $$;
ROLLBACK;
