# RecallAI — design note

RecallAI is a chat agent with exactly one model tool: `web_search`. A Next.js route validates requests, loads memory, runs the model/tool loop, streams SSE events, and persists the completed answer. PostgreSQL and Prisma hold the source conversation records. A random HTTP-only session cookie scopes all data to a browser.

```text
message → persist → retrieve bounded memory → stream model/tool loop
        → optional Tavily search → cited answer → persist
```

## How memory and search work

Each message has its own UTC timestamp and conversation ID. Retrieval combines recent active-chat messages, lexical matches across the session, exact local-calendar ranges, and a small recency window for references such as “them” or “since then.” It deduplicates and caps context by message count and characters; originals remain stored for exact recall. Named dates, weekdays, yesterday, last week, and last month resolve in the browser's IANA timezone to half-open UTC ranges, including DST boundaries. The UI shows retrieved excerpts, local timestamps, and links to their original chats. Summary storage exists but is not generated or used.

The model chooses whether to search. The provider is selected by `MODEL_PROVIDER`, which defaults to Meta Model API using `muse-spark-1.2-contributor`; OpenAI remains available by selecting `openai`. Meta uses its OpenAI-compatible Chat Completions endpoint. A follow-up about changed pricing uses memory to resolve the company and prior date, then searches for current evidence. Search requests are schema-validated, timeout-bounded, and limited to two rounds. Results are URL-normalized, deduplicated, ranked by Tavily's scores, and treated as untrusted data. The prompt instructs the model to cite only URLs returned by search; weak evidence should produce a clear uncertainty statement. `npm run eval:memory` runs offline fixtures for challenge-style recall, timezone boundaries, and citation URL/coverage checks; it does not assess semantic entailment.

## Why these trade-offs

- **Bounded retrieval over full transcripts:** it preserves exact source messages without growing every prompt indefinitely. Lexical matching misses paraphrases; recency context helps resolve references. Embeddings can be evaluated later behind the same retrieval boundary.
- **Streamed tool-capable call over a separate planner call:** ordinary turns take one model call; a requested search adds only the necessary tool and answer turn. Tool execution is capped.
- **Anonymous cookie over accounts:** it gives durable browser-scoped ownership without login friction. Cross-device use needs authentication.
- **SSE over polling:** one request carries memory, search status, sources, and answer tokens. Aborted generations do not create completed assistant messages.

## Another week

I would test the three challenge scenarios end to end with mocked providers, measure memory misses on a labeled set, and compare lexical retrieval with PostgreSQL full-text and pgvector. I would also add a shared rate limiter for multi-instance hosting, recoverable interrupted turns, and automated checks that every rendered citation belongs to the returned source set.

## Run

Copy `.env.example` to `.env`, start PostgreSQL (`docker compose up db -d`), set `OPENAI_API_KEY` and `TAVILY_API_KEY`, then run `npm install`, `npx prisma migrate deploy`, and `npm run dev`. `OPENAI_MODEL` is configurable.
