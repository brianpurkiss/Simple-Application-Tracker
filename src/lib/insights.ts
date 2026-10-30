import type { ActivityEvent, Job, JobBoard } from "./api";
import { boardCounts } from "./boards";
import { addDays, categoryOf, weekStart } from "./activity";
import { daysBetween, formatDate } from "./format";
import { reachedInterview } from "./jobs";
import { k } from "./salary";
import { plural } from "./text";
import { type DimValues, MIN_AGE_DAYS, MIN_SAMPLE, hasOffer, heardBack, median, pct } from "./stats";

const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

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
  recentDays: { date: string; n: number }[]; // the last 14 days, oldest first, ending today
  weeksOnPace: number; // weeks in a row at or above the usual weekly application count
  paceTarget: number;
  thisWeek: { applications: number; interviews: number };
  average: { applications: number; interviews: number } | null; // trailing full weeks
  previousBest: number; // most applications in any week before this one
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
    recentDays: Array.from({ length: 14 }, (_, i) => {
      const date = addDays(todayIso, i - 13);
      return { date, n: appsByDay.get(date) ?? 0 };
    }),
    weeksOnPace,
    paceTarget,
    thisWeek,
    average,
    previousBest: Math.max(0, ...[...appsByWeek].filter(([w]) => w !== thisMonday).map(([, n]) => n)),
  };
}

export type WinGroup = { title: string; items: { label: string; earned: boolean }[] };
export type Wins = { badges: string[]; groups: WinGroup[]; next: string | null };

const APPLICATION_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500, 750, 1000];
const INTERVIEW_MILESTONES = [1, 5, 10, 25, 50];
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

// Every milestone with whether it is reached yet. The badges are the highest one reached in each group.
export function wins(jobs: Job[], events: ActivityEvent[], m: Momentum): Wins {
  const interviews = events.filter((e) => categoryOf(e) === "interview").length;
  const groups: WinGroup[] = [
    { title: "Applications", items: APPLICATION_MILESTONES.map((n) => ({ label: `${n} applications`, earned: jobs.length >= n })) },
    { title: "Replies", items: [{ label: "First reply", earned: jobs.some(heardBack) }] },
    { title: "Interviews", items: INTERVIEW_MILESTONES.map((n) => ({ label: n === 1 ? "First interview" : `${n} interviews`, earned: interviews >= n })) },
    { title: "Offers", items: [{ label: "First offer", earned: jobs.some(hasOffer) }] },
    { title: "Streaks", items: STREAK_MILESTONES.map((n) => ({ label: `${n}-day streak`, earned: m.streak.best >= n })) },
  ];
  if (m.weeksOnPace > 1) groups.push({ title: "Pace", items: [{ label: `${m.weeksOnPace} weeks on pace`, earned: true }] });
  const badges = groups.flatMap((g) => g.items.filter((i) => i.earned).slice(-1).map((i) => i.label));
  const goal = APPLICATION_MILESTONES.find((n) => n > jobs.length);
  return { badges, groups, next: goal ? `${plural(goal - jobs.length, "application")} to reach ${goal}` : null };
}

export type FollowUps = { followedUp: number; replied: number; interviews: number };

// A follow-up worked when the company came back with something other than a rejection soon after.
const FOLLOW_UP_WINDOW_DAYS = 14;
const FOLLOW_UP_REPLIES = new Set(["Contact", "Screen", "Interview", "Offer", "Accepted"]);
const FOLLOW_UP_INTERVIEWS = new Set(["Screen", "Interview", "Offer", "Accepted"]);

export function followUps(events: ActivityEvent[]): FollowUps {
  const byJob = new Map<number, ActivityEvent[]>();
  for (const e of events) if (e.job_id) byJob.set(e.job_id, [...(byJob.get(e.job_id) ?? []), e]);
  const out = { followedUp: 0, replied: 0, interviews: 0 };
  for (const list of byJob.values()) {
    const sent = list.filter((e) => e.type === "Follow-Up");
    if (!sent.length) continue;
    out.followedUp++;
    const answers = list.filter((e) => FOLLOW_UP_REPLIES.has(e.type) && sent.some((f) => e.date > f.date && daysBetween(f.date, e.date) <= FOLLOW_UP_WINDOW_DAYS));
    if (answers.length) out.replied++;
    if (answers.some((e) => FOLLOW_UP_INTERVIEWS.has(e.type))) out.interviews++;
  }
  return out;
}

