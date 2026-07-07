import { ActivityLevel, Gender, GoalPace, GoalType } from '@prisma/client';
import {
  calculateBmr,
  calculateTdee,
} from '../common/utils/health-metrics.util';

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

const paceAdjustments: Record<GoalPace, number> = {
  SLOW: 250,
  BALANCED: 500,
  AGGRESSIVE: 750,
};

export function calculateOnboardingTargets(
  input: TargetCalculationInput,
): TargetCalculationResult {
  const bmr = calculateBmr({
    gender: input.gender,
    dateOfBirth: input.dateOfBirth,
    heightCm: input.heightCm,
    weightKg: input.currentWeightKg,
  });
  const maintenance = calculateTdee(bmr, input.activityLevel);
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

function clampCalories(calories: number, gender: Gender): number {
  const minimum = gender === Gender.MALE ? 1500 : 1200;

  return clamp(calories, minimum, 4500);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
