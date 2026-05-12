import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SavePayload = {
  sourceTemplateId?: string;
  newTemplateName?: string;
  form?: {
    description?: string;
    discipline?: string;
    planLengthWeeks?: string;
    trainingDaysPerWeek?: string;
    startingFitness?: string;
    eventGoal?: string;
    isFeatured?: boolean;
    isActive?: boolean;
    minWeeklyTrainingHours?: string;
    minLongestRecentSessionMinutes?: string;
    minTrainingConsistencyWeeks?: string;
    minBackToBackDays?: string;
    requiresHills?: boolean;
    requiresGym?: boolean;
    requiresLoadCarriage?: boolean;
    requiresHeatAcclimation?: boolean;
    suitableRaceGoals?: string;
    weeks?: Array<{
      weekNumber?: number;
      focus?: string;
      notes?: string;
      sessions?: Array<{
        dayLabel?: string;
        sortOrder?: number;
        type?: string;
        name?: string;
        description?: string;
        duration?: string;
        durationMinutes?: string | number;
        intensity?: string;
        isKeySession?: boolean;
        sessionLibraryId?: string;
        runTimeType?: string;
        runStartTime?: string;
        isTimeStrict?: boolean;
        dayNumber?: string;
        exercises?: Array<{
          exerciseId?: string;
          sets?: string;
          reps?: string;
          durationSeconds?: string;
          notes?: string;
        }>;
      }>;
    }>;
  };
};

function parseNullableInteger(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as SavePayload;
  const sourceTemplateId = body.sourceTemplateId?.trim();
  const newTemplateName = body.newTemplateName?.trim();
  const form = body.form;

  if (!sourceTemplateId || !newTemplateName || !form) {
    return NextResponse.json({ error: "Missing required save data." }, { status: 400 });
  }

  const { data: clonedTemplateId, error: cloneError } = await supabase.rpc("clone_program_template", {
    p_source_template_id: sourceTemplateId,
    p_new_name: newTemplateName,
    p_new_slug: null,
  });

  if (cloneError || !clonedTemplateId) {
    return NextResponse.json(
      { error: cloneError?.message || "Could not clone the program template." },
      { status: 500 },
    );
  }

  const updatePayload = {
    name: newTemplateName,
    description: form.description?.trim() || null,
    discipline: form.discipline?.trim() || "general",
    plan_length_weeks: parseNullableInteger(form.planLengthWeeks) ?? Math.max(1, form.weeks?.length ?? 0),
    training_days_per_week: parseNullableInteger(form.trainingDaysPerWeek) ?? 0,
    starting_fitness: form.startingFitness?.trim() || "general",
    event_goal: form.eventGoal?.trim() || null,
    is_featured: Boolean(form.isFeatured),
    is_active: Boolean(form.isActive),
    min_weekly_training_hours: parseNullableInteger(form.minWeeklyTrainingHours),
    min_longest_recent_session_minutes: parseNullableInteger(form.minLongestRecentSessionMinutes),
    min_training_consistency_weeks: parseNullableInteger(form.minTrainingConsistencyWeeks),
    min_back_to_back_days: parseNullableInteger(form.minBackToBackDays),
    requires_hills: Boolean(form.requiresHills),
    requires_gym: Boolean(form.requiresGym),
    requires_load_carriage: Boolean(form.requiresLoadCarriage),
    requires_heat_acclimation: Boolean(form.requiresHeatAcclimation),
    suitable_race_goals: (form.suitableRaceGoals ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    is_custom: true,
    created_by_user_id: user.id,
  };

  const { error: updateTemplateError } = await supabase
    .from("program_templates")
    .update(updatePayload)
    .eq("id", clonedTemplateId);

  if (updateTemplateError) {
    return NextResponse.json(
      { error: updateTemplateError.message || "The template was cloned, but the new details could not be saved." },
      { status: 500 },
    );
  }

  const { error: deleteWeeksError } = await supabase
    .from("program_template_weeks")
    .delete()
    .eq("program_template_id", clonedTemplateId);

  if (deleteWeeksError) {
    return NextResponse.json({ error: deleteWeeksError.message }, { status: 500 });
  }

  const sortedWeeks = (form.weeks ?? [])
    .slice()
    .sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0))
    .map((week) => ({
      weekNumber: week.weekNumber ?? 1,
      focus: week.focus?.trim() || null,
      notes: week.notes?.trim() || null,
      sessions: (week.sessions ?? []).slice().sort((a, b) => {
        const dayA = Number.parseInt(a.dayNumber || "0", 10) || 0;
        const dayB = Number.parseInt(b.dayNumber || "0", 10) || 0;
        if (dayA !== dayB) return dayA - dayB;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }),
    }));

  for (const week of sortedWeeks) {
    const { data: insertedWeek, error: insertWeekError } = await supabase
      .from("program_template_weeks")
      .insert({
        program_template_id: clonedTemplateId,
        week_number: week.weekNumber,
        focus: week.focus,
        notes: week.notes,
      })
      .select("id")
      .single();

    if (insertWeekError || !insertedWeek) {
      return NextResponse.json(
        { error: insertWeekError?.message || `Could not save week ${week.weekNumber}.` },
        { status: 500 },
      );
    }

    for (const session of week.sessions) {
      const sessionSortOrder = Number.isFinite(session.sortOrder) ? Number(session.sortOrder) : 1;
      const parsedDayNumber = parseNullableInteger(session.dayNumber);

      const { data: insertedSession, error: insertSessionError } = await supabase
        .from("program_template_sessions")
        .insert({
          program_template_week_id: insertedWeek.id,
          day_label: session.dayLabel?.trim() || `Day ${parsedDayNumber || sessionSortOrder}`,
          sort_order: sessionSortOrder,
          type: session.type?.trim() || "Easy",
          name: session.name?.trim() || `Week ${week.weekNumber} Session ${sessionSortOrder}`,
          description: session.description?.trim() || null,
          duration: null,
          duration_minutes: parseNullableInteger(String(session.durationMinutes ?? session.duration ?? "")),
          intensity: session.intensity?.trim() || null,
          is_key_session: Boolean(session.isKeySession),
          session_library_id: session.sessionLibraryId?.trim() || null,
          run_time_type: session.runTimeType?.trim() || "any",
          run_start_time: session.runStartTime?.trim() || null,
          is_time_strict: Boolean(session.isTimeStrict),
          week_number: week.weekNumber,
          day_number: parsedDayNumber,
        })
        .select("id")
        .single();

      if (insertSessionError || !insertedSession) {
        return NextResponse.json(
          { error: insertSessionError?.message || `Could not save a session in week ${week.weekNumber}.` },
          { status: 500 },
        );
      }

      const exerciseRows = (session.exercises ?? [])
        .filter((exercise) => (exercise.exerciseId ?? "").trim())
        .map((exercise, index) => ({
          program_template_session_id: insertedSession.id,
          exercise_id: exercise.exerciseId!.trim(),
          sort_order: index + 1,
          sets: parseNullableInteger(exercise.sets),
          reps: parseNullableInteger(exercise.reps),
          duration_seconds: parseNullableInteger(exercise.durationSeconds),
          notes: exercise.notes?.trim() || null,
        }));

      if (exerciseRows.length > 0) {
        const { error: insertExercisesError } = await supabase
          .from("program_template_session_exercises")
          .insert(exerciseRows);

        if (insertExercisesError) {
          return NextResponse.json(
            { error: insertExercisesError.message || "Could not save session exercises." },
            { status: 500 },
          );
        }
      }
    }
  }

  return NextResponse.json({ success: true, templateId: clonedTemplateId });
}
