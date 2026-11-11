# RecallAI implementation notes

This document is the detailed companion to the one-page [DESIGN.md](DESIGN.md). It records the current implementation, the problems it addresses, the reasons for the main choices, and the limits that remain. It is written against the code in this repository; it does not describe planned work as if it were already shipped.

## What the product does

RecallAI is a browser-scoped conversational research assistant. It can answer from the current turn, retrieve messages from earlier conversations, or call one external tool, `web_search`. It streams status, search sources, and generated text to the browser. Conversations and completed assistant responses survive refreshes.

The differentiating behavior is change-aware recall. For a request such as “Has any pricing changed since then?”, the app retrieves the earlier discussion and the evidence cited in its answer, requires a new search, and gives the model the historical and current records as distinct facts. Historical messages, search executions, source snapshots, and answer claims are retained as separate rows; a new search does not replace the record of what was known earlier.

## Request lifecycle

1. `POST /api/chat` limits the request body, parses JSON, validates it with Zod, resolves the anonymous session, and checks the per-session rate limit.
2. The route verifies that the requested conversation belongs to that session, or creates a conversation, then persists the user's message and updates conversation activity.
3. `retrieveMemory` gathers a bounded set of messages from the active chat and the same session. It uses exact local-calendar date ranges when the prompt names a date or relative period, lexical matches for topic/entity terms, recent active-chat messages, and nearby session messages for pronoun and ordinal references.
4. The route fetches persisted evidence claims linked to retrieved messages and supplies their original source URL, title, retrieval timestamp, and publication date with the memory. The UI also receives retrieval reasons and timestamps.
5. `planSearch` checks a small set of explicit freshness cues. A change check, “still correct/accurate/true,” “since then,” current/latest/recent phrasing, or pricing/price wording marks fresh evidence as required. This decision is deterministic and adds no model call. Other turns allow the model to decide whether to use search.
6. `runAgent` calls the configured OpenAI-compatible chat-completions API with the single `web_search` function. It streams model tokens, reconstructs tool arguments, validates them through `webSearchSchema`, runs Tavily on the server, stores the execution and its sources, then returns structured results to the model. Calls are sequential and capped at two; the total model loop has an 80-second deadline, while an individual model request is capped at 45 seconds and Tavily at 12 seconds.
7. When a search was explicitly required, the first model call uses `tool_choice: required`. Otherwise it uses `auto`. Search results are untrusted evidence, not instructions. The model prompt requires citations to returned URLs and asks it to distinguish historical from current claims and state when a change cannot be verified.
8. SSE carries the conversation ID, progress/status, the search plan, retrieved memory, sources, and answer tokens. On successful completion, the answer and source metadata are saved once. Cited answer paragraphs are linked to matching `EvidenceSource` rows.

The request's abort signal is passed to the model request; the client stops reading when canceled. The route does not save an assistant answer as complete unless the agent returns successfully. The user message is persisted before generation, so an interrupted turn can leave a user message without an assistant reply; recovery/retry semantics are not implemented yet.

## Module responsibilities

| Area          | Implementation                                                   | Responsibility                                                                                                                           |
| ------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP boundary | `src/app/api/`                                                   | Validate input, enforce session ownership, stream chat events, serve conversations and health status.                                    |
| Agent         | `src/modules/agent/orchestrator.ts`, `plan.ts`, `prompts.ts`     | Deterministic freshness guard, single-tool schema, bounded model/tool loop, memory/evidence context, prompt-injection boundaries.        |
| Memory        | `src/modules/memory/retrieval.service.ts`, `temporal.service.ts` | Date parsing, session-scoped candidate queries, ranking, de-duplication, context limit, reason labels.                                   |
| Search        | `src/modules/search/`                                            | Zod tool-argument validation, Tavily adapter, URL normalization, result de-duplication/ranking, evidence persistence and citation audit. |
| Persistence   | `prisma/schema.prisma`, `src/lib/db.ts`                          | Relational ownership, messages, searches, source snapshots, claims, indexes and cascading cleanup.                                       |
| UI            | `src/app/page.tsx`, `src/components/chat/`                       | Conversation history, streaming chat, sources, status and inspectable memory references.                                                 |
| Validation    | `tests/unit/`, `tests/evaluation/`                               | Offline checks for dates, retrieval, freshness planning, citation provenance/coverage, and evidence links.                               |

### HTTP endpoints

