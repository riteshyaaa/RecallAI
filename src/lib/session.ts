import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

const COOKIE = "recall_session";
export async function getSessionId() {
  const store = await cookies();
  let id = store.get(COOKIE)?.value;
  if (!id) {
    id = randomUUID();
    store.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  await db.session.upsert({ where: { id }, update: {}, create: { id } });
  return id;
}
