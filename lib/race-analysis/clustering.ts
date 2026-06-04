// Diagonal-covariance Gaussian Mixture Model via EM algorithm.
// Pure TypeScript — no external dependencies.
//
// Features: [career_span_years, log(distinct_race_count + 1)]
// K = 4 clusters, sorted by mean log-race-count ascending so labels are stable:
//   0 = Newcomer  1 = Regular  2 = Experienced  3 = Veteran

const CLUSTER_LABELS = ["Newcomer", "Regular", "Experienced", "Veteran"] as const;
export type ClusterLabel = (typeof CLUSTER_LABELS)[number];

export interface AthleteCareerFeature {
  full_name: string;
  career_span_years: number;
  distinct_race_count: number;
}

export interface GMMCluster {
  id: number;
  label: ClusterLabel;
  size: number;
  mean_span: number;        // original units
  mean_race_count: number;  // original units (geometric mean via log-space mean)
}

export interface GMMResult {
  assignments: Map<string, number>;  // full_name → cluster_id (0–3)
  clusters: GMMCluster[];
  cluster_fractions: number[];       // size_k / total for each cluster
}

// ── Gaussian helpers ──────────────────────────────────────────────────────────

function logNormal(x: number, mean: number, variance: number): number {
  const v = Math.max(variance, 1e-6);
  return -0.5 * Math.log(2 * Math.PI * v) - ((x - mean) ** 2) / (2 * v);
}

// ── K-means++ seeding ─────────────────────────────────────────────────────────

function kmeanspp(data: [number, number][], K: number, rng: () => number): number[] {
  const n = data.length;
  const centerIdx: number[] = [];

  centerIdx.push(Math.floor(rng() * n));

  for (let k = 1; k < K; k++) {
    const dists = data.map((p, i) => {
      if (centerIdx.includes(i)) return 0;
      let minD = Infinity;
      for (const ci of centerIdx) {
        const d = (p[0] - data[ci][0]) ** 2 + (p[1] - data[ci][1]) ** 2;
        if (d < minD) minD = d;
      }
      return minD;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    let r = rng() * total;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) { centerIdx.push(i); break; }
    }
    if (centerIdx.length < k + 1) centerIdx.push(n - 1 - k);
  }

  return centerIdx;
}

// ── EM algorithm ──────────────────────────────────────────────────────────────

export function fitGMM(athletes: AthleteCareerFeature[], K = 4): GMMResult {
  const n = athletes.length;

  if (n < K * 2) {
    // Too few athletes — fall back to equal-split by race count
    const sorted = [...athletes].sort((a, b) => a.distinct_race_count - b.distinct_race_count);
    const assignments = new Map<string, number>();
    sorted.forEach((a, i) => assignments.set(a.full_name, Math.min(K - 1, Math.floor((i / n) * K))));
    return buildResult(athletes, assignments, K);
  }

  // Transform to feature space
  const data: [number, number][] = athletes.map((a) => [
    a.career_span_years,
    Math.log(a.distinct_race_count + 1),
  ]);

  // Deterministic RNG (LCG) for reproducible seeding
  let seed = 42;
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

  const centerIdx = kmeanspp(data, K, rng);

  // Initialise parameters
  const weights = new Array(K).fill(1 / K);
  const means: [number, number][] = centerIdx.map((i) => [data[i][0], data[i][1]]);
  const variances: [number, number][] = new Array(K).fill(null).map(() => [1.0, 0.5]);

  // Responsibilities: r[i][k]
  let r: number[][] = new Array(n).fill(null).map(() => new Array(K).fill(1 / K));

  let prevLogLik = -Infinity;

  for (let iter = 0; iter < 100; iter++) {
    // E-step
    for (let i = 0; i < n; i++) {
      const logProbs = means.map((_, k) =>
        Math.log(weights[k] + 1e-300) +
        logNormal(data[i][0], means[k][0], variances[k][0]) +
        logNormal(data[i][1], means[k][1], variances[k][1])
      );
      const maxLP = Math.max(...logProbs);
      const probs = logProbs.map((lp) => Math.exp(lp - maxLP));
      const sum = probs.reduce((s, p) => s + p, 0);
      r[i] = probs.map((p) => p / sum);
    }

    // Compute log-likelihood for convergence check
    let logLik = 0;
    for (let i = 0; i < n; i++) {
      const lp = means.map((_, k) =>
        Math.log(weights[k] + 1e-300) +
        logNormal(data[i][0], means[k][0], variances[k][0]) +
        logNormal(data[i][1], means[k][1], variances[k][1])
      );
      const maxLP = Math.max(...lp);
      logLik += maxLP + Math.log(lp.reduce((s, l) => s + Math.exp(l - maxLP), 0));
    }
    if (Math.abs(logLik - prevLogLik) < 1e-4) break;
    prevLogLik = logLik;

    // M-step
    for (let k = 0; k < K; k++) {
      const Nk = r.reduce((s, ri) => s + ri[k], 0) + 1e-300;
      weights[k] = Nk / n;
      means[k][0] = r.reduce((s, ri, i) => s + ri[k] * data[i][0], 0) / Nk;
      means[k][1] = r.reduce((s, ri, i) => s + ri[k] * data[i][1], 0) / Nk;
      variances[k][0] = r.reduce((s, ri, i) => s + ri[k] * (data[i][0] - means[k][0]) ** 2, 0) / Nk;
      variances[k][1] = r.reduce((s, ri, i) => s + ri[k] * (data[i][1] - means[k][1]) ** 2, 0) / Nk;
    }
  }

  // Hard assignments (argmax responsibility)
  const rawAssignments = new Map<string, number>();
  r.forEach((ri, i) => {
    rawAssignments.set(athletes[i].full_name, ri.indexOf(Math.max(...ri)));
  });

  // Re-index clusters sorted by mean log-race-count ascending so labels are stable
  const order = means.map((m, k) => ({ k, v: m[1] })).sort((a, b) => a.v - b.v).map((x) => x.k);
  const remap = new Array(K);
  order.forEach((origK, newK) => { remap[origK] = newK; });

  const assignments = new Map<string, number>();
  rawAssignments.forEach((k, name) => assignments.set(name, remap[k]));

  return buildResult(athletes, assignments, K);
}

function buildResult(athletes: AthleteCareerFeature[], assignments: Map<string, number>, K: number): GMMResult {
  const n = athletes.length;

  // Per-cluster mean stats
  const sums = Array.from({ length: K }, () => ({ span: 0, count: 0, size: 0 }));
  for (const a of athletes) {
    const k = assignments.get(a.full_name) ?? 0;
    sums[k].span += a.career_span_years;
    sums[k].count += a.distinct_race_count;
    sums[k].size += 1;
  }

  const clusters: GMMCluster[] = sums.map((s, id) => ({
    id,
    label: CLUSTER_LABELS[id],
    size: s.size,
    mean_span: s.size > 0 ? Math.round((s.span / s.size) * 10) / 10 : 0,
    mean_race_count: s.size > 0 ? Math.round((s.count / s.size) * 10) / 10 : 0,
  }));

  const cluster_fractions = clusters.map((c) => c.size / Math.max(n, 1));

  return { assignments, clusters, cluster_fractions };
}
