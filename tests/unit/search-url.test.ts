import { describe, expect, it } from "vitest";
import { normalizeSearchUrl } from "@/modules/search/tavily.provider";

describe("normalizeSearchUrl", () => {
  it("removes fragments and tracking parameters and sorts query parameters", () => {
    expect(
      normalizeSearchUrl(
        "https://example.com/path/?utm_source=mail&b=2&a=1#section",
      ),
    ).toBe("https://example.com/path?a=1&b=2");
  });
  it("rejects malformed and non-web URLs", () => {
    expect(() => normalizeSearchUrl("not a url")).toThrow();
    expect(normalizeSearchUrl("javascript:alert(1)")).toBeNull();
  });
});
