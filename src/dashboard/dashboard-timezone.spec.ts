import {
  getLocalDateForTimezone,
  getLocalDateRangeForTimezone,
  getTodayRangeForTimezone,
} from './dashboard-timezone';

describe('dashboard timezone helpers', () => {
  it('calculates Asia/Karachi local day boundaries as UTC instants', () => {
    const range = getTodayRangeForTimezone(
      'Asia/Karachi',
      new Date('2026-07-06T12:00:00.000Z'),
    );

    expect(range.date).toBe('2026-07-06');
    expect(range.startUtc.toISOString()).toBe('2026-07-05T19:00:00.000Z');
    expect(range.endUtc.toISOString()).toBe('2026-07-06T18:59:59.999Z');
    expect(range.localHour).toBe(17);
  });

  it('uses the timezone local date instead of the raw UTC date', () => {
    const range = getTodayRangeForTimezone(
      'America/New_York',
      new Date('2026-07-06T02:00:00.000Z'),
    );

    expect(range.date).toBe('2026-07-05');
    expect(range.startUtc.toISOString()).toBe('2026-07-05T04:00:00.000Z');
    expect(range.endUtc.toISOString()).toBe('2026-07-06T03:59:59.999Z');
    expect(range.localHour).toBe(22);
  });

  it('calculates inclusive local range boundaries ending today', () => {
    const range = getLocalDateRangeForTimezone(
      'Asia/Karachi',
      7,
      new Date('2026-07-06T12:00:00.000Z'),
    );

    expect(range.startDate).toBe('2026-06-30');
    expect(range.endDate).toBe('2026-07-06');
    expect(range.startUtc.toISOString()).toBe('2026-06-29T19:00:00.000Z');
    expect(range.endUtc.toISOString()).toBe('2026-07-06T18:59:59.999Z');
  });

  it('formats a UTC instant as the user timezone local date', () => {
    expect(
      getLocalDateForTimezone(
        new Date('2026-07-05T20:30:00.000Z'),
        'Asia/Karachi',
      ),
    ).toBe('2026-07-06');
  });
});
