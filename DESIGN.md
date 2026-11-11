# RecallAI design

RecallAI is a conversational research agent built around one tool, `web_search`. Its defining behavior is a **temporal evidence ledger**: original messages and retrieved source snapshots are immutable records, so a later answer can compare what was said and cited then with what fresh sources say now.

## Request path

```text
user message → persist → retrieve bounded memory + selection reasons
             → deterministic freshness plan → model/tool loop (≤2 searches, ≤80s)
             → stream status, sources, tokens → persist answer + claim/source links
```

PostgreSQL is the system of record. `Message` stores the original conversation. `SearchExecution` records query, status, result snapshot, and duration; each normalized `EvidenceSource` stores its URL, title, snippet, publication date, and retrieval time. Cited answer paragraphs become `EvidenceClaim` rows linked to the exact source snapshots. The earlier answer and its evidence are never overwritten. Follow-up context can therefore contain both the historical claim and its sources, while a new search produces a separate current snapshot.

## Memory and planning

Retrieval combines exact local-calendar ranges, recent active-chat messages, lexical matches, and nearby messages for references such as “the second one.” Dates are resolved in the browser's IANA timezone into half-open UTC intervals, including daylight-saving transitions. Candidates are deduplicated, ranked, and capped. Each returned item carries its selection reason (date match, lexical match, recency, or nearby reference); the UI exposes these reasons and links to the original conversation. The original message remains the authority for exact recall. Retrieval is intentionally lexical today: paraphrase misses are measured in the challenge set, not hidden behind an unmeasured embedding score.

`planSearch` is a cheap deterministic guard, not a second model call. Phrases that ask what changed, whether an older answer is still correct, or request current pricing require a fresh search. Other turns leave search choice to the model. The orchestrator accepts one sequential tool call per round, at most two calls, caps total execution at 80 seconds, and gives each provider request a shorter timeout. “The second one” is resolved from retrieved ordered messages before the model forms its search query. Tool arguments are Zod-validated; search output is untrusted data.

## Evidence and uncertainty

The system distinguishes historical evidence from fresh results and tells the model that a result page alone does not prove a change. It should report a changed value only when current evidence supports it and the earlier snapshot establishes a comparable prior value; otherwise it reports the current finding and says the change could not be verified. Citation auditing verifies URL provenance and paragraph citation coverage. Persisted claim links record which returned sources the answer cited. Neither mechanism proves semantic entailment: a human-reviewed or separately judged evaluation remains necessary before claiming that every source truly supports every claim.

## Why this design

- **One model call for ordinary turns:** a standalone planner would add latency and another failure point. Deterministic phrase rules only force fresh evidence for explicit change/current-fact requests; the model still decides for other questions.
- **Relational snapshots over a vector store:** these challenge cases require exact dates, ordered lists, and source history. PostgreSQL indexes and lexical matching keep the system inspectable and dependency-light. Embeddings can be added behind retrieval after measuring paraphrase misses.
- **Append-only evidence over replacing old answers:** comparisons require “then” and “now” to remain independently inspectable. Search retrieval time is distinct from a source's publication date.
- **SSE over polling:** memory, plan, search status, sources, and answer tokens share one cancellable request. Search remains the only external agent tool.

## Evaluation and next week

`npm run eval:memory` uses fixed UTC fixtures and a mocked Prisma query to check exact-message recall, off-date exclusions, local timezone boundaries, DST, empty history, and context size. Citation tests detect fabricated URLs, missing citation markers, and citation coverage; plan tests assert that challenge change-checks require current evidence while pure recall does not. These are mechanical checks, not a substitute for claim/source entailment review. Next I would add a human-labeled set with claim-level support judgments, run it against real but recorded provider responses, measure recall/precision and search-call rate, and tune lexical retrieval before considering embeddings. I would also add crash-safe partial-turn recovery and a shared distributed rate limiter before multi-instance deployment.

## Search budget and multi-entity follow-ups

`MAX_SEARCH_CALLS` configures the maximum number of logical `web_search` executions (default 2, bounded to 1–5). Each execution may fan out internally when selected conversation memory contains a relevant list of multiple entities. It creates up to two queries per entity (official pricing and/or announcements/releases), capped at five entities and ten provider subqueries, with concurrency two and a shared deadline. These remain one model-visible tool call; the agent still has exactly one external tool.

The bounded loop accounts for each logical call, returns a response for every requested call ID (including unsupported and parallel calls), and never executes calls past the budget. After exhaustion the model gets a final turn with tools disabled. If it nevertheless requests a tool or fails/times out, the fallback uses collected search results and source URLs, or explicitly says verification failed when no useful evidence exists. Results gathered before exhaustion are retained. Query-level reports preserve partial failures, and URL deduplication applies across the fanout batch. Tests use fixed times and mocked providers; they do not test live Tavily ranking or semantic entailment.
