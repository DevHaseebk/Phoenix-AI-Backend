import { GoalType } from '@prisma/client';
import { buildWeightMilestones } from './rewards-milestones.util';

describe('buildWeightMilestones', () => {
  it('breaks a large weight-loss journey into 5kg steps', () => {
    const milestones = buildWeightMilestones({
      goalType: GoalType.LOSE_WEIGHT,
      startWeightKg: 156,
      currentWeightKg: 148,
      targetWeightKg: 100,
    });

    expect(milestones.map((m) => m.targetWeightKg)).toEqual([
      151, 146, 141, 136, 131, 126, 121, 116, 111, 106, 101, 100,
    ]);
  });

  it('marks milestones already passed as COMPLETED at 100%', () => {
    const milestones = buildWeightMilestones({
      goalType: GoalType.LOSE_WEIGHT,
      startWeightKg: 156,
      currentWeightKg: 148,
      targetWeightKg: 100,
    });

    expect(milestones[0]).toEqual({
      targetWeightKg: 151,
      status: 'COMPLETED',
      progressPercentage: 100,
    });
  });

  it('marks the next unmet milestone IN_PROGRESS with partial progress, and later ones LOCKED', () => {
    const milestones = buildWeightMilestones({
      goalType: GoalType.LOSE_WEIGHT,
      startWeightKg: 156,
      currentWeightKg: 148,
      targetWeightKg: 100,
    });

    // From 151 (previous boundary) to 146: 156->148 covers 151->148 = 3kg of a 5kg segment = 60%.
    expect(milestones[1]).toEqual({
      targetWeightKg: 146,
      status: 'IN_PROGRESS',
      progressPercentage: 60,
    });
    expect(milestones[2].status).toBe('LOCKED');
    expect(milestones[2].progressPercentage).toBe(0);
  });

  it('uses 1kg steps for a short journey', () => {
    const milestones = buildWeightMilestones({
      goalType: GoalType.LOSE_WEIGHT,
      startWeightKg: 75,
      currentWeightKg: 75,
      targetWeightKg: 70,
    });

    expect(milestones.map((m) => m.targetWeightKg)).toEqual([
      74, 73, 72, 71, 70,
    ]);
  });

  it('is direction-aware for a weight-gain goal', () => {
    const milestones = buildWeightMilestones({
      goalType: GoalType.GAIN_WEIGHT,
      startWeightKg: 55,
      currentWeightKg: 57,
      targetWeightKg: 65,
    });

    expect(milestones.map((m) => m.targetWeightKg)).toEqual([60, 65]);
    expect(milestones[0].status).toBe('IN_PROGRESS');
  });

  it('returns no milestones for a maintain-weight goal or missing data', () => {
    expect(
      buildWeightMilestones({
        goalType: GoalType.MAINTAIN_WEIGHT,
        startWeightKg: 70,
        currentWeightKg: 70,
        targetWeightKg: 70,
      }),
    ).toEqual([]);

    expect(
      buildWeightMilestones({
        goalType: GoalType.LOSE_WEIGHT,
        startWeightKg: null,
        currentWeightKg: 70,
        targetWeightKg: 65,
      }),
    ).toEqual([]);

    expect(
      buildWeightMilestones({
        goalType: GoalType.LOSE_WEIGHT,
        startWeightKg: 70,
        currentWeightKg: 70,
        targetWeightKg: 70,
      }),
    ).toEqual([]);
  });
});
