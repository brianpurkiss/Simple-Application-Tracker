// Filters shared by the Jobs list and Activity. Each param lives in the URL so views can be shared and survive reloads.
import type { StarKind } from "./api";

export const COMPANY_TYPE_PARAM = "company_type";
export const RESUME_PARAM = "resume";

// Groups starred on the Segments page, one filter per kind. Stars are read live, so adding or dropping one
// changes every page that uses these params.
export const STAR_FILTERS: { param: string; label: string; kind: StarKind; tab: string }[] = [
  { param: "star_title", label: "Titles", kind: "title", tab: "title" },
  { param: "star_seniority", label: "Seniority", kind: "seniority", tab: "seniority" },
  { param: "star_type", label: "Job Types", kind: "type", tab: "jobType" },
];

export const STAR_PARAMS = STAR_FILTERS.map((f) => f.param);
