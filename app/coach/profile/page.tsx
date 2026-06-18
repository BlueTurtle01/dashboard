"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const AVAILABLE_TAGS = [
  // Injury History
  { value: "knee_pain", label: "Knee pain", category: "Injury History" },
  { value: "back_pain", label: "Back pain", category: "Injury History" },
  { value: "ankle_issues", label: "Ankle issues", category: "Injury History" },
  { value: "it_band_syndrome", label: "IT band syndrome", category: "Injury History" },
  { value: "plantar_fasciitis", label: "Plantar fasciitis", category: "Injury History" },
  { value: "shin_splints", label: "Shin splints", category: "Injury History" },
  { value: "stress_fracture", label: "Stress fracture history", category: "Injury History" },
  { value: "tendinitis", label: "Tendinitis", category: "Injury History" },

  // Medical Conditions
  { value: "asthma", label: "Asthma", category: "Medical Conditions" },
  { value: "diabetes", label: "Diabetes", category: "Medical Conditions" },
  { value: "heart_condition", label: "Heart condition", category: "Medical Conditions" },
  { value: "hypertension", label: "Hypertension", category: "Medical Conditions" },
  { value: "thyroid_condition", label: "Thyroid condition", category: "Medical Conditions" },

  // Experience & Background
  { value: "ultramarathoner", label: "Ultramarathoner", category: "Experience" },
  { value: "trail_runner", label: "Trail runner", category: "Experience" },
  { value: "road_runner", label: "Road runner", category: "Experience" },
  { value: "desert_racing", label: "Desert racing", category: "Experience" },
  { value: "high_altitude", label: "High altitude experience", category: "Experience" },
  { value: "multi_day_racing", label: "Multi-day racing", category: "Experience" },

  // Recovery & Training Focus
  { value: "strength_training_focus", label: "Strength training focus", category: "Training Focus" },
  { value: "nutrition_focus", label: "Nutrition focus", category: "Training Focus" },
  { value: "sleep_optimization", label: "Sleep optimization", category: "Training Focus" },
  { value: "mental_health_focus", label: "Mental health focus", category: "Training Focus" },
  { value: "cross_training", label: "Cross-training advocate", category: "Training Focus" },
  { value: "recovery_specialist", label: "Recovery specialist", category: "Training Focus" },

  // Psychology & Mindset
  { value: "anxiety_management", label: "Anxiety management experience", category: "Psychology" },
  { value: "fear_of_water", label: "Previously had fear of water", category: "Psychology" },
  { value: "perfectionist", label: "Perfectionist tendencies", category: "Psychology" },
  { value: "mental_toughness", label: "Mental toughness builder", category: "Psychology" },

  // Special Circumstances
  { value: "first_time_racer", label: "First-time racer coach", category: "Specialties" },
  { value: "comeback_from_injury", label: "Comeback from injury specialist", category: "Specialties" },
  { value: "female_athlete_coach", label: "Female athlete specialist", category: "Specialties" },
  { value: "masters_athlete", label: "Masters athlete coach", category: "Specialties" },
  { value: "athlete_with_family", label: "Coach for busy/parent athletes", category: "Specialties" },
];

type CoachProfile = {
  user_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  tags?: string[];
};

type RaceRow = {
  id: string;
  name: string;
  distance_km: number | null;
  terrain_type: string | null;
  climate_type: string | null;
};

type CoachCompletedRaceRow = {
  race_id: string;
  races: RaceRow | RaceRow[] | null;
};

