import { CLOSED_STATUSES, GHOSTED_DAYS, INTERVIEWING_STATUSES, STALE_DAYS } from "./options";
import type { Job } from "./api";
import { daysSince, isOnHold } from "./format";

// Saved postings weren't applied to, so they stay out of activity, performance and the pipeline.
export const isApplication = (job: Job) => !job.saved;

// A job has one Applied event, so once it has one, Applied isn't offered when logging history.
export const loggableTypes = (types: readonly string[], hasApplied: boolean) => (hasApplied ? types.filter((t) => t !== "Applied") : types);

export const isActive = (job: Job) => isApplication(job) && !CLOSED_STATUSES.has(job.status);

// Jobs that got to an interview at some point, including ones that ended after it.
export const reachedInterview = (job: Job) => job.interview_count + job.screen_count > 0;

// Interviewed and still in play: an interview is scheduled or under way, or an offer is out. A job that timed out
// (auto-ghosted) after an interview still counts; one that was rejected or manually Ghosted does not.
export const isInterviewing = (job: Job) => INTERVIEWING_STATUSES.has(job.status) || (job.auto_ghosted && reachedInterview(job));

// How far a job got: "2 interviews", "1 screen". Empty when it has neither.
export const progressParts = (job: Pick<Job, "interview_count" | "screen_count">) => [
  job.interview_count ? `${job.interview_count} ${job.interview_count === 1 ? "interview" : "interviews"}` : "",
  job.screen_count ? `${job.screen_count} ${job.screen_count === 1 ? "screen" : "screens"}` : "",
].filter(Boolean);

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

// Applied and unanswered for a week or more, but not yet long enough to be written off as ghosted.
export function isGoingCold(job: Job) {
  if (job.status !== "Applied" || job.auto_ghosted || job.first_contact || job.rejected_date || reachedInterview(job)) return false;
  const days = daysSince(job.applied_date);
  return days !== null && days >= STALE_DAYS && days < GHOSTED_DAYS;
}

// Active jobs that came through a person rather than a cold application.
export const isWarmLead = (job: Job) => isActive(job) && (job.applied_via === "Referral" || job.applied_via === "Inbound Recruiter");

// Active jobs with something logged in the last week.
export function isRecentlyUpdated(job: Job) {
  const days = daysSince(job.last_activity);
  return isActive(job) && days !== null && days < STALE_DAYS;
}

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
