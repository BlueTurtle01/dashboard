"""
Athlete similarity pipeline.

Transforms each athlete's race history into a multi-dimensional profile,
computes pairwise cosine similarity, clusters athletes, and generates 2D
projections for visualisation.

Steps (each can be run independently with --step, or run all together):
  profiles      Build als_athlete_profiles from race_results + race_profiles + race_ml_features
  similarities  Cosine similarity matrix, store top-N pairs in als_athlete_similarity
  clustering    HDBSCAN → DBSCAN → KMeans fallback; write als_athlete_clusters
  summaries     Cluster-level stats and auto-labels → als_cluster_summaries
  projection    UMAP → PCA fallback; write als_athlete_projection
  all           Run all steps in order

Usage:
    python athlete_similarity.py --step all
    python athlete_similarity.py --step profiles --min-races 2
    python athlete_similarity.py --step clustering --cluster-method hdbscan
    python athlete_similarity.py --step similarities --top-n 50 --sim-threshold 0.7
"""

import argparse
import json
import sys
import warnings

import numpy as np
import pandas as pd
import psycopg2.extras
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from db import get_conn, query_df

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)


# ── Feature vector definition ─────────────────────────────────────────────────
# 8 dimensions, in this fixed order. Must stay consistent between all steps.
# Raw (un-scaled) values stored in individual columns; StandardScaler output in feature_vector.

FEATURE_COLS = [
    "avg_perf_index",       # relative pace vs field (lower = faster)
    "dnf_rate",             # proportion of races marked DNF
    "avg_flat_equiv_km",    # typical race distance proxy
    "avg_ascent_m",         # typical elevation gain
    "avg_difficulty_ratio", # typical course difficulty
    "max_flat_equiv_km",    # longest distance attempted
    "career_span_years",    # years active
    "finish_count_log",     # log1p(finish_count) — compressed race volume
]

FEATURE_FILL_VALUES = {
    "avg_perf_index":       1.0,    # neutral performance
    "dnf_rate":             0.0,
    "avg_flat_equiv_km":    10.0,   # default short race
    "avg_ascent_m":         0.0,
    "avg_difficulty_ratio": 1.0,
    "max_flat_equiv_km":    10.0,
    "career_span_years":    1.0,
    "finish_count_log":     0.0,
}


# ── Step 1: Athlete profiles ──────────────────────────────────────────────────

PROFILES_SQL = """
SELECT
    rr.full_name                                                         AS athlete_key,
    COUNT(*)                                                             AS race_count,
    COUNT(*) FILTER (
        WHERE rr.result_status IN ('FINISHED', 'UNKNOWN')
          AND rr.finish_seconds IS NOT NULL
    )                                                                    AS finish_count,
    COUNT(*) FILTER (WHERE rr.result_status = 'DNF')                    AS dnf_count,

    AVG(
        rr.finish_seconds::float / NULLIF(rmf.field_median_seconds, 0)
    ) FILTER (
        WHERE rr.result_status IN ('FINISHED', 'UNKNOWN')
          AND rr.finish_seconds IS NOT NULL
          AND rmf.field_median_seconds IS NOT NULL
    )                                                                    AS avg_perf_index,

    AVG(rp.flat_equivalent_km)
        FILTER (WHERE rp.flat_equivalent_km IS NOT NULL)                 AS avg_flat_equiv_km,
    MAX(rp.flat_equivalent_km)                                           AS max_flat_equiv_km,
    AVG(rp.total_ascent_m)
        FILTER (WHERE rp.total_ascent_m IS NOT NULL)                     AS avg_ascent_m,
    MAX(rp.total_ascent_m)                                               AS max_ascent_m,
    AVG(rp.difficulty_ratio)
        FILTER (WHERE rp.difficulty_ratio IS NOT NULL)                   AS avg_difficulty_ratio,

    MIN(rr.result_year)                                                  AS first_result_year,
    MAX(rr.result_year)                                                  AS last_result_year

FROM race_results rr
LEFT JOIN race_profiles    rp  ON rp.race_id  = rr.race_id
LEFT JOIN race_ml_features rmf ON rmf.race_id = rr.race_id
WHERE rr.full_name IS NOT NULL
  AND rr.full_name <> ''
  AND rr.full_name <> 'Anonymous'
GROUP BY rr.full_name
HAVING COUNT(*) >= %(min_races)s
ORDER BY COUNT(*) DESC
"""


