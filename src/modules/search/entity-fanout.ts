export type SearchMemory = { role: string; content: string };

const entityStopWords = new Set([
  "and", "the", "for", "team", "tools", "companies", "company", "options",
  "vendors", "providers", "platforms", "crm", "software", "five", "four",
  "three", "two", "one", "sales", "small", "enterprise", "business",
]);

function looksLikeEntity(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  if (words.every((word) => entityStopWords.has(word.toLowerCase()))) return false;
  return words.some((word) => /^[A-Z][A-Za-z0-9.-]*$/.test(word));
}

function parseList(value: string) {
  return value
    .replace(/[.!?]+$/g, "")
    .split(/,|\s+and\s+/i)
    .map((part) => part.replace(/^[\s:;\-]+|[\s:;]+$/g, "").trim())
    .filter(looksLikeEntity);
}

function findOrderedLists(memory: SearchMemory[]) {
  const entities: string[] = [];
  for (const item of memory) {
    if (item.role !== "USER") continue;
    for (const sentence of item.content.split(/[.!?\n]+/)) {
      const marker = /\b(?:shortlist(?:ed)?|selected|chose|options?|vendors?|providers?)\b/i.exec(sentence);
      if (!marker) continue;
      const tail = sentence.slice(marker.index + marker[0].length);
      const colonIndex = tail.indexOf(":");
      const list = colonIndex >= 0 ? tail.slice(colonIndex + 1) : tail;
      const parsed = parseList(list);
      if (parsed.length >= 2) entities.push(...parsed);
    }
  }
  return [...new Set(entities)];
}

/** Resolve plural and ordinal references against ordered entity lists in recalled user messages. */
export function resolveSearchEntities(
  message: string,
  memory: SearchMemory[],
): string[] {
  const entities = findOrderedLists(memory);
  if (!entities.length) return [];
  const lower = message.toLowerCase();
  const ordinal = lower.match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\b/);
  if (ordinal) {
    const indexes: Record<string, number> = {
      first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2,
      fourth: 3, "4th": 3, fifth: 4, "5th": 4,
    };
    const selected = entities[indexes[ordinal[1]]];
    return selected ? [selected] : [];
  }
  if (/\b(former|first of those)\b/.test(lower)) return [entities[0]];
  if (/\b(latter|last of those)\b/.test(lower)) return [entities.at(-1)!];
  if (/\b(?:them|these|those|each of|all of|any of|all five|all four|all three|both)\b/i.test(message))
    return entities.slice(0, 5);
  const explicit = entities.filter((entity) =>
    lower.includes(entity.toLowerCase()),
  );
  return explicit.length > 1 ? explicit.slice(0, 5) : [];
}

export function buildEntitySearchQueries(
  query: string,
  entities: string[],
  intent = query,
) {
  if (entities.length < 2) return [query];
  const lower = `${query} ${intent}`.toLowerCase();
  const wantsPricing = /\b(pric(?:e|ing)|plan|billing|seat|cost)\b/.test(lower);
  const wantsAnnouncements = /\b(ship(?:ped)?|release|feature|announcements?|launch|updates?|new)\b/.test(lower);
  const topics =
    wantsPricing && wantsAnnouncements
      ? ["official pricing plans", "official product announcements release notes launches"]
      : wantsPricing
        ? ["official pricing plans"]
        : wantsAnnouncements
          ? ["official product announcements release notes launches"]
          : [query];
  return entities.slice(0, 5).flatMap((entity) =>
    topics.map((topic) => `${entity} ${topic}`),
  );
}
