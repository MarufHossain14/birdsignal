import React, { useEffect } from "react";
import { BirdScoreMeter } from "./BirdScoreMeter";
import { ThreadList } from "./ThreadList";
import type { CourseData } from "../utils/courseInsights";

interface CourseDetailsProps {
  course: CourseData;
  onClose: () => void;
}

export const CourseDetails: React.FC<CourseDetailsProps> = ({
  course,
  onClose,
}) => {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const sortedThreads = [...course.threads].sort((a, b) => {
    const evidenceDelta = (b.evidence_score ?? 0) - (a.evidence_score ?? 0);
    if (evidenceDelta !== 0) return evidenceDelta;
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });

  const confidence = course.confidence_signals;
  const formatDate = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "n/a";

  const confidenceLabel = (() => {
    const warning = confidence?.sample_bias_warning ?? "";
    if (warning.includes("Low sample size")) return "Low";
    if (warning.includes("older")) return "Medium";
    return "Good";
  })();

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-0 sm:p-4 md:p-6"
      onClick={onClose}
    >
      <div
        className="mx-auto min-h-[100dvh] w-full rounded-none border-0 bg-[var(--surface)] sm:mt-8 sm:min-h-0 sm:max-w-5xl sm:rounded-2xl sm:border sm:border-[var(--line)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6 md:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="inline-flex rounded-md border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-2.5 py-1 text-xs text-[var(--primary)]">
                {course.department}
              </p>
              {course.course_category && (
                <p className="inline-flex rounded-md border border-[var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs text-[var(--muted)]">
                  {course.course_category}
                </p>
              )}
            </div>
            <h2 className="mt-3 text-2xl tracking-tight text-[var(--primary)] sm:text-3xl">
              {course.code}
            </h2>
            {course.course_title && (
              <p className="mt-1 text-sm text-[var(--muted)]">{course.course_title}</p>
            )}
            <p className="mt-3 text-sm text-[var(--muted)]">
              {course.specific_mentions} mentions
            </p>
          </div>
          <div className="flex items-start gap-3">
            <BirdScoreMeter score={course.display_bird_score} />
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-8 border-b border-[var(--line)] p-4 sm:p-6 lg:border-b-0 lg:border-r lg:p-7">
            <section>
              <h3 className="text-sm font-medium uppercase tracking-[0.1em] text-[var(--muted)]">
                Summary
              </h3>
              {course.score_confidence === "low" && (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Not enough recent Reddit evidence to assign a reliable bird score.
                </p>
              )}
              <p className="mt-4 text-sm text-[var(--text)]">
                {course.ai_summary}
              </p>
              {confidence?.sample_bias_warning && (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  {confidence.sample_bias_warning}
                </p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-medium uppercase tracking-[0.1em] text-[var(--muted)]">
                Difficulty
              </h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt>Easy mentions</dt>
                  <dd className="text-[var(--text)]">
                    {course.difficulty_level.easy_mentions}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Hard mentions</dt>
                  <dd className="text-[var(--text)]">
                    {course.difficulty_level.hard_mentions}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Workload references</dt>
                  <dd className="text-[var(--text)]">
                    {course.difficulty_level.workload}
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="text-sm font-medium uppercase tracking-[0.1em] text-[var(--muted)]">
                Structure
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--muted)]">
                <li>{course.course_structure.has_finals ? "Finals mentioned" : "No finals signal"}</li>
                <li>{course.course_structure.has_midterms ? "Midterms mentioned" : "No midterm signal"}</li>
                <li>{course.course_structure.has_assignments ? "Assignments mentioned" : "No assignment signal"}</li>
                <li>{course.course_structure.has_projects ? "Projects mentioned" : "No project signal"}</li>
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-medium uppercase tracking-[0.1em] text-[var(--muted)]">
                Confidence
              </h3>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt>Data coverage</dt>
                  <dd>
                    {formatDate(confidence?.oldest_thread_date)} - {formatDate(confidence?.newest_thread_date)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Confidence</dt>
                  <dd>{confidenceLabel}</dd>
                </div>
              </dl>
            </section>
          </aside>

          <section className="max-h-none overflow-y-visible p-4 sm:p-6 lg:max-h-[66vh] lg:overflow-y-auto lg:p-7">
            <h3 className="mb-5 text-sm font-medium uppercase tracking-[0.1em] text-[var(--muted)]">
              Evidence-Ranked Mentions
            </h3>
            <ThreadList threads={sortedThreads} />
          </section>
        </div>
      </div>
    </div>
  );
};
