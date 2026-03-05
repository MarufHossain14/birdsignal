import React, { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import { BirdScoreMeter } from "./BirdScoreMeter";
import { ThreadList } from "./ThreadList";
import type { CourseData } from "../utils/courseInsights";

interface CourseDetailsProps {
  course: CourseData;
  onClose: () => void;
}

interface CourseDetailsBodyProps {
  course: CourseData;
  onClose: () => void;
}

const CourseDetailsBody: React.FC<CourseDetailsBodyProps> = ({
  course,
  onClose,
}) => {
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

  const confidenceToneClass =
    confidenceLabel === "Good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : confidenceLabel === "Medium"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-rose-200 bg-rose-50 text-rose-900";

  return (
    <>
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
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <p className="text-[var(--muted)]">{course.specific_mentions} mentions</p>
            <span
              className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${confidenceToneClass}`}
            >
              {confidenceLabel} confidence
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Latest mention: {formatDate(confidence?.newest_thread_date)}
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
        <aside className="space-y-6 border-b border-[var(--line)] p-4 sm:p-6 lg:max-h-[66vh] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-6">
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
            <dl className="mt-3 space-y-2.5 text-sm">
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
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
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
            <dl className="mt-3 space-y-2 text-sm">
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
          <h3 className="mb-2 text-sm font-medium uppercase tracking-[0.1em] text-[var(--muted)]">
            Evidence-Ranked Mentions
          </h3>
          <div className="mb-5" />
          <ThreadList threads={sortedThreads} />
        </section>
      </div>
    </>
  );
};

export const CourseDetails: React.FC<CourseDetailsProps> = ({
  course,
  onClose,
}) => {
  const mobileCloseTimerRef = useRef<number | null>(null);
  const desktopCloseTimerRef = useRef<number | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || typeof window === "undefined") return;
    const raf = window.requestAnimationFrame(() => {
      setMobileOpen(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isMobile, course.code]);

  useEffect(() => {
    return () => {
      if (mobileCloseTimerRef.current !== null) {
        window.clearTimeout(mobileCloseTimerRef.current);
      }
      if (desktopCloseTimerRef.current !== null) {
        window.clearTimeout(desktopCloseTimerRef.current);
      }
    };
  }, []);

  const closeMobileDrawer = useCallback(() => {
    if (typeof window === "undefined") {
      onClose();
      return;
    }
    if (mobileCloseTimerRef.current !== null) return;
    setMobileOpen(false);
    mobileCloseTimerRef.current = window.setTimeout(() => {
      mobileCloseTimerRef.current = null;
      onClose();
    }, 220);
  }, [onClose]);

  useEffect(() => {
    if (isMobile || typeof window === "undefined") return;
    const raf = window.requestAnimationFrame(() => {
      setDesktopOpen(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isMobile, course.code]);

  const closeDesktopModal = useCallback(() => {
    if (typeof window === "undefined") {
      onClose();
      return;
    }
    if (desktopCloseTimerRef.current !== null) return;
    setDesktopOpen(false);
    desktopCloseTimerRef.current = window.setTimeout(() => {
      desktopCloseTimerRef.current = null;
      onClose();
    }, 180);
  }, [onClose]);

  useEffect(() => {
    if (isMobile || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDesktopModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, closeDesktopModal]);

  if (isMobile) {
    return (
      <Drawer.Root open={mobileOpen} onOpenChange={(open) => !open && closeMobileDrawer()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] rounded-t-2xl border border-[var(--line)] bg-[var(--surface)] outline-none">
            <Drawer.Title className="sr-only">{course.code} details</Drawer.Title>
            <Drawer.Description className="sr-only">
              Detailed course summary and evidence-ranked Reddit mentions.
            </Drawer.Description>
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[var(--line-strong)]" />
            <div className="max-h-[calc(92vh-14px)] overflow-y-auto">
              <CourseDetailsBody course={course} onClose={closeMobileDrawer} />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto p-0 transition-colors duration-180 ease-out sm:overflow-hidden sm:p-4 md:p-6 ${
        desktopOpen ? "bg-black/45" : "bg-black/0"
      }`}
      onClick={closeDesktopModal}
    >
      <div
        className={`mx-auto min-h-[100dvh] w-full rounded-none border-0 bg-[var(--surface)] transition-[opacity,transform] duration-180 ease-out sm:mt-8 sm:h-[88vh] sm:min-h-0 sm:max-h-[88vh] sm:max-w-5xl sm:overflow-hidden sm:rounded-2xl sm:border sm:border-[var(--line)] ${
          desktopOpen
            ? "opacity-100 sm:translate-y-0 sm:scale-100"
            : "opacity-0 sm:translate-y-2 sm:scale-[0.995]"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <CourseDetailsBody course={course} onClose={closeDesktopModal} />
      </div>
    </div>
  );
};