// How long the search has run, for the line under the headline numbers.
export function searchSpan(jobs: Job[], events: ActivityEvent[], todayIso: string) {
  const first = jobs.map((j) => j.applied_date).filter(Boolean).sort()[0];
  if (!first) return null;
  return { days: daysBetween(first, todayIso), since: first, logged: events.filter((e) => e.job_id).length };
}

export const EXTRA_GROUPS = ["Highlights", "Responses", "Segments", "Salary"] as const;
type ExtraGroup = (typeof EXTRA_GROUPS)[number];
export type Extra = { group: ExtraGroup; label: string; value: string; detail?: string; jobId?: number };

const money = (n: number) => k(Math.round(n / 1000) * 1000);
const label = (j: Job) => `${j.title} at ${j.company}`;

// A job can sit in several segments (titles roll up), so counts here can add up to more than the number of jobs.
function segmentExtras(jobs: Job[], segments: DimValues): Extra[] {
  const out: Extra[] = [];
  const dims = [
    { dim: "title", label: "Most Applied-To Title" },
    { dim: "seniority", label: "Most Applied-To Seniority" },
    { dim: "type", label: "Most Applied-To Job Type" },
  ] as const;
  const applied = jobs.filter((j) => j.applied_date);
  const tally = (dim: (typeof dims)[number]["dim"], list: Job[]) => {
    const counts = new Map<string, number>();
    for (const j of list) for (const v of new Set(segments(j, dim))) count(counts, v);
    return counts;
  };
  const top = (counts: Map<string, number>) => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  for (const { dim, label } of dims) {
    const best = top(tally(dim, applied));
    if (best) out.push({ group: "Segments", label, value: best[0], detail: `${plural(best[1], "application")}, ${pct(best[1], applied.length)}% of jobs` });
  }

  // Most interviews, so one lucky application in a tiny segment can't win; ties go to the segment applied to less.
  const interviews = tally("title", jobs.filter(reachedInterview));
  const appliedTo = tally("title", applied);
  const winner = [...interviews].sort((a, b) => b[1] - a[1] || (appliedTo.get(a[0]) ?? 0) - (appliedTo.get(b[0]) ?? 0))[0];
  if (winner) out.push({ group: "Segments", label: "Best-Performing Title", value: winner[0], detail: `${plural(winner[1], "job")} reached an interview of ${appliedTo.get(winner[0]) ?? 0} applied` });

  const unsegmented = jobs.filter((j) => dims.every(({ dim }) => !segments(j, dim).length)).length;
  if (unsegmented) out.push({ group: "Segments", label: "Outside Every Segment", value: String(unsegmented), detail: "Not in any starred group" });
  return out;
}

