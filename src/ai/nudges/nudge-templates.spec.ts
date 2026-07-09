import { detectNudgeLanguage, renderNudgeTemplate } from './nudge-templates';

describe('detectNudgeLanguage', () => {
  it('detects Roman Urdu when 2+ marker words are present', () => {
    expect(
      detectNudgeLanguage('main aaj bahut khush hoon kya aap thek hain'),
    ).toBe('roman-ur');
  });

  it('defaults to English when fewer than 2 markers are present', () => {
    expect(detectNudgeLanguage('what should I eat for lunch today')).toBe('en');
  });

  it('defaults to English when there is no recent message', () => {
    expect(detectNudgeLanguage(null)).toBe('en');
    expect(detectNudgeLanguage(undefined)).toBe('en');
    expect(detectNudgeLanguage('')).toBe('en');
  });
});

describe('renderNudgeTemplate', () => {
  it('renders every nudge type in both languages without crashing', () => {
    const types = [
      'WEIGHT_UPDATE_DUE',
      'MEAL_LOGGING_GAP',
      'WATER_TARGET_CLOSE',
      'COMEBACK_WELCOME',
    ] as const;

    for (const type of types) {
      expect(renderNudgeTemplate(type, 'en').length).toBeGreaterThan(0);
      expect(renderNudgeTemplate(type, 'roman-ur').length).toBeGreaterThan(0);
    }
  });

  it('renders the exact expected water template text', () => {
    expect(renderNudgeTemplate('WATER_TARGET_CLOSE', 'roman-ur')).toBe(
      '💧 Thora sa aur pani se aaj ka target complete ho jayega.',
    );
  });
});
