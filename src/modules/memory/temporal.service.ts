export function localDayBounds(date: Date, timeZone: string, offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const localNoon = new Date(Date.UTC(value("year"), value("month") - 1, value("day") + offsetDays, 12));
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset", hour: "2-digit" });
  const offset = fmt.formatToParts(localNoon).find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const sign = offset.includes("-") ? -1 : 1;
  const [hours, minutes = "0"] = (offset.match(/\d+/g) ?? ["0", "0"]);
  const minutesOffset = sign * (Number(hours) * 60 + Number(minutes));
  const start = new Date(Date.UTC(value("year"), value("month") - 1, value("day") + offsetDays) - minutesOffset * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
