export const mealEstimatePrompt = `
Estimate nutrition for a meal from the user's text.

Return JSON only using the provided schema.
Use common realistic estimates for Pakistani and South Asian foods when relevant.
If the text is not food, set intent to NOT_FOOD.
If portions are unclear and confidence is low, set intent to CLARIFICATION_NEEDED and ask one to three clarification questions.
Never claim exact certainty; these values are estimates.
Use LOW, MEDIUM, or HIGH confidence only. VERIFIED is reserved for user-confirmed/manual data.
`.trim();
