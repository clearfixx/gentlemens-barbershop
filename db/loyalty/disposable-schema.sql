-- Loyalty persistence prototype. Apply ONLY on a disposable database.
-- Production installation must be a reviewed Payload migration.
CREATE TABLE loyalty_accounts (
  customer_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  bonus bigint NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE loyalty_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES loyalty_accounts(customer_id) ON DELETE RESTRICT,
  idempotency_key varchar(160) NOT NULL,
  kind varchar(16) NOT NULL CHECK (kind IN ('earn', 'redeem', 'reverse')),
  source varchar(160) NOT NULL CHECK (length(trim(source)) > 0),
  xp_delta bigint NOT NULL,
  bonus_delta bigint NOT NULL,
  reversed_entry_id bigint REFERENCES loyalty_entries(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key),
  UNIQUE (reversed_entry_id),
  CHECK (
    (kind = 'earn' AND xp_delta >= 0 AND bonus_delta >= 0 AND reversed_entry_id IS NULL)
    OR (kind = 'redeem' AND xp_delta = 0 AND bonus_delta < 0 AND reversed_entry_id IS NULL)
    OR (kind = 'reverse' AND reversed_entry_id IS NOT NULL)
  )
);
CREATE INDEX loyalty_entries_customer_order_idx ON loyalty_entries(customer_id, id);

-- Atomic balance update and append, serialized by the account row lock.
-- Duplicate request keys fail closed (unique_violation); callers must
-- fetch and verify the original event before treating a retry as success.
CREATE FUNCTION loyalty_apply(
  p_customer_id bigint,
  p_key varchar,
  p_kind varchar,
  p_source varchar,
  p_xp bigint,
  p_bonus bigint,
  p_reverse_id bigint DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  current_xp bigint;
  current_bonus bigint;
  previous loyalty_entries%ROWTYPE;
  delta_xp bigint;
  delta_bonus bigint;
  new_id bigint;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 OR length(p_key) > 160
    OR p_source IS NULL OR length(trim(p_source)) = 0 OR length(p_source) > 160 THEN
    RAISE EXCEPTION 'Invalid loyalty request identity';
  END IF;
  SELECT xp, bonus INTO current_xp, current_bonus
  FROM loyalty_accounts WHERE customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty account does not exist'; END IF;
  IF EXISTS (SELECT 1 FROM loyalty_entries WHERE customer_id = p_customer_id AND idempotency_key = p_key) THEN
    RAISE EXCEPTION 'Duplicate loyalty idempotency key' USING ERRCODE = '23505';
  END IF;

  IF p_kind = 'earn' AND p_reverse_id IS NULL AND p_xp >= 0 AND p_bonus >= 0 THEN
    delta_xp := p_xp;
    delta_bonus := p_bonus;
  ELSIF p_kind = 'redeem' AND p_reverse_id IS NULL AND p_xp = 0 AND p_bonus > 0 THEN
    delta_xp := 0;
    delta_bonus := -p_bonus;
  ELSIF p_kind = 'reverse' AND p_reverse_id IS NOT NULL AND p_xp = 0 AND p_bonus = 0 THEN
    SELECT * INTO previous FROM loyalty_entries
    WHERE id = p_reverse_id AND customer_id = p_customer_id
      AND kind <> 'reverse';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid reversal target'; END IF;
    IF EXISTS (SELECT 1 FROM loyalty_entries WHERE reversed_entry_id = p_reverse_id) THEN
      RAISE EXCEPTION 'Already reversed' USING ERRCODE = '23505';
    END IF;
    delta_xp := -previous.xp_delta;
    delta_bonus := -previous.bonus_delta;
  ELSE
    RAISE EXCEPTION 'Invalid loyalty event';
  END IF;

  IF current_xp + delta_xp < 0 OR current_bonus + delta_bonus < 0 THEN
    RAISE EXCEPTION 'Insufficient loyalty balance';
  END IF;
  UPDATE loyalty_accounts
  SET xp = current_xp + delta_xp, bonus = current_bonus + delta_bonus, updated_at = now()
  WHERE customer_id = p_customer_id;
  INSERT INTO loyalty_entries (
    customer_id, idempotency_key, kind, source, xp_delta, bonus_delta, reversed_entry_id
  ) VALUES (p_customer_id, p_key, p_kind, p_source, delta_xp, delta_bonus, p_reverse_id)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- The application role must not mutate balances or the append-only ledger
-- directly. Grant EXECUTE on loyalty_apply only to a trusted service role.
-- Actual grants/revokes require review of production database roles.
