import { webSearchSchema } from "@/lib/validation";
import { TavilyProvider } from "./tavily.provider";
import { buildEntitySearchQueries } from "./entity-fanout";
import { normalizeSearchUrl } from "./search-url";
import type {
  SearchProvider,
  SearchQueryReport,
  SearchResponse,
  SearchResult,
} from "./search.types";

export type ExecuteSearchOptions = {
  provider?: SearchProvider;
  entities?: string[];
  intent?: string;
  signal?: AbortSignal;
  deadlineAt?: number;
  maxFanoutMs?: number;
};

const FANOUT_CONCURRENCY = 2;
const FANOUT_QUERY_TIMEOUT_MS = 8_000;
const MAX_FANOUT_RESULTS = 2;

function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError")
    return "Search canceled or timed out.";
  return error instanceof Error ? error.message : "Search provider unavailable.";
}

function likelyOfficial(result: SearchResult, query: string) {
  const entity = query.split(/\s+official\b/i)[0] ?? "";
  const tokens = entity
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && token !== "crm");
  const host = new URL(result.url).hostname.toLowerCase();
  return tokens.some((token) => host.includes(token));
}

export async function executeSearch(
  input: unknown,
  options: ExecuteSearchOptions = {},
): Promise<SearchResponse> {
  const parsed = webSearchSchema.parse(input);
  const provider = options.provider ?? new TavilyProvider();
  const queries = buildEntitySearchQueries(
    parsed.query,
    options.entities ?? [],
    options.intent,
  );
  const started = Date.now();
  const deadlineAt = Math.min(
    options.deadlineAt ?? Number.POSITIVE_INFINITY,
    started + (options.maxFanoutMs ?? 30_000),
  );
  const queryReports: SearchQueryReport[] = [];
  const results: SearchResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < queries.length) {
      const index = cursor++;
      const query = queries[index];
      const remainingMs = deadlineAt - Date.now();
      if (options.signal?.aborted) {
        queryReports[index] = {
          query,
          status: "FAILED",
          durationMs: 0,
          error: "Search canceled.",
        };
        continue;
      }
      if (remainingMs <= 0) {
        queryReports[index] = {
          query,
          status: "FAILED",
          durationMs: 0,
          error: "Search batch deadline reached before this query.",
        };
        continue;
      }
      const queryStarted = Date.now();
      try {
        const response = await provider.search({
          query,
          searchDepth: parsed.search_depth,
          maxResults:
            queries.length > 1
              ? Math.min(parsed.max_results, MAX_FANOUT_RESULTS)
              : parsed.max_results,
          signal: options.signal,
          timeoutMs: Math.min(FANOUT_QUERY_TIMEOUT_MS, remainingMs),
        });
        const queryResults = response.results.map((result) => ({
          ...result,
          searchQuery: query,
        }));
        results.push(...queryResults);
        const providerReport = response.queries?.[0];
        queryReports[index] = {
          query,
          status:
            providerReport?.status ??
            (queryResults.length ? "SUCCESS" : "EMPTY"),
          durationMs: response.durationMs,
          ...(providerReport?.error ? { error: providerReport.error } : {}),
        };
      } catch (error) {
        queryReports[index] = {
          query,
          status: "FAILED",
          durationMs: Date.now() - queryStarted,
          error: errorMessage(error),
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(FANOUT_CONCURRENCY, queries.length) },
      () => worker(),
    ),
  );

  const deduplicated = new Map<string, SearchResult>();
  for (const result of results) {
    try {
      const normalized = normalizeSearchUrl(result.url);
      if (normalized && !deduplicated.has(normalized))
        deduplicated.set(normalized, { ...result, url: normalized });
    } catch {
      // Invalid provider URLs are discarded at the evidence boundary.
    }
  }
  const uniqueResults = [...deduplicated.values()];
  if (queries.length > 1) {
    uniqueResults.sort((a, b) => {
      const aOfficial = a.searchQuery && likelyOfficial(a, a.searchQuery);
      const bOfficial = b.searchQuery && likelyOfficial(b, b.searchQuery);
      if (aOfficial !== bOfficial) return aOfficial ? -1 : 1;
      return (b.score ?? 0) - (a.score ?? 0);
    });
  } else if (uniqueResults.some((result) => typeof result.score === "number")) {
    uniqueResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  return {
    results: uniqueResults,
    durationMs: Date.now() - started,
    queries: queryReports,
  };
}