def run_profiles(min_races: int) -> None:
    print(f"Loading race results (min_races={min_races})...")
    df = query_df(PROFILES_SQL, params={"min_races": min_races})
    total_raw = len(df)
    print(f"  {total_raw} athletes with >= {min_races} races")

    # Coerce all aggregate columns to numeric (psycopg2 may return them as strings)
    for col in ["race_count", "finish_count", "dnf_count", "avg_perf_index",
                "avg_flat_equiv_km", "max_flat_equiv_km", "avg_ascent_m", "max_ascent_m",
                "avg_difficulty_ratio", "first_result_year", "last_result_year"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["career_span_years"] = (df["last_result_year"] - df["first_result_year"]).clip(lower=0) + 1
    df["finish_count_log"]  = np.log1p(df["finish_count"].fillna(0).astype(float))
    df["dnf_rate"] = np.where(
        df["race_count"] > 0,
        df["dnf_count"].fillna(0) / df["race_count"],
        0.0,
    )

    # Recency-weighted perf index — placeholder; same as avg_perf_index for MVP
    df["recency_perf_index"] = df["avg_perf_index"]

    # Build feature matrix with median imputation for missing values
    feat_df = df[FEATURE_COLS].copy().astype(float)
    for col, fill in FEATURE_FILL_VALUES.items():
        median = feat_df[col].median()
        fill_val = median if pd.notna(median) else fill
        feat_df[col] = feat_df[col].fillna(fill_val)

    # StandardScaler normalisation — stored in feature_vector for cosine similarity
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(feat_df.values)

    df = df.reset_index(drop=True)  # ensure positional index matches X_scaled rows

    def _int(v, default=0):
        return int(v) if pd.notna(v) else default

    def _float(v):
        return float(v) if pd.notna(v) else None

    print(f"  Writing {len(df)} athlete profiles...")
    records = []
    for i, row in df.iterrows():
        records.append((
            row["athlete_key"],
            _int(row["race_count"]),
            _int(row["finish_count"]),
            _int(row["dnf_count"]),
            _float(row["dnf_rate"]),
            _float(row["avg_perf_index"]),
            _float(row["recency_perf_index"]),
            _float(row["avg_flat_equiv_km"]),
            _float(row["max_flat_equiv_km"]),
            _float(row["avg_ascent_m"]),
            _float(row["max_ascent_m"]),
            _float(row["avg_difficulty_ratio"]),
            _int(row["first_result_year"], None),
            _int(row["last_result_year"], None),
            _int(row["career_span_years"], None),
            json.dumps([round(float(v), 6) for v in X_scaled[i]]),
        ))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE als_athlete_profiles")
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO als_athlete_profiles (
                    athlete_key, race_count, finish_count, dnf_count, dnf_rate,
                    avg_perf_index, recency_perf_index,
                    avg_flat_equiv_km, max_flat_equiv_km,
                    avg_ascent_m, max_ascent_m, avg_difficulty_ratio,
                    first_result_year, last_result_year, career_span_years,
                    feature_vector
                ) VALUES %s
                """,
                records,
                page_size=500,
            )
        conn.commit()
    print(f"  Wrote {len(records)} profiles.")


# ── Step 2: Similarity ────────────────────────────────────────────────────────

def run_similarities(top_n: int, sim_threshold: float) -> None:
    print("Loading feature vectors for similarity computation...")
    df = query_df("SELECT athlete_key, feature_vector FROM als_athlete_profiles ORDER BY athlete_key")
    if len(df) == 0:
        print("  No profiles found — run 'profiles' step first.")
        return

    keys = df["athlete_key"].tolist()
    vectors = np.array([
        json.loads(v) if isinstance(v, str) else v
        for v in df["feature_vector"]
    ], dtype=float)

    # L2-normalise for cosine similarity via dot product
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    V = vectors / norms

    N = len(keys)
    print(f"  {N} athletes — computing top-{top_n} similarities (threshold={sim_threshold})...")

    BATCH = 2000  # rows processed per iteration; controls peak memory
    records = []

    for start in range(0, N, BATCH):
        end = min(start + BATCH, N)
        batch = V[start:end]         # (BATCH, D)
        sims = batch @ V.T           # (BATCH, N)

        for local_i, row in enumerate(sims):
            ai = start + local_i
            row[ai] = -2.0           # exclude self by setting score below any threshold
            top_idxs = np.argpartition(row, -min(top_n, N - 1))[-top_n:]
            top_idxs = top_idxs[np.argsort(row[top_idxs])[::-1]]
            for rank, j in enumerate(top_idxs, 1):
                score = float(row[j])
                if score < sim_threshold:
                    break
                records.append((keys[ai], keys[j], round(score, 4), rank))

        if (start // BATCH) % 5 == 0:
            print(f"    processed {end}/{N} athletes, {len(records)} pairs so far")

    print(f"  Writing {len(records)} similarity pairs...")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE als_athlete_similarity")
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO als_athlete_similarity
                    (athlete_key_a, athlete_key_b, cosine_score, rank)
                VALUES %s
                """,
                records,
                page_size=1000,
            )
        conn.commit()
    print(f"  Done — {len(records)} similarity links stored.")


