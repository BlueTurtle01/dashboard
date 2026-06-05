"""
Phase 1: Race feature extraction, HDBSCAN clustering, UMAP visualisation.

Reads race_ml_features (aggregate stats) + race_profiles (GPX-derived metrics)
and writes cluster_id, cluster_label, umap_x, umap_y back to race_ml_features.

Usage:
    python race_features.py [--min-cluster-size 8] [--no-umap]
"""

import argparse
import warnings
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

import hdbscan
import umap

from db import get_conn, query_df

warnings.filterwarnings("ignore", category=FutureWarning)

# ── Feature extraction ────────────────────────────────────────────────────────

RACE_FEATURES_SQL = """
SELECT
    r.id                          AS race_id,
    r.name                        AS race_name,
    rp.flat_equivalent_km,
    rp.total_distance_km,
    rp.total_ascent_m,
    rp.total_descent_m,
    rp.difficulty_ratio,
    rmf.field_median_seconds,
    rmf.dnf_rate,
    rmf.total_finishers
FROM races r
JOIN race_profiles rp         ON rp.race_id = r.id
JOIN race_ml_features rmf     ON rmf.race_id = r.id
WHERE rmf.field_median_seconds IS NOT NULL
  AND rp.flat_equivalent_km IS NOT NULL
  AND rp.total_ascent_m IS NOT NULL
"""

FEATURE_COLS = [
    "flat_equivalent_km",
    "total_ascent_m",
    "difficulty_ratio",
    "dnf_rate",
]


def load_race_features() -> pd.DataFrame:
    df = query_df(RACE_FEATURES_SQL)
    df["dnf_rate"] = df["dnf_rate"].fillna(0.0).astype(float)
    df["difficulty_ratio"] = df["difficulty_ratio"].fillna(1.0).astype(float)
    return df


def build_feature_matrix(df: pd.DataFrame) -> np.ndarray:
    X = df[FEATURE_COLS].astype(float).values
    scaler = StandardScaler()
    return scaler.fit_transform(X), scaler


# ── HDBSCAN clustering ────────────────────────────────────────────────────────

CLUSTER_NAMES = {
    # Heuristic labels assigned post-hoc based on cluster centroids.
    # Re-run describe_clusters() after fitting to update these if needed.
    -1: "Outlier",
    0:  "Flat road",
    1:  "Hilly road",
    2:  "Runnable trail",
    3:  "Technical trail",
    4:  "Mountain ultra",
    5:  "Beginner 50k",
    6:  "High-DNF technical",
}


def fit_clusters(X_scaled: np.ndarray, min_cluster_size: int = 8) -> np.ndarray:
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=3,
        metric="euclidean",
        cluster_selection_method="eom",
    )
    return clusterer.fit_predict(X_scaled)


def describe_clusters(df: pd.DataFrame, labels: np.ndarray) -> None:
    df = df.copy()
    df["cluster_id"] = labels
    print("\n=== Cluster summary ===")
    for cid in sorted(df["cluster_id"].unique()):
        sub = df[df["cluster_id"] == cid]
        print(
            f"  Cluster {cid:>2} ({len(sub):>3} races) — "
            f"flat_equiv μ={sub['flat_equivalent_km'].mean():.1f}km  "
            f"ascent μ={sub['total_ascent_m'].mean():.0f}m  "
            f"dnf μ={sub['dnf_rate'].mean():.2%}  "
            f"diff_ratio μ={sub['difficulty_ratio'].mean():.2f}"
        )
        top = sub.nlargest(3, "total_finishers")["race_name"].tolist()
        print(f"           examples: {', '.join(top)}")


# ── UMAP ─────────────────────────────────────────────────────────────────────

def fit_umap(X_scaled: np.ndarray, n_neighbors: int = 10) -> np.ndarray:
    reducer = umap.UMAP(n_components=2, n_neighbors=n_neighbors, random_state=42)
    return reducer.fit_transform(X_scaled)


# ── Write back to database ────────────────────────────────────────────────────

def write_clusters(df: pd.DataFrame, labels: np.ndarray, coords: np.ndarray | None) -> None:
    records = []
    for i, row in df.iterrows():
        cid = int(labels[i])
        records.append({
            "race_id":       row["race_id"],
            "cluster_id":    cid,
            "cluster_label": CLUSTER_NAMES.get(cid, f"Cluster {cid}"),
            "umap_x":        float(coords[i, 0]) if coords is not None else None,
            "umap_y":        float(coords[i, 1]) if coords is not None else None,
        })

    with get_conn() as conn:
        with conn.cursor() as cur:
            for rec in records:
                cur.execute(
                    """
                    UPDATE race_ml_features
                    SET cluster_id    = %(cluster_id)s,
                        cluster_label = %(cluster_label)s,
                        umap_x        = %(umap_x)s,
                        umap_y        = %(umap_y)s,
                        computed_at   = now()
                    WHERE race_id = %(race_id)s
                    """,
                    rec,
                )
        conn.commit()
    print(f"Wrote cluster assignments for {len(records)} races.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-cluster-size", type=int, default=8)
    parser.add_argument("--no-umap", action="store_true")
    args = parser.parse_args()

    print("Loading race features...")
    df = load_race_features()
    print(f"  {len(df)} races with GPX profiles and aggregate stats")

    X_scaled, scaler = build_feature_matrix(df)

    print(f"Fitting HDBSCAN (min_cluster_size={args.min_cluster_size})...")
    labels = fit_clusters(X_scaled, args.min_cluster_size)
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = (labels == -1).sum()
    print(f"  {n_clusters} clusters, {n_noise} noise points")
    describe_clusters(df, labels)

    coords = None
    if not args.no_umap:
        print("Fitting UMAP for visualisation...")
        coords = fit_umap(X_scaled)

    write_clusters(df, labels, coords)
    print("Done.")


if __name__ == "__main__":
    main()
