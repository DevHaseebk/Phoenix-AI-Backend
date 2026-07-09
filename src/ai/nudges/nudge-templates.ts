import type { NudgeType } from './nudge-rules.util';

export type NudgeLanguage = 'en' | 'roman-ur';

const templates: Record<NudgeType, Record<NudgeLanguage, string>> = {
  WEIGHT_UPDATE_DUE: {
    en: "⚖ It's been a few days - want to log an updated weight?",
    'roman-ur': '⚖ Weight update ka din hai. Update karna chahoge?',
  },
  MEAL_LOGGING_GAP: {
    en: '🍽 No meal logged yet today - want to do a quick log?',
    'roman-ur': '🍽 Aaj tak koi meal log nahi hua. Quick log kar dein?',
  },
  WATER_TARGET_CLOSE: {
    en: "💧 Just a little more water and today's target is done.",
    'roman-ur': '💧 Thora sa aur pani se aaj ka target complete ho jayega.',
  },
  COMEBACK_WELCOME: {
    en: "👋 Good to see you back - no catching up needed, let's just start today.",
    'roman-ur':
      '👋 Wapas dekh kar acha laga - purani baat chhodein, bas aaj se shuru karte hain.',
  },
};

// Simple, deliberately imperfect heuristic (fixed templates, no AI call):
// a handful of common Roman Urdu function words. Two or more matches in the
// user's most recent message picks the Roman Urdu template; otherwise
// English is the default. Good enough for MVP - not a language detector.
const romanUrduMarkers = [
  'hai',
  'hain',
  'kya',
  'aap',
  'mein',
  'kar',
  'kro',
  'karo',
  'nahi',
  'chahiye',
  'raha',
  'rahi',
  'karta',
  'karti',
  'wala',
  'thora',
  'bhai',
];

export function detectNudgeLanguage(
  recentUserMessage: string | null | undefined,
): NudgeLanguage {
  if (!recentUserMessage) {
    return 'en';
  }

  const words = recentUserMessage.toLowerCase().split(/\W+/);
  const matches = words.filter((word) => romanUrduMarkers.includes(word));

  return matches.length >= 2 ? 'roman-ur' : 'en';
}

export function renderNudgeTemplate(
  type: NudgeType,
  language: NudgeLanguage,
): string {
  return templates[type][language];
}