# ── Step 3: Clustering ────────────────────────────────────────────────────────

def run_clustering(method: str, kmeans_k: int, dbscan_eps: float | None,
                   dbscan_min_samples: int) -> None:
    print("Loading feature vectors for clustering...")
    df = query_df("SELECT athlete_key, feature_vector FROM als_athlete_profiles ORDER BY athlete_key")
    if len(df) == 0:
        print("  No profiles found — run 'profiles' step first.")
        return

    vectors = np.array([
        json.loads(v) if isinstance(v, str) else v
        for v in df["feature_vector"]
    ], dtype=float)

    # Scale for clustering (feature_vector already StandardScaler output, but re-scale
    # for the clustering distance metric to be consistent)
    X = vectors  # already standardised

    labels: np.ndarray | None = None
    probs: np.ndarray | None = None
    used_method = "kmeans"

    if method in ("auto", "hdbscan"):
        try:
            import hdbscan as hdbscan_lib
            min_cluster_size = max(5, len(df) // 50)
            print(f"  Trying HDBSCAN (min_cluster_size={min_cluster_size})...")
            clusterer = hdbscan_lib.HDBSCAN(
                min_cluster_size=min_cluster_size,
                min_samples=3,
                metric="euclidean",
                cluster_selection_method="eom",
            )
            labels = clusterer.fit_predict(X)
            probs = clusterer.probabilities_
            n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
            print(f"    HDBSCAN: {n_clusters} clusters, {(labels == -1).sum()} outliers")
            if n_clusters >= 2:
                used_method = "hdbscan"
            else:
                print("    Too few clusters — falling through to DBSCAN")
                labels = None
                probs = None
        except Exception as exc:
            print(f"    HDBSCAN failed ({exc}) — falling through to DBSCAN")

    if labels is None and method in ("auto", "dbscan"):
        try:
            from sklearn.cluster import DBSCAN
            eps = dbscan_eps if dbscan_eps is not None else 1.5
            min_s = dbscan_min_samples
            print(f"  Trying DBSCAN (eps={eps}, min_samples={min_s})...")
            clusterer = DBSCAN(eps=eps, min_samples=min_s, metric="euclidean")
            labels = clusterer.fit_predict(X)
            n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
            print(f"    DBSCAN: {n_clusters} clusters, {(labels == -1).sum()} noise")
            if n_clusters >= 2:
                used_method = "dbscan"
            else:
                print("    Too few clusters — falling through to KMeans")
                labels = None
        except Exception as exc:
            print(f"    DBSCAN failed ({exc}) — falling through to KMeans")

    if labels is None:
        from sklearn.cluster import KMeans
        k = kmeans_k
        print(f"  Fitting KMeans (k={k})...")
        clusterer = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = clusterer.fit_predict(X)
        used_method = "kmeans"
        n_clusters = k
        print(f"    KMeans: {n_clusters} clusters")

    print(f"  Writing {len(df)} cluster assignments (method={used_method})...")
    records = []
    for i, row in df.iterrows():
        records.append((
            row["athlete_key"],
            int(labels[i]),
            used_method,
            float(probs[i]) if probs is not None else None,
        ))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE als_athlete_clusters")
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO als_athlete_clusters
                    (athlete_key, cluster_id, cluster_method, membership_prob)
                VALUES %s
                """,
                records,
                page_size=1000,
            )
        conn.commit()
    print(f"  Done — {len(records)} cluster assignments stored.")


# ── Step 4: Cluster summaries ─────────────────────────────────────────────────

SUMMARIES_SQL = """
SELECT
    ac.cluster_id,
    ac.cluster_method,
    COUNT(*)                              AS athlete_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ap.race_count)          AS median_race_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ap.avg_flat_equiv_km)   AS median_flat_equiv,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ap.avg_ascent_m)        AS median_ascent_m,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ap.avg_difficulty_ratio) AS median_difficulty,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ap.dnf_rate)            AS median_dnf_rate,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ap.avg_perf_index)      AS median_perf_index
