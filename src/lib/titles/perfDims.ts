// Value getter for the Performance page's Title / Seniority / Type dimensions. Once any group of a kind is
// starred on the Segments page, only starred groups produce values, so a job outside every starred group has
// none and fringe roles stay out of the analysis. With nothing starred for a kind, every group counts.

import type { Job, StarredGroup } from "../api.ts";
import { type FactContext, resolveCompanyType, resolveJobTypes } from "../jobFacts.ts";
import type { DimValues } from "../stats.ts";
import { jobGroupKeys, starSet } from "./starred.ts";

export function perfDimValues(stars: StarredGroup[], ctx: FactContext): DimValues {
  const set = starSet(stars);
  const hasStars = new Set(stars.map((s) => s.kind));
  const labels = new Map(stars.map((s) => [`${s.kind}|${s.key}`, s.label]));
  return (job: Job, dim) => {
    // Company Type isn't a starred group: a job's company type is its one value.
    if (dim === "company") {
      const company = resolveCompanyType(job, ctx).value;
      return company ? [company] : [];
    }
    const info = ctx.titles.get(job.id);
    const types = resolveJobTypes(job, ctx).values;
    const keys = jobGroupKeys(info, types)[dim];
    if (!hasStars.has(dim)) {
      if (dim === "title") return info ? [info.family, ...info.rollsUpTo.map((p) => p.label)] : [];
      return keys.map((key) => key.slice(dim.length + 1));
    }
    return keys.filter((key) => set.has(`${dim}|${key}`)).map((key) => labels.get(`${dim}|${key}`) ?? key);
  };
}
