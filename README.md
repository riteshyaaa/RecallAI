# RecallAI

RecallAI is a memory-aware web research assistant built with Next.js, PostgreSQL/Prisma, OpenAI-compatible tool calling, and Tavily. It keeps conversations across refreshes using a secure, HTTP-only anonymous session cookie. Search snapshots and cited answer claims are stored separately so follow-ups can compare what was known then with fresh evidence now.

## Run locally

1. Copy `.env.example` to `.env`.
2. **Recommended: use a Meta API key.** The default model is Meta Muse Spark 1.2 Contributor (`MODEL_PROVIDER="meta"`, `META_MODEL="muse-spark-1.2-contributor"`). Set `META_API_KEY` and `TAVILY_API_KEY`. See [Meta Muse Spark API docs](https://dev.meta.ai/docs/muse-spark). OpenAI is optional: set `MODEL_PROVIDER="openai"` and `OPENAI_API_KEY`.
3. Start Postgres: `docker compose up db -d`.
4. Install dependencies: `npm install`.
5. Apply migrations: `npx prisma migrate deploy`.
6. Start RecallAI: `npm run dev`.

Open `http://localhost:3000`. For Docker, configure `.env` and run `docker compose up --build`.

## Commands

`npm run lint` runs ESLint. `npm test` runs unit and offline evaluation tests. `npm run eval:memory` checks historical retrieval, timezone boundaries, empty-history behavior, freshness planning, and citation provenance/coverage. `npm run build` verifies production compilation. Automated tests do not make live provider calls. The citation checks do not determine semantic claim entailment; see [DESIGN.md](DESIGN.md).

## Environment

`DATABASE_URL`, `MODEL_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `META_API_KEY`, `META_MODEL`, and `TAVILY_API_KEY` are documented in `.env.example`. Meta Muse Spark 1.2 Contributor is the default provider/model; set `META_API_KEY` to use it. Only the selected model provider's key is required. The Meta provider uses the OpenAI-compatible endpoint at `https://api.meta.ai/v1`; no keys are sent to the browser.

See [DESIGN.md](DESIGN.md) for the one-page architecture note and trade-offs. See [BUILD_NOTES.md](BUILD_NOTES.md) for the implementation walkthrough, addressed problems, detailed data flow, test results, and known limitations.
