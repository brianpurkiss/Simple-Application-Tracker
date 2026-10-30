import type { ActivityEvent, Job } from "./api";
import { addDays, categoryOf, weekStart } from "./activity";
import { GHOSTED_POST, GHOSTED_PRE, REJECTED_POST, REJECTED_PRE, STATUS_COLORS } from "./colors";
import { GHOSTED_DAYS } from "./options";
import { daysBetween, daysSince, isOnHold } from "./format";
import { reachedInterview } from "./jobs";

// Applications newer than this haven't had a fair chance to hear back, so they're left out of rates.
export const MIN_AGE_DAYS = 6;
// Groups smaller than this are shown dimmed; the rate isn't meaningful yet.
export const MIN_SAMPLE = 9;

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);
export const fmtPct = (n: number | null) => (n === null ? "–" : `${n}%`);

// Share of applications (not saved postings) that reached a screen or interview.
export const interviewRateOf = (jobs: Job[]) => {
  const applied = jobs.filter((j) => j.applied_date && !j.saved);
  return pct(applied.filter(interviewed).length, applied.length);
};

export const median = (nums: number[]) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Linear-interpolated quantile (q from 0 to 1), so a quarter of a small group still lands between two listings.
const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
};

// The middle of a job's listed pay range, or its one end when only one is listed. Null when no pay is listed.
export const salaryMid = (j: Job) =>
  j.salary_min == null && j.salary_max == null ? null : ((j.salary_min ?? j.salary_max!) + (j.salary_max ?? j.salary_min!)) / 2;

export type SalaryQuartiles = { p25: number; p50: number; p75: number; n: number };

// The 25th, 50th and 75th percentile of range midpoints, across jobs that list pay.
export function salaryQuartiles(jobs: Job[]): SalaryQuartiles | null {
  const mids = jobs.map(salaryMid).filter((m): m is number => m != null).sort((a, b) => a - b);
  if (!mids.length) return null;
  return { p25: quantile(mids, 0.25), p50: quantile(mids, 0.5), p75: quantile(mids, 0.75), n: mids.length };
}

const hasOffer = (j: Job) => j.status === "Offer" || j.status === "Accepted";
export const interviewed = (j: Job) => reachedInterview(j) || hasOffer(j);
const multipleInterviews = (j: Job) => j.interview_count >= 2 || hasOffer(j);
export const heardBack = (j: Job) => Boolean(j.first_contact || j.rejected_date) || interviewed(j);

export type Kpis = {
  applications: number;
  last7: number;
  prev7: number;
  interviews: number;
  interviewsLast7: number;
  interviewsPrev7: number;
  responseRate: number | null;
  interviewRate: number | null;
  medianResponseDays: number | null;
  medianRejectionDays: number | null;
};

export function kpis(jobs: Job[], events: ActivityEvent[], todayIso: string): Kpis {
  // Rolling windows (today and the 6 days before, then the 7 before that) so early-week numbers aren't penalised.
  const daysAgo = (n: number) => addDays(todayIso, -n);
  const inRange = (from: string, to: string) => jobs.filter((j) => j.applied_date && j.applied_date >= from && j.applied_date <= to).length;
  const interviewDates = events.filter((e) => categoryOf(e) === "interview").map((e) => e.date);
  const countDates = (dates: string[], from: string, to: string) => dates.filter((d) => d >= from && d <= to).length;
  const response = jobs.filter((j) => j.applied_date && j.first_contact).map((j) => daysBetween(j.applied_date!, j.first_contact!));
  const rejection = jobs.filter((j) => j.applied_date && j.rejected_date).map((j) => daysBetween(j.applied_date!, j.rejected_date!));
  return {
    applications: jobs.length,
    last7: inRange(daysAgo(6), todayIso),
    prev7: inRange(daysAgo(13), daysAgo(7)),
    interviews: interviewDates.length,
    interviewsLast7: countDates(interviewDates, daysAgo(6), todayIso),
    interviewsPrev7: countDates(interviewDates, daysAgo(13), daysAgo(7)),
    responseRate: pct(jobs.filter(heardBack).length, jobs.length),
    interviewRate: pct(jobs.filter(interviewed).length, jobs.length),
    medianResponseDays: median(response),
    medianRejectionDays: median(rejection),
  };
}

export type FunnelStep = { label: string; count: number; ofTotal: number | null };

