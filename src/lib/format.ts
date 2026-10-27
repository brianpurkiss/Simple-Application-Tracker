import { CLOSED_STATUSES, INTERVIEWING_STATUSES, STALE_DAYS } from "./options";
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

export function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.floor((Date.parse(today()) - Date.parse(iso)) / DAY);
}

export const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY));

export const isActive = (job: Job) => !CLOSED_STATUSES.has(job.status);

// Jobs that got to an interview at some point, including ones that ended after it.
export const reachedInterview = (job: Job) => job.interview_count + job.screen_count > 0;

function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

// The status as shown: which interview round, or whether a rejection came after interviewing.
export function statusLabel(job: Pick<Job, "status" | "interview_count" | "screen_count">) {
  if (job.status === "Interviewed") {
    return job.interview_count ? `${ordinal(job.interview_count)} Interview` : "Screen";
  }
  if (job.status === "Rejected") {
    return job.interview_count + job.screen_count > 0 ? "Rejected, Post Interview" : "Rejected, No Interview";
  }
  return job.status;
}

// Interviewing jobs (or auto-ghosted ones that got to an interview) that have gone quiet — worth a follow-up. Logging a
// follow-up counts as activity, so it drops off for a while. Logging Ghosted closes it out.
export function needsFollowUp(job: Job) {
  const days = daysSince(job.last_activity ?? job.applied_date);
  const waiting = (job.auto_ghosted && reachedInterview(job)) || (INTERVIEWING_STATUSES.has(job.status) && job.status !== "Offer");
  return waiting && days !== null && days >= STALE_DAYS;
}
