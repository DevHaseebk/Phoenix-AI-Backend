import { ActivityLevel, Gender } from '@prisma/client';
import {
  calculateAge,
  calculateBmr,
  calculateTdee,
} from './health-metrics.util';

describe('health-metrics.util', () => {
  const now = new Date('2026-07-07T12:00:00.000Z');

  describe('calculateAge', () => {
    it('calculates age from date of birth', () => {
      expect(calculateAge(new Date('1998-01-01'), now)).toBe(28);
    });

    it('does not count a birthday that has not happened yet this year', () => {
      expect(calculateAge(new Date('1998-12-31'), now)).toBe(27);
    });

    it('clamps age to a safe 13-100 range', () => {
      expect(calculateAge(new Date('2025-01-01'), now)).toBe(13);
      expect(calculateAge(new Date('1900-01-01'), now)).toBe(100);
    });
  });

  describe('calculateBmr', () => {
    it('calculates Mifflin-St Jeor BMR for a male profile', () => {
      const bmr = calculateBmr(
        {
          gender: Gender.MALE,
          dateOfBirth: new Date('1998-01-01'),
          heightCm: 188,
          weightKg: 88,
        },
        now,
      );

      // 10*88 + 6.25*188 - 5*28 + 5 = 880 + 1175 - 140 + 5
      expect(bmr).toBe(1920);
    });

    it('applies the female adjustment', () => {
      const bmr = calculateBmr(
        {
          gender: Gender.FEMALE,
          dateOfBirth: new Date('1998-01-01'),
          heightCm: 165,
          weightKg: 60,
        },
        now,
      );

      // 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161
      expect(bmr).toBe(1330.25);
    });

    it('uses the male adjustment for non-binary genders', () => {
      const base = {
        dateOfBirth: new Date('1998-01-01'),
        heightCm: 175,
        weightKg: 70,
      };

      expect(calculateBmr({ ...base, gender: Gender.OTHER }, now)).toBe(
        calculateBmr({ ...base, gender: Gender.MALE }, now),
      );
    });
  });

  describe('calculateTdee', () => {
    it('multiplies BMR by the activity level multiplier', () => {
      expect(calculateTdee(1920, ActivityLevel.SEDENTARY)).toBe(2304);
      expect(calculateTdee(2000, ActivityLevel.MODERATELY_ACTIVE)).toBe(3100);
    });
  });
});
