import React, { useEffect, useState } from "react";

interface HeaderProps {
  onSearch: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onSearch }) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onSearch(query);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [query, onSearch]);

  return (
    <header
      className="fixed left-0 top-0 z-40 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-sm"
      style={{ right: "var(--scrollbar-compensation, 0px)" }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-6 sm:py-3.5 md:px-8">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="BirdSignal logo" className="h-7 w-7 object-contain" />
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--muted)]">WLU</p>
            <h2 className="text-lg tracking-tight text-[var(--primary)] sm:text-xl">
              BirdSignal
            </h2>
          </div>
        </div>

        <div className="w-full sm:max-w-md">
          <label htmlFor="course-search" className="sr-only">
            Search courses
          </label>
          <div className="group flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2.5 transition-colors focus-within:border-[var(--primary)] focus-within:bg-[var(--surface)]">
            <svg
              className="h-4 w-4 text-[var(--muted)] transition-colors group-focus-within:text-[var(--primary)]"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm8 2-4.35-4.35"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <input
              id="course-search"
              type="text"
              placeholder="Search by code or department"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]/85"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="hidden rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] sm:inline">
              /
            </kbd>
          </div>
        </div>
      </div>
    </header>
  );
};
