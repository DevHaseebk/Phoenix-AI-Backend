// Deterministic (zero-AI-call) pre-filter for chat(): decides whether a
// general chat message plausibly describes food eaten or exercise done, and
// therefore should go through the shared day-activity estimate pipeline
// (review-before-log card) instead of a plain coaching reply. Backend-first
// by design (CLAUDE.md §4): only messages that pass this filter spend the
// segmentation AI call. False positives degrade gracefully (segmentation
// answers NOT_FOOD and chat falls through to the normal coaching reply, at
// the cost of one extra AI call); false negatives behave exactly like the
// app did before this feature (coach reply asks the user to log it).

// Strong signals: past-tense logging language. These intercept regardless of
// phrasing - "kal maine biryani khai", "I ate 2 eggs", "30 min walk ki".
const strongPatterns: RegExp[] = [
  // English food logging verbs.
  /\b(ate|eaten|drank)\b/,
  // "had 2 eggs", "had a burger", "just had some rice" - "had" alone is far
  // too common ("had a bad day"); segmentation rejects any non-food match.
  /\bhad\s+(a|an|two|three|four|some|\d)/,
  // Roman Urdu food logging verbs.
  /\b(khaya|khayi|khai|khaye|khaliya)\b/,
  /\b(piya|piyi|peeya)\b/,
  /\bpi\s+li\b/,
  // Past-tense exercise, English and Roman Urdu.
  /\b(walked|jogged|cycled|worked\s+out|exercised)\b/,
  /\b(walk|jog|run|gym|workout|exercise|cycling|sair|kasrat|warzish)\s+(ki|kiya|kari|karli|kar\s+li|done)\b/,
  /\b\d[\d,]*\s*steps\b/,
];

// Weak signals: day-activity nouns that appear in logging messages ("my last
// day: breakfast eggs, lunch rice...") but just as often in coaching
// questions ("what should I eat for lunch?").
const weakPatterns: RegExp[] = [
  /\b(breakfast|brunch|lunch|dinner|snacks?)\b/,
  /\b(nashta|nashtay|nashte)\b/,
  /\b(walk|walking|jog|jogging|running|gym|workout|treadmill|cycling)\b/,
  /\b(cricket|football|badminton|swimming|swam)\b/,
  /\b(sair|chahalqadmi|kasrat|warzish)\b/,
];

// A weak signal inside a question/suggestion-seeking message is coaching,
// not logging - skip interception so those turns keep costing exactly one
// AI call (the coach reply), same as before this feature.
const questionIndicators =
  /\?|\b(what|which|when|should|shall|suggest|recommend|idea|plan|can\s+i|could\s+i|kya|kaunsa|kab|batao|bata\s+do)\b/;

export function containsLoggableContent(message: string): boolean {
  const lower = message.toLowerCase();

  if (strongPatterns.some((pattern) => pattern.test(lower))) {
    return true;
  }

  return (
    weakPatterns.some((pattern) => pattern.test(lower)) &&
    !questionIndicators.test(lower)
  );
}
