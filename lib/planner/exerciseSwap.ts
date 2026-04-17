import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssembledPlanExercise, AssembledPlanSession } from "./assembleWeekFromTemplate";

export interface SwapContext {
  unavailableEquipment: string[];
  avoidEquipment: string[];
}

export interface SwapCandidate {
  id: string;
  name: string;
  equipment: string[];
  pattern: string | null;
  source: "curated" | "pattern";
  priority: number;
}

/**
 * Find alternative exercises for a given exercise.
 * Returns up to 10 candidates ranked by: curated (by priority) first, then pattern matches.
 * Both groups filtered to exclude exercises with equipment in unavailableEquipment.
 */
export async function findAlternativesForPicker(
  exerciseId: string,
  context: SwapContext,
  supabase: SupabaseClient
): Promise<SwapCandidate[]> {
  if (!exerciseId || context.unavailableEquipment.length === 0) {
    return [];
  }

  // Fetch the source exercise
  const { data: sourceExercise } = await supabase
    .from("exercises")
    .select("id, name, equipment, pattern")
    .eq("id", exerciseId)
    .maybeSingle();

  if (!sourceExercise) return [];

  const candidates: SwapCandidate[] = [];

  // 1. Fetch curated alternatives
  const { data: alternatives } = await supabase
    .from("exercise_alternative_links")
    .select("priority, alternative_exercise_id")
    .eq("exercise_id", exerciseId)
    .order("priority");

  if (alternatives && alternatives.length > 0) {
    const altIds = alternatives.map((alt: any) => alt.alternative_exercise_id);

    const { data: altExercises } = await supabase
      .from("exercises")
      .select("id, name, equipment, pattern")
      .in("id", altIds);

    if (altExercises) {
      for (const alt of altExercises) {
        // Check if this alternative's equipment conflicts with unavailable
        const hasConflict = (alt.equipment || []).some((eq: string) =>
          context.unavailableEquipment.includes(eq)
        );

        if (!hasConflict) {
          const priority = alternatives.find((a: any) => a.alternative_exercise_id === alt.id)?.priority ?? 999;
          candidates.push({
            id: alt.id,
            name: alt.name,
            equipment: alt.equipment || [],
            pattern: alt.pattern,
            source: "curated",
            priority,
          });
        }
      }
    }
  }

  // 2. If we have space, fetch pattern-matched alternatives
  if (sourceExercise.pattern && candidates.length < 10) {
    const { data: patternMatches } = await supabase
      .from("exercises")
      .select("id, name, equipment, pattern")
      .eq("pattern", sourceExercise.pattern as string)
      .neq("id", exerciseId)
      .limit(20);

    if (patternMatches) {
      const curatedIds = new Set(candidates.map((c) => c.id));

      for (const match of patternMatches) {
        if (curatedIds.has(match.id)) continue;

        const hasConflict = (match.equipment || []).some((eq: string) =>
          context.unavailableEquipment.includes(eq)
        );

        if (!hasConflict && candidates.length < 10) {
          candidates.push({
            id: match.id,
            name: match.name,
            equipment: match.equipment || [],
            pattern: match.pattern,
            source: "pattern",
            priority: 999,
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Detect equipment conflicts and annotate exercises that conflict with unavailable equipment.
 * Does not perform swaps — only marks exercises with equipmentConflict flag.
 */
export async function detectConflicts(
  sessions: AssembledPlanSession[],
  unavailableEquipment: string[],
  supabase: SupabaseClient
): Promise<AssembledPlanSession[]> {
  if (unavailableEquipment.length === 0) {
    return sessions;
  }

  return sessions.map((session) => ({
    ...session,
    exercises: session.exercises.map((exercise) => {
      const hasConflict = (exercise.equipment || []).some((eq) =>
        unavailableEquipment.includes(eq)
      );

      return {
        ...exercise,
        equipmentConflict: hasConflict ? true : undefined,
      };
    }),
  }));
}
