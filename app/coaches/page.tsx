"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CoachProfile = {
  user_id: string;
  full_name: string | null;
  bio: string | null;
};

export default function CoachesPage() {
  const router = useRouter();
  const [coaches, setCoaches] = useState<CoachProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;
    let hasInitialized = false;

    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (!user) {
        router.push("/login");
        return;
      }

      // Load all coaches
      const { data, error } = await supabase
        .from("coach_profiles")
        .select("*")
        .order("full_name", { ascending: true });

      if (!error && data) {
        setCoaches((data as CoachProfile[]).filter((coach) => coach.full_name));
      }

      setLoading(false);
      hasInitialized = true;
    }

    // Listen for auth changes, but skip initial state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted || !hasInitialized) return;

      if (!session?.user) {
        router.push("/login");
      }
    });

    loadUser();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [router]);

  const filteredCoaches = coaches.filter((coach) => {
    const query = searchTerm.toLowerCase();
    const fullName = (coach.full_name || "").toLowerCase();
    const bio = (coach.bio || "").toLowerCase();
    return fullName.includes(query) || bio.includes(query);
  });

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-zinc-200 bg-white p-8">
            <p className="text-sm text-zinc-600">Loading coaches...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coaches</h1>
          <p className="mt-2 text-zinc-600">
            {filteredCoaches.length === 0 && coaches.length === 0
              ? "No coaches available"
              : filteredCoaches.length === 0
                ? `No results for "${searchTerm}"`
                : `${filteredCoaches.length} ${filteredCoaches.length === 1 ? "coach" : "coaches"}`}
          </p>
        </div>

        {/* Search */}
        <div>
          <input
            type="text"
            placeholder="Search coaches by name or expertise..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
          />
        </div>

        {/* Coaches grid */}
        {filteredCoaches.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
            <svg
              className="mx-auto mb-4 h-12 w-12 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            <p className="text-sm text-zinc-600">
              {coaches.length === 0 ? "No coaches found" : "No coaches match your search"}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {filteredCoaches.map((coach) => (
              <Link
                key={coach.user_id}
                href={`/coaches/${coach.user_id}`}
                className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
              >
                {/* Coach name */}
                <h2 className="text-lg font-semibold text-zinc-900 group-hover:text-zinc-700">
                  {coach.full_name}
                </h2>

                {/* Bio preview */}
                {coach.bio && (
                  <p className="mt-3 line-clamp-3 text-sm text-zinc-600">
                    {coach.bio}
                  </p>
                )}

                {/* View profile link */}
                <div className="mt-4 inline-flex items-center text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                  View Profile
                  <svg
                    className="ml-2 h-4 w-4 transition group-hover:translate-x-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
