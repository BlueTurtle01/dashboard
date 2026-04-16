"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Plan {
  id?: string;
  warnings?: Array<{ type?: string; message: string }>;
}

export default function WarningsIcon() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const checkCoachAndLoadWarnings = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      // Check if user is a coach
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isUserCoach = roles?.some((r) => r.role === "coach") ?? false;
      setIsCoach(isUserCoach);

      if (!isUserCoach) {
        setLoading(false);
        return;
      }

      // Load warnings from active plans
      const { data: plansData } = await supabase
        .from("athlete_plans")
        .select("id, plan_json")
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

      let totalUnread = 0;
      if (plansData && Array.isArray(plansData)) {
        for (const planRow of plansData) {
          const plan = planRow.plan_json as Plan;
          if (plan && Array.isArray(plan.warnings)) {
            for (const warning of plan.warnings) {
              const hash = `${planRow.id}-${warning.message}`;
              if (!readWarnings.has(hash)) {
                totalUnread++;
              }
            }
          }
        }
      }

      setUnreadCount(totalUnread);
      setLoading(false);

      // Set up real-time subscription for plan changes
      const subscription = supabase
        .channel("plan_updates")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "athlete_plans",
            filter: `coach_user_id=eq.${user.id}`,
          },
          () => {
            // Refetch warnings when plans change
            void checkCoachAndLoadWarnings();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    };

    void checkCoachAndLoadWarnings();
  }, []);

  if (!isCoach || loading) {
    return null;
  }

  return (
    <Link
      href="/coach/warnings"
      className="relative flex items-center justify-center w-10 h-10 rounded-lg hover:bg-zinc-100 transition-colors"
      title="Warnings"
    >
      {/* Warning icon */}
      <svg
        className="w-5 h-5 text-zinc-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4v2m0 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>

      {/* Badge with unread warning count */}
      {unreadCount > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-amber-600 rounded-full min-w-5">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
