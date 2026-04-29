import { PlanExercise, PlanSessionType } from "./types";
import { createClient } from "@/lib/supabase/client";

export interface SessionLibraryItem {
  id: string;
  name: string;
  type: PlanSessionType;
  description: string;
  tags: string[];
  duration: string;
  intensity: string;
  isKeySession: boolean;
  exercises: PlanExercise[];
}

type SessionLibraryRow = {
  id: string;
  name: string;
  type: PlanSessionType;
  description: string | null;
  tags: string[] | null;
  duration: string | null;
  intensity: string | null;
  is_key_session: boolean | null;
  session_library_exercises?: SessionLibraryExerciseRow[] | null;
};

type SessionLibraryExerciseRow = {
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

function dedupeTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(tag);
  }

  return result;
}

function mapSessionExerciseRow(row: SessionLibraryExerciseRow): PlanExercise {
  const exerciseData = Array.isArray(row.exercises)
    ? row.exercises[0] ?? null
    : row.exercises;

  const tags = dedupeTags([
    ...(exerciseData?.movement_tags ?? []),
    ...(exerciseData?.primary_muscles ?? []),
  ]);

  return {
    id: exerciseData?.id ?? row.id,
    sessionId: "",
    sortOrder: row.sort_order,
    name: exerciseData?.name ?? "Unknown Exercise",
    description: exerciseData?.description ?? row.notes ?? "",
    tags,
    sets: row.sets ?? null,
    reps: row.reps ?? null,
    durationSeconds: row.duration_seconds ?? null,
    equipment: exerciseData?.equipment ?? [],
  };
}

function mapSessionRow(row: SessionLibraryRow): SessionLibraryItem {
  const exercises = [...(row.session_library_exercises ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapSessionExerciseRow);

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description ?? "",
    tags: dedupeTags(row.tags ?? []),
    duration: row.duration ?? "",
    intensity: row.intensity ?? "",
    isKeySession: Boolean(row.is_key_session),
    exercises,
  };
}

async function loadSessionLibraryFromSupabase(): Promise<SessionLibraryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("session_library")
    .select(`
      id,
      name,
      type,
      description,
      tags,
      duration,
      intensity,
      is_key_session,
      session_library_exercises (
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
    .order("name");

  if (error) {
    throw new Error(`Failed to load session library: ${error.message}`);
  }

  return ((data ?? []) as SessionLibraryRow[]).map(mapSessionRow);
}

export async function searchSessionLibrary(query: string): Promise<SessionLibraryItem[]> {
  const normalised = query.trim().toLowerCase();
  const sessionLibrary = await loadSessionLibraryFromSupabase();

  if (!normalised) {
    return sessionLibrary.slice(0, 8);
  }

  return sessionLibrary
    .filter((item) => {
      const haystack = [item.name, item.type, item.description, ...item.tags]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalised);
    })
    .slice(0, 8);
}

export async function getSessionLibraryItemById(id: string): Promise<SessionLibraryItem | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("session_library")
    .select(`
      id,
      name,
      type,
      description,
      tags,
      duration,
      intensity,
      is_key_session,
      session_library_exercises (
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
    throw new Error(`Failed to load session library item: ${error.message}`);
  }

  return mapSessionRow(data as SessionLibraryRow);
}
