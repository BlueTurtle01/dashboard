// Statistical utilities for race impact analysis.
// Pure TypeScript — no external dependencies.

// ── Descriptive helpers ───────────────────────────────────────────────────────

export function sortedCopy(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}

export function median(arr: number[]): number {
  if (arr.length === 0) return NaN;
  const s = sortedCopy(arr);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return NaN;
  const s = sortedCopy(arr);
  const idx = Math.max(0, Math.min(s.length - 1, Math.floor((p / 100) * s.length)));
  return s[idx];
}

// ── Normal CDF (Abramowitz & Stegun approximation, max error 7.5e-8) ─────────

function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t * (0.254829592 +
      t * (-0.284496736 +
        t * (1.421413741 +
          t * (-1.453152027 +
            t * 1.061405429))));
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x)));
}

// ── Mann-Whitney U test (normal approximation) ────────────────────────────────
//
// Tests whether group1 tends to have different values than group2.
// Returns z-score, two-tailed p-value, and median difference (group1 − group2).
// Returns { z: NaN, pValue: 1, medianDiff: 0 } if either group has < 5 values.

export interface MannWhitneyResult {
  z: number;
  pValue: number;
  medianDiff: number;
}

export function mannWhitneyU(group1: number[], group2: number[]): MannWhitneyResult {
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 < 5 || n2 < 5) {
    return { z: NaN, pValue: 1, medianDiff: 0 };
  }

  // Combine and sort ascending
  const combined: { value: number; group: 1 | 2; rank: number }[] = [
    ...group1.map((v) => ({ value: v, group: 1 as const, rank: 0 })),
    ...group2.map((v) => ({ value: v, group: 2 as const, rank: 0 })),
  ].sort((a, b) => a.value - b.value);

  // Assign average ranks for ties
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].value === combined[i].value) j++;
    const avgRank = (i + 1 + j) / 2; // 1-indexed average rank
    for (let k = i; k < j; k++) combined[k].rank = avgRank;
    i = j;
  }

  const r1 = combined
    .filter((r) => r.group === 1)
    .reduce((sum, r) => sum + r.rank, 0);

  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  const mean = (n1 * n2) / 2;
  const std = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = (u - mean) / std; // negative when groups differ

  const pValue = 2 * normalCdf(z); // two-tailed

  return {
    z: Math.round(z * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    medianDiff: median(group1) - median(group2),
  };
}

// ── Fisher's exact test ───────────────────────────────────────────────────────
//
// 2×2 table:
//   [[a, b],    a = treatment events (DNF)
//    [c, d]]    b = treatment non-events (finished)
//               c = control events
//               d = control non-events
//
// Returns two-tailed p-value and odds ratio.

export interface FishersExactResult {
  pValue: number;
  oddsRatio: number;
}

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  let result = 0;
  for (let i = 2; i <= n; i++) result += Math.log(i);
  return result;
}

function logHypergeometric(k: number, r1: number, c1: number, n: number): number {
  return (
    logFactorial(r1) +
    logFactorial(n - r1) +
    logFactorial(c1) +
    logFactorial(n - c1) -
    logFactorial(k) -
    logFactorial(r1 - k) -
    logFactorial(c1 - k) -
    logFactorial(n - r1 - c1 + k) -
    logFactorial(n)
  );
}

export function fishersExactTest(a: number, b: number, c: number, d: number): FishersExactResult {
  const r1 = a + b; // treatment total
  const c1 = a + c; // event column total
  const n = a + b + c + d;

  // Degenerate: no events in either group
  if (c1 === 0 || c1 === n) {
    return { pValue: 1, oddsRatio: 1 };
  }

  const logP_obs = logHypergeometric(a, r1, c1, n);

  let pValue = 0;
  const kMin = Math.max(0, r1 + c1 - n);
  const kMax = Math.min(r1, c1);

  for (let k = kMin; k <= kMax; k++) {
    const logP = logHypergeometric(k, r1, c1, n);
    if (logP <= logP_obs + 1e-10) {
      pValue += Math.exp(logP);
    }
  }

  const oddsRatio =
    b === 0 || c === 0
      ? a > 0 && d > 0
        ? Infinity
        : 1
      : (a * d) / (b * c);

  return {
    pValue: Math.min(1, Math.round(pValue * 10000) / 10000),
    oddsRatio: isFinite(oddsRatio) ? Math.round(oddsRatio * 100) / 100 : 999,
  };
}

