import { LocalAiProvider } from './local-ai.provider';

describe('LocalAiProvider', () => {
  it('returns clearly labeled local fallback chat content', async () => {
    const provider = new LocalAiProvider();
    const response = await provider.generateCoachReply({
      systemPrompt: 'system',
      userPrompt: 'hello',
      model: 'local',
      timeoutMs: 1000,
    });

    expect(response.content).toContain('[Local AI fallback]');
    expect(response.model).toBe('local');
  });

  it('returns non-confirmable low confidence meal estimate fallback', async () => {
    const provider = new LocalAiProvider();
    const response = await provider.generateMealEstimate({
      systemPrompt: 'system',
      userPrompt: 'lunch biryani',
      model: 'local',
      timeoutMs: 1000,
    });

    expect(response.structured.intent).toBe('CLARIFICATION_NEEDED');
    expect(response.structured.confidenceLevel).toBe('LOW');
    expect(response.structured.items).toEqual([]);
    expect(response.structured.warnings[0]).toContain('local-development');
  });
});
