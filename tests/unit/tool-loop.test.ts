import { describe, expect, it, vi } from "vitest";
import { runBoundedToolLoop, type ModelTurn } from "@/modules/agent/tool-loop";
import type { SearchResponse } from "@/modules/search/search.types";

const source = {
  title: "Official pricing",
  url: "https://vendor.example/pricing",
  snippet: "The current listed price is $59 per seat.",
  retrievedAt: "2026-11-11T12:00:00.000Z",
  searchQuery: "Vendor official pricing",
};

function searchResponse(): SearchResponse {
  return {
    results: [source],
    durationMs: 5,
    queries: [
      {
        query: "Vendor official pricing",
        status: "SUCCESS",
        durationMs: 5,
      },
    ],
  };
}

function searchCall(id = "search-1"): ModelTurn {
  return {
    text: "",
    toolCalls: [
      {
        id,
        name: "web_search",
        arguments: JSON.stringify({ query: "Vendor official pricing" }),
      },
    ],
  };
}

function loopOptions(
  turns: Array<ModelTurn | Error>,
  overrides: Partial<Parameters<typeof runBoundedToolLoop>[0]> = {},
) {
  const executeSearch = vi.fn(async () => searchResponse());
  const modelCalls: Array<{ toolsEnabled: boolean; messages: unknown[] }> = [];
  const events: unknown[] = [];
  const options: Parameters<typeof runBoundedToolLoop>[0] = {
    messages: [{ role: "user", content: "Has pricing changed?" }],
    maxSearchCalls: 2,
    requiresFreshEvidence: true,
    deadlineAt: Date.now() + 10_000,
    executeSearch,
    onEvent: (event) => events.push(event),
    callModel: vi.fn(async ({ messages, toolsEnabled }) => {
      modelCalls.push({ toolsEnabled, messages: [...messages] });
      const next = turns.shift();
      if (!next) throw new Error("Unexpected model turn");
      if (next instanceof Error) throw next;
      return next;
    }),
    ...overrides,
  };
  return { options, executeSearch, modelCalls, events };
}

