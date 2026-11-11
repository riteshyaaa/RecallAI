import { db } from "@/lib/db";
import { normalizeSearchUrl } from "./search-url";

const citationPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/g;

export function extractCitedClaims(
  answer: string,
  sourceByUrl: Map<string, string>,
) {
  const paragraphs = answer
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim());
  return paragraphs.flatMap((paragraph) => {
    const citations = [...paragraph.matchAll(citationPattern)];
    const sourceIds = [
      ...new Set(
        citations.flatMap((match) => {
          const normalized = normalizeSearchUrl(match[2]);
          const sourceId = normalized ? sourceByUrl.get(normalized) : undefined;
          return sourceId ? [sourceId] : [];
        }),
      ),
    ];
    const text = paragraph
      .replace(citationPattern, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .trim();
    return text.length >= 24 && sourceIds.length ? [{ text, sourceIds }] : [];
  });
}

/** Store cited answer paragraphs as immutable claims linked to the search snapshots that support them. */
export async function persistAnswerEvidence(
  answerMessageId: string,
  sourceMessageId: string,
  answer: string,
) {
  const executions = await db.searchExecution.findMany({
    where: { messageId: sourceMessageId, status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    include: { sources: true },
  });
  if (!executions.length) return 0;

  const sourceByUrl = new Map<string, string>();
  for (const execution of executions) {
    for (const source of execution.sources) {
      const normalized = normalizeSearchUrl(source.url);
      if (normalized && !sourceByUrl.has(normalized))
        sourceByUrl.set(normalized, source.id);
    }
  }
  const claims = extractCitedClaims(answer, sourceByUrl);

  if (!claims.length) return 0;
  await db.$transaction(
    claims.map((claim) =>
      db.evidenceClaim.create({
        data: {
          messageId: answerMessageId,
          text: claim.text,
          sources: {
            create: claim.sourceIds.map((sourceId) => ({ sourceId })),
          },
        },
      }),
    ),
  );
  return claims.length;
}
