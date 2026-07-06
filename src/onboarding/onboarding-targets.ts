import { ActivityLevel, Gender, GoalPace, GoalType } from '@prisma/client';

export interface TargetCalculationInput {
  gender: Gender;
  dateOfBirth: Date;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  goalType: GoalType;
  goalPace: GoalPace;
  activityLevel: ActivityLevel;
}

export interface TargetCalculationResult {
  calorieTarget: number;
  proteinTargetGrams: number;
}

const activityMultipliers: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
};

const paceAdjustments: Record<GoalPace, number> = {
  SLOW: 250,
  BALANCED: 500,
  AGGRESSIVE: 750,
};

export function calculateOnboardingTargets(
  input: TargetCalculationInput,
): TargetCalculationResult {
  const age = calculateAge(input.dateOfBirth);
  const sexAdjustment = input.gender === Gender.FEMALE ? -161 : 5;
  // Mifflin-St Jeor BMR with a neutral male adjustment for OTHER/PREFER_NOT_TO_SAY.
  const bmr =
    10 * input.currentWeightKg +
    6.25 * input.heightCm -
    5 * age +
    sexAdjustment;
  const maintenance = bmr * activityMultipliers[input.activityLevel];
  const adjustment = paceAdjustments[input.goalPace];
  const calorieTarget = clampCalories(
    input.goalType === GoalType.LOSE_WEIGHT
      ? maintenance - adjustment
      : input.goalType === GoalType.GAIN_WEIGHT
        ? maintenance + adjustment
        : maintenance,
    input.gender,
  );
  const proteinBasisKg =
    input.goalType === GoalType.LOSE_WEIGHT
      ? Math.min(input.currentWeightKg, input.targetWeightKg)
      : input.currentWeightKg;
  const proteinTargetGrams = clamp(Math.round(proteinBasisKg * 1.6), 60, 220);

  return {
    calorieTarget: Math.round(calorieTarget / 10) * 10,
    proteinTargetGrams,
  };
}

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - dateOfBirth.getUTCMonth();
  const dayDelta = today.getUTCDate() - dateOfBirth.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return clamp(age, 13, 100);
}

function clampCalories(calories: number, gender: Gender): number {
  const minimum = gender === Gender.MALE ? 1500 : 1200;

  return clamp(calories, minimum, 4500);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
