// Shared shape for title consolidation. The rule parser produces it today; an AI analyzer will
// produce the same shape later, so nothing downstream needs to know which one ran.

export type TitleInput = {
  id: number;
  title: string;
  company: string;
  /** Hand-written title used instead of `title` for analysis when set. */
  normalized_title?: string;
};

export type TitleGroupRef = { key: string; label: string };

export type SeniorityTrack = "IC" | "Management" | "Executive";

export type Seniority = {
  /** 1–9 on one ladder shared by both tracks (see seniority.ts). Null when the title has no recognizable level. */
  rank: number | null;
  label: string;
  track: SeniorityTrack | null;
};

export type TitleInfo = {
  /** Display label for the group, built from rung + function ("Director of eCommerce"). */
  family: string;
  /** Stable grouping key, e.g. "director:ecommerce". */
  familyKey: string;
  /** What the work is, e.g. "eCommerce". Empty for Other. */
  function: string;
  seniority: Seniority;
  /** Broader families this one also counts toward: same rung, a subset of its function words.
   * "Director of Growth & eCommerce Revenue" rolls up to Director of Growth and Director of eCommerce.
   * Includes shared groups created automatically when no job has that exact title. */
  rollsUpTo: TitleGroupRef[];
  source: "rules" | "ai";
};
