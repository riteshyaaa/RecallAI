import { afterEach, describe, expect, it, vi } from "vitest";
import { executeSearch } from "@/modules/search/search.service";
import { resolveSearchEntities } from "@/modules/search/entity-fanout";
import { TavilyProvider } from "@/modules/search/tavily.provider";
import type {
  SearchProvider,
  SearchResponse,
} from "@/modules/search/search.types";

const entities = ["HubSpot", "Pipedrive", "Salesforce", "Zoho CRM", "Freshsales"];
const memory = [
  {
    role: "USER",
    content:
      "We shortlisted five CRM tools for our team: HubSpot, Pipedrive, Salesforce, Zoho CRM, and Freshsales.",
  },
];

afterEach(() => vi.unstubAllGlobals());

describe("multi-entity web search fan-out", () => {
  it("resolves five historical entities and researches them in one logical search invocation", async () => {
    const resolved = resolveSearchEntities(
      "Have any of them changed pricing or shipped something big since?",
      memory,
    );
    expect(resolved).toEqual(entities);

    const calls: string[] = [];
    const provider: SearchProvider = {
      search: vi.fn(async ({ query }: Parameters<SearchProvider["search"]>[0]): Promise<SearchResponse> => {
        calls.push(query);
        const domain = query.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
        const result = {
          title: `${domain} official page`,
          url: `https://${domain}.example/${query.includes("pricing") ? "pricing" : "updates"}`,
          snippet: `Official source for ${domain}.`,
          publishedDate: "2026-11-10",
          retrievedAt: "2026-11-11T12:00:00.000Z",
        };
        return {
          results: [result],
          durationMs: 10,
          queries: [{ query, status: "SUCCESS", durationMs: 10 }],
        };
      }),
    };

    const result = await executeSearch(
      { query: "official pricing and product announcements", max_results: 5 },
      {
        provider,
        entities: resolved,
        intent: "Have any of them changed pricing or shipped something big since?",
      },
    );

    expect(provider.search).toHaveBeenCalledTimes(10);
    expect(calls).toHaveLength(10);
    expect(result.queries).toHaveLength(10);
    expect(result.results).toHaveLength(10);
    expect(result.results.every((source) => source.searchQuery)).toBe(true);
  });

  it("keeps successful entity results when one provider query fails", async () => {
    const provider: SearchProvider = {
      search: vi.fn(async ({ query }: Parameters<SearchProvider["search"]>[0]): Promise<SearchResponse> => {
        if (query.startsWith("Salesforce official pricing"))
          throw new Error("provider rate limit");
        return {
          results: [
            {
              title: "Official company page",
              url: `https://${query.split(" ")[0].toLowerCase()}.example/pricing`,
              snippet: "Pricing details.",
            },
          ],
          durationMs: 5,
          queries: [{ query, status: "SUCCESS", durationMs: 5 }],
        };
      }),
    };
    const result = await executeSearch(
      { query: "pricing and product updates" },
      { provider, entities, intent: "Have any of them changed pricing or shipped since?" },
    );

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.queries.filter((query) => query.status === "FAILED")).toHaveLength(1);
    expect(result.queries.find((query) => query.status === "FAILED")?.error).toMatch(/rate limit/);
  });

  it("deduplicates URLs after normalization across provider queries", async () => {
    const provider: SearchProvider = {
      search: vi.fn(
        async ({ query }: Parameters<SearchProvider["search"]>[0]): Promise<SearchResponse> => ({
          results: [
            {
              title: query,
              url: "https://hubspot.example/pricing?utm_source=search",
              snippet: "Same pricing page.",
            },
          ],
          durationMs: 1,
          queries: [{ query, status: "SUCCESS", durationMs: 1 }],
        }),
      ),
    };
    const result = await executeSearch(
      { query: "pricing and updates" },
      { provider, entities: ["HubSpot", "Pipedrive"] },
    );
    expect(result.results.filter((source) => source.url === "https://hubspot.example/pricing")).toHaveLength(1);
  });

  it("does not start provider requests after cancellation or deadline", async () => {
    const provider: SearchProvider = { search: vi.fn() };
    const controller = new AbortController();
    controller.abort();
    const canceled = await executeSearch(
      { query: "pricing" },
      { provider, entities, signal: controller.signal },
    );
    expect(provider.search).not.toHaveBeenCalled();
    expect(canceled.queries.every((query) => query.status === "FAILED")).toBe(true);

    const timedOut = await executeSearch(
      { query: "pricing" },
      { provider, entities, deadlineAt: Date.now() - 1 },
    );
    expect(provider.search).not.toHaveBeenCalled();
    expect(timedOut.queries.every((query) => query.status === "FAILED")).toBe(true);
  });
});

describe("Tavily timeout and cancellation", () => {
  it("aborts an individual provider request at its timeout", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
          return;
        }
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );
    const provider = new TavilyProvider("test-key", fetchMock);
    await expect(
      provider.search({
        query: "pricing",
        searchDepth: "basic",
        maxResults: 2,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