// Each step is a subset of the one before it, so the bars can only shrink.
export function funnel(jobs: Job[]): FunnelStep[] {
  const counts: [string, number][] = [
    ["Applied", jobs.length],
    ["Heard Back", jobs.filter(heardBack).length],
    ["Screen / 1st Interview", jobs.filter(interviewed).length],
    ["Multiple Interviews", jobs.filter(multipleInterviews).length],
    ["Offer", jobs.filter(hasOffer).length],
  ];
  return counts.map(([label, count]) => ({ label, count, ofTotal: pct(count, counts[0][1]) }));
}

export type FlowNode = { name: string; color: string };
export type FlowLink = { source: number; target: number; value: number };

const FLOW_NODES: FlowNode[] = [
  { name: "Applied", color: STATUS_COLORS.Applied.hex },
  { name: "No Response", color: STATUS_COLORS.Ghosted.hex },
  { name: "Heard Back", color: "#8b5cf6" },
  { name: "No Interview", color: REJECTED_PRE.hex },
  { name: "1st Interview", color: STATUS_COLORS.Interviewed.hex },
  { name: "Multiple Interviews", color: "#2563eb" },
  { name: "Still Open", color: STATUS_COLORS.Applied.hex },
  { name: "Offer", color: STATUS_COLORS.Offer.hex },
  { name: "Accepted", color: STATUS_COLORS.Accepted.hex },
  { name: "Rejected", color: STATUS_COLORS.Rejected.hex },
  { name: "Withdrew", color: STATUS_COLORS.Withdrew.hex },
  { name: "Ghosted", color: STATUS_COLORS.Ghosted.hex },
  { name: "Scam", color: STATUS_COLORS.Scam.hex },
];

const FLOW_OUTCOME: Record<string, string> = {
  Applied: "Still Open",
  Scheduled: "Still Open",
  Interviewed: "Still Open",
  Offer: "Offer",
  Accepted: "Accepted",
  Rejected: "Rejected",
  Withdrew: "Withdrew",
  Ghosted: "Ghosted",
  Scam: "Scam",
};

// Every job follows one path (Applied > response > 1st interview > multiple interviews > outcome), so flow in always equals flow out.
// Nodes nothing flows through are dropped, and links are reindexed to match.
export function flow(jobs: Job[]): { nodes: FlowNode[]; links: FlowLink[] } {
  const counts = new Map<string, number>();
  const add = (from: string, to: string) => counts.set(`${from}|${to}`, (counts.get(`${from}|${to}`) ?? 0) + 1);
  for (const j of jobs) {
    const outcome = FLOW_OUTCOME[j.status] ?? "Still Open";
    if (!heardBack(j)) {
      add("Applied", "No Response");
      add("No Response", outcome);
      continue;
    }
    add("Applied", "Heard Back");
    if (!interviewed(j)) {
      add("Heard Back", "No Interview");
      add("No Interview", outcome);
      continue;
    }
    add("Heard Back", "1st Interview");
    if (multipleInterviews(j)) {
      add("1st Interview", "Multiple Interviews");
      add("Multiple Interviews", outcome);
    } else add("1st Interview", outcome);
  }
  const used = FLOW_NODES.filter((n) => [...counts.keys()].some((k) => k.split("|").includes(n.name)));
  const links = [...counts].map(([k, value]) => {
    const [from, to] = k.split("|");
    return { source: used.findIndex((n) => n.name === from), target: used.findIndex((n) => n.name === to), value };
  });
  return { nodes: used, links };
}

export type Outcome ={ key: string; label: string; color: string; count: number };

export function outcomes(jobs: Job[]): Outcome[] {
  const rejected = jobs.filter((j) => j.status === "Rejected");
  const ghosted = jobs.filter((j) => j.status === "Ghosted");
  const rows: Outcome[] = [
    { key: "waiting", label: "Waiting for Response", color: STATUS_COLORS.Applied.hex, count: jobs.filter((j) => j.status === "Applied").length },
    { key: "interviewed", label: "Interviewing", color: STATUS_COLORS.Interviewed.hex, count: jobs.filter((j) => j.status === "Interviewed" || j.status === "Scheduled").length },
    { key: "rejected-post", label: "Rejected, Post Interview", color: REJECTED_POST.hex, count: rejected.filter(reachedInterview).length },
    { key: "rejected-pre", label: "Rejected, No Interview", color: REJECTED_PRE.hex, count: rejected.filter((j) => !reachedInterview(j)).length },
    { key: "withdrew", label: "Withdrew", color: STATUS_COLORS.Withdrew.hex, count: jobs.filter((j) => j.status === "Withdrew").length },
    { key: "ghosted-post", label: "Ghosted, with Interview", color: GHOSTED_POST.hex, count: ghosted.filter(reachedInterview).length },
    { key: "ghosted-pre", label: "Ghosted, No Interview", color: GHOSTED_PRE.hex, count: ghosted.filter((j) => !reachedInterview(j)).length },
    { key: "scam", label: "Scam", color: STATUS_COLORS.Scam.hex, count: jobs.filter((j) => j.status === "Scam").length },
  ];
  return rows;
}

