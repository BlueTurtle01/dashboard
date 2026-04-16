import { getExercises } from '@/lib/exercises'

export default async function CoachExercisesPage() {
  const exercises = await getExercises()

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