// ── Pearson correlation ───────────────────────────────────────────────────────

export interface PearsonResult {
  r: number;
  pValue: number;
  n: number;
}

export function pearsonPValue(r: number, n: number): number {
  if (!isFinite(r) || isNaN(r) || n < 5) return 1;
  const rC = Math.max(-1, Math.min(1, r));
  const t = rC * Math.sqrt(n - 2) / Math.sqrt(Math.max(1e-15, 1 - rC * rC));
  return Math.min(1, Math.round(2 * normalCdf(-Math.abs(t)) * 10000) / 10000);
}

export function pearsonCorrelation(x: number[], y: number[]): PearsonResult {
  const n = x.length;
  if (n !== y.length || n < 5) return { r: NaN, pValue: 1, n };

  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = y.reduce((s, v) => s + v, 0) / n;

  let num = 0, xVar = 0, yVar = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - xMean;
    const dy = y[i] - yMean;
    num += dx * dy;
    xVar += dx * dx;
    yVar += dy * dy;
  }

  if (xVar === 0 || yVar === 0) return { r: NaN, pValue: 1, n };

  const r = num / Math.sqrt(xVar * yVar);
  const rClamped = Math.max(-1, Math.min(1, r));

  // t-distribution approximation (two-tailed, use normal CDF for large n)
  const t = rClamped * Math.sqrt(n - 2) / Math.sqrt(1 - rClamped * rClamped);
  const pValue = 2 * normalCdf(-Math.abs(t));

  return {
    r: Math.round(rClamped * 10000) / 10000,
    pValue: Math.min(1, Math.round(pValue * 10000) / 10000),
    n,
  };
}

// ── Linear regression (OLS) ───────────────────────────────────────────────────

export interface LinearRegressionModel {
  slope: number;
  intercept: number;
  rSquared: number;
  residualSE: number;
  xMean: number;
  xSumSq: number;  // Σ(xi − x̄)², needed for prediction intervals
  n: number;
}

export function linearRegression(x: number[], y: number[]): LinearRegressionModel | null {
  const n = x.length;
  if (n !== y.length || n < 3) return null;

  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = y.reduce((s, v) => s + v, 0) / n;

  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - xMean) * (y[i] - yMean);
    sxx += (x[i] - xMean) ** 2;
  }

  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;

  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (y[i] - (intercept + slope * x[i])) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }

  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const residualSE = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return {
    slope: Math.round(slope * 100) / 100,
    intercept: Math.round(intercept * 100) / 100,
    rSquared: Math.round(rSquared * 10000) / 10000,
    residualSE: Math.round(residualSE * 100) / 100,
    xMean: Math.round(xMean * 100) / 100,
    xSumSq: Math.round(sxx * 100) / 100,
    n,
  };
}

// ── Prediction interval ───────────────────────────────────────────────────────
//
// 95% prediction interval for a new x value given a fitted linear regression.
// Uses t ≈ 1.96 (valid for n > 30; slightly conservative otherwise).

export interface PredictionInterval {
  predicted: number;
  lower: number;
  upper: number;
}

export function predictionInterval(
  x0: number,
  model: LinearRegressionModel,
  tValue = 1.96
): PredictionInterval {
  const { slope, intercept, residualSE, xMean, xSumSq, n } = model;
  const predicted = intercept + slope * x0;
  const sePred = residualSE * Math.sqrt(1 + 1 / n + (x0 - xMean) ** 2 / Math.max(xSumSq, 1e-9));
  const margin = tValue * sePred;
  return {
    predicted: Math.round(predicted),
    lower: Math.round(predicted - margin),
    upper: Math.round(predicted + margin),
  };
}

// ── Wilson score confidence interval ─────────────────────────────────────────
//
// 95% CI for a proportion (k successes out of n trials).

export function wilsonCI(k: number, n: number, zScore = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const z2 = zScore * zScore;
  const center = (p + z2 / (2 * n)) / (1 + z2 / n);
  const margin =
    (zScore * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) /
    (1 + z2 / n);
  return [
    Math.max(0, Math.round((center - margin) * 10000) / 10000),
    Math.min(1, Math.round((center + margin) * 10000) / 10000),
  ];
}
