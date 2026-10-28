// Helpers for filtering jobs by the groups starred on the Job Titles page. Group keys match
// TitleGroup.key there: title groups use their own key, the others are "seniority:<label>" / "type:<label>".

import type { StarKind, StarredGroup } from "../api.ts";
import type { TitleInfo } from "./types.ts";

export const starId = (kind: StarKind, key: string) => `${kind}|${key}`;

export const starSet = (stars: StarredGroup[]) => new Set(stars.map((s) => starId(s.kind, s.key)));

export const isStarred = (set: Set<string>, kind: StarKind, key: string) => set.has(starId(kind, key));

/** The group keys a job falls under for each kind. A title can sit in several groups because titles roll up.
 * `jobType` is the resolved Job Type (manual or automatic), see resolveJobType. */
export function jobGroupKeys(info: TitleInfo | undefined, jobType: string): Record<StarKind, string[]> {
  return {
    title: info ? [info.familyKey, ...info.rollsUpTo.map((p) => p.key)] : [],
    seniority: [`seniority:${info?.seniority.label || "Unspecified"}`],
    type: [`type:${jobType || "Unspecified"}`],
  };
}

/** True when the job is in a starred group of any of the given kinds (all kinds by default). */
export function jobMatchesStars(
  info: TitleInfo | undefined,
  jobType: string,
  set: Set<string>,
  kinds: StarKind[] = ["title", "seniority", "type"],
) {
  const keys = jobGroupKeys(info, jobType);
  return kinds.some((k) => keys[k].some((key) => set.has(starId(k, key))));
}
