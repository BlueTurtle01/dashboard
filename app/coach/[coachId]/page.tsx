import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type CoachProfile = {
  user_id: string;
  full_name: string | null;
  bio: string | null;
  tags?: string[];
};

type AthleteProfile = {
  user_id: string;
  full_name: string | null;
  tags?: string[];
};

type RaceRow = {
  id: string;
  name: string;
  terrain_type: string | null;
  climate_type: string | null;
  distance_km: number | null;
  location: string | null;
};

type CoachExperience = {
  terrains: string[];
  climates: string[];
  maxDistance: number | null;
  raceCount: number;
};

type CoachCompletedRaceRow = {
  race_id: string;
  races: RaceRow | RaceRow[] | null;
};

export default async function CoachProfilePage({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  const supabase = await createClient();
  const { coachId } = await params;

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load coach profile
  const { data: profileData, error: profileError } = await supabase
    .from("coach_profiles")
    .select("*")
    .eq("user_id", coachId)
    .maybeSingle();

  if (profileError || !profileData) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-sm text-red-700">Coach profile not found.</p>
          </div>
          <Link
            href="/coach/dashboard"
            className="inline-block rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const coachProfileData = profileData as CoachProfile;
  const isOwnProfile = user.id === coachId;

  // Load athlete profile if not viewing own profile
  let athleteProfile: AthleteProfile | null = null;
  let sharedTags: string[] = [];

  if (!isOwnProfile) {
    const { data: athleteData } = await supabase
      .from("athlete_profiles")
      .select("user_id, full_name, tags")
      .eq("user_id", user.id)
      .maybeSingle();

    if (athleteData) {
      athleteProfile = athleteData as AthleteProfile;

      // Calculate shared tags
      const coachTags = coachProfileData.tags || [];
      const athleteTags = athleteData.tags || [];
      sharedTags = coachTags.filter((tag) => athleteTags.includes(tag));
    }
  }

  const { data: racesData } = await supabase
    .from("coach_completed_races")
    .select("race_id, races(id, name, terrain_type, climate_type, distance_km, location)")
    .eq("coach_user_id", coachId);

  let completedRaces: RaceRow[] = [];
  let experience: CoachExperience | null = null;

  if (racesData) {
    completedRaces = (racesData as CoachCompletedRaceRow[])
      .map((row) => {
        const relatedRace = Array.isArray(row.races) ? row.races[0] : row.races;
        return relatedRace || null;
      })
      .filter((race): race is RaceRow => Boolean(race));

    experience = inferExperience(completedRaces);
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header with back link */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Coach Profile</h1>
          {isOwnProfile && (
            <Link
              href="/coach/profile"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Edit Profile
            </Link>
          )}
        </div>

        {/* Profile card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          {/* Name */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-zinc-900">
              {coachProfileData.full_name || "Unnamed Coach"}
            </h2>
          </div>

          {/* Bio */}
          {coachProfileData.bio && (
            <div className="mb-8">
              <h3 className="mb-3 text-sm font-semibold text-zinc-700 uppercase tracking-wide">
                About
              </h3>
              <p className="whitespace-pre-wrap text-base text-zinc-700 leading-relaxed">
                {coachProfileData.bio}
              </p>
            </div>
          )}

          {/* Shared Tags - only show if athlete viewing and there are shared tags */}
          {!isOwnProfile && sharedTags.length > 0 && (
            <div className="mb-8 rounded-lg border border-purple-200 bg-purple-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-purple-900 uppercase tracking-wide">
                You both share these experiences
              </h3>
              <div className="flex flex-wrap gap-2">
                {sharedTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-purple-200 px-3 py-1 text-sm font-medium text-purple-900"
                  >
                    {tag.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-purple-700">
                This coach understands your challenges and experiences.
              </p>
            </div>
          )}

          {/* Experience section */}
          {experience && experience.raceCount > 0 && (
            <div className="mb-8">
              <h3 className="mb-4 text-sm font-semibold text-zinc-700 uppercase tracking-wide">
                Experience
              </h3>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Terrain experience */}
                {experience.terrains.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">
                      Terrain
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {experience.terrains.map((terrain) => (
                        <span
                          key={terrain}
                          className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-900"
                        >
                          {terrain}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Climate experience */}
                {experience.climates.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">
                      Climate
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {experience.climates.map((climate) => (
                        <span
                          key={climate}
                          className="rounded-full bg-orange-100 px-3 py-1 text-sm text-orange-900"
                        >
                          {climate}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Distance */}
                {experience.maxDistance !== null && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">
                      Max Distance
                    </p>
                    <p className="text-sm text-zinc-900 font-semibold">
                      {experience.maxDistance.toFixed(0)} km
                    </p>
                  </div>
                )}

                {/* Race count */}
                <div>
                  <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">
                    Races Completed
                  </p>
                  <p className="text-sm text-zinc-900 font-semibold">
                    {experience.raceCount}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-4 text-sm font-semibold text-zinc-700 uppercase tracking-wide">
              Races Completed
            </h3>

            {completedRaces.length === 0 ? (
              <p className="text-sm text-zinc-500">No races listed.</p>
            ) : (
              <div className="space-y-3">
                {completedRaces.map((race) => (
                  <div
                    key={race.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 hover:bg-zinc-100 transition-colors"
                  >
                    <div className="font-semibold text-zinc-900">{race.name}</div>
                    <div className="mt-1 text-sm text-zinc-600">
                      {[
                        race.distance_km ? `${race.distance_km}km` : null,
                        race.terrain_type,
                        race.location,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function inferExperience(races: RaceRow[]): CoachExperience {
  const terrains = new Set<string>();
  const climates = new Set<string>();
  let maxDistance = 0;

  races.forEach((race) => {
    if (race.terrain_type) terrains.add(formatLabel(race.terrain_type));
    if (race.climate_type) climates.add(formatLabel(race.climate_type));
    if (race.distance_km && race.distance_km > maxDistance) maxDistance = race.distance_km;
  });

  return {
    terrains: Array.from(terrains),
    climates: Array.from(climates),
    maxDistance: maxDistance > 0 ? maxDistance : null,
    raceCount: races.length,
  };
}

function formatLabel(text: string): string {
  return text
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

