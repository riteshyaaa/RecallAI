import { db } from "@/lib/db";
import { localCalendarBounds, localDayBounds } from "./temporal.service";

export type MemoryCandidate = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  conversationId: string;
  retrievalReasons?: string[];
};

type CandidateGroups = {
  recent: MemoryCandidate[];
  neighboring: MemoryCandidate[];
  related: MemoryCandidate[];
  temporal: MemoryCandidate[];
};

const stopWords = new Set([
  "about",
  "after",
  "again",
  "all",
  "and",
  "any",
  "are",
  "asked",
  "before",
  "big",
  "but",
  "can",
  "could",
  "changed",
  "compare",
  "current",
  "date",
  "did",
  "does",
  "find",
  "for",
  "from",
  "have",
  "help",
  "here",
  "how",
  "just",
  "last",
  "more",
  "most",
  "need",
  "not",
  "now",
  "one",
  "same",
  "search",
  "second",
  "since",
  "still",
  "tell",
  "than",
  "that",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "today",
  "two",
  "was",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "with",
  "would",
  "you",
  "your",
  "yesterday",
]);

function extractTerms(query: string) {
  return [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])]
    .filter((term) => !stopWords.has(term))
    .slice(0, 8);
}

export function temporalRange(
  query: string,
  timeZone: string,
  now = new Date(),
) {
  const lower = query.toLowerCase();
  const date = query.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (date)
    return localCalendarBounds(
      Number(date[1]),
      Number(date[2]),
      Number(date[3]),
      timeZone,
    );
  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const currentYear = Number(localParts.find((p) => p.type === "year")?.value);
  const currentMonth = Number(
    localParts.find((p) => p.type === "month")?.value,
  );
  const currentDay = Number(localParts.find((p) => p.type === "day")?.value);
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const monthPattern = monthNames.join("|");
  const namedDate =
    lower.match(
      new RegExp(
        `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\s+(20\\d{2}))?\\b`,
      ),
    ) ??
    lower.match(
      new RegExp(
        `\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`,
      ),
    );
  if (namedDate) {
    const dayFirst = /^\d/.test(namedDate[1]);
    const day = Number(dayFirst ? namedDate[1] : namedDate[2]);
    const monthName = dayFirst ? namedDate[2] : namedDate[1];
    const year = Number(dayFirst ? namedDate[3] : namedDate[3]) || currentYear;
    const monthNumber = monthNames.indexOf(monthName) + 1;
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    if (day >= 1 && day <= daysInMonth)
      return localCalendarBounds(year, monthNumber, day, timeZone);
  }
  const weekdayMatch = lower.match(
    /\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (weekdayMatch) {
    const weekdays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const today = new Date(
      Date.UTC(currentYear, currentMonth - 1, currentDay),
    ).getUTCDay();
    const target = weekdays.indexOf(weekdayMatch[1]);
    const daysBack = ((today - target + 6) % 7) + 1;
    return localDayBounds(now, timeZone, -daysBack);
  }
  const month = lower.match(/\blast month\b/);
  if (month) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
    }).formatToParts(now);
    let year = Number(parts.find((p) => p.type === "year")?.value),
      monthNumber = Number(parts.find((p) => p.type === "month")?.value) - 1;
    if (monthNumber === 0) {
      monthNumber = 12;
      year--;
    }
    return localCalendarBounds(year, monthNumber, 1, timeZone);
  }
  if (/\blast week\b/.test(lower)) {
    const localParts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(now);
    const year = Number(localParts.find((p) => p.type === "year")?.value),
      monthNumber = Number(localParts.find((p) => p.type === "month")?.value),
      day = Number(localParts.find((p) => p.type === "day")?.value);
    const weekday = new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay();
    const daysFromMonday = (weekday + 6) % 7;
    const monday = new Date(
      Date.UTC(year, monthNumber - 1, day - daysFromMonday - 7),
    );
    const start = localCalendarBounds(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate(),
      timeZone,
    ).start;
    const endDate = new Date(monday.getTime() + 7 * 86_400_000);
    const end = localCalendarBounds(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth() + 1,
      endDate.getUTCDate(),
      timeZone,
    ).start;
    return { start, end };
  }
  // Explicit historical dates take priority over temporal words in the
  // comparison clause (for example, "asked on Nov 3; is that still true today?").
  if (/\byesterday\b/.test(lower)) return localDayBounds(now, timeZone, -1);
  if (/\btoday\b/.test(lower)) return localDayBounds(now, timeZone);
  return null;
}

export function rankMemoryCandidates(
  query: string,
  groups: CandidateGroups,
  now = new Date(),
) {
  const terms = extractTerms(query);
  const candidates = new Map<
    string,
    { message: MemoryCandidate; score: number; reasons: string[] }
  >();
  const add = (messages: MemoryCandidate[], base: number, reason: string) => {
    for (const message of messages) {
      const ageHours = Math.max(
        0,
        (now.getTime() - message.createdAt.getTime()) / 3_600_000,
      );
      const lexicalHits = terms.filter((term) =>
        message.content.toLowerCase().includes(term),
      ).length;
      const score = base + lexicalHits * 4 + 12 / (1 + ageHours / 24);
      const existing = candidates.get(message.id);
      if (!existing)
        candidates.set(message.id, { message, score, reasons: [reason] });
      else {
        if (score > existing.score) existing.score = score;
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      }
    }
  };
  add(groups.recent, 55, "Recent message in this conversation");
  add(groups.neighboring, 35, "Nearby message helps resolve a reference");
  add(groups.related, 20, "Matched terms from the current question");
  add(
    groups.temporal,
    100,
    "Message timestamp falls within the requested date",
  );

  return [...candidates.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.message.createdAt.getTime() - a.message.createdAt.getTime(),
    )
    .slice(0, 24)
    .map(({ message, reasons }) => ({ ...message, retrievalReasons: reasons }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function retrieveMemory(
  sessionId: string,
  conversationId: string,
  query: string,
  timeZone: string,
  now = new Date(),
) {
  const range = temporalRange(query, timeZone, now);
  const preciseHistoricalRecall =
    range !== null &&
    /\b(?:what did i ask|what did i say|i asked|i said|questions? i asked)\b/i.test(
      query,
    );
  const terms = extractTerms(query);
  const isReference =
    /\b(they|them|those|these|that|it|second|first|former|latter|since then|we discussed|we shortlisted)\b/i.test(
      query,
    );
  const [recent, temporal, related, neighboring] = await Promise.all([
    !preciseHistoricalRecall
      ? db.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            conversationId: true,
          },
        })
      : Promise.resolve([]),
    range
      ? db.message.findMany({
          where: {
            conversation: { sessionId },
            createdAt: { gte: range.start, lt: range.end },
          },
          orderBy: { createdAt: "desc" },
          take: 24,
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            conversationId: true,
          },
        })
      : Promise.resolve([]),
    terms.length && !preciseHistoricalRecall
      ? db.message.findMany({
          where: {
            conversation: { sessionId },
            OR: terms.map((term) => ({
              content: { contains: term, mode: "insensitive" },
            })),
          },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            conversationId: true,
          },
        })
      : Promise.resolve([]),
    isReference && !preciseHistoricalRecall
      ? db.message.findMany({
          where: { conversation: { sessionId } },
          orderBy: { createdAt: "desc" },
          take: 16,
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            conversationId: true,
          },
        })
      : Promise.resolve([]),
  ]);
  return rankMemoryCandidates(
    query,
    { recent, temporal, related, neighboring } as CandidateGroups,
    now,
  );
}
