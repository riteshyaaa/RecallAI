import { env } from "@/lib/env";
import type { SearchProvider, SearchResponse } from "./search.types";

export class TavilyProvider implements SearchProvider {
  async search({ query, searchDepth, maxResults }: { query: string; searchDepth: "basic" | "advanced"; maxResults: number }): Promise<SearchResponse> {
    if (!env.TAVILY_API_KEY) throw new Error("Web search is not configured.");
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("https://api.tavily.com/search", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TAVILY_API_KEY}` }, body: JSON.stringify({ query, search_depth: searchDepth, max_results: maxResults, include_answer: false }) });
      if (!response.ok) throw new Error(`Search provider returned ${response.status}`);
      const payload = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
      const seen = new Set<string>();
      const results = (payload.results ?? []).flatMap((r) => {
        try {
          const url = new URL(r.url ?? "");
          url.hash = "";
          if (!/^https?:$/.test(url.protocol) || seen.has(url.href)) return [];
          seen.add(url.href);
          return [{ title: r.title?.trim() || url.hostname, url: url.href, snippet: r.content?.trim() || "", publishedDate: r.published_date }];
        } catch { return []; }
      });
      return { results, durationMs: Date.now() - started };
    } finally { clearTimeout(timer); }
  }
}
