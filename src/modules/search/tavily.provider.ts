import { env } from "@/lib/env";
import type { SearchProvider, SearchResponse } from "./search.types";
import { normalizeSearchUrl } from "./search-url";

export class TavilyProvider implements SearchProvider {
  async search({
    query,
    searchDepth,
    maxResults,
  }: {
    query: string;
    searchDepth: "basic" | "advanced";
    maxResults: number;
  }): Promise<SearchResponse> {
    if (!env.TAVILY_API_KEY) throw new Error("Web search is not configured.");
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.TAVILY_API_KEY}`,
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
      return { results, durationMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
}
