import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  TAVILY_API_KEY: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  SESSION_SECRET: process.env.SESSION_SECRET,
});
