import type { Job, TriState } from "./api";

type Comp = Pick<Job, "salary_min" | "salary_max" | "bonus_pct" | "bonus_amount" | "equity_annual" | "match_rate_pct"
  | "match_cap_pct" | "hsa_employer" | "stipends_annual">;

export const EQUITY_TYPES: { value: Job["equity_type"]; label: string }[] = [
  { value: "none", label: "None" },
  { value: "rsu", label: "RSUs" },
  { value: "options", label: "Stock options" },
  { value: "profit_share", label: "Profit sharing" },
  { value: "other", label: "Other" },
];

export const COMP_SOURCES: { value: Job["comp_source"]; label: string }[] = [
  { value: "posted", label: "Posted" },
  { value: "offer", label: "Offer" },
];

export const BENEFITS = [
  { key: "benefit_medical", label: "Medical" },
  { key: "benefit_dental", label: "Dental" },
  { key: "benefit_vision", label: "Vision" },
  { key: "benefit_life", label: "Life insurance" },
  { key: "benefit_disability", label: "Disability" },
] as const satisfies { key: keyof Job; label: string }[];

// The bonus on a given base: a flat amount wins over a percentage.
export const bonusOn = (j: Comp, base: number) => j.bonus_amount ?? (j.bonus_pct != null ? (base * j.bonus_pct) / 100 : 0);

// The most the employer puts into the 401k on a given base, if you contribute enough to get the whole match.
export const matchOn = (j: Comp, base: number) =>
  j.match_rate_pct != null && j.match_cap_pct != null ? (base * j.match_cap_pct * j.match_rate_pct) / 10_000 : 0;

// Recurring yearly compensation on a given base. One-time cash (signing, relocation) is left out.
const packageOn = (j: Comp, base: number) =>
  Math.round(base + bonusOn(j, base) + (j.equity_annual ?? 0) + matchOn(j, base) + (j.hsa_employer ?? 0) + (j.stipends_annual ?? 0));

// True when anything beyond base salary adds to the annual package.
export const hasExtras = (j: Comp) =>
  [j.bonus_pct, j.bonus_amount, j.equity_annual, j.hsa_employer, j.stipends_annual].some((v) => v != null && v > 0) || matchOn(j, 1) > 0;

// True when a job has any pay figure to compare: a base salary or something that adds to the package.
export const hasPayData = (j: Comp) => j.salary_min != null || j.salary_max != null || hasExtras(j);

// One number per job for sorting by base: the top of the range, or its one listed end.
export const baseSortValue = (j: Pick<Job, "salary_min" | "salary_max">) => j.salary_max ?? j.salary_min ?? undefined;

// The estimated annual package at each end of the salary range, null where that end isn't listed.
// Null altogether when no base salary is listed, since bonus and match depend on it.
export function annualPackage(j: Comp): { min: number | null; max: number | null } | null {
  if (j.salary_min == null && j.salary_max == null) return null;
  return {
    min: j.salary_min == null ? null : packageOn(j, j.salary_min),
    max: j.salary_max == null ? null : packageOn(j, j.salary_max),
  };
}

// Paid days off a year: PTO, holidays and separate sick days. Unlimited PTO counts only what else is stated.
export function paidDaysOff(j: Pick<Job, "pto_days" | "pto_unlimited" | "sick_days" | "holidays">) {
  const parts = [j.pto_unlimited ? null : j.pto_days, j.holidays, j.sick_days];
  const known = parts.filter((n): n is number => n != null);
  return { days: known.length ? known.reduce((a, b) => a + b, 0) : null, unlimited: j.pto_unlimited };
}

export function benefitsSummary(j: Pick<Job, (typeof BENEFITS)[number]["key"]>) {
  const values: TriState[] = BENEFITS.map((b) => j[b.key]);
  return { yes: values.filter((v) => v === 1).length, no: values.filter((v) => v === 0).length, unknown: values.filter((v) => v == null).length };
}

export type TargetFit =
  | { kind: "within"; pct: number } // how far into the range the target sits, 0 at the bottom to 100 at the top
  | { kind: "above"; pct: number } // the range tops out this % below the target
  | { kind: "below"; pct: number }; // the range starts this % above the target: a step up

// Where a base salary target sits against a job's base range. An open-ended range ("$55k+") is treated as its one end.
export function targetFit(min: number | null, max: number | null, target: number | null): TargetFit | null {
  if (target == null || target <= 0 || (min == null && max == null)) return null;
  const lo = min ?? max!;
  const hi = max ?? min!;
  if (target > hi) return { kind: "above", pct: Math.round(((target - hi) / target) * 100) };
  if (target < lo) return { kind: "below", pct: Math.round(((lo - target) / target) * 100) };
  return { kind: "within", pct: hi === lo ? 50 : Math.round(((target - lo) / (hi - lo)) * 100) };
}

// "+12%", "−3%" or "+5% to +26%": each end of a range against a past figure. Null when either side is unknown.
export function changeFrom(past: number | null, min: number | null, max: number | null): string | null {
  if (past == null || past <= 0 || (min == null && max == null)) return null;
  const fmt = (n: number) => {
    const p = Math.round(((n - past) / past) * 100);
    return p > 0 ? `+${p}%` : p < 0 ? `−${-p}%` : "±0%";
  };
  const [a, b] = [fmt(min ?? max!), fmt(max ?? min!)];
  return a === b ? a : `${a} to ${b}`;
}
