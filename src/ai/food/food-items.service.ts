import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FoodCategory,
  FoodDataConfidence,
  FoodSource,
  Prisma,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeFoodText } from './utils/food-normalize.util';

export interface UpdateFoodItemNutritionInput {
  caloriesPer100g?: number;
  proteinPer100g?: number;
  carbsPer100g?: number;
  fatPer100g?: number;
  defaultServingGrams?: number;
}

export interface ListFoodItemsForReviewInput {
  source?: FoodSource;
  verified?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface FoodItemListItem {
  id: string;
  name: string;
  category: FoodCategory;
  caloriesPer100g: Prisma.Decimal;
  proteinPer100g: Prisma.Decimal;
  carbsPer100g: Prisma.Decimal | null;
  fatPer100g: Prisma.Decimal | null;
  confidence: FoodDataConfidence;
  source: FoodSource;
  verified: boolean;
  updatedAt: Date;
}

export interface CreateFoodItemInput {
  name: string;
  category: FoodCategory;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g?: number;
  fatPer100g?: number;
  defaultServingDescription: string;
  defaultServingGrams: number;
  confidence: FoodDataConfidence;
  source: FoodSource;
  verified: boolean;
  /** Extra alternate spellings, beyond the food's own normalized name. */
  aliases?: string[];
}

interface NutritionSnapshot {
  caloriesPer100g: Prisma.Decimal;
  proteinPer100g: Prisma.Decimal;
  carbsPer100g: Prisma.Decimal | null;
  fatPer100g: Prisma.Decimal | null;
  defaultServingGrams: Prisma.Decimal;
}

/** Decimal fields aren't plain-JSON per Prisma.InputJsonValue's type - audit
 * metadata needs numbers, not Decimal instances. */
function serializeNutritionSnapshot(snapshot: NutritionSnapshot) {
  return {
    caloriesPer100g: snapshot.caloriesPer100g.toNumber(),
    proteinPer100g: snapshot.proteinPer100g.toNumber(),
    carbsPer100g: snapshot.carbsPer100g?.toNumber() ?? null,
    fatPer100g: snapshot.fatPer100g?.toNumber() ?? null,
    defaultServingGrams: snapshot.defaultServingGrams.toNumber(),
  };
}

/**
 * Every FoodItem is created with its own normalized name as an alias (plus
 * any extras given) so food-matching.service.ts only ever needs to query
 * FoodAlias, never FoodItem.name directly.
 */
@Injectable()
export class FoodItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(input: CreateFoodItemInput) {
    const aliasTexts = new Set<string>();
    const selfAlias = normalizeFoodText(input.name);

    if (selfAlias) {
      aliasTexts.add(selfAlias);
    }

    for (const alias of input.aliases ?? []) {
      const normalized = normalizeFoodText(alias);
      if (normalized) {
        aliasTexts.add(normalized);
      }
    }

    return this.prisma.foodItem.create({
      data: {
        name: input.name,
        category: input.category,
        caloriesPer100g: input.caloriesPer100g,
        proteinPer100g: input.proteinPer100g,
        carbsPer100g: input.carbsPer100g,
        fatPer100g: input.fatPer100g,
        defaultServingDescription: input.defaultServingDescription,
        defaultServingGrams: input.defaultServingGrams,
        confidence: input.confidence,
        source: input.source,
        verified: input.verified,
        aliases: {
          create: Array.from(aliasTexts).map((alias) => ({ alias })),
        },
      },
      include: { aliases: true },
    });
  }

