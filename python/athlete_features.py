"""
Phase 2: Athlete history feature engineering.

For every (athlete, target_race, result_year) triple where we have an actual
finish time, build a feature row using only information available *before*
the target race date (no lookahead leakage).

Also exports build_features_for_prediction() for use at inference time.

Output columns (one row per training example):
    athlete_key, race_id, result_year, actual_seconds,  ← target + key
    + all feature columns defined in FEATURE_NAMES
"""

import math
import numpy as np
import pandas as pd

from db import query_df

# ── Raw data loaders ──────────────────────────────────────────────────────────

RESULTS_SQL = """
SELECT
    rr.full_name                AS athlete_key,
    rr.race_id,
    rr.result_year,
    rr.result_status,
    rr.finish_seconds,
    rr.gender,
    rp.flat_equivalent_km,
    rp.total_ascent_m,
    rp.total_descent_m,
    rp.difficulty_ratio,
    rmf.field_median_seconds,
    rmf.dnf_rate                AS race_dnf_rate,
    rmf.cluster_id              AS race_cluster_id
FROM race_results rr
JOIN race_profiles  rp  ON rp.race_id  = rr.race_id
JOIN race_ml_features rmf ON rmf.race_id = rr.race_id
WHERE rr.full_name IS NOT NULL
  AND rr.full_name <> ''
  AND rr.full_name <> 'Anonymous'
  AND rp.flat_equivalent_km IS NOT NULL
ORDER BY rr.full_name, rr.result_year, rr.race_id
"""


def load_all_results() -> pd.DataFrame:
    df = query_df(RESULTS_SQL)
    df["finish_seconds"] = pd.to_numeric(df["finish_seconds"], errors="coerce")
    df["flat_equivalent_km"] = pd.to_numeric(df["flat_equivalent_km"], errors="coerce")
    df["total_ascent_m"] = pd.to_numeric(df["total_ascent_m"], errors="coerce")
    df["field_median_seconds"] = pd.to_numeric(df["field_median_seconds"], errors="coerce")
    df["race_dnf_rate"] = pd.to_numeric(df["race_dnf_rate"], errors="coerce").fillna(0.0)
    df["finished"] = (
        df["result_status"].isin(["FINISHED", "UNKNOWN"]) & df["finish_seconds"].notna()
    )
    df["dnf"] = df["result_status"] == "DNF"
    # Normalised performance (lower = faster relative to field)
    df["perf_index"] = df["finish_seconds"] / df["field_median_seconds"]
    return df


# ── Riegel helper ─────────────────────────────────────────────────────────────

def riegel_predict(history: pd.DataFrame, target_flat_equiv: float,
                   population_k: float = 1.06) -> tuple[float | None, float | None, float | None]:
    """
    Fit a Riegel power-law (T = A * D^k) to the athlete's finish history,
    predict time for target_flat_equiv.

    Returns (predicted_seconds, k_exponent, r_squared).
    Falls back to population k if fewer than 3 varied-distance finishes.
    """
    finished = history[history["finished"] & history["flat_equivalent_km"].notna()].copy()
    if len(finished) < 2:
        return None, None, None

    log_d = np.log(finished["flat_equivalent_km"].values.astype(float))
    log_t = np.log(finished["finish_seconds"].values.astype(float))

    # Need distance spread ≥ 15% for reliable k fit
    d_range = log_d.max() - log_d.min()
    reliable = len(finished) >= 3 and d_range >= np.log(1.15)

    if reliable:
        # OLS on log-log
        A_mat = np.column_stack([np.ones_like(log_d), log_d])
        try:
            coeffs, *_ = np.linalg.lstsq(A_mat, log_t, rcond=None)
            log_A, k = coeffs
        except np.linalg.LinAlgError:
            k = population_k
            log_A = np.mean(log_t - k * log_d)
        # R²
        log_t_pred = log_A + k * log_d
        ss_res = np.sum((log_t - log_t_pred) ** 2)
        ss_tot = np.sum((log_t - log_t.mean()) ** 2)
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    else:
        k = population_k
        log_A = np.mean(log_t - k * log_d)
        r2 = None

    predicted = math.exp(log_A + k * math.log(target_flat_equiv))
    return predicted, k, r2


# ── Per-athlete-race feature builder ─────────────────────────────────────────

