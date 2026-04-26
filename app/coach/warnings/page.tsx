"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Plan {
  warnings?: Array<{ type?: string; message: string }>;
  id?: string;
  name?: string;
}

interface WarningWithRead {
  message: string;
  type?: string;
  isRead: boolean;
  hash: string;
}

interface PlanWithWarnings {
  id: string;
  name: string;
  warnings: WarningWithRead[];
}

export default function WarningsPage() {
  const [plansWithWarnings, setPlansWithWarnings] = useState<PlanWithWarnings[]>([]);
  const [showRead, setShowRead] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadWarnings() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data: plansData } = await supabase
        .from("athlete_plans")
        .select("id, name, plan_json")
        .eq("coach_user_id", user.id)
        .eq("status", "active");

      // Get read warnings
      const { data: readWarningsData } = await supabase
        .from("warnings_read")
        .select("warning_hash")
        .eq("coach_user_id", user.id);

      const readWarnings = new Set(
        (readWarningsData || []).map((row: any) => row.warning_hash)
      );

      if (plansData && Array.isArray(plansData)) {
        const filtered: PlanWithWarnings[] = [];
        for (const row of plansData) {
          const plan = (row.plan_json || {}) as Plan;
          if (plan.warnings && Array.isArray(plan.warnings) && plan.warnings.length > 0) {
            const warningsWithRead: WarningWithRead[] = plan.warnings.map((w) => {
              const hash = `${row.id}-${w.message}`;
              return {
                message: w.message,
                type: w.type,
                isRead: readWarnings.has(hash),
                hash,
              };
            });
            filtered.push({
              id: row.id,
              name: row.name || "Untitled Plan",
              warnings: warningsWithRead,
            });
          }
        }
        setPlansWithWarnings(filtered);
      }

      setLoading(false);
    }

    void loadWarnings();
  }, []);

  async function toggleWarningRead(hash: string, isRead: boolean) {
    if (!userId) return;

    const supabase = createClient();

    if (isRead) {
      // Mark as unread - delete from warnings_read
      await supabase
        .from("warnings_read")
        .delete()
        .eq("coach_user_id", userId)
        .eq("warning_hash", hash);
    } else {
      // Mark as read - insert into warnings_read
      await supabase.from("warnings_read").insert({
        coach_user_id: userId,
        warning_hash: hash,
      });
    }

    // Update local state
    setPlansWithWarnings((plans) =>
      plans.map((plan) => ({
        ...plan,
        warnings: plan.warnings.map((w) =>
          w.hash === hash ? { ...w, isRead: !isRead } : w
        ),
      }))
    );
  }

  const totalWarnings = plansWithWarnings.reduce(
    (sum, plan) => sum + plan.warnings.length,
    0
  );

  const unreadWarnings = plansWithWarnings.reduce(
    (sum, plan) => sum + plan.warnings.filter((w) => !w.isRead).length,
    0
  );

  const displayedPlans = plansWithWarnings.map((plan) => ({
    ...plan,
    warnings: showRead ? plan.warnings : plan.warnings.filter((w) => !w.isRead),
  })).filter((plan) => plan.warnings.length > 0);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Plan Warnings</h1>
              <p className="mt-3 text-zinc-600">
                {totalWarnings === 0
                  ? "No warnings. All plans look good!"
                  : `${unreadWarnings} unread ${unreadWarnings === 1 ? "warning" : "warnings"} of ${totalWarnings} total`}
              </p>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={showRead}
                onChange={(e) => setShowRead(e.target.checked)}
                className="rounded"
              />
              <span className="font-medium">Show read</span>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border bg-white p-8">Loading warnings…</div>
        ) : displayedPlans.length === 0 && !showRead ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
            <svg
              className="mx-auto mb-4 h-12 w-12 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-lg font-semibold text-emerald-900">All caught up!</p>
            <p className="mt-2 text-sm text-emerald-700">No unread warnings at this time.</p>
          </div>
        ) : displayedPlans.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
            <svg
              className="mx-auto mb-4 h-12 w-12 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-lg font-semibold text-emerald-900">All plans look good!</p>
            <p className="mt-2 text-sm text-emerald-700">No warnings to address.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {displayedPlans.map((plan) => (
              <div key={plan.id} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-zinc-900">{plan.name}</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {plan.warnings.length} warning{plan.warnings.length === 1 ? "" : "s"}
                      {!showRead && plan.warnings.some((w) => w.isRead) && " (unread)"}
                    </p>
                  </div>
                  <Link
                    href={`/coach/plan/${plan.id}`}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                  >
                    View Plan
                  </Link>
                </div>

                <div className="space-y-3">
                  {plan.warnings.map((warning) => {
                    const isError = warning.type === "error";
                    const isWarning = warning.type === "warning";
                    const isInfo = warning.type === "info";

                    return (
                      <div
                        key={warning.hash}
                        className={`rounded-lg border-l-4 p-4 ${
                          isError
                            ? "border-l-red-600 border-r border-b border-t border-red-200 bg-red-50"
                            : isWarning
                              ? "border-l-amber-600 border-r border-b border-t border-amber-200 bg-amber-50"
                              : "border-l-blue-600 border-r border-b border-t border-blue-200 bg-blue-50"
                        } ${warning.isRead ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            <div
                              className={`text-lg leading-none mt-0.5 ${
                                isError ? "text-red-600" : isWarning ? "text-amber-600" : "text-blue-600"
                              }`}
                            >
                              {isError && "🚨"}
                              {isWarning && "⚠️"}
                              {isInfo && "ℹ️"}
                            </div>
                            <div
                              className={`text-sm ${
                                isError
                                  ? "text-red-900 font-semibold"
                                  : isWarning
                                    ? "text-amber-900 font-semibold"
                                    : "text-blue-900"
                              }`}
                            >
                              {warning.message}
                            </div>
                          </div>
                          <button
                            onClick={() => toggleWarningRead(warning.hash, warning.isRead)}
                            className={`shrink-0 whitespace-nowrap rounded px-2 py-1 text-xs font-semibold transition ${
                              warning.isRead
                                ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                                : isError
                                  ? "border border-red-600 bg-red-600 text-white hover:bg-red-700"
                                  : isWarning
                                    ? "border border-amber-600 bg-amber-600 text-white hover:bg-amber-700"
                                    : "border border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                            }`}
                          >
                            {warning.isRead ? "Mark unread" : "Mark read"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
