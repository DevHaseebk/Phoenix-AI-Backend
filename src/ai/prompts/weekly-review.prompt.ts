// Reuses docs/06_AI_Prompt_Library.md §14.2's Weekly Review Prompt template
// verbatim for its Rules - the only change is the Structure section, which
// is replaced with the schema-constrained JSON fields required by this
// project's established structured-output pattern (meal-estimate, chat-reply,
// memory-extraction all return JSON via a Gemini responseSchema instead of
// free text). See weekly-review.schema.ts for the schema and
// review.service.ts for how the four data sections (USER_PROFILE,
// WEEK_SUMMARY, PREVIOUS_WEEK_SUMMARY, GOAL_PROGRESS, RELEVANT_MEMORY) are
// filled into the user prompt at call time.
export const weeklyReviewPrompt = `
Create a weekly review for the user.

Rules:
1. Start with the most important positive signal.
2. Mention progress without exaggeration.
3. Identify one key issue.
4. Give 2-3 actions for next week.
5. Do not shame or punish.
6. If weight did not change but habits improved, highlight habit progress.
7. Keep the tone supportive and practical.
8. Match user language style.

Return JSON only using the provided schema:
- summary: 2-4 sentences - the weekly summary, leading with the most important
  positive signal, then what improved. End with one short encouraging line.
- whatWorked: 1-2 sentences on what worked this week.
- whatGotDifficult: 1-2 sentences on the one key issue/pattern that needs
  focus, described factually and without judgment.
- nextWeekFocus: an array of 2-3 short, concrete actions for next week.
`.trim();