- `POST /api/chat` validates and streams one turn.
- `GET /api/conversations` lists the latest 100 conversations for the session; `POST` creates one with an optional validated title.
- `GET /api/conversations/:id` returns the owned conversation with messages; `DELETE` removes it and related rows through cascade rules.
- `GET /api/health` checks PostgreSQL with `SELECT 1` and returns `503` when unavailable.

All conversation operations enforce cookie-session ownership. There is no separate public search endpoint; web search is called by the server-side agent only.

## Data model and evidence history

- **Session → Conversation → Message:** one random cookie session owns many conversations; each conversation owns ordered messages. Message timestamps, rather than conversation activity timestamps, answer historical questions.
- **ConversationSummary:** a one-to-one optional summary field exists in the schema. Automatic summary generation and summary-based retrieval are not currently wired into the request path.
- **SearchExecution:** records the originating conversation and user message, exact search query, status (`PENDING`, `SUCCESS`, `EMPTY`, `FAILED`), raw normalized result snapshot, duration, and creation time.
- **EvidenceSource:** one row per normalized URL per search execution. It stores title, snippet, supplied publication date, and `retrievedAt`. Retrieval time is not represented as the article's publication date.
- **EvidenceClaim:** stores a cited answer paragraph associated with its assistant message. `EvidenceClaimSource` links that paragraph to the source snapshot(s) that the answer cited. The join table uses a composite key, preventing duplicate claim/source links.

All ownership is derived from the HTTP-only `recall_session` cookie, not from a caller-supplied session ID. Conversation APIs check that the conversation belongs to the current session. The cookie is `SameSite=Lax`, `HttpOnly`, secure in production, and lasts one year. This provides browser-local continuity, not account login or cross-device sync.

`persistAnswerEvidence` only creates links when a Markdown citation normalizes to a URL in the successful search snapshots for that user turn. It stores paragraph-sized claim text, not a machine-verified atomic proposition. A prior answer's evidence can be retrieved with its message and passed back to the model with the saved retrieval time.

## Memory retrieval and temporal handling

The system avoids replaying complete transcripts. It queries at most 12 recent active-chat messages, 8 lexical matches, 16 nearby session messages for reference-like prompts, and 24 messages inside an explicit temporal range, then ranks and caps the final result at 24. Date recall suppresses unrelated recency/lexical candidates so those candidates do not crowd out the requested day.

For ranking, candidate groups have base weights: temporal 100, active-chat recent 55, nearby-reference 35, lexical 20. Each candidate also receives 4 points per matching query term and a recency bonus `12 / (1 + ageHours / 24)`. Duplicate message IDs retain the highest score and all applicable selection explanations. Results are sorted chronologically before they enter the context.

Date expressions resolve against the browser's IANA timezone. A local day becomes a half-open UTC interval `[start, end)` by independently resolving each local midnight. This handles 23- and 25-hour DST days and avoids confusing local date boundaries with UTC dates. The current parser handles ISO dates, named month/day dates, “last [weekday],” “last week,” “last month,” “yesterday,” and “today.” A named date without a year uses the current local year. These are English-language rules; ambiguous expressions such as “a week ago” are not covered by the parser.

For each returned memory item, the application provides one or more human-readable reasons: temporal match, lexical term match, recent message in the active conversation, or nearby message that may resolve a reference. The chat's “Memory used” panel shows these reasons and provides a link to open a different source conversation. Reasons explain the retrieval path; they do not claim that every selected item was ultimately used in the generated text.

## Web search and bounded tool execution

The agent exposes exactly one tool: `web_search({ query, search_depth?, max_results? })`. The provider is isolated behind a `SearchProvider` interface. The Tavily adapter:

- uses a server-only API key and a 12-second abort timeout;
- rejects unsuccessful HTTP responses and passes structured provider errors back to the agent;
- validates query length/depth/result count at the service boundary;
- accepts only HTTP(S) URLs, removes fragments and common tracking parameters, sorts query parameters, removes trailing slashes, and drops malformed URLs;
- de-duplicates normalized URLs and sorts by provider score when scores are present;
- preserves title, snippet, publication date, score, retrieval time, and provider duration.

`parallel_tool_calls` is disabled and the orchestrator processes at most one tool call in each round. A maximum of two searches is allowed. The 80-second overall deadline bounds repeated model calls; each model request has a 45-second maximum, adjusted downward to the remaining deadline. The freshness planner's keyword rules deliberately err toward searching when the user says “pricing” or “today.” This improves current-fact coverage but can cause a search on some questions that could otherwise be answered from context.

## Streaming, UI, and request security

