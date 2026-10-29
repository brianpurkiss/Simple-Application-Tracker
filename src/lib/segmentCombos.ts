// Popular combinations of segments (title × seniority × type …), with what they pay and whether an active resume
// already covers them. Saved postings count here: the point is what's out there, not how applications went.

import type { Job } from "./api";
import { type DimValues, type PerfDim, type SalaryQuartiles, groupByDims, interviewed, pct, salaryQuartiles } from "./stats";

export type ComboDim = Exclude<PerfDim, "resume">;

export type SegmentCombo = {
  key: string;
  parts: string[];
  jobs: Job[];
  count: number;
  applications: number;
  interviewRate: number | null;
  salary: SalaryQuartiles | null;
  // Active resumes used on jobs in this combo, by name with every version grouped ("eCom 1.0" and "eCom 2.3" are both
  // "eCom"), most used first. `share` is the percent of the combo's jobs that list a resume.
  resumes: { name: string; share: number; covers: boolean }[];
  // Whether one of them was used enough to count as this combo's resume. Not covered means it's an opportunity.
  covered: boolean;
};

// A resume borrowed for a job or two isn't the resume for a combo; it needs this share of the combo's jobs.
export const MIN_RESUME_SHARE = 25;

// "eCom 2.3" -> "eCom". Labels without a trailing version number are their own name.
export const resumeName = (version: string) => version.trim().replace(/\s*v?\d+(?:\.\d+)*$/i, "") || version.trim();

export function segmentCombos(jobs: Job[], dims: ComboDim[], values: DimValues, activeVersions: string[]): { combos: SegmentCombo[]; excluded: number } {
  // Jobs missing a value for any dimension (or outside every starred group of a starred kind) are left out.
  const entries = jobs.map((j) => ({ j, lists: dims.map((d) => values(j, d)) })).filter((e) => e.lists.every((l) => l.length));
  const activeNames = new Set(activeVersions.map(resumeName));
  const combos = [...groupByDims(entries)].map(([key, g]): SegmentCombo => {
    const applied = g.jobs.filter((j) => j.applied_date && !j.saved);
    // Shares are of jobs with a resume listed, so saved postings without one don't water them down.
    const names = g.jobs.map((j) => j.resume_version.trim()).filter(Boolean).map(resumeName);
    const counts = new Map<string, number>();
    for (const n of names) if (activeNames.has(n)) counts.set(n, (counts.get(n) ?? 0) + 1);
    const resumes = [...counts]
      .map(([name, n]) => ({ name, share: pct(n, names.length)!, covers: pct(n, names.length)! >= MIN_RESUME_SHARE }))
      .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
    return {
      key,
      parts: g.parts,
      jobs: g.jobs,
      count: g.jobs.length,
      applications: applied.length,
      interviewRate: pct(applied.filter(interviewed).length, applied.length),
      salary: salaryQuartiles(g.jobs),
      resumes,
      covered: resumes.some((r) => r.covers),
    };
  });
  return { combos, excluded: jobs.length - entries.length };
}
