"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AthleteEvent {
  id: string;
  event_type: "injury" | "holiday";
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "pending" | "acknowledged";
  created_at: string;
}

interface EquipmentOption {
  slug: string;
  name: string;
}

interface HolidayEquipmentEntry {
  start_date: string;
  end_date: string;
  unavailable_equipment: string[];
}

interface TrainingCamp {
  id: string;
  title: string;
  location: string | null;
  start_date: string;
  end_date: string;
  terrain_types: string[];
  climate_types: string[];
  has_pack_carry: boolean;
  back_to_back_sessions: boolean;
  daily_session_cap: number;
  notes: string | null;
  status: "pending" | "acknowledged";
  created_at: string;
}

const TERRAIN_OPTIONS = [
  { value: "sand", label: "Sand / Desert" },
  { value: "mountain", label: "Mountain / Alpine" },
  { value: "trail", label: "Technical Trail" },
  { value: "road", label: "Road / Flat" },
];

const CLIMATE_OPTIONS = [
  { value: "heat", label: "Heat" },
  { value: "altitude", label: "High Altitude" },
  { value: "cold", label: "Cold / Arctic" },
];

export default function LogPage() {
  const [eventType, setEventType] = useState<"injury" | "holiday" | "training_camp">("injury");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [events, setEvents] = useState<AthleteEvent[]>([]);
  const [trainingCamps, setTrainingCamps] = useState<TrainingCamp[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Training camp specific fields
  const [campLocation, setCampLocation] = useState("");
  const [campTerrainTypes, setCampTerrainTypes] = useState<string[]>([]);
  const [campClimateTypes, setCampClimateTypes] = useState<string[]>([]);
  const [campPackCarry, setCampPackCarry] = useState(false);
  const [campBackToBack, setCampBackToBack] = useState(false);
  const [campDailySessionCap, setCampDailySessionCap] = useState(1);
  const [campNotes, setCampNotes] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setError("Unable to authenticate");
          setLoading(false);
          return;
        }

        // Fetch events
        const { data: eventsData, error: queryError } = await supabase
          .from("athlete_events")
          .select("*")
          .eq("athlete_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (queryError) {
          console.error("Failed to fetch events:", queryError);
        }

        setEvents((eventsData || []) as AthleteEvent[]);

        // Fetch equipment options
        const { data: equipData, error: equipError } = await supabase
          .from("equipment_options")
          .select("slug, name")
          .order("name", { ascending: true });

        if (!equipError && equipData && equipData.length > 0) {
          setEquipmentOptions(equipData as EquipmentOption[]);
        } else {
          // Fallback to default equipment options if table is empty
          const defaultEquipment: EquipmentOption[] = [
            { slug: "gym", name: "Gym / Strength Training Equipment" },
            { slug: "bicycle", name: "Bicycle" },
            { slug: "swimming_pool", name: "Swimming Pool" },
            { slug: "treadmill", name: "Treadmill" },
            { slug: "outdoor_running", name: "Outdoor Running Access" },
          ];
          setEquipmentOptions(defaultEquipment);
        }

        // Fetch training camps
        const { data: campsData, error: campsError } = await supabase
          .from("training_camps")
          .select("*")
          .eq("athlete_user_id", user.id)
          .order("start_date", { ascending: false })
          .limit(10);

        if (campsError) {
          console.error("Failed to fetch training camps:", campsError);
        }

        setTrainingCamps((campsData || []) as TrainingCamp[]);

        setLoading(false);
      } catch (err) {
        setError("Failed to load data");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setSubmitError("Title is required");
      return;
    }

    if ((eventType === "holiday" || eventType === "training_camp") && (!startDate || !endDate)) {
      setSubmitError(`Start and end dates are required for ${eventType === "training_camp" ? "training camps" : "holidays"}`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setSubmitError("Unable to authenticate");
        setSubmitting(false);
        return;
      }

      // Handle training camp submission
      if (eventType === "training_camp") {
        const { data: campData, error: campError } = await supabase
          .from("training_camps")
          .insert({
            athlete_user_id: user.id,
            title: title.trim(),
            location: campLocation.trim() || null,
            start_date: startDate,
            end_date: endDate,
            terrain_types: campTerrainTypes,
            climate_types: campClimateTypes,
            has_pack_carry: campPackCarry,
            back_to_back_sessions: campBackToBack,
            daily_session_cap: campDailySessionCap,
            notes: campNotes.trim() || null,
            status: "pending",
          })
          .select();

        if (campError) {
          setSubmitError("Failed to save training camp");
          setSubmitting(false);
          return;
        }

        if (campData && campData[0]) {
          setTrainingCamps([campData[0] as TrainingCamp, ...trainingCamps]);

          // Notify coach about training camp
          const { data: athleteProfile } = await supabase
            .from("athlete_profiles")
            .select("coach_user_id, full_name")
            .eq("user_id", user.id)
            .maybeSingle();

          if (athleteProfile?.coach_user_id) {
            const terrainLabel = campTerrainTypes.join(", ");
            const climateLabel = campClimateTypes.join(", ");
            const attrs = [terrainLabel && `Terrain: ${terrainLabel}`, climateLabel && `Climate: ${climateLabel}`, campPackCarry && "Pack carry training", campBackToBack && "Back-to-back sessions"].filter(Boolean).join(" • ");

            await supabase
              .from("notifications")
              .insert({
                coach_user_id: athleteProfile.coach_user_id,
                athlete_user_id: user.id,
                type: "training_camp",
                title: `${title} - Training Camp Logged`,
                message: `${title} from ${startDate} to ${endDate}${campLocation ? ` (${campLocation})` : ""}. ${attrs}`,
                metadata: {
                  camp_title: title,
                  start_date: startDate,
                  end_date: endDate,
                  location: campLocation,
                  terrain_types: campTerrainTypes,
                  climate_types: campClimateTypes,
                  has_pack_carry: campPackCarry,
                  back_to_back: campBackToBack,
                },
              });
          }
        }

        // Reset camp form
        setTitle("");
        setCampLocation("");
        setStartDate("");
        setEndDate("");
        setCampTerrainTypes([]);
        setCampClimateTypes([]);
        setCampPackCarry(false);
        setCampBackToBack(false);
        setCampDailySessionCap(1);
        setCampNotes("");
      } else {
        // Handle event (injury/holiday) submission - existing logic
        const { data, error: insertError } = await supabase
          .from("athlete_events")
          .insert({
            athlete_user_id: user.id,
            event_type: eventType,
            title: title.trim(),
            description: description.trim() || null,
            start_date: eventType === "holiday" ? startDate : null,
            end_date: eventType === "holiday" ? endDate : null,
            status: "pending",
          })
          .select();

        if (insertError) {
          setSubmitError("Failed to save event");
          setSubmitting(false);
          return;
        }

        if (data && data[0]) {
          // Prepend to the events list
          setEvents([data[0] as AthleteEvent, ...events]);

          // If it's a holiday with equipment unavailability, update athlete_profiles and notify coach
          if (eventType === "holiday" && selectedEquipment.length > 0) {
            const { data: profileData } = await supabase
              .from("athlete_profiles")
              .select("holiday_equipment_unavailable")
              .eq("user_id", user.id)
              .maybeSingle();

            const currentHolidayEquipment = (profileData?.holiday_equipment_unavailable as HolidayEquipmentEntry[]) || [];
            const newEntry: HolidayEquipmentEntry = {
              start_date: startDate,
              end_date: endDate,
              unavailable_equipment: selectedEquipment,
            };

            const updatedHolidayEquipment = [...currentHolidayEquipment, newEntry];

            await supabase
              .from("athlete_profiles")
              .update({ holiday_equipment_unavailable: updatedHolidayEquipment })
              .eq("user_id", user.id);

            // Notify coach about equipment unavailability
            const equipmentNames: Record<string, string> = {
              "gym": "gym",
              "bicycle": "bicycle",
              "swimming_pool": "swimming pool",
            };
            const equipLabels = selectedEquipment.map(eq => equipmentNames[eq] || eq).join(", ");

            const { data: { user: authUser } } = await supabase.auth.getUser();
            const { data: athleteProfile } = await supabase
              .from("athlete_profiles")
              .select("coach_user_id")
              .eq("user_id", user.id)
              .maybeSingle();

            if (athleteProfile?.coach_user_id) {
              await supabase
                .from("notifications")
                .insert({
                  coach_user_id: athleteProfile.coach_user_id,
                  athlete_user_id: user.id,
                  type: "holiday_equipment",
                  title: `${title} - Equipment Unavailable`,
                  message: `${title.trim()} from ${startDate} to ${endDate}. Won't have access to: ${equipLabels}. Plan has been adjusted accordingly.`,
                  metadata: {
                    holiday_title: title,
                    start_date: startDate,
                    end_date: endDate,
                    unavailable_equipment: selectedEquipment,
                  },
                });
            }
          }

          // Reset form
          setTitle("");
          setDescription("");
          setStartDate("");
          setEndDate("");
          setSelectedEquipment([]);
        }
      }

      setSubmitting(false);
    } catch (err) {
      setSubmitError("An error occurred while saving");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Loading…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-red-900">Error</h1>
          <p className="mt-3 text-red-700">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Form Section */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Report an Issue</h1>

          {/* Event Type Toggle */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setEventType("injury")}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                eventType === "injury"
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Report Injury
            </button>
            <button
              onClick={() => setEventType("holiday")}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                eventType === "holiday"
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Holiday Request
            </button>
            <button
              onClick={() => setEventType("training_camp")}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                eventType === "training_camp"
                  ? "bg-violet-600 text-white"
                  : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Training Camp
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Title */}
            <div>
              <label className="text-sm font-semibold text-zinc-700">
                {eventType === "injury" ? "Injury" : eventType === "holiday" ? "Holiday" : "Camp"} Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={eventType === "injury" ? "e.g., Lower back pain" : eventType === "holiday" ? "e.g., Family vacation" : "e.g., Lanzarote Camp"}
                className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm"
              />
            </div>

            {/* Description for Injury/Holiday */}
            {eventType !== "training_camp" && (
            <div>
              <label className="text-sm font-semibold text-zinc-700">Description (optional)</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell your coach more details…"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm"
              />
            </div>
            )}

            {/* Dates for Holiday and Training Camp */}
            {(eventType === "holiday" || eventType === "training_camp") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-zinc-700">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-zinc-700">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                  />
                </div>
              </div>
            </>
            )}

            {/* Training Camp Specific Fields */}
            {eventType === "training_camp" && (
            <>
              <div>
                <label className="text-sm font-semibold text-zinc-700">Location (optional)</label>
                <input
                  type="text"
                  value={campLocation}
                  onChange={(e) => setCampLocation(e.target.value)}
                  placeholder="e.g., Lanzarote, Kenya, Chamonix"
                  className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-zinc-700">Terrain Types</label>
                <div className="mt-3 space-y-2">
                  {TERRAIN_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={campTerrainTypes.includes(option.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCampTerrainTypes([...campTerrainTypes, option.value]);
                          } else {
                            setCampTerrainTypes(campTerrainTypes.filter((t) => t !== option.value));
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm text-zinc-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-zinc-700">Climate Types</label>
                <div className="mt-3 space-y-2">
                  {CLIMATE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={campClimateTypes.includes(option.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCampClimateTypes([...campClimateTypes, option.value]);
                          } else {
                            setCampClimateTypes(campClimateTypes.filter((c) => c !== option.value));
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm text-zinc-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campPackCarry}
                    onChange={(e) => setCampPackCarry(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm font-semibold text-zinc-700">Pack / Load Carry Training</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campBackToBack}
                    onChange={(e) => setCampBackToBack(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm font-semibold text-zinc-700">Back-to-Back Sessions</span>
                </label>
              </div>

              <div>
                <label className="text-sm font-semibold text-zinc-700">Daily Session Cap</label>
                <input
                  type="number"
                  min="1"
                  max="3"
                  value={campDailySessionCap}
                  onChange={(e) => setCampDailySessionCap(Number(e.target.value))}
                  className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-zinc-700">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={campNotes}
                  onChange={(e) => setCampNotes(e.target.value)}
                  placeholder="Any additional details about the camp…"
                  className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                />
              </div>
            </>
            )}

            {/* Dates for Holiday */}
            {eventType === "holiday" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-semibold text-zinc-700">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-zinc-700">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Equipment Unavailability */}
                <div>
                  <label className="text-sm font-semibold text-zinc-700">
                    Equipment you won't have access to
                  </label>
                  <p className="mt-1 text-xs text-zinc-600">
                    Select any equipment you won't have on this holiday (in addition to equipment you already avoid)
                  </p>
                  <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    {equipmentOptions.map((equip) => (
                      <label
                        key={equip.slug}
                        className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 cursor-pointer hover:bg-zinc-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEquipment.includes(equip.slug)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEquipment([...selectedEquipment, equip.slug]);
                            } else {
                              setSelectedEquipment(selectedEquipment.filter((s) => s !== equip.slug));
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-zinc-700">{equip.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {submitError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                eventType === "training_camp"
                  ? "bg-violet-600 hover:bg-violet-700"
                  : "bg-zinc-900 hover:bg-zinc-800"
              }`}
            >
              {submitting ? "Submitting…" : eventType === "training_camp" ? "Log Training Camp" : "Submit Report"}
            </button>
          </form>
        </div>

        {/* Past Events */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Your Reports</h2>

          {events.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">No reports yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {events.map((event) => {
                const isPending = event.status === "pending";
                const isInjury = event.event_type === "injury";

                return (
                  <div
                    key={event.id}
                    className={`rounded-lg p-4 ${
                      isPending
                        ? "border border-amber-200 bg-amber-50"
                        : "border border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-zinc-900">{event.title}</h3>
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${
                            isInjury
                              ? "bg-red-100 text-red-900"
                              : "bg-blue-100 text-blue-900"
                          }`}>
                            {isInjury ? "Injury" : "Holiday"}
                          </span>
                        </div>

                        {event.description && (
                          <p className="mt-1 text-sm text-zinc-600">{event.description}</p>
                        )}

                        {event.start_date && event.end_date && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {event.start_date} to {event.end_date}
                          </p>
                        )}

                        <p className="mt-2 text-xs text-zinc-500">
                          {new Date(event.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <span className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${
                        isPending
                          ? "bg-amber-100 text-amber-900"
                          : "bg-green-100 text-green-900"
                      }`}>
                        {isPending ? "Pending" : "Acknowledged"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Training Camps */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Your Training Camps</h2>

          {trainingCamps.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">No training camps logged yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {trainingCamps.map((camp) => {
                const isPending = camp.status === "pending";

                return (
                  <div
                    key={camp.id}
                    className={`rounded-lg p-4 border ${
                      isPending
                        ? "border-violet-200 bg-violet-50"
                        : "border-violet-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-zinc-900">{camp.title}</h3>
                          <span className="text-xs font-semibold px-2 py-1 rounded bg-violet-100 text-violet-900">
                            Training Camp
                          </span>
                        </div>

                        {camp.location && (
                          <p className="mt-1 text-sm text-zinc-600">{camp.location}</p>
                        )}

                        {camp.start_date && camp.end_date && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {new Date(camp.start_date).toLocaleDateString()} to {new Date(camp.end_date).toLocaleDateString()}
                          </p>
                        )}

                        {/* Terrain Attributes */}
                        {camp.terrain_types.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {camp.terrain_types.map((terrain) => {
                              const label = TERRAIN_OPTIONS.find((t) => t.value === terrain)?.label || terrain;
                              return (
                                <span
                                  key={terrain}
                                  className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-800"
                                >
                                  {label}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Climate Attributes */}
                        {camp.climate_types.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {camp.climate_types.map((climate) => {
                              const label = CLIMATE_OPTIONS.find((c) => c.value === climate)?.label || climate;
                              return (
                                <span
                                  key={climate}
                                  className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-800"
                                >
                                  {label}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Pack Carry & Back-to-Back Icons */}
                        {(camp.has_pack_carry || camp.back_to_back_sessions) && (
                          <div className="mt-2 flex gap-3">
                            {camp.has_pack_carry && (
                              <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-100 px-2 py-1 rounded">
                                <span>🎒</span> Pack carry
                              </span>
                            )}
                            {camp.back_to_back_sessions && (
                              <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-100 px-2 py-1 rounded">
                                <span>📅</span> Back-to-back sessions
                              </span>
                            )}
                          </div>
                        )}

                        {camp.notes && (
                          <p className="mt-2 text-xs text-zinc-500 italic">{camp.notes}</p>
                        )}

                        <p className="mt-2 text-xs text-zinc-400">
                          Logged on {new Date(camp.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <span className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${
                        isPending
                          ? "bg-violet-100 text-violet-900"
                          : "bg-green-100 text-green-900"
                      }`}>
                        {isPending ? "Pending" : "Acknowledged"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
