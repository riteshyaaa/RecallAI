"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Menu, Plus } from "lucide-react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { MessageView } from "@/components/chat/MessageView";
import { Welcome } from "@/components/chat/Welcome";
import type {
  ChatMessage,
  Conversation,
  MemoryReference,
  Source,
} from "@/types/chat";

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [memory, setMemory] = useState<MemoryReference[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function restoreLatestConversation() {
      try {
        const response = await fetch("/api/conversations");
        if (!response.ok) return;
        const data = (await response.json()) as {
          conversations: Conversation[];
        };
        if (cancelled) return;
        setConversations(data.conversations);
        const latest = data.conversations[0];
        if (!latest) return;
        const detailResponse = await fetch(`/api/conversations/${latest.id}`);
        if (!detailResponse.ok || cancelled) return;
        const detail = await detailResponse.json();
        setActiveId(latest.id);
        setMessages(detail.conversation.messages);
      } catch {
        // Chat remains usable if conversation history is temporarily unavailable.
      }
    }
    void restoreLatestConversation();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshConversations() {
    try {
      const response = await fetch("/api/conversations");
      if (response.ok) setConversations((await response.json()).conversations);
    } catch {
      // A history refresh must not replace a completed streamed answer with an error.
    }
  }

  async function loadConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) return;
    const { conversation } = await response.json();
    setActiveId(id);
    setMessages(conversation.messages);
    setMemory([]);
  }

  function newChat() {
    controller.current?.abort();
    setActiveId(undefined);
    setMessages([]);
    setMemory([]);
    setInput("");
  }

  async function send(event?: FormEvent, prompt = input) {
    event?.preventDefault();
    if (!prompt.trim() || loading) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "USER",
      content: prompt.trim(),
      createdAt: new Date().toISOString(),
    };
    const assistantId = crypto.randomUUID();
    setMessages((previous) => [
      ...previous,
      userMessage,
      {
        id: assistantId,
        role: "ASSISTANT",
        content: "",
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");
    setLoading(true);
    setStatus("Retrieving conversation memory");
    controller.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.current.signal,
        body: JSON.stringify({
          conversationId: activeId,
          message: prompt.trim(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok || !response.body) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.error?.message ?? "Could not start the response.",
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const packets = buffer.split("\n\n");
        buffer = packets.pop() ?? "";
        for (const packet of packets) {
          if (!packet.startsWith("data: ")) continue;
          const data = JSON.parse(packet.slice(6));
          if (data.type === "conversation") setActiveId(data.conversationId);
          if (data.type === "status") setStatus(data.message);
          if (data.type === "plan")
            setStatus(
              data.requiresFreshEvidence
                ? "Planning a fresh evidence check"
                : "Checking conversation context",
            );
          if (data.type === "memory") setMemory(data.items);
          if (data.type === "token")
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + data.text }
                  : message,
              ),
            );
          if (data.type === "sources")
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      metadata: { sources: data.sources as Source[] },
                    }
                  : message,
              ),
            );
          if (data.type === "error") throw new Error(data.message);
        }
      }
      await refreshConversations();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setMessages((previous) =>
          previous.filter((message) => message.id !== assistantId),
        );
      } else {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? { ...message, content: `Sorry, ${(error as Error).message}` }
              : message,
          ),
        );
      }
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-[#fbfbfa] text-slate-900">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        onNewChat={newChat}
        onSelect={(id) => {
          controller.current?.abort();
          void loadConversation(id);
        }}
      />
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open conversation history"
              className="rounded-md p-1 text-slate-500 md:hidden"
            >
              <Menu size={20} />
            </button>
            <h2 className="truncate font-medium">
              {activeId
                ? (conversations.find(
                    (conversation) => conversation.id === activeId,
                  )?.title ?? "Conversation")
                : "New conversation"}
            </h2>
          </div>
          <button
            onClick={newChat}
            aria-label="Start new chat"
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <Plus size={16} />
            New
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
            {messages.length === 0 ? (
              <Welcome onPrompt={(prompt) => void send(undefined, prompt)} />
            ) : (
              <>
                <div className="space-y-7">
                  {messages.map((message) => (
                    <MessageView
                      key={message.id}
                      message={message}
                      loading={loading}
                    />
                  ))}
                </div>
                {memory.length > 0 && (
                  <details className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm">
                    <summary className="cursor-pointer font-medium text-indigo-900">
                      Memory used for this answer ({memory.length})
                    </summary>
                    <div className="mt-3 space-y-3 text-indigo-800">
                      {memory.slice(0, 6).map((item) => (
                        <div
                          key={item.id}
                          className="border-l-2 border-indigo-200 pl-3"
                        >
                          <p>
                            <time className="mr-2 text-xs text-indigo-500">
                              {new Date(item.createdAt).toLocaleString()}
                            </time>
                            <span className="text-xs text-indigo-500">
                              {item.role.toLowerCase()}
                            </span>
                          </p>
                          <p className="mt-1">{item.content.slice(0, 220)}</p>
                          {item.retrievalReasons?.map((reason) => (
                            <p
                              key={reason}
                              className="mt-1 text-xs text-indigo-600"
                            >
                              Retrieved because: {reason}
                            </p>
                          ))}
                          {item.conversationId !== activeId && (
                            <button
                              className="mt-1 text-xs font-medium text-indigo-700 underline"
                              onClick={() =>
                                void loadConversation(item.conversationId)
                              }
                            >
                              Open original conversation
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={(event) => void send(event)}
          loading={loading}
          onStop={() => controller.current?.abort()}
          status={status}
        />
      </section>
    </main>
  );
}
