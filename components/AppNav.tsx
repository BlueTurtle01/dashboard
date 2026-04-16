"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AppNav() {
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setRoles([]);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (!error && data) {
          setRoles(data.map((r) => r.role));
        }
      } catch (err) {
        console.error("Error fetching roles:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoles();
  }, []);

  const isAthlete = roles.includes("athlete");
  const isCoach = roles.includes("coach");
  const isAdmin = roles.includes("admin");

  return (
    <nav className="bg-white border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-8">
          <Link href="/" className="text-xl font-bold text-zinc-900">
            Endurance Planner
          </Link>

          <div className="flex items-center gap-1 flex-wrap">
            {isAthlete && (
              <>
                <Link
                  href="/athlete"
                  className="px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900 rounded hover:bg-zinc-50"
                >
                  Athlete
                </Link>
              </>
            )}

            {isCoach && (
              <>
                <Link
                  href="/coach/dashboard"
                  className="px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900 rounded hover:bg-zinc-50"
                >
                  Coach Dashboard
                </Link>
                <Link
                  href="/coach/program-templates"
                  className="px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900 rounded hover:bg-zinc-50"
                >
                  Templates
                </Link>
              </>
            )}

            {isAdmin && (
              <>
                <Link
                  href="/admin/coach-performance"
                  className="px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900 rounded hover:bg-zinc-50"
                >
                  Coach Performance
                </Link>
                <Link
                  href="/admin/exercises"
                  className="px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900 rounded hover:bg-zinc-50"
                >
                  Exercises
                </Link>
              </>
            )}

            {!loading && roles.length === 0 && (
              <Link
                href="/login"
                className="px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900 rounded hover:bg-zinc-50"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}