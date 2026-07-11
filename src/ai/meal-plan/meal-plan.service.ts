import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FoodSource, MealPlanStatus, Prisma, UserStatus } from '@prisma/client';
import { AI_PROVIDER } from '../ai-provider.interface';
import type { AiProvider } from '../ai-provider.interface';
import { mealPlanSuggestionPrompt } from '../prompts/meal-plan-suggestion.prompt';
import { formatKnowledgeBlock, RagService } from '../rag/rag.service';
import { normalizeMealEstimate } from '../utils/nutrition-sanity.util';
import {
  getLocalDateForTimezone,
  getTodayRangeForTimezone,
} from '../../dashboard/dashboard-timezone';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildWeekSlotBudgets,
  determineMealsPerDay,
  deriveGroceryList,
  FoodCandidate,
  mealPlanThresholds,
  SelectedMeal,
  selectFoodsForPlan,
  SlotBudget,
} from './meal-plan.util';

/** Meal-anchor categories; beverages/snacks/fruit are not planned as meals. */
const plannableCategories = new Set<string>([
  'MAIN_DISH',
  'PROTEIN',
  'BREAD',
  'DAIRY',
  'VEGETABLE',
]);

export interface MealPlanResponse {
  id: string;
  weekStartDate: string;
  status: MealPlanStatus;
  createdAt: Date;
  mealsPerDay: number;
  days: Array<{
    dayOfWeek: number;
    meals: Array<{
      id: string;
      mealSlotIndex: number;
      mealSlotLabel: string;
      foodDescription: string;
      calories: number;
      proteinGrams: number;
      carbsGrams: number | null;
      fatGrams: number | null;
      source: string;
    }>;
  }>;
  groceryItems: Array<{
    id: string;
    itemName: string;
    note: string | null;
    checked: boolean;
  }>;
}

@Injectable()
export class MealPlanService {
  private readonly logger = new Logger(MealPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    private readonly ragService: RagService,
  ) {}

  async generateForUser(userId: string): Promise<MealPlanResponse> {
    const user = await this.ensureActiveUser(userId);
    const calorieTarget = toNullableNumber(user.profile?.calorieTarget);
    const proteinTargetGrams = toNullableNumber(
      user.profile?.proteinTargetGrams,
    );

    if (calorieTarget === null || proteinTargetGrams === null) {
      throw new BadRequestException(
        'Complete onboarding first so daily calorie and protein targets exist.',
      );
    }

    const timezone = user.profile?.timezone ?? 'Asia/Karachi';
    const mealsPerDay = await this.determineTypicalMealsPerDay(
      userId,
      timezone,
    );
    const slots = buildWeekSlotBudgets(
      calorieTarget,
      proteinTargetGrams,
      mealsPerDay,
    );
    const candidates = await this.loadFoodCandidates();
    const { selected, aiNeededSlots } = selectFoodsForPlan(candidates, slots);

    this.logger.log(
      `Meal plan for user ${userId}: ${selected.length} slots DB-sourced, ${aiNeededSlots.length} slots need AI fallback.`,
    );

    const aiMeals =
      aiNeededSlots.length > 0
        ? await this.suggestMealsViaAi(aiNeededSlots)
        : [];

    const allMeals = [...selected, ...aiMeals].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.mealSlotIndex - b.mealSlotIndex,
    );
    const groceryItems = deriveGroceryList(allMeals);
    const weekStartDate = new Date(
      `${getTodayRangeForTimezone(timezone).date}T00:00:00.000Z`,
    );

    const plan = await this.prisma.$transaction(async (transaction) => {
      await transaction.mealPlan.updateMany({
        where: { userId, status: MealPlanStatus.ACTIVE },
        data: { status: MealPlanStatus.ARCHIVED },
      });

      return transaction.mealPlan.create({
        data: {
          userId,
          weekStartDate,
          status: MealPlanStatus.ACTIVE,
          plannedMeals: {
            create: allMeals.map((meal) => ({
              dayOfWeek: meal.dayOfWeek,
              mealSlotIndex: meal.mealSlotIndex,
              mealSlotLabel: meal.mealSlotLabel,
              foodDescription: meal.foodDescription,
              calories: meal.actualCalories,
              proteinGrams: meal.actualProteinGrams,
              carbsGrams: meal.actualCarbsGrams,
              fatGrams: meal.actualFatGrams,
              source: meal.source,
            })),
          },
          groceryItems: { create: groceryItems },
        },
        include: planInclude,
      });
    });

