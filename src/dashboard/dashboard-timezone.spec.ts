import {
  addDaysToLocalDate,
  getLocalDateForTimezone,
  getLocalDateRangeForTimezone,
  getTodayRangeForTimezone,
  getUtcInstantForLocalDate,
  getUtcRangeForLocalDateRange,
} from './dashboard-timezone';

describe('dashboard timezone helpers', () => {
  it('adds/subtracts calendar days across month and year boundaries', () => {
    expect(addDaysToLocalDate('2026-07-13', -1)).toBe('2026-07-12');
    expect(addDaysToLocalDate('2026-07-01', -2)).toBe('2026-06-29');
    expect(addDaysToLocalDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysToLocalDate('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysToLocalDate('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('anchors a back-logged local date at local noon so it stays inside that local day', () => {
    const instant = getUtcInstantForLocalDate('Asia/Karachi', '2026-07-12');

    // Karachi is UTC+5: local 2026-07-12 12:00 = 07:00 UTC.
    expect(instant.toISOString()).toBe('2026-07-12T07:00:00.000Z');
    expect(getLocalDateForTimezone(instant, 'Asia/Karachi')).toBe('2026-07-12');
  });

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

  it('calculates UTC instant boundaries for an arbitrary local date range', () => {
    const range = getUtcRangeForLocalDateRange(
      'Asia/Karachi',
      '2026-06-29',
      '2026-07-05',
    );

    expect(range.startUtc.toISOString()).toBe('2026-06-28T19:00:00.000Z');
    expect(range.endUtc.toISOString()).toBe('2026-07-05T18:59:59.999Z');
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