// Trivia for the end of the page. Anything without enough data is left out rather than shown as zero.
export function extras(jobs: Job[], events: ActivityEvent[], todayIso: string, segments?: DimValues, boards: JobBoard[] = []): Extra[] {
  const out: Extra[] = [];
  const applied = jobs.filter((j) => j.applied_date);

  const byCompany = new Map<string, number>();
  for (const j of jobs) {
    const rounds = j.interview_count + j.screen_count;
    if (rounds && j.company) byCompany.set(j.company, (byCompany.get(j.company) ?? 0) + rounds);
  }
  const topCompany = [...byCompany].sort((a, b) => b[1] - a[1])[0];
  if (topCompany) out.push({ group: "Highlights", label: "Most Interviews at One Company", value: String(topCompany[1]), detail: topCompany[0] });

  const longest = jobs.reduce<Job | null>((best, j) => (j.interview_count + j.screen_count > (best ? best.interview_count + best.screen_count : 1) ? j : best), null);
  if (longest) out.push({ group: "Highlights", label: "Longest Interview Process", value: plural(longest.interview_count + longest.screen_count, "round"), detail: label(longest), jobId: longest.id });

  const offers = jobs.filter(hasOffer);
  if (offers.length) out.push({ group: "Highlights", label: "Offers", value: String(offers.length), detail: `${pct(offers.length, jobs.length)}% of applications` });
  // Days from applying to the first offer, for jobs where both dates are known.
  const firstOffer = new Map<number, string>();
  for (const e of events) if (e.type === "Offer" && !firstOffer.has(e.job_id)) firstOffer.set(e.job_id, e.date);
  const toOffer = applied.filter((j) => firstOffer.has(j.id)).map((j) => daysBetween(j.applied_date!, firstOffer.get(j.id)!));
  if (toOffer.length) out.push({ group: "Highlights", label: "Time to Offer", value: plural(median(toOffer)!, "day"), detail: "Median from applying to first offer" });

  const interviewsByWeek = new Map<string, number>();
  for (const e of events) if (categoryOf(e) === "interview") count(interviewsByWeek, weekStart(e.date));
  const busyInterviewWeek = [...interviewsByWeek].sort((a, b) => b[1] - a[1])[0];
  if (busyInterviewWeek) out.push({ group: "Highlights", label: "Most Interviews in a Week", value: String(busyInterviewWeek[1]), detail: `Week of ${formatDate(busyInterviewWeek[0])}` });

  const byDay = new Map<string, number>();
  const byWeek = new Map<string, number>();
  for (const j of applied) {
    count(byDay, j.applied_date!);
    count(byWeek, weekStart(j.applied_date!));
  }
  const busyDay = [...byDay].sort((a, b) => b[1] - a[1])[0];
  const busyWeek = [...byWeek].sort((a, b) => b[1] - a[1])[0];
  if (busyDay) out.push({ group: "Highlights", label: "Busiest Day", value: plural(busyDay[1], "application"), detail: formatDate(busyDay[0]) });
  if (busyWeek) out.push({ group: "Highlights", label: "Busiest Week", value: plural(busyWeek[1], "application"), detail: `Week of ${formatDate(busyWeek[0])}` });
  if (byDay.size) out.push({ group: "Highlights", label: "Applications per Active Day", value: (applied.length / byDay.size).toFixed(1), detail: `across ${plural(byDay.size, "day")} with at least one` });

  // The saved board whose site most job links point to; ties go to the one listed first.
  const topBoard = [...boardCounts(boards, jobs)].reduce<[number, number] | null>((best, c) => (c[1] > (best?.[1] ?? 0) ? c : best), null);
  if (topBoard) out.push({ group: "Highlights", label: "Most Used Job Board", value: boards.find((b) => b.id === topBoard[0])!.name, detail: `${plural(topBoard[1], "job")}, ${pct(topBoard[1], jobs.length)}% of jobs` });

  const lucky = new Map<string, number>();
  for (const j of jobs) if (j.resume_version && reachedInterview(j)) lucky.set(j.resume_version, (lucky.get(j.resume_version) ?? 0) + 1);
  const topResume = [...lucky].sort((a, b) => b[1] - a[1])[0];
  if (topResume) out.push({ group: "Highlights", label: "Lucky Resume", value: topResume[0], detail: `${plural(topResume[1], "job")} reached an interview` });

  const ghosted = jobs.filter((j) => j.status === "Ghosted").length;
  if (ghosted) out.push({ group: "Responses", label: "Ghosted", value: String(ghosted), detail: `${pct(ghosted, jobs.length)}% of applications` });

  // Reply rate by how you applied, over applications old enough to have heard back and channels big enough to mean something.
  const settled = applied.filter((j) => j.applied_via && daysBetween(j.applied_date!, todayIso) >= MIN_AGE_DAYS);
  const channels = new Map<string, Job[]>();
  for (const j of settled) channels.set(j.applied_via, [...(channels.get(j.applied_via) ?? []), j]);
  const rates = [...channels].filter(([, list]) => list.length >= MIN_SAMPLE).map(([via, list]) => ({ via, n: list.length, rate: pct(list.filter(heardBack).length, list.length) ?? 0 }));
  if (rates.length > 1) {
    const top = rates.sort((x, y) => y.rate - x.rate || y.n - x.n)[0];
    out.push({ group: "Responses", label: "Best Way In", value: top.via, detail: `${top.rate}% replied, from ${plural(top.n, "application")}` });
  }
  const referral = rates.find((r) => r.via === "Referral");
  const direct = rates.find((r) => r.via === "Direct");
  if (referral && direct) out.push({ group: "Responses", label: "Referral Reply Rate", value: `${referral.rate}%`, detail: `vs. ${direct.rate}% when applying directly` });

  if (segments) out.push(...segmentExtras(jobs, segments));

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
