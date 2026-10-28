// One value per job fact for every page. A manual value always wins; otherwise the automatic value is worked
// out here on read, so nothing automatic is stored and a rule change shows up everywhere at once.
import type { Job } from "./api";
import type { TitleInfo } from "./titles/types";

export type ResolvedFact = {
  value: string;
  /** Where the value came from. The review list (Assumed) will read this. */
  source: "manual" | "auto" | "none";
};

/** A term from the Job Type matchup. `term` is stored as typed and normalized when matched. */
export type JobTypeRule = { term: string; jobType: string };

/** Everything the automatic facts need, built once per page from the jobs and the rule tables. */
export type FactContext = {
  titles: Map<number, TitleInfo>;
  jobTypeRules: JobTypeRule[];
};

// The Job Type used when a title has a function but no rule matches it.
export const FALLBACK_JOB_TYPE = "Other";

// Lowercase words only, so "eCommerce", "E-Commerce" and "e commerce" all read the same.
export const normalizeWords = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The Job Type for a title function, or null when no rule matches. Longest term first, so "web management" beats "web". */
export function matchJobType(fn: string, rules: JobTypeRule[]): string | null {
  const text = ` ${normalizeWords(fn)} `;
  if (!text.trim()) return null;
  const sorted = [...rules].sort((a, b) => normalizeWords(b.term).length - normalizeWords(a.term).length);
  for (const r of sorted) {
    const term = normalizeWords(r.term);
    if (term && text.includes(` ${term} `)) return r.jobType;
  }
  return null;
}

/** The Job Type: a manual value if one is set, else the matchup on the title's function, else Other when the title has a function. */
export function resolveJobType(job: Job, ctx: FactContext): ResolvedFact {
  const manual = job.job_type?.trim() ?? "";
  if (manual) return { value: manual, source: "manual" };
  const fn = ctx.titles.get(job.id)?.function ?? "";
  if (!fn) return { value: "", source: "none" };
  return { value: matchJobType(fn, ctx.jobTypeRules) ?? FALLBACK_JOB_TYPE, source: "auto" };
}

/** Company Type is still hand-entered; its automatic rules come later. */
export function resolveCompanyType(job: Job): ResolvedFact {
  const manual = job.company_type?.trim() ?? "";
  return manual ? { value: manual, source: "manual" } : { value: "", source: "none" };
}
