import {
  addDaysToLocalDate,
  computeWeeklyStats,
  getWeekEndDate,
  hasWeekEnded,
  mondayOfWeek,
  notEnoughDataThresholdDays,
  resolveWeekStartDate,
} from './weekly-review-stats.util';

const timezone = 'Asia/Karachi';

function karachiNoon(date: string): Date {
  // Asia/Karachi is UTC+5 with no DST - noon local is 07:00 UTC same date.
  return new Date(`${date}T07:00:00.000Z`);
}

describe('weekly-review-stats.util', () => {
  describe('mondayOfWeek / addDaysToLocalDate / getWeekEndDate', () => {
    it("normalizes any date in a week to that week's Monday", () => {
      expect(mondayOfWeek('2024-01-01')).toBe('2024-01-01'); // Monday itself
      expect(mondayOfWeek('2024-01-03')).toBe('2024-01-01'); // Wednesday
      expect(mondayOfWeek('2024-01-07')).toBe('2024-01-01'); // Sunday
      expect(mondayOfWeek('2024-01-08')).toBe('2024-01-08'); // next Monday
    });

    it('adds/subtracts days across month and year boundaries', () => {
      expect(addDaysToLocalDate('2024-01-01', 6)).toBe('2024-01-07');
      expect(addDaysToLocalDate('2024-01-01', -7)).toBe('2023-12-25');
    });

    it('computes the Sunday end date for a Monday start', () => {
      expect(getWeekEndDate('2024-01-01')).toBe('2024-01-07');
    });
  });

  describe('resolveWeekStartDate', () => {
    it('normalizes an explicit requested date to its Monday', () => {
      const now = karachiNoon('2024-01-10');

      expect(resolveWeekStartDate(timezone, now, '2024-01-10')).toBe(
        '2024-01-08',
      );
    });

    it('defaults to the most recently completed week when omitted', () => {
      const now = karachiNoon('2024-01-10'); // Wednesday, this week's Monday is 2024-01-08

      expect(resolveWeekStartDate(timezone, now)).toBe('2024-01-01');
    });
  });

  describe('hasWeekEnded', () => {
    it('is true once local today is strictly after the week end date', () => {
      const now = karachiNoon('2024-01-10');

      expect(hasWeekEnded('2024-01-07', timezone, now)).toBe(true);
    });

    it('is false for a week still in progress', () => {
      const now = karachiNoon('2024-01-10');

      expect(hasWeekEnded('2024-01-14', timezone, now)).toBe(false);
    });

    it("is false on the week's own end date (not yet fully passed)", () => {
      const now = karachiNoon('2024-01-07');

      expect(hasWeekEnded('2024-01-07', timezone, now)).toBe(false);
    });
  });

  describe('computeWeeklyStats', () => {
    it('averages a full week of logs correctly', () => {
      const mealLogs = Array.from({ length: 7 }, (_, index) => ({
        loggedAt: karachiNoon(addDaysToLocalDate('2024-01-01', index)),
        totalCalories: 2000,
        totalProteinGrams: 100,
      }));
      const waterLogs = Array.from({ length: 7 }, (_, index) => ({
        loggedAt: karachiNoon(addDaysToLocalDate('2024-01-01', index)),
        amountMl: 3000,
      }));
      const exerciseLogs = [
        { loggedAt: karachiNoon('2024-01-01'), steps: 5000 },
        { loggedAt: karachiNoon('2024-01-02'), steps: 3000 },
      ];
      const weightLogs = [
        { loggedAt: karachiNoon('2024-01-01'), weightKg: 80 },
        { loggedAt: karachiNoon('2024-01-07'), weightKg: 78.5 },
      ];

      const stats = computeWeeklyStats({
        timezone,
        proteinTargetGrams: 90,
        mealLogs,
        waterLogs,
        exerciseLogs,
        weightLogs,
      });

      expect(stats.avgCalories).toBe(2000);
      expect(stats.avgProteinGrams).toBe(100);
      expect(stats.avgWaterMl).toBe(3000);
      expect(stats.avgSteps).toBe(Math.round(8000 / 7));
      expect(stats.mealLoggingDays).toBe(7);
      expect(stats.waterLoggingDays).toBe(7);
      expect(stats.exerciseLoggingDays).toBe(2);
      expect(stats.weightLoggingDays).toBe(2);
      expect(stats.consistencyRate).toBe(100);
      expect(stats.startWeightKg).toBe(80);
      expect(stats.endWeightKg).toBe(78.5);
      expect(stats.weightChangeKg).toBe(-1.5);
      expect(stats.proteinTargetMetDays).toBe(7);
      expect(stats.totalLoggingDays).toBe(7);
    });

    it('returns null weight trend fields with fewer than two weight logs', () => {
      const statsNoLogs = computeWeeklyStats({
        timezone,
        proteinTargetGrams: null,
        mealLogs: [],
        waterLogs: [],
        exerciseLogs: [],
        weightLogs: [],
      });
      const statsOneLog = computeWeeklyStats({
        timezone,
        proteinTargetGrams: null,
        mealLogs: [],
        waterLogs: [],
        exerciseLogs: [],
        weightLogs: [{ loggedAt: karachiNoon('2024-01-01'), weightKg: 80 }],
      });

      expect(statsNoLogs.startWeightKg).toBeNull();
      expect(statsNoLogs.endWeightKg).toBeNull();
      expect(statsNoLogs.weightChangeKg).toBeNull();
      expect(statsOneLog.weightChangeKg).toBeNull();
    });

    it('returns null proteinTargetMetDays when no protein target is set', () => {
      const stats = computeWeeklyStats({
        timezone,
        proteinTargetGrams: null,
        mealLogs: [
          {
            loggedAt: karachiNoon('2024-01-01'),
            totalCalories: 2000,
            totalProteinGrams: 150,
          },
        ],
        waterLogs: [],
        exerciseLogs: [],
        weightLogs: [],
      });

      expect(stats.proteinTargetMetDays).toBeNull();
    });

    it('flags fewer than the "not enough data" threshold as unreviewable', () => {
      const stats = computeWeeklyStats({
        timezone,
        proteinTargetGrams: null,
        mealLogs: [
          {
            loggedAt: karachiNoon('2024-01-01'),
            totalCalories: 500,
            totalProteinGrams: 20,
          },
        ],
        waterLogs: [{ loggedAt: karachiNoon('2024-01-02'), amountMl: 1000 }],
        exerciseLogs: [],
        weightLogs: [],
      });

      expect(stats.totalLoggingDays).toBe(2);
      expect(stats.totalLoggingDays).toBeLessThan(notEnoughDataThresholdDays);
    });

    it('picks the best/weakest habit by logged-day count, meal-priority on ties', () => {
      const stats = computeWeeklyStats({
        timezone,
        proteinTargetGrams: null,
        mealLogs: Array.from({ length: 6 }, (_, index) => ({
          loggedAt: karachiNoon(addDaysToLocalDate('2024-01-01', index)),
          totalCalories: 2000,
          totalProteinGrams: 100,
        })),
        waterLogs: Array.from({ length: 3 }, (_, index) => ({
          loggedAt: karachiNoon(addDaysToLocalDate('2024-01-01', index)),
          amountMl: 2000,
        })),
        exerciseLogs: [{ loggedAt: karachiNoon('2024-01-01'), steps: 1000 }],
        weightLogs: [],
      });

      expect(stats.bestHabit).toBe('MEAL_LOGGING');
      expect(stats.weakestHabit).toBe('EXERCISE_LOGGING');
    });

    it('returns null best/weakest habit when all counts are equal (including all-zero)', () => {
      const zeroStats = computeWeeklyStats({
        timezone,
        proteinTargetGrams: null,
        mealLogs: [],
        waterLogs: [],
        exerciseLogs: [],
        weightLogs: [],
      });
      const tiedStats = computeWeeklyStats({
        timezone,
        proteinTargetGrams: null,
        mealLogs: [
          {
            loggedAt: karachiNoon('2024-01-01'),
            totalCalories: 2000,
            totalProteinGrams: 100,
          },
        ],
        waterLogs: [{ loggedAt: karachiNoon('2024-01-01'), amountMl: 2000 }],
        exerciseLogs: [{ loggedAt: karachiNoon('2024-01-01'), steps: 1000 }],
        weightLogs: [],
      });

      expect(zeroStats.bestHabit).toBeNull();
      expect(zeroStats.weakestHabit).toBeNull();
      expect(tiedStats.bestHabit).toBeNull();
      expect(tiedStats.weakestHabit).toBeNull();
    });
  });
});
