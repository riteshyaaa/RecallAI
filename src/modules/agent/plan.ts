export type SearchPlan = {
  requiresFreshEvidence: boolean;
  reason: "change-check" | "current-fact" | "model-choice";
  maxSearchCalls: number;
};

/** Cheap deterministic guard for requests whose answer depends on today's facts. */
export function planSearch(message: string): SearchPlan {
  const lower = message.toLowerCase();
  const changeCheck =
    /\b(changed|change|since then|since we|still (?:correct|accurate|true)|up[- ]to[- ]date|what(?:'s| has) new|any updates?)\b/.test(
      lower,
    );
  const currentFact =
    /\b(current|currently|latest|today|right now|recent(?:ly)?|this week|this month|pricing|price)\b/.test(
      lower,
    );
  return {
    requiresFreshEvidence: changeCheck || currentFact,
    reason: changeCheck
      ? "change-check"
      : currentFact
        ? "current-fact"
        : "model-choice",
    maxSearchCalls: 2,
  };
}

export function evaluateSearchTrace(message: string, searchCalls: number) {
  const plan = planSearch(message);
  const requiredSearchSatisfied =
    !plan.requiresFreshEvidence || searchCalls > 0;
  const unnecessarySearch =
    !plan.requiresFreshEvidence &&
    searchCalls > 0 &&
    /\bwhat did i ask|what did i say|what did we discuss\b/i.test(message);
  return { ...plan, searchCalls, requiredSearchSatisfied, unnecessarySearch };
}