FROM als_athlete_clusters ac
JOIN als_athlete_profiles ap ON ap.athlete_key = ac.athlete_key
GROUP BY ac.cluster_id, ac.cluster_method
ORDER BY ac.cluster_id
"""


def _generate_label(row: pd.Series) -> str:
    cid = int(row["cluster_id"])
    if cid == -1:
        return "Outliers / Low-data"

    fe   = row.get("median_flat_equiv") or 0.0
    asc  = row.get("median_ascent_m") or 0.0
    diff = row.get("median_difficulty") or 1.0
    dnf  = row.get("median_dnf_rate") or 0.0
    rc   = row.get("median_race_count") or 0.0
    pi   = row.get("median_perf_index") or 1.0

    if fe > 80 and asc > 3000:
        return "Mountain Ultra Specialist"
    if fe > 60 and asc > 1500:
        return "Trail Ultra Regular"
    if fe > 40 and diff > 1.5:
        return "Technical Trail Athlete"
    if fe > 40 and asc < 400:
        return "Road Ultra Runner"
    if fe > 20 and asc > 800:
        return "Hilly Trail Racer"
    if fe > 15 and asc < 300 and pi < 0.9:
        return "Fast Road Racer"
    if fe > 15 and asc < 300:
        return "Road Racer"
    if dnf > 0.25:
        return "High DNF Risk Profile"
    if rc <= 3:
        return "Occasional Participant"
    if rc >= 15 and fe < 15:
        return "High-volume Short Course"
    return f"Mixed Profile (Cluster {cid})"


def run_cluster_summaries() -> None:
    print("Computing cluster summaries...")
    df = query_df(SUMMARIES_SQL)
    if len(df) == 0:
        print("  No cluster data — run 'clustering' step first.")
        return

    df["auto_label"] = df.apply(_generate_label, axis=1)

    records = []
    for _, row in df.iterrows():
        records.append((
            int(row["cluster_id"]),
            row["cluster_method"],
            int(row["athlete_count"]),
            float(row["median_race_count"]) if pd.notna(row["median_race_count"]) else None,
            float(row["median_flat_equiv"]) if pd.notna(row["median_flat_equiv"]) else None,
            float(row["median_ascent_m"]) if pd.notna(row["median_ascent_m"]) else None,
            float(row["median_difficulty"]) if pd.notna(row["median_difficulty"]) else None,
            float(row["median_dnf_rate"]) if pd.notna(row["median_dnf_rate"]) else None,
            float(row["median_perf_index"]) if pd.notna(row["median_perf_index"]) else None,
            row["auto_label"],
        ))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE als_cluster_summaries")
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO als_cluster_summaries (
                    cluster_id, cluster_method, athlete_count,
                    median_race_count, median_flat_equiv, median_ascent_m,
                    median_difficulty, median_dnf_rate, median_perf_index,
                    auto_label
                ) VALUES %s
                """,
                records,
                page_size=200,
            )
        conn.commit()

    print(f"  Wrote {len(records)} cluster summaries:")
    for _, row in df.iterrows():
        print(f"    Cluster {int(row['cluster_id']):>3}: {int(row['athlete_count']):>5} athletes — {row['auto_label']}")


