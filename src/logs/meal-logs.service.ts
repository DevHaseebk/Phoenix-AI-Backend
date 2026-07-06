import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConfidenceLevel,
  MealLogSource,
  MealLogStatus,
  MealType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMealLogDto,
  CreateMealLogItemDto,
} from './dto/create-meal-log.dto';
import { ListMealLogsQueryDto } from './dto/list-meal-logs-query.dto';
import { UpdateMealLogDto } from './dto/update-meal-log.dto';

export interface MealLogItemResponse {
  id: string;
  foodName: string;
  portionLabel: string | null;
  quantity: number | null;
  calories: number;
  proteinGrams: number;
  carbsGrams: number | null;
  fatGrams: number | null;
  confidenceLevel: ConfidenceLevel;
  createdAt: Date;
  updatedAt: Date;
}

export interface MealLogResponse {
  id: string;
  mealType: MealType;
  description: string | null;
  totalCalories: number;
  totalProteinGrams: number;
  totalCarbsGrams: number | null;
  totalFatGrams: number | null;
  status: MealLogStatus;
  confidenceLevel: ConfidenceLevel;
  source: MealLogSource;
  loggedAt: Date;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: MealLogItemResponse[];
}

@Injectable()
export class MealLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    createMealLogDto: CreateMealLogDto,
  ): Promise<MealLogResponse> {
    await this.ensureActiveUser(userId);

    const totals = calculateMealTotals(createMealLogDto.items);
    const mealLog = await this.prisma.mealLog.create({
      data: {
        userId,
        mealType: createMealLogDto.mealType,
        loggedAt: createMealLogDto.loggedAt
          ? new Date(createMealLogDto.loggedAt)
          : new Date(),
        source: MealLogSource.MANUAL,
        status: MealLogStatus.LOGGED,
        confidenceLevel: ConfidenceLevel.VERIFIED,
        description: createMealLogDto.description,
        note: createMealLogDto.note,
        totalCalories: totals.totalCalories,
        totalProteinGrams: totals.totalProteinGrams,
        totalCarbsGrams: totals.totalCarbsGrams,
        totalFatGrams: totals.totalFatGrams,
        items: {
          create: createMealLogDto.items.map((item) => ({
            foodName: item.foodName,
            portionLabel: item.portionLabel,
            quantity: item.quantity,
            calories: item.calories,
            proteinGrams: item.proteinGrams,
            carbsGrams: item.carbsGrams,
            fatGrams: item.fatGrams,
            confidenceLevel: ConfidenceLevel.VERIFIED,
          })),
        },
      },
      select: mealLogSafeSelect,
    });

    return toMealLogResponse(mealLog);
  }

  async findMany(
    userId: string,
    query: ListMealLogsQueryDto,
  ): Promise<MealLogResponse[]> {
    await this.ensureActiveUser(userId);

    const mealLogs = await this.prisma.mealLog.findMany({
      where: {
        userId,
        ...(query.mealType ? { mealType: query.mealType } : {}),
        loggedAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      },
      orderBy: { loggedAt: 'desc' },
      take: query.limit ?? 30,
      select: mealLogSafeSelect,
    });

    return mealLogs.map(toMealLogResponse);
  }

  async findOne(userId: string, id: string): Promise<MealLogResponse> {
    await this.ensureActiveUser(userId);

    const mealLog = await this.prisma.mealLog.findFirst({
      where: { id, userId },
      select: mealLogSafeSelect,
    });

    if (!mealLog) {
      throw new NotFoundException('Meal log not found');
    }

    return toMealLogResponse(mealLog);
  }

  async update(
    userId: string,
    id: string,
    updateMealLogDto: UpdateMealLogDto,
  ): Promise<MealLogResponse> {
    await this.ensureActiveUser(userId);

    if (updateMealLogDto.items !== undefined) {
      return this.updateWithItemReplacement(userId, id, updateMealLogDto);
    }

    await this.ensureOwnedMealLog(userId, id);

    const mealLog = await this.prisma.mealLog.update({
      where: { id },
      data: buildMealLogUpdateData(updateMealLogDto),
      select: mealLogSafeSelect,
    });

    return toMealLogResponse(mealLog);
  }

  async remove(userId: string, id: string): Promise<null> {
    await this.ensureActiveUser(userId);
    await this.ensureOwnedMealLog(userId, id);

    await this.prisma.mealLog.delete({
      where: { id },
      select: { id: true },
    });

    return null;
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

  private async ensureOwnedMealLog(userId: string, id: string): Promise<void> {
    const mealLog = await this.prisma.mealLog.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!mealLog) {
      throw new NotFoundException('Meal log not found');
    }
  }

  private async updateWithItemReplacement(
    userId: string,
    id: string,
    updateMealLogDto: UpdateMealLogDto,
  ): Promise<MealLogResponse> {
    const mealLog = await this.prisma.$transaction(async (transaction) => {
      const existingMealLog = await transaction.mealLog.findFirst({
        where: { id, userId },
        select: { id: true },
      });

      if (!existingMealLog) {
        throw new NotFoundException('Meal log not found');
      }

      const totals = calculateMealTotals(updateMealLogDto.items ?? []);

      await transaction.mealLogItem.deleteMany({
        where: { mealLogId: id },
      });

      return transaction.mealLog.update({
        where: { id },
        data: {
          ...buildMealLogUpdateData(updateMealLogDto),
          totalCalories: totals.totalCalories,
          totalProteinGrams: totals.totalProteinGrams,
          totalCarbsGrams: totals.totalCarbsGrams,
          totalFatGrams: totals.totalFatGrams,
          items: {
            create: toMealLogItemCreateData(updateMealLogDto.items ?? []),
          },
        },
        select: mealLogSafeSelect,
      });
    });

    return toMealLogResponse(mealLog);
  }
}

