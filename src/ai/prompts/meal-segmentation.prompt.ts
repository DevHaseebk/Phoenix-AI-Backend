// First step of estimateMeal() and of chat()'s logging interception (see
// meal-item-resolver.service.ts): unified day-activity segmentation. Splits a
// raw message into distinct FOOD and EXERCISE items BEFORE Food Database
// matching, so a multi-item message is never matched/estimated as if it were
// one food and exercise mentions are never silently dropped. Also resolves
// relative date phrasing ("kal", "yesterday", "parso") to absolute per-item
// dates using the "Date context" block injected into the user prompt.
// Handles the NOT_FOOD/CLARIFICATION_NEEDED passthrough that
// meal-estimate.prompt.ts handles for the single-call path, so this remains
// exactly one AI call for those cases too.
export const mealSegmentationPrompt = `
Break the user's message into its distinct loggable day-activity items: foods they ate and exercise they did.

Return JSON only using the provided schema.

If the text describes one or more specific foods the user ate (or is about to eat) and/or specific exercise they did, set intent to MEAL_ITEMS. List EVERY distinct food AND every distinct exercise activity mentioned as a separate entry in "items" - never merge multiple items into one entry, and never drop a mentioned item, even if there are many. Leave clarificationQuestions empty and set reply to a short one-line acknowledgement in this case.

For each FOOD item: set itemType to "FOOD", set "text" to a short description of that food alone (e.g. "boiled eggs", "oats", "low fat milk"), and extract the user's OWN STATED quantity/unit exactly as given - e.g. "2 boiled eggs" -> quantity "2", unit "large egg"; "100gm oats" -> quantity "100", unit "g". If a food has no stated quantity, set quantity and unit to null - never invent a default quantity. Set mealSlot to BREAKFAST/LUNCH/DINNER/SNACK when the user assigned the food to a meal of the day ("in breakfast I had...", "dinner mein..."), otherwise null. Leave durationMinutes, distanceKm and steps null for food.

For each EXERCISE item: set itemType to "EXERCISE", set "text" to a short description of the activity alone (e.g. "walk", "gym workout", "cricket"), and extract the user's OWN STATED numbers only: durationMinutes (e.g. "30 min walk" -> 30, "1 hour" -> 60), distanceKm (e.g. "3 km" -> 3), steps (e.g. "5000 steps" -> 5000). Set any number the user did not state to null - never invent one. Two separate sessions of the same activity ("morning walk and evening walk") are two separate items. Leave quantity, unit and mealSlot null for exercise.

Per-item date resolution: the user prompt includes a "Date context" block with today's actual local date and the dates for yesterday and the day before. For EACH item, set "date" to the absolute date (YYYY-MM-DD) that item belongs to, resolving relative phrasing in any language style: "aaj"/"today"/"this morning"/"subah" -> today's date; "kal"/"yesterday"/"last day"/"last night"/"raat ko" (when clearly about the previous day) -> yesterday's date; "parso"/"day before yesterday" -> the day before yesterday's date. A single message can span multiple days - resolve each item's date independently. If an item's day is not stated at all, set date to null (the app treats null as today). Note: "kal" means yesterday when the eating/exercise already happened (past tense: "khaya tha", "walk ki"), which is the normal case for logging; never resolve a loggable item to a future date.

If the text is not a description of specific food eaten or exercise done - for example it asks what to eat, asks for a suggestion, or is otherwise unrelated to something to log - set intent to NOT_FOOD, leave items empty, leave clarificationQuestions empty, and instead use "reply" to give 2-3 concrete, specific food or meal suggestions. Ground suggestions in the caloriesRemaining and proteinRemainingGrams in "User context" (favor protein-forward options when protein remaining is high relative to calories remaining) and any food knowledge block provided, with one line of reasoning each. Make clear in "reply" that these are suggestions, not a saved estimate, and that they should describe what they actually ate afterward so it can be logged. Never decline or simply ask them to describe a meal instead - that only applies to CLARIFICATION_NEEDED below.

If the text mentions food or exercise but is too vague to segment at all (e.g. "I ate something", "had a meal", "did some exercise"), set intent to CLARIFICATION_NEEDED, leave items empty, and ask one to three clarification questions in "reply".
`.trim();
