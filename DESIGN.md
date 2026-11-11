# RecallAI design

RecallAI is a conversational research agent built around one model-visible external tool: `web_search`. Its core design problem is preserving the link between **what the user asked, what the agent knew then, and what current sources support now**. The system keeps original messages and evidence records in PostgreSQL so follow-ups can retrieve exact history and compare it with fresh search results.

## How a turn works

```text
POST /api/chat
  → validate request, enforce session ownership, persist user message
  → retrieve bounded temporal, lexical, and reference context + prior cited evidence
  → force fresh search for explicit change/current-fact requests; otherwise let model decide
  → run one-tool model loop with a configurable logical search budget and deadline
  → internally fan out relevant multi-entity searches; retain partial results and failures
  → stream status, memory, sources, and final tokens over SSE
  → persist assistant message and links from cited claims to retrieved source snapshots
```

The browser uses an HTTP-only anonymous session cookie. The route handlers enforce session ownership; conversation IDs alone do not grant access. PostgreSQL is the system of record. `Message` retains original wording and timestamps; `SearchExecution` records each provider query and result snapshot; `EvidenceSource` records normalized URL, title, snippet, publication date, and retrieval time; `EvidenceClaim` and `EvidenceClaimSource` record which retrieved sources the answer cited. Historical records are preserved by the request flow rather than overwritten during a later search. They are not database-enforced immutable records.

## Memory and time

Memory retrieval is bounded rather than replaying a whole transcript. It combines recent active-chat messages, lexical matches across the session, nearby context for references, and exact temporal ranges. Explicit dates and relative periods resolve against the browser's IANA timezone into half-open UTC ranges, so “yesterday” means a local calendar day, including daylight-saving boundaries. Each selected message retains its timestamp, conversation ID, and retrieval reason; the UI lets a user inspect and open the source conversation. Original messages remain available for exact recall even when the model receives a bounded excerpt.

Retrieval is lexical and metadata-based today. This keeps date and entity matches inspectable, but paraphrases can be missed. Embeddings were considered and deferred until the evaluation set shows that lexical recall is the limiting factor; an unmeasured similarity score would make the system harder to explain without guaranteeing better recall.

## Search and orchestration

`planSearch` is a deterministic freshness guard, not a second LLM call. It requires fresh evidence for explicit change checks, “still correct” questions, and current pricing/fact requests. On other turns the model chooses whether to use the sole `web_search` tool. The model provider is configurable; Meta Muse Spark 1.2 Contributor is the default, with OpenAI as an alternative.

`MAX_SEARCH_CALLS` sets the maximum number of logical tool executions (default 2, allowed range 1–5). The bounded loop validates the tool response path, answers every requested tool-call ID, handles unsupported or unexpected parallel calls, and never executes beyond the budget. When the budget is consumed, it disables tools and gives the model a final-answer opportunity. If generation fails or asks for tools again, a bounded fallback cites the evidence already collected or says verification failed. An 80-second request deadline and provider timeouts bound work; cancellation propagates from the request. This avoids spending all available work on tool rounds and then discarding useful results.

For list references such as “any of them,” the agent extracts ordered entities from retrieved user messages before search. One `web_search` call can fan out internally to up to five entities and ten provider queries, with concurrency two. Pricing and announcement intent select corresponding official-source-oriented queries. Results from likely official domains are ranked first, URLs are normalized and deduplicated, and per-query failures do not erase successful results. Fanout remains an implementation detail: no additional tool is exposed to the model. The entity parser is rule-based and may miss unrecognized list phrasing; large lists are capped.

## Evidence, citations, and trade-offs

Prior claims and source snapshots are supplied separately from current findings. The prompt requires the agent to compare like with like, cite only retrieved URLs, and say when a change cannot be established. A current price alone does not prove that a price changed. Citation auditing checks URL provenance and paragraph coverage, and the relational links record what the answer cited; neither verifies semantic entailment. This limitation is explicit rather than hidden behind a citation-shaped answer.

PostgreSQL lexical retrieval was chosen over a vector database because the challenge prioritizes exact dates, ordered lists, and inspectable evidence history. A deterministic freshness guard was chosen over a planner model call to reduce latency and failure points; ordinary search selection remains with the model. SSE carries status, memory, sources, and tokens in the same cancellable request instead of polling. Search provider access is isolated behind an interface and mocked in automated tests. The application currently uses Tavily and OpenAI-compatible model APIs; no generated code is executed and retrieved pages are treated as untrusted data.

## Evaluation and next week

`npm test` includes fixed-time memory evaluation and mocked unit tests for temporal boundaries, retrieval, planning, citation provenance, one- and two-call budget exhaustion, unexpected and parallel tool calls, five-entity fanout, partial provider failure, URL deduplication, cancellation, timeout, source retention, and no calls after budget exhaustion. `npm run eval:memory` exercises exact date recall and related retrieval behavior. These tests do not use live credentials, measure Tavily ranking, or prove claim-level source entailment.

With another week, I would add a human-labeled claim-support benchmark and recorded provider fixtures, improve entity extraction from varied list formats, and measure retrieval precision/recall and search-call efficiency before adding embeddings. I would also add crash-safe recovery for interrupted turns and a shared rate limiter before multi-instance deployment. The current in-process rate limit and user-message-before-generation persistence can leave gaps across instances or after an interrupted response.
