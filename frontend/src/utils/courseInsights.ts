export interface CourseThread {
  title: string;
  url: string;
  score: number;
  created: string;
  selftext?: string;
  num_comments?: number;
  evidence_score?: number;
}

export interface CourseData {
  code: string;
  department: string;
  bird_score: number;
  display_bird_score?: number | null;
  score_confidence?: "high" | "medium" | "low";
  specific_mentions: number;
  course_title?: string;
  course_description?: string | null;
  course_category?: string;
  is_online_available: boolean;
  difficulty_level: {
    easy_mentions: number;
    hard_mentions: number;
    workload: number;
  };
  course_structure: {
    has_finals: boolean;
    has_midterms: boolean;
    has_assignments: boolean;
    has_projects: boolean;
  };
  threads: CourseThread[];
  ai_summary?: string;
  confidence_signals?: ConfidenceSignals;
}

export interface ConfidenceSignals {
  oldest_thread_date: string | null;
  newest_thread_date: string | null;
  sample_bias_warning: string;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const bounded = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getYearLevel = (code: string): "100" | "200" | "300" | "400+" | "unknown" => {
  const match = code.match(/[0-9]{3,4}/);
  if (!match) return "unknown";
  const num = Number.parseInt(match[0], 10);
  if (num >= 400) return "400+";
  if (num >= 300) return "300";
  if (num >= 200) return "200";
  if (num >= 100) return "100";
  return "unknown";
};

const normalizeThreadText = (thread: CourseThread) =>
  `${thread.title} ${thread.selftext ?? ""}`.toLowerCase();

export const computeConfidenceSignals = (course: CourseData): ConfidenceSignals => {
  if (course.confidence_signals) {
    return course.confidence_signals;
  }

  const validDates = course.threads
    .map((thread) => new Date(thread.created))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const oldest = validDates[0] ?? null;
  const newest = validDates[validDates.length - 1] ?? null;
  let warning = "Discussion looks recent enough to use as a rough guide.";
  if (course.specific_mentions < 8) {
    warning = "Not many posts yet—treat the bird score as a rough hint only.";
  } else if (newest && Date.now() - newest.getTime() > YEAR_MS) {
    warning = "Most posts are older—the course may have changed since then.";
  }

  return {
    oldest_thread_date: oldest ? oldest.toISOString() : null,
    newest_thread_date: newest ? newest.toISOString() : null,
    sample_bias_warning: warning,
  };
};

export const computeAiSummary = (course: CourseData): string => {
  const easy = course.difficulty_level.easy_mentions;
  const hard = course.difficulty_level.hard_mentions;
  const mentions = course.specific_mentions ?? 0;
  if (mentions < 3) {
    return `Very few Reddit posts (${mentions} mention${
      mentions === 1 ? "" : "s"
    }). Read the threads below before trusting the bird score.`;
  }

  const difficultyNote =
    easy - hard >= 2
      ? `More posts call it easy than hard (${easy} vs ${hard}).`
      : hard - easy >= 2
      ? `More posts call it hard than easy (${hard} vs ${easy}).`
      : `Mixed difficulty signals (${easy} easy, ${hard} hard mentions).`;

  const workload = course.difficulty_level.workload;
  const workloadLabel =
    workload <= 3 ? "light" : workload <= 7 ? "moderate" : "heavy";
  const examsNote = `Finals: ${
    course.course_structure.has_finals ? "mentioned" : "not clearly mentioned"
  }; midterms: ${
    course.course_structure.has_midterms ? "mentioned" : "not clearly mentioned"
  }.`;

  return `${difficultyNote} ${workloadLabel[0].toUpperCase()}${workloadLabel.slice(
    1
  )} workload signals across ${workload} workload references. ${examsNote}`;
};

export const getScoreConfidence = (course: CourseData): "high" | "medium" | "low" => {
  const confidence = computeConfidenceSignals(course);
  const newest = confidence.newest_thread_date ? new Date(confidence.newest_thread_date) : null;
  const newestAgeMs =
    newest && !Number.isNaN(newest.getTime()) ? Date.now() - newest.getTime() : Number.POSITIVE_INFINITY;

  if (course.specific_mentions < 5 || confidence.sample_bias_warning.includes("Not many posts")) {
    return "low";
  }

  if (
    confidence.sample_bias_warning.includes("older") ||
    newestAgeMs > YEAR_MS * 2
  ) {
    return "medium";
  }

  return "high";
};

export const computeEvidenceScore = (thread: CourseThread, courseCode: string): number => {
  const created = new Date(thread.created);
  const ageDays = Number.isNaN(created.getTime())
    ? 365
    : Math.max(0, (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
  const recency = Math.exp(-ageDays / 365);
  const upvotes = bounded(Math.log10(Math.max(1, thread.score + 1)) / 2, 0, 1);
  const text = normalizeThreadText(thread);
  const relevance = text.includes(courseCode.toLowerCase()) ? 1 : 0.6;
  const comments = bounded(Math.log10(Math.max(1, (thread.num_comments ?? 0) + 1)) / 2, 0, 1);

  const score = (upvotes * 0.35 + recency * 0.35 + relevance * 0.2 + comments * 0.1) * 10;
  return Number(score.toFixed(1));
};

export const enrichCourse = (course: CourseData): CourseData => {
  const threads = course.threads
    .map((thread) => ({
      ...thread,
      evidence_score:
        typeof thread.evidence_score === "number"
          ? thread.evidence_score
          : computeEvidenceScore(thread, course.code),
    }))
    .sort((a, b) => (b.evidence_score ?? 0) - (a.evidence_score ?? 0));

  const confidenceSignals = computeConfidenceSignals(course);
  const scoreConfidence = getScoreConfidence(course);

  return {
    ...course,
    threads,
    display_bird_score: scoreConfidence === "low" ? null : course.bird_score,
    score_confidence: scoreConfidence,
    ai_summary: computeAiSummary(course),
    confidence_signals: confidenceSignals,
  };
};
