# RecallAI

RecallAI is a memory-aware web research assistant built with Next.js, PostgreSQL/Prisma, OpenAI tool calling, and Tavily. It keeps conversations across refreshes using a secure, HTTP-only anonymous session cookie.

## Run locally

1. Copy `.env.example` to `.env`. Set `TAVILY_API_KEY` and `META_API_KEY` to use the default Meta Muse Spark 1.2 Contributor model. To use OpenAI instead, set `MODEL_PROVIDER="openai"` and `OPENAI_API_KEY`. `META_MODEL` defaults to `muse-spark-1.2-contributor` and can be set to another supported Muse Spark model ID.
2. Start Postgres: `docker compose up db -d`
3. Install: `npm install`
4. Apply migrations: `npx prisma migrate deploy`
5. Start: `npm run dev`

Open `http://localhost:3000`. For Docker deployment, configure `.env` and run `docker compose up --build`.

## Commands

`npm run lint` runs ESLint. `npm test` runs unit and offline evaluation tests. `npm run eval:memory` runs the challenge memory and citation evaluation set by itself. `npm run build` verifies production compilation. Automated tests do not make live provider calls.

## Environment

`DATABASE_URL`, `MODEL_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `META_API_KEY`, `META_MODEL`, and `TAVILY_API_KEY` are documented in `.env.example`. Meta Muse Spark 1.2 Contributor is the default provider/model; set `META_API_KEY` to use it. Only the selected model provider's key is required. The Meta provider uses the OpenAI-compatible endpoint at `https://api.meta.ai/v1`; no keys are sent to the browser.

See [DESIGN.md](DESIGN.md) for the one-page architecture note and trade-offs.
