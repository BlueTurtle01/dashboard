import { supabase } from "@/lib/supabase";
import { PlanSessionType } from "./types";

export type GymTemplateExercise = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  sets: number | null;
  reps: number | null;
  durationSeconds?: number | null;
  equipment: string[];
};

export type GymSessionTemplate = {
  id: string;
  name: string;
  type: PlanSessionType;
  description: string;
  tags: string[];
  duration: string;
  intensity: string;
  isKeySession: boolean;
  exercises: GymTemplateExercise[];
  isCustom?: boolean;
  coachUserId?: string | null;
};

type GymSessionTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  duration: string | null;
  intensity: string | null;
  is_key_session: boolean | null;
  is_custom?: boolean | null;
  coach_user_id?: string | null;
  gym_session_template_exercises?: GymSessionTemplateExerciseRow[] | null;
};

type GymSessionTemplateExerciseRow = {
  id: string;
  sort_order: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  notes: string | null;
  exercises:
    | {
        id: string;
        name: string;
        description: string | null;
        movement_tags: string[] | null;
        primary_muscles: string[] | null;
        equipment: string[] | null;
      }
    | {
        id: string;
        name: string;
        description: string | null;
        movement_tags: string[] | null;
        primary_muscles: string[] | null;
        equipment: string[] | null;
      }[]
    | null;
};

function normaliseTag(tag: string) {
  return tag.trim();
}

function dedupeTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawTag of tags) {
    const tag = normaliseTag(rawTag);
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(tag);
  }

  return result;
}

function normaliseTemplate(template: GymSessionTemplate): GymSessionTemplate {
  return {
    ...template,
    type: "Gym",
    description: template.description ?? "",
    duration: template.duration ?? "",
    intensity: template.intensity ?? "",
    tags: dedupeTags(template.tags ?? []),
    exercises: (template.exercises ?? []).map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      description: exercise.description ?? "",
      tags: dedupeTags(exercise.tags ?? []),
      sets: exercise.sets ?? null,
      reps: exercise.reps ?? null,
      durationSeconds: exercise.durationSeconds ?? null,
      equipment: exercise.equipment ?? [],
    })),
  };
}

function normaliseSearchText(value: string) {
  return value.trim().toLowerCase();
}

