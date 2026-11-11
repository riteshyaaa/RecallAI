import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import type { ChatMessage } from "@/types/chat";

export function MessageView({
  message,
  loading,
}: {
  message: ChatMessage;
  loading: boolean;
}) {
  const sources = message.metadata?.sources ?? [];
  const sourceUrls = new Set(sources.map((source) => source.url));
  return (
    <article
      className={message.role === "USER" ? "ml-auto max-w-[85%]" : "max-w-none"}
    >
      <div
        className={`mb-2 text-xs ${message.role === "USER" ? "text-right text-slate-400" : "text-indigo-600"}`}
      >
        {message.role === "USER" ? "You" : "RecallAI"}
      </div>
      <div
        className={
          message.role === "USER"
            ? "rounded-2xl rounded-tr-sm bg-slate-900 px-4 py-3 text-sm leading-6 text-white"
            : "prose prose-slate max-w-none text-sm leading-7 prose-a:text-indigo-600"
        }
      >
        {message.content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) =>
                href && sourceUrls.has(href) ? (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ) : (
                  <span>{children}</span>
                ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : (
          loading && (
            <span className="inline-block size-2 animate-pulse rounded-full bg-slate-400" />
          )
        )}
      </div>
      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="flex max-w-64 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600"
            >
              <ExternalLink size={12} />
              <span className="min-w-0 truncate">
                {source.title}
                {source.retrievedAt && (
                  <span className="ml-1 text-slate-400">
                    · retrieved{" "}
                    {new Date(source.retrievedAt).toLocaleDateString()}
                  </span>
                )}
              </span>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
