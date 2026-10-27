import { useMemo } from "react";
import type { Job } from "@/lib/api";
import { reachedInterview } from "@/lib/format";
import { k } from "@/lib/salary";

export type SalarySeries = { key: string; label: string; jobs: Job[] };

const low = (j: Job) => j.salary_min ?? j.salary_max!;
const high = (j: Job) => j.salary_max ?? j.salary_min!;
const mid = (j: Job) => (low(j) + high(j)) / 2;
const hasPay = (j: Job) => j.salary_min != null || j.salary_max != null;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// One row per combo: the span of salaries across its roles, with the mean marked.
export default function SalaryCurve({ series, target }: { series: SalarySeries[]; target: number | null }) {
  const rows = useMemo(
    () =>
      series
        .map((s) => {
          const paid = s.jobs.filter(hasPay);
          const got = paid.filter(reachedInterview);
          return {
            ...s,
            n: paid.length,
            lo: paid.length ? Math.min(...paid.map(low)) : 0,
            hi: paid.length ? Math.max(...paid.map(high)) : 0,
            mean: mean(paid.map(mid)),
            // The interviewed span sits inside the all-roles span, so it can be drawn on top of it.
            interviewed: got.length ? { n: got.length, lo: Math.min(...got.map(low)), hi: Math.max(...got.map(high)), mean: mean(got.map(mid))! } : null,
          };
        })
        .filter((r) => r.n > 0),
    [series],
  );

  const axis = useMemo(() => {
    if (!rows.length) return null;
    const every = 25_000;
    // The target is included so its dot always lands on the chart.
    const all = target == null ? [] : [target];
    const min = Math.floor(Math.min(...rows.map((r) => r.lo), ...all) / every) * every;
    const max = Math.ceil(Math.max(...rows.map((r) => r.hi), ...all) / every) * every;
    const ticks: number[] = [];
    for (let t = min; t <= max; t += every) ticks.push(t);
    return { min, span: Math.max(max - min, 1), ticks };
  }, [rows, target]);
  const at = (v: number) => `${((v - axis!.min) / axis!.span) * 100}%`;
  const width = (lo: number, hi: number) => `calc(${at(hi)} - ${at(lo)})`;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">Salary Range</h2>
        <p className="text-sm text-muted-foreground">Lowest to highest pay across each combo's roles, with the range of roles that reached an interview in solid blue.</p>
      </div>
      {axis ? (
        <>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
                <div className="min-w-0">
                  <div className="truncate">{r.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.n} role{r.n === 1 ? "" : "s"} · {k(r.lo)}–{k(r.hi)} · {k(Math.round(r.mean! / 1000) * 1000)} mean
                    {r.interviewed && ` · ${r.interviewed.n} interviewed ${k(r.interviewed.lo)}–${k(r.interviewed.hi)}`}
                  </div>
                </div>
                <div className="relative h-4">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                  <div
                    className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-blue-500/25"
                    style={{ left: at(r.lo), width: width(r.lo, r.hi), minWidth: 6 }}
                    title={`All roles ${k(r.lo)}–${k(r.hi)}`}
                  />
                  {r.interviewed && (
                    <div
                      className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-blue-500"
                      style={{ left: at(r.interviewed.lo), width: width(r.interviewed.lo, r.interviewed.hi), minWidth: 6 }}
                      title={`Interviewed ${k(r.interviewed.lo)}–${k(r.interviewed.hi)}`}
                    />
                  )}
                  {r.interviewed && (
                    <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-500 bg-card" style={{ left: at(r.interviewed.mean) }} title={`Interviewed mean ${k(Math.round(r.interviewed.mean / 1000) * 1000)}`} />
                  )}
                  {target != null && (
                    <div className="absolute top-1/2 z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500 ring-2 ring-card" style={{ left: at(target) }} title={`Salary target ${k(target)}`} />
                  )}
                  <div className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-foreground" style={{ left: at(r.mean!) }} title={`Mean ${k(Math.round(r.mean! / 1000) * 1000)}`} />
                </div>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,14rem)_1fr]">
            <div />
            <div className="relative h-4">
              {axis.ticks.map((t) => (
                <span key={t} className="absolute -translate-x-1/2" style={{ left: at(t) }}>{k(t)}</span>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="mr-1 inline-block h-2.5 w-5 translate-y-0.5 rounded-full bg-blue-500/25" /> All roles
            <span className="ml-3 mr-1 inline-block h-2.5 w-5 translate-y-0.5 rounded-full bg-blue-500" /> Interviewed
            <span className="ml-3 mr-1 inline-block h-3 w-0.5 translate-y-0.5 bg-foreground" /> Mean (all roles)
            <span className="ml-3 mr-1 inline-block size-2.5 translate-y-0.5 rounded-full border-2 border-blue-500" /> Mean of interviewed roles
            {target != null && <><span className="ml-3 mr-1 inline-block size-2.5 translate-y-0.5 rounded-full bg-amber-500" /> Salary target</>}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Add salaries to roles to see the distribution.</p>
      )}
    </section>
  );
}
