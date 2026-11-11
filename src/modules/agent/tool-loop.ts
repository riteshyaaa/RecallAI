import type OpenAI from "openai";
import type { SearchResponse, SearchResult } from "@/modules/search/search.types";

export type RequestedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ModelTurn = {
  text: string;
  toolCalls: RequestedToolCall[];
};

export type ToolLoopEvent =
  | { type: "status"; message: string }
  | { type: "reset" }
  | { type: "token"; text: string }
  | { type: "sources"; sources: SearchResult[] };

type ToolLoopOptions = {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  maxSearchCalls: number;
  requiresFreshEvidence: boolean;
  deadlineAt: number;
  signal?: AbortSignal;
  entities?: string[];
  callModel: (options: {
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    toolsEnabled: boolean;
    toolChoice: "auto" | "required";
    timeoutMs: number;
    onToken: (text: string) => void;
  }) => Promise<ModelTurn>;
  executeSearch: (
    input: unknown,
    signal?: AbortSignal,
  ) => Promise<SearchResponse>;
  onEvent: (event: ToolLoopEvent) => void;
};

type ToolLoopResult = {
  answer: string;
  sources: SearchResult[];
  searchCallsUsed: number;
};

function abortError() {
  const error = new Error("The request was canceled.");
  error.name = "AbortError";
  return error;
}

function buildFallback(sources: SearchResult[], entities: string[]) {
  const covered = entities.filter((entity) =>
    sources.some((source) =>
      source.searchQuery?.toLowerCase().startsWith(`${entity.toLowerCase()} `),
    ),
  );
  const missing = entities.filter((entity) => !covered.includes(entity));
  const coverage = missing.length
    ? ` I could not get usable evidence for: ${missing.join(", ")}.`
    : "";
  if (!sources.length)
    return `I couldn't verify this. The available search attempts did not return usable evidence before the search budget or request deadline was reached.${coverage}`;
  const evidence = sources
    .slice(0, 12)
    .map(
      (source) =>
        `- [${source.title}](${source.url})${source.snippet ? ` — ${source.snippet}` : ""}`,
    )
    .join("\n");
  return `I couldn't complete the full research pass within the search budget. Here are the sources retrieved so far; I can't confirm a change without comparable earlier and current evidence.${coverage}\n\n${evidence}`;
}

function normalizeCalls(calls: RequestedToolCall[]) {
  const ids = new Set<string>();
  return calls.map((call, index) => {
    let id = call.id.trim() || `recall-tool-${index + 1}`;
    if (ids.has(id)) id = `${id}-${index + 1}`;
    ids.add(id);
    return {
      id,
      name: call.name || "unknown_tool",
      arguments: call.arguments || "{}",
    };
  });
}

function mergeSources(current: SearchResult[], incoming: SearchResult[]) {
  const byUrl = new Map(current.map((source) => [source.url, source]));
  for (const source of incoming) {
    const previous = byUrl.get(source.url);
    byUrl.set(source.url, previous ? { ...source, ...previous } : source);
  }
  return [...byUrl.values()];
}

/**
 * Runs a bounded tool loop and always gives the model a final answer turn.
 * Search calls after the budget receive a tool error response but are never executed.
 */
export async function runBoundedToolLoop(
  options: ToolLoopOptions,
): Promise<ToolLoopResult> {
  const messages = options.messages;
  const entities = options.entities ?? [];
  const budget = Math.max(0, Math.floor(options.maxSearchCalls));
  let callsUsed = 0;
  let sources: SearchResult[] = [];
  let forceFinal = false;
  let finalRetries = 0;
  let modelTurns = 0;
  const maxModelTurns = budget + 3;

  while (modelTurns < maxModelTurns) {
    if (options.signal?.aborted) throw abortError();
    const timeoutMs = Math.floor(options.deadlineAt - Date.now());
    if (timeoutMs <= 0) break;
    modelTurns++;

    let turn: ModelTurn;
    try {
      const toolsEnabled = !forceFinal && callsUsed < budget;
      turn = await options.callModel({
        messages,
        toolsEnabled,
        toolChoice:
          toolsEnabled && callsUsed === 0 && options.requiresFreshEvidence
            ? "required"
            : "auto",
        timeoutMs,
        onToken: (text) => options.onEvent({ type: "token", text }),
      });
    } catch {
      if (options.signal?.aborted) throw abortError();
      return {
        answer: buildFallback(sources, entities),
        sources,
        searchCallsUsed: callsUsed,
      };
    }

    const calls = normalizeCalls(turn.toolCalls);
    if (!calls.length) {
      return {
        answer: turn.text || buildFallback(sources, entities),
        sources,
        searchCallsUsed: callsUsed,
      };
    }

    // Tool-planning text is not a final answer. Clear it before the final response streams.
    options.onEvent({ type: "reset" });
    const assistantToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
      calls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      }));
    messages.push({
      role: "assistant",
      content: turn.text || null,
      tool_calls: assistantToolCalls,
    });

    let unexecutedCall = false;
    for (const call of calls) {
      let response: unknown;
      if (call.name !== "web_search") {
        unexecutedCall = true;
        response = {
          error: {
            code: "UNSUPPORTED_TOOL",
            message: "Only the web_search tool is available.",
          },
          availableSources: sources.map(({ title, url, snippet }) => ({
            title,
            url,
            snippet,
          })),
        };
      } else if (forceFinal || callsUsed >= budget) {
        unexecutedCall = true;
        response = {
          error: {
            code: "SEARCH_BUDGET_EXHAUSTED",
            message:
              "No search was executed. Use the evidence already returned and clearly disclose any gaps.",
          },
          availableSources: sources.map(({ title, url, snippet }) => ({
            title,
            url,
            snippet,
          })),
        };
      } else {
        callsUsed++;
        options.onEvent({ type: "status", message: "Searching the web" });
        try {
          const args: unknown = JSON.parse(call.arguments);
          const result = await options.executeSearch(args, options.signal);
          sources = mergeSources(sources, result.results);
          options.onEvent({ type: "sources", sources });
          response = {
            ...result,
            searchBudget: { used: callsUsed, limit: budget },
          };
        } catch (error) {
          if (options.signal?.aborted) throw abortError();
          response = {
            error: {
              code: "SEARCH_FAILED",
              message:
                error instanceof Error
                  ? error.message
                  : "Search was unavailable.",
            },
            searchBudget: { used: callsUsed, limit: budget },
            availableSources: sources.map(({ title, url, snippet }) => ({
              title,
              url,
              snippet,
            })),
          };
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(response),
      });
    }

    if (forceFinal) {
      if (finalRetries >= 1)
        return {
          answer: buildFallback(sources, entities),
          sources,
          searchCallsUsed: callsUsed,
        };
      finalRetries++;
      continue;
    }
    if (unexecutedCall || callsUsed >= budget) {
      forceFinal = true;
      options.onEvent({
        type: "status",
        message: sources.length
          ? "Preparing an answer from retrieved evidence"
          : "Search did not return enough evidence; preparing an uncertainty response",
      });
    }
  }

  return {
    answer: buildFallback(sources, entities),
    sources,
    searchCallsUsed: callsUsed,
  };
}
