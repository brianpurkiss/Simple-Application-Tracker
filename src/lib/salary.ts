export const HIDDEN_MONEY = "$•••";

// Set from the profile's "hide financial numbers" setting; every money display below goes through it.
let hideFinancials = false;
export const setHideFinancials = (hide: boolean) => { hideFinancials = hide; };

export const k = (n: number) => (hideFinancials ? HIDDEN_MONEY : `$${Number.isInteger(n / 1000) ? n / 1000 : (n / 1000).toFixed(1)}k`);

// Axis tick spacing for a salary span: the smallest round step (all multiples of $5k) that keeps it to about 8 ticks.
const TICK_STEPS = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
export const salaryTickStep = (span: number, maxTicks = 8) => TICK_STEPS.find((s) => span / s <= maxTicks - 1) ?? TICK_STEPS.at(-1)!;

// "$50k–$60k", "$55k+", "$50k" or "" for display and search.
export function formatSalary(min: number | null, max: number | null): string {
  if (min == null && max == null) return "";
  if (hideFinancials) return HIDDEN_MONEY;
  if (min == null) return `Up to ${k(max!)}`;
  if (max == null) return `${k(min)}+`;
  return min === max ? k(min) : `${k(min)}–${k(max)}`;
}

type SalaryPoint = { salary: number; count: number; smooth: number };
export type SalaryCurve = {
  points: SalaryPoint[];
  jobCount: number; // roles that contributed
  openEnded: number; // of those, roles with only a min or only a max
  peak: number | null; // salary tick where the most roles overlap
  low: number | null; // ends of the trimmed curve
  high: number | null;
  mean: number | null; // count-weighted mean of the trimmed curve
};

// Each role adds +1 to every tick inside its range. Open-ended roles add +1 at their one known value.
// `trim` is the share of the curve cut from the tails (0.05 keeps the central 95%).
export function salaryCurve(
  jobs: { salary_min: number | null; salary_max: number | null }[],
  step: number,
  trim = 0.05,
  bandwidth = 0, // dollars; Gaussian sigma for the smoothed series, 0 leaves it equal to the raw counts
): SalaryCurve {
  const spans: [number, number][] = [];
  let openEnded = 0;
  for (const { salary_min: min, salary_max: max } of jobs) {
    if (min == null && max == null) continue;
    if (min == null || max == null) openEnded++;
    const lo = min ?? max!;
    const hi = max ?? min!;
    let first = Math.ceil(lo / step);
    let last = Math.floor(hi / step);
    // A range narrower than one tick still counts, at the tick nearest its midpoint.
    if (first > last) first = last = Math.round((lo + hi) / 2 / step);
    spans.push([first, last]);
  }
  if (!spans.length) return { points: [], jobCount: 0, openEnded: 0, peak: null, low: null, high: null, mean: null };

  const sigma = bandwidth / step;
  const reach = Math.ceil(sigma * 3);
  const from = Math.min(...spans.map((s) => s[0])) - 1 - reach;
  const to = Math.max(...spans.map((s) => s[1])) + 1 + reach;
  const counts = new Array<number>(to - from + 1).fill(0);
  for (const [a, b] of spans) for (let i = a; i <= b; i++) counts[i - from]++;
  // Gaussian kernel, normalised so smoothing spreads the mass without changing the total.
  const kernel = Array.from({ length: reach * 2 + 1 }, (_, i) => Math.exp(-((i - reach) ** 2) / (2 * sigma * sigma)));
  const norm = kernel.reduce((a, b) => a + b, 0);
  const smoothed = bandwidth
    ? counts.map((_, i) => kernel.reduce((a, w, j) => a + w * (counts[i + j - reach] ?? 0), 0) / norm)
    : counts;
  const all = counts.map((count, i) => ({ salary: (from + i) * step, count, smooth: smoothed[i] }));

  // Trim the tails so a few outliers don't stretch the axis: drop the outer `trim / 2` of the curve's mass on each side.
  const total = counts.reduce((a, b) => a + b, 0);
  const cut = (total * trim) / 2;
  let before = 0;
  let lo = 0;
  let hi = all.length - 1;
  for (let i = 0; i < all.length; i++) {
    if (before + all[i].count >= cut) { lo = i; break; }
    before += all[i].count;
  }
  before = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    if (before + all[i].count >= cut) { hi = i; break; }
    before += all[i].count;
  }
  const points = all.slice(lo, hi + 1);

  const kept = points.reduce((a, p) => a + p.count, 0);
  const mean = points.reduce((a, p) => a + p.salary * p.count, 0) / kept;
  const max = Math.max(...points.map((p) => p.smooth));
  const top = points.filter((p) => p.smooth >= max - 1e-9);
  return {
    points,
    jobCount: spans.length,
    openEnded,
    peak: top[Math.floor((top.length - 1) / 2)].salary,
    low: points[0].salary,
    high: points[points.length - 1].salary,
    mean,
  };
}

// Form inputs hold strings; "" means no value.
export const toSalary = (s: string): number | null => (s.trim() === "" ? null : Number(s));

export const salaryRangeInvalid = (min: string, max: string) =>
  min.trim() !== "" && max.trim() !== "" && Number(min) > Number(max);
