"""
Phase 4: Batch prediction — generate finish-time quantile predictions for all
known (athlete, race) pairs and write them to ml_predictions.

Also provides predict_for_athlete() for real-time single-athlete queries.

Usage:
    python predict.py [--model models/latest.pkl] [--dry-run]
"""

import argparse
import math
import pickle
from datetime import datetime

import numpy as np
import pandas as pd

from athlete_features import (
    FEATURE_NAMES,
    build_features_for_prediction,
    load_all_results,
    riegel_predict,
)
from db import get_conn, query_df

RACES_WITH_PROFILES_SQL = """
SELECT
    r.id            AS race_id,
    r.name          AS race_name,
    rp.flat_equivalent_km,
    rp.total_ascent_m,
    rp.difficulty_ratio,
    rmf.field_median_seconds,
    rmf.dnf_rate    AS race_dnf_rate,
    rmf.cluster_id  AS race_cluster_id
FROM races r
JOIN race_profiles    rp  ON rp.race_id  = r.id
JOIN race_ml_features rmf ON rmf.race_id = r.id
WHERE rp.flat_equivalent_km IS NOT NULL
"""


def load_model(model_path: str) -> tuple[dict, str, list[str]]:
    with open(model_path, "rb") as f:
        bundle = pickle.load(f)
    return bundle["models"], bundle["version"], bundle["feature_names"]


def predict_seconds(models: dict, features: dict, feature_names: list[str]) -> dict[str, int | None]:
    x = np.array([[features.get(n, np.nan) for n in feature_names]], dtype=float)
    results = {}
    for q, model in models.items():
        pred_log = model.predict(x)[0]
        results[q] = int(round(math.exp(pred_log))) if np.isfinite(pred_log) else None
    return results


def predict_for_athlete(
    athlete_history_df: pd.DataFrame,
    target_race_row: dict,
    models: dict,
    feature_names: list[str],
) -> dict:
    """
    Public API for real-time single-athlete prediction.
    Returns {p10_seconds, p50_seconds, p90_seconds, riegel_predicted_seconds, features_json}.
    """
    feats = build_features_for_prediction(athlete_history_df, target_race_row)
    preds = predict_seconds(models, feats, feature_names)

    finished = athlete_history_df[athlete_history_df["finished"]]
    riegel_pred, _, _ = riegel_predict(
        finished, float(target_race_row["flat_equivalent_km"])
    )

    return {
        "p10_seconds": preds.get(0.10),
        "p50_seconds": preds.get(0.50),
        "p90_seconds": preds.get(0.90),
        "riegel_predicted_seconds": int(round(riegel_pred)) if riegel_pred else None,
        "features_json": {k: (None if (isinstance(v, float) and math.isnan(v)) else v)
                         for k, v in feats.items()},
    }


def batch_predict(
    all_results: pd.DataFrame,
    races: pd.DataFrame,
    models: dict,
    model_version: str,
    feature_names: list[str],
    dry_run: bool = False,
) -> list[dict]:
    """
    For every athlete-race pair that appears in the results (and has a GPX profile),
    predict using that athlete's history *before* that race year.
    Intended to pre-populate ml_predictions for the admin UI.
    """
    records = []
    race_map = races.set_index("race_id").to_dict("index")

    athletes = all_results["athlete_key"].unique()
    total = len(athletes)

    for i, athlete in enumerate(athletes):
        if i % 200 == 0:
            print(f"  {i}/{total} athletes processed...")

        athlete_rows = all_results[all_results["athlete_key"] == athlete].sort_values(
            "result_year", ascending=False
        )

        for _, row in athlete_rows.iterrows():
            race_id = str(row["race_id"])
            if race_id not in race_map:
                continue

            target_race = race_map[race_id]
            year = int(row["result_year"])

            # History = earlier years only
            history = athlete_rows[athlete_rows["result_year"] < year]

            pred = predict_for_athlete(history, target_race, models, feature_names)

            records.append({
                "athlete_key":               athlete,
                "race_id":                   race_id,
                "p10_seconds":               pred["p10_seconds"],
                "p50_seconds":               pred["p50_seconds"],
                "p90_seconds":               pred["p90_seconds"],
                "riegel_predicted_seconds":  pred["riegel_predicted_seconds"],
                "features_json":             pred["features_json"],
                "model_version":             model_version,
            })

    print(f"  Generated {len(records)} predictions for {total} athletes")

    if not dry_run:
        write_predictions(records, model_version)

    return records


def write_predictions(records: list[dict], model_version: str) -> None:
    if not records:
        return
    import psycopg2.extras
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Delete old predictions for this model version before inserting
            cur.execute("DELETE FROM ml_predictions WHERE model_version = %s", (model_version,))
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO ml_predictions
                    (athlete_key, race_id, p10_seconds, p50_seconds, p90_seconds,
                     riegel_predicted_seconds, features_json, model_version)
                VALUES %s
                """,
                [
                    (
                        r["athlete_key"],
                        r["race_id"],
                        r["p10_seconds"],
                        r["p50_seconds"],
                        r["p90_seconds"],
                        r["riegel_predicted_seconds"],
                        psycopg2.extras.Json(r["features_json"]),
                        r["model_version"],
                    )
                    for r in records
                ],
                page_size=500,
            )
        conn.commit()
    print(f"Wrote {len(records)} predictions (version={model_version})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model",   default="models/latest.pkl")
    parser.add_argument("--dry-run", action="store_true",
                        help="Compute predictions but do not write to database")
    args = parser.parse_args()

    print(f"Loading model from {args.model}...")
    models, model_version, feature_names = load_model(args.model)
    print(f"  Model version: {model_version}")

    print("Loading race results and profiles...")
    all_results = load_all_results()
    races = query_df(RACES_WITH_PROFILES_SQL)
    print(f"  {len(all_results)} results, {len(races)} races with profiles")

    print("Generating batch predictions...")
    batch_predict(all_results, races, models, model_version, feature_names, dry_run=args.dry_run)

    if args.dry_run:
        print("Dry run — no data written to database.")
    else:
        print("Done. Predictions stored in ml_predictions table.")


if __name__ == "__main__":
    main()
