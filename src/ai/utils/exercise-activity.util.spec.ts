import { ExerciseType } from '@prisma/client';
import { MealItemSegment } from '../ai-provider.interface';
import {
  buildExerciseEstimateItem,
  inferExerciseType,
} from './exercise-activity.util';

function exerciseSegment(
  overrides: Partial<MealItemSegment> & { text: string },
): MealItemSegment {
  return {
    itemType: 'EXERCISE',
    quantity: null,
    unit: null,
    mealSlot: null,
    durationMinutes: null,
    distanceKm: null,
    steps: null,
    date: null,
    ...overrides,
  };
}

describe('inferExerciseType', () => {
  it.each<[string, ExerciseType]>([
    ['30 min walk', ExerciseType.WALKING],
    ['evening sair', ExerciseType.WALKING],
    ['went jogging', ExerciseType.RUNNING],
    ['daur lagayi', ExerciseType.RUNNING],
    ['cycling to work', ExerciseType.CYCLING],
    ['gym session', ExerciseType.STRENGTH],
    ['kasrat', ExerciseType.STRENGTH],
    ['treadmill cardio', ExerciseType.CARDIO],
    ['played cricket', ExerciseType.SPORTS],
    ['swimming', ExerciseType.SPORTS],
    ['did my steps', ExerciseType.STEPS],
    ['stretching session', ExerciseType.OTHER],
  ])('maps "%s" to %s', (text, expected) => {
    expect(inferExerciseType(text)).toBe(expected);
  });
});

describe('buildExerciseEstimateItem', () => {
  it('reuses the MET formula exactly for a stated duration (3.5 MET x 88kg x 0.5h = 154)', () => {
    const item = buildExerciseEstimateItem(
      exerciseSegment({
        text: 'walk',
        durationMinutes: 30,
        date: '2026-07-12',
      }),
      88,
    );

    expect(item).toMatchObject({
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      estimatedCaloriesBurned: 154,
      resolvedDate: '2026-07-12',
    });
    expect(item.assumptions).toEqual([]);
  });

  it('derives duration from steps at ~100 steps/min and discloses the assumption', () => {
    const item = buildExerciseEstimateItem(
      exerciseSegment({ text: 'walk', steps: 5000 }),
      88,
    );

    expect(item.durationMinutes).toBe(50);
    expect(item.steps).toBe(5000);
    expect(item.assumptions[0]).toMatch(/estimated from 5000 steps/i);
  });

  it('falls back to a disclosed 30-minute default when neither duration nor steps were stated', () => {
    const item = buildExerciseEstimateItem(
      exerciseSegment({ text: 'gym' }),
      88,
    );

    expect(item.durationMinutes).toBe(30);
    expect(item.assumptions[0]).toMatch(/no duration stated/i);
  });

  it('leaves calories null (never fake) when the user has no known weight', () => {
    const item = buildExerciseEstimateItem(
      exerciseSegment({ text: 'walk', durationMinutes: 30 }),
      null,
    );

    expect(item.estimatedCaloriesBurned).toBeNull();
    expect(item.assumptions[0]).toMatch(/without a logged weight/i);
  });
});
