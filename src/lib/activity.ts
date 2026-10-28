import type { ActivityEvent } from "./api";
import { DAY } from "./format";

export type Category = "applied" | "interview" | "offer" | "rejection" | "resume" | "other";

// Colors follow StatusBadge: amber applied, blue interviewing, emerald offers, red rejections.
export const CATEGORIES: { key: Category; label: string; color: string }[] = [
  { key: "applied", label: "Applications", color: "#f59e0b" },
  { key: "interview", label: "Interviews", color: "#3b82f6" },
  { key: "offer", label: "Offers", color: "#10b981" },
  { key: "rejection", label: "Rejections", color: "#ef4444" },
  { key: "resume", label: "New Resumes", color: "#8b5cf6" },
  { key: "other", label: "Other", color: "#a3a3a3" },
];

export const colorOf = (c: Category) => CATEGORIES.find((x) => x.key === c)!.color;

const CATEGORY_FOR_TYPE: Record<string, Category> = {
  Applied: "applied",
  "Screen": "interview",
  Interview: "interview",
  Offer: "offer",
  Accepted: "offer",
  Rejection: "rejection",
  "New Resume": "resume",
};

export const categoryOf = (e: ActivityEvent): Category => CATEGORY_FOR_TYPE[e.type] ?? "other";

// Dates are plain YYYY-MM-DD strings; do the math in UTC so time zones can't shift a day.
const toUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Monday of the week containing the date.
export const weekStart = (iso: string) => {
  const ms = toUtc(iso);
  return fromUtc(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY);
};

type WeekPoint = { week: string } & Record<Category, number>;

// Events counted per week, with empty weeks filled in so the chart doesn't skip over quiet stretches.
export function weeklySeries(events: ActivityEvent[]): WeekPoint[] {
  if (!events.length) return [];
  const counts = new Map<string, WeekPoint>();
  for (const e of events) {
    const week = weekStart(e.date);
    const point = counts.get(week) ?? { week, applied: 0, interview: 0, offer: 0, rejection: 0, resume: 0, other: 0 };
    point[categoryOf(e)]++;
    counts.set(week, point);
  }
  const weeks = [...counts.keys()].sort();
  const series: WeekPoint[] = [];
  for (let ms = toUtc(weeks[0]); ms <= toUtc(weeks[weeks.length - 1]); ms += 7 * DAY) {
    const week = fromUtc(ms);
    series.push(counts.get(week) ?? { week, applied: 0, interview: 0, offer: 0, rejection: 0, resume: 0, other: 0 });
  }
  return series;
}

// Offers and interviews come first so a busy day's dot overflow never hides them behind a pile of applications.
const PRIORITY: Category[] = ["offer", "interview", "rejection", "resume", "applied", "other"];

export function eventsByDay(events: ActivityEvent[]) {
  const byDay = new Map<string, ActivityEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  for (const items of byDay.values()) items.sort((a, b) => PRIORITY.indexOf(categoryOf(a)) - PRIORITY.indexOf(categoryOf(b)));
  return byDay;
}

// 6 rows of 7 days (Monday first) covering the month, as YYYY-MM-DD; `month` is 0-based.
export function monthGrid(year: number, month: number) {
  const first = Date.UTC(year, month, 1);
  const start = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY;
  return Array.from({ length: 42 }, (_, i) => fromUtc(start + i * DAY));
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// Events of one category counted by day of the week (Monday first).
export function weekdayCounts(events: ActivityEvent[], category: Category) {
  const counts = WEEKDAYS.map((day) => ({ day, count: 0 }));
  for (const e of events) {
    if (categoryOf(e) === category) counts[(new Date(toUtc(e.date)).getUTCDay() + 6) % 7].count++;
  }
  return counts;
}
