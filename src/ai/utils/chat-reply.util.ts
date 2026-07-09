export interface NormalizedChatReply {
  reply: string;
  supportModeTriggered: boolean;
}

const fallbackReply =
  "I'm here for you. Let's take the next small step together - no pressure.";

/**
 * Defensive normalization of the structured chat-reply JSON output, mirroring
 * normalizeMealEstimate()'s pattern: never trust the raw shape, always return
 * something safe to persist and show the user.
 */
export function normalizeChatReply(raw: unknown): NormalizedChatReply {
  const source = asRecord(raw);

  return {
    reply: normalizeText(source.reply),
    supportModeTriggered: source.supportModeTriggered === true,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallbackReply;
}
