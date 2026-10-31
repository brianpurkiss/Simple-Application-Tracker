import type { Job } from "./api";
import { today } from "./format";
import { isApplication, statusLabel } from "./jobs";

// The most recent time the company got back to us: a contact, screen, interview, offer or rejection. Applying
// itself isn't a response, so a job nobody has answered is blank.
function latestResponse(job: Job) {
  const dates = [job.last_heard, job.rejected_date].filter((d): d is string => !!d && d !== job.applied_date);
  return dates.sort().pop() ?? "";
}

const num = (n: number | null) => (n === null ? "" : String(n));

type ExportColumn = { key: string; label: string; value: (job: Job) => string; defaultOn?: boolean };

// Listed in export order. The ones marked defaultOn are what an unemployment filing usually asks for.
export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "status", label: "Status", value: statusLabel, defaultOn: true },
  { key: "title", label: "Job Title", value: (j) => j.title, defaultOn: true },
  { key: "company", label: "Company", value: (j) => j.company, defaultOn: true },
  { key: "applied", label: "Applied Date", value: (j) => j.applied_date ?? "", defaultOn: true },
  // Screens count: they're interviews as far as an unemployment office is concerned.
  { key: "interviews", label: "Number of Interviews", value: (j) => String(j.interview_count + j.screen_count), defaultOn: true },
  { key: "response", label: "Latest Response", value: latestResponse, defaultOn: true },
  { key: "url", label: "Job Posting URL", value: (j) => j.jd_link, defaultOn: true },
  { key: "applied_via", label: "Applied Via", value: (j) => j.applied_via },
  { key: "agency", label: "Agency", value: (j) => j.agency_name },
  { key: "work_mode", label: "Work Mode", value: (j) => j.work_mode },
  { key: "company_type", label: "Company Type", value: (j) => j.company_type },
  { key: "fit", label: "Fit", value: (j) => j.fit },
  { key: "salary_min", label: "Salary Min", value: (j) => num(j.salary_min) },
  { key: "salary_max", label: "Salary Max", value: (j) => num(j.salary_max) },
  { key: "resume", label: "Resume Version", value: (j) => j.resume_version },
  { key: "contact_name", label: "Contact Name", value: (j) => j.contact_name },
  { key: "contact_email", label: "Contact Email", value: (j) => j.contact_email },
  { key: "contact_phone", label: "Contact Phone", value: (j) => j.contact_phone },
  { key: "first_contact", label: "First Contact Date", value: (j) => j.first_contact ?? "" },
  { key: "first_interview", label: "First Interview Date", value: (j) => j.first_interview ?? "" },
  { key: "rejected", label: "Rejection Date", value: (j) => j.rejected_date ?? "" },
  { key: "follow_up", label: "Last Follow-Up", value: (j) => j.last_follow_up ?? "" },
  { key: "notes", label: "Notes", value: (j) => j.notes },
];

export const DEFAULT_EXPORT_KEYS = EXPORT_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key);

// One row per application, newest first. Saved postings weren't applied to, so they're left out.
export const exportJobs = (jobs: Job[]) =>
  jobs.filter(isApplication).sort((a, b) => (b.applied_date ?? "").localeCompare(a.applied_date ?? ""));

// Columns keep their order above whatever order they were ticked in.
export const selectedColumns = (keys: readonly string[]) => EXPORT_COLUMNS.filter((c) => keys.includes(c.key));

const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export const toCsv = (jobs: Job[], columns: ExportColumn[]) =>
  [columns.map((c) => cell(c.label)).join(","), ...jobs.map((j) => columns.map((c) => cell(c.value(j))).join(","))].join("\r\n") + "\r\n";

export function downloadCsv(jobs: Job[], columns: ExportColumn[]) {
  const url = URL.createObjectURL(new Blob([toCsv(jobs, columns)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `job-applications-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
