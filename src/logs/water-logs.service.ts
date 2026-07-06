import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserStatus, WaterLogSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWaterLogDto } from './dto/create-water-log.dto';
import { ListWaterLogsQueryDto } from './dto/list-water-logs-query.dto';

export interface WaterLogResponse {
  id: string;
  amountMl: number;
  loggedAt: Date;
  source: WaterLogSource;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class WaterLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    createWaterLogDto: CreateWaterLogDto,
  ): Promise<WaterLogResponse> {
    await this.ensureActiveUser(userId);

    const waterLog = await this.prisma.waterLog.create({
      data: {
        userId,
        amountMl: createWaterLogDto.amountMl,
        loggedAt: createWaterLogDto.loggedAt
          ? new Date(createWaterLogDto.loggedAt)
          : new Date(),
        source: WaterLogSource.MANUAL,
        note: createWaterLogDto.note,
      },
      select: waterLogSafeSelect,
    });

    return waterLog;
  }

  async findMany(
    userId: string,
    query: ListWaterLogsQueryDto,
  ): Promise<WaterLogResponse[]> {
    await this.ensureActiveUser(userId);

    return this.prisma.waterLog.findMany({
      where: {
        userId,
        loggedAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      },
      orderBy: { loggedAt: 'desc' },
      take: query.limit ?? 30,
      select: waterLogSafeSelect,
    });
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

const waterLogSafeSelect = {
  id: true,
  amountMl: true,
  loggedAt: true,
  source: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WaterLogSelect;
