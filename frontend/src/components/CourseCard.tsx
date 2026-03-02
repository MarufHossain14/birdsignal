import React from "react";
import { BirdScoreMeter } from "./BirdScoreMeter";

interface CourseCardProps {
  code: string;
  department: string;
  title?: string;
  birdScore: number | null | undefined;
  scoreConfidence?: "high" | "medium" | "low";
  mentions: number;
  onClick: () => void;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  code,
  department,
  title,
  birdScore,
  scoreConfidence,
  mentions,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className="group w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/35 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg tracking-tight text-[var(--primary)] sm:text-xl">
            {code}
          </h3>
          {title && (
            <p className="mt-1 truncate text-xs text-[var(--text)]/85">
              {title}
            </p>
          )}
          <p className="mt-1 truncate text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
            {department}
          </p>
        </div>
        <BirdScoreMeter score={birdScore} size="compact" />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-[var(--muted)]">
          {mentions} mentions{scoreConfidence === "low" ? " • low confidence" : ""}
        </span>
        <span className="text-[var(--muted)] transition-transform group-hover:translate-x-0.5">
          View
        </span>
      </div>
    </button>
  );
};
