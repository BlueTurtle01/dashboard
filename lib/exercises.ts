import { supabase } from './supabase'

export type Exercise = {
  id: string
  name: string
  description: string | null
  category: string | null
  equipment: string | null
  created_at: string
}

export async function getExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name')

  if (error) {
    throw new Error(`Failed to load exercises: ${error.message}`)
  }

  return data ?? []
}