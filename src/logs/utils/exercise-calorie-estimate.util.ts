import { ExerciseType } from '@prisma/client';

// MET (metabolic equivalent) values from the Compendium of Physical
// Activities, using a representative moderate intensity per exercise type
// since we don't collect perceived effort/pace.
export const exerciseMetValues: Record<ExerciseType, number> = {
  WALKING: 3.5,
  RUNNING: 9.8,
  CYCLING: 7.5,
  STRENGTH: 5.0,
  CARDIO: 7.0,
  SPORTS: 7.0,
  STEPS: 3.5,
  OTHER: 4.0,
};

export interface EstimateExerciseCaloriesInput {
  exerciseType: ExerciseType;
  durationMinutes: number;
  weightKg: number;
}

// kcal = MET x weight(kg) x duration(hours) - the standard MET formula.
export function estimateExerciseCaloriesBurned(
  input: EstimateExerciseCaloriesInput,
): number {
  const met = exerciseMetValues[input.exerciseType];
  const durationHours = input.durationMinutes / 60;

  return Math.round(met * input.weightKg * durationHours);
}
