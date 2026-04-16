'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { AssessmentResult, RaceScore, FunnelRace } from '@/lib/funnel/types';

// ---------------------------------------------------------
// Helper
// ---------------------------------------------------------
function classNames(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function formatCost(race: FunnelRace) {
  if (!race.estimated_total_cost_gbp) return null;
  return `~£${race.estimated_total_cost_gbp.toLocaleString()}`;
}

function formatDistance(race: FunnelRace) {
  if (!race.total_distance_km) return null;
  if (race.is_stage_race && race.stage_count)
    return `${race.total_distance_km}km · ${race.stage_count} stages`;
  return `${race.total_distance_km}km`;
}

function HeatDots({ level }: { level: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${
            i < level ? 'bg-amber-500' : 'bg-gray-200'
          }`}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------
// Loading state
// ---------------------------------------------------------
function Loading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading your results…</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Tag pill
// ---------------------------------------------------------
function Tag({ label }: { label: string }) {
  return (
    <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full font-medium capitalize">
      {label.replace(/_/g, ' ')}
    </span>
  );
}

// ---------------------------------------------------------
// Primary race card
// ---------------------------------------------------------
function PrimaryRaceCard({ score }: { score: RaceScore }) {
  const { race, explanation } = score;
  return (
    <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-1 shadow-xl">
      <div className="bg-white rounded-xl p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-amber-600 bg-amber-100 px-3 py-1 rounded-full mb-3">
              ⭐ Your top recommendation
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 leading-tight">
              {race.name}
            </h2>
            <p className="text-gray-500 mt-1 text-sm">
              {race.organiser && `${race.organiser} · `}
              {race.country}
              {race.region ? `, ${race.region}` : ''}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-3xl font-black text-amber-500">{score.total_score}</div>
            <div className="text-xs text-gray-400 font-medium">match score</div>
          </div>
        </div>

        {/* Race stats */}
        <div className="flex flex-wrap gap-2 mt-4">
          {race.is_stage_race && <Tag label="Stage race" />}
          {race.is_desert_race && <Tag label="Desert" />}
          {race.self_sufficiency_level >= 4 && <Tag label="Self-supported" />}
          {race.terrain_tags.slice(0, 3).map((t) => (
            <Tag key={t} label={t} />
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          {formatDistance(race) && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Distance</p>
              <p className="font-semibold text-gray-800 text-sm">{formatDistance(race)}</p>
            </div>
          )}
          {formatCost(race) && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Est. total cost</p>
              <p className="font-semibold text-gray-800 text-sm">{formatCost(race)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 mb-1">Heat level</p>
            <HeatDots level={race.heat_level} />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">MDS prep value</p>
            <HeatDots level={race.suitable_as_final_step_before_mds_level} />
          </div>
        </div>

        {/* Explanation */}
        {explanation.why_fits.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
              Why this race fits you
            </p>
            <ul className="space-y-2">
              {explanation.why_fits.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="text-amber-500 mt-0.5 flex-shrink-0">→</span>
                  <span className="text-gray-700 text-sm leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {explanation.why_realistic.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
              Why it&rsquo;s realistic for you right now
            </p>
            <ul className="space-y-2">
              {explanation.why_realistic.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-gray-700 text-sm leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {explanation.what_it_develops.length > 0 && (
          <div className="mt-5 bg-blue-50 rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">
              What this develops for MDS
            </p>
            <ul className="space-y-1.5">
              {explanation.what_it_develops.map((point, i) => (
                <li key={i} className="text-blue-900 text-sm leading-relaxed">
                  · {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {race.website_url && (
          <div className="mt-5">
            <a
              href={race.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Visit race website →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Alternative / lower-risk / stretch race card
// ---------------------------------------------------------
function SecondaryRaceCard({
  score,
  label,
  labelColor,
}: {
  score: RaceScore;
  label: string;
  labelColor: string;
}) {
  const { race, explanation } = score;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <span
        className={classNames(
          'inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3',
          labelColor
        )}
      >
        {label}
      </span>
      <h3 className="font-bold text-gray-900 text-lg leading-snug">{race.name}</h3>
      <p className="text-gray-400 text-xs mt-0.5">
        {race.organiser && `${race.organiser} · `}
        {race.country}
      </p>

      <div className="flex flex-wrap gap-2 mt-3">
        {race.is_stage_race && <Tag label="Stage race" />}
        {race.is_desert_race && <Tag label="Desert" />}
        {race.terrain_tags.slice(0, 2).map((t) => (
          <Tag key={t} label={t} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
        {formatDistance(race) && (
          <div>
            <p className="text-xs text-gray-400">Distance</p>
            <p className="font-semibold text-gray-800 text-xs mt-0.5">{formatDistance(race)}</p>
          </div>
        )}
        {formatCost(race) && (
          <div>
            <p className="text-xs text-gray-400">Est. cost</p>
            <p className="font-semibold text-gray-800 text-xs mt-0.5">{formatCost(race)}</p>
          </div>
        )}
      </div>

      {explanation.why_fits.length > 0 && (
        <p className="text-gray-600 text-sm mt-3 leading-relaxed">
          {explanation.why_fits[0]}
        </p>
      )}

      {race.website_url && (
        <a
          href={race.website_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-amber-600 text-sm font-semibold hover:underline"
        >
          Race website →
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Gaps section
// ---------------------------------------------------------
function GapsSection({ gaps }: { gaps: string[] }) {
  if (gaps.length === 0) return null;
  return (
    <div className="bg-gray-950 text-white rounded-2xl p-6 md:p-8">
      <h3 className="font-bold text-lg mb-2">Your MDS preparation gaps</h3>
      <p className="text-gray-400 text-sm mb-5">
        Even after your feeder race, these areas will need attention before you&rsquo;re ready for
        Marathon des Sables itself.
      </p>
      <ul className="space-y-4">
        {gaps.map((gap, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xs">
              {i + 1}
            </span>
            <span className="text-gray-300 text-sm leading-relaxed">{gap}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------
// Score breakdown (compact table)
// ---------------------------------------------------------
function ScoreBreakdown({ score }: { score: RaceScore }) {
  const dimensions = [
    { label: 'Endurance fit', value: score.endurance_fit_score },
    { label: 'Budget fit', value: score.budget_fit_score },
    { label: 'Heat fit', value: score.heat_fit_score },
    { label: 'Terrain fit', value: score.terrain_fit_score },
    { label: 'Stage fit', value: score.stage_fit_score },
    { label: 'Travel fit', value: score.travel_fit_score },
    { label: 'Life fit', value: score.life_fit_score },
    { label: 'MDS progression', value: score.mds_progression_fit_score },
  ];

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
        Score breakdown
      </p>
      <div className="space-y-2">
        {dimensions.map((d) => (
          <div key={d.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-32 flex-shrink-0">{d.label}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full"
                style={{ width: `${d.value ?? 0}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-8 text-right">{Math.round(d.value ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// CTA
// ---------------------------------------------------------
function CoachingCTA() {
  return (
    <div className="border border-amber-200 bg-amber-50 rounded-2xl p-6 md:p-8 text-center">
      <h3 className="font-bold text-xl text-gray-900 mb-2">
        Want a training plan for your feeder race?
      </h3>
      <p className="text-gray-600 text-sm leading-relaxed mb-6 max-w-lg mx-auto">
        Our coaches specialise in preparing athletes for multi-stage desert racing.
        If you&rsquo;d like personalised support — from race selection right through to MDS
        itself — we&rsquo;re here to help.
      </p>
      <Link
        href="/"
        className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-3 rounded-xl transition-colors"
      >
        Find out about coaching →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------
// Main results page
// ---------------------------------------------------------
export default function ResultsPage() {
  const params = useParams();
  const assessmentId = params.assessmentId as string;

  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    // Try sessionStorage first (set by assess page on submission)
    const cached = sessionStorage.getItem(`funnel_result_${assessmentId}`);
    if (cached) {
      try {
        setResult(JSON.parse(cached));
        setLoading(false);
        return;
      } catch {
        // Fall through to API fetch
      }
    }

    // Fetch from API
    fetch(`/api/funnel/results/${assessmentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setFetchError(data.error);
          return;
        }
        // Reconstruct result from stored rows
        const scores = (data.scores ?? []).map((row: Record<string, unknown>) => ({
          race: row.race,
          is_hard_filtered: row.is_hard_filtered,
          hard_filter_reasons: (row.hard_filter_reasons_json as string[]) ?? [],
          endurance_fit_score: row.endurance_fit_score,
          terrain_fit_score: row.terrain_fit_score,
          stage_fit_score: row.stage_fit_score,
          pack_fit_score: row.pack_fit_score,
          heat_fit_score: row.heat_fit_score,
          budget_fit_score: row.budget_fit_score,
          travel_fit_score: row.travel_fit_score,
          life_fit_score: row.life_fit_score,
          risk_fit_score: row.risk_fit_score,
          mds_progression_fit_score: row.mds_progression_fit_score,
          total_score: row.total_score,
          explanation: (row.explanation_json as Record<string, string[]>) ?? {
            why_fits: [],
            why_realistic: [],
            what_it_develops: [],
            gaps_to_address: [],
          },
        }));

        const rr = data.result_row;
        const findScore = (id: string | null) =>
          id ? scores.find((s: RaceScore) => s.race.id === id) ?? null : null;

        const reconstructed: AssessmentResult = {
          primary_race: findScore(rr.primary_race_id) ?? scores[0],
          alternatives: ((rr.alternative_race_ids_json as string[]) ?? [])
            .map((id: string) => findScore(id))
            .filter(Boolean) as RaceScore[],
          lower_risk_race: findScore(rr.lower_risk_race_id),
          stretch_race: findScore(rr.stretch_race_id),
          all_scores: scores,
          main_gaps: (rr.main_gaps_json as string[]) ?? [],
          summary: rr.summary_json ?? {},
        };

        setResult(reconstructed);
      })
      .catch(() => setFetchError('Failed to load results. Please try again.'))
      .finally(() => setLoading(false));
  }, [assessmentId]);

  if (loading) return <Loading />;

  if (fetchError || !result) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-2xl mb-3">⚠️</p>
          <p className="font-semibold text-gray-800 mb-2">
            {fetchError ?? 'Results not found'}
          </p>
          <p className="text-gray-500 text-sm mb-6">
            This can happen if the assessment wasn&rsquo;t completed or the link has expired.
          </p>
          <Link
            href="/funnel/feeder-race-finder/assess"
            className="inline-block bg-amber-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-amber-600 transition-colors"
          >
            Retake assessment →
          </Link>
        </div>
      </div>
    );
  }

  const { primary_race, alternatives, lower_risk_race, stretch_race, main_gaps, summary } =
    result;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="font-bold text-gray-900">Race Readiness</span>
          <Link
            href="/funnel/feeder-race-finder"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Take another assessment
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Intro */}
        <div>
          <p className="text-amber-600 font-semibold text-sm uppercase tracking-wide mb-2">
            Your personalised recommendation
          </p>
          <h1 className="text-3xl font-extrabold text-gray-900 leading-tight mb-3">
            Here&rsquo;s your feeder race roadmap
          </h1>
          {summary.personalised_intro && (
            <p className="text-gray-600 leading-relaxed">{summary.personalised_intro}</p>
          )}
        </div>

        {/* Profile snapshot */}
        {(summary.endurance_summary || summary.biggest_strength) && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary.endurance_summary && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Your background
                </p>
                <p className="text-gray-700 text-sm">{summary.endurance_summary}</p>
              </div>
            )}
            {summary.timeline_summary && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Your MDS goal
                </p>
                <p className="text-gray-700 text-sm">{summary.timeline_summary}</p>
              </div>
            )}
            {summary.biggest_strength && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Your biggest strength
                </p>
                <p className="text-gray-700 text-sm capitalize">{summary.biggest_strength}</p>
              </div>
            )}
            {summary.biggest_gap && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Key area to develop
                </p>
                <p className="text-gray-700 text-sm capitalize">{summary.biggest_gap}</p>
              </div>
            )}
          </div>
        )}

        {/* Primary recommendation */}
        <PrimaryRaceCard score={primary_race} />

        {/* Score breakdown */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <ScoreBreakdown score={primary_race} />
        </div>

        {/* Gaps before MDS */}
        {main_gaps.length > 0 && <GapsSection gaps={main_gaps} />}

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Strong alternatives</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {alternatives.map((alt) => (
                <SecondaryRaceCard
                  key={alt.race.id}
                  score={alt}
                  label="Alternative"
                  labelColor="bg-blue-100 text-blue-700"
                />
              ))}
            </div>
          </div>
        )}

        {/* Lower risk + Stretch */}
        {(lower_risk_race || stretch_race) && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Other options</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {lower_risk_race && (
                <SecondaryRaceCard
                  score={lower_risk_race}
                  label="Lower-risk option"
                  labelColor="bg-green-100 text-green-700"
                />
              )}
              {stretch_race && (
                <SecondaryRaceCard
                  score={stretch_race}
                  label="Stretch option"
                  labelColor="bg-purple-100 text-purple-700"
                />
              )}
            </div>
          </div>
        )}

        {/* Coaching CTA */}
        <CoachingCTA />

        {/* Retake */}
        <div className="text-center py-4">
          <Link
            href="/funnel/feeder-race-finder/assess"
            className="text-sm text-gray-400 hover:text-amber-600 transition-colors"
          >
            Retake assessment with different answers →
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-100 px-6 py-6 text-center text-gray-400 text-xs">
        © {new Date().getFullYear()} Race Readiness. Results are indicative recommendations based on
        your assessment responses.
      </footer>
    </div>
  );
}
