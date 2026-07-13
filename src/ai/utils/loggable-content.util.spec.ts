import { containsLoggableContent } from './loggable-content.util';

describe('containsLoggableContent', () => {
  it.each([
    // English food logging.
    'I ate 2 eggs and toast',
    'just had a burger',
    'had 2 rotis with daal',
    'drank a glass of lassi',
    // Roman Urdu food logging.
    'kal maine chicken biryani khai',
    'subah 2 anday khaye',
    'nashte mein paratha khaya',
    'chai pi li',
    // Exercise, English and Roman Urdu.
    'I walked for 30 minutes',
    'did 5000 steps today',
    '30 min walk ki aur gym kiya',
    'kal raat ko sair ki',
    // The reported bug message shape: whole-day recap with meal words.
    'my last day: breakfast 2 eggs, lunch rice, dinner roti and two walks',
    // Known cheap-filter false positive by design: "had a ..." fires and the
    // downstream segmentation call is what rejects the non-food meaning.
    'I had a bad day at work',
  ])('intercepts logging-shaped language: "%s"', (message) => {
    expect(containsLoggableContent(message)).toBe(true);
  });

  it.each([
    // Coaching questions must NOT be intercepted (they'd cost a wasted
    // segmentation call and lose the richer coaching reply).
    'what should I eat for lunch?',
    'dinner mein kya khaun?',
    'should I walk now?',
    'can I do gym in ramadan?',
    'suggest a good breakfast plan',
    // General chat and support-mode language.
    'hello',
    'my weight is stuck',
    'I want to give up, nothing is working',
  ])('leaves coaching/support language alone: "%s"', (message) => {
    expect(containsLoggableContent(message)).toBe(false);
  });
});