# ── Step 5: 2D Projection ─────────────────────────────────────────────────────

def run_projection() -> None:
    print("Loading feature vectors for 2D projection...")
    df = query_df("SELECT athlete_key, feature_vector FROM als_athlete_profiles ORDER BY athlete_key")
    if len(df) == 0:
        print("  No profiles found — run 'profiles' step first.")
        return

    vectors = np.array([
        json.loads(v) if isinstance(v, str) else v
        for v in df["feature_vector"]
    ], dtype=float)

    coords: np.ndarray | None = None
    used_method = "pca"

    try:
        import umap as umap_lib
        print(f"  Fitting UMAP on {len(df)} athletes...")
        n_neighbors = min(15, max(2, len(df) // 10))
        reducer = umap_lib.UMAP(
            n_components=2,
            n_neighbors=n_neighbors,
            min_dist=0.1,
            random_state=42,
        )
        coords = reducer.fit_transform(vectors)
        used_method = "umap"
        print("    UMAP complete.")
    except Exception as exc:
        print(f"    UMAP failed ({exc}) — falling back to PCA")

    if coords is None:
        print(f"  Fitting PCA on {len(df)} athletes...")
        pca = PCA(n_components=2, random_state=42)
        coords = pca.fit_transform(vectors)
        used_method = "pca"
        print("    PCA complete.")

    records = []
    for i, row in df.iterrows():
        records.append((
            row["athlete_key"],
            float(coords[i, 0]),
            float(coords[i, 1]),
            used_method,
        ))

    print(f"  Writing {len(records)} projection points (method={used_method})...")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE als_athlete_projection")
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO als_athlete_projection (athlete_key, proj_x, proj_y, proj_method)
                VALUES %s
                """,
                records,
                page_size=1000,
            )
        conn.commit()
    print(f"  Done — {len(records)} projection points stored.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Athlete similarity pipeline")
    parser.add_argument(
        "--step",
        default="all",
        choices=["profiles", "similarities", "clustering", "summaries", "projection", "all"],
        help="Pipeline step to run (default: all)",
    )
    parser.add_argument("--min-races",         type=int,   default=2,    help="Min races per athlete (default 2)")
    parser.add_argument("--top-n",             type=int,   default=50,   help="Top-N similar athletes to store (default 50)")
    parser.add_argument("--sim-threshold",     type=float, default=0.7,  help="Min cosine score threshold (default 0.7)")
    parser.add_argument("--cluster-method",    default="auto",
                        choices=["auto", "hdbscan", "dbscan", "kmeans"],
                        help="Clustering method (default: auto = try hdbscan→dbscan→kmeans)")
    parser.add_argument("--kmeans-k",          type=int,   default=8,    help="KMeans k (default 8)")
    parser.add_argument("--dbscan-eps",        type=float, default=None, help="DBSCAN eps (default auto)")
    parser.add_argument("--dbscan-min-samples",type=int,   default=5,    help="DBSCAN min_samples (default 5)")
    args = parser.parse_args()

    STEPS = ["profiles", "similarities", "clustering", "summaries", "projection"]
    steps = STEPS if args.step == "all" else [args.step]

    print(f"=== Athlete Similarity Pipeline — steps: {', '.join(steps)} ===\n")

    for step in steps:
        print(f"\n--- Step: {step} ---")
        if step == "profiles":
            run_profiles(args.min_races)
        elif step == "similarities":
            run_similarities(args.top_n, args.sim_threshold)
        elif step == "clustering":
            run_clustering(args.cluster_method, args.kmeans_k,
                           args.dbscan_eps, args.dbscan_min_samples)
        elif step == "summaries":
            run_cluster_summaries()
        elif step == "projection":
            run_projection()

    print("\n=== Pipeline complete ===")


if __name__ == "__main__":
    main()
