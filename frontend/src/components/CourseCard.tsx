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
      className="course-card group w-full rounded-2xl p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/35 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="course-card-code truncate text-lg text-[var(--primary)] sm:text-xl">
            {code}
          </h3>
          {title && (
            <p className="mt-1 truncate text-xs text-[var(--text)]/85">
              {title}
            </p>
          )}
          <p className="mt-2 truncate text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
            {department}
          </p>
        </div>
        <BirdScoreMeter score={birdScore} size="compact" />
      </div>

      <div className="mt-5 flex items-center justify-between text-xs">
        <span className="text-[var(--muted)]">
          {mentions} Reddit posts
          {scoreConfidence === "low" ? " • limited data" : ""}
        </span>
        <span className="font-medium text-[var(--primary)]/80">
          View
        </span>
      </div>
    </button>
  );
};
