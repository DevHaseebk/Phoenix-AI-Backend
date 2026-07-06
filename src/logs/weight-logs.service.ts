import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserStatus, WeightLogSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWeightLogDto } from './dto/create-weight-log.dto';
import { ListWeightLogsQueryDto } from './dto/list-weight-logs-query.dto';

export interface WeightLogResponse {
  id: string;
  weightKg: number;
  loggedAt: Date;
  source: WeightLogSource;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class WeightLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    createWeightLogDto: CreateWeightLogDto,
  ): Promise<WeightLogResponse> {
    await this.ensureActiveUser(userId);

    const weightLog = await this.prisma.weightLog.create({
      data: {
        userId,
        weightKg: createWeightLogDto.weightKg,
        loggedAt: createWeightLogDto.loggedAt
          ? new Date(createWeightLogDto.loggedAt)
          : new Date(),
        source: WeightLogSource.MANUAL,
        note: createWeightLogDto.note,
      },
      select: weightLogSafeSelect,
    });

    return toWeightLogResponse(weightLog);
  }

  async findMany(
    userId: string,
    query: ListWeightLogsQueryDto,
  ): Promise<WeightLogResponse[]> {
    await this.ensureActiveUser(userId);

    const weightLogs = await this.prisma.weightLog.findMany({
      where: {
        userId,
        loggedAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      },
      orderBy: { loggedAt: 'desc' },
      take: query.limit ?? 30,
      select: weightLogSafeSelect,
    });

    return weightLogs.map(toWeightLogResponse);
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

const weightLogSafeSelect = {
  id: true,
  weightKg: true,
  loggedAt: true,
  source: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WeightLogSelect;

function toWeightLogResponse(weightLog: {
  id: string;
  weightKg: Prisma.Decimal | number;
  loggedAt: Date;
  source: WeightLogSource;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WeightLogResponse {
  return {
    id: weightLog.id,
    weightKg: Number(weightLog.weightKg),
    loggedAt: weightLog.loggedAt,
    source: weightLog.source,
    note: weightLog.note,
    createdAt: weightLog.createdAt,
    updatedAt: weightLog.updatedAt,
  };
}
