-- Migration 044: Club placeholder nulling + age group validation cleanup
--
-- 1. Update al_extract_club() to treat known "no club" placeholder strings as NULL,
--    matching the TypeScript normaliseClub() helper in the CSV parser.
--
-- 2. One-off data cleanup:
--    a. Remove placeholder club values already stored in additional_data.
--    b. Move invalid age_group values (race category labels from timing systems)
--       into additional_data["Race Category"] and null out age_group.

-- ── 1. Update al_extract_club() ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.al_extract_club(ad JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(NULLIF(TRIM(COALESCE(
      NULLIF(TRIM(ad->>'Club'),         ''),
      NULLIF(TRIM(ad->>'club'),         ''),
      NULLIF(TRIM(ad->>'Team'),         ''),
      NULLIF(TRIM(ad->>'team'),         ''),
      NULLIF(TRIM(ad->>'club_team'),    ''),
      NULLIF(TRIM(ad->>'club_company'), '')
    )), '')) IN (
      '(no club)', 'no club', 'none', 'n/a', 'na', '-', '--',
      'unattached', 'unaffiliated', 'independent'
    ) THEN NULL
    ELSE NULLIF(TRIM(COALESCE(
      NULLIF(TRIM(ad->>'Club'),         ''),
      NULLIF(TRIM(ad->>'club'),         ''),
      NULLIF(TRIM(ad->>'Team'),         ''),
      NULLIF(TRIM(ad->>'team'),         ''),
      NULLIF(TRIM(ad->>'club_team'),    ''),
      NULLIF(TRIM(ad->>'club_company'), '')
    )), '')
  END;
$$;

GRANT EXECUTE ON FUNCTION public.al_extract_club(JSONB) TO authenticated;

-- ── 2a. Remove placeholder club values from existing race_results rows ─────────
-- Clears the 'Team' and 'Club' keys where the stored value is a known placeholder.

UPDATE race_results
SET additional_data = additional_data - 'Team'
WHERE additional_data->>'Team' IS NOT NULL
  AND lower(trim(additional_data->>'Team')) IN (
    '(no club)', 'no club', 'none', 'n/a', 'na', '-', '--',
    'unattached', 'unaffiliated', 'independent'
  );

UPDATE race_results
SET additional_data = additional_data - 'Club'
WHERE additional_data->>'Club' IS NOT NULL
  AND lower(trim(additional_data->>'Club')) IN (
    '(no club)', 'no club', 'none', 'n/a', 'na', '-', '--',
    'unattached', 'unaffiliated', 'independent'
  );

-- ── 2b. Move invalid age_group values to additional_data["Race Category"] ─────
-- Timing systems (e.g. Hardmoors) put race variant labels ("Marathon", "110 Male",
-- "42km", "Male Sprint") in the Class column. Valid age groups match the pattern
-- below; everything else is demoted to a reference field and age_group set to NULL.

UPDATE race_results
SET
  additional_data = additional_data || jsonb_build_object('Race Category', age_group),
  age_group       = NULL
WHERE age_group IS NOT NULL
  AND age_group !~* '^(Senior|Junior|Open|U\d{1,2}|[MF]?V?\d{2}(\+|[-]\d{2})?|[MF][SJ]|[MW]?[SJ])$';
