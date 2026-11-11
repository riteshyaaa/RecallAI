import { describe, expect, it } from "vitest";
import { extractCitedClaims } from "@/modules/search/evidence.service";

describe("answer evidence links", () => {
  it("links a cited claim to the matching persisted source snapshot", () => {
    const claims = extractCitedClaims(
      "Pipedrive lists this plan for $49 per seat each month. [Official pricing](https://vendor.example/pricing).",
      new Map([["https://vendor.example/pricing", "source-123"]]),
    );

    expect(claims).toEqual([
      {
        text: "Pipedrive lists this plan for $49 per seat each month. Official pricing.",
        sourceIds: ["source-123"],
      },
    ]);
  });

  it("does not persist uncited paragraphs or URLs outside the search snapshot set", () => {
    const claims = extractCitedClaims(
      "Pipedrive changed a subscription fee during the last quarter. [Details](https://invented.example/change).",
      new Map(),
    );

    expect(claims).toEqual([]);
  });
});
