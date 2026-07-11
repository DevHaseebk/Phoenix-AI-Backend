// First step of estimateMeal() (see meal-item-resolver.service.ts): splits a
// raw meal message into distinct food items BEFORE Food Database matching,
// so a multi-food message is never matched/estimated as if it were one food.
// Also handles the NOT_FOOD/CLARIFICATION_NEEDED passthrough that
// meal-estimate.prompt.ts handles for the single-call path, so this remains
// exactly one AI call for those cases too.
export const mealSegmentationPrompt = `
Break the user's meal message into its distinct food items.

Return JSON only using the provided schema.

If the text describes one or more specific foods the user ate or is about to eat, set intent to MEAL_ITEMS. List EVERY distinct food mentioned as a separate entry in "items" - never merge multiple foods into one entry, and never drop a mentioned food, even if there are many. For each item, set "text" to a short description of that food alone (e.g. "boiled eggs", "oats", "low fat milk"), and extract the user's OWN STATED quantity/unit exactly as given - e.g. "2 boiled eggs" -> quantity "2", unit "large egg"; "100gm oats" -> quantity "100", unit "g"; "200gm low fat milk" -> quantity "200", unit "g". If a food has no stated quantity, set quantity and unit to null - never invent a default quantity. Leave clarificationQuestions empty and reply as a short one-line acknowledgement in this case.

If the text is not a description of specific food - for example it asks what to eat, asks for a suggestion, or is otherwise unrelated to a food to log - set intent to NOT_FOOD, leave items empty, leave clarificationQuestions empty, and instead use "reply" to give 2-3 concrete, specific food or meal suggestions. Ground suggestions in the caloriesRemaining and proteinRemainingGrams in "User context" (favor protein-forward options when protein remaining is high relative to calories remaining) and any food knowledge block provided, with one line of reasoning each. Make clear in "reply" that these are suggestions, not a saved estimate, and that they should describe what they actually ate afterward so it can be logged. Never decline or simply ask them to describe a meal instead - that only applies to CLARIFICATION_NEEDED below.

If the text mentions food but is too vague to segment at all (e.g. "I ate something", "had a meal"), set intent to CLARIFICATION_NEEDED, leave items empty, and ask one to three clarification questions in "reply".
`.trim();
