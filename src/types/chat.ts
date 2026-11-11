export type Source = {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
};
export type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  metadata?: { sources?: Source[] } | null;
};
export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
};
