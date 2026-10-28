import type { Job } from "./api";

export const DAY = 86_400_000;

export const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: y === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function formatTime(hhmm: string | null | undefined) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// "Today" / "Tomorrow" for the next two days, otherwise the short date.
export function relativeDay(iso: string) {
  const t = Date.parse(today());
  const diff = Math.round((Date.parse(iso) - t) / DAY);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : formatDate(iso);
}

export function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.floor((Date.parse(today()) - Date.parse(iso)) / DAY);
}

export const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY));

// A scheduled follow-up date that hasn't arrived yet: the job stays out of Follow Up and can't auto-ghost.
export const isOnHold = (job: Pick<Job, "follow_up_on">) => !!job.follow_up_on && job.follow_up_on > today();