export const PERF_DIMS = [
  { key: "resume", label: "Resume" },
  { key: "title", label: "Job Title" },
  { key: "seniority", label: "Seniority" },
  { key: "type", label: "Job Type" },
  { key: "company", label: "Company Type" },
] as const;
export type PerfDim = (typeof PERF_DIMS)[number]["key"];
// The values a job takes for a non-resume dimension (a job can sit in several starred titles). Empty = not in any starred group, once a kind has stars.
export type DimValues = (job: Job, dim: Exclude<PerfDim, "resume">) => string[];

// "XXX 2.3" -> "XXX 2.x". Labels without a ".N" suffix are left alone.
export const VERSION_MODES = [
  { key: "separate", label: "Separate" },
  { key: "grouped", label: "Grouped (2.x)" },
] as const;

export const resumeFamily = (label: string) => label.trim().replace(/\.\d+$/, ".x");

// Closed out without ever reaching a screen or interview: rejected outright, or silent for `ghostDays`.
// The server's auto-ghost uses GHOSTED_DAYS, so jobs it ghosted sooner than a longer `ghostDays` count as still pending.
const noResponse = (j: Job, ghostDays = GHOSTED_DAYS) => {
  if (interviewed(j)) return false;
  if (j.status === "Rejected") return true;
  if (isOnHold(j)) return false;
  const silent = daysSince(j.last_heard ?? j.applied_date) ?? 0;
  if (j.status === "Ghosted") return !j.auto_ghosted || silent >= ghostDays;
  return j.status === "Applied" && silent >= ghostDays;
};

export type Metric = "interview" | "rejected";
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
  rejected: number;
  interviews: number;
  rejectedRate: number | null;
  interviewRate: number | null;
  lift: number | null;
  lo: number;
  hi: number;
  tier: Tier;
  // Salary of the jobs that reached an interview: mean of range midpoints, and the highest top-of-range. Null when none list pay.
  interviewSalaryMean: number | null;
  interviewSalaryMax: number | null;
  jobs: Job[];
  // The jobs that count toward the chosen metric.
  hits: Job[];
};

type ComboResult = { combos: Combo[]; baseline: number; total: number; excluded: number };

// One group per combination of values (each job's value lists, in dimension order), so a job in two starred titles counts in both.
export function groupByDims(entries: { j: Job; lists: string[][] }[]): Map<string, { parts: string[]; jobs: Job[] }> {
  const groups = new Map<string, { parts: string[]; jobs: Job[] }>();
  for (const { j, lists } of entries) {
    const product = lists.reduce<string[][]>((acc, l) => acc.flatMap((p) => [...new Set(l)].map((v) => [...p, v])), [[]]);
    for (const parts of product) {
      const key = parts.join("\u0000");
      const g = groups.get(key) ?? { parts, jobs: [] };
      g.jobs.push(j);
      groups.set(key, g);
    }
  }
  return groups;
}

