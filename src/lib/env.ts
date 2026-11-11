import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  META_API_KEY: z.string().min(1).optional(),
  META_MODEL: z.string().default("muse-spark-1.2-contributor"),
  MODEL_PROVIDER: z.enum(["openai", "meta"]).default("meta"),
  TAVILY_API_KEY: z.string().min(1).optional(),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  META_API_KEY: process.env.META_API_KEY,
  META_MODEL: process.env.META_MODEL,
  MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
});
