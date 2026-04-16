"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type WeekFocus = {
  name: string;
  color: string;
};

type Week = {
  weekNumber: number;
  focus: WeekFocus | null;
};

type Cycle = {
  cycleNumber: number;
  weeks: Week[];
};

type FocusType = {
  id: string;
  name: string;
  color: string;
};

type AthleteProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  selected_event_id: string | null;
};

const TEST_COACH_USER_ID = "bff5270a-cdc6-4bc4-a008-3530259d57e6";

function CreatePlanContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const athleteId = searchParams.get("athleteId") ?? "";

  const [weeks, setWeeks] = useState("");
  const [cycleLength, setCycleLength] = useState("");
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [draggingFocus, setDraggingFocus] = useState<WeekFocus | null>(null);
  const [focusOptions, setFocusOptions] = useState<FocusType[]>([]);
  const [saving, setSaving] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfileRow | null>(null);

  useEffect(() => {
    async function loadFocusTypes() {
      const { data } = await supabase
        .from("week_focus_types")
        .select("id, name, color")
        .order("display_order");

      setFocusOptions(data || []);
    }

    void loadFocusTypes();
  }, []);

  useEffect(() => {
    async function loadAthleteProfile() {
      if (!athleteId) return;

      const { data } = await supabase
        .from("athlete_profiles")
        .select("id, user_id, full_name, selected_event_id")
        .eq("user_id", athleteId)
        .maybeSingle();

      setAthleteProfile(data);
    }

    void loadAthleteProfile();
  }, [athleteId]);

  function handleGenerate() {
    const totalWeeks = parseInt(weeks, 10);
    const cycle = parseInt(cycleLength, 10);

    if (!totalWeeks || !cycle) {
      alert("Enter both values");
      return;
    }

    const firstCycle: Cycle = {
      cycleNumber: 1,
      weeks: Array.from({ length: cycle }, (_, i) => ({
        weekNumber: i + 1,
        focus: null,
      })),
    };

    setCycles([firstCycle]);
  }

  function handleDrop(weekIndex: number) {
    if (!draggingFocus) return;

    const updated = [...cycles];
    updated[0].weeks[weekIndex].focus = { ...draggingFocus };
    setCycles(updated);
  }

  async function saveAndContinue() {
    if (!athleteProfile || cycles.length === 0) return;

    setSaving(true);

    try {
      let coachUserId = TEST_COACH_USER_ID;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        coachUserId = user.id;
      }

      const planJson = {
        cycles,
        totalWeeks: parseInt(weeks, 10),
        cycleLength: parseInt(cycleLength, 10),
      };

      const { data, error } = await supabase
        .from("athlete_plans")
        .insert({
          athlete_user_id: athleteProfile.user_id,
          coach_user_id: coachUserId,
          event_id: athleteProfile.selected_event_id,
          name: "Plan in progress",
          plan_json: planJson,
          is_active: true,
        })
        .select("id")
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      // 🚀 THIS IS THE KEY CHANGE
      router.push(`/coach?athleteId=${athleteId}`);

    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-6 text-zinc-900">
      <h1 className="mb-6 text-2xl font-bold">Create Plan</h1>

      <div className="mb-6 grid max-w-md gap-4">
        <input
          type="number"
          value={weeks}
          onChange={(e) => setWeeks(e.target.value)}
          className="border rounded px-4 py-3"
          placeholder="Total weeks"
        />

        <input
          type="number"
          value={cycleLength}
          onChange={(e) => setCycleLength(e.target.value)}
          className="border rounded px-4 py-3"
          placeholder="Cycle length"
        />

        <button
          onClick={handleGenerate}
          className="bg-black text-white px-4 py-3 rounded"
        >
          Generate Cycle
        </button>
      </div>

      {cycles.length > 0 && (
        <>
          <div className="mb-6 flex gap-2 flex-wrap">
            {focusOptions.map((focus) => (
              <div
                key={focus.id}
                draggable
                onDragStart={() =>
                  setDraggingFocus({
                    name: focus.name,
                    color: focus.color,
                  })
                }
                className="px-3 py-2 rounded-full text-white cursor-grab"
                style={{ background: focus.color }}
              >
                {focus.name}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-3 max-w-xl">
            {cycles[0].weeks.map((week, i) => (
              <div
                key={i}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                className="border p-4 text-center rounded"
                style={{
                  background: week.focus?.color || "#fff",
                  color: week.focus ? "#fff" : "#000",
                }}
              >
                Week {week.weekNumber}
                {week.focus && (
                  <div className="text-xs mt-1">
                    {week.focus.name}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={saveAndContinue}
            className="mt-6 bg-green-700 text-white px-5 py-3 rounded"
          >
            {saving ? "Saving..." : "Save & Continue"}
          </button>
        </>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CreatePlanContent />
    </Suspense>
  );
}