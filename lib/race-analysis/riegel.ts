/**
 * Riegel exponent fitting utilities.
 *
 * Riegel's formula:  T = A × D^k
 *   T = finish time (minutes)
 *   D = flat-equivalent distance (km)
 *   k = endurance exponent (population avg ≈ 1.06; personal range ~1.03–1.12)
 *   A = fitness coefficient (lower = faster athlete)
 *
 * Given N (flat_equiv, time) pairs we log-linearise:
 *   log(T) = log(A) + k × log(D)
 * and fit via OLS, giving a personal k and A.
 *
 * Quality indicators:
 *   - spread_pct: (max_D - min_D) / min_D × 100
 *     A spread < 5% means the races are essentially the same distance,
 *     making k unidentifiable — we return null in that case.
 *   - spread_label: "good" ≥15%, "low" ≥5%, "none" <5%
 *   - reliable: entry_count >= 3 AND spread_label === "good"
 */

export interface RaceEntry {
  flat_equiv_km: number;
  time_minutes: number;
}

export interface FitResult {
  /** Personal Riegel exponent k */
  exponent: number;
  /** Fitness coefficient A in T = A × D^k */
  fitness_coeff: number;
  /** Coefficient of determination (0–1) */
  r_squared: number;
  /** Number of entries used for the fit */
  entry_count: number;
  /** (max_D − min_D) / min_D × 100 */
  flat_equiv_spread_pct: number;
  /** True when entry_count ≥ 3 and spread ≥ 15% */
  reliable: boolean;
  /** "good" ≥15% spread | "low" ≥5% spread | "none" <5% */
  spread_label: "good" | "low" | "none";
}

/**
 * Fit a personal Riegel exponent from the athlete's race history.
 *
 * Returns null when:
 *   - fewer than 2 entries
 *   - all flat_equivs are identical (spread = 0, k unidentifiable)
 */
export function fitRiegelExponent(entries: RaceEntry[]): FitResult | null {
  if (entries.length < 2) return null;

  // Deduplicate and sanity-check
  const valid = entries.filter(
    (e) => e.flat_equiv_km > 0 && e.time_minutes > 0
  );
  if (valid.length < 2) return null;

  const n = valid.length;
  const xs = valid.map((e) => Math.log(e.flat_equiv_km));
  const ys = valid.map((e) => Math.log(e.time_minutes));

  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - xMean) * (ys[i] - yMean);
    sxx += (xs[i] - xMean) ** 2;
  }

  // If all flat_equivs are identical sxx = 0 → can't fit slope
  if (sxx === 0) return null;

  const k = sxy / sxx;
  const logA = yMean - k * xMean;
  const fitnessCoeff = Math.exp(logA);

  // R²
  const yHats = xs.map((x) => logA + k * x);
  const ssTot = ys.reduce((acc, y) => acc + (y - yMean) ** 2, 0);
  const ssRes = ys.reduce((acc, y, i) => acc + (y - yHats[i]) ** 2, 0);
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  // Spread
  const flatEquivs = valid.map((e) => e.flat_equiv_km);
  const minD = Math.min(...flatEquivs);
  const maxD = Math.max(...flatEquivs);
  const spreadPct = ((maxD - minD) / minD) * 100;

  // If < 5% spread k is essentially noise — treat as unidentifiable
  if (spreadPct < 5) return null;

  const spreadLabel: FitResult["spread_label"] =
    spreadPct >= 15 ? "good" : "low";

  return {
    exponent: Math.round(k * 10000) / 10000,
    fitness_coeff: Math.round(fitnessCoeff * 10000) / 10000,
    r_squared: Math.round(rSquared * 10000) / 10000,
    entry_count: n,
    flat_equiv_spread_pct: Math.round(spreadPct * 10) / 10,
    reliable: n >= 3 && spreadLabel === "good",
    spread_label: spreadLabel,
  };
}

/**
 * Predict finish time (minutes) for a given flat-equivalent distance
 * using a previously fitted FitResult.
 */
export function predictTime(flatEquivKm: number, fit: FitResult): number {
  return fit.fitness_coeff * Math.pow(flatEquivKm, fit.exponent);
}

/**
 * Human-readable label describing the quality of the personal exponent fit.
 */
export function fitQualityMessage(fit: FitResult | null, entryCount: number): string {
  if (!fit) {
    if (entryCount === 0)
      return "Log your race times to start personalising estimates";
    if (entryCount === 1)
      return "Log 1 more race to begin fitting your personal exponent";
    // 2+ entries but spread too low
    return `${entryCount} races logged — add races of different distances to improve accuracy`;
  }
  if (fit.reliable) {
    return `Personal exponent k = ${fit.exponent.toFixed(3)} · ${fit.entry_count} races · good spread`;
  }
  return `Personal exponent k = ${fit.exponent.toFixed(3)} · ${fit.entry_count} races · low spread — add varied distances`;
}
