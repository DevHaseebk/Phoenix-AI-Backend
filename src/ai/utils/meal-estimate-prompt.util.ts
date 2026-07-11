import { MealEstimateDto } from '../dto/meal-estimate.dto';

/** Shared by the legacy single-call AI path and the segmentation/batch-estimate calls in meal-item-resolver.service.ts. */
export function buildMealEstimatePrompt(dto: MealEstimateDto): string {
  return JSON.stringify({
    message: dto.message,
    mealType: dto.mealType ?? null,
    loggedAt: dto.loggedAt ?? null,
  });
}
