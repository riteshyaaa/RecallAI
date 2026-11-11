# RecallAI offline evaluation set

Run the challenge memory and citation checks with:

```bash
npm run eval:memory
```

Run the full unit and evaluation suite with `npm test`. The fixture cases include cross-conversation references to a shortlist, resolving “the second one” before a fresh search, exact November 3 recall, last-Tuesday Postgres recall, local-day boundaries in India and Los Angeles, and a 23-hour Denver daylight-saving day.

The memory tests call the production `retrieveMemory` function with a Prisma query mock and fixed timestamps. They assert that labeled historical messages are returned, date-boundary decoys are omitted, and context stays within the production limit. No database, model, or live search API is called by the evaluator.

The citation audit checks that Markdown citation URLs normalize to URLs in the supplied search result set and that substantive answer paragraphs contain citations. It detects invented links and missing citation markers. It does **not** evaluate whether a source's content semantically proves a claim; that requires a separate human-reviewed or model-judged quality set.
