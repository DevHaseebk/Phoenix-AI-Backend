export const mealEstimatePrompt = `
Estimate nutrition for a meal from the user's text.

Return JSON only using the provided schema.
Use common realistic estimates for Pakistani and South Asian foods when relevant.
If the text describes food the user ate or is about to eat, estimate it normally with intent MEAL_ESTIMATE.

If the text is not a description of a specific food - for example it asks what to eat, asks for a suggestion, or is otherwise unrelated to a food to estimate - set intent to NOT_FOOD, leave items as an empty array and totals at zero, leave clarificationQuestions empty, and instead use "reply" to give 2-3 concrete, specific food or meal suggestions. Ground suggestions in the caloriesRemaining and proteinRemainingGrams in "User context" (favor protein-forward options when protein remaining is high relative to calories remaining) and any food knowledge block provided, with one line of reasoning each. Make clear in "reply" that these are suggestions, not a saved estimate, and that they should describe what they actually ate afterward so it can be logged. Never decline or simply ask them to describe a meal instead - that only applies to CLARIFICATION_NEEDED below.

If the text does describe specific food but portions are unclear and confidence is low, set intent to CLARIFICATION_NEEDED and ask one to three clarification questions in "reply".
Never claim exact certainty; these values are estimates.
Use LOW, MEDIUM, or HIGH confidence only. VERIFIED is reserved for user-confirmed/manual data.
`.trim();
