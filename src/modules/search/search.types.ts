export type SearchResult = { title: string; url: string; snippet: string; publishedDate?: string };
export type SearchResponse = { results: SearchResult[]; durationMs: number };
export interface SearchProvider { search(input: { query: string; searchDepth: "basic" | "advanced"; maxResults: number }): Promise<SearchResponse>; }
