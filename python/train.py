"""
Phase 3: LightGBM quantile regression training with temporal validation.

Trains three models (q=0.10, q=0.50, q=0.90) on log(actual_seconds).
Uses temporal leave-one-year-out splits to avoid leakage.

Usage:
    # Build training data first:
    python athlete_features.py

    # Then train:
    python train.py [--data training_data.parquet] [--output models/]
"""

import argparse
import math
import os
import pickle
import warnings
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

from athlete_features import FEATURE_NAMES

warnings.filterwarnings("ignore", category=UserWarning)

QUANTILES = [0.10, 0.50, 0.90]


# ── Data loading ──────────────────────────────────────────────────────────────

def load_training_data(path: str) -> pd.DataFrame:
    df = pd.read_parquet(path)
    df = df[df["actual_seconds"].notna() & (df["actual_seconds"] > 0)].copy()
    df["log_actual"] = np.log(df["actual_seconds"].astype(float))
    return df


def get_feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
    return df[FEATURE_NAMES].astype(float)


# ── Temporal splits ───────────────────────────────────────────────────────────

def temporal_folds(df: pd.DataFrame, test_years: list[int] | None = None):
    """
    Yield (train_df, test_df, year) for each test year.
    Train set = all rows with result_year < test_year.
    Athletes that appear in both are removed from test only.
    """
    all_years = sorted(df["result_year"].unique())
    if test_years is None:
        # Use the most recent 3 years as test folds
        test_years = all_years[-3:]

    for year in test_years:
        train = df[df["result_year"] < year].copy()
        test  = df[df["result_year"] == year].copy()

        if len(train) < 50 or len(test) < 10:
            continue

        # Remove athletes that also appear in train from test
        train_athletes = set(train["athlete_key"].unique())
        test = test[test["athlete_key"].isin(train_athletes)]

        if len(test) < 10:
            continue

        yield train, test, year


# ── Model training ────────────────────────────────────────────────────────────

LGB_PARAMS_BASE = {
    "boosting_type": "gbdt",
    "n_estimators": 500,
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_child_samples": 10,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 0.1,
    "random_state": 42,
    "verbose": -1,
    "n_jobs": -1,
}


def train_quantile_models(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    quantiles: list[float] = QUANTILES,
) -> dict[float, lgb.LGBMRegressor]:
    models = {}
    for q in quantiles:
        params = {**LGB_PARAMS_BASE, "objective": "quantile", "alpha": q}
        model = lgb.LGBMRegressor(**params)
        model.fit(X_train, y_train)
        models[q] = model
    return models


# ── Evaluation ────────────────────────────────────────────────────────────────

def evaluate(models: dict, X_test: pd.DataFrame, y_test: pd.Series) -> dict:
    preds = {q: np.exp(models[q].predict(X_test)) for q in models}
    actual = np.exp(y_test.values)

    median_pred = preds[0.50]
    mae_min = mean_absolute_error(actual, median_pred)

    # PI calibration: does 80% PI contain 80% of actuals?
    in_pi = ((actual >= preds[0.10]) & (actual <= preds[0.90])).mean()

    # MAPE
    mape = np.mean(np.abs((actual - median_pred) / actual))

    return {
        "mae_seconds": mae_min,
        "mae_minutes": mae_min / 60,
        "mape": mape,
        "pi_80_coverage": in_pi,
        "n_test": len(actual),
    }


def print_feature_importance(models: dict, top_n: int = 12) -> None:
    model = models[0.50]
    imp = pd.Series(model.feature_importances_, index=FEATURE_NAMES)
    print("\n=== Feature importance (median model) ===")
    for name, val in imp.nlargest(top_n).items():
        print(f"  {name:<40} {val:>6.0f}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data",   default="training_data.parquet")
    parser.add_argument("--output", default="models")
    args = parser.parse_args()

    print(f"Loading training data from {args.data}...")
    df = load_training_data(args.data)
    print(f"  {len(df)} examples, {df['athlete_key'].nunique()} athletes, "
          f"years {df['result_year'].min()}–{df['result_year'].max()}")

    # ── Temporal cross-validation ─────────────────────────────────────────────
    print("\n=== Temporal leave-one-year-out validation ===")
    all_metrics = []
    for train_df, test_df, year in temporal_folds(df):
        X_tr = get_feature_matrix(train_df)
        y_tr = train_df["log_actual"]
        X_te = get_feature_matrix(test_df)
        y_te = test_df["log_actual"]

        fold_models = train_quantile_models(X_tr, y_tr)
        metrics     = evaluate(fold_models, X_te, y_te)
        metrics["year"] = year
        all_metrics.append(metrics)
        print(f"  Test year {year}: MAE={metrics['mae_minutes']:.1f}min  "
              f"MAPE={metrics['mape']:.1%}  "
              f"80% PI coverage={metrics['pi_80_coverage']:.1%}  "
              f"n={metrics['n_test']}")

    if all_metrics:
        avg_mae  = sum(m["mae_minutes"]   for m in all_metrics) / len(all_metrics)
        avg_mape = sum(m["mape"]          for m in all_metrics) / len(all_metrics)
        avg_pi   = sum(m["pi_80_coverage"] for m in all_metrics) / len(all_metrics)
        print(f"\n  Average: MAE={avg_mae:.1f}min  MAPE={avg_mape:.1%}  "
              f"80% PI coverage={avg_pi:.1%}")
    else:
        print("  (Not enough temporal variation for validation folds)")

    # ── Train final model on all data ─────────────────────────────────────────
    print("\nTraining final models on all data...")
    X_all = get_feature_matrix(df)
    y_all = df["log_actual"]
    final_models = train_quantile_models(X_all, y_all)
    print_feature_importance(final_models)

    # ── Save models ───────────────────────────────────────────────────────────
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    model_version = pd.Timestamp.now().strftime("%Y%m%d_%H%M%S")
    model_path = out_dir / f"quantile_models_{model_version}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump({"models": final_models, "version": model_version, "feature_names": FEATURE_NAMES}, f)

    # Also write a "latest" symlink / copy for predict.py to find
    latest_path = out_dir / "latest.pkl"
    with open(latest_path, "wb") as f:
        pickle.dump({"models": final_models, "version": model_version, "feature_names": FEATURE_NAMES}, f)

    print(f"\nModels saved to {model_path}")
    print(f"Model version: {model_version}")
    print(f"\nTo generate predictions: python predict.py --model {model_path}")


if __name__ == "__main__":
    main()
