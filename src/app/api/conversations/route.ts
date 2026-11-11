import { db } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { apiError, jsonError } from "@/lib/http";
import { createConversationSchema } from "@/lib/validation";
export async function GET() {
  try {
    const sessionId = await getSessionId();
    const conversations = await db.conversation.findMany({
      where: { sessionId },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      select: { id: true, title: true, createdAt: true, lastMessageAt: true },
    });
    return Response.json({ conversations });
  } catch (e) {
    return jsonError(e);
  }
}
export async function POST(request: Request) {
  try {
    const body = createConversationSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!body.success)
      return apiError("Invalid conversation.", 422, "VALIDATION_ERROR");
    const sessionId = await getSessionId();
    const conversation = await db.conversation.create({
      data: { sessionId, title: body.data.title ?? "New conversation" },
    });
    return Response.json({ conversation }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