export default function CoachProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"basic" | "experience" | "availability">("basic");

  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [maxClients, setMaxClients] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [raceSearchTerm, setRaceSearchTerm] = useState("");
  const [allRaces, setAllRaces] = useState<RaceRow[]>([]);
  const [selectedRaces, setSelectedRaces] = useState<RaceRow[]>([]);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setErrorMessage("");
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const [profileResult, racesResult, selectedRacesResult] = await Promise.all([
        supabase
          .from("coach_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("races")
          .select("id, name, distance_km, terrain_type, climate_type")
          .eq("is_published", true)
          .order("name"),
        supabase
          .from("coach_completed_races")
          .select("race_id, races(id, name, distance_km, terrain_type, climate_type)")
          .eq("coach_user_id", user.id),
      ]);

      if (profileResult.error) {
        setErrorMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      if (racesResult.error) {
        setErrorMessage("Could not load races.");
        setLoading(false);
        return;
      }

      if (selectedRacesResult.error) {
        setErrorMessage("Could not load completed races.");
        setLoading(false);
        return;
      }

      if (profileResult.data) {
        const profile = profileResult.data as CoachProfile & { max_clients?: number | null };
        setFullName(profile.full_name || "");
        setFirstName(profile.first_name || "");
        setLastName(profile.last_name || "");
        setBio(profile.bio || "");
        setMaxClients(profile.max_clients ?? null);
        setSelectedTags(profile.tags || []);
      }

      setAllRaces((racesResult.data || []) as RaceRow[]);

      const mappedSelectedRaces: RaceRow[] = ((selectedRacesResult.data ||
        []) as CoachCompletedRaceRow[])
        .map((row) => {
          const relatedRace = Array.isArray(row.races) ? row.races[0] : row.races;
          return relatedRace || null;
        })
        .filter((race): race is RaceRow => Boolean(race));

      setSelectedRaces(mappedSelectedRaces);
      setLoading(false);
    }

    loadProfile();
  }, [router, supabase]);

  const filteredRaces = useMemo(() => {
    const selectedIds = new Set(selectedRaces.map((race) => race.id));
    const query = raceSearchTerm.trim().toLowerCase();

    return allRaces
      .filter((race) => !selectedIds.has(race.id))
      .filter((race) => {
        if (!query) return true;

        const haystack = [
          race.name,
          race.terrain_type || "",
          race.climate_type || "",
          race.distance_km ? `${race.distance_km}km` : "",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice(0, 12);
  }, [allRaces, raceSearchTerm, selectedRaces]);

  // Get unique categories from AVAILABLE_TAGS
  const tagsByCategory = useMemo(() => {
    const grouped: Record<string, typeof AVAILABLE_TAGS> = {};
    AVAILABLE_TAGS.forEach((tag) => {
      if (!grouped[tag.category]) {
        grouped[tag.category] = [];
      }
      grouped[tag.category].push(tag);
    });
    return grouped;
  }, []);

  function addRace(race: RaceRow) {
    setSelectedRaces((current) => {
      if (current.some((item) => item.id === race.id)) {
        return current;
      }
      return [...current, race];
    });
    setRaceSearchTerm("");
  }

  function removeRace(raceId: string) {
    setSelectedRaces((current) => current.filter((race) => race.id !== raceId));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId) {
      setErrorMessage("No logged in user found.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setMessage("");

    const computedFullName = [firstName.trim(), lastName.trim()]
      .filter(Boolean)
      .join(" ") || null;

    const profilePayload = {
      user_id: userId,
      full_name: computedFullName,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      bio: bio.trim() || null,
      max_clients: maxClients,
      tags: selectedTags,
    };

    const profileResult = await supabase.from("coach_profiles").upsert(profilePayload);

    if (profileResult.error) {
      setErrorMessage(`Could not save profile: ${profileResult.error.message}`);
      setSaving(false);
      return;
    }

    const deleteRacesResult = await supabase
      .from("coach_completed_races")
      .delete()
      .eq("coach_user_id", userId);

    if (deleteRacesResult.error) {
      setErrorMessage(`Could not update completed races: ${deleteRacesResult.error.message}`);
      setSaving(false);
      return;
    }

    if (selectedRaces.length > 0) {
      const insertRacesPayload = selectedRaces.map((selectedRace) => ({
        coach_user_id: userId,
        race_id: selectedRace.id,
      }));

      const insertRacesResult = await supabase
        .from("coach_completed_races")
        .insert(insertRacesPayload);

      if (insertRacesResult.error) {
        setErrorMessage(`Could not save completed races: ${insertRacesResult.error.message}`);
        setSaving(false);
        return;
      }
    }

    setMessage("Profile saved.");
    setSaving(false);
  }

  if (loading) {
    return (
      <main style={containerStyle}>
        <div style={cardStyle}>Loading profile...</div>
      </main>
    );
  }

  const tabs = [
    { id: "basic" as const, label: "Basic Info" },
    { id: "experience" as const, label: "Experience & Specialties" },
    { id: "availability" as const, label: "Availability" },
  ];

  return (
    <main style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ textAlign: "center", marginBottom: "24px" }} data-tour="coach-profile-header">Coach Profile</h1>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", borderBottom: "1px solid #ddd", paddingBottom: "12px" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 16px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? "#111" : "#666",
                borderBottom: activeTab === tab.id ? "2px solid #111" : "none",
                marginBottom: "-12px",
                paddingBottom: "20px",
                transition: "all 0.2s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Basic Info Tab */}
          {activeTab === "basic" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label htmlFor="first-name" style={labelStyle}>
                    First name
                  </label>
                  <input
                    id="first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="last-name" style={labelStyle}>
                    Last name
                  </label>
                  <input
                    id="last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <label htmlFor="bio" style={labelStyle}>
                Bio
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={5}
                style={textareaStyle}
              />

              <label htmlFor="race-search" style={labelStyle}>
                Races you've completed
              </label>
              <input
                id="race-search"
                value={raceSearchTerm}
                onChange={(e) => setRaceSearchTerm(e.target.value)}
                placeholder="Search races by name, terrain, climate..."
                style={inputStyle}
              />

              {filteredRaces.length > 0 ? (
                <div style={searchResultsStyle}>
                  {filteredRaces.map((raceItem) => (
                    <button
                      key={raceItem.id}
                      type="button"
                      onClick={() => addRace(raceItem)}
                      style={searchResultItemStyle}
                    >
                      <div style={{ fontWeight: 600 }}>{raceItem.name}</div>
                      <div style={metaTextStyle}>
                        {[
                          raceItem.distance_km ? `${raceItem.distance_km}km` : "",
                          raceItem.terrain_type,
                          raceItem.climate_type,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={helperTextStyle}>
                  {raceSearchTerm.trim() ? "No matching races found." : "Start typing to search races."}
                </p>
              )}

              <div style={selectedSectionStyle}>
                <div style={{ fontWeight: 600, marginBottom: "10px" }}>Selected races</div>

                {selectedRaces.length === 0 ? (
                  <p style={helperTextStyle}>No races selected yet.</p>
                ) : (
                  <div style={chipContainerStyle}>
                    {selectedRaces.map((raceItem) => (
                      <div key={raceItem.id} style={chipStyle}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{raceItem.name}</div>
                          <div style={chipMetaStyle}>
                            {[
                              raceItem.distance_km ? `${raceItem.distance_km}km` : "",
                              raceItem.terrain_type,
                              raceItem.climate_type,
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeRace(raceItem.id)}
                          style={removeButtonStyle}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </>
          )}

          {/* Experience & Specialties Tab */}
          {activeTab === "experience" && (
            <div style={{ marginBottom: "24px" }}>
              <p style={helperTextStyle}>
                Select tags that describe your experience, challenges, or specialties. Athletes will see these when reviewing your profile.
              </p>
              {Object.entries(tagsByCategory).map(([category, tags]) => (
                <div key={category} style={{ marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {category}
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                    {tags.map((tag) => (
                      <label
                        key={tag.value}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "10px 12px",
                          border: selectedTags.includes(tag.value) ? "2px solid #111" : "1px solid #ddd",
                          borderRadius: "8px",
                          background: selectedTags.includes(tag.value) ? "#f0f0f0" : "#fff",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTags.includes(tag.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTags([...selectedTags, tag.value]);
                            } else {
                              setSelectedTags(selectedTags.filter((t) => t !== tag.value));
                            }
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        <span style={{ fontSize: "14px" }}>{tag.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Availability Tab */}
          {activeTab === "availability" && (
            <>
              <label htmlFor="max-clients" style={labelStyle}>
                Maximum number of clients
              </label>
              <input
                id="max-clients"
                type="number"
                min="1"
                value={maxClients ?? ""}
                onChange={(e) => setMaxClients(e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Leave blank for unlimited"
                style={inputStyle}
              />
              <p style={helperTextStyle}>
                Set the maximum number of athletes you're willing to coach at the same time. Leave blank if you have no limit.
              </p>
            </>
          )}

          {errorMessage ? (
            <p style={{ color: "#b00020", marginBottom: "16px" }}>{errorMessage}</p>
          ) : null}

          {message ? (
            <p style={{ color: "#0a7f3f", marginBottom: "16px" }}>{message}</p>
          ) : null}

          <button type="submit" disabled={saving} style={submitButtonStyle}>
            {saving ? "Saving..." : "Save profile"}
          </button>
        </form>
      </div>
    </main>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "#f5f5f5",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "760px",
  background: "#ffffff",
  padding: "32px",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "8px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  marginBottom: "16px",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  marginBottom: "16px",
  resize: "vertical",
};

const searchResultsStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: "8px",
  overflow: "hidden",
  marginBottom: "16px",
  background: "#fff",
};

const searchResultItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "12px",
  border: "none",
  borderBottom: "1px solid #eee",
  background: "#fff",
  cursor: "pointer",
};

const metaTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#666",
  marginTop: "4px",
};

const helperTextStyle: React.CSSProperties = {
  marginTop: "-4px",
  marginBottom: "16px",
  color: "#666",
  fontSize: "13px",
};

const selectedSectionStyle: React.CSSProperties = {
  marginBottom: "20px",
};

const chipContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const chipStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "12px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  background: "#fafafa",
};

const chipMetaStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#666",
  marginTop: "4px",
};

const removeButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: "6px",
  padding: "8px 12px",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  flexShrink: 0,
};

const submitButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  border: "none",
  borderRadius: "8px",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};