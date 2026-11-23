-- TEST ONLY. Do not apply to Production.
-- Bind each issued synthetic handoff to the exact Supabase magic-link token.
-- The callback consumes the handoff with a conditional atomic UPDATE.

DO $$
BEGIN
  IF to_regclass('public.ils_test_synthetic_auth_handoffs') IS NULL THEN
    RAISE EXCEPTION 'Required TEST-only handoff table is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ils_test_synthetic_auth_handoffs
    WHERE status='ISSUED'
  ) THEN
    RAISE EXCEPTION 'Unbound ISSUED handoffs exist; let them expire or supersede them before applying token binding';
  END IF;
END;
$$;

ALTER TABLE public.ils_test_synthetic_auth_handoffs
  ADD COLUMN IF NOT EXISTS token_hash_sha256 text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.ils_test_synthetic_auth_handoffs'::regclass
      AND conname='ils_test_synthetic_auth_handoffs_token_hash_sha256_check'
  ) THEN
    ALTER TABLE public.ils_test_synthetic_auth_handoffs
      ADD CONSTRAINT ils_test_synthetic_auth_handoffs_token_hash_sha256_check
      CHECK (token_hash_sha256 IS NULL OR token_hash_sha256 ~ '^[0-9a-f]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.ils_test_synthetic_auth_handoffs'::regclass
      AND conname='ils_test_synthetic_auth_handoffs_issued_token_required'
  ) THEN
    ALTER TABLE public.ils_test_synthetic_auth_handoffs
      ADD CONSTRAINT ils_test_synthetic_auth_handoffs_issued_token_required
      CHECK (status <> 'ISSUED' OR token_hash_sha256 IS NOT NULL);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ils_test_synthetic_auth_handoffs_token_hash_uidx
  ON public.ils_test_synthetic_auth_handoffs (token_hash_sha256)
  WHERE token_hash_sha256 IS NOT NULL;

-- Read-only verification:
-- SELECT count(*) FROM public.ils_test_synthetic_auth_handoffs
-- WHERE status='ISSUED' AND token_hash_sha256 IS NULL;
-- Expected: 0.
