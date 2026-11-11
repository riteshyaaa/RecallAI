import { describe, expect, it } from "vitest";
import { webSearchSchema } from "@/lib/validation";
describe("web search validation", () => {
  it("rejects a blank query", () =>
    expect(webSearchSchema.safeParse({ query: " " }).success).toBe(false));
  it("caps result counts", () =>
    expect(
      webSearchSchema.safeParse({ query: "news", max_results: 9 }).success,
    ).toBe(false));
});