    return toMealPlanResponse(plan, mealsPerDay);
  }

  async getCurrentPlan(userId: string): Promise<MealPlanResponse | null> {
    await this.ensureActiveUser(userId);

    const plan = await this.prisma.mealPlan.findFirst({
      where: { userId, status: MealPlanStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      include: planInclude,
    });

    if (!plan) {
      return null;
    }

    const mealsPerDay = plan.plannedMeals.reduce(
      (max, meal) => Math.max(max, meal.mealSlotIndex + 1),
      0,
    );

    return toMealPlanResponse(plan, mealsPerDay);
  }

  async setGroceryItemChecked(
    userId: string,
    groceryItemId: string,
    checked: boolean,
  ): Promise<{
    id: string;
    itemName: string;
    note: string | null;
    checked: boolean;
  }> {
    await this.ensureActiveUser(userId);

    const item = await this.prisma.groceryListItem.findFirst({
      where: { id: groceryItemId, mealPlan: { userId } },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('Grocery list item not found');
    }

    const updated = await this.prisma.groceryListItem.update({
      where: { id: groceryItemId },
      data: { checked },
      select: { id: true, itemName: true, note: true, checked: true },
    });

    return updated;
  }

  /** Distinct-meal counts per local day over the last 14 days (logged days only). */
  private async determineTypicalMealsPerDay(
    userId: string,
    timezone: string,
  ): Promise<number> {
    const since = new Date(
      Date.now() - mealPlanThresholds.historyDays * 24 * 60 * 60 * 1000,
    );
    const mealLogs = await this.prisma.mealLog.findMany({
      where: { userId, loggedAt: { gte: since } },
      select: { loggedAt: true },
    });

    const countsByDay = new Map<string, number>();
    for (const log of mealLogs) {
      const localDate = getLocalDateForTimezone(log.loggedAt, timezone);
      countsByDay.set(localDate, (countsByDay.get(localDate) ?? 0) + 1);
    }

    return determineMealsPerDay(Array.from(countsByDay.values()));
  }

  private async loadFoodCandidates(): Promise<FoodCandidate[]> {
    const items = await this.prisma.foodItem.findMany();

    return items
      .filter((item) => plannableCategories.has(item.category))
      .map((item) => {
        const servingGrams = Number(item.defaultServingGrams);
        const scale = servingGrams / 100;

        return {
          id: item.id,
          name: item.name,
          caloriesPerServing: Number(item.caloriesPer100g) * scale,
          proteinPerServing: Number(item.proteinPer100g) * scale,
          carbsPerServing:
            item.carbsPer100g === null
              ? null
              : Number(item.carbsPer100g) * scale,
          fatPerServing:
            item.fatPer100g === null ? null : Number(item.fatPer100g) * scale,
          servingDescription: item.defaultServingDescription,
          preferred:
            item.source === FoodSource.AI_ESTIMATE ||
            item.source === FoodSource.FOUNDER_REVIEWED,
        };
      });
  }

  /**
   * One batched AI call for every slot the Food DB couldn't fill (never one
   * call per slot - token efficiency). Reuses the meal-estimate structured
   * schema: the model returns items[] with one dish per requested slot, in
   * order. If the provider is down or returns a mismatched count, remaining
   * slots degrade to a budget-echo placeholder so plan generation never
   * fails outright over the AI leg.
   */
  private async suggestMealsViaAi(
    slots: SlotBudget[],
  ): Promise<SelectedMeal[]> {
    let suggestions: Array<{
      name: string;
      calories: number;
      proteinGrams: number;
      carbsGrams: number;
      fatGrams: number;
    }> = [];

    try {
      const knowledgeChunks = await this.ragService.retrieveRelevantChunks(
        'balanced pakistani meal ideas breakfast lunch dinner protein portions',
        3,
      );
      const knowledgeSection =
        knowledgeChunks.length > 0
          ? `\n\nFood knowledge (general reference material; not user data):\n${formatKnowledgeBlock(knowledgeChunks)}`
          : '';
      const slotList = slots
        .map(
          (slot, index) =>
            `${index + 1}. Day ${slot.dayOfWeek + 1}, ${slot.mealSlotLabel}: about ${slot.calories} kcal and ${slot.proteinGrams}g protein`,
        )
        .join('\n');
      const providerResponse = await this.aiProvider.generateMealEstimate({
        systemPrompt: mealPlanSuggestionPrompt,
        userPrompt: `Suggest exactly one realistic dish for each of these ${slots.length} meal slots. Return the items array with exactly one item per slot, in the same order:${knowledgeSection}\n\nSlots:\n${slotList}`,
        model: this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash',
        timeoutMs: Number(this.config.get<string>('AI_TIMEOUT_MS') ?? '30000'),
      });
      suggestions = normalizeMealEstimate(providerResponse.structured)
        .structured.items;
    } catch (error) {
      this.logger.warn(
        `AI meal-plan fallback failed, using budget placeholders: ${String(error)}`,
      );
    }

    return slots.map((slot, index) => {
      const suggestion = suggestions[index];

      if (!suggestion) {
        return {
          ...slot,
          source: 'AI_ESTIMATE' as const,
          foodDescription: `Balanced home-style meal (aim ~${slot.calories} kcal, ${slot.proteinGrams}g protein)`,
          actualCalories: slot.calories,
          actualProteinGrams: slot.proteinGrams,
          actualCarbsGrams: null,
          actualFatGrams: null,
        };
      }

      return {
        ...slot,
        source: 'AI_ESTIMATE' as const,
        foodDescription: suggestion.name,
        actualCalories: Math.round(suggestion.calories),
        actualProteinGrams: Math.round(suggestion.proteinGrams * 10) / 10,
        actualCarbsGrams: Math.round(suggestion.carbsGrams * 10) / 10,
        actualFatGrams: Math.round(suggestion.fatGrams * 10) / 10,
      };
    });
  }

  private async ensureActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        deletedAt: true,
        profile: {
          select: {
            calorieTarget: true,
            proteinTargetGrams: true,
            timezone: true,
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      throw new UnauthorizedException('Unauthorized');
    }

    return user;
  }
}

const planInclude = {
  plannedMeals: {
    orderBy: [{ dayOfWeek: 'asc' }, { mealSlotIndex: 'asc' }],
  },
  groceryItems: {
    orderBy: { itemName: 'asc' },
  },
} satisfies Prisma.MealPlanInclude;

type PlanWithRelations = Prisma.MealPlanGetPayload<{
  include: typeof planInclude;
}>;

function toMealPlanResponse(
  plan: PlanWithRelations,
  mealsPerDay: number,
): MealPlanResponse {
  const days: MealPlanResponse['days'] = [];

  for (const meal of plan.plannedMeals) {
    let day = days.find((entry) => entry.dayOfWeek === meal.dayOfWeek);

    if (!day) {
      day = { dayOfWeek: meal.dayOfWeek, meals: [] };
      days.push(day);
    }

    day.meals.push({
      id: meal.id,
      mealSlotIndex: meal.mealSlotIndex,
      mealSlotLabel: meal.mealSlotLabel,
      foodDescription: meal.foodDescription,
      calories: Number(meal.calories),
      proteinGrams: Number(meal.proteinGrams),
      carbsGrams: meal.carbsGrams === null ? null : Number(meal.carbsGrams),
      fatGrams: meal.fatGrams === null ? null : Number(meal.fatGrams),
      source: meal.source,
    });
  }

  return {
    id: plan.id,
    weekStartDate: plan.weekStartDate.toISOString().slice(0, 10),
    status: plan.status,
    createdAt: plan.createdAt,
    mealsPerDay,
    days,
    groceryItems: plan.groceryItems.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      note: item.note,
      checked: item.checked,
    })),
  };
}

function toNullableNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  return value === null || value === undefined ? null : Number(value);
}
