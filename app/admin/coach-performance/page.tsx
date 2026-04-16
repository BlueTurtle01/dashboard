import { redirect } from "next/navigation";
import { userHasRole } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CoachPerformancePage() {
  const hasAdminRole = await userHasRole("admin");

  if (!hasAdminRole) {
    redirect("/login");
  }

  const supabase = await createClient();

  // Fetch all coach performance scores
  const { data: scores, error } = await supabase
    .from("coach_performance_scores")
    .select("*")
    .order("calculated_at", { ascending: false });

  // Fetch coach emails separately
  let coachEmails: Record<string, string> = {};
  if (scores && scores.length > 0) {
    const coachIds = scores.map((s) => s.coach_user_id);
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    if (authUsers) {
      coachEmails = Object.fromEntries(
        authUsers.users
          .filter((u) => coachIds.includes(u.id))
          .map((u) => [u.id, u.email || "Unknown"])
      );
    }
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h1 className="text-xl font-bold text-red-900">Error</h1>
            <p className="mt-2 text-red-700">{error.message}</p>
          </div>
        </div>
      </main>
    );
  }

  const getTierBadge = (tier: number) => {
    switch (tier) {
      case 3:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-900">
            🥇 Tier 3 (Elite)
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-900">
            🥈 Tier 2
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-900">
            Tier 1
          </span>
        );
    }
  };

  const formatHours = (hours: number | null) => {
    if (hours === null) return "—";
    return `${hours.toFixed(1)}h`;
  };

  const formatScore = (score: number | null) => {
    if (score === null) return "—";
    return score.toFixed(1);
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold">Coach Performance Scores</h1>
          <p className="mt-3 text-sm text-zinc-600">
            Hidden from coaches. Used to determine compensation tiers and performance incentives.
          </p>
        </div>

        {!scores || scores.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm text-center">
            <p className="text-zinc-600">No coach performance data yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Coach
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Avg Review Time
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Avg Delivery Time
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Satisfaction
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Plan Clarity
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Retention
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Tier
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {scores.map((score: any) => (
                    <tr key={score.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-zinc-900">
                        {coachEmails[score.coach_user_id] || "Unknown"}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-600">
                        {formatHours(score.avg_review_hours)}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-600">
                        {formatHours(score.avg_delivery_hours)}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-600">
                        {formatScore(score.avg_satisfaction_score)}/10
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-600">
                        {formatScore(score.avg_clarity_score)}/10
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-600">
                        {score.athlete_retention_rate ? `${(score.athlete_retention_rate as number).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {getTierBadge(score.tier)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-zinc-900">Tier Criteria</h2>
          <div className="mt-4 space-y-3 text-sm text-zinc-600">
            <div>
              <p className="font-medium text-zinc-900">🥇 Tier 3 (Elite)</p>
              <ul className="mt-1 ml-4 space-y-1 list-disc text-zinc-600">
                <li>Avg delivery time &lt; 24 hours</li>
                <li>Satisfaction score &gt; 8.5/10</li>
                <li>Retention rate &gt; 85%</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-zinc-900">🥈 Tier 2</p>
              <ul className="mt-1 ml-4 space-y-1 list-disc text-zinc-600">
                <li>Avg delivery time &lt; 48 hours</li>
                <li>Satisfaction score &gt; 7.5/10</li>
                <li>Retention rate &gt; 70%</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-zinc-900">Tier 1</p>
              <ul className="mt-1 ml-4 space-y-1 list-disc text-zinc-600">
                <li>All coaches start here</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
