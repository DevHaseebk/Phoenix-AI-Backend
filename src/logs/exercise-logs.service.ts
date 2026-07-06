import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  ExerciseLogSource,
  ExerciseType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExerciseLogDto } from './dto/create-exercise-log.dto';
import { ListExerciseLogsQueryDto } from './dto/list-exercise-logs-query.dto';

export interface ExerciseLogResponse {
  id: string;
  exerciseType: ExerciseType;
  durationMinutes: number;
  steps: number | null;
  distanceKm: number | null;
  estimatedCaloriesBurned: number | null;
  loggedAt: Date;
  source: ExerciseLogSource;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ExerciseLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    createExerciseLogDto: CreateExerciseLogDto,
  ): Promise<ExerciseLogResponse> {
    await this.ensureActiveUser(userId);

    const exerciseLog = await this.prisma.exerciseLog.create({
      data: {
        userId,
        exerciseType: createExerciseLogDto.exerciseType,
        durationMinutes: createExerciseLogDto.durationMinutes,
        steps: createExerciseLogDto.steps,
        distanceKm: createExerciseLogDto.distanceKm,
        estimatedCaloriesBurned: createExerciseLogDto.estimatedCaloriesBurned,
        loggedAt: createExerciseLogDto.loggedAt
          ? new Date(createExerciseLogDto.loggedAt)
          : new Date(),
        source: ExerciseLogSource.MANUAL,
        note: createExerciseLogDto.note,
      },
      select: exerciseLogSafeSelect,
    });

    return toExerciseLogResponse(exerciseLog);
  }

  async findMany(
    userId: string,
    query: ListExerciseLogsQueryDto,
  ): Promise<ExerciseLogResponse[]> {
    await this.ensureActiveUser(userId);

    const exerciseLogs = await this.prisma.exerciseLog.findMany({
      where: {
        userId,
        ...(query.exerciseType ? { exerciseType: query.exerciseType } : {}),
        loggedAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      },
      orderBy: { loggedAt: 'desc' },
      take: query.limit ?? 30,
      select: exerciseLogSafeSelect,
    });

    return exerciseLogs.map(toExerciseLogResponse);
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
}

const exerciseLogSafeSelect = {
  id: true,
  exerciseType: true,
  durationMinutes: true,
  steps: true,
  distanceKm: true,
  estimatedCaloriesBurned: true,
  loggedAt: true,
  source: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExerciseLogSelect;

function toExerciseLogResponse(exerciseLog: {
  id: string;
  exerciseType: ExerciseType;
  durationMinutes: number;
  steps: number | null;
  distanceKm: Prisma.Decimal | number | null;
  estimatedCaloriesBurned: number | null;
  loggedAt: Date;
  source: ExerciseLogSource;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ExerciseLogResponse {
  return {
    id: exerciseLog.id,
    exerciseType: exerciseLog.exerciseType,
    durationMinutes: exerciseLog.durationMinutes,
    steps: exerciseLog.steps,
    distanceKm:
      exerciseLog.distanceKm === null ? null : Number(exerciseLog.distanceKm),
    estimatedCaloriesBurned: exerciseLog.estimatedCaloriesBurned,
    loggedAt: exerciseLog.loggedAt,
    source: exerciseLog.source,
    note: exerciseLog.note,
    createdAt: exerciseLog.createdAt,
    updatedAt: exerciseLog.updatedAt,
  };
}
