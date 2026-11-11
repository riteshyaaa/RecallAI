import { describe, expect, it } from "vitest";
import { evaluateSearchTrace, planSearch } from "@/modules/agent/plan";
import { auditCitations } from "@/modules/search/citation-audit";

describe("bounded freshness plan", () => {
  it.each([
    "Have any of them changed pricing or shipped something big since?",
    "Last Tuesday I asked about Postgres hosting. Has any pricing changed since then?",
    "What did I ask you on 3 November? Is your answer still correct today?",
  ])("requires a fresh evidence check for: %s", (prompt) => {
    const plan = planSearch(prompt);
    expect(plan.requiresFreshEvidence).toBe(true);
    expect(plan.maxSearchCalls).toBe(2);
  });

  it.each(["What did I ask yesterday?", "Thanks, that answers it."])(
    "leaves memory and conversational turns to model choice: %s",
    (prompt) => {
      expect(planSearch(prompt)).toMatchObject({
        requiresFreshEvidence: false,
        reason: "model-choice",
        maxSearchCalls: 2,
      });
    },
  );

  it("measures whether a change question actually triggered fresh search", () => {
    expect(
      evaluateSearchTrace("Has the pricing changed since then?", 1)
        .requiredSearchSatisfied,
    ).toBe(true);
    expect(
      evaluateSearchTrace("Has the pricing changed since then?", 0)
        .requiredSearchSatisfied,
    ).toBe(false);
  });

  it("recognizes uncertainty as an acceptable response when search finds no evidence", () => {
    const answer =
      "I couldn't verify whether the pricing changed because no current source was available.";
    expect(
      evaluateSearchTrace("Has pricing changed since then?", 1)
        .requiredSearchSatisfied,
    ).toBe(true);
    expect(auditCitations(answer, [])).toMatchObject({
      passed: true,
      substantiveParagraphCount: 0,
      citationCoverageRate: 1,
    });
  });
});
