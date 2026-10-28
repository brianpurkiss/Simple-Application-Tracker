import type { Job } from "./api";

export type MissingField = {
  key: string;
  label: string;
  section: string;
  isMissing: (job: Job) => boolean;
  /** Jobs the field doesn't apply to never count as missing it. */
  appliesTo?: (job: Job) => boolean;
};

const blank = (key: keyof Job) => (job: Job) => !String(job[key] ?? "").trim();
const field = (key: keyof Job, label: string, section: string, extra?: Partial<MissingField>): MissingField =>
  ({ key, label, section, isMissing: blank(key), ...extra });

// The fields a job can be missing, grouped as they are on the job page. Job Title is required, so it's left out.
export const MISSING_FIELDS: MissingField[] = [
  field("company", "Company", "Job"),
  field("normalized_title", "Normalized Title", "Job"),
  field("job_type", "Job Type", "Job"),
  field("company_type", "Company Type", "Job"),
  field("fit", "Fit", "Job"),
  field("work_mode", "Work Mode", "Job"),
  field("jd_link", "Job Description Link", "Job"),
  field("applied_date", "Applied", "Application"),
  field("resume_version", "Resume Version", "Application"),
  field("applied_via", "Applied Via", "Application"),
  field("agency_name", "Agency Name", "Application", { appliesTo: (j) => j.applied_via === "Recruiting Agency" }),
  field("contact_name", "Name", "Point of Contact"),
  field("contact_email", "Email", "Point of Contact"),
  field("contact_phone", "Phone", "Point of Contact"),
  field("contact_linkedin", "LinkedIn URL", "Point of Contact"),
  { key: "salary", label: "Salary Range", section: "Compensation", isMissing: (j) => j.salary_min === null && j.salary_max === null },
  field("offer_info", "Offer Info", "Compensation"),
  field("notes", "Notes", "Notes"),
  { key: "job_description", label: "Job Description", section: "Job Description", isMissing: (j) => !j.has_job_description },
  { key: "cover_letter", label: "Cover Letter", section: "Cover Letter", isMissing: (j) => !j.has_cover_letter },
];

export const missingField = (key: string) => MISSING_FIELDS.find((f) => f.key === key);

export const isMissing = (job: Job, f: MissingField) => (f.appliesTo?.(job) ?? true) && f.isMissing(job);

export const missingCount = (jobs: Job[], f: MissingField) => jobs.filter((j) => isMissing(j, f)).length;
