/**
 * Timezone Utility for Date Range Calculations.
 *
 * Computes exact start-of-day UTC timestamps for any IANA timezone
 * (defaulting to Asia/Kolkata for KCarrier target users).
 */

export function getStartOfTodayInTimezone(timezone: string = 'Asia/Kolkata'): Date {
  const now = new Date();
  let tz = timezone;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    tz = 'Asia/Kolkata';
  }

  // Get current calendar date string in target timezone: "YYYY-MM-DD"
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = formatter.format(now);
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const day = parseInt(dayStr!, 10);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  // Determine the local time at utcGuess
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const tzParts = tzFormatter.formatToParts(utcGuess);
  let tzHour = 0;
  let tzMinute = 0;
  let tzDay = day;

  for (const p of tzParts) {
    if (p.type === 'hour') {
      const h = parseInt(p.value, 10);
      tzHour = h === 24 ? 0 : h;
    }
    if (p.type === 'minute') tzMinute = parseInt(p.value, 10);
    if (p.type === 'day') tzDay = parseInt(p.value, 10);
  }

  let dayOffset = tzDay - day;
  if (dayOffset > 1) dayOffset = -1;
  if (dayOffset < -1) dayOffset = 1;

  const totalOffsetMinutes = dayOffset * 24 * 60 + tzHour * 60 + tzMinute;
  const startOfDayUtc = new Date(utcGuess.getTime() - totalOffsetMinutes * 60 * 1000);

  return startOfDayUtc;
}
