import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OnboardingStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { SaveOnboardingStepDto } from './dto/save-onboarding-step.dto';
import { calculateOnboardingTargets } from './onboarding-targets';

export interface OnboardingState {
  status: OnboardingStatus;
  currentStep: string | null;
  completedSteps: string[];
  draft: Record<string, unknown>;
}

export interface CompleteOnboardingResponse {
  profile: {
    currentWeightKg: number;
    targetWeightKg: number;
    dailyCalorieTarget: number;
    dailyProteinTargetGrams: number;
  };
  firstWinOptions: Array<{
    type: string;
    label: string;
  }>;
}

const stepOrder = ['WELCOME', 'GOAL', 'BASIC_INFO', 'ACTIVITY_LEVEL', 'FOOD'];

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(userId: string): Promise<OnboardingState> {
    await this.ensureActiveUser(userId);

    const onboarding = await this.prisma.userOnboarding.findUnique({
      where: { userId },
      select: {
        status: true,
        currentStep: true,
        completedSteps: true,
        draft: true,
      },
    });

    if (!onboarding) {
      return {
        status: OnboardingStatus.NOT_STARTED,
        currentStep: null,
        completedSteps: [],
        draft: {},
      };
    }

    return this.toOnboardingState(onboarding);
  }

  async saveStep(
    userId: string,
    saveStepDto: SaveOnboardingStepDto,
  ): Promise<OnboardingState> {
    await this.ensureActiveUser(userId);

    const existing = await this.prisma.userOnboarding.findUnique({
      where: { userId },
      select: {
        status: true,
        currentStep: true,
        completedSteps: true,
        draft: true,
      },
    });
    const completedSteps = addUniqueStep(
      normalizeStringArray(existing?.completedSteps),
      saveStepDto.step,
    );
    const draft = {
      ...normalizeObject(existing?.draft),
      [saveStepDto.step]: saveStepDto.data,
    } as Prisma.InputJsonObject;
    const status =
      existing?.status === OnboardingStatus.COMPLETED
        ? OnboardingStatus.COMPLETED
        : OnboardingStatus.IN_PROGRESS;
    const currentStep =
      status === OnboardingStatus.COMPLETED
        ? (existing?.currentStep ?? null)
        : getNextStep(saveStepDto.step);
    const onboarding = await this.prisma.userOnboarding.upsert({
      where: { userId },
      create: {
        userId,
        status,
        currentStep,
        completedSteps,
        draft,
      },
      update: {
        status,
        currentStep,
        completedSteps,
        draft,
      },
      select: {
        status: true,
        currentStep: true,
        completedSteps: true,
        draft: true,
      },
    });

    return this.toOnboardingState(onboarding);
  }

  async complete(
    userId: string,
    completeDto: CompleteOnboardingDto,
  ): Promise<CompleteOnboardingResponse> {
    await this.ensureActiveUser(userId);

    const targets = calculateOnboardingTargets(completeDto);
    const completedAt = new Date();
    const draft = {
      completedInput: {
        gender: completeDto.gender,
        dateOfBirth: completeDto.dateOfBirth.toISOString(),
        heightCm: completeDto.heightCm,
        currentWeightKg: completeDto.currentWeightKg,
        targetWeightKg: completeDto.targetWeightKg,
        goalType: completeDto.goalType,
        goalPace: completeDto.goalPace,
        activityLevel: completeDto.activityLevel,
        timezone: completeDto.timezone,
        preferredLanguage: completeDto.preferredLanguage,
        foodPreferences: completeDto.foodPreferences ?? [],
        foodDislikes: completeDto.foodDislikes ?? [],
        commitmentAccepted: completeDto.commitmentAccepted,
      },
      calculatedTargets: {
        calorieTarget: targets.calorieTarget,
        proteinTargetGrams: targets.proteinTargetGrams,
      },
    } as Prisma.InputJsonObject;

    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        gender: completeDto.gender,
        dateOfBirth: completeDto.dateOfBirth,
        heightCm: completeDto.heightCm,
        currentWeightKg: completeDto.currentWeightKg,
        targetWeightKg: completeDto.targetWeightKg,
        goalType: completeDto.goalType,
        goalPace: completeDto.goalPace,
        activityLevel: completeDto.activityLevel,
        timezone: completeDto.timezone,
        preferredLanguage: completeDto.preferredLanguage,
        calorieTarget: targets.calorieTarget,
        proteinTargetGrams: targets.proteinTargetGrams,
      },
      update: {
        gender: completeDto.gender,
        dateOfBirth: completeDto.dateOfBirth,
        heightCm: completeDto.heightCm,
        currentWeightKg: completeDto.currentWeightKg,
        targetWeightKg: completeDto.targetWeightKg,
        goalType: completeDto.goalType,
        goalPace: completeDto.goalPace,
        activityLevel: completeDto.activityLevel,
        timezone: completeDto.timezone,
        preferredLanguage: completeDto.preferredLanguage,
        calorieTarget: targets.calorieTarget,
        proteinTargetGrams: targets.proteinTargetGrams,
      },
      select: { id: true },
    });
    await this.prisma.userOnboarding.upsert({
      where: { userId },
      create: {
        userId,
        status: OnboardingStatus.COMPLETED,
        currentStep: null,
        completedSteps: stepOrder,
        draft,
        completedAt,
      },
      update: {
        status: OnboardingStatus.COMPLETED,
        currentStep: null,
        completedSteps: stepOrder,
        draft,
        completedAt,
      },
      select: { id: true },
    });

    return {
      profile: {
        currentWeightKg: completeDto.currentWeightKg,
        targetWeightKg: completeDto.targetWeightKg,
        dailyCalorieTarget: targets.calorieTarget,
        dailyProteinTargetGrams: targets.proteinTargetGrams,
      },
      firstWinOptions: [
        { type: 'UPDATE_WEIGHT', label: 'Update Weight' },
        { type: 'LOG_FIRST_MEAL', label: 'Log First Meal' },
        { type: 'LOG_WATER', label: 'Log Water' },
        { type: 'OPEN_DASHBOARD', label: 'Open Dashboard' },
      ],
    };
  }

  private async ensureActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  private toOnboardingState(onboarding: {
    status: OnboardingStatus;
    currentStep: string | null;
    completedSteps: Prisma.JsonValue;
    draft: Prisma.JsonValue;
  }): OnboardingState {
    return {
      status: onboarding.status,
      currentStep: onboarding.currentStep,
      completedSteps: normalizeStringArray(onboarding.completedSteps),
      draft: normalizeObject(onboarding.draft),
    };
  }
}

function addUniqueStep(completedSteps: string[], step: string): string[] {
  return completedSteps.includes(step)
    ? completedSteps
    : [...completedSteps, step];
}

function getNextStep(step: string): string | null {
  const index = stepOrder.indexOf(step);

  return index >= 0 ? (stepOrder[index + 1] ?? null) : null;
}

function normalizeStringArray(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeObject(
  value: Prisma.JsonValue | undefined,
): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : {};
}
