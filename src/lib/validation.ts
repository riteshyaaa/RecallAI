import { z } from "zod";

export const createConversationSchema = z.object({ title: z.string().trim().min(1).max(120).optional() });
export const chatSchema = z.object({
  conversationId: z.string().cuid().optional(),
  message: z.string().trim().min(1).max(12_000),
  timezone: z.string().max(80).default("UTC"),
});
export const webSearchSchema = z.object({
  query: z.string().trim().min(2).max(400),
  search_depth: z.enum(["basic", "advanced"]).default("basic"),
  max_results: z.number().int().min(1).max(8).default(5),
});
