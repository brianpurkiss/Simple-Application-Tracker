import type { Job } from "./api";
import { weekStart } from "./activity";
import { DAY, daysBetween, daysSince, isActive, needsFollowUp, reachedInterview } from "./format";

// Applications newer than this haven't had a fair chance to hear back, so they're left out of rates.
const MIN_AGE_DAYS = 6;
// Groups smaller than this are shown dimmed; the rate isn't meaningful yet.
const MIN_SAMPLE = 9;

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);
export const fmtPct = (n: number | null) => (n === null ? "–" : `${n}%`);

const median = (nums: number[]) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const hasOffer = (j: Job) => j.status === "Offer" || j.status === "Accepted";
const interviewed = (j: Job) => reachedInterview(j) || hasOffer(j);
const multipleInterviews = (j: Job) => j.interview_count >= 2 || hasOffer(j);
const heardBack = (j: Job) => Boolean(j.first_contact || j.rejected_date) || interviewed(j);

export type Kpis = {
  applications: number;
  thisWeek: number;
  lastWeek: number;
  responseRate: number | null;
  interviewRate: number | null;
  active: number;
  needFollowUp: number;
  medianResponseDays: number | null;
  medianRejectionDays: number | null;
};

export function kpis(jobs: Job[], todayIso: string): Kpis {
  const thisWeekStart = weekStart(todayIso);
  const lastWeekStart = weekStart(new Date(Date.parse(thisWeekStart) - DAY).toISOString().slice(0, 10));
  const inWeek = (start: string) => jobs.filter((j) => j.applied_date && weekStart(j.applied_date) === start).length;
  const response = jobs.filter((j) => j.applied_date && j.first_contact).map((j) => daysBetween(j.applied_date!, j.first_contact!));
  const rejection = jobs.filter((j) => j.applied_date && j.rejected_date).map((j) => daysBetween(j.applied_date!, j.rejected_date!));
  return {
    applications: jobs.length,
    thisWeek: inWeek(thisWeekStart),
    lastWeek: inWeek(lastWeekStart),
    responseRate: pct(jobs.filter(heardBack).length, jobs.length),
    interviewRate: pct(jobs.filter(interviewed).length, jobs.length),
    active: jobs.filter(isActive).length,
    needFollowUp: jobs.filter(needsFollowUp).length,
    medianResponseDays: median(response),
    medianRejectionDays: median(rejection),
  };
}

export type FunnelStep = { label: string; count: number; ofTotal: number | null };

// Each step is a subset of the one before it, so the bars can only shrink.
export function funnel(jobs: Job[]): FunnelStep[] {
  const counts: [string, number][] = [
    ["Applied", jobs.length],
    ["Heard back", jobs.filter(heardBack).length],
    ["Screen / 1st Interview", jobs.filter(interviewed).length],
    ["Multiple Interviews", jobs.filter(multipleInterviews).length],
    ["Offer", jobs.filter(hasOffer).length],
  ];
  return counts.map(([label, count]) => ({ label, count, ofTotal: pct(count, counts[0][1]) }));
}

export type Outcome = { key: string; label: string; color: string; count: number };

export function outcomes(jobs: Job[]): Outcome[] {
  const rejected = jobs.filter((j) => j.status === "Rejected");
  const rows: Outcome[] = [
    { key: "waiting", label: "Waiting for Response", color: "#f59e0b", count: jobs.filter((j) => j.status === "Applied").length },
    { key: "interviewed", label: "Interviewed", color: "#3b82f6", count: jobs.filter((j) => j.status === "Interviewed").length },
    { key: "rejected-post", label: "Rejected after interview", color: "#dc2626", count: rejected.filter(reachedInterview).length },
    { key: "rejected-pre", label: "Rejected, no interview", color: "#f87171", count: rejected.filter((j) => !reachedInterview(j)).length },
    { key: "withdrew", label: "Withdrew", color: "#525252", count: jobs.filter((j) => j.status === "Withdrew").length },
    { key: "ghosted", label: "Ghosted", color: "#a3a3a3", count: jobs.filter((j) => j.status === "Ghosted").length },
  ];
  return rows;
}

export const DIMENSIONS = [
  { key: "job_type", label: "Job type" },
  { key: "company_type", label: "Company type" },
  { key: "fit", label: "Fit" },
  { key: "work_mode", label: "Work mode" },
  { key: "resume_version", label: "Resume" },
] as const;
export type DimensionKey = (typeof DIMENSIONS)[number]["key"];

// "eCom 2.3" -> "eCom 2.x". Labels without a ".N" suffix are left alone.
export const VERSION_MODES = [
  { key: "separate", label: "Separate" },
  { key: "grouped", label: "Grouped (2.x)" },
] as const;

export const resumeFamily = (label: string) => label.trim().replace(/\.\d+$/, ".x");

export type Metric ="interview" | "reply";
export type Tier = "standout" | "watch" | "even" | "under" | "low";

// Wilson score interval: a rate range that widens for small samples, so 1/1 doesn't outrank 12/20.
function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (!n) return { lo: 0, hi: 1 };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) };
}

