import { db } from "@/lib/db";
import { localDayBounds } from "./temporal.service";

export async function retrieveMemory(sessionId: string, conversationId: string, query: string, timeZone: string) {
  const recent = await db.message.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, role: true, content: true, createdAt: true, conversationId: true } });
  const lower = query.toLowerCase();
  const yesterday = /yesterday/.test(lower) ? localDayBounds(new Date(), timeZone, -1) : null;
  const temporal = yesterday ? await db.message.findMany({ where: { conversation: { sessionId }, createdAt: { gte: yesterday.start, lt: yesterday.end }, role: "USER" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, role: true, content: true, createdAt: true, conversationId: true } }) : [];
  const terms = query.toLowerCase().match(/[a-z0-9]{4,}/g)?.slice(0, 6) ?? [];
  const related = terms.length ? await db.message.findMany({ where: { conversation: { sessionId }, OR: terms.map((term) => ({ content: { contains: term, mode: "insensitive" } })) }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, role: true, content: true, createdAt: true, conversationId: true } }) : [];
  const unique = new Map([...recent.reverse(), ...temporal.reverse(), ...related.reverse()].map((m) => [m.id, m]));
  return [...unique.values()].slice(-20);
}
