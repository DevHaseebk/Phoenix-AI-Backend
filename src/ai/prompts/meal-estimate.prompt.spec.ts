import { mealEstimatePrompt } from './meal-estimate.prompt';

describe('mealEstimatePrompt', () => {
  it('routes suggestion-style requests (not a food description) to concrete suggestions instead of a bare decline', () => {
    expect(mealEstimatePrompt).toMatch(/asks what to eat/i);
    expect(mealEstimatePrompt).toMatch(
      /2-3 concrete, specific food or meal suggestions/i,
    );
    expect(mealEstimatePrompt).toMatch(
      /Never decline or simply ask them to describe a meal instead/i,
    );
  });

  it('grounds NOT_FOOD suggestions in remaining calories/protein already in context', () => {
    expect(mealEstimatePrompt).toMatch(/caloriesRemaining/);
    expect(mealEstimatePrompt).toMatch(/proteinRemainingGrams/);
  });

  it('keeps CLARIFICATION_NEEDED reserved for genuine food-description ambiguity, not suggestion requests', () => {
    expect(mealEstimatePrompt).toMatch(
      /does describe specific food but portions are unclear/i,
    );
  });

  it('still estimates normal food descriptions with intent MEAL_ESTIMATE', () => {
    expect(mealEstimatePrompt).toMatch(
      /describes food the user ate or is about to eat, estimate it normally with intent MEAL_ESTIMATE/i,
    );
  });
});