// Smallest sample at which a combo converting at `rate` is clearly above `baseline` (Wilson lower bound clears it).
export function applicationsNeeded(rate: number, baseline: number, z: number, cap = 1000): number | null {
  if (rate <= baseline) return null;
  for (let n = 1; n <= cap; n++) if (wilson(Math.round(rate * n), n, z).lo > baseline) return n;
  return null;
}

export type Combo = {
  key: string;
  parts: string[];
  n: number;
  replied: number;
  interviews: number;
  responseRate: number | null;
  interviewRate: number | null;
  lift: number | null;
  lo: number;
  hi: number;
  tier: Tier;
  jobs: Job[];
};

type ComboResult = { combos: Combo[]; baseline: number; total: number; excluded: number };

// Groups jobs by every dimension in `dims` (in order) and grades each group against the overall rate.
export function comboBy(
  jobs: Job[],
  dims: DimensionKey[],
  {
    metric,
    minSample = MIN_SAMPLE,
    minAge = MIN_AGE_DAYS,
    groupVersions = false,
    z = 1.645,
  }: { metric: Metric; minSample?: number; minAge?: number; groupVersions?: boolean; z?: number },
): ComboResult {
  // Jobs missing any grouped field are left out entirely, so they don't skew the average either.
  const eligible = jobs.filter(
    (j) => j.applied_date && (daysSince(j.applied_date) ?? 0) >= minAge && dims.every((d) => j[d]?.trim()),
  );
  // A rejection alone isn't a useful reply: only count contact that moved things forward.
  const replied_ = (j: Job) => Boolean(j.first_contact) || interviewed(j);
  const hit = metric === "interview" ? interviewed : replied_;
  const baseline = eligible.length ? eligible.filter(hit).length / eligible.length : 0;

  const groups = new Map<string, { parts: string[]; jobs: Job[] }>();
  for (const j of eligible) {
    const parts = dims.map((d) => (d === "resume_version" && groupVersions ? resumeFamily(j[d]!) : j[d]!.trim()));
    const key = parts.join("\u0000");
    const g = groups.get(key) ?? { parts, jobs: [] };
    g.jobs.push(j);
    groups.set(key, g);
  }

  const combos = [...groups.entries()].map(([key, g]): Combo => {
    const n = g.jobs.length;
    const replied = g.jobs.filter(replied_).length;
    const interviews = g.jobs.filter(interviewed).length;
    const k = metric === "interview" ? interviews : replied;
    const { lo, hi } = wilson(k, n, z);
    const rate = k / n;
    let tier: Tier = "even";
    if (n < minSample) tier = "low";
    else if (lo > baseline) tier = "standout";
    else if (hi < baseline) tier = "under";
    else if (rate > baseline) tier = "watch";
    return {
      key,
      parts: g.parts,
      n,
      replied,
      interviews,
      responseRate: pct(replied, n),
      interviewRate: pct(interviews, n),
      lift: baseline ? rate / baseline : null,
      lo,
      hi,
      tier,
      jobs: g.jobs,
    };
  });

  const tooRecent = jobs.filter((j) => j.applied_date && (daysSince(j.applied_date) ?? 0) < minAge).length;
  return { combos, baseline, total: eligible.length, excluded: tooRecent };
}

const BUCKETS = [
  { label: "0–3", max: 3 },
  { label: "4–7", max: 7 },
  { label: "8–14", max: 14 },
  { label: "15–21", max: 21 },
  { label: "22+", max: Infinity },
];

export type TimingPoint = { bucket: string; response: number; rejection: number };

export function timing(jobs: Job[]): TimingPoint[] {
  const points = BUCKETS.map((b) => ({ bucket: b.label, response: 0, rejection: 0 }));
  const place = (days: number, field: "response" | "rejection") => {
    points[BUCKETS.findIndex((b) => days <= b.max)][field]++;
  };
  for (const j of jobs) {
    if (!j.applied_date) continue;
    if (j.first_contact) place(daysBetween(j.applied_date, j.first_contact), "response");
    if (j.rejected_date) place(daysBetween(j.applied_date, j.rejected_date), "rejection");
  }
  return points;
}

export type Cohort = {
  week: string;
  apps: number;
  response: number | null;
  interview: number | null;
  rejected: number | null;
  ghosted: number | null;
  maturing: boolean;
};

export function weeklyCohorts(jobs: Job[]): Cohort[] {
  const byWeek = new Map<string, Job[]>();
  for (const j of jobs) {
    if (!j.applied_date) continue;
    const w = weekStart(j.applied_date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), j]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([week, js]) => ({
      week,
      apps: js.length,
      response: pct(js.filter(heardBack).length, js.length),
      interview: pct(js.filter(interviewed).length, js.length),
      rejected: pct(js.filter((j) => j.status === "Rejected").length, js.length),
      ghosted: pct(js.filter((j) => j.status === "Ghosted").length, js.length),
      // Most of these applications are still inside the window where silence isn't yet a signal.
      maturing: (daysSince(week) ?? 0) < MIN_AGE_DAYS + 7,
    }));
}
