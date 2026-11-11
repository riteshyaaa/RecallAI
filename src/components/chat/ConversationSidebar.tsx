"use client";

import { useState } from "react";
import { Brain, Plus, Search, X } from "lucide-react";
import type { Conversation } from "@/types/chat";

type Props = {
  conversations: Conversation[];
  activeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
};

export function ConversationSidebar({
  conversations,
  activeId,
  open,
  onOpenChange,
  onNewChat,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  const visible = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <button
        aria-label="Close conversation sidebar"
        onClick={() => onOpenChange(false)}
        className={`${open ? "fixed inset-0 z-20 bg-black/20 md:hidden" : "hidden"}`}
      />
      <aside
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-72 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:static md:flex`}
      >
        <div className="mb-8 flex items-center justify-between px-2 text-lg font-semibold">
          <span className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-slate-900 text-white">
              <Brain size={18} />
            </span>
            RecallAI
          </span>
          <button
            className="rounded-md p-1 text-slate-400 md:hidden"
            onClick={() => onOpenChange(false)}
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>
        <button
          onClick={() => {
            onNewChat();
            onOpenChange(false);
          }}
          className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm text-white hover:bg-slate-700"
        >
          <Plus size={16} />
          New chat
        </button>
        <label className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <p className="mb-2 px-2 text-xs uppercase tracking-wider text-slate-400">
          Recent
        </p>
        <nav
          className="min-h-0 flex-1 overflow-y-auto"
          aria-label="Conversation history"
        >
          {visible.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => {
                onSelect(conversation.id);
                onOpenChange(false);
              }}
              className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${activeId === conversation.id ? "bg-slate-100 font-medium" : "hover:bg-slate-50"}`}
            >
              <span className="block truncate">{conversation.title}</span>
              <time className="text-xs text-slate-400">
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                }).format(new Date(conversation.lastMessageAt))}
              </time>
            </button>
          ))}
          {visible.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-400">
              No conversations found.
            </p>
          )}
        </nav>
        <div className="border-t border-slate-100 px-2 pt-4 text-xs text-slate-400">
          Private conversations saved in this browser
        </div>
      </aside>
    </>
  );
}
