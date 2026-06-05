# ML Finish-Time Prediction Pipeline

Predicts endurance race finish times using athlete career histories and race feature vectors.
Uses a Riegel physics baseline + LightGBM quantile residual correction.

## Setup

```bash
cd python
pip install -r requirements.txt
```

Create a `.env` file in `python/` (copy from `.env.example`):

```
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

Or set the individual vars:
```
SUPABASE_DB_HOST=db.<project-ref>.supabase.co
SUPABASE_DB_PASSWORD=<your-db-password>
```

The direct DB password is in Supabase → Project Settings → Database → Connection string.

## Pipeline (run in order)

### Step 1: Refresh race aggregate stats

Run after any new results import:

```bash
# Via psql or Supabase SQL editor:
SELECT refresh_race_ml_features();
```

### Step 2: Cluster races by type

```bash
python race_features.py --min-cluster-size 8
```

Reads `race_profiles` + `race_ml_features`, fits HDBSCAN, writes
`cluster_id`, `cluster_label`, `umap_x`, `umap_y` back to `race_ml_features`.

Inspect the printed cluster summary and update `CLUSTER_NAMES` in `race_features.py`
if the auto-assigned labels don't match.

### Step 3: Build training dataset

```bash
python athlete_features.py
# Outputs: training_data.parquet
```

Takes a few minutes. Builds features for every known (athlete, race, year) triple,
using only prior-year history for each example (no leakage).

### Step 4: Train models

```bash
python train.py --data training_data.parquet --output models/
# Outputs: models/latest.pkl, models/quantile_models_YYYYMMDD_HHMMSS.pkl
```

Reports temporal leave-one-year-out MAE, MAPE, and 80% prediction interval
calibration. With < ~500 rows, validation metrics will be noisy — this is
expected and improves as data accumulates.

### Step 5: Generate batch predictions

```bash
python predict.py --model models/latest.pkl
# Writes to: ml_predictions table in Supabase
```

Add `--dry-run` to compute predictions without writing to the database.

## Retraining

Re-run Steps 1 → 5 after importing new race results. LightGBM retrains from
scratch in seconds on this dataset size. Each run creates a new versioned model
file; the database stores the version string so you can compare runs.

## Output: ml_predictions table

| Column | Description |
|--------|-------------|
| `athlete_key` | Full name (probabilistic match key) |
| `race_id` | Target race UUID |
| `p10_seconds` | Optimistic (10th percentile) predicted finish time |
| `p50_seconds` | Central (median) predicted finish time |
| `p90_seconds` | Conservative (90th percentile) predicted finish time |
| `riegel_predicted_seconds` | Physics-only baseline for comparison |
| `features_json` | Snapshot of input features for auditability |
| `model_version` | Timestamp of the model that produced this prediction |

## Early-data expectations

| Training rows | Expected behaviour |
|---|---|
| < 500 | Very wide intervals; Riegel ≈ ML prediction |
| 1,000–2,000 | ML starts correcting for experience/terrain effects |
| 5,000+ | Full quantile calibration becomes reliable |

## Architecture notes

- The target variable is `log(actual / riegel_predicted)` conceptually, though
  in practice we model `log(actual_seconds)` directly with Riegel prediction
  as a feature — LightGBM learns to lean on it when other features are sparse.
- LightGBM handles `NaN` natively; no imputation needed.
- Temporal splits are mandatory: never use random row-level train/test splits.
