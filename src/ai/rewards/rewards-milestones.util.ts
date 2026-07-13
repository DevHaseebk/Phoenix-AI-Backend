import { GoalType } from '@prisma/client';

export type MilestoneStatus = 'COMPLETED' | 'IN_PROGRESS' | 'LOCKED';

export interface WeightMilestone {
  targetWeightKg: number;
  status: MilestoneStatus;
  progressPercentage: number;
}

export interface WeightMilestonesInput {
  goalType: GoalType | null;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
}

/**
 * Dynamic milestone breakdown per docs/02_Product_Bible.md §21.2 (Goal
 * Engine): splits the user's own start-weight -> target-weight journey into
 * step-sized checkpoints, direction-aware (loss or gain). Step size is a
 * judgment call (task explicitly leaves this to us): 1kg increments for a
 * short (<10kg) journey so a small goal still gets a few checkpoints, 5kg
 * increments otherwise, matching the doc's "roughly 5kg increments" example.
 * Pure function - no DB access, see rewards.service.ts for the profile/log
 * lookups this consumes.
 */
export function buildWeightMilestones(
  input: WeightMilestonesInput,
): WeightMilestone[] {
  if (
    input.goalType === GoalType.MAINTAIN_WEIGHT ||
    input.startWeightKg === null ||
    input.currentWeightKg === null ||
    input.targetWeightKg === null ||
    input.startWeightKg === input.targetWeightKg
  ) {
    return [];
  }

  const direction: 'down' | 'up' =
    input.targetWeightKg < input.startWeightKg ? 'down' : 'up';
  const totalKg = Math.abs(input.startWeightKg - input.targetWeightKg);
  const step = totalKg < 10 ? 1 : 5;

  const milestoneWeights = buildMilestoneWeights(
    input.startWeightKg,
    input.targetWeightKg,
    direction,
    step,
  );

  let previousBoundary = input.startWeightKg;
  let firstIncompleteFound = false;

  return milestoneWeights.map((milestoneWeightKg) => {
    const reached =
      direction === 'down'
        ? input.currentWeightKg! <= milestoneWeightKg
        : input.currentWeightKg! >= milestoneWeightKg;

    if (reached) {
      previousBoundary = milestoneWeightKg;

      return {
        targetWeightKg: milestoneWeightKg,
        status: 'COMPLETED' as const,
        progressPercentage: 100,
      };
    }

    if (!firstIncompleteFound) {
      firstIncompleteFound = true;
      const segmentLength = Math.abs(previousBoundary - milestoneWeightKg);
      const withinSegment =
        direction === 'down'
          ? previousBoundary - input.currentWeightKg!
          : input.currentWeightKg! - previousBoundary;
      const clampedWithin = Math.min(Math.max(withinSegment, 0), segmentLength);
      const progressPercentage =
        segmentLength === 0
          ? 0
          : Math.round((clampedWithin / segmentLength) * 100);

      return {
        targetWeightKg: milestoneWeightKg,
        status: 'IN_PROGRESS' as const,
        progressPercentage,
      };
    }

    return {
      targetWeightKg: milestoneWeightKg,
      status: 'LOCKED' as const,
      progressPercentage: 0,
    };
  });
}

function buildMilestoneWeights(
  startWeightKg: number,
  targetWeightKg: number,
  direction: 'down' | 'up',
  step: number,
): number[] {
  const weights: number[] = [];
  let cursor = startWeightKg;

  while (true) {
    cursor = direction === 'down' ? cursor - step : cursor + step;

    const reachedOrPastTarget =
      direction === 'down'
        ? cursor <= targetWeightKg
        : cursor >= targetWeightKg;

    if (reachedOrPastTarget) {
      weights.push(roundOne(targetWeightKg));
      break;
    }

    weights.push(roundOne(cursor));
  }

  return weights;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
