import { normalizeChatReply } from './chat-reply.util';

describe('normalizeChatReply', () => {
  it('passes through a well-formed structured reply', () => {
    const result = normalizeChatReply({
      reply: 'Logged. Around 850 kcal added.',
      supportModeTriggered: false,
    });

    expect(result).toEqual({
      reply: 'Logged. Around 850 kcal added.',
      supportModeTriggered: false,
    });
  });

  it('defaults to a safe fallback reply when reply is missing or empty', () => {
    expect(normalizeChatReply({ supportModeTriggered: false }).reply).toMatch(
      /here for you/i,
    );
    expect(normalizeChatReply({ reply: '   ' }).reply).toMatch(/here for you/i);
  });

  it('defaults supportModeTriggered to false unless explicitly true', () => {
    expect(normalizeChatReply({ reply: 'hi' }).supportModeTriggered).toBe(
      false,
    );
    expect(
      normalizeChatReply({ reply: 'hi', supportModeTriggered: 'true' })
        .supportModeTriggered,
    ).toBe(false);
    expect(
      normalizeChatReply({ reply: 'hi', supportModeTriggered: true })
        .supportModeTriggered,
    ).toBe(true);
  });

  it('handles malformed/non-object input safely', () => {
    expect(normalizeChatReply(null).reply).toMatch(/here for you/i);
    expect(normalizeChatReply('not json').supportModeTriggered).toBe(false);
    expect(normalizeChatReply(undefined).reply).toMatch(/here for you/i);
  });
});
