import { createClient } from '@/lib/supabase/client'

export interface ExerciseLibraryItem {
  id: string
  name: string
  description: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  movementTags: string[]
  equipment: string[]
  pattern?: string
  sets: number | null
  reps: number | null
  durationSeconds?: number | null
}

type ExerciseRow = {
  id: string
  name: string
  description: string
  primary_muscles: string[]
  secondary_muscles: string[]
  movement_tags: string[]
  equipment: string[]
  pattern: string | null
  sets: number | null
  reps: number | null
  duration_seconds: number | null
}

function mapExerciseRow(row: ExerciseRow): ExerciseLibraryItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    primaryMuscles: row.primary_muscles ?? [],
    secondaryMuscles: row.secondary_muscles ?? [],
    movementTags: row.movement_tags ?? [],
    equipment: row.equipment ?? [],
    pattern: row.pattern ?? undefined,
    sets: row.sets,
    reps: row.reps,
    durationSeconds: row.duration_seconds,
  }
}

function normalise(text: string) {
  return text.trim().toLowerCase()
}

function buildSearchText(item: ExerciseLibraryItem) {
  return [
    item.name,
    item.description,
    ...item.primaryMuscles,
    ...item.secondaryMuscles,
    ...item.movementTags,
    ...item.equipment,
    item.pattern ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

function scoreExercise(item: ExerciseLibraryItem, query: string) {
  const q = normalise(query)
  if (!q) return 0

  let score = 0
  const name = item.name.toLowerCase()
  const description = item.description.toLowerCase()

  if (name === q) score += 100
  if (name.includes(q)) score += 50
  if (item.primaryMuscles.some((x) => normalise(x).includes(q))) score += 40
  if (item.secondaryMuscles.some((x) => normalise(x).includes(q))) score += 25
  if (item.movementTags.some((x) => normalise(x).includes(q))) score += 20
  if (item.equipment.some((x) => normalise(x).includes(q))) score += 10
  if ((item.pattern ?? '').toLowerCase().includes(q)) score += 15
  if (description.includes(q)) score += 8

  return score
}

export async function getExerciseLibrary(): Promise<ExerciseLibraryItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('exercises')
    .select(`
      id,
      name,
      description,
      primary_muscles,
      secondary_muscles,
      movement_tags,
      equipment,
      pattern,
      sets,
      reps,
      duration_seconds
    `)
    .order('name')

  if (error) {
    throw new Error(`Failed to load exercises: ${error.message}`)
  }

  return (data ?? []).map(mapExerciseRow)
}

export async function searchExerciseLibrary(query: string) {
  const exerciseLibrary = await getExerciseLibrary()
  const normalised = normalise(query)

  if (!normalised) {
    return exerciseLibrary.slice(0, 8)
  }

  return exerciseLibrary
    .map((item) => ({
      item,
      score: scoreExercise(item, normalised),
      haystack: buildSearchText(item),
    }))
    .filter(({ score, haystack }) => score > 0 || haystack.includes(normalised))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, 8)
    .map(({ item }) => item)
}

export async function getExerciseLibraryItemById(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('exercises')
    .select(`
      id,
      name,
      description,
      primary_muscles,
      secondary_muscles,
      movement_tags,
      equipment,
      pattern,
      sets,
      reps,
      duration_seconds
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw new Error(`Failed to load exercise: ${error.message}`)
  }

  return mapExerciseRow(data as ExerciseRow)
}