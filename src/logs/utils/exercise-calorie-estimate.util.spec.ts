import { estimateExerciseCaloriesBurned } from './exercise-calorie-estimate.util';

describe('estimateExerciseCaloriesBurned', () => {
  it('estimates walking calories using the MET formula', () => {
    const result = estimateExerciseCaloriesBurned({
      exerciseType: 'WALKING',
      durationMinutes: 30,
      weightKg: 80,
    });

    // 3.5 * 80 * 0.5 = 140
    expect(result).toBe(140);
  });

  it('estimates running calories higher than walking for the same duration', () => {
    const shared = { durationMinutes: 30, weightKg: 80 } as const;

    const running = estimateExerciseCaloriesBurned({
      ...shared,
      exerciseType: 'RUNNING',
    });
    const walking = estimateExerciseCaloriesBurned({
      ...shared,
      exerciseType: 'WALKING',
    });

    expect(running).toBeGreaterThan(walking);
  });

  it('rounds to the nearest whole calorie', () => {
    const result = estimateExerciseCaloriesBurned({
      exerciseType: 'STRENGTH',
      durationMinutes: 25,
      weightKg: 72.4,
    });

    expect(Number.isInteger(result)).toBe(true);
  });

  it('scales with duration', () => {
    const result = estimateExerciseCaloriesBurned({
      exerciseType: 'CYCLING',
      durationMinutes: 60,
      weightKg: 70,
    });

    // 7.5 * 70 * 1 = 525
    expect(result).toBe(525);
  });
});
