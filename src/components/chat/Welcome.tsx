import { Sparkles } from "lucide-react";

export function Welcome({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const suggestions = [
    "What are the latest developments in AI agents?",
    "Explain quantum computing in plain language",
    "What did I ask you about yesterday?",
  ];
  return (
    <div className="pt-16">
      <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-slate-900 text-white">
        <Sparkles size={22} />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">
        What can I help you research?
      </h1>
      <p className="mt-3 max-w-xl text-slate-500">
        RecallAI searches when evidence matters and remembers relevant context
        across your conversations.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onPrompt(suggestion)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left text-sm text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
