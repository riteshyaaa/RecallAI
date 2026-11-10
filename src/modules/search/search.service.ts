import { webSearchSchema } from "@/lib/validation";
import { TavilyProvider } from "./tavily.provider";

export async function executeSearch(input: unknown) {
  const parsed = webSearchSchema.parse(input);
  return new TavilyProvider().search({ query: parsed.query, searchDepth: parsed.search_depth, maxResults: parsed.max_results });
}
