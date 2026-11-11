import { describe, expect, it } from "vitest";
import { localDayBounds } from "@/modules/memory/temporal.service";
import { temporalRange } from "@/modules/memory/retrieval.service";
describe("localDayBounds", () => {
  it("returns yesterday's local calendar day", () => {
    const range = localDayBounds(
      new Date("2025-01-02T12:00:00Z"),
      "Asia/Kolkata",
      -1,
    );
    expect(range.end.getTime() - range.start.getTime()).toBe(86_400_000);
  });
  it("respects daylight saving transitions", () => {
    const spring = localDayBounds(
      new Date("2025-03-09T18:00:00Z"),
      "America/Denver",
    );
    const fall = localDayBounds(
      new Date("2025-11-02T18:00:00Z"),
      "America/Denver",
    );
    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * 3_600_000);
    expect(fall.end.getTime() - fall.start.getTime()).toBe(25 * 3_600_000);
  });
});
describe("temporalRange", () => {
  const now = new Date("2026-11-11T08:00:00Z");
  it("resolves a named historic date in the requested timezone", () => {
    const range = temporalRange(
      "What did I ask on 3 November?",
      "Asia/Kolkata",
      now,
    );
    expect(range?.start.toISOString()).toBe("2026-11-02T18:30:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-11-03T18:30:00.000Z");
  });
  it("resolves last weekday as the most recent prior instance", () => {
    const range = temporalRange(
      "Last Tuesday I asked about Postgres",
      "Asia/Kolkata",
      now,
    );
    expect(range?.start.toISOString()).toBe("2026-11-09T18:30:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-11-10T18:30:00.000Z");
  });
});
