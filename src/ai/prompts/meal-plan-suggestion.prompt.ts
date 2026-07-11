// Used only by the meal-plan generation AI fallback (one batched call per
// plan, and only for slots the Food Database couldn't fill) - see
// meal-plan.service.ts suggestMealsViaAi(). Reuses the meal-estimate
// structured response schema; the items array carries one suggested dish
// per requested slot, in order.
export const mealPlanSuggestionPrompt = `
Suggest realistic meals for a weekly meal plan.

Return JSON only using the provided schema, with intent MEAL_ESTIMATE.
The user prompt lists numbered meal slots, each with a calorie and protein budget.
Return the items array with EXACTLY one item per listed slot, in the same order.
Each item's name is a specific, realistic dish (prefer Pakistani/South Asian home
cooking - roti, salan, daal, sabzi, rice dishes - unless a budget clearly suits
something else). Each item's calories and proteinGrams should approximate that
slot's stated budget. Include realistic carbsGrams and fatGrams.
Vary the dishes - do not repeat the same dish for every slot.
Use quantityText for the portion (e.g. "1 plate", "2 roti with 1 bowl salan").
Never claim exact certainty; these values are estimates.
Use LOW, MEDIUM, or HIGH confidence only.
`.trim();
