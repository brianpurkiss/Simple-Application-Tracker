// Value getter for the Performance page's Title / Seniority / Type dimensions. Only groups starred on the
// Job Titles page produce values, so a job outside every starred group of a dimension has none.

import type { Job, StarredGroup } from "../api.ts";
import { type FactContext, resolveJobType } from "../jobFacts.ts";
import type { DimValues } from "../stats.ts";
import { jobGroupKeys, starSet } from "./starred.ts";

export function perfDimValues(stars: StarredGroup[], ctx: FactContext): DimValues {
  const set = starSet(stars);
  const labels = new Map(stars.map((s) => [`${s.kind}|${s.key}`, s.label]));
  return (job: Job, dim) =>
    jobGroupKeys(ctx.titles.get(job.id), resolveJobType(job, ctx).value)[dim]
      .filter((key) => set.has(`${dim}|${key}`))
      .map((key) => labels.get(`${dim}|${key}`) ?? key);
}