describe("bounded search tool orchestration", () => {
  it("returns a final answer and citations after the first search exhausts a budget of one", async () => {
    const { options, executeSearch, modelCalls } = loopOptions([
      searchCall(),
      {
        text: "The current listed price is $59. [Official pricing](https://vendor.example/pricing).",
        toolCalls: [],
      },
    ], { maxSearchCalls: 1 });

    const result = await runBoundedToolLoop(options);
    expect(executeSearch).toHaveBeenCalledTimes(1);
    expect(modelCalls.map((call) => call.toolsEnabled)).toEqual([true, false]);
    expect(result.answer).toContain("[Official pricing](https://vendor.example/pricing)");
    expect(result.sources).toHaveLength(1);
    expect(result.searchCallsUsed).toBe(1);
  });

  it("gives a final answer after exactly two searches consume the configured budget", async () => {
    const { options, executeSearch, modelCalls } = loopOptions(
      [
        searchCall("first"),
        searchCall("second"),
        { text: "Comparison complete with [source](https://vendor.example/pricing).", toolCalls: [] },
      ],
      { maxSearchCalls: 2 },
    );
    const result = await runBoundedToolLoop(options);

    expect(executeSearch).toHaveBeenCalledTimes(2);
    expect(modelCalls.map((call) => call.toolsEnabled)).toEqual([true, true, false]);
    expect(result.answer).toContain("Comparison complete");
    expect(result.searchCallsUsed).toBe(2);
  });

  it("answers gracefully when the model requests another tool after budget exhaustion", async () => {
    const { options, executeSearch, modelCalls } = loopOptions(
      [
        searchCall("first"),
        searchCall("unexpected-extra"),
        { text: "I used the available evidence. [Source](https://vendor.example/pricing).", toolCalls: [] },
      ],
      { maxSearchCalls: 1 },
    );
    const result = await runBoundedToolLoop(options);
    const toolMessages = options.messages.filter((message) => message.role === "tool");

    expect(executeSearch).toHaveBeenCalledTimes(1);
    expect(modelCalls.map((call) => call.toolsEnabled)).toEqual([true, false, false]);
    expect(toolMessages).toHaveLength(2);
    expect(JSON.parse(toolMessages[1].content as string).error.code).toBe("SEARCH_BUDGET_EXHAUSTED");
    expect(result.answer).toContain("[Source](https://vendor.example/pricing)");
  });

  it("responds to every unexpected parallel tool call but executes only calls within budget", async () => {
    const threeCalls: ModelTurn = {
      text: "",
      toolCalls: [
        searchCall("one").toolCalls[0],
        searchCall("two").toolCalls[0],
        searchCall("three").toolCalls[0],
      ],
    };
    const { options, executeSearch } = loopOptions(
      [threeCalls, { text: "Final with [source](https://vendor.example/pricing).", toolCalls: [] }],
      { maxSearchCalls: 1 },
    );
    await runBoundedToolLoop(options);
    const callIds = options.messages
      .filter((message) => message.role === "assistant" && "tool_calls" in message)
      .flatMap((message) => ("tool_calls" in message ? message.tool_calls ?? [] : []))
      .map((call) => call.id);
    const responseIds = options.messages
      .filter((message) => message.role === "tool")
      .map((message) => message.tool_call_id);

    expect(executeSearch).toHaveBeenCalledTimes(1);
    expect(responseIds).toEqual(callIds);
  });

  it("returns a tool response for unknown function names instead of throwing", async () => {
    const badTool: ModelTurn = {
      text: "",
      toolCalls: [{ id: "bad", name: "not_registered", arguments: "{}" }],
    };
    const { options, executeSearch } = loopOptions([
      badTool,
      { text: "I can only search the web.", toolCalls: [] },
    ]);
    const result = await runBoundedToolLoop(options);
    const toolReply = options.messages.find((message) => message.role === "tool");

    expect(executeSearch).not.toHaveBeenCalled();
    expect(JSON.parse(toolReply?.content as string).error.code).toBe("UNSUPPORTED_TOOL");
    expect(result.answer).toContain("only search the web");
  });

  it("preserves historical evidence in context and cites fresh evidence in a comparison", async () => {
    const messages = [
      {
        role: "user" as const,
        content: "Historical answer: $49, captured from https://vendor.example/pricing on Nov 3.",
      },
    ];
    const { options, modelCalls } = loopOptions(
      [
        searchCall(),
        {
          text: "On Nov 3 the saved source showed $49; the current page shows $59. I can confirm the displayed values differ, but not when the change took effect. [Current pricing](https://vendor.example/pricing).",
          toolCalls: [],
        },
      ],
      { messages },
    );
    const result = await runBoundedToolLoop(options);
    const finalContext = JSON.stringify(modelCalls.at(-1)?.messages);

    expect(finalContext).toContain("Historical answer: $49");
    expect(finalContext).toContain("$59 per seat");
    expect(result.answer).toContain("$49");
    expect(result.answer).toContain("$59");
    expect(result.answer).toContain("[Current pricing](https://vendor.example/pricing)");
  });

  it("propagates cancellation and returns an uncertainty fallback on deadline expiry", async () => {
    const controller = new AbortController();
    controller.abort();
    const canceled = loopOptions([searchCall()], { signal: controller.signal });
    await expect(runBoundedToolLoop(canceled.options)).rejects.toMatchObject({ name: "AbortError" });
    expect(canceled.executeSearch).not.toHaveBeenCalled();

    const timedOut = loopOptions([searchCall()], { deadlineAt: Date.now() - 1 });
    const fallback = await runBoundedToolLoop(timedOut.options);
    expect(timedOut.executeSearch).not.toHaveBeenCalled();
    expect(fallback.answer).toMatch(/couldn't verify/i);
  });

  it("keeps source citations in the fallback if the final model turn times out", async () => {
    const { options, executeSearch } = loopOptions([searchCall(), new Error("model timeout")], {
      maxSearchCalls: 1,
    });
    const result = await runBoundedToolLoop(options);
    expect(executeSearch).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain("[Official pricing](https://vendor.example/pricing)");
    expect(result.answer).toMatch(/couldn't complete/i);
  });
});
