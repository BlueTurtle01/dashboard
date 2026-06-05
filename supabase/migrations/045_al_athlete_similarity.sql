-- Migration 045: Athlete similarity ML pipeline tables.
--
-- Derived analysis tables that build on existing race_results, race_profiles,
-- and race_ml_features. All tables use the als_ prefix (athlete similarity).
-- Note: al_athlete_clusters already exists for GMM sequence clustering;
-- these tables are a separate feature using the als_ namespace.
--
-- Tables:
--   als_athlete_profiles     - per-athlete feature vector derived from race history
--   als_athlete_similarity   - top-N similar athlete pairs (directional)
--   als_athlete_clusters     - cluster assignment per athlete (similarity pipeline)
--   als_cluster_summaries    - cluster-level statistics and auto-generated labels
--   als_athlete_projection   - 2D UMAP/PCA coordinates for scatter visualisation
--   als_pipeline_runs        - async job log for pipeline steps

-- ── als_athlete_profiles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.als_athlete_profiles (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_key           TEXT          NOT NULL UNIQUE,  -- normalised full_name from race_results
  race_count            INT           NOT NULL DEFAULT 0,
  finish_count          INT           NOT NULL DEFAULT 0,
  dnf_count             INT           NOT NULL DEFAULT 0,
  dnf_rate              NUMERIC(6,4),
  avg_perf_index        NUMERIC(10,6),  -- avg(finish_seconds / field_median_seconds)
  recency_perf_index    NUMERIC(10,6),  -- recency-weighted avg_perf_index
  avg_flat_equiv_km     NUMERIC(8,2),
  max_flat_equiv_km     NUMERIC(8,2),
  avg_ascent_m          NUMERIC(8,1),
  max_ascent_m          NUMERIC(8,1),
  avg_difficulty_ratio  NUMERIC(6,4),
  first_result_year     INT,
  last_result_year      INT,
  career_span_years     INT,
  feature_vector        JSONB         NOT NULL DEFAULT '[]',  -- 8-element standardised array
  computed_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_als_athlete_profiles_key
  ON public.als_athlete_profiles (athlete_key);
CREATE INDEX IF NOT EXISTS idx_als_athlete_profiles_race_count
  ON public.als_athlete_profiles (race_count DESC);

ALTER TABLE public.als_athlete_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "als_athlete_profiles_admin_all" ON public.als_athlete_profiles
    FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── als_athlete_similarity ─────────────────────────────────────────────────────
-- Directional: athlete_key_a → athlete_key_b.
-- To find "athletes similar to X": WHERE athlete_key_a = X ORDER BY cosine_score DESC.
-- Only top-N pairs per athlete are stored (default top 50).

CREATE TABLE IF NOT EXISTS public.als_athlete_similarity (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_key_a   TEXT          NOT NULL,
  athlete_key_b   TEXT          NOT NULL,
  cosine_score    NUMERIC(6,4)  NOT NULL,
  rank            INT           NOT NULL,
  computed_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (athlete_key_a, athlete_key_b)
);

CREATE INDEX IF NOT EXISTS idx_als_similarity_a
  ON public.als_athlete_similarity (athlete_key_a, cosine_score DESC);
CREATE INDEX IF NOT EXISTS idx_als_similarity_b
  ON public.als_athlete_similarity (athlete_key_b);
CREATE INDEX IF NOT EXISTS idx_als_similarity_score
  ON public.als_athlete_similarity (cosine_score DESC);

ALTER TABLE public.als_athlete_similarity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "als_athlete_similarity_admin_all" ON public.als_athlete_similarity
    FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── als_athlete_clusters ───────────────────────────────────────────────────────
-- cluster_id = -1 means noise / outlier (HDBSCAN convention).

CREATE TABLE IF NOT EXISTS public.als_athlete_clusters (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_key     TEXT          NOT NULL UNIQUE,
  cluster_id      INT           NOT NULL,
  cluster_method  TEXT          NOT NULL,  -- 'hdbscan' | 'dbscan' | 'kmeans'
  membership_prob NUMERIC(6,4),            -- HDBSCAN soft membership; null for hard methods
  computed_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_als_athlete_clusters_key
  ON public.als_athlete_clusters (athlete_key);
CREATE INDEX IF NOT EXISTS idx_als_athlete_clusters_cluster
  ON public.als_athlete_clusters (cluster_id);

ALTER TABLE public.als_athlete_clusters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "als_athlete_clusters_admin_all" ON public.als_athlete_clusters
    FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── als_cluster_summaries ──────────────────────────────────────────────────────
-- One row per cluster_id. custom_label overrides auto_label in UI when set.

CREATE TABLE IF NOT EXISTS public.als_cluster_summaries (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id          INT           NOT NULL UNIQUE,
  cluster_method      TEXT          NOT NULL,
  athlete_count       INT           NOT NULL DEFAULT 0,
  median_race_count   NUMERIC(6,1),
  median_flat_equiv   NUMERIC(8,2),
  median_ascent_m     NUMERIC(8,1),
  median_difficulty   NUMERIC(6,4),
  median_dnf_rate     NUMERIC(6,4),
  median_perf_index   NUMERIC(10,6),
  auto_label          TEXT,
  custom_label        TEXT,          -- editable by admin, overrides auto_label in UI
  computed_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_als_cluster_summaries_id
  ON public.als_cluster_summaries (cluster_id);

ALTER TABLE public.als_cluster_summaries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "als_cluster_summaries_admin_all" ON public.als_cluster_summaries
    FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── als_athlete_projection ─────────────────────────────────────────────────────
-- 2D UMAP or PCA coordinates. proj_method records which was used.

CREATE TABLE IF NOT EXISTS public.als_athlete_projection (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_key     TEXT          NOT NULL UNIQUE,
  proj_x          NUMERIC(10,6) NOT NULL,
  proj_y          NUMERIC(10,6) NOT NULL,
  proj_method     TEXT          NOT NULL,  -- 'umap' | 'pca'
  computed_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_als_athlete_projection_key
  ON public.als_athlete_projection (athlete_key);

ALTER TABLE public.als_athlete_projection ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "als_athlete_projection_admin_all" ON public.als_athlete_projection
    FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── als_pipeline_runs ──────────────────────────────────────────────────────────
-- Async job log. Created by the API before spawning Python; updated on exit.
-- The frontend polls the status route which reads the most recent run per step.

CREATE TABLE IF NOT EXISTS public.als_pipeline_runs (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  step          TEXT          NOT NULL,
  status        TEXT          NOT NULL DEFAULT 'running',  -- 'running' | 'done' | 'error'
  params        JSONB         NOT NULL DEFAULT '{}',
  log_lines     TEXT[],
  error_msg     TEXT,
  started_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_als_pipeline_runs_step_started
  ON public.als_pipeline_runs (step, started_at DESC);

ALTER TABLE public.als_pipeline_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "als_pipeline_runs_admin_all" ON public.als_pipeline_runs
    FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
