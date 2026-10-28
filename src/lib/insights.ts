import type { ActivityEvent, Job } from "./api";
import { addDays, categoryOf, weekStart } from "./activity";
import { daysBetween, formatDate } from "./format";
import { isActive, reachedInterview } from "./jobs";
import { INTERVIEWING_STATUSES } from "./options";
import { plural } from "./text";
import { MIN_AGE_DAYS, MIN_SAMPLE, heardBack, median, pct } from "./stats";

const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

// First day anyone replied: the earlier of a contact and a rejection.
const replyDate = (j: Job) => [j.first_contact, j.rejected_date].filter(Boolean).sort()[0] ?? null;

// Every Monday from `from` through `to`.
function weeksBetween(from: string, to: string) {
  const weeks: string[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

// Rolling mean over the last `size` values (fewer at the start), to one decimal.
export const rollingAverage = (values: number[], size: number) =>
  values.map((_, i) => {
    const window = values.slice(Math.max(0, i - size + 1), i + 1);
    return Math.round((window.reduce((a, b) => a + b, 0) / window.length) * 10) / 10;
  });

export type Momentum = {
  streak: { current: number; best: number };
  weeksOnPace: number; // weeks in a row at or above the usual weekly application count
  paceTarget: number;
  thisWeek: { applications: number; interviews: number };
  average: { applications: number; interviews: number } | null; // trailing full weeks
  pipeline: { active: number; interviewing: number };
  best: { applications: number; interviews: number };
};

export function momentum(jobs: Job[], events: ActivityEvent[], todayIso: string): Momentum {
  const appsByDay = new Map<string, number>();
  const appsByWeek = new Map<string, number>();
  const interviewsByWeek = new Map<string, number>();
  for (const j of jobs) {
    if (!j.applied_date) continue;
    count(appsByDay, j.applied_date);
    count(appsByWeek, weekStart(j.applied_date));
  }
  for (const e of events) if (categoryOf(e) === "interview") count(interviewsByWeek, weekStart(e.date));

  const days = [...appsByDay.keys()].sort();
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && daysBetween(days[i - 1], d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  // A streak is still alive if today is empty but yesterday had an application.
  let cursor = appsByDay.has(todayIso) ? todayIso : addDays(todayIso, -1);
  let current = 0;
  while (appsByDay.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const thisMonday = weekStart(todayIso);
  const first = [...appsByWeek.keys(), ...interviewsByWeek.keys()].sort()[0];
  const full = first && first < thisMonday ? weeksBetween(first, addDays(thisMonday, -1)) : [];
  const mean = (weeks: string[], by: Map<string, number>) => weeks.reduce((n, w) => n + (by.get(w) ?? 0), 0) / (weeks.length || 1);
  const recent = full.slice(-8);
  const average = full.length
    ? { applications: mean(recent, appsByWeek), interviews: mean(recent, interviewsByWeek) }
    : null;

  const thisWeek = { applications: appsByWeek.get(thisMonday) ?? 0, interviews: interviewsByWeek.get(thisMonday) ?? 0 };
  const paceTarget = Math.max(1, Math.round(mean(full, appsByWeek)));
  let weeksOnPace = 0;
  if (full.length) {
    const weeks = thisWeek.applications >= paceTarget ? [...full, thisMonday] : full;
    for (let i = weeks.length - 1; i >= 0 && (appsByWeek.get(weeks[i]) ?? 0) >= paceTarget; i--) weeksOnPace++;
  }

  return {
    streak: { current, best },
    weeksOnPace,
    paceTarget,
    thisWeek,
    average,
    pipeline: {
      active: jobs.filter(isActive).length,
      interviewing: jobs.filter((j) => INTERVIEWING_STATUSES.has(j.status)).length,
    },
    best: {
      applications: Math.max(0, ...appsByWeek.values()),
      interviews: Math.max(0, ...interviewsByWeek.values()),
    },
  };
}

export type CumulativePoint = { week: string; applications: number; replies: number; interviews: number };

// Running totals at the end of each week.
export function cumulative(jobs: Job[], todayIso: string): CumulativePoint[] {
  const apps = new Map<string, number>();
  const replies = new Map<string, number>();
  const interviews = new Map<string, number>();
  for (const j of jobs) {
    if (j.applied_date) count(apps, weekStart(j.applied_date));
    const reply = replyDate(j);
    if (reply) count(replies, weekStart(reply));
    if (j.first_interview) count(interviews, weekStart(j.first_interview));
  }
  const first = [...apps.keys(), ...replies.keys(), ...interviews.keys()].sort()[0];
  if (!first) return [];
  let a = 0;
  let r = 0;
  let i = 0;
  return weeksBetween(first, todayIso).map((week) => ({
    week,
    applications: (a += apps.get(week) ?? 0),
    replies: (r += replies.get(week) ?? 0),
    interviews: (i += interviews.get(week) ?? 0),
  }));
}

export const EXTRA_GROUPS = ["Responses", "Interviews", "Activity", "Salary"] as const;
type ExtraGroup = (typeof EXTRA_GROUPS)[number];
export type Extra = { group: ExtraGroup; label: string; value: string; detail?: string; jobId?: number };

const money = (n: number) => `$${Math.round(n / 1000)}k`;
const label = (j: Job) => `${j.title} at ${j.company}`;

// Trivia for the end of the page. Anything without enough data is left out rather than shown as zero.
export function extras(jobs: Job[], events: ActivityEvent[], todayIso: string): Extra[] {
  const out: Extra[] = [];
  const applied = jobs.filter((j) => j.applied_date);

  const replies = applied
    .map((j) => ({ j, days: replyDate(j) ? daysBetween(j.applied_date!, replyDate(j)!) : null }))
    .filter((r): r is { j: Job; days: number } => r.days !== null);
  if (replies.length) {
    const fast = replies.reduce((a, b) => (b.days < a.days ? b : a));
    const slow = replies.reduce((a, b) => (b.days > a.days ? b : a));
    out.push({ group: "Responses", label: "Fastest Reply", value: plural(fast.days, "day"), detail: label(fast.j), jobId: fast.j.id });
    out.push({ group: "Responses", label: "Slowest Reply", value: plural(slow.days, "day"), detail: label(slow.j), jobId: slow.j.id });
  }

  const rejections = applied.filter((j) => j.rejected_date).map((j) => ({ j, days: daysBetween(j.applied_date!, j.rejected_date!) }));
  if (rejections.length) {
    const quick = rejections.reduce((a, b) => (b.days < a.days ? b : a));
    const slow = rejections.reduce((a, b) => (b.days > a.days ? b : a));
    out.push({ group: "Responses", label: "Quickest Rejection", value: plural(quick.days, "day"), detail: label(quick.j), jobId: quick.j.id });
    out.push({ group: "Responses", label: "Slowest Rejection", value: plural(slow.days, "day"), detail: label(slow.j), jobId: slow.j.id });
  }

  const byCompany = new Map<string, number>();
  for (const j of jobs) {
    const rounds = j.interview_count + j.screen_count;
    if (rounds && j.company) byCompany.set(j.company, (byCompany.get(j.company) ?? 0) + rounds);
  }
  const topCompany = [...byCompany].sort((a, b) => b[1] - a[1])[0];
  if (topCompany) out.push({ group: "Interviews", label: "Most Interviews at One Company", value: String(topCompany[1]), detail: topCompany[0] });

  const byDay = new Map<string, number>();
  const byWeek = new Map<string, number>();
  for (const j of applied) {
    count(byDay, j.applied_date!);
    count(byWeek, weekStart(j.applied_date!));
  }
  const busyDay = [...byDay].sort((a, b) => b[1] - a[1])[0];
  const busyWeek = [...byWeek].sort((a, b) => b[1] - a[1])[0];
  if (busyDay) out.push({ group: "Activity", label: "Busiest Day", value: plural(busyDay[1], "application"), detail: formatDate(busyDay[0]) });
  if (busyWeek) out.push({ group: "Activity", label: "Busiest Week", value: plural(busyWeek[1], "application"), detail: `Week of ${formatDate(busyWeek[0])}` });
  if (byDay.size) out.push({ group: "Activity", label: "Applications per Active Day", value: (applied.length / byDay.size).toFixed(1), detail: `across ${plural(byDay.size, "day")} with at least one` });

  const lucky = new Map<string, number>();
  for (const j of jobs) if (j.resume_version && reachedInterview(j)) lucky.set(j.resume_version, (lucky.get(j.resume_version) ?? 0) + 1);
  const topResume = [...lucky].sort((a, b) => b[1] - a[1])[0];
  if (topResume) out.push({ group: "Interviews", label: "Lucky Resume", value: topResume[0], detail: `${plural(topResume[1], "job")} reached an interview` });

  const firstApplied = applied.map((j) => j.applied_date!).sort()[0];
  if (firstApplied) out.push({ group: "Activity", label: "Days Searching", value: String(daysBetween(firstApplied, todayIso)), detail: `since ${formatDate(firstApplied)}` });
  const logged = events.filter((e) => e.job_id).length;
  if (logged) out.push({ group: "Activity", label: "Events Logged", value: String(logged) });

  const ghosted = jobs.filter((j) => j.status === "Ghosted").length;
  if (ghosted) out.push({ group: "Responses", label: "Ghosted", value: String(ghosted), detail: `${pct(ghosted, jobs.length)}% of applications` });

  // Day-of-week reply rates, only for applications old enough to have heard back and groups big enough to mean something.
  const rateFor = (dow: number) => {
    const group = applied.filter((j) => new Date(Date.parse(j.applied_date!)).getUTCDay() === dow && daysBetween(j.applied_date!, todayIso) >= MIN_AGE_DAYS);
    return group.length >= MIN_SAMPLE ? pct(group.filter(heardBack).length, group.length) : null;
  };
  const mon = rateFor(1);
  const fri = rateFor(5);
  if (mon !== null && fri !== null) out.push({ group: "Responses", label: "Mondays vs. Fridays", value: `${mon}% vs. ${fri}%`, detail: "Reply rate by the day you applied" });

  // The top of each posted range is the figure compared here.
  const salaries = jobs
    .map((j) => ({ j, pay: j.salary_max ?? j.salary_min }))
    .filter((s): s is { j: Job; pay: number } => s.pay != null);
  if (salaries.length) {
    const high = salaries.reduce((a, b) => (b.pay > a.pay ? b : a));
    const low = salaries.reduce((a, b) => (b.pay < a.pay ? b : a));
    const avg = salaries.reduce((n, s) => n + s.pay, 0) / salaries.length;
    out.push({ group: "Salary", label: "Highest Salary", value: money(high.pay), detail: label(high.j), jobId: high.j.id });
    out.push({ group: "Salary", label: "Lowest Salary", value: money(low.pay), detail: label(low.j), jobId: low.j.id });
    out.push({ group: "Salary", label: "Average Salary", value: money(avg), detail: `Top of range, ${plural(salaries.length, "role")}` });
    out.push({ group: "Salary", label: "Median Salary", value: money(median(salaries.map((s) => s.pay))!), detail: "Top of range" });
  }

  return out;
}
