import { env } from "@/lib/env";
import type { SearchProvider, SearchResponse } from "./search.types";
import { normalizeSearchUrl } from "./search-url";

export class TavilyProvider implements SearchProvider {
  constructor(
    private readonly apiKey = env.TAVILY_API_KEY,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search({
    query,
    searchDepth,
    maxResults,
    signal,
    timeoutMs = 12_000,
  }: {
    query: string;
    searchDepth: "basic" | "advanced";
    maxResults: number;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<SearchResponse> {
    if (!this.apiKey) throw new Error("Web search is not configured.");
    const started = Date.now();
    const controller = new AbortController();
    const abortFromParent = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromParent();
    else signal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl("https://api.tavily.com/search", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          search_depth: searchDepth,
          max_results: maxResults,
          include_answer: false,
        }),
      });
      if (!response.ok)
        throw new Error(`Search provider returned ${response.status}`);
      const payload = (await response.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          published_date?: string;
          score?: number;
        }>;
      };
      const seen = new Set<string>();
      const results = (payload.results ?? []).flatMap((r) => {
        try {
          const normalizedUrl = normalizeSearchUrl(r.url ?? "");
          if (!normalizedUrl || seen.has(normalizedUrl)) return [];
          seen.add(normalizedUrl);
          return [
            {
              title: r.title?.trim() || new URL(normalizedUrl).hostname,
              url: normalizedUrl,
              snippet: r.content?.trim() || "",
              publishedDate: r.published_date,
              score: r.score,
              retrievedAt: new Date().toISOString(),
            },
          ];
        } catch {
          return [];
        }
      });
      if (results.some((result) => typeof result.score === "number")) {
        results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      }
      const durationMs = Date.now() - started;
      return {
        results,
        durationMs,
        queries: [
          {
            query,
            status: results.length ? "SUCCESS" : "EMPTY",
            durationMs,
          },
        ],
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromParent);
    }
  }
}
