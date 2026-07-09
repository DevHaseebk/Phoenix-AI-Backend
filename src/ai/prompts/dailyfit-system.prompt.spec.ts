import { dailyFitSystemPrompt } from './dailyfit-system.prompt';

describe('dailyFitSystemPrompt', () => {
  it('instructs the model to give concrete suggestions for coaching questions instead of declining', () => {
    expect(dailyFitSystemPrompt).toMatch(
      /give 2-3 concrete, specific food or meal suggestions/i,
    );
    expect(dailyFitSystemPrompt).toMatch(/never decline/i);
    expect(dailyFitSystemPrompt).toMatch(
      /never redirect them to "tell me what you ate"/i,
    );
  });

  it('grounds suggestions in remaining calories/protein and coaching knowledge already in context', () => {
    expect(dailyFitSystemPrompt).toMatch(/caloriesRemaining/);
    expect(dailyFitSystemPrompt).toMatch(/proteinRemainingGrams/);
    expect(dailyFitSystemPrompt).toMatch(/Coaching knowledge/);
    expect(dailyFitSystemPrompt).toMatch(/recentMealLogs/);
  });

  it('distinguishes logging language from coaching questions without claiming to auto-log', () => {
    expect(dailyFitSystemPrompt).toMatch(/Logging language/i);
    expect(dailyFitSystemPrompt).toMatch(/do not claim to have logged/i);
  });

  it('scopes the clarification-question rule away from suggestion requests', () => {
    expect(dailyFitSystemPrompt).toMatch(
      /never use it to avoid giving a concrete answer to a coaching\/suggestion question/i,
    );
  });
});
