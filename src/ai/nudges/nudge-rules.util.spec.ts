import {
  applyDailyCap,
  applyFatigueSuppression,
  evaluateNudgeRules,
  nudgeThresholds,
  type NudgeRuleInput,
} from './nudge-rules.util';

function baseInput(overrides: Partial<NudgeRuleInput> = {}): NudgeRuleInput {
  return {
    userState: 'ACTIVE_USER',
    daysSinceLastWeightLog: 1,
    hasMealLoggedToday: true,
    currentLocalHour: 9,
    waterRemainingMl: 2000,
    ...overrides,
  };
}

describe('evaluateNudgeRules', () => {
  it('fires WEIGHT_UPDATE_DUE when the last weight log is 5+ days old', () => {
    const result = evaluateNudgeRules(baseInput({ daysSinceLastWeightLog: 5 }));

    expect(result).toContain('WEIGHT_UPDATE_DUE');
  });

  it('fires WEIGHT_UPDATE_DUE when no weight log has ever been made', () => {
    const result = evaluateNudgeRules(
      baseInput({ daysSinceLastWeightLog: null }),
    );

    expect(result).toContain('WEIGHT_UPDATE_DUE');
  });

  it('does not fire WEIGHT_UPDATE_DUE for a recent weight log', () => {
    const result = evaluateNudgeRules(baseInput({ daysSinceLastWeightLog: 2 }));

    expect(result).not.toContain('WEIGHT_UPDATE_DUE');
  });

  it('fires MEAL_LOGGING_GAP when nothing logged today past the reference hour', () => {
    const result = evaluateNudgeRules(
      baseInput({ hasMealLoggedToday: false, currentLocalHour: 15 }),
    );

    expect(result).toContain('MEAL_LOGGING_GAP');
  });

  it('does not fire MEAL_LOGGING_GAP before the reference hour', () => {
    const result = evaluateNudgeRules(
      baseInput({ hasMealLoggedToday: false, currentLocalHour: 9 }),
    );

    expect(result).not.toContain('MEAL_LOGGING_GAP');
  });

  it('does not fire MEAL_LOGGING_GAP when a meal was already logged today', () => {
    const result = evaluateNudgeRules(
      baseInput({ hasMealLoggedToday: true, currentLocalHour: 20 }),
    );

    expect(result).not.toContain('MEAL_LOGGING_GAP');
  });

  it('fires WATER_TARGET_CLOSE when remaining water is close to target', () => {
    const result = evaluateNudgeRules(baseInput({ waterRemainingMl: 500 }));

    expect(result).toContain('WATER_TARGET_CLOSE');
  });

  it('does not fire WATER_TARGET_CLOSE when the target is already met (0 remaining)', () => {
    const result = evaluateNudgeRules(baseInput({ waterRemainingMl: 0 }));

    expect(result).not.toContain('WATER_TARGET_CLOSE');
  });

  it('does not fire WATER_TARGET_CLOSE when far from the target', () => {
    const result = evaluateNudgeRules(baseInput({ waterRemainingMl: 2000 }));

    expect(result).not.toContain('WATER_TARGET_CLOSE');
  });

  it('fires COMEBACK_WELCOME when the state engine resolved to COMEBACK', () => {
    const result = evaluateNudgeRules(baseInput({ userState: 'COMEBACK' }));

    expect(result).toContain('COMEBACK_WELCOME');
  });

  it('Smart Silence: an on-track Active User with no genuine gaps gets zero candidates', () => {
    const result = evaluateNudgeRules(
      baseInput({
        userState: 'ACTIVE_USER',
        daysSinceLastWeightLog: 1,
        hasMealLoggedToday: true,
        currentLocalHour: 20,
        waterRemainingMl: 0,
      }),
    );

    expect(result).toEqual([]);
  });

  it('Smart Silence: a Maintenance user with no genuine gaps gets zero candidates', () => {
    const result = evaluateNudgeRules(
      baseInput({
        userState: 'MAINTENANCE',
        daysSinceLastWeightLog: 1,
        hasMealLoggedToday: true,
        currentLocalHour: 20,
        waterRemainingMl: 0,
      }),
    );

    expect(result).toEqual([]);
  });

  it('still surfaces a genuine gap even for an Active User (Smart Silence does not blanket-suppress)', () => {
    const result = evaluateNudgeRules(
      baseInput({ userState: 'ACTIVE_USER', daysSinceLastWeightLog: 6 }),
    );

    expect(result).toContain('WEIGHT_UPDATE_DUE');
  });
});

describe('applyFatigueSuppression', () => {
  it('suppresses a type whose last 3 notifications were all ignored', () => {
    const result = applyFatigueSuppression(
      ['WEIGHT_UPDATE_DUE', 'WATER_TARGET_CLOSE'],
      {
        WEIGHT_UPDATE_DUE: ['UNREAD', 'DISMISSED', 'UNREAD'],
      },
    );

    expect(result).toEqual(['WATER_TARGET_CLOSE']);
  });

  it('does not suppress when at least one of the last 3 was read', () => {
    const result = applyFatigueSuppression(['WEIGHT_UPDATE_DUE'], {
      WEIGHT_UPDATE_DUE: ['UNREAD', 'READ', 'UNREAD'],
    });

    expect(result).toEqual(['WEIGHT_UPDATE_DUE']);
  });

  it('does not suppress when fewer than 3 prior notifications of that type exist', () => {
    const result = applyFatigueSuppression(['WEIGHT_UPDATE_DUE'], {
      WEIGHT_UPDATE_DUE: ['UNREAD', 'DISMISSED'],
    });

    expect(result).toEqual(['WEIGHT_UPDATE_DUE']);
  });

  it('does not suppress a type with no notification history', () => {
    const result = applyFatigueSuppression(['COMEBACK_WELCOME'], {});

    expect(result).toEqual(['COMEBACK_WELCOME']);
  });
});

describe('applyDailyCap', () => {
  it('keeps all candidates when under the cap', () => {
    const result = applyDailyCap(
      ['WEIGHT_UPDATE_DUE', 'WATER_TARGET_CLOSE'],
      0,
    );

    expect(result).toEqual(['WEIGHT_UPDATE_DUE', 'WATER_TARGET_CLOSE']);
  });

  it('trims excess candidates to the remaining daily slots, keeping highest priority first', () => {
    const result = applyDailyCap(
      [
        'WATER_TARGET_CLOSE',
        'MEAL_LOGGING_GAP',
        'COMEBACK_WELCOME',
        'WEIGHT_UPDATE_DUE',
      ],
      0,
    );

    expect(result).toEqual([
      'COMEBACK_WELCOME',
      'WEIGHT_UPDATE_DUE',
      'MEAL_LOGGING_GAP',
    ]);
    expect(result).toHaveLength(nudgeThresholds.dailyNudgeCap);
  });

  it('returns nothing when the cap has already been reached today', () => {
    const result = applyDailyCap(['WEIGHT_UPDATE_DUE'], 3);

    expect(result).toEqual([]);
  });

  it('respects partial remaining slots', () => {
    const result = applyDailyCap(['WATER_TARGET_CLOSE', 'COMEBACK_WELCOME'], 2);

    expect(result).toEqual(['COMEBACK_WELCOME']);
  });
});
