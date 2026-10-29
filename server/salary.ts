export type SalaryRange = { min: number | null; max: number | null };

// Turns the old free-text salary ("$50k-60k", "$55k+", "~$60k", "?") into a numeric range
// in whole dollars. Numbers without a "k" under 1000 are read as thousands.
export function parseSalary(raw: string): SalaryRange {
  const s = raw.toLowerCase().replace(/[–—]/g, "-").replace(/[$~,\s]/g, "");
  const open = s.endsWith("+");
  const parts = s.replace(/\+$/, "").split("-").filter(Boolean);
  const nums = parts.map((p) => {
    const m = p.match(/^(\d+(?:\.\d+)?)(k?)$/);
    return m ? { n: Number(m[1]), k: m[2] === "k" } : null;
  });
  if (nums.length === 0 || nums.length > 2 || nums.some((n) => !n)) return { min: null, max: null };

  const anyK = nums.some((n) => n!.k);
  const dollars = nums.map((n) => Math.round(anyK || n!.n < 1000 ? n!.n * 1000 : n!.n));
  let [min, max] = dollars;
  if (dollars.length === 1) return { min, max: open ? null : min };
  if (min > max) [min, max] = [max, min];
  return { min, max };
}
