import { db } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { apiError, jsonError } from "@/lib/http";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionId = await getSessionId();
    const { id } = await params;
    const conversation = await db.conversation.findFirst({
      where: { id, sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return conversation
      ? Response.json({ conversation })
      : apiError("Conversation not found.", 404, "NOT_FOUND");
  } catch (e) {
    return jsonError(e);
  }
}
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionId = await getSessionId();
    const { id } = await params;
    const deleted = await db.conversation.deleteMany({
      where: { id, sessionId },
    });
    return deleted.count
      ? new Response(null, { status: 204 })
      : apiError("Conversation not found.", 404, "NOT_FOUND");
  } catch (e) {
    return jsonError(e);
  }
}
