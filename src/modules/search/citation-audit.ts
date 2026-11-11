import { normalizeSearchUrl } from "./search-url";
import type { SearchResult } from "./search.types";

export type CitationAudit = {
  citationCount: number;
  invalidCitations: string[];
  uncitedParagraphs: string[];
  substantiveParagraphCount: number;
  citedParagraphCount: number;
  citationCoverageRate: number;
  passed: boolean;
};

/**
 * Checks citation provenance and whether substantive search-answer paragraphs
 * include at least one citation. This is a mechanical audit; it does not judge
 * whether a cited page semantically supports the associated claim.
 */
export function auditCitations(
  answer: string,
  sources: SearchResult[],
): CitationAudit {
  const allowed = new Set(
    sources.flatMap((source) => {
      try {
        const normalized = normalizeSearchUrl(source.url);
        return normalized ? [normalized] : [];
      } catch {
        return [];
      }
    }),
  );
  const citationPattern = /\[[^\]]+\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/g;
  const citations = [...answer.matchAll(citationPattern)].map((match) =>
    match[1].replace(/[.,;!?]+$/, ""),
  );
  const invalidCitations = citations.filter((citation) => {
    try {
      const normalized = normalizeSearchUrl(citation);
      return !normalized || !allowed.has(normalized);
    } catch {
      return true;
    }
  });
  const substantive = answer
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .flatMap((paragraph) => {
      if (!paragraph || /^#{1,6}\s/.test(paragraph)) return [];
      if (paragraph.startsWith("```") || paragraph.startsWith(">")) return [];
      if (
        /^(?:i (?:couldn't|cannot|can't) verify|no (?:reliable )?sources? (?:were|was) found|i found no usable sources)\b/i.test(
          paragraph,
        )
      )
        return [];
      const text = paragraph.replace(/[`*_>#-]/g, " ");
      const wordCount = text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
      const hasMarkdownCitation =
        /\[[^\]]+\]\(https?:\/\/[^\s)]+(?:\s+[^)]*)?\)/.test(paragraph);
      return wordCount >= 8 ? [{ paragraph, hasMarkdownCitation }] : [];
    });
  const uncitedParagraphs = substantive
    .filter(({ hasMarkdownCitation }) => !hasMarkdownCitation)
    .map(({ paragraph }) => paragraph);
  const citedParagraphCount = substantive.length - uncitedParagraphs.length;

  return {
    citationCount: citations.length,
    invalidCitations,
    uncitedParagraphs,
    substantiveParagraphCount: substantive.length,
    citedParagraphCount,
    citationCoverageRate:
      substantive.length === 0 ? 1 : citedParagraphCount / substantive.length,
    passed: invalidCitations.length === 0 && uncitedParagraphs.length === 0,
  };
}
