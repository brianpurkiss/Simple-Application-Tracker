import { CLOSED_STATUSES, INTERVIEWING_STATUSES, STALE_DAYS } from "./options";
import type { Job } from "./api";
import { daysSince, isOnHold } from "./format";

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

// A scheduled follow-up whose day has arrived and hasn't been followed up on yet.
export const isScheduledDue = (job: Job) =>
  !!job.follow_up_on && isActive(job) && !isOnHold(job) && !(job.last_follow_up && job.last_follow_up >= job.follow_up_on);

// Interviewing jobs (or auto-ghosted ones that got to an interview) that have gone quiet — worth a follow-up. Logging a
// follow-up counts as activity, so it drops off for a while. Logging Ghosted closes it out. Held jobs are skipped; a scheduled date that has arrived brings the job back.
export function needsFollowUp(job: Job) {
  if (isOnHold(job)) return false;
  // A scheduled follow-up date that has arrived puts the job back in Follow Up, whatever its status or quiet time —
  // until a follow-up is logged on or after that date, which counts as the scheduled one done.
  if (isScheduledDue(job)) return true;
  const days = daysSince(job.last_activity ?? job.applied_date);
  const waiting = (job.auto_ghosted && reachedInterview(job)) || (INTERVIEWING_STATUSES.has(job.status) && job.status !== "Offer");
  return waiting && days !== null && days >= STALE_DAYS;
}
