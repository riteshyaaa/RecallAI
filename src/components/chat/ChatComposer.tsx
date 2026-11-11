"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp, CircleStop } from "lucide-react";

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  loading,
  onStop,
  status,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
  loading: boolean;
  onStop: () => void;
  status: string;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };
  return (
    <form
      onSubmit={onSubmit}
      className="border-t border-slate-200 bg-white p-4 md:px-8"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-slate-500">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything…"
          rows={1}
          aria-label="Message RecallAI"
          className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
        />
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="grid size-9 place-items-center rounded-xl bg-slate-800 text-white"
          >
            <CircleStop size={17} />
          </button>
        ) : (
          <button
            disabled={!value.trim()}
            aria-label="Send message"
            className="grid size-9 place-items-center rounded-xl bg-slate-900 text-white disabled:bg-slate-200"
          >
            <ArrowUp size={17} />
          </button>
        )}
      </div>
      {status && (
        <p
          role="status"
          className="mx-auto mt-2 flex max-w-3xl items-center gap-2 px-2 text-xs text-slate-500"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-indigo-500" />
          {status}
        </p>
      )}
    </form>
  );
}
