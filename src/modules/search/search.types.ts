export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  score?: number;
  retrievedAt?: string;
  searchQuery?: string;
};
export type SearchQueryReport = {
  query: string;
  status: "SUCCESS" | "EMPTY" | "FAILED";
  durationMs: number;
  error?: string;
};
export type SearchResponse = {
  results: SearchResult[];
  durationMs: number;
  queries: SearchQueryReport[];
};
export interface SearchProvider {
  search(input: {
    query: string;
    searchDepth: "basic" | "advanced";
    maxResults: number;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<SearchResponse>;
}
