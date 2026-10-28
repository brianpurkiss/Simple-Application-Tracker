// Turns per-job TitleInfo into page rows. A job counts toward its own family and every family it
// rolls up to, so totals across rows can exceed the number of jobs.

import type { Job } from "../api.ts";
import { consolidateTitles } from "./consolidate.ts";
import type { TitleInfo } from "./types.ts";

export type TitleVariant = { title: string; jobs: Job[]; rolledUp: boolean };
export type TitleGroup = {
  key: string;
  label: string;
  jobs: Job[];
  variants: TitleVariant[];
  /** Created automatically from words other titles share; no job has this exact title. */
  shared: boolean;
  /** One title on its own: nothing else matched it and it doesn't roll up anywhere. */
  unpaired: boolean;
};

export function titleGroups(jobs: Job[], titles: Map<number, TitleInfo> = consolidateTitles(jobs)): TitleGroup[] {
  const groups = new Map<string, { label: string; jobs: Job[]; variants: Map<string, TitleVariant>; own: number; linked: boolean }>();
  const add = (key: string, label: string, job: Job, rolledUp: boolean, linked: boolean) => {
    const g = groups.get(key) ?? { label, jobs: [] as Job[], variants: new Map<string, TitleVariant>(), own: 0, linked: false };
    g.jobs.push(job);
    if (!rolledUp) g.own++;
    g.linked ||= linked;
    const title = job.title.trim();
    const v = g.variants.get(title) ?? { title, jobs: [], rolledUp };
    v.jobs.push(job);
    g.variants.set(title, v);
    groups.set(key, g);
  };

  for (const job of jobs) {
    const info = titles.get(job.id);
    if (!info) continue;
    add(info.familyKey, info.family, job, false, info.rollsUpTo.length > 0);
    for (const parent of info.rollsUpTo) add(parent.key, parent.label, job, true, true);
  }

  return [...groups].map(([key, g]) => {
    const unpaired = key !== "other" && !g.linked && g.variants.size === 1;
    return {
      key,
      // A lone title reads better as posted than as a generated label.
      label: unpaired ? [...g.variants.keys()][0] : g.label,
      jobs: g.jobs,
      // Titles that belong to the family first, then rolled-up ones, most common first within each.
      variants: [...g.variants.values()].sort((a, b) => Number(a.rolledUp) - Number(b.rolledUp) || b.jobs.length - a.jobs.length || a.title.localeCompare(b.title)),
      shared: g.own === 0,
      unpaired,
    };
  });
}
