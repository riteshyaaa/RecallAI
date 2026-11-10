import OpenAI from "openai";
import { env } from "@/lib/env";
import { systemPrompt } from "./prompts";
import { executeSearch } from "@/modules/search/search.service";
import type { SearchResult } from "@/modules/search/search.types";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = { type: "function", function: { name: "web_search", description: "Search the public web for current or verifiable information.", parameters: { type: "object", properties: { query: { type: "string" }, search_depth: { type: "string", enum: ["basic", "advanced"] }, max_results: { type: "number" } }, required: ["query"], additionalProperties: false } } };
type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type AgentEvent = { type: "status"; message: string } | { type: "token"; text: string } | { type: "sources"; sources: SearchResult[] };

export async function runAgent(input: { message: string; memory: Array<{ role: string; content: string; createdAt: Date; conversationId: string }>; onEvent: (event: AgentEvent) => void; signal?: AbortSignal }) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45_000 });
  const memory = input.memory.map((m) => `[${m.createdAt.toISOString()} | ${m.conversationId}] ${m.role}: ${m.content}`).join("\n");
  const messages: ChatMessage[] = [{ role: "system", content: `${systemPrompt}\n\nRelevant conversation memory:\n${memory || "No relevant memory found."}` }, { role: "user", content: input.message }];
  let sources: SearchResult[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.chat.completions.create({ model: env.OPENAI_MODEL, messages, tools: [tool], tool_choice: "auto", stream: false }, { signal: input.signal });
    const choice = response.choices[0]?.message;
    if (!choice) throw new Error("Model returned no response.");
    messages.push(choice);
    const calls = choice.tool_calls?.filter((call) => call.type === "function" && call.function.name === "web_search") ?? [];
    if (!calls.length) {
      const stream = await client.chat.completions.create({ model: env.OPENAI_MODEL, messages, stream: true }, { signal: input.signal });
      let answer = "";
      for await (const chunk of stream) { const text = chunk.choices[0]?.delta.content ?? ""; if (text) { answer += text; input.onEvent({ type: "token", text }); } }
      return { answer, sources };
    }
    for (const call of calls.slice(0, 1)) {
      input.onEvent({ type: "status", message: "Searching the web" });
      let result: { results: SearchResult[] } | { error: string };
      try { result = await executeSearch(JSON.parse(call.function.arguments)); }
      catch (error) { result = { error: error instanceof Error ? error.message : "Search unavailable" }; }
      if ("results" in result) { sources = result.results; input.onEvent({ type: "sources", sources }); }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error("The search step did not complete.");
}