// Groups jobs by every dimension in `dims` (in order) and grades each group against the overall rate.
export function comboBy(
  jobs: Job[],
  dims: PerfDim[],
  {
    values,
    metric,
    minSample = MIN_SAMPLE,
    minAge = MIN_AGE_DAYS,
    groupVersions = false,
    z = 1.645,
    ghostDays = GHOSTED_DAYS,
  }: { values: DimValues; metric: Metric; minSample?: number; minAge?: number; groupVersions?: boolean; z?: number; ghostDays?: number },
): ComboResult {
  // Jobs missing any grouped field are left out entirely, so they don't skew the average either.
  // Rejections need the ghost window to have passed, or recent applications would look better than they are.
  if (metric === "rejected") minAge = Math.max(minAge, ghostDays);
  const valuesOf = (j: Job, d: PerfDim) => {
    if (d !== "resume") return values(j, d);
    const v = j.resume_version?.trim();
    return v ? [groupVersions ? resumeFamily(v) : v] : [];
  };
  const eligible = jobs
    .filter((j) => j.applied_date && (daysSince(j.applied_date) ?? 0) >= minAge)
    .map((j) => ({ j, lists: dims.map((d) => valuesOf(j, d)) }))
    .filter((e) => e.lists.every((l) => l.length));
  const rejected_ = (j: Job) => noResponse(j, ghostDays);
  const hit = metric === "interview" ? interviewed : rejected_;
  const baseline = eligible.length ? eligible.filter((e) => hit(e.j)).length / eligible.length : 0;

  const groups = groupByDims(eligible);

  const combos = [...groups.entries()].map(([key, g]): Combo => {
    const n = g.jobs.length;
    const rejected = g.jobs.filter(rejected_).length;
    const interviews = g.jobs.filter(interviewed).length;
    const k = metric === "interview" ? interviews : rejected;
    const { lo, hi } = wilson(k, n, z);
    const rate = k / n;
    let tier: Tier = "even";
    // For rejections, a higher rate is the bad outcome, so the grading flips.
    const flip = metric === "rejected";
    if (n < minSample) tier = "low";
    else if (flip ? hi < baseline : lo > baseline) tier = "standout";
    else if (flip ? lo > baseline : hi < baseline) tier = "under";
    else if (flip ? rate < baseline : rate > baseline) tier = "watch";
    const paid = g.jobs.filter(interviewed).filter((j) => salaryMid(j) != null);
    const mids = paid.map((j) => salaryMid(j)!);
    return {
      key,
      parts: g.parts,
      n,
      rejected,
      interviews,
      rejectedRate: pct(rejected, n),
      interviewRate: pct(interviews, n),
      lift: baseline ? rate / baseline : null,
      lo,
      hi,
      tier,
      interviewSalaryMean: mids.length ? mids.reduce((a, b) => a + b, 0) / mids.length : null,
      interviewSalaryMax: paid.length ? Math.max(...paid.map((j) => j.salary_max ?? j.salary_min!)) : null,
      jobs: g.jobs,
      hits: g.jobs.filter(metric === "interview" ? interviewed : rejected_),
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

export type TimingPoint = { bucket: string; interview: number; rejectedNoInterview: number; rejected: number };

export function timing(jobs: Job[]): TimingPoint[] {
  const points = BUCKETS.map((b) => ({ bucket: b.label, interview: 0, rejectedNoInterview: 0, rejected: 0 }));
  const place = (days: number, field: "interview" | "rejectedNoInterview" | "rejected") => {
    points[BUCKETS.findIndex((b) => days <= b.max)][field]++;
  };
  for (const j of jobs) {
    if (!j.applied_date) continue;
    if (j.first_interview) place(daysBetween(j.applied_date, j.first_interview), "interview");
    if (j.rejected_date) place(daysBetween(j.applied_date, j.rejected_date), reachedInterview(j) ? "rejected" : "rejectedNoInterview");
  }
  return points;
}

export type SpanStats = { count: number; min: number; max: number; avg: number; median: number } | null;

// Days from first interview to formal rejection, for jobs that have both.
export function interviewToRejection(jobs: Job[]): SpanStats {
  const days = jobs
    .filter((j) => j.first_interview && j.rejected_date)
    .map((j) => daysBetween(j.first_interview!, j.rejected_date!))
    .filter((d) => d >= 0);
  if (!days.length) return null;
  return {
    count: days.length,
    min: Math.min(...days),
    max: Math.max(...days),
    avg: days.reduce((a, b) => a + b, 0) / days.length,
    median: median(days)!,
  };
}

export type Cohort = {
  week: string;
  apps: number;
  response: number | null;
  interview: number | null;
  multiInterview: number | null;
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
      multiInterview: pct(js.filter(multipleInterviews).length, js.length),
      rejected: pct(js.filter((j) => j.status === "Rejected").length, js.length),
      ghosted: pct(js.filter((j) => j.status === "Ghosted").length, js.length),
      // Most of these applications are still inside the window where silence isn't yet a signal.
      maturing: (daysSince(week) ?? 0) < MIN_AGE_DAYS + 7,
    }));
}
