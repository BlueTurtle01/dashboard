"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type GeneratedWeek = {
  weekNumber: number;
  focus: string;
  notes: string;
};

type DisciplineOption = {
  value: string;
  label: string;
};

type StartingFitnessOption = {
  value: string;
  label: string;
};

type RaceGoalOption = {
  value: string;
  label: string;
};

const disciplineOptions: DisciplineOption[] = [
  { value: "road", label: "Road" },
  { value: "trail", label: "Trail" },
  { value: "ultra", label: "Ultra" },
  { value: "general", label: "General" },
  { value: "desert", label: "Desert" },
];

const startingFitnessOptions: StartingFitnessOption[] = [
  { value: "beginner", label: "Beginner" },
  { value: "novice", label: "Novice" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const raceGoalOptions: RaceGoalOption[] = [
  { value: "finish", label: "Finish" },
  { value: "finish_strong", label: "Finish Strong" },
  { value: "complete_comfortably", label: "Complete Comfortably" },
  { value: "pb", label: "PB" },
  { value: "place_highly", label: "Place Highly" },
  { value: "win_age_category", label: "Win Age Category" },
  { value: "win_overall", label: "Win Overall" },
  { value: "experience", label: "Experience" },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getWeekNotes(focus: string): string {
  switch (focus) {
    case "Base":
      return "Build consistency, aerobic support, and sustainable training habits.";
    case "Build":
      return "Increase training demand gradually while keeping the athlete in control.";
    case "Volume":
      return "Emphasise total workload and endurance durability.";
    case "Intensity":
      return "Introduce or increase harder efforts without losing overall structure.";
    case "Peak":
      return "Sharpen event-specific readiness and key-session quality.";
    case "Deload":
      return "Reduce fatigue and absorb prior training before building again.";
    case "Taper":
      return "Reduce load, maintain sharpness, and arrive fresh for the event.";
    default:
      return "";
  }
}

function getCycleForPlanSection(currentWeek: number, nonTaperWeeks: number): string[] {
  const earlyCutoff = Math.ceil(nonTaperWeeks / 3);
  const middleCutoff = Math.ceil((nonTaperWeeks * 2) / 3);

  if (currentWeek <= earlyCutoff) {
    return ["Base", "Build", "Volume", "Deload"];
  }

  if (currentWeek <= middleCutoff) {
    return ["Build", "Volume", "Intensity", "Deload"];
  }

  return ["Volume", "Intensity", "Peak", "Deload"];
}

function generateWeeks(totalWeeks: number): GeneratedWeek[] {
  if (!Number.isFinite(totalWeeks) || totalWeeks < 4) {
    return [];
  }

  const taperWeeks = 2;
  const nonTaperWeeks = totalWeeks - taperWeeks;
  const weeks: GeneratedWeek[] = [];

  for (let week = 1; week <= nonTaperWeeks; week += 1) {
    const cycle = getCycleForPlanSection(week, nonTaperWeeks);
    const focus = cycle[(week - 1) % cycle.length];

    weeks.push({
      weekNumber: week,
      focus,
      notes: getWeekNotes(focus),
    });
  }

  weeks.push(
    {
      weekNumber: totalWeeks - 1,
      focus: "Taper",
      notes: getWeekNotes("Taper"),
    },
    {
      weekNumber: totalWeeks,
      focus: "Taper",
      notes: getWeekNotes("Taper"),
    }
  );

  return weeks;
}

export default function CreateProgramTemplatePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [discipline, setDiscipline] = useState("ultra");
  const [planLengthWeeks, setPlanLengthWeeks] = useState(16);
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState(5);
  const [startingFitness, setStartingFitness] = useState("novice");
  const [eventGoal, setEventGoal] = useState("finish");

  const [minWeeklyTrainingHours, setMinWeeklyTrainingHours] = useState("");
  const [minLongestRecentSessionMinutes, setMinLongestRecentSessionMinutes] = useState("");
  const [minTrainingConsistencyWeeks, setMinTrainingConsistencyWeeks] = useState("");
  const [minBackToBackDays, setMinBackToBackDays] = useState("");

  const [requiresHills, setRequiresHills] = useState(false);
  const [requiresGym, setRequiresGym] = useState(false);
  const [requiresLoadCarriage, setRequiresLoadCarriage] = useState(false);
  const [requiresHeatAcclimation, setRequiresHeatAcclimation] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);

  const [selectedSuitableRaceGoals, setSelectedSuitableRaceGoals] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setSlug(slugify(name));
  }, [name]);

  const generatedWeeks = useMemo(() => generateWeeks(planLengthWeeks), [planLengthWeeks]);

  function toggleSuitableRaceGoal(goal: string) {
    setSelectedSuitableRaceGoals((prev) =>
      prev.includes(goal) ? prev.filter((item) => item !== goal) : [...prev, goal]
    );
  }

  function parseNullableInteger(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function parseNullableNumeric(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const cleanName = name.trim();
    const cleanSlug = slugify(slug);
    const cleanDescription = description.trim();

    if (!cleanName) {
      setErrorMessage("Please enter a plan name.");
      return;
    }

    if (!cleanSlug) {
      setErrorMessage("Please enter a valid slug.");
      return;
    }

    if (!Number.isInteger(planLengthWeeks) || planLengthWeeks < 4) {
      setErrorMessage("Plan length must be at least 4 weeks.");
      return;
    }

    if (!Number.isInteger(trainingDaysPerWeek) || trainingDaysPerWeek < 1 || trainingDaysPerWeek > 14) {
      setErrorMessage("Training days per week must be between 1 and 14.");
      return;
    }

    if (generatedWeeks.length !== planLengthWeeks) {
      setErrorMessage("Could not generate the weeks for this plan.");
      return;
    }

    const minWeeklyHoursValue = parseNullableNumeric(minWeeklyTrainingHours);
    const minLongestSessionValue = parseNullableInteger(minLongestRecentSessionMinutes);
    const minConsistencyWeeksValue = parseNullableInteger(minTrainingConsistencyWeeks);
    const minBackToBackDaysValue = parseNullableInteger(minBackToBackDays);

    if (minBackToBackDaysValue !== null && (minBackToBackDaysValue < 0 || minBackToBackDaysValue > 14)) {
      setErrorMessage("Minimum back-to-back days must be between 0 and 14.");
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const { data: existingSlug, error: slugCheckError } = await supabase
        .from("program_templates")
        .select("id")
        .eq("slug", cleanSlug)
        .maybeSingle();

      if (slugCheckError) {
        throw slugCheckError;
      }

      if (existingSlug) {
        setErrorMessage("That slug is already in use. Change the plan name or slug.");
        setIsSaving(false);
        return;
      }

      const { data: insertedTemplate, error: templateError } = await supabase
        .from("program_templates")
        .insert({
          name: cleanName,
          slug: cleanSlug,
          description: cleanDescription || null,
          discipline,
          plan_length_weeks: planLengthWeeks,
          training_days_per_week: trainingDaysPerWeek,
          starting_fitness: startingFitness,
          event_goal: eventGoal || null,
          is_active: isActive,
          is_featured: isFeatured,
          min_weekly_training_hours: minWeeklyHoursValue,
          min_longest_recent_session_minutes: minLongestSessionValue,
          min_training_consistency_weeks: minConsistencyWeeksValue,
          min_back_to_back_days: minBackToBackDaysValue,
          requires_hills: requiresHills,
          requires_gym: requiresGym,
          requires_load_carriage: requiresLoadCarriage,
          requires_heat_acclimation: requiresHeatAcclimation,
          suitable_race_goals: selectedSuitableRaceGoals.length > 0 ? selectedSuitableRaceGoals : null,
          created_by_user_id: user?.id ?? null,
          is_custom: true,
        })
        .select("id")
        .single();

      if (templateError) {
        throw templateError;
      }

      const templateId = insertedTemplate.id;

      const weeksToInsert = generatedWeeks.map((week) => ({
        program_template_id: templateId,
        week_number: week.weekNumber,
        focus: week.focus,
        notes: week.notes,
      }));

      const { error: weeksError } = await supabase
        .from("program_template_weeks")
        .insert(weeksToInsert);

      if (weeksError) {
        throw weeksError;
      }

      router.push(`/coach/program-templates/${templateId}/edit`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error creating plan.";
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Create Program Template</h1>
        <p style={styles.subheading}>
          Enter the plan details and the week focuses will be generated automatically.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="name" style={styles.label}>
              Plan Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. 32 Week Desert Ultra Build"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="slug" style={styles.label}>
              Slug
            </label>
            <input
              id="slug"
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="e.g. 32-week-desert-ultra-build"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="description" style={styles.label}>
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
              rows={4}
              style={styles.textarea}
            />
          </div>

          <div style={styles.twoColumn}>
            <div style={styles.field}>
              <label htmlFor="discipline" style={styles.label}>
                Discipline
              </label>
              <select
                id="discipline"
                value={discipline}
                onChange={(event) => setDiscipline(event.target.value)}
                style={styles.input}
              >
                {disciplineOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <label htmlFor="planLengthWeeks" style={styles.label}>
                Number of Weeks
              </label>
              <input
                id="planLengthWeeks"
                type="number"
                min={4}
                step={1}
                value={planLengthWeeks}
                onChange={(event) =>
                  setPlanLengthWeeks(Number.parseInt(event.target.value || "0", 10))
                }
                style={styles.input}
                required
              />
            </div>
          </div>

          <div style={styles.twoColumn}>
            <div style={styles.field}>
              <label htmlFor="trainingDaysPerWeek" style={styles.label}>
                Training Days Per Week
              </label>
              <input
                id="trainingDaysPerWeek"
                type="number"
                min={1}
                max={14}
                step={1}
                value={trainingDaysPerWeek}
                onChange={(event) =>
                  setTrainingDaysPerWeek(Number.parseInt(event.target.value || "0", 10))
                }
                style={styles.input}
                required
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="startingFitness" style={styles.label}>
                Starting Fitness
              </label>
              <select
                id="startingFitness"
                value={startingFitness}
                onChange={(event) => setStartingFitness(event.target.value)}
                style={styles.input}
              >
                {startingFitnessOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.field}>
            <label htmlFor="eventGoal" style={styles.label}>
              Event Goal
            </label>
            <select
              id="eventGoal"
              value={eventGoal}
              onChange={(event) => setEventGoal(event.target.value)}
              style={styles.input}
            >
              {raceGoalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.sectionTitle}>Minimum Entry Requirements</div>

          <div style={styles.twoColumn}>
            <div style={styles.field}>
              <label htmlFor="minWeeklyTrainingHours" style={styles.label}>
                Min Weekly Training Hours
              </label>
              <input
                id="minWeeklyTrainingHours"
                type="number"
                min={0}
                step={0.1}
                value={minWeeklyTrainingHours}
                onChange={(event) => setMinWeeklyTrainingHours(event.target.value)}
                style={styles.input}
                placeholder="e.g. 6.5"
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="minLongestRecentSessionMinutes" style={styles.label}>
                Min Longest Recent Session (mins)
              </label>
              <input
                id="minLongestRecentSessionMinutes"
                type="number"
                min={0}
                step={1}
                value={minLongestRecentSessionMinutes}
                onChange={(event) => setMinLongestRecentSessionMinutes(event.target.value)}
                style={styles.input}
                placeholder="e.g. 120"
              />
            </div>
          </div>

          <div style={styles.twoColumn}>
            <div style={styles.field}>
              <label htmlFor="minTrainingConsistencyWeeks" style={styles.label}>
                Min Training Consistency Weeks
              </label>
              <input
                id="minTrainingConsistencyWeeks"
                type="number"
                min={0}
                step={1}
                value={minTrainingConsistencyWeeks}
                onChange={(event) => setMinTrainingConsistencyWeeks(event.target.value)}
                style={styles.input}
                placeholder="e.g. 8"
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="minBackToBackDays" style={styles.label}>
                Min Back-to-Back Days
              </label>
              <input
                id="minBackToBackDays"
                type="number"
                min={0}
                max={14}
                step={1}
                value={minBackToBackDays}
                onChange={(event) => setMinBackToBackDays(event.target.value)}
                style={styles.input}
                placeholder="e.g. 2"
              />
            </div>
          </div>

          <div style={styles.sectionTitle}>Requirements</div>

          <div style={styles.checkboxGrid}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={requiresHills}
                onChange={(event) => setRequiresHills(event.target.checked)}
              />
              Requires Hills
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={requiresGym}
                onChange={(event) => setRequiresGym(event.target.checked)}
              />
              Requires Gym
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={requiresLoadCarriage}
                onChange={(event) => setRequiresLoadCarriage(event.target.checked)}
              />
              Requires Load Carriage
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={requiresHeatAcclimation}
                onChange={(event) => setRequiresHeatAcclimation(event.target.checked)}
              />
              Requires Heat Acclimation
            </label>
          </div>

          <div style={styles.sectionTitle}>Suitable Race Goals</div>

          <div style={styles.checkboxGrid}>
            {raceGoalOptions.map((option) => (
              <label key={option.value} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedSuitableRaceGoals.includes(option.value)}
                  onChange={() => toggleSuitableRaceGoal(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>

          <div style={styles.sectionTitle}>Status</div>

          <div style={styles.checkboxGrid}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Active
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
              />
              Featured
            </label>
          </div>

          {errorMessage ? <div style={styles.error}>{errorMessage}</div> : null}

          <div style={styles.buttonRow}>
            <button type="submit" disabled={isSaving} style={styles.button}>
              {isSaving ? "Creating..." : "Create Plan"}
            </button>
          </div>
        </form>
      </div>

      <div style={styles.card}>
        <h2 style={styles.previewHeading}>Generated Week Preview</h2>
        <p style={styles.subheading}>
          Final 2 weeks are taper. Earlier weeks progress from base-focused blocks toward peak-focused blocks.
        </p>

        <div style={styles.previewList}>
          {generatedWeeks.length === 0 ? (
            <div style={styles.emptyState}>Enter at least 4 weeks to generate a plan.</div>
          ) : (
            generatedWeeks.map((week) => (
              <div key={week.weekNumber} style={styles.previewRow}>
                <div style={styles.previewWeekNumber}>Week {week.weekNumber}</div>
                <div style={styles.previewFocus}>{week.focus}</div>
                <div style={styles.previewNotes}>{week.notes}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: "1300px",
    margin: "0 auto",
    padding: "24px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "24px",
  },
  card: {
    background: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 2px 12px rgba(0, 0, 0, 0.08)",
  },
  heading: {
    margin: "0 0 8px",
    fontSize: "28px",
    textAlign: "center",
  },
  previewHeading: {
    margin: "0 0 8px",
    fontSize: "22px",
    textAlign: "center",
  },
  subheading: {
    margin: "0 0 20px",
    color: "#555",
    textAlign: "center",
    lineHeight: 1.5,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  twoColumn: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: 700,
    marginTop: "8px",
  },
  label: {
    fontWeight: 600,
  },
  input: {
    padding: "12px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    fontSize: "16px",
  },
  textarea: {
    padding: "12px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    fontSize: "16px",
    resize: "vertical",
  },
  checkboxGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
  },
  buttonRow: {
    display: "flex",
    justifyContent: "center",
    marginTop: "8px",
  },
  button: {
    padding: "12px 20px",
    border: "none",
    borderRadius: "8px",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "16px",
  },
  error: {
    padding: "12px",
    borderRadius: "8px",
    background: "#fee2e2",
    color: "#991b1b",
  },
  previewList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "900px",
    overflowY: "auto",
    paddingRight: "4px",
  },
  previewRow: {
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  previewWeekNumber: {
    fontWeight: 700,
  },
  previewFocus: {
    fontWeight: 600,
    color: "#1d4ed8",
  },
  previewNotes: {
    color: "#555",
    lineHeight: 1.4,
  },
  emptyState: {
    padding: "16px",
    textAlign: "center",
    color: "#666",
    border: "1px dashed #ccc",
    borderRadius: "8px",
  },
};