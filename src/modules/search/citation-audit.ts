import { normalizeSearchUrl } from "./search-url";
import type { SearchResult } from "./search.types";

export type CitationAudit = {
  citationCount: number;
  invalidCitations: string[];
  uncitedParagraphs: string[];
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
  const uncitedParagraphs = answer
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => {
      if (!paragraph || /^#{1,6}\s/.test(paragraph)) return false;
      if (paragraph.startsWith("```") || paragraph.startsWith(">"))
        return false;
      const text = paragraph.replace(/[`*_>#-]/g, " ");
      const wordCount = text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
      const hasMarkdownCitation =
        /\[[^\]]+\]\(https?:\/\/[^\s)]+(?:\s+[^)]*)?\)/.test(paragraph);
      return wordCount >= 8 && !hasMarkdownCitation;
    });

  return {
    citationCount: citations.length,
    invalidCitations,
    uncitedParagraphs,
    passed: invalidCitations.length === 0 && uncitedParagraphs.length === 0,
  };
}
