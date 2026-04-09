import React, { useMemo, useState } from "react";

interface Thread {
  title: string;
  url: string;
  score: number;
  created: string;
  evidence_score?: number;
}

interface ThreadListProps {
  threads: Thread[];
}

export const ThreadList: React.FC<ThreadListProps> = ({ threads }) => {
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const profanityPattern = useMemo(
    () =>
      /\b(fuck|fucking|shit|bitch|asshole|bastard|dick|cock|pussy|cunt|motherfucker|wtf|slut|whore)\b/gi,
    []
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getMaskedTitle = (title: string) =>
    title.replace(profanityPattern, (word) => `${word[0]}${"*".repeat(Math.max(0, word.length - 1))}`);

  return (
    <div className="space-y-3">
      {threads.map((thread) => (
        (() => {
          const itemKey = `${thread.url}-${thread.created}`;
          const hasProfanity = profanityPattern.test(thread.title);
          profanityPattern.lastIndex = 0;
          const isRevealed = revealedKeys.has(itemKey);
          const displayTitle = hasProfanity && !isRevealed ? getMaskedTitle(thread.title) : thread.title;

          return (
            <a
              key={itemKey}
              href={thread.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-4 hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
            >
              <h4 className="text-sm font-medium leading-snug">{displayTitle}</h4>
              {hasProfanity && !isRevealed && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setRevealedKeys((prev) => new Set(prev).add(itemKey));
                  }}
                  className="mt-2 rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface-muted)]"
                >
                  Show original title
                </button>
              )}
              <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
                <span>{formatDate(thread.created)}</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-[var(--secondary)]/45 bg-[var(--secondary-soft)] px-2 py-1 text-[var(--secondary-content)]">
                    {thread.score} upvotes
                  </span>
                </div>
              </div>
            </a>
          );
        })()
      ))}
    </div>
  );
};