  /** Nutrition-only edit for an already-approved FoodItem (Unknown Foods
   * "Edit" action, Approved tab) - never touches name/category/aliases, so
   * food-matching.service.ts's alias lookups are unaffected by a correction
   * here. Only the fields actually present in `patch` are updated. */
  async update(
    id: string,
    patch: UpdateFoodItemNutritionInput,
    adminUserId: string,
  ): Promise<Prisma.FoodItemGetPayload<{ include: { aliases: true } }>> {
    const before = await this.prisma.foodItem.findUnique({
      where: { id },
      select: {
        caloriesPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
        defaultServingGrams: true,
      },
    });

    let updated: Prisma.FoodItemGetPayload<{ include: { aliases: true } }>;

    try {
      updated = await this.prisma.foodItem.update({
        where: { id },
        data: {
          ...(patch.caloriesPer100g === undefined
            ? {}
            : { caloriesPer100g: patch.caloriesPer100g }),
          ...(patch.proteinPer100g === undefined
            ? {}
            : { proteinPer100g: patch.proteinPer100g }),
          ...(patch.carbsPer100g === undefined
            ? {}
            : { carbsPer100g: patch.carbsPer100g }),
          ...(patch.fatPer100g === undefined
            ? {}
            : { fatPer100g: patch.fatPer100g }),
          ...(patch.defaultServingGrams === undefined
            ? {}
            : { defaultServingGrams: patch.defaultServingGrams }),
        },
        include: { aliases: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Food item not found');
      }

      throw error;
    }

    await this.auditLog.record({
      adminUserId,
      action: 'food-item.edit',
      targetType: 'FoodItem',
      targetId: id,
      metadata: {
        before: before ? serializeNutritionSnapshot(before) : null,
        after: patch,
      },
    });

    return updated;
  }

  /**
   * Food Database Review (admin-only) list - defaults to the review queue
   * itself (source: AI_ESTIMATE, verified: false) when the caller doesn't
   * specify, per the task's own "surface the review queue by default"
   * instruction; an explicit source/verified in the query overrides that
   * default (e.g. to browse already-reviewed items).
   */
  async listForReview(input: ListFoodItemsForReviewInput): Promise<{
    items: FoodItemListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = input.page ?? 1;
    const limit = input.limit ?? 20;
    const source = input.source ?? FoodSource.AI_ESTIMATE;
    const verified = input.verified ?? false;
    const search = input.search?.trim();
    const where: Prisma.FoodItemWhereInput = {
      source,
      verified,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.foodItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          category: true,
          caloriesPer100g: true,
          proteinPer100g: true,
          carbsPer100g: true,
          fatPer100g: true,
          confidence: true,
          source: true,
          verified: true,
          updatedAt: true,
        },
      }),
      this.prisma.foodItem.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Food Database Review's individual "Edit" action - same nutrition-only
   * patch as update() (never touches name/category/aliases), but always
   * reclassifies to verified: true / source: FOUNDER_REVIEWED, since an
   * admin editing an AI_ESTIMATE item's values is exactly what founder
   * review means. Kept as a separate method rather than an update() flag so
   * the Unknown Foods "Edit" flow (already-approved items, already
   * verified) can never accidentally start rewriting `source`.
   */
  async reviewUpdate(
    id: string,
    patch: UpdateFoodItemNutritionInput,
    adminUserId: string,
  ): Promise<Prisma.FoodItemGetPayload<{ include: { aliases: true } }>> {
    const before = await this.prisma.foodItem.findUnique({
      where: { id },
      select: {
        caloriesPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
        defaultServingGrams: true,
        verified: true,
        source: true,
      },
    });

    let updated: Prisma.FoodItemGetPayload<{ include: { aliases: true } }>;

    try {
      updated = await this.prisma.foodItem.update({
        where: { id },
        data: {
          ...(patch.caloriesPer100g === undefined
            ? {}
            : { caloriesPer100g: patch.caloriesPer100g }),
          ...(patch.proteinPer100g === undefined
            ? {}
            : { proteinPer100g: patch.proteinPer100g }),
          ...(patch.carbsPer100g === undefined
            ? {}
            : { carbsPer100g: patch.carbsPer100g }),
          ...(patch.fatPer100g === undefined
            ? {}
            : { fatPer100g: patch.fatPer100g }),
          ...(patch.defaultServingGrams === undefined
            ? {}
            : { defaultServingGrams: patch.defaultServingGrams }),
          verified: true,
          source: FoodSource.FOUNDER_REVIEWED,
        },
        include: { aliases: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Food item not found');
      }

      throw error;
    }

    await this.auditLog.record({
      adminUserId,
      action: 'food-item.review-update',
      targetType: 'FoodItem',
      targetId: id,
      metadata: {
        before: before
          ? {
              ...serializeNutritionSnapshot(before),
              verified: before.verified,
              source: before.source,
            }
          : null,
        after: {
          ...patch,
          verified: true,
          source: FoodSource.FOUNDER_REVIEWED,
        },
      },
    });

    return updated;
  }

  /**
   * Bulk-accept-as-is: marks exactly the given ids verified/FOUNDER_REVIEWED
   * WITHOUT touching any nutrition value - for items a founder judges
   * already correct without editing each one individually.
   */
  async bulkApprove(
    ids: string[],
    adminUserId: string,
  ): Promise<{ count: number }> {
    if (ids.length === 0) {
      return { count: 0 };
    }

    const result = await this.prisma.foodItem.updateMany({
      where: { id: { in: ids } },
      data: { verified: true, source: FoodSource.FOUNDER_REVIEWED },
    });

    await this.auditLog.record({
      adminUserId,
      action: 'food-item.bulk-approve',
      targetType: 'FoodItem',
      targetId: ids.join(','),
      metadata: { ids, count: result.count },
    });

    return result;
  }
}
