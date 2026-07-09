import { determineUserState, type UserStateInput } from './user-state.util';

const now = new Date('2026-07-08T12:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function baseInput(overrides: Partial<UserStateInput> = {}): UserStateInput {
  return {
    now,
    hasMedicalRiskFlag: false,
    onboardingCompletedAt: daysAgo(90),
    lastActivityAt: daysAgo(0),
    previousActivityAt: daysAgo(1),
    recentWeightLogs: [],
    recentDailyCalories: [],
    currentWeightKg: 80,
    targetWeightKg: 70,
    bmrKcal: 1800,
    totalLogCountSinceOnboarding: 50,
    ...overrides,
  };
}

describe('determineUserState', () => {
  it('classifies HIGH_RISK immediately on a medical risk flag, overriding everything else', () => {
    const result = determineUserState(
      baseInput({
        hasMedicalRiskFlag: true,
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(20), // would otherwise be COMEBACK
      }),
    );

    expect(result.state).toBe('HIGH_RISK');
    expect(result.reason).toMatch(/safety flag/i);
  });

  it('classifies COMEBACK: activity today after a 14+ day silent gap', () => {
    const result = determineUserState(
      baseInput({
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(16),
      }),
    );

    expect(result.state).toBe('COMEBACK');
  });

  it('does not classify COMEBACK when the gap is under 14 days', () => {
    const result = determineUserState(
      baseInput({
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(10),
      }),
    );

    expect(result.state).not.toBe('COMEBACK');
  });

  it('classifies HIGH_RISK on 7+ days of total inactivity', () => {
    const result = determineUserState(
      baseInput({
        lastActivityAt: daysAgo(9),
        previousActivityAt: daysAgo(40),
      }),
    );

    expect(result.state).toBe('HIGH_RISK');
    expect(result.reason).toMatch(/no logging activity for 9 days/i);
  });

  it('classifies HIGH_RISK when no activity has ever been logged', () => {
    const result = determineUserState(
      baseInput({ lastActivityAt: null, previousActivityAt: null }),
    );

    expect(result.state).toBe('HIGH_RISK');
  });

  describe('New User grace period', () => {
    it('classifies NEW_USER (not HIGH_RISK) for a zero-log user onboarded 1 day ago', () => {
      const result = determineUserState(
        baseInput({
          onboardingCompletedAt: daysAgo(1),
          lastActivityAt: null,
          previousActivityAt: null,
          totalLogCountSinceOnboarding: 0,
        }),
      );

      expect(result.state).toBe('NEW_USER');
    });

    it('still classifies HIGH_RISK via the under-BMR sub-check during the grace period', () => {
      const result = determineUserState(
        baseInput({
          onboardingCompletedAt: daysAgo(2),
          lastActivityAt: daysAgo(0),
          previousActivityAt: daysAgo(1),
          totalLogCountSinceOnboarding: 3,
          bmrKcal: 2000,
          recentDailyCalories: [
            { date: '2026-07-08', calories: 900 },
            { date: '2026-07-07', calories: 850 },
            { date: '2026-07-06', calories: 1100 },
          ],
        }),
      );

      expect(result.state).toBe('HIGH_RISK');
      expect(result.reason).toMatch(/below/i);
    });

    it('still classifies HIGH_RISK for a zero-log user just past the grace period (4 days)', () => {
      const result = determineUserState(
        baseInput({
          onboardingCompletedAt: daysAgo(4),
          lastActivityAt: null,
          previousActivityAt: null,
          totalLogCountSinceOnboarding: 0,
        }),
      );

      expect(result.state).toBe('HIGH_RISK');
      expect(result.reason).toMatch(/no logging activity/i);
    });
  });

  it('classifies HIGH_RISK on sustained under-BMR eating even with recent activity', () => {
    const result = determineUserState(
      baseInput({
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(1),
        bmrKcal: 2000,
        recentDailyCalories: [
          { date: '2026-07-08', calories: 900 },
          { date: '2026-07-07', calories: 850 },
          { date: '2026-07-06', calories: 1100 },
          { date: '2026-07-05', calories: 1900 },
        ],
      }),
    );

    expect(result.state).toBe('HIGH_RISK');
    expect(result.reason).toMatch(/below/i);
  });

  it('does not flag under-BMR risk when fewer than 3 qualifying days are under threshold', () => {
    const result = determineUserState(
      baseInput({
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(1),
        bmrKcal: 2000,
        recentDailyCalories: [
          { date: '2026-07-08', calories: 900 },
          { date: '2026-07-07', calories: 1900 },
          { date: '2026-07-06', calories: 1950 },
        ],
      }),
    );

    expect(result.state).not.toBe('HIGH_RISK');
  });

  it('classifies PLATEAU: flat weight trend over 3+ weeks of active logging', () => {
    const result = determineUserState(
      baseInput({
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(1),
        recentWeightLogs: [
          { weightKg: 80.1, loggedAt: daysAgo(1) },
          { weightKg: 80.3, loggedAt: daysAgo(10) },
          { weightKg: 80.0, loggedAt: daysAgo(20) },
        ],
      }),
    );

    expect(result.state).toBe('PLATEAU');
  });

  it('does not classify PLATEAU when the weight trend is clearly moving', () => {
    const result = determineUserState(
      baseInput({
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(1),
        recentWeightLogs: [
          { weightKg: 77, loggedAt: daysAgo(1) },
          { weightKg: 80, loggedAt: daysAgo(20) },
        ],
      }),
    );

    expect(result.state).not.toBe('PLATEAU');
  });

  it('does not classify PLATEAU when the window is too short', () => {
    const result = determineUserState(
      baseInput({
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(1),
        recentWeightLogs: [
          { weightKg: 80.0, loggedAt: daysAgo(1) },
          { weightKg: 80.1, loggedAt: daysAgo(5) },
        ],
      }),
    );

    expect(result.state).not.toBe('PLATEAU');
  });

  it('classifies NEW_USER: onboarded within 7 days with minimal log history', () => {
    const result = determineUserState(
      baseInput({
        onboardingCompletedAt: daysAgo(3),
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(1),
        totalLogCountSinceOnboarding: 2,
      }),
    );

    expect(result.state).toBe('NEW_USER');
  });

  it('does not classify NEW_USER when log history is already substantial', () => {
    const result = determineUserState(
      baseInput({
        onboardingCompletedAt: daysAgo(3),
        lastActivityAt: daysAgo(0),
        previousActivityAt: daysAgo(1),
        totalLogCountSinceOnboarding: 30,
      }),
    );

    expect(result.state).not.toBe('NEW_USER');
  });

  it('classifies LOW_ACTIVITY: a 3-6 day gap since last log', () => {
    const result = determineUserState(
      baseInput({
        onboardingCompletedAt: daysAgo(90),
        lastActivityAt: daysAgo(4),
        previousActivityAt: daysAgo(10),
      }),
    );

    expect(result.state).toBe('LOW_ACTIVITY');
  });

  it('classifies ACTIVE_USER when recently active and nothing else applies', () => {
    const result = determineUserState(
      baseInput({
        currentWeightKg: 80,
        targetWeightKg: 60,
      }),
    );

    expect(result.state).toBe('ACTIVE_USER');
  });

  it('classifies MAINTENANCE (stub): weight already within tolerance of target', () => {
    const result = determineUserState(
      baseInput({
        currentWeightKg: 70.5,
        targetWeightKg: 70,
      }),
    );

    expect(result.state).toBe('MAINTENANCE');
  });

  it('never auto-triggers VACATION (no toggle exists yet - out of scope stub)', () => {
    const scenarios: Partial<UserStateInput>[] = [
      { lastActivityAt: daysAgo(0), previousActivityAt: daysAgo(1) },
      { lastActivityAt: daysAgo(4), previousActivityAt: daysAgo(10) },
      { currentWeightKg: 70, targetWeightKg: 70 },
    ];

    for (const scenario of scenarios) {
      expect(determineUserState(baseInput(scenario)).state).not.toBe(
        'VACATION',
      );
    }
  });

  describe('priority resolution: competing conditions', () => {
    it('resolves COMEBACK over PLATEAU when both conditions are present', () => {
      // Weight trend is flat AND the user just returned after a long gap -
      // Comeback (priority 2) must win over Plateau (priority 4).
      const result = determineUserState(
        baseInput({
          lastActivityAt: daysAgo(0),
          previousActivityAt: daysAgo(16),
          recentWeightLogs: [
            { weightKg: 80.1, loggedAt: daysAgo(0) },
            { weightKg: 80.0, loggedAt: daysAgo(20) },
          ],
        }),
      );

      expect(result.state).toBe('COMEBACK');
    });

    it('resolves HIGH_RISK over MAINTENANCE when both conditions are present', () => {
      // At-goal weight AND long inactivity - High Risk (priority 3) must win
      // over the Maintenance stub (lowest priority).
      const result = determineUserState(
        baseInput({
          lastActivityAt: daysAgo(9),
          previousActivityAt: daysAgo(40),
          currentWeightKg: 70,
          targetWeightKg: 70,
        }),
      );

      expect(result.state).toBe('HIGH_RISK');
    });

    it('resolves HIGH_RISK (medical flag) over COMEBACK when both conditions are present', () => {
      const result = determineUserState(
        baseInput({
          hasMedicalRiskFlag: true,
          lastActivityAt: daysAgo(0),
          previousActivityAt: daysAgo(20),
        }),
      );

      expect(result.state).toBe('HIGH_RISK');
      expect(result.reason).toMatch(/safety flag/i);
    });
  });
});