const mealLogItemSafeSelect = {
  id: true,
  foodName: true,
  portionLabel: true,
  quantity: true,
  calories: true,
  proteinGrams: true,
  carbsGrams: true,
  fatGrams: true,
  confidenceLevel: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MealLogItemSelect;

const mealLogSafeSelect = {
  id: true,
  mealType: true,
  description: true,
  totalCalories: true,
  totalProteinGrams: true,
  totalCarbsGrams: true,
  totalFatGrams: true,
  status: true,
  confidenceLevel: true,
  source: true,
  loggedAt: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: mealLogItemSafeSelect,
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MealLogSelect;

type MealLogWithItems = Prisma.MealLogGetPayload<{
  select: typeof mealLogSafeSelect;
}>;

type MealLogItemSafe = MealLogWithItems['items'][number];

function calculateMealTotals(items: CreateMealLogItemDto[]): {
  totalCalories: number;
  totalProteinGrams: number;
  totalCarbsGrams: number | null;
  totalFatGrams: number | null;
} {
  const totalCalories = sumRequired(items, 'calories');
  const totalProteinGrams = sumRequired(items, 'proteinGrams');
  const totalCarbsGrams = sumOptional(items, 'carbsGrams');
  const totalFatGrams = sumOptional(items, 'fatGrams');

  return {
    totalCalories,
    totalProteinGrams,
    totalCarbsGrams,
    totalFatGrams,
  };
}

function sumRequired(
  items: CreateMealLogItemDto[],
  key: 'calories' | 'proteinGrams',
): number {
  return items.reduce((total, item) => total + item[key], 0);
}

function sumOptional(
  items: CreateMealLogItemDto[],
  key: 'carbsGrams' | 'fatGrams',
): number | null {
  const values = items
    .map((item) => item[key])
    .filter((value): value is number => value !== undefined);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0);
}

function buildMealLogUpdateData(
  updateMealLogDto: UpdateMealLogDto,
): Prisma.MealLogUpdateInput {
  return {
    ...(updateMealLogDto.mealType === undefined
      ? {}
      : { mealType: updateMealLogDto.mealType }),
    ...(updateMealLogDto.loggedAt === undefined
      ? {}
      : { loggedAt: new Date(updateMealLogDto.loggedAt) }),
    ...(updateMealLogDto.description === undefined
      ? {}
      : { description: updateMealLogDto.description }),
    ...(updateMealLogDto.note === undefined
      ? {}
      : { note: updateMealLogDto.note }),
  };
}

function toMealLogItemCreateData(
  items: CreateMealLogItemDto[],
): Prisma.MealLogItemCreateWithoutMealLogInput[] {
  return items.map((item) => ({
    foodName: item.foodName,
    portionLabel: item.portionLabel,
    quantity: item.quantity,
    calories: item.calories,
    proteinGrams: item.proteinGrams,
    carbsGrams: item.carbsGrams,
    fatGrams: item.fatGrams,
    confidenceLevel: ConfidenceLevel.VERIFIED,
  }));
}

function toMealLogResponse(mealLog: MealLogWithItems): MealLogResponse {
  return {
    id: mealLog.id,
    mealType: mealLog.mealType,
    description: mealLog.description,
    totalCalories: Number(mealLog.totalCalories),
    totalProteinGrams: Number(mealLog.totalProteinGrams),
    totalCarbsGrams:
      mealLog.totalCarbsGrams === null ? null : Number(mealLog.totalCarbsGrams),
    totalFatGrams:
      mealLog.totalFatGrams === null ? null : Number(mealLog.totalFatGrams),
    status: mealLog.status,
    confidenceLevel: mealLog.confidenceLevel,
    source: mealLog.source,
    loggedAt: mealLog.loggedAt,
    note: mealLog.note,
    createdAt: mealLog.createdAt,
    updatedAt: mealLog.updatedAt,
    items: mealLog.items.map(toMealLogItemResponse),
  };
}

function toMealLogItemResponse(item: MealLogItemSafe): MealLogItemResponse {
  return {
    id: item.id,
    foodName: item.foodName,
    portionLabel: item.portionLabel,
    quantity: item.quantity === null ? null : Number(item.quantity),
    calories: Number(item.calories),
    proteinGrams: Number(item.proteinGrams),
    carbsGrams: item.carbsGrams === null ? null : Number(item.carbsGrams),
    fatGrams: item.fatGrams === null ? null : Number(item.fatGrams),
    confidenceLevel: item.confidenceLevel,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
