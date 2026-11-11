# RecallAI offline evaluation set

Run the challenge memory and citation checks with:

```bash
npm run eval:memory
```

Run the full unit and evaluation suite with `npm test`. The fixture cases include cross-conversation references to a shortlist, resolving “the second one” before a fresh search, exact November 3 recall, last-Tuesday Postgres recall, local-day boundaries in India and Los Angeles, and a 23-hour Denver daylight-saving day.

The memory tests call the production `retrieveMemory` function with a Prisma query mock and fixed timestamps. They assert exact historical-message recall, zero off-date false matches in the labeled fixtures, and bounded context. No database, model, or live search API is called by the evaluator.

The citation audit checks that Markdown citation URLs normalize to URLs in the supplied search result set and reports citation coverage for substantive paragraphs. Evidence-link tests verify cited answer paragraphs persist only against matching source snapshots. Freshness-plan tests measure compliance on explicit tool-call traces, require a fresh search for change/current-fact prompts, and leave pure historical recall unforced. These checks do **not** evaluate whether a source's content semantically proves a claim; the unsupported-claim entailment rate remains unmeasured until a human-reviewed or model-judged set is added.
