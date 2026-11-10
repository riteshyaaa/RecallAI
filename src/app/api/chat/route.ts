import { db } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { apiError, jsonError } from "@/lib/http";
import { chatSchema } from "@/lib/validation";
import { retrieveMemory } from "@/modules/memory/retrieval.service";
import { runAgent } from "@/modules/agent/orchestrator";

export const runtime = "nodejs";
const encode = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
export async function POST(request: Request) {
  try {
    const body = chatSchema.safeParse(await request.json());
    if (!body.success) return apiError("Invalid chat request.", 422, "VALIDATION_ERROR");
    const sessionId = await getSessionId();
    const conversation = body.data.conversationId ? await db.conversation.findFirst({ where: { id: body.data.conversationId, sessionId } }) : await db.conversation.create({ data: { sessionId, title: body.data.message.slice(0, 70) } });
    if (!conversation) return apiError("Conversation not found.", 404, "NOT_FOUND");
    const userMessage = await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: body.data.message } });
    await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: userMessage.createdAt } });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ async start(controller) {
      let answer = ""; let sources: unknown[] = [];
      const send = (event: unknown) => controller.enqueue(encoder.encode(encode(event)));
      try {
        send({ type: "conversation", conversationId: conversation.id }); send({ type: "status", message: "Retrieving memory" });
        const memory = await retrieveMemory(sessionId, conversation.id, body.data.message, body.data.timezone);
        send({ type: "memory", items: memory.filter((m) => m.id !== userMessage.id).map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) });
        const result = await runAgent({ message: body.data.message, memory, signal: request.signal, onEvent: (event) => { if (event.type === "token") answer += event.text; if (event.type === "sources") sources = event.sources; send(event); } });
        if (!answer) answer = result.answer;
        const assistant = await db.message.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: answer, metadata: { sources } } });
        await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: assistant.createdAt } });
        send({ type: "done", messageId: assistant.id });
      } catch (error) { send({ type: "error", message: error instanceof Error ? error.message : "Unable to complete the request." }); }
      finally { controller.close(); }
    }});
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) { return jsonError(error); }
}
