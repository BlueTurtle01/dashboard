"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AthleteOption = {
  id: string;
  user_id: string;
  full_name: string | null;
};

type CoachAthleteLinkRow = {
  athlete_profiles:
    | {
        id: string;
        user_id: string;
        full_name: string | null;
      }
    | {
        id: string;
        user_id: string;
        full_name: string | null;
      }[]
    | null;
};

const baseLinks = [
  { href: "/create-plan", label: "Create Plan" },
  { href: "/coach", label: "Coach Dashboard" },
  { href: "/athlete", label: "Athlete View" },
  { href: "/templates", label: "Templates" },
];

const ATHLETE_STORAGE_KEY = "selectedAthleteId";
const TEST_COACH_USER_ID = "bff5270a-cdc6-4bc4-a008-3530259d57e6";

function buildAthleteHref(path: string, athleteId: string) {
  return athleteId ? `${path}?athleteId=${encodeURIComponent(athleteId)}` : path;
}

export default function Home() {
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [athletesError, setAthletesError] = useState<string | null>(null);
  const [resolvedCoachUserId, setResolvedCoachUserId] = useState("");
  const [usingTestCoachFallback, setUsingTestCoachFallback] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadAthletes() {
      const supabase = createClient();
      setLoadingAthletes(true);
      setAthletesError(null);

      let coachUserId = TEST_COACH_USER_ID;
      let usedFallback = true;

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (!userError && user?.id) {
        coachUserId = user.id;
        usedFallback = false;
      }

      setResolvedCoachUserId(coachUserId);
      setUsingTestCoachFallback(usedFallback);

      const storedAthleteId = window.localStorage.getItem(ATHLETE_STORAGE_KEY);

      const { data, error } = await supabase
        .from("coach_athlete_links")
        .select(`
          athlete_profiles!inner (
            id,
            user_id,
            full_name
          )
        `)
        .eq("coach_user_id", coachUserId)
        .eq("status", "active");

      if (!isMounted) {
        return;
      }

      if (error) {
        setAthletes([]);
        setAthletesError(error.message);
        setLoadingAthletes(false);
        return;
      }

      const athleteOptions = ((data ?? []) as CoachAthleteLinkRow[])
        .map((row) => {
          const athleteProfile = Array.isArray(row.athlete_profiles)
            ? row.athlete_profiles[0]
            : row.athlete_profiles;

          if (!athleteProfile) {
            return null;
          }

          return {
            id: athleteProfile.id,
            user_id: athleteProfile.user_id,
            full_name: athleteProfile.full_name,
          } satisfies AthleteOption;
        })
        .filter((athlete): athlete is AthleteOption => Boolean(athlete))
        .sort((a, b) => {
          const aName = (a.full_name ?? "").trim().toLowerCase();
          const bName = (b.full_name ?? "").trim().toLowerCase();
          return aName.localeCompare(bName);
        });

      setAthletes(athleteOptions);

      const storedAthleteStillExists = athleteOptions.some(
        (athlete) => athlete.id === storedAthleteId,
      );

      const initialAthleteId = storedAthleteStillExists
        ? storedAthleteId ?? ""
        : athleteOptions[0]?.id ?? "";

      setSelectedAthleteId(initialAthleteId);

      if (initialAthleteId) {
        window.localStorage.setItem(ATHLETE_STORAGE_KEY, initialAthleteId);
      } else {
        window.localStorage.removeItem(ATHLETE_STORAGE_KEY);
      }

      setLoadingAthletes(false);
    }

    void loadAthletes();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId],
  );

  const links = useMemo(
    () =>
      baseLinks.map((link) => ({
        ...link,
        href: buildAthleteHref(link.href, selectedAthleteId),
      })),
    [selectedAthleteId],
  );

  function handleAthleteChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextAthleteId = event.target.value;
    setSelectedAthleteId(nextAthleteId);

    if (nextAthleteId) {
      window.localStorage.setItem(ATHLETE_STORAGE_KEY, nextAthleteId);
    } else {
      window.localStorage.removeItem(ATHLETE_STORAGE_KEY);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
        <div className="grid w-full gap-10 rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm md:grid-cols-[1.2fr_0.8fr] md:p-12">
          <section>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Endurance Planner
            </p>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="athlete-select"
                  className="text-sm font-semibold text-zinc-900"
                >
                  Current athlete
                </label>

                <select
                  id="athlete-select"
                  value={selectedAthleteId}
                  onChange={handleAthleteChange}
                  disabled={!hasMounted || loadingAthletes || athletes.length === 0}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500"
                >
                  {loadingAthletes ? (
                    <option value="">Loading athletes...</option>
                  ) : athletes.length === 0 ? (
                    <option value="">No linked athletes found</option>
                  ) : (
                    athletes.map((athlete) => (
                      <option key={athlete.id} value={athlete.id}>
                        {athlete.full_name?.trim() || athlete.user_id}
                      </option>
                    ))
                  )}
                </select>

                <p className="text-sm text-zinc-600">
                  {selectedAthlete
                    ? `You are viewing coach links for ${selectedAthlete.full_name?.trim() || selectedAthlete.user_id}.`
                    : "Select an athlete to keep the coach pages focused on one athlete."}
                </p>

                {usingTestCoachFallback ? (
                  <p className="text-sm text-amber-700">
                    Using test coach fallback: {TEST_COACH_USER_ID}
                  </p>
                ) : resolvedCoachUserId ? (
                  <p className="text-sm text-emerald-700">
                    Signed in as coach: {resolvedCoachUserId}
                  </p>
                ) : null}

                {athletesError ? (
                  <p className="text-sm text-red-600">
                    Could not load linked athletes: {athletesError}
                  </p>
                ) : null}

                <p className="text-xs leading-5 text-zinc-500">
                  For testing, this page now falls back to your known coach user ID if
                  no auth session is available. Once proper auth is in place, the same
                  dropdown can continue to drive the athlete context across coach pages.
                </p>
              </div>
            </div>

            <h1 className="mt-6 text-4xl font-bold tracking-tight text-zinc-900 md:text-5xl">
              Build, edit, and reuse training plans in one place.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 md:text-lg">
              Create draft plans, organise them in a weekly calendar, edit sessions,
              manage templates, and share a cleaner athlete-facing view.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={buildAthleteHref("/create-plan", selectedAthleteId)}
                className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
              >
                Create Plan
              </Link>

              <Link
                href={buildAthleteHref("/coach", selectedAthleteId)}
                className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
              >
                Open Coach Dashboard
              </Link>

              <Link
                href={buildAthleteHref("/coach/athlete-overview/", selectedAthleteId)}
                className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100"
              >
                View Athletes
              </Link>

              <Link
                href={buildAthleteHref("/coach/gym-session-templates", selectedAthleteId)}
                className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100"
              >
                Create Gym Session Template
              </Link>

              <Link
                href={buildAthleteHref("/coach/program-templates/new", selectedAthleteId)}
                className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100"
              >
                Create Program Template
              </Link>

              <Link
                href={buildAthleteHref("/athlete/profile", selectedAthleteId)}
                className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100"
              >
                Athlete Profile
              </Link>
            </div>
          </section>

          <aside className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <h2 className="text-lg font-semibold text-zinc-900">Quick Links</h2>

            <div className="mt-4 grid gap-3">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