function buildTemplateSearchText(template: GymSessionTemplate) {
  return [
    template.name,
    template.description,
    template.duration,
    template.intensity,
    ...(template.tags ?? []),
    ...(template.exercises ?? []).flatMap((exercise) => [
      exercise.name,
      exercise.description,
      ...(exercise.tags ?? []),
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

function mapTemplateExerciseRow(row: GymSessionTemplateExerciseRow): GymTemplateExercise {
  const exerciseData = Array.isArray(row.exercises)
    ? row.exercises[0] ?? null
    : row.exercises;

  const tags = dedupeTags([
    ...(exerciseData?.movement_tags ?? []),
    ...(exerciseData?.primary_muscles ?? []),
  ]);

  return {
    id: exerciseData?.id ?? row.id,
    name: exerciseData?.name ?? "Unknown Exercise",
    description: exerciseData?.description ?? row.notes ?? "",
    tags,
    sets: row.sets ?? null,
    reps: row.reps ?? null,
    durationSeconds: row.duration_seconds ?? null,
    equipment: exerciseData?.equipment ?? [],
  };
}

function mapTemplateRow(row: GymSessionTemplateRow): GymSessionTemplate {
  const exercises = [...(row.gym_session_template_exercises ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapTemplateExerciseRow);

  return normaliseTemplate({
    id: row.id,
    name: row.name,
    type: "Gym",
    description: row.description ?? "",
    tags: dedupeTags(row.tags ?? []),
    duration: row.duration ?? "",
    intensity: row.intensity ?? "",
    isKeySession: Boolean(row.is_key_session),
    isCustom: Boolean(row.is_custom),
    coachUserId: row.coach_user_id ?? null,
    exercises,
  });
}

async function getCurrentCoachUserId(): Promise<string | null> {
  return "bff5270a-cdc6-4bc4-a008-3530259d57e6";
}

async function loadGymSessionTemplatesFromSupabase(): Promise<GymSessionTemplate[]> {
  const { data, error } = await supabase
    .from("gym_session_templates")
    .select(`
      id,
      name,
      description,
      tags,
      duration,
      intensity,
      is_key_session,
      is_custom,
      coach_user_id,
      gym_session_template_exercises (
        id,
        sort_order,
        sets,
        reps,
        duration_seconds,
        notes,
        exercises (
          id,
          name,
          description,
          movement_tags,
          primary_muscles,
          equipment
        )
      )
    `)
    .eq("is_custom", false)
    .order("name");

  if (error) {
    throw new Error(`Failed to load gym session templates: ${error.message}`);
  }

  return ((data ?? []) as GymSessionTemplateRow[]).map(mapTemplateRow);
}

export function parseTemplateTags(value: string) {
  return dedupeTags(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function formatTemplateTags(tags: string[]) {
  return dedupeTags(tags ?? []).join(", ");
}

export async function loadCustomGymSessionTemplates(): Promise<GymSessionTemplate[]> {
  const coachUserId = await getCurrentCoachUserId();

  if (!coachUserId) {
    return [];
  }

  const { data, error } = await supabase
    .from("gym_session_templates")
    .select(`
      id,
      name,
      description,
      tags,
      duration,
      intensity,
      is_key_session,
      is_custom,
      coach_user_id,
      gym_session_template_exercises (
        id,
        sort_order,
        sets,
        reps,
        duration_seconds,
        notes,
        exercises (
          id,
          name,
          description,
          movement_tags,
          primary_muscles,
          equipment
        )
      )
    `)
    .eq("is_custom", true)
    .eq("coach_user_id", coachUserId)
    .order("name");

  if (error) {
    throw new Error(`Failed to load custom gym session templates: ${error.message}`);
  }

  return ((data ?? []) as GymSessionTemplateRow[]).map(mapTemplateRow);
}

export async function getDefaultGymSessionTemplates(): Promise<GymSessionTemplate[]> {
  return loadGymSessionTemplatesFromSupabase();
}

export async function getAllGymSessionTemplates(): Promise<GymSessionTemplate[]> {
  const [defaultTemplates, customTemplates] = await Promise.all([
    loadGymSessionTemplatesFromSupabase(),
    loadCustomGymSessionTemplates(),
  ]);

  return [...defaultTemplates, ...customTemplates];
}

export async function searchGymSessionTemplates(query: string): Promise<GymSessionTemplate[]> {
  const q = normaliseSearchText(query);
  const templates = await getAllGymSessionTemplates();

  if (!q) {
    return templates;
  }

  return templates.filter((template) => buildTemplateSearchText(template).includes(q));
}

export async function getGymSessionTemplateById(id: string): Promise<GymSessionTemplate | null> {
  const { data, error } = await supabase
    .from("gym_session_templates")
    .select(`
      id,
      name,
      description,
      tags,
      duration,
      intensity,
      is_key_session,
      is_custom,
      coach_user_id,
      gym_session_template_exercises (
        id,
        sort_order,
        sets,
        reps,
        duration_seconds,
        notes,
        exercises (
          id,
          name,
          description,
          movement_tags,
          primary_muscles,
          equipment
        )
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }

    throw new Error(`Failed to load gym session template: ${error.message}`);
  }

  return mapTemplateRow(data as GymSessionTemplateRow);
}

export function buildGymSessionTemplateId(name: string) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "gym-template";

  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createCustomGymSessionTemplate(template: GymSessionTemplate) {
  const coachUserId = await getCurrentCoachUserId();

  if (!coachUserId) {
    throw new Error("No logged in coach found.");
  }

  const nextTemplate = normaliseTemplate({
    ...template,
    isCustom: true,
    coachUserId,
  });

  const { error: templateError } = await supabase.from("gym_session_templates").upsert(
    {
      id: nextTemplate.id,
      name: nextTemplate.name,
      description: nextTemplate.description,
      tags: nextTemplate.tags,
      duration: nextTemplate.duration,
      intensity: nextTemplate.intensity,
      is_key_session: nextTemplate.isKeySession,
      is_custom: true,
      coach_user_id: coachUserId,
    },
    { onConflict: "id" }
  );

  if (templateError) {
    throw new Error(`Failed to save gym session template: ${templateError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("gym_session_template_exercises")
    .delete()
    .eq("template_id", nextTemplate.id);

  if (deleteError) {
    throw new Error(
      `Failed to clear gym session template exercises: ${deleteError.message}`
    );
  }

  if (nextTemplate.exercises.length > 0) {
    const exerciseRows = nextTemplate.exercises.map((exercise, index) => ({
      template_id: nextTemplate.id,
      exercise_id: exercise.id,
      sort_order: index + 1,
      sets: exercise.sets ?? null,
      reps: exercise.reps ?? null,
      duration_seconds: exercise.durationSeconds ?? null,
      notes: exercise.description ?? null,
    }));

    const { error: insertError } = await supabase
      .from("gym_session_template_exercises")
      .insert(exerciseRows);

    if (insertError) {
      throw new Error(
        `Failed to save gym session template exercises: ${insertError.message}`
      );
    }
  }

  return nextTemplate;
}

export async function updateCustomGymSessionTemplate(template: GymSessionTemplate) {
  return createCustomGymSessionTemplate({
    ...template,
    isCustom: true,
  });
}

export async function deleteCustomGymSessionTemplate(templateId: string) {
  const coachUserId = await getCurrentCoachUserId();

  if (!coachUserId) {
    throw new Error("No logged in coach found.");
  }

  const { error } = await supabase
    .from("gym_session_templates")
    .delete()
    .eq("id", templateId)
    .eq("coach_user_id", coachUserId);

  if (error) {
    throw new Error(`Failed to delete gym session template: ${error.message}`);
  }
}