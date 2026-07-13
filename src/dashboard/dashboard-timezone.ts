export interface LocalDayRange {
  date: string;
  startUtc: Date;
  endUtc: Date;
  localHour: number;
}

export interface LocalDateRange {
  startDate: string;
  endDate: string;
  startUtc: Date;
  endUtc: Date;
}

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

export function getTodayRangeForTimezone(
  timezone: string,
  now = new Date(),
): LocalDayRange {
  const localParts = getZonedParts(now, timezone);
  const startUtc = zonedTimeToUtc(
    {
      year: localParts.year,
      month: localParts.month,
      day: localParts.day,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    timezone,
  );
  const nextDayUtcParts = new Date(
    Date.UTC(localParts.year, localParts.month - 1, localParts.day + 1),
  );
  const nextStartUtc = zonedTimeToUtc(
    {
      year: nextDayUtcParts.getUTCFullYear(),
      month: nextDayUtcParts.getUTCMonth() + 1,
      day: nextDayUtcParts.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    timezone,
  );

  return {
    date: formatLocalDate(localParts),
    startUtc,
    endUtc: new Date(nextStartUtc.getTime() - 1),
    localHour: localParts.hour,
  };
}

export function getLocalDateRangeForTimezone(
  timezone: string,
  dayCount: number,
  now = new Date(),
): LocalDateRange {
  const today = getTodayRangeForTimezone(timezone, now);
  const endLocalParts = parseLocalDate(today.date);
  const startDateUtc = new Date(
    Date.UTC(
      endLocalParts.year,
      endLocalParts.month - 1,
      endLocalParts.day - (dayCount - 1),
    ),
  );
  const startLocalParts = {
    year: startDateUtc.getUTCFullYear(),
    month: startDateUtc.getUTCMonth() + 1,
    day: startDateUtc.getUTCDate(),
  };
  const startUtc = zonedTimeToUtc(
    {
      ...startLocalParts,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    timezone,
  );

  return {
    startDate: formatLocalDate({ ...startLocalParts, ...zeroTimeParts() }),
    endDate: today.date,
    startUtc,
    endUtc: today.endUtc,
  };
}

export function getLocalDateForTimezone(date: Date, timezone: string): string {
  return formatLocalDate(getZonedParts(date, timezone));
}

/**
 * UTC instant range covering an arbitrary inclusive local-date window
 * (start of startDate through end of endDate, in the given timezone).
 * Same construction as getTodayRangeForTimezone's single-day range, just
 * parameterized - used by Review Mode to resolve a Monday-Sunday week
 * instead of a "last N days ending today" window.
 */
export function getUtcRangeForLocalDateRange(
  timezone: string,
  startDate: string,
  endDate: string,
): { startUtc: Date; endUtc: Date } {
  const startParts = parseLocalDate(startDate);
  const startUtc = zonedTimeToUtc(
    { ...startParts, ...zeroTimeParts() },
    timezone,
  );
  const endParts = parseLocalDate(endDate);
  const nextDayUtcParts = new Date(
    Date.UTC(endParts.year, endParts.month - 1, endParts.day + 1),
  );
  const nextStartUtc = zonedTimeToUtc(
    {
      year: nextDayUtcParts.getUTCFullYear(),
      month: nextDayUtcParts.getUTCMonth() + 1,
      day: nextDayUtcParts.getUTCDate(),
      ...zeroTimeParts(),
    },
    timezone,
  );

  return { startUtc, endUtc: new Date(nextStartUtc.getTime() - 1) };
}

/**
 * Pure calendar-date arithmetic on a YYYY-MM-DD string (no timezone needed -
 * offsetting a local calendar date is timezone-independent). Used to build
 * the "yesterday"/"day before" date context for AI day-activity segmentation
 * and to validate the dates it resolves.
 */
export function addDaysToLocalDate(date: string, days: number): string {
  const parts = parseLocalDate(date);
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return formatLocalDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    ...zeroTimeParts(),
  });
}

/**
 * UTC instant for a fixed local time-of-day on a local calendar date -
 * used to date back-logged entries ("kal maine X khaya") so the stored
 * loggedAt falls inside the intended local day. Noon is the default anchor:
 * it stays inside the same local day under any UTC offset shift.
 */
export function getUtcInstantForLocalDate(
  timezone: string,
  date: string,
  hour = 12,
): Date {
  return zonedTimeToUtc(
    { ...parseLocalDate(date), hour, minute: 0, second: 0, millisecond: 0 },
    timezone,
  );
}

function zonedTimeToUtc(
  localParts: LocalDateTimeParts,
  timezone: string,
): Date {
  const utcGuessMs = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second,
    localParts.millisecond,
  );
  const firstOffset = getTimezoneOffsetMs(new Date(utcGuessMs), timezone);
  const firstUtc = new Date(utcGuessMs - firstOffset);
  const secondOffset = getTimezoneOffsetMs(firstUtc, timezone);

  if (firstOffset === secondOffset) {
    return firstUtc;
  }

  return new Date(utcGuessMs - secondOffset);
}

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const parts = getZonedParts(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );

  return asUtc - date.getTime();
}

function getZonedParts(date: Date, timezone: string): LocalDateTimeParts {
  const formatter = getDateTimeFormatter(timezone);
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: date.getUTCMilliseconds(),
  };
}

function getDateTimeFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = dateTimeFormatCache.get(timezone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  dateTimeFormatCache.set(timezone, formatter);

  return formatter;
}

function formatLocalDate(parts: LocalDateTimeParts): string {
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function parseLocalDate(
  date: string,
): Pick<LocalDateTimeParts, 'year' | 'month' | 'day'> {
  const [year, month, day] = date.split('-').map(Number);

  return { year, month, day };
}

function zeroTimeParts(): Pick<
  LocalDateTimeParts,
  'hour' | 'minute' | 'second' | 'millisecond'
> {
  return {
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
}
