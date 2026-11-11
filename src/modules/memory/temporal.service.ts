function instantAtLocalMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const local = formatter.formatToParts(new Date(candidate));
    const part = (name: string) =>
      Number(local.find((p) => p.type === name)?.value);
    const represented = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    );
    const difference = target - represented;
    candidate += difference;
    if (!difference) break;
  }
  return new Date(candidate);
}

export function localCalendarBounds(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  const target = new Date(Date.UTC(year, month - 1, day));
  const next = new Date(target.getTime() + 86_400_000);
  return {
    start: instantAtLocalMidnight(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      target.getUTCDate(),
      timeZone,
    ),
    end: instantAtLocalMidnight(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      timeZone,
    ),
  };
}

export function localDayBounds(date: Date, timeZone: string, offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const target = new Date(
    Date.UTC(value("year"), value("month") - 1, value("day") + offsetDays),
  );
  return localCalendarBounds(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    timeZone,
  );
}
