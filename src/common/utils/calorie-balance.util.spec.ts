import {
  calculateCalorieDeficitKcal,
  projectFourWeekWeightChangeKg,
} from './calorie-balance.util';

describe('calculateCalorieDeficitKcal', () => {
  it('computes deficit = TDEE + exercise burned - consumed (positive = deficit)', () => {
    expect(
      calculateCalorieDeficitKcal({
        tdeeKcal: 2300,
        caloriesConsumed: 1800,
        exerciseCaloriesBurned: 250,
      }),
    ).toBe(750);
  });

  it('goes negative for a surplus day', () => {
    expect(
      calculateCalorieDeficitKcal({
        tdeeKcal: 2300,
        caloriesConsumed: 2900,
        exerciseCaloriesBurned: 0,
      }),
    ).toBe(-600);
  });

  it('returns null when TDEE is unknown instead of guessing', () => {
    expect(
      calculateCalorieDeficitKcal({
        tdeeKcal: null,
        caloriesConsumed: 1800,
        exerciseCaloriesBurned: 250,
      }),
    ).toBeNull();
  });
});

describe('projectFourWeekWeightChangeKg', () => {
  it('uses the standard ~7700 kcal/kg conversion over 28 days', () => {
    // 500 kcal/day x 28 days / 7700 = 1.818... -> 1.8 kg.
    expect(projectFourWeekWeightChangeKg(500)).toBe(1.8);
  });

  it('projects a gain (negative) for an average surplus', () => {
    expect(projectFourWeekWeightChangeKg(-275)).toBe(-1);
  });

  it('projects zero for a maintenance average', () => {
    expect(projectFourWeekWeightChangeKg(0)).toBe(0);
  });
});
