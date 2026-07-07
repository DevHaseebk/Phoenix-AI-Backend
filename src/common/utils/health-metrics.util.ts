import { ActivityLevel, Gender } from '@prisma/client';

export interface BmrCalculationInput {
  gender: Gender;
  dateOfBirth: Date;
  heightCm: number;
  weightKg: number;
}

export const activityMultipliers: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
};

export function calculateAge(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  const dayDelta = now.getUTCDate() - dateOfBirth.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return clamp(age, 13, 100);
}

// Mifflin-St Jeor BMR with a neutral male adjustment for OTHER/PREFER_NOT_TO_SAY.
export function calculateBmr(
  input: BmrCalculationInput,
  now = new Date(),
): number {
  const age = calculateAge(input.dateOfBirth, now);
  const sexAdjustment = input.gender === Gender.FEMALE ? -161 : 5;

  return 10 * input.weightKg + 6.25 * input.heightCm - 5 * age + sexAdjustment;
}

export function calculateTdee(
  bmr: number,
  activityLevel: ActivityLevel,
): number {
  return bmr * activityMultipliers[activityLevel];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
