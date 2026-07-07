import { AiSafetyFlags } from '../ai-provider.interface';

const safetyRules: Array<{ category: string; pattern: RegExp }> = [
  {
    category: 'SELF_HARM',
    pattern: /\b(suicide|kill myself|end my life|self harm|hurt myself)\b/i,
  },
  {
    category: 'EATING_DISORDER',
    pattern: /\b(purge|vomit after eating|laxative|starve|not eat for days)\b/i,
  },
  {
    category: 'EXTREME_DIETING',
    pattern:
      /\b(500 calories|600 calories|700 calories|water fast|dry fast)\b/i,
  },
  {
    category: 'MEDICATION_DOSING',
    pattern: /\b(ozempic|insulin|metformin|dose|dosage|injection)\b/i,
  },
];

export function detectSafetyFlags(message: string): AiSafetyFlags {
  const categories = safetyRules
    .filter((rule) => rule.pattern.test(message))
    .map((rule) => rule.category);

  return {
    blocked: categories.length > 0,
    categories,
    ...(categories.length === 0
      ? {}
      : {
          message:
            'I cannot help with unsafe medical, medication, purging, starvation, or self-harm instructions. Please speak with a qualified professional or local emergency support if you may be in danger.',
        }),
  };
}
