import { db } from "@/lib/db";
import { getSessionId } from "@/lib/session";
import { apiError, jsonError } from "@/lib/http";
import { chatSchema } from "@/lib/validation";
import { retrieveMemory } from "@/modules/memory/retrieval.service";
import { runAgent } from "@/modules/agent/orchestrator";
import { checkRateLimit } from "@/lib/rate-limit";
import { persistAnswerEvidence } from "@/modules/search/evidence.service";

const encode = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 48_000)
      return apiError("Request body is too large.", 413, "PAYLOAD_TOO_LARGE");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return apiError("Request body must be valid JSON.", 400);
    }
    const body = chatSchema.safeParse(parsed);
    if (!body.success)
      return apiError("Invalid chat request.", 422, "VALIDATION_ERROR");
    const sessionId = await getSessionId();
    const limit = checkRateLimit(sessionId);
    if (!limit.allowed)
      return Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please wait and try again.",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    const conversation = body.data.conversationId
      ? await db.conversation.findFirst({
          where: { id: body.data.conversationId, sessionId },
        })
      : await db.conversation.create({
          data: { sessionId, title: body.data.message.slice(0, 70) },
        });
    if (!conversation)
      return apiError("Conversation not found.", 404, "NOT_FOUND");
    const userMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: body.data.message,
      },
    });
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: userMessage.createdAt },
    });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let answer = "";
        let sources: unknown[] = [];
        const send = (event: unknown) => {
          if (!request.signal.aborted)
            controller.enqueue(encoder.encode(encode(event)));
        };
        try {
          send({ type: "conversation", conversationId: conversation.id });
          send({ type: "status", message: "Retrieving memory" });
          const memory = await retrieveMemory(
            sessionId,
            conversation.id,
            body.data.message,
            body.data.timezone,
          );
          send({
            type: "memory",
            items: memory
              .filter((m) => m.id !== userMessage.id)
              .map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
          });
          const relevantMemory = memory.filter((m) => m.id !== userMessage.id);
          const historicalClaims = relevantMemory.length
            ? await db.evidenceClaim.findMany({
                where: {
                  messageId: { in: relevantMemory.map((item) => item.id) },
                },
                include: { sources: { include: { source: true } } },
                take: 24,
              })
            : [];
          const claimsByMessage = new Map<string, typeof historicalClaims>();
          for (const claim of historicalClaims) {
            const existing = claimsByMessage.get(claim.messageId) ?? [];
            existing.push(claim);
            claimsByMessage.set(claim.messageId, existing);
          }
          const memoryWithEvidence = relevantMemory.map((item) => ({
            ...item,
            evidence: (claimsByMessage.get(item.id) ?? []).map((claim) => ({
              text: claim.text,
              sources: claim.sources.map(({ source }) => ({
                url: source.url,
                title: source.title,
                retrievedAt: source.retrievedAt,
                publishedDate: source.publishedDate,
              })),
            })),
          }));
          const result = await runAgent({
            message: body.data.message,
            timeZone: body.data.timezone,
            conversationId: conversation.id,
            messageId: userMessage.id,
            memory: memoryWithEvidence,
            signal: request.signal,
            onEvent: (event) => {
              if (event.type === "token") answer += event.text;
              if (event.type === "sources") sources = event.sources;
              send(event);
            },
          });
          if (!answer) answer = result.answer;
          const assistant = await db.message.create({
            data: {
              conversationId: conversation.id,
              role: "ASSISTANT",
              content: answer,
              metadata: {
                sources:
                  sources as import("@prisma/client").Prisma.InputJsonValue,
              },
            },
          });
          try {
            await persistAnswerEvidence(assistant.id, userMessage.id, answer);
          } catch {
            console.error("Unable to persist answer evidence links.");
          }
          await db.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: assistant.createdAt },
          });
          send({ type: "done", messageId: assistant.id });
        } catch (error) {
          if (!request.signal.aborted)
            send({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to complete the request.",
            });
        } finally {
          try {
            controller.close();
          } catch {
            /* The client already closed its stream. */
          }
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
