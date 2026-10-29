// Dropdown options. Edit these lists to change what the app offers.

// Status is computed from the history: the latest event that sets a status wins.
export const STATUSES = ["Saved", "Applied", "Scheduled", "Interviewed", "Offer", "Accepted", "Rejected", "Withdrew", "Ghosted", "Scam"] as const;

export const CLOSED_STATUSES = new Set<string>(["Accepted", "Rejected", "Withdrew", "Ghosted", "Scam"]);

export const INTERVIEWING_STATUSES = new Set<string>(["Scheduled", "Interviewed", "Offer"]);

// Preset resume versions offered before any are in the vault or on a job. Empty: suggestions come from your own.
export const RESUME_VERSIONS: string[] = [];

// Keeps only the highest version of each resume family ("XXX 1.0".."XXX 2.3" -> "XXX 2.3").
// Labels without a trailing version number are kept as-is.
export function latestResumeVersions(labels: string[]): string[] {
  const latest = new Map<string, string>();
  for (const label of labels) {
    const m = label.trim().match(/^(.*?)\s*(\d+(?:\.\d+)*)$/);
    const key = m ? m[1].toLowerCase() : label;
    const best = latest.get(key);
    const version = (l: string) => l.match(/(\d+(?:\.\d+)*)$/)?.[1] ?? "";
    if (!best || (m && version(label).localeCompare(version(best), undefined, { numeric: true }) > 0)) {
      latest.set(key, label);
    }
  }
  return [...latest.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Latest version of each family pinned to the top, then everything else; each group is highest
// version first, ties alphabetical (XXX 2.3, YYY 2.1, ZZZ 1.0, XXX 2.2, XXX 2.1, ...).
export function sortResumeVersions(labels: string[]): string[] {
  const version = (l: string) => l.match(/(\d+(?:\.\d+)*)$/)?.[1] ?? "";
  const byVersion = (a: string, b: string) => version(b).localeCompare(version(a), undefined, { numeric: true }) || a.localeCompare(b);
  const latest = new Set(latestResumeVersions(labels));
  return [...labels.filter((l) => latest.has(l)).sort(byVersion), ...labels.filter((l) => !latest.has(l)).sort(byVersion)];
}

// A resume is active when it isn't flagged inactive and is the highest version of its family
// among the flagged-active ones; everything else (flagged inactive or superseded) is inactive.
export function splitResumes<T extends { version: string; active: boolean }>(resumes: T[]): { active: T[]; inactive: T[] } {
  const flagged = resumes.filter((r) => r.active);
  const latest = new Set(latestResumeVersions(flagged.map((r) => r.version)));
  return {
    active: resumes.filter((r) => r.active && latest.has(r.version)),
    inactive: resumes.filter((r) => !(r.active && latest.has(r.version))),
  };
}

// Job Types and Company Types are the user's own lists now (fact_types; see src/lib/jobFacts.ts).

// How well a role matches what you're after.
export const FITS = ["Good Fit", "Stretch", "Settle", "Pivot"];

export const WORK_MODES = ["Remote", "Hybrid", "In Office"];

export const APPLIED_VIA = ["Direct", "Recruiting Agency", "Referral", "Inbound Recruiter"];

export const EVENT_TYPES = [
  "Applied",
  "Contact",
  "Follow-Up",
  "Screen",
  "Interview",
  "Offer",
  "Accepted",
  "Rejection",
  "Withdrew",
  "Ghosted",
  "Scam",
  "Note",
] as const;

// Events that set the job's status. Others (follow-ups, notes…) leave it alone.
export const STATUS_FOR_EVENT: Record<string, (typeof STATUSES)[number]> = {
  Applied: "Applied",
  "Screen": "Interviewed",
  Interview: "Interviewed",
  Offer: "Offer",
  Accepted: "Accepted",
  Rejection: "Rejected",
  Withdrew: "Withdrew",
  Ghosted: "Ghosted",
  Scam: "Scam",
};

// Event types that count toward the "Latest Update" column.
export const UPDATE_EVENT_TYPES = ["Contact", "Screen", "Interview", "Offer", "Accepted", "Rejection"];

// Events that can carry a start time, and become the Scheduled status while it is still ahead.
export const TIMED_EVENT_TYPES = new Set<string>(["Screen", "Interview"]);

// Active jobs with no activity for this many days get highlighted.
export const STALE_DAYS = 7;

// Applied/interviewing jobs that haven't heard back (no contact or interview) in this many days count as Ghosted.
export const GHOSTED_DAYS = 21;
