import { ActivityLevel, Gender, GoalPace, GoalType } from '@prisma/client';
import { calculateOnboardingTargets } from './onboarding-targets';

describe('calculateOnboardingTargets', () => {
  it('calculates deterministic calorie and protein targets', () => {
    const targets = calculateOnboardingTargets({
      gender: Gender.MALE,
      dateOfBirth: new Date('1998-01-01'),
      heightCm: 188,
      currentWeightKg: 150,
      targetWeightKg: 100,
      goalType: GoalType.LOSE_WEIGHT,
      goalPace: GoalPace.BALANCED,
      activityLevel: ActivityLevel.SEDENTARY,
    });

    expect(targets.calorieTarget).toBeGreaterThanOrEqual(1500);
    expect(targets.proteinTargetGrams).toBe(160);
  });
});
