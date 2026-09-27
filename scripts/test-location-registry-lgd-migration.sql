-- ILS Location Registry LGD Identity Migration Test
-- TEST ONLY. No production connection.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.location_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  location_type text NOT NULL CHECK (
    location_type IN (
      'STATE',
      'DISTRICT',
      'TEHSIL',
      'LOCAL_BODY',
      'AUTHORITY',
      'COURT'
    )
  ),

  canonical_name text NOT NULL
    CHECK (btrim(canonical_name) <> ''),

  canonical_slug text NOT NULL
    CHECK (
      canonical_slug = btrim(canonical_slug)
      AND canonical_slug = lower(canonical_slug)
      AND canonical_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),

  current_route text NOT NULL
    CHECK (
      current_route = btrim(current_route)
      AND current_route <> ''
      AND left(current_route, 1) = '/'
      AND right(current_route, 1) = '/'
    ),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT location_registry_current_route_unique
    UNIQUE (current_route)
);

-- Apply the exact production-candidate migration.
\i supabase/migrations/20260921100000_location_registry_lgd_identity.sql

-- Verify columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'location_registry'
      AND column_name = 'source_system'
  ) THEN
    RAISE EXCEPTION 'FAIL: source_system missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'location_registry'
      AND column_name = 'source_code'
  ) THEN
    RAISE EXCEPTION 'FAIL: source_code missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'location_registry'
      AND column_name = 'parent_source_code'
  ) THEN
    RAISE EXCEPTION 'FAIL: parent_source_code missing';
  END IF;
END $$;

-- Legacy row must remain valid.
INSERT INTO public.location_registry (
  location_type,
  canonical_name,
  canonical_slug,
  current_route
)
VALUES (
  'STATE',
  'Legacy State',
  'legacy-state',
  '/legacy-state/'
);

-- Same source code across different types MUST be allowed.
INSERT INTO public.location_registry (
  location_type,
  canonical_name,
  canonical_slug,
  current_route,
  source_system,
  source_code
)
VALUES (
  'STATE',
  'Test State',
  'test-state',
  '/test-state/',
  'LGD',
  '09'
);

INSERT INTO public.location_registry (
  location_type,
  canonical_name,
  canonical_slug,
  current_route,
  source_system,
  source_code
)
VALUES (
  'DISTRICT',
  'Test District',
  'test-district',
  '/test-state/test-district/',
  'LGD',
  '09'
);

-- Same source + same type + same code MUST be rejected.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.location_registry (
      location_type,
      canonical_name,
      canonical_slug,
      current_route,
      source_system,
      source_code
    )
    VALUES (
      'DISTRICT',
      'Duplicate District',
      'duplicate-district',
      '/test-state/duplicate-district/',
      'LGD',
      '09'
    );

    RAISE EXCEPTION
      'FAIL: duplicate typed LGD identity was accepted';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END $$;

-- Different source systems with same typed code MUST be allowed.
INSERT INTO public.location_registry (
  location_type,
  canonical_name,
  canonical_slug,
  current_route,
  source_system,
  source_code
)
VALUES (
  'DISTRICT',
  'Other Source District',
  'other-source-district',
  '/other-source-district/',
  'OTHER',
  '09'
);

-- Parent source code may remain NULL.
INSERT INTO public.location_registry (
  location_type,
  canonical_name,
  canonical_slug,
  current_route,
  source_system,
  source_code,
  parent_source_code
)
VALUES (
  'TEHSIL',
  'Test Tehsil',
  'test-tehsil',
  '/tehsil/test-tehsil/',
  'LGD',
  'T100',
  '0927'
);

-- Verify exactly the expected typed identities exist.
DO $$
DECLARE
  state_count integer;
  district_count integer;
BEGIN
  SELECT count(*)
  INTO state_count
  FROM public.location_registry
  WHERE source_system = 'LGD'
    AND location_type = 'STATE'
    AND source_code = '09';

  SELECT count(*)
  INTO district_count
  FROM public.location_registry
  WHERE source_system = 'LGD'
    AND location_type = 'DISTRICT'
    AND source_code = '09';

  IF state_count <> 1 OR district_count <> 1 THEN
    RAISE EXCEPTION
      'FAIL: typed identity verification failed';
  END IF;
END $$;

ROLLBACK;

\echo 'LOCATION_REGISTRY_LGD_MIGRATION_TEST=PASS'