RECENCY_WEIGHTS = [1.0, 0.75, 0.5, 0.35, 0.25]  # most recent first


def athlete_history_features(
    history: pd.DataFrame,
    target_flat_equiv: float,
    target_ascent: float,
    target_difficulty_ratio: float,
    target_race_cluster: int | None,
) -> dict:
    """
    Build feature dict from history rows (all before the target race).
    history: rows for this athlete, sorted newest-first, excluding target race.
    """
    feats: dict = {}

    finished = history[history["finished"]].copy()
    n_finished = len(finished)
    n_dnf = history["dnf"].sum()
    n_total = len(history)

    # ── Tier 1: Riegel ───────────────────────────────────────────────────────
    riegel_pred, k_exp, r2 = riegel_predict(finished, target_flat_equiv)
    feats["riegel_predicted_seconds"] = riegel_pred
    feats["riegel_k_exponent"] = k_exp
    feats["riegel_r_squared"] = r2

    # Readiness ratios (use NaN if no history)
    if n_finished > 0:
        max_flat_equiv = finished["flat_equivalent_km"].max()
        max_ascent = finished["total_ascent_m"].max()
        feats["flat_equiv_readiness"] = target_flat_equiv / max_flat_equiv if max_flat_equiv > 0 else np.nan
        feats["ascent_readiness"] = target_ascent / max_ascent if max_ascent and max_ascent > 0 else np.nan
    else:
        feats["flat_equiv_readiness"] = np.nan
        feats["ascent_readiness"] = np.nan

    # ── Tier 2: experience & consistency ────────────────────────────────────
    feats["n_races_log"] = math.log1p(n_total)
    feats["n_finished"] = n_finished
    feats["dnf_rate_athlete"] = n_dnf / n_total if n_total > 0 else np.nan
    feats["is_sparse_history"] = int(n_total < 3)

    # Recency-weighted normalised performance index
    if n_finished > 0:
        perf = finished.head(len(RECENCY_WEIGHTS))["perf_index"].values
        weights = RECENCY_WEIGHTS[:len(perf)]
        feats["recency_perf_index"] = np.average(perf, weights=weights)
    else:
        feats["recency_perf_index"] = np.nan

    # Days since last race (approximate via year difference × 365)
    if n_total > 0:
        feats["years_since_last_race"] = float(history.iloc[0]["result_year"]) - float(history.iloc[0]["result_year"])
        # We only have result_year, not exact date — use fractional year
        feats["years_since_last_race"] = 0.0  # placeholder; improve with exact dates if available
    else:
        feats["years_since_last_race"] = np.nan

    # ── Tier 3: race similarity ───────────────────────────────────────────────
    if n_finished > 0:
        # Cosine similarity between target feature vector and athlete's history vector
        hist_flat = finished["flat_equivalent_km"].values
        hist_asc  = finished["total_ascent_m"].fillna(0).values
        hist_diff = finished["difficulty_ratio"].fillna(1).values

        target_vec = np.array([target_flat_equiv, target_ascent, target_difficulty_ratio])
        hist_vec   = np.array([hist_flat.mean(), hist_asc.mean(), hist_diff.mean()])

        norm_t = np.linalg.norm(target_vec)
        norm_h = np.linalg.norm(hist_vec)
        feats["race_cosine_similarity"] = (
            float(np.dot(target_vec, hist_vec) / (norm_t * norm_h))
            if norm_t > 0 and norm_h > 0
            else np.nan
        )

        # Has athlete completed a race in the same cluster?
        if target_race_cluster is not None and not math.isnan(target_race_cluster):
            athlete_clusters = set(finished["race_cluster_id"].dropna().astype(int).tolist())
            feats["has_same_cluster_experience"] = int(target_race_cluster in athlete_clusters)
        else:
            feats["has_same_cluster_experience"] = np.nan

        feats["target_difficulty_ratio"] = target_difficulty_ratio
        feats["athlete_typical_difficulty_ratio"] = float(finished["difficulty_ratio"].median())
        feats["difficulty_ratio_delta"] = abs(
            target_difficulty_ratio - feats["athlete_typical_difficulty_ratio"]
        )
    else:
        feats["race_cosine_similarity"] = np.nan
        feats["has_same_cluster_experience"] = np.nan
        feats["target_difficulty_ratio"] = target_difficulty_ratio
        feats["athlete_typical_difficulty_ratio"] = np.nan
        feats["difficulty_ratio_delta"] = np.nan

    return feats


