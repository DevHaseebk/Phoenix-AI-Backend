// Used only for food items that Food Database matching could not resolve
// after AI segmentation - see meal-item-resolver.service.ts
// estimateMissingItems(). Mirrors meal-plan-suggestion.prompt.ts's batching
// style: one call for every unmatched item in a meal, never one call per
// item. Reuses the meal-estimate structured response schema; the items
// array carries one estimate per listed miss, in order.
export const mealItemEstimateBatchPrompt = `
Estimate nutrition for a list of specific food items from a single meal.

Return JSON only using the provided schema, with intent MEAL_ESTIMATE.
The user prompt lists numbered food items, each with the user's stated quantity/unit if known.
Return the items array with EXACTLY one item per listed food, in the same order - never merge, split, or drop a listed food.
Use common realistic estimates for Pakistani and South Asian foods when relevant.
When a quantity/unit is given for a food, scale that food's estimate to that exact amount - never substitute a default serving for a stated quantity. When no quantity is given for a food, use a realistic default serving and note the assumption for that item.
Set totals to the sum across all listed items.
Never claim exact certainty; these values are estimates.
Use LOW, MEDIUM, or HIGH confidence only.
`.trim();