SSE uses JSON data frames with event types for `conversation`, `status`, `plan`, `memory`, `sources`, `token`, `done`, and `error`. The UI renders source cards with retrieval dates, only turns Markdown links into clickable links when their URL appears in returned sources, and shows the memory excerpt, local display time, selection reason, and original-chat link. ReactMarkdown is used without enabling raw HTML rendering.

The chat route rejects malformed JSON, caps request bodies at 48 KB, validates content and timezone with Zod, and enforces 20 requests per minute per session. Rate limiting is in-process memory and is not shared between server instances. Provider credentials are read only server-side. Retrieved memory is serialized as quoted historical JSON and the system prompt explicitly says it is untrusted data; webpage content is also described as untrusted and cannot change tool policy. No generated code is executed.

Model selection is environment-driven: `MODEL_PROVIDER=meta` uses the Meta OpenAI-compatible endpoint and defaults to `muse-spark-1.2-contributor`; `MODEL_PROVIDER=openai` uses `OPENAI_MODEL`. A missing selected model key fails the turn with a configuration error. A missing or failing Tavily provider is recorded as a failed search execution and the tool error is returned to the model so it can answer with uncertainty. There is no silent “pretend search succeeded” fallback. The health endpoint only checks the database, not model or search credentials.

## Main problems addressed and why

### Budget exhaustion discarded evidence and blocked the final answer

**Problem:** The prior orchestration loop allowed a final provider response to contain a tool call after the search allowance was used, then surfaced a generic “execution limit reached” error. It also only handled the first tool call in a response, leaving parallel call IDs without valid tool responses. This discarded evidence already retrieved and prevented a useful answer.

**Implementation:** `runBoundedToolLoop` owns the logical search budget and final-answer transition. `MAX_SEARCH_CALLS` is configurable (default 2, bounded from 1 to 5). It accounts for calls before executing, answers every requested tool call ID, safely rejects unsupported tools, disables tools after the budget, and allows a bounded final attempt. It retains accumulated sources across turns and returns a citation-bearing evidence fallback, or states verification was unsuccessful if nothing useful was found. The existing request cancellation and total deadline are passed into model and search work; there is no unbounded retry loop. Intermediate assistant text is reset in the SSE client when the model returns a tool call, preventing internal reasoning/tool-call text from appearing as the final answer.

### One entity list previously consumed several model search rounds

**Problem:** A request to check changes across five previously discussed CRM products could trigger separate model tool-call rounds. That needlessly consumed the logical search budget before the final response and could leave some entities unchecked.

**Implementation:** `entity-fanout.ts` extracts ordered names from relevant memory and resolves list references such as “them”, “all of them”, and ordinal references. The one existing `web_search` invocation expands to bounded provider queries for official pricing and/or announcements/releases. The batch is capped at five entities/ten subqueries, runs two provider requests concurrently, respects the shared deadline and per-provider timeout, and preserves per-query success/failure reports. Results carry the originating subquery and retrieval time; URL normalization/deduplication occurs across the batch, with likely official domain matches prioritized. Individual failures do not erase successful results. Only `web_search` is exposed to the model.

### Evidence and known limitations

The existing historical `EvidenceSource`, `EvidenceClaim`, and `EvidenceClaimSource` records and persistence flow remain intact. Each fanout query is saved as a `SearchExecution`, and returned sources continue through the existing evidence and citation path. The prompt tells the model to compare old/current evidence only where comparable, cite retrieved URLs, and identify insufficiently researched entities. A source page/result is not proof that a change occurred; semantic claim entailment is still not automatically verified.

The current entity parser is intentionally lightweight and relies on ordered list phrasing in retrieved message text; it can miss entities in unusual prose or unrecognized list formats. It is limited to five names and a fixed query fanout, so very long lists are only partially researched. Tavily result quality and ranking are provider-dependent. A shared distributed rate limiter, automatic partial-turn recovery, robust entity extraction, and claim-level entailment evaluation remain future work.

### Regression coverage

Added offline tests cover one logical request for five entities, single/second-call budget exhaustion, model tool requests after exhaustion, safe parallel/unsupported tool responses, partial provider failure, URL deduplication, citation retention, historical/current evidence comparison, cancellation and timeout, and no additional provider calls after the budget. These use mocked search/model behavior and fixed fixtures and require no live credentials. No live provider reliability or factual-quality claim is implied by passing unit tests.

### Exact recall versus prompt growth

**Problem:** Sending all conversation history can make requests slower, more expensive, and less relevant; aggressive summarization can lose exact wording and timestamps. **Choice:** Keep originals in PostgreSQL and retrieve a bounded set with explicit timestamps and conversation IDs. Summary fields remain available for a future implementation but are not used as a shortcut for exact recall.

