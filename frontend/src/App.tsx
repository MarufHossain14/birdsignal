import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "./components/Header";
import { CourseCard } from "./components/CourseCard";
import { CourseDetails } from "./components/CourseDetails";
import { enrichCourse, getYearLevel } from "./utils/courseInsights";
import type { CourseData } from "./utils/courseInsights";

type DeliveryFilter = "all" | "online" | "in-person";
type AssessmentFilter = "all" | "few-exams" | "has-projects" | "has-assignments";
type WorkloadFilter = "all" | "light" | "moderate" | "heavy";
type YearLevelFilter = "all" | "100" | "200" | "300" | "400+";
type CatalogFilter =
  | "all"
  | "bird-courses"
  | "recommended"
  | "learning-arabic"
  | "other-courses"
  | "uncategorized";

interface CatalogEntry {
  code: string;
  title: string;
  description: string | null;
  category: string;
  is_online_hint: boolean;
}

const normalizeCatalogCategory = (value: string | undefined): string =>
  (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[:]/g, "")
    .replace(/\s+/g, "-");

const getSortableScore = (course: CourseData): number =>
  typeof course.display_bird_score === "number" ? course.display_bird_score : Number.NEGATIVE_INFINITY;

function App() {
  const hasDrawerHistoryEntry = useRef(false);
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<CourseData[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("all");
  const [assessmentFilter, setAssessmentFilter] = useState<AssessmentFilter>("all");
  const [workloadFilter, setWorkloadFilter] = useState<WorkloadFilter>("all");
  const [yearLevelFilter, setYearLevelFilter] = useState<YearLevelFilter>("all");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");
  const hasActiveFilters =
    deliveryFilter !== "all" ||
    assessmentFilter !== "all" ||
    workloadFilter !== "all" ||
    yearLevelFilter !== "all" ||
    catalogFilter !== "all";

  const resetFilters = useCallback(() => {
    setDeliveryFilter("all");
    setAssessmentFilter("all");
    setWorkloadFilter("all");
    setYearLevelFilter("all");
    setCatalogFilter("all");
  }, []);

  useEffect(() => {
    const fetchJsonWithFallback = async (path: string) => {
      let response = await fetch(`.${path}`);
      if (!response.ok) {
        response = await fetch(path);
        if (!response.ok) {
          throw new Error(`Failed to load ${path}`);
        }
      }
      return response.json();
    };

    const loadCourses = async () => {
      try {
        setError(null);
        let coursesData: CourseData[] = [];
        let catalogMap: Record<string, CatalogEntry> = {};
        let catalogList: CatalogEntry[] = [];

        try {
          coursesData = await fetchJsonWithFallback("/course_details/catalog.json");
        } catch {
          const courseList: string[] = await fetchJsonWithFallback("/course_details/index.json");
          const loaded = await Promise.allSettled(
            courseList.map((code) =>
              fetchJsonWithFallback(`/course_details/${code}.json`)
            )
          );
          coursesData = loaded
            .filter((result): result is PromiseFulfilledResult<CourseData> => result.status === "fulfilled")
            .map((result) => result.value);
        }

        try {
          catalogMap = await fetchJsonWithFallback("/data/course-catalog/by-code.json");
        } catch {
          catalogMap = {};
        }
        try {
          catalogList = await fetchJsonWithFallback("/data/course-catalog/normalized.json");
        } catch {
          catalogList = [];
        }

        if (coursesData.length === 0) {
          throw new Error("No course data available");
        }

        const enriched = coursesData
          .map((course) => {
            const meta = catalogMap[course.code];
            return enrichCourse({
              ...course,
              course_title: meta?.title ?? course.course_title,
              course_description: meta?.description ?? course.course_description,
              course_category: meta?.category ?? course.course_category,
              is_online_available: course.is_online_available || Boolean(meta?.is_online_hint),
            });
          });
        const existingCodes = new Set(enriched.map((course) => course.code.toUpperCase()));
        const catalogOnly = catalogList
          .filter((entry) => !existingCodes.has(entry.code.toUpperCase()))
          .map((entry) =>
            enrichCourse({
              code: entry.code,
              department: entry.code.match(/^[A-Z]{2,5}/)?.[0] ?? entry.code.slice(0, 2),
              bird_score: 0,
              specific_mentions: 0,
              is_online_available: Boolean(entry.is_online_hint),
              difficulty_level: {
                easy_mentions: 0,
                hard_mentions: 0,
                workload: 0,
              },
              course_structure: {
                has_finals: false,
                has_midterms: false,
                has_assignments: false,
                has_projects: false,
              },
              course_title: entry.title,
              course_description: entry.description,
              course_category: entry.category,
              threads: [],
            })
          );

        const combined = [...enriched, ...catalogOnly].sort((a, b) => getSortableScore(b) - getSortableScore(a));
        setCourses(combined);
        setFilteredCourses(combined);
      } catch (error) {
        console.error("Error loading courses:", error);
        setError(
          "We could not load course data right now. Please refresh to try again."
        );
      } finally {
        setLoading(false);
      }
    };

    loadCourses();
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSelectCourse = useCallback((course: CourseData) => {
    setSelectedCourse(course);
    if (typeof window === "undefined" || hasDrawerHistoryEntry.current) return;
    window.history.pushState({ courseDrawer: true }, "");
    hasDrawerHistoryEntry.current = true;
  }, []);

  const handleCloseCourse = useCallback(() => {
    if (typeof window !== "undefined" && hasDrawerHistoryEntry.current) {
      hasDrawerHistoryEntry.current = false;
      window.history.back();
      return;
    }
    setSelectedCourse(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      setSelectedCourse((current) => {
        if (!current) return current;
        hasDrawerHistoryEntry.current = false;
        return null;
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    const next = courses.filter((course) => {
      const queryMatch =
        course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.department.toLowerCase().includes(searchQuery.toLowerCase());

      const deliveryMatch =
        deliveryFilter === "all" ||
        (deliveryFilter === "online" && course.is_online_available) ||
        (deliveryFilter === "in-person" && !course.is_online_available);

      const assessmentMatch =
        assessmentFilter === "all" ||
        (assessmentFilter === "few-exams" &&
          !course.course_structure.has_finals &&
          !course.course_structure.has_midterms) ||
        (assessmentFilter === "has-projects" && course.course_structure.has_projects) ||
        (assessmentFilter === "has-assignments" && course.course_structure.has_assignments);

      const workloadMentions = course.difficulty_level.workload;
      const workloadMatch =
        workloadFilter === "all" ||
        (workloadFilter === "light" && workloadMentions <= 3) ||
        (workloadFilter === "moderate" && workloadMentions >= 4 && workloadMentions <= 7) ||
        (workloadFilter === "heavy" && workloadMentions >= 8);

      const levelMatch =
        yearLevelFilter === "all" || getYearLevel(course.code) === yearLevelFilter;

      const normalizedCategory = normalizeCatalogCategory(course.course_category);
      const catalogMatch =
        catalogFilter === "all" ||
        (catalogFilter === "uncategorized" && !normalizedCategory) ||
        (catalogFilter === "recommended" &&
          (normalizedCategory === "recommended" ||
            normalizedCategory === "courses-we-recommend")) ||
        normalizedCategory === catalogFilter;

      return (
        queryMatch &&
        deliveryMatch &&
        assessmentMatch &&
        workloadMatch &&
        levelMatch &&
        catalogMatch
      );
    });

    setFilteredCourses(next);
  }, [
    courses,
    searchQuery,
    deliveryFilter,
    assessmentFilter,
    workloadFilter,
    yearLevelFilter,
    catalogFilter,
  ]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Header onSearch={handleSearch} />

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-40 sm:px-6 sm:pt-32 md:px-8">
        <div className="mb-12">
          <h1 className="text-3xl tracking-tight text-[var(--primary)] md:text-4xl">
            Understand BirdScore Quickly
          </h1>
          <p className="mt-4 max-w-3xl text-[var(--muted)]">
            BirdScore runs from 0.0 to 10.0. Higher means the course is usually
            lighter and easier, based on Reddit discussion signals including
            workload, difficulty, assessments, and overall sentiment.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
              8.0-10.0 Easy / light
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
              6.0-7.9 Moderate
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-900">
              0.0-5.9 Heavier
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-xs text-[var(--muted)]">
            This is a directional signal, not a guarantee. N/A means there is not
            enough reliable data yet.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface)]"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:gap-3">
                <span className="col-span-2 inline-flex items-center rounded-full border border-[var(--secondary)]/45 bg-[var(--secondary-soft)] px-3 py-1 text-sm text-[var(--secondary-content)] md:col-span-1">
                  {filteredCourses.length} courses
                </span>
                <select
                  value={deliveryFilter}
                  onChange={(event) => setDeliveryFilter(event.target.value as DeliveryFilter)}
                  className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--muted)] md:min-w-[10rem] md:w-auto md:text-xs"
                >
                  <option value="all">All delivery</option>
                  <option value="online">Online-friendly</option>
                  <option value="in-person">In-person leaning</option>
                </select>
                <select
                  value={assessmentFilter}
                  onChange={(event) => setAssessmentFilter(event.target.value as AssessmentFilter)}
                  className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--muted)] md:min-w-[10rem] md:w-auto md:text-xs"
                >
                  <option value="all">All assessments</option>
                  <option value="few-exams">Few exams</option>
                  <option value="has-projects">Has projects</option>
                  <option value="has-assignments">Has assignments</option>
                </select>
                <select
                  value={workloadFilter}
                  onChange={(event) => setWorkloadFilter(event.target.value as WorkloadFilter)}
                  className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--muted)] md:min-w-[10rem] md:w-auto md:text-xs"
                >
                  <option value="all">All workloads</option>
                  <option value="light">Light workload</option>
                  <option value="moderate">Moderate workload</option>
                  <option value="heavy">Heavy workload</option>
                </select>
                <select
                  value={yearLevelFilter}
                  onChange={(event) => setYearLevelFilter(event.target.value as YearLevelFilter)}
                  className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--muted)] md:min-w-[10rem] md:w-auto md:text-xs"
                >
                  <option value="all">All year levels</option>
                  <option value="100">100 level</option>
                  <option value="200">200 level</option>
                  <option value="300">300 level</option>
                  <option value="400+">400+ level</option>
                </select>
                <select
                  value={catalogFilter}
                  onChange={(event) => setCatalogFilter(event.target.value as CatalogFilter)}
                  className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--muted)] md:min-w-[10rem] md:w-auto md:text-xs"
                >
                  <option value="all">All groups</option>
                  <option value="bird-courses">Bird Courses</option>
                  <option value="recommended">Recommended</option>
                  <option value="learning-arabic">Learning Arabic</option>
                  <option value="other-courses">Other Courses</option>
                  <option value="uncategorized">Uncategorized</option>
                </select>
                <button
                  type="button"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                  className="w-full rounded-md border border-[var(--primary)]/25 bg-[var(--primary-soft)] px-3 py-2 text-xs font-medium text-[var(--primary)] transition-colors hover:border-[var(--primary)]/45 hover:bg-[var(--primary)]/10 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--surface)] disabled:text-[var(--muted)] disabled:opacity-60 md:w-auto"
                >
                  Reset filters
                </button>
              </div>
            </div>
            {filteredCourses.length === 0 ? (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)]">
                No courses match your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {filteredCourses.map((course) => (
                  <CourseCard
                    key={course.code}
                    code={course.code}
                    department={course.department}
                    title={course.course_title}
                    birdScore={course.display_bird_score}
                    scoreConfidence={course.score_confidence}
                    mentions={course.specific_mentions}
                    onClick={() => handleSelectCourse(course)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-[var(--line)] bg-[var(--surface)]/70">
        <div className="mx-auto max-w-6xl px-4 py-5 text-center text-xs text-[var(--muted)] sm:px-6 md:px-8">
          <span className="tracking-[0.01em]">An initiative of WLU MSA</span>
          <span className="mx-2 opacity-60">·</span>
          <a
            href="https://wlumsa.org"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--primary)] underline-offset-2 hover:underline"
          >
            wlumsa.org
          </a>
        </div>
      </footer>

      {selectedCourse && (
        <CourseDetails
          course={selectedCourse}
          onClose={handleCloseCourse}
        />
      )}
    </div>
  );
}

export default App;
