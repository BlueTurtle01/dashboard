import { getExerciseLibrary } from '@/lib/planner/exerciseLibrary'

export default async function CoachExercisesPage() {
  const exercises = await getExerciseLibrary()

  return (
    <div style={{ padding: '20px' }}>
      <h1>Exercises</h1>

      <ul>
        {exercises.map((exercise) => (
          <li key={exercise.id}>
            {exercise.name}
          </li>
        ))}
      </ul>
    </div>
  )
}