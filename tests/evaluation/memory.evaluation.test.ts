import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { message: { findMany: prismaMock.findMany } },
}));

import { auditCitations } from "@/modules/search/citation-audit";
import {
  temporalRange,
  retrieveMemory,
} from "@/modules/memory/retrieval.service";
import { evaluationSessionId, memoryEvaluationCases } from "./challenge-set";

type MockQuery = {
  where?: {
    conversationId?: string;
    conversation?: { sessionId?: string };
    createdAt?: { gte?: Date; lt?: Date };
    OR?: Array<{ content?: { contains?: string; mode?: string } }>;
  };
  orderBy?: { createdAt: "asc" | "desc" };
  take?: number;
};

function emulatePrismaMessageQuery(
  scenario: (typeof memoryEvaluationCases)[number],
) {
  const allMessages = scenario.messages.map((message) => ({
    ...message,
    createdAt: new Date(message.createdAt),
  }));

  prismaMock.findMany.mockImplementation(async (query: MockQuery) => {
    if (!query) return [];
    const where = query.where ?? {};
    let rows = allMessages.filter(
      (message) => message.sessionId === evaluationSessionId,
    );

    if (where.conversationId)
      rows = rows.filter(
        (message) => message.conversationId === where.conversationId,
      );
    if (where.conversation?.sessionId)
      rows = rows.filter(
        (message) => message.sessionId === where.conversation?.sessionId,
      );
    if (where.createdAt?.gte)
      rows = rows.filter(
        (message) => message.createdAt >= where.createdAt!.gte!,
      );
    if (where.createdAt?.lt)
      rows = rows.filter((message) => message.createdAt < where.createdAt!.lt!);
    if (where.OR?.length)
      rows = rows.filter((message) =>
        where.OR!.some(({ content }) =>
          message.content
            .toLowerCase()
            .includes(content?.contains?.toLowerCase() ?? ""),
        ),
      );

    rows.sort((a, b) => {
      const order = a.createdAt.getTime() - b.createdAt.getTime();
      return query.orderBy?.createdAt === "desc" ? -order : order;
    });
    return rows.slice(0, query.take).map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    }));
  });
}

describe("challenge-set memory evaluation", () => {
  beforeEach(() => prismaMock.findMany.mockReset());

  for (const scenario of memoryEvaluationCases) {
    it(scenario.name, async () => {
      emulatePrismaMessageQuery(scenario);
      const now = new Date(scenario.now);
      const range = temporalRange(scenario.prompt, scenario.timeZone, now);
      if (scenario.expectedUtcRange) {
        expect(range?.start.toISOString()).toBe(
          scenario.expectedUtcRange.start,
        );
        expect(range?.end.toISOString()).toBe(scenario.expectedUtcRange.end);
      }

      const retrieved = await retrieveMemory(
        evaluationSessionId,
        scenario.activeConversationId,
        scenario.prompt,
        scenario.timeZone,
        now,
      );
      const retrievedIds = new Set(retrieved.map((message) => message.id));

      for (const expectedId of scenario.expectedMessageIds)
        expect(
          retrievedIds,
          `Expected historical message ${expectedId}`,
        ).toContain(expectedId);
      for (const excludedId of scenario.excludedMessageIds)
        expect(
          retrievedIds,
          `Unexpected historical message ${excludedId}`,
        ).not.toContain(excludedId);
      expect(retrieved.length).toBeLessThanOrEqual(24);
    });
  }

  it("meets aggregate exact-recall and off-date false-match targets", async () => {
    let expectedCount = 0;
    let recoveredCount = 0;
    let excludedCount = 0;
    let excludedRetrievedCount = 0;

    for (const scenario of memoryEvaluationCases) {
      emulatePrismaMessageQuery(scenario);
      const retrieved = await retrieveMemory(
        evaluationSessionId,
        scenario.activeConversationId,
        scenario.prompt,
        scenario.timeZone,
        new Date(scenario.now),
      );
      const ids = new Set(retrieved.map((message) => message.id));
      expectedCount += scenario.expectedMessageIds.length;
      recoveredCount += scenario.expectedMessageIds.filter((id) =>
        ids.has(id),
      ).length;
      excludedCount += scenario.excludedMessageIds.length;
      excludedRetrievedCount += scenario.excludedMessageIds.filter((id) =>
        ids.has(id),
      ).length;
    }

    const exactMessageRecall = recoveredCount / expectedCount;
    const offDateFalseMatchRate = excludedRetrievedCount / excludedCount;
    expect({ exactMessageRecall, offDateFalseMatchRate }).toEqual({
      exactMessageRecall: 1,
      offDateFalseMatchRate: 0,
    });
  });
});

describe("source-backed answer evaluation", () => {
  const sources = [
    {
      title: "Pipedrive pricing",
      url: "https://vendor.example/pricing?utm_source=web",
      snippet: "Current plan prices and seat terms.",
    },
  ];

  it("accepts a citation that resolves to a returned source", () => {
    const audit = auditCitations(
      "Pipedrive lists the Advanced plan at $49 per seat monthly on annual billing. [Official pricing](https://vendor.example/pricing).",
      sources,
    );
    expect(audit.passed).toBe(true);
    expect(audit.citationCount).toBe(1);
    expect(audit.citationCoverageRate).toBe(1);
    expect(audit.invalidCitations).toEqual([]);
    expect(audit.uncitedParagraphs).toEqual([]);
  });

  it("flags invented source URLs and factual paragraphs without citations", () => {
    const audit = auditCitations(
      "Pipedrive lists the Advanced plan at $49 per seat monthly on annual billing. [Pricing](https://fake.example/plans).\n\nHubSpot recently changed its seat limits for small sales teams.",
      sources,
    );
    expect(audit.passed).toBe(false);
    expect(audit.invalidCitations).toEqual(["https://fake.example/plans"]);
    expect(audit.uncitedParagraphs).toHaveLength(1);
    expect(audit.uncitedParagraphs[0]).toContain("HubSpot");
    expect(audit.citationCoverageRate).toBe(0.5);
  });
});
