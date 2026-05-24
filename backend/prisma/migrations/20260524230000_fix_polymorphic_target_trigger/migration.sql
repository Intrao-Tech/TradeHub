-- ============================================================
-- HOTFIX: check_polymorphic_target_exists() trigger function
-- The original (migration 20260524130000) had `RETURN NULL` at
-- the end. In a BEFORE INSERT trigger, that tells PostgreSQL to
-- silently SKIP the row — the INSERT becomes a no-op, and Prisma
-- gets 0 rows back from the RETURNING clause. Calling code then
-- crashes on `approval.id` (approval is null).
--
-- Triggers using this function:
--   - staff_action_approval_target_must_exist (BEFORE INSERT/UPDATE)
--   - staff_sla_breach_target_must_exist (BEFORE INSERT/UPDATE)
--
-- Fix: return NEW so the row is allowed through after the check.
-- ============================================================

CREATE OR REPLACE FUNCTION check_polymorphic_target_exists()
  RETURNS TRIGGER AS $$
DECLARE
  v_target_kind_name TEXT;
  target_table TEXT;
  target_exists BOOLEAN;
BEGIN
  SELECT "name" INTO v_target_kind_name
  FROM "admin_target_kind"
  WHERE "id" = NEW."target_kind_id";

  IF v_target_kind_name IS NULL THEN
    RAISE EXCEPTION 'admin_target_kind id=% not found', NEW."target_kind_id";
  END IF;

  target_table := lower(v_target_kind_name);
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE "id" = $1)', target_table)
    INTO target_exists USING NEW."target_id";

  IF NOT target_exists THEN
    RAISE EXCEPTION 'Polymorphic target_id=% not found in table %', NEW."target_id", target_table;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