### Human dates versus UTC storage

**Problem:** “Yesterday” is a local calendar day, not the previous 24 hours. A UTC-only date filter can return the wrong user's messages, especially near midnight or DST changes. **Choice:** Resolve local midnight boundaries in the client's timezone and query UTC timestamps using inclusive start/exclusive end. Tests cover India, Los Angeles, Denver, named dates, and weekday references.

### “What changed?” needs two evidence states

**Problem:** A current search result gives a value now, but it does not prove what the value was when an earlier answer was produced. **Choice:** Persist source snapshots and retrieval timestamps, attach cited answer paragraphs to those snapshots, and keep old messages unchanged. The prompt instructs the model to say the change itself is unverified if it cannot compare comparable evidence.

### Freshness without an extra planner call

**Problem:** A second LLM planning call would add latency and another source of failure. Purely relying on model discretion can miss explicit “has this changed?” requests. **Choice:** Use small deterministic rules for explicit freshness intents and force the first tool call only for those prompts; preserve model choice for other questions. This is a transparent precision/recall trade-off, tested offline.

### Useful references without arbitrary tools

**Problem:** “The second one” has no meaning without the prior ordered list, while arbitrary model tools increase attack surface and make behavior harder to reason about. **Choice:** Retrieve nearby and related messages, give the model original order and timestamps, and expose only a schema-validated server-side search function. Ambiguous references should trigger clarification rather than an invented entity.

### Inspectable memory and evidence

**Problem:** Hidden retrieval and citation behavior is difficult for a user or reviewer to debug. **Choice:** Return retrieval reasons, source cards, original conversation links, and persisted claim-to-source associations. This records provenance but does not claim semantic entailment.

## Evaluation and verification

`npm run eval:memory` runs the fixed, offline challenge fixtures plus freshness-plan and evidence-link unit cases. It calls the production memory retrieval function against a Prisma query mock and checks expected message inclusion, labeled off-date exclusions, date boundaries, DST, empty history, and the context cap. Current fixture metrics are 10/10 expected messages recovered and 0/6 labeled off-date messages returned. These figures describe this small synthetic set, not real-world retrieval quality.

Citation tests check that citations resolve to returned source URLs and report paragraph citation coverage. Evidence-link tests verify that cited paragraphs attach only to matching source snapshots. Freshness tests check whether a synthetic tool-call trace satisfies the deterministic policy. The ordinary test suite makes no live model or search calls.

**Not measured:** whether a cited source's actual page text semantically supports its claim. The current mechanical checker detects invented URLs and uncited substantive paragraphs, but a claim can cite a real yet irrelevant source. A human-reviewed or model-judged entailment set is still needed. No end-to-end browser tests or mocked full model/provider orchestration tests are currently in the suite.

## Run and check

```bash
cp .env.example .env
docker compose up db -d
npm install
npx prisma migrate deploy
npm run dev
```

Set `TAVILY_API_KEY` and `META_API_KEY` for the default Meta Muse Spark 1.2 Contributor configuration. Alternatively set `MODEL_PROVIDER="openai"` and `OPENAI_API_KEY`; `OPENAI_MODEL` selects the OpenAI model. `DATABASE_URL` configures PostgreSQL. Tests can run without live provider keys. See [README.md](README.md) for the run commands and [`.env.example`](.env.example) for every variable.

The current verification completed during implementation: `npm test` (28 tests passed), `npm run eval:memory` (20 passed), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `npx prisma migrate status` (database up to date).

## Deliberate omissions and next improvements

- Add a reviewed claim/source entailment set and measure unsupported-claim rate; keep the judge independent of the generation model where possible.
- Measure retrieval precision/recall on real challenge conversations before adding PostgreSQL full-text ranking or embeddings/pgvector. Current lexical matching can miss paraphrases, and the nearby-reference query is limited to the most recent 16 session messages.
- Add provider-mocked integration and Playwright flows for reference resolution, fresh searches, citation display, cancellation, persistence after refresh, and no-evidence answers.
- Decide how interrupted turns are resumed or marked; current requests do not persist partial assistant answers.
- Replace process-local rate limiting before horizontal scaling and add operational metrics for time-to-first-event, search duration, model generation, and total request time.
- Generate and use conversation summaries for long sessions while retaining original messages for exact recall.
- Add user accounts or a deliberate session migration/export path if cross-device memory becomes a requirement.