FEATURE_NAMES = [
    "riegel_predicted_seconds",
    "riegel_k_exponent",
    "riegel_r_squared",
    "flat_equiv_readiness",
    "ascent_readiness",
    "n_races_log",
    "n_finished",
    "dnf_rate_athlete",
    "is_sparse_history",
    "recency_perf_index",
    "years_since_last_race",
    "race_cosine_similarity",
    "has_same_cluster_experience",
    "target_difficulty_ratio",
    "athlete_typical_difficulty_ratio",
    "difficulty_ratio_delta",
    # Race-level features added in build_training_set
    "race_dnf_rate",
    "field_median_seconds",
    "target_flat_equiv_km",
    "target_ascent_m",
]


# ── Build full training dataset ───────────────────────────────────────────────

def build_training_set(df: pd.DataFrame) -> pd.DataFrame:
    """
    For each finished result, build features using only prior history.
    df = output of load_all_results(), unfiltered.
    """
    rows = []

    # Only build training examples for finishers
    targets = df[df["finished"]].copy()

    for _, target_row in targets.iterrows():
        athlete = target_row["athlete_key"]
        race_id = target_row["race_id"]
        year    = target_row["result_year"]

        # History: same athlete, strictly earlier year (or same year but different race)
        # Conservative: use only strictly earlier years to avoid leakage
        history = df[
            (df["athlete_key"] == athlete) &
            (df["result_year"] < year)
        ].sort_values("result_year", ascending=False)

        feats = athlete_history_features(
            history,
            target_flat_equiv=float(target_row["flat_equivalent_km"]),
            target_ascent=float(target_row["total_ascent_m"] or 0),
            target_difficulty_ratio=float(target_row["difficulty_ratio"] or 1),
            target_race_cluster=target_row.get("race_cluster_id"),
        )

        # Add race-level features
        feats["race_dnf_rate"]         = target_row["race_dnf_rate"]
        feats["field_median_seconds"]  = target_row["field_median_seconds"]
        feats["target_flat_equiv_km"]  = target_row["flat_equivalent_km"]
        feats["target_ascent_m"]       = target_row["total_ascent_m"]

        # Keys + target
        feats["athlete_key"]    = athlete
        feats["race_id"]        = str(race_id)
        feats["result_year"]    = int(year)
        feats["actual_seconds"] = float(target_row["finish_seconds"])

        rows.append(feats)

    result = pd.DataFrame(rows)
    # Drop rows where Riegel prediction is missing (not enough history)
    # We keep them for sparse-history model path; flag with is_sparse_history
    return result


def build_features_for_prediction(
    athlete_history_df: pd.DataFrame,
    target_race_row: dict,
) -> dict:
    """
    Build features for a single (athlete, target_race) pair at inference time.
    athlete_history_df: all known results for this athlete (any year), sorted newest-first.
    target_race_row: dict with flat_equivalent_km, total_ascent_m, difficulty_ratio,
                     field_median_seconds, race_dnf_rate, race_cluster_id.
    """
    feats = athlete_history_features(
        athlete_history_df,
        target_flat_equiv=float(target_race_row["flat_equivalent_km"]),
        target_ascent=float(target_race_row.get("total_ascent_m") or 0),
        target_difficulty_ratio=float(target_race_row.get("difficulty_ratio") or 1),
        target_race_cluster=target_race_row.get("race_cluster_id"),
    )
    feats["race_dnf_rate"]        = target_race_row.get("race_dnf_rate", 0)
    feats["field_median_seconds"] = target_race_row.get("field_median_seconds")
    feats["target_flat_equiv_km"] = target_race_row["flat_equivalent_km"]
    feats["target_ascent_m"]      = target_race_row.get("total_ascent_m")
    return feats


if __name__ == "__main__":
    print("Loading results...")
    df = load_all_results()
    print(f"  {len(df)} rows, {df['athlete_key'].nunique()} athletes")

    print("Building training set (this may take a few minutes)...")
    train_df = build_training_set(df)
    print(f"  {len(train_df)} training examples")

    out_path = "training_data.parquet"
    train_df.to_parquet(out_path, index=False)
    print(f"  Saved to {out_path}")
    print(train_df[FEATURE_NAMES].describe().to_string())
