-- Performance indexes identified in audit.
-- These cover the three highest-traffic filter patterns across all API routes.

-- coach_athlete_links: status filter used in admin coaching management queries
CREATE INDEX IF NOT EXISTS idx_coach_athlete_links_status
  ON coach_athlete_links(status);

-- race_results: per-race finisher/status lookups (used in race-readiness and analytics)
CREATE INDEX IF NOT EXISTS idx_race_results_race_id_status
  ON race_results(race_id, result_status);

-- user_roles: every API route that checks roles hits this table;
--             (user_id, role) covers both point lookups and role-filtered scans
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role
  ON user_roles(user_id, role);
