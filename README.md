# RecallAI

RecallAI is a research assistant that remembers what you asked and checks what has changed. It combines conversation memory, date-aware recall, and live web search to answer follow-ups with relevant sources. Ask what you discussed last week, revisit a shortlist, or compare an old answer with current evidence. RecallAI keeps historical messages and search evidence so it can distinguish what it found then from what it finds now.

## Run locally

1. Copy `.env.example` to `.env`.
2. **Recommended: use a Meta API key.** The default model is Meta Muse Spark 1.2 Contributor (`MODEL_PROVIDER="meta"`, `META_MODEL="muse-spark-1.2-contributor"`). Set `META_API_KEY` and `TAVILY_API_KEY`. See [Meta Muse Spark API docs](https://dev.meta.ai/docs/muse-spark). OpenAI is optional: set `MODEL_PROVIDER="openai"` and `OPENAI_API_KEY`.
3. Start Postgres: `docker compose up db -d`.
4. Install dependencies: `npm install`.
5. Apply migrations: `npx prisma migrate deploy`.
6. Start RecallAI: `npm run dev`.

Open `http://localhost:3000`. For Docker, configure `.env` and run `docker compose up --build`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local development server |
| `npm test` | Run offline unit and evaluation tests |
| `npm run eval:memory` | Evaluate historical and date-based memory retrieval |
| `npm run lint` | Check code style |
| `npm run build` | Create a production build |

## Environment

Copy `.env.example` to `.env` and set:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `META_API_KEY` | **Recommended:** Meta Muse Spark 1.2 Contributor (the default model) |
| `TAVILY_API_KEY` | Web search |
| `MODEL_PROVIDER`, `META_MODEL` | Optional model configuration; defaults to `meta` and `muse-spark-1.2-contributor` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional OpenAI alternative (`MODEL_PROVIDER="openai"`) |

Provider keys are used server-side and are not sent to the browser. See [DESIGN.md](DESIGN.md) for architecture and trade-offs.
