export interface AlAthleteProfile {
  id: string;
  athlete_key: string;
  race_count: number;
  finish_count: number;
  dnf_count: number;
  dnf_rate: number | null;
  avg_perf_index: number | null;
  recency_perf_index: number | null;
  avg_flat_equiv_km: number | null;
  max_flat_equiv_km: number | null;
  avg_ascent_m: number | null;
  max_ascent_m: number | null;
  avg_difficulty_ratio: number | null;
  first_result_year: number | null;
  last_result_year: number | null;
  career_span_years: number | null;
  feature_vector: number[];
  computed_at: string;
}

export interface AlAthleteSimilarity {
  athlete_key_a: string;
  athlete_key_b: string;
  cosine_score: number;
  rank: number;
  computed_at: string;
}

export interface AlAthleteCluster {
  athlete_key: string;
  cluster_id: number;
  cluster_method: string;
  membership_prob: number | null;
  computed_at: string;
}

export interface AlClusterSummary {
  id: string;
  cluster_id: number;
  cluster_method: string;
  athlete_count: number;
  median_race_count: number | null;
  median_flat_equiv: number | null;
  median_ascent_m: number | null;
  median_difficulty: number | null;
  median_dnf_rate: number | null;
  median_perf_index: number | null;
  auto_label: string | null;
  custom_label: string | null;
  computed_at: string;
}

export interface AlAthleteProjection {
  athlete_key: string;
  proj_x: number;
  proj_y: number;
  proj_method: string;
  computed_at: string;
  // Joined from al_athlete_clusters for chart colouring
  cluster_id?: number;
  race_count?: number;
  cluster_label?: string;
}

export interface PipelineRun {
  id: string;
  step: string;
  status: "running" | "done" | "error";
  params: Record<string, unknown>;
  log_lines: string[] | null;
  error_msg: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface PipelineStatus {
  counts: {
    profiles: number;
    similarities: number;
    clusters: number;
    projectionPoints: number;
    clusterSummaries: number;
  };
  recentRuns: PipelineRun[];
}

export interface AthleteSearchResult extends AlAthleteProfile {
  cluster_id: number | null;
  cluster_label: string | null;
}

export interface AthleteDetail extends AlAthleteProfile {
  cluster_id: number | null;
  cluster_label: string | null;
  similar_athletes: SimilarAthlete[];
  races: AthleteRaceEntry[];
}

export interface SimilarAthlete {
  athlete_key: string;
  cosine_score: number;
  rank: number;
  race_count: number;
  finish_count: number;
  dnf_rate: number | null;
  avg_flat_equiv_km: number | null;
  avg_ascent_m: number | null;
  avg_perf_index: number | null;
  cluster_id: number | null;
  cluster_label: string | null;
}

export interface AthleteRaceEntry {
  race_id: string;
  race_name: string;
  result_year: number | null;
  result_status: string;
  finish_seconds: number | null;
  position: number | null;
  flat_equivalent_km: number | null;
  total_ascent_m: number | null;
}

export interface TestAthleteResult {
  athlete_key: string;
  cosine_score: number;
  rank: number;
  race_count: number;
  finish_count: number;
  dnf_rate: number | null;
  avg_flat_equiv_km: number | null;
  avg_ascent_m: number | null;
  avg_perf_index: number | null;
  max_flat_equiv_km: number | null;
  first_result_year: number | null;
  last_result_year: number | null;
  cluster_id: number | null;
  cluster_label: string | null;
  similarity_reasons: string[];
}
