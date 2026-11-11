export type Source = {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  retrievedAt?: string;
};
export type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  metadata?: { sources?: Source[] } | null;
};
export type MemoryReference = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  conversationId: string;
  retrievalReasons?: string[];
};
export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
};
