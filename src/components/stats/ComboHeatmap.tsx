import { useMemo } from "react";
import { comboBy, type DimensionKey, fmtPct, type Metric } from "@/lib/stats";
import type { Job } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ComboHeatmap({ jobs, dim, metric, minSample, minAge, groupVersions }: {
  groupVersions: boolean;
  jobs: Job[];
  dim: DimensionKey;
  metric: Metric;
  minSample: number;
  minAge: number;
}) {
  const { combos } = useMemo(() => comboBy(jobs, ["resume_version", dim], { metric, minSample, minAge, groupVersions }), [jobs, dim, metric, minSample, minAge, groupVersions]);
  const rows = [...new Set(combos.map((c) => c.parts[0]))].sort();
  const cols = [...new Set(combos.map((c) => c.parts[1]))].sort();
  const cell = new Map(combos.map((c) => [c.parts.join("\u0000"), c]));
  const max = Math.max(0.01, ...combos.filter((c) => c.tier !== "low").map((c) => (metric === "interview" ? c.interviewRate : c.responseRate) ?? 0)) / 100;

  if (!combos.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c} className="px-2 pb-1 text-left text-xs font-normal text-muted-foreground">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th className="whitespace-nowrap pr-2 text-left font-medium">{r}</th>
              {cols.map((c) => {
                const combo = cell.get(`${r}\u0000${c}`);
                if (!combo) return <td key={c} className="rounded bg-muted/30" />;
                const rate = (metric === "interview" ? combo.interviewRate : combo.responseRate) ?? 0;
                const low = combo.tier === "low";
                return (
                  <td
                    key={c}
                    title={`${r} + ${c}: ${rate}% of ${combo.n}`}
                    className={cn("rounded px-2 py-1.5 text-center tabular-nums", low && "text-muted-foreground opacity-60", combo.tier === "standout" && "ring-1 ring-emerald-400")}
                    style={{ backgroundColor: low ? "var(--muted)" : `rgb(59 130 246 / ${0.12 + 0.55 * (rate / 100 / max)})` }}
                  >
                    {fmtPct(rate)} <span className="text-xs text-muted-foreground">·{combo.n}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